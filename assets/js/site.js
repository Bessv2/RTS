// Public site bootstrap: loads content/site.json and renders the current page.
import { renderPage, renderPostPage, postTitle, themeCSS, fontsHref, findPageIndex, safeSrc, esc } from './render.js';
import { icon } from './icons.js';
import { kv } from './store.js';

let doc = null;
let currentIndex = -1;
let currentKey = '';

async function loadDoc() {
  if (new URLSearchParams(location.search).has('preview')) {
    try {
      const draft = await kv.get('draft');
      if (draft?.json) return JSON.parse(draft.json);
    } catch { /* fall through to published content */ }
  }
  const res = await fetch(`content/site.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load site content (${res.status})`);
  return res.json();
}

function applyFavicon() {
  const src = safeSrc(doc.site.favicon);
  if (src) document.querySelector('link[rel="icon"]')?.setAttribute('href', src);
}

function applyTheme() {
  document.getElementById('theme-vars').textContent = themeCSS(doc.theme || {});
  const href = fontsHref(doc.theme || {});
  const link = document.getElementById('theme-fonts');
  if (href && link.getAttribute('href') !== href) link.setAttribute('href', href);
}

function setMeta(page) {
  const s = doc.site;
  document.title = page.seoTitle || (currentIndex === 0 ? s.name : `${page.title} | ${s.name}`);
  const desc = page.seoDescription || s.description || '';
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
}

function render(force = false) {
  const hash = location.hash;
  const isRoute = !hash || hash.startsWith('#/');
  if (!isRoute && currentKey && !force) return; // plain #anchor on current page
  const app = document.getElementById('app');
  const postSlug = (hash.match(/^#\/post\/([\w-]+)/) || [])[1];
  const post = postSlug && (doc.posts || []).find((p) => p.slug === postSlug && p.published !== false);
  let key;
  if (post) {
    key = `post:${post.id}`;
    currentIndex = -2;
    app.innerHTML = renderPostPage(doc, post);
    document.title = `${postTitle(post)} | ${doc.site.name}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', post.summary || doc.site.description || '');
  } else {
    let index = isRoute ? findPageIndex(doc, hash) : 0;
    if (index < 0) index = 0;
    key = `page:${index}`;
    currentIndex = index;
    app.innerHTML = renderPage(doc, index);
    setMeta(doc.pages[index]);
  }
  const changed = key !== currentKey;
  currentKey = key;
  bind(app);
  if (!isRoute) document.getElementById(hash.slice(1))?.scrollIntoView();
  else if (changed) window.scrollTo({ top: 0, behavior: 'instant' });
}

function bind(root) {
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

function formEndpoint() {
  const v = String(doc.site.formEndpoint || '').trim();
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
  const endpoint = formEndpoint();
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
      setStatus(status, `Something went wrong. Please email us${doc.site.email ? ` at ${doc.site.email}` : ''}.`, 'err');
    } finally {
      button.disabled = false;
    }
    return;
  }
  const text = `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || '-'}\n\n${data.message}`;
  location.href = `mailto:${doc.site.email || ''}?subject=${encodeURIComponent(`Website inquiry from ${data.name}`)}&body=${encodeURIComponent(text)}`;
  setStatus(status, 'Opening your email app…');
}

try {
  doc = await loadDoc();
  applyTheme();
  applyFavicon();
  render(true);
  addEventListener('hashchange', () => render());
} catch (err) {
  document.getElementById('app').innerHTML = `<p style="padding:40px;font-family:system-ui">${err.message}</p>`;
}
