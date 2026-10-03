// GitHub integration for the editor: publishing, version history and cloud drafts.
// Everything goes through the REST API with the user's fine-grained token.

const enc = new TextEncoder();
const DRAFT_BRANCH = 'editor-drafts';
const DRAFT_PATH = 'draft.json';

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
const encPath = (p) => String(p).split('/').map(encodeURIComponent).join('/');

export function createApi({ owner, repo, token }) {
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return async function api(path, { method = 'GET', body, raw = false, allow404 = false } = {}) {
    const res = await fetch(base + path, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (allow404 && res.status === 404) return null;
    if (raw && res.ok) return res.text();
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const hint = res.status === 401 ? ' (check your token)'
        : res.status === 403 ? ' (the token needs Contents: Read and write on this repository)'
        : res.status === 404 ? ' (check repository, branch and token permissions)'
        : res.status === 409 || res.status === 422 ? ' (the branch changed, try again)' : '';
      throw new Error(`${json.message || res.statusText}${hint}`);
    }
    return json;
  };
}

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

const DEFAULT_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232563eb'/%3E%3Cpath d='M10 9h7a5 5 0 0 1 0 10h-1l5 5M10 9v15' stroke='white' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const escAttr = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Static <head> tags so search engines and link previews see real metadata.
function seoBlock(doc, origin) {
  const s = doc.site || {};
  const home = doc.pages?.[0] || {};
  const title = home.seoTitle || s.name || '';
  const desc = home.seoDescription || s.description || '';
  const abs = (p) => (!p ? '' : /^https?:\/\//i.test(p) ? p : `${origin.replace(/\/$/, '')}/${String(p).replace(/^\.?\//, '')}`);
  const img = abs(s.shareImage);
  const favicon = s.favicon && !String(s.favicon).startsWith('data:') ? s.favicon : DEFAULT_FAVICON;
  return [
    '<!-- seo:start (written by the editor on publish) -->',
    `  <title>${escAttr(title)}</title>`,
    `  <meta name="description" content="${escAttr(desc)}">`,
    `  <meta property="og:type" content="website">`,
    `  <meta property="og:title" content="${escAttr(title)}">`,
    `  <meta property="og:description" content="${escAttr(desc)}">`,
    `  <meta property="og:url" content="${escAttr(abs('/'))}">`,
    img ? `  <meta property="og:image" content="${escAttr(img)}">` : '',
    `  <meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    `  <link rel="icon" href="${escAttr(favicon)}">`,
    '  <!-- seo:end -->',
  ].filter(Boolean).join('\n');
}

export async function publishToGitHub({ owner, repo, branch, token, message, doc, origin = location.origin, log = () => {} }) {
  const api = createApi({ owner, repo, token });
  const ref = `/git/ref/heads/${encPath(branch)}`;
  log('Preparing content…');
  const { out, files } = await extractImages(doc);
  log(`Connecting to ${owner}/${repo} (${branch})…`);
  const head = await api(ref);
  const parent = await api(`/git/commits/${head.object.sha}`);

  const tree = [];
  for (const [path, b64] of files) {
    log(`Uploading ${path}…`);
    const blob = await api('/git/blobs', { method: 'POST', body: { content: b64, encoding: 'base64' } });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  log('Uploading content/site.json…');
  const json = await api('/git/blobs', { method: 'POST', body: { content: utf8ToBase64(`${JSON.stringify(out, null, 2)}\n`), encoding: 'base64' } });
  tree.push({ path: 'content/site.json', mode: '100644', type: 'blob', sha: json.sha });

  const html = await api(`/contents/index.html?ref=${encodeURIComponent(branch)}`, { raw: true, allow404: true });
  if (html && html.includes('<!-- seo:start') && html.includes('<!-- seo:end -->')) {
    log('Updating search & social preview tags…');
    const next = html.replace(/<!-- seo:start[\s\S]*?<!-- seo:end -->/, seoBlock(out, origin));
    if (next !== html) {
      const blob = await api('/git/blobs', { method: 'POST', body: { content: utf8ToBase64(next), encoding: 'base64' } });
      tree.push({ path: 'index.html', mode: '100644', type: 'blob', sha: blob.sha });
    }
  }

  const newTree = await api('/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree } });
  if (newTree.sha === parent.tree.sha) { log('No changes since the last publish.', 'ok'); return { unchanged: true, published: out }; }
  const commit = await api('/git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [head.object.sha] } });
  await api(ref, { method: 'PATCH', body: { sha: commit.sha } });
  log(`Committed ${commit.sha.slice(0, 7)}.`, 'ok');
  return { commitUrl: commit.html_url, published: out };
}

// Past published versions of the site content.
export async function listPublishedVersions(cfg, limit = 25) {
  const api = createApi(cfg);
  const list = await api(`/commits?path=content/site.json&sha=${encodeURIComponent(cfg.branch)}&per_page=${limit}`);
  return list.map((c) => ({ sha: c.sha, message: c.commit.message.split('\n')[0], date: c.commit.author?.date || c.commit.committer?.date, url: c.html_url }));
}

export async function readPublishedVersion(cfg, sha) {
  const api = createApi(cfg);
  return JSON.parse(await api(`/contents/content/site.json?ref=${encodeURIComponent(sha)}`, { raw: true }));
}

// Cloud drafts live on their own branch so they never affect the live site.
export async function saveCloudDraft(cfg, doc) {
  const api = createApi(cfg);
  const exists = await api(`/git/ref/heads/${DRAFT_BRANCH}`, { allow404: true });
  if (!exists) {
    const head = await api(`/git/ref/heads/${encPath(cfg.branch)}`);
    await api('/git/refs', { method: 'POST', body: { ref: `refs/heads/${DRAFT_BRANCH}`, sha: head.object.sha } });
  }
  const current = await api(`/contents/${DRAFT_PATH}?ref=${DRAFT_BRANCH}`, { allow404: true });
  const payload = JSON.stringify({ savedAt: new Date().toISOString(), doc });
  await api(`/contents/${DRAFT_PATH}`, { method: 'PUT', body: {
    message: 'Save editor draft', branch: DRAFT_BRANCH, content: utf8ToBase64(payload), ...(current?.sha ? { sha: current.sha } : {}),
  } });
}

export async function loadCloudDraft(cfg) {
  const api = createApi(cfg);
  const text = await api(`/contents/${DRAFT_PATH}?ref=${DRAFT_BRANCH}`, { raw: true, allow404: true });
  return text ? JSON.parse(text) : null;
}
