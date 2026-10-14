// The built-in editor was retired in favor of editor.roetechnologyservices.com.
// This page rescues anything the old editor left in this browser (its draft and
// saved versions, as downloadable site.json files) and removes a saved token.
const OLD_DB = 'rts-editor';

// Opens the old editor's database without creating it when it doesn't exist.
function openOldDb() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(OLD_DB, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => req.transaction.abort();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function readAll(db, store, method, key) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store).objectStore(store)[method](key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

const isSite = (json) => { try { const d = JSON.parse(json); return Array.isArray(d.pages) && !!d.site; } catch { return false; } };
const when = (t) => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

function download(json, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function rescue() {
  const items = [];
  try {
    const legacy = localStorage.getItem('rts-editor-draft');
    if (legacy) { const d = JSON.parse(legacy); if (d?.doc) items.push({ label: 'Unpublished draft (older copy)', json: JSON.stringify(d.doc, null, 2), file: 'site-draft-old.json' }); }
  } catch { /* ignore */ }
  const db = await openOldDb();
  if (db) {
    const draft = await readAll(db, 'kv', 'get', 'draft');
    if (draft?.json) items.unshift({ label: 'Unpublished draft', time: draft.savedAt, json: draft.json, file: 'site-draft.json' });
    const versions = (await readAll(db, 'versions', 'getAll')) || [];
    versions.sort((a, b) => b.savedAt - a.savedAt).forEach((v, i) => items.push({ label: v.name || 'Saved version', time: v.savedAt, json: v.json, file: `site-version-${i + 1}.json` }));
    db.close();
  }
  const usable = items.filter((it) => isSite(it.json));
  if (!usable.length) return;
  const list = document.getElementById('rescue-list');
  for (const it of usable) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.append(it.label);
    if (it.time) { const s = document.createElement('small'); s.textContent = ` · ${when(it.time)}`; text.append(s); }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = 'Download';
    btn.addEventListener('click', () => download(it.json, it.file));
    li.append(text, btn);
    list.append(li);
  }
  document.getElementById('rescue').hidden = false;
}

// The old editor could remember a GitHub token on this address; it is no longer needed here.
try {
  const saved = JSON.parse(localStorage.getItem('rts-editor-github') || 'null');
  if (saved) {
    localStorage.removeItem('rts-editor-github');
    if (saved.token) document.getElementById('token-note').hidden = false;
  }
  localStorage.removeItem('rts-editor-clipboard');
} catch { /* storage unavailable */ }

rescue();
