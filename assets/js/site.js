// Public site behavior. Pages arrive fully rendered as static HTML (see build.js);
// this script only adds interactivity: menu, contact form, gallery, video, tag filter.
// On preview.html it also renders the editor's unpublished draft.
import { renderPage, renderPostPage, renderNotFound, findRoute, postTitle, themeCSS, fontsHref } from './render.js';
import { enhance } from './enhance.js';
import { migrate, hashToPath } from './schema.js';
import { kv } from './store.js';

const PREVIEW = document.documentElement.hasAttribute('data-preview');

// Links from the old site version (#/services, #/post/x) still work.
if (!PREVIEW && /^#\/[\w/-]*$/.test(location.hash)) location.replace(hashToPath(location.hash));

// --- Preview of the editor's unpublished draft (preview.html?path=/services/) ---
async function loadDraft() {
  try {
    const draft = await kv.get('draft');
    if (draft?.json) return migrate(JSON.parse(draft.json));
  } catch { /* fall back to the published content */ }
  const res = await fetch(`/content/site.json?v=${Date.now()}`, { cache: 'no-store' });
  return migrate(await res.json());
}

async function bootPreview() {
  const app = document.getElementById('app');
  let doc;
  try { doc = await loadDraft(); } catch (err) { app.textContent = `Could not load the preview: ${err.message}`; return; }
  document.getElementById('theme-vars').textContent = themeCSS(doc.theme);
  const fonts = fontsHref(doc.theme);
  if (fonts) document.getElementById('theme-fonts').setAttribute('href', fonts);
  const show = (path, push = false) => {
    const route = findRoute(doc, path);
    if (route?.type === 'post') {
      app.innerHTML = renderPostPage(doc, route.post);
      document.title = `Preview: ${postTitle(route.post)}`;
    } else if (route?.type === 'page') {
      app.innerHTML = renderPage(doc, route.index);
      document.title = `Preview: ${doc.pages[route.index].title}`;
    } else {
      app.innerHTML = renderNotFound(doc);
      document.title = 'Preview: page not found';
    }
    if (push) history.pushState({ path }, '', `?path=${encodeURIComponent(path)}`);
    enhance(app, { preview: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  // Keep site links inside the preview.
  app.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || a.target === '_blank' || /\.(xml|json|txt)$/.test(a.getAttribute('href'))) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    const [path, hash] = href.split('#');
    show(path || '/', true);
    if (hash) document.getElementById(hash)?.scrollIntoView();
  });
  addEventListener('popstate', () => show(new URLSearchParams(location.search).get('path') || '/'));
  const badge = document.createElement('div');
  badge.className = 'preview-badge';
  badge.textContent = 'Preview — not published yet';
  document.body.append(badge);
  show(new URLSearchParams(location.search).get('path') || '/');
}

if (PREVIEW) bootPreview();
else enhance(document);
