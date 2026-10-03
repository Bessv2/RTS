// Public site bootstrap: loads content/site.json and renders the current page.
import { renderPage, themeCSS, fontsHref, findPageIndex } from './render.js';

const DRAFT_KEY = 'rts-editor-draft';
let doc = null;
let currentIndex = -1;

async function loadDoc() {
  if (new URLSearchParams(location.search).has('preview')) {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (draft?.doc) return draft.doc;
    } catch { /* fall through to published content */ }
  }
  const res = await fetch(`content/site.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load site content (${res.status})`);
  return res.json();
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
  if (!isRoute && currentIndex !== -1 && !force) return; // plain #anchor on current page
  let index = isRoute ? findPageIndex(doc, hash) : 0;
  if (index < 0) index = 0;
  const changed = index !== currentIndex;
  currentIndex = index;
  const app = document.getElementById('app');
  app.innerHTML = renderPage(doc, index);
  setMeta(doc.pages[index]);
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
  reveal(root);
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
  render(true);
  addEventListener('hashchange', () => render());
} catch (err) {
  document.getElementById('app').innerHTML = `<p style="padding:40px;font-family:system-ui">${err.message}</p>`;
}
