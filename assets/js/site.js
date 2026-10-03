// Public site behavior. Pages arrive fully rendered as static HTML (see build.js);
// this script only adds interactivity: menu, contact form, gallery, video, tag filter.
// On preview.html it also renders the editor's unpublished draft.
import { renderPage, renderPostPage, renderNotFound, findRoute, postTitle, themeCSS, fontsHref, esc } from './render.js';
import { migrate, hashToPath } from './schema.js';
import { icon } from './icons.js';
import { kv } from './store.js';

const PREVIEW = document.documentElement.hasAttribute('data-preview');

// Links from the old site version (#/services, #/post/x) still work.
if (!PREVIEW && /^#\/[\w/-]*$/.test(location.hash)) location.replace(hashToPath(location.hash));

function enhance(root) {
  const header = root.querySelector('.site-header');
  const toggle = root.querySelector('.nav-toggle');
  toggle?.addEventListener('click', () => {
    const open = header.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  root.querySelectorAll('.nav a, .brand').forEach((a) => a.addEventListener('click', () => header.classList.remove('is-open')));
  root.querySelectorAll('[data-contact-form]').forEach((form) => {
    form.dataset.startedAt = String(Date.now());
    form.addEventListener('submit', onSubmit);
  });
  root.querySelectorAll('.tag-filter').forEach((bar) => bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tag]');
    if (!b) return;
    bar.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
    const tag = b.dataset.tag;
    bar.parentElement.querySelectorAll('.blogfeed [data-tags]').forEach((card) => {
      card.classList.toggle('is-filtered', !!tag && !card.dataset.tags.split('|').includes(tag));
    });
  }));
  root.querySelectorAll('.video[data-embed]').forEach((v) => v.addEventListener('click', () => playVideo(v), { once: true }));
  root.querySelectorAll('.gallery').forEach((g) => g.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-lightbox]');
    if (!a) return;
    e.preventDefault();
    openLightbox([...g.querySelectorAll('a[data-lightbox]')], Number(a.dataset.lightbox));
  }));
  reveal(root);
}

function playVideo(v) {
  const src = v.dataset.embed;
  if (!/^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com)\//.test(src)) return;
  v.innerHTML = `<iframe src="${esc(src)}" title="Video" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe>`;
}

function openLightbox(links, start) {
  let i = start;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const show = () => {
    const a = links[i];
    const caption = a.closest('figure')?.querySelector('figcaption')?.textContent || '';
    box.innerHTML = `<img src="${esc(a.getAttribute('href'))}" alt="${esc(caption)}">${caption ? `<p>${esc(caption)}</p>` : ''}
      <button class="lightbox__close" type="button" aria-label="Close">${icon('x')}</button>
      ${links.length > 1 ? `<button class="lightbox__prev" type="button" aria-label="Previous">${icon('chevron-right')}</button><button class="lightbox__next" type="button" aria-label="Next">${icon('chevron-right')}</button>` : ''}`;
  };
  const go = (d) => { i = (i + d + links.length) % links.length; show(); };
  const close = () => { box.remove(); removeEventListener('keydown', onKey); links[i]?.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.lightbox__next')) go(1);
    else if (e.target.closest('.lightbox__prev')) go(-1);
    else if (e.target.closest('.lightbox__close') || e.target === box) close();
  });
  addEventListener('keydown', onKey);
  show();
  document.body.append(box);
  box.querySelector('.lightbox__close').focus();
}

function reveal(root) {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.body.classList.add('reveal-ready');
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  root.querySelectorAll('.sec').forEach((s) => io.observe(s));
}

// --- Contact form with lightweight bot protection -----------------------
// Formspree (or similar) does the heavy spam filtering server-side; these
// checks stop the bulk of automated junk before it is ever sent.
const MIN_FILL_MS = 3000; // humans take longer than this to fill the form
const COOLDOWN_MS = 60_000; // one message per minute per browser
const MAX_LINKS = 2; // link-stuffed messages are almost always spam
const LAST_SENT_KEY = 'rts-form-last-sent';

function formEndpoint(form) {
  const v = String(form.dataset.endpoint || '').trim();
  return /^https:\/\/[^\s/]+\/\S*$/i.test(v) ? v : '';
}

function lastSent() {
  try { return Number(localStorage.getItem(LAST_SENT_KEY)) || 0; } catch { return 0; }
}

function setStatus(status, text, cls = '') {
  status.className = `form-status${cls ? ` ${cls}` : ''}`;
  status.textContent = text;
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const looksLikeBot = String(data._gotcha || '').trim() !== ''
    || Date.now() - Number(form.dataset.startedAt || 0) < MIN_FILL_MS;
  if (looksLikeBot) {
    // Pretend it worked so bots get no signal to adapt to.
    form.reset();
    setStatus(status, 'Thanks! Your message has been sent.', 'ok');
    return;
  }
  if (Date.now() - lastSent() < COOLDOWN_MS) {
    setStatus(status, 'Thanks — we just got your message. Please wait a minute before sending another.', 'err');
    return;
  }
  if ((String(data.message).match(/https?:\/\/|www\./gi) || []).length > MAX_LINKS) {
    setStatus(status, 'Please remove some of the links from your message and try again.', 'err');
    return;
  }
  const email = form.dataset.email || '';
  if (PREVIEW) { setStatus(status, 'The form is turned off in preview. It works on the published site.', 'err'); return; }
  const endpoint = formEndpoint(form);
  if (endpoint) {
    button.disabled = true;
    setStatus(status, 'Sending…');
    const body = new FormData(form);
    body.set('_subject', `Website inquiry from ${String(data.name).slice(0, 100)}`);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body });
      if (!res.ok) throw new Error();
      try { localStorage.setItem(LAST_SENT_KEY, String(Date.now())); } catch { /* ignore */ }
      form.reset();
      form.dataset.startedAt = String(Date.now());
      setStatus(status, 'Thanks! Your message has been sent. We’ll be in touch soon.', 'ok');
    } catch {
      setStatus(status, `Something went wrong. Please email us${email ? ` at ${email}` : ''}.`, 'err');
    } finally {
      button.disabled = false;
    }
    return;
  }
  const text = `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || '-'}\n\n${data.message}`;
  location.href = `mailto:${email}?subject=${encodeURIComponent(`Website inquiry from ${data.name}`)}&body=${encodeURIComponent(text)}`;
  setStatus(status, 'Opening your email app…');
}

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
    enhance(app);
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
