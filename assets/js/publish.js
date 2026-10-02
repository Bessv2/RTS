// Publishes the site content to GitHub in a single commit using the Git Data API.
// Uploaded images (data: URLs) are saved as files under assets/uploads/.

const enc = new TextEncoder();

function utf8ToBase64(str) {
  const bytes = enc.encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function hashOf(str) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

// Replace every data:image URL in the document with a repo path; collect the files.
async function extractImages(doc) {
  const files = new Map();
  async function walk(node) {
    if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) node[i] = await walk(node[i]); return node; }
    if (node && typeof node === 'object') { for (const k of Object.keys(node)) node[k] = await walk(node[k]); return node; }
    if (typeof node === 'string' && node.startsWith('data:image/')) {
      const m = node.match(/^data:(image\/[\w+.-]+)(;base64)?,(.*)$/s);
      if (!m || !EXT[m[1]]) return node;
      const path = `assets/uploads/${await hashOf(node)}.${EXT[m[1]]}`;
      if (!files.has(path)) files.set(path, m[2] ? m[3] : utf8ToBase64(decodeURIComponent(m[3])));
      return path;
    }
    return node;
  }
  const out = await walk(structuredClone(doc));
  return { out, files };
}

export async function publishToGitHub({ owner, repo, branch, token, message, doc, log = () => {} }) {
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  async function api(path, method = 'GET', body) {
    const res = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const hint = res.status === 401 ? ' (check your token)' : res.status === 404 ? ' (check repository, branch and token permissions)' : res.status === 409 ? ' (branch changed, try again)' : '';
      throw new Error(`${json.message || res.statusText}${hint}`);
    }
    return json;
  }

  log('Preparing content…');
  const { out, files } = await extractImages(doc);
  log(`Connecting to ${owner}/${repo} (${branch})…`);
  const ref = await api(`/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`);
  const parent = await api(`/git/commits/${ref.object.sha}`);

  const tree = [];
  for (const [path, b64] of files) {
    log(`Uploading ${path}…`);
    const blob = await api('/git/blobs', 'POST', { content: b64, encoding: 'base64' });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  log('Uploading content/site.json…');
  const json = await api('/git/blobs', 'POST', { content: utf8ToBase64(`${JSON.stringify(out, null, 2)}\n`), encoding: 'base64' });
  tree.push({ path: 'content/site.json', mode: '100644', type: 'blob', sha: json.sha });

  const newTree = await api('/git/trees', 'POST', { base_tree: parent.tree.sha, tree });
  if (newTree.sha === parent.tree.sha) { log('No changes since the last publish.', 'ok'); return { unchanged: true, published: out }; }
  const commit = await api('/git/commits', 'POST', { message, tree: newTree.sha, parents: [ref.object.sha] });
  await api(`/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, 'PATCH', { sha: commit.sha });
  log(`Committed ${commit.sha.slice(0, 7)}.`, 'ok');
  return { commitUrl: commit.html_url, published: out };
}
