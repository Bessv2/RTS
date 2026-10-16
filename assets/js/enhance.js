// Interactivity for rendered pages: mobile menu, contact form (with bot
// protection), gallery lightbox, click-to-play video, blog search and tag
// filter, dated announcement bars and reveal-on-scroll. No side effects on import; call enhance(root).
import { esc } from './render.js';
import { icon } from './icons.js';
import { openStatus, localNow, DAYS } from './hours.js';

export function enhance(root = document, { preview = false } = {}) {
  const header = root.querySelector('.site-header');
  const toggle = root.querySelector('.nav-toggle');
  toggle?.addEventListener('click', () => {
    const open = header.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  root.querySelectorAll('.nav a, .brand').forEach((a) => a.addEventListener('click', () => header.classList.remove('is-open')));
  root.querySelectorAll('[data-contact-form]').forEach((form) => {
    form.dataset.startedAt = String(Date.now());
    form.addEventListener('submit', (e) => onSubmit(e, preview));
  });
  root.querySelectorAll('.tag-filter').forEach((bar) => bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tag]');
    if (!b) return;
    bar.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
    filterFeed(bar.parentElement);
  }));
  root.querySelectorAll('[data-blog-search]').forEach((input) => {
    const wrap = input.closest('.wrap');
    input.addEventListener('input', () => filterFeed(wrap));
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { input.value = ''; filterFeed(wrap); } });
  });
  showAnnouncement(root);
  root.querySelectorAll('.video[data-embed]').forEach((v) => v.addEventListener('click', () => playVideo(v), { once: true }));
  root.querySelectorAll('.gallery').forEach((g) => g.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-lightbox]');
    if (!a) return;
    e.preventDefault();
    openLightbox([...g.querySelectorAll('a[data-lightbox]')], Number(a.dataset.lightbox));
  }));
  root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.classList.add('is-done');
      b.title = 'Link copied';
      setTimeout(() => { b.classList.remove('is-done'); b.title = 'Copy link'; }, 2000);
    } catch { prompt('Copy this link:', b.dataset.copy); }
  }));
  showOpenStatus(root);
  reveal(root);
}

// A blog feed shows the posts that match both the chosen tag and every word
// typed in the search box.
export function feedMatch(card, tag, query) {
  if (tag && !(card.tags || '').split('|').includes(tag)) return false;
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => (card.text || '').includes(w));
}

function filterFeed(wrap) {
  if (!wrap) return;
  const tag = wrap.querySelector('.tag-filter .is-on')?.dataset.tag || '';
  const query = wrap.querySelector('[data-blog-search]')?.value.trim() || '';
  let shown = 0;
  wrap.querySelectorAll('.blogfeed [data-tags]').forEach((card) => {
    const ok = feedMatch({ tags: card.dataset.tags, text: card.dataset.text ?? card.textContent.toLowerCase() }, tag, query);
    card.classList.toggle('is-filtered', !ok);
    shown += ok ? 1 : 0;
  });
  const none = wrap.querySelector('.blogfeed__none');
  if (!none) return;
  none.textContent = '';
  if (shown) return;
  none.append(query ? `No posts match “${query}”. ` : 'No posts with that tag yet. ');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Show all posts';
  reset.addEventListener('click', () => {
    const box = wrap.querySelector('[data-blog-search]');
    if (box) box.value = '';
    wrap.querySelector('.tag-filter button[data-tag=""]')?.click();
    filterFeed(wrap);
  });
  none.append(reset);
}

// The visitor's date as YYYY-MM-DD.
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Announcement bars with dates show only from the start day through the end
// day, by the visitor's calendar (pages themselves are rebuilt once a day).
function showAnnouncement(root) {
  const day = localDay();
  root.querySelectorAll('.announce[data-start], .announce[data-end]').forEach((bar) => {
    const { start, end } = bar.dataset;
    bar.hidden = (!!start && day < start) || (!!end && day > end);
  });
}

// “Open now · until 6pm” and today's row in hours lists, worked out in the
// visitor's browser for the business's time zone, refreshed every minute.
function showOpenStatus(root) {
  const badges = [...root.querySelectorAll('[data-open-status]')];
  const tables = [...root.querySelectorAll('.hours')];
  if (!badges.length && !tables.length) return;
  const paint = () => {
    for (const b of badges) {
      let hours;
      try { hours = JSON.parse(b.dataset.hours); } catch { continue; }
      const st = openStatus(hours);
      if (!st) continue;
      b.textContent = st.text;
      b.classList.toggle('is-open', st.open);
      b.classList.toggle('is-closed', !st.open);
    }
    for (const t of tables) {
      const today = DAYS[localNow(t.dataset.tz).day]?.[0];
      t.querySelectorAll('[data-day]').forEach((row) => row.classList.toggle('is-today', row.dataset.day === today));
    }
  };
  paint();
  setInterval(paint, 60_000);
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

async function onSubmit(e, preview) {
  e.preventDefault();
  const form = e.currentTarget;
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  if (!form.reportValidity()) return;
  // “Pick any” questions that must be answered need at least one tick.
  const unanswered = [...form.querySelectorAll('fieldset[data-required]')].find((f) => !f.querySelector('input:checked'));
  if (unanswered) {
    setStatus(status, `Please answer: ${unanswered.querySelector('legend')?.textContent.replace(/\s*\(optional\)$/, '') || 'all required questions'}`, 'err');
    unanswered.querySelector('input')?.focus();
    return;
  }
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
  if (preview) { setStatus(status, 'The form is turned off in preview. It works on the published site.', 'err'); return; }
  const endpoint = formEndpoint(form);
  if (endpoint) {
    button.disabled = true;
    setStatus(status, 'Sending…');
    const body = new FormData(form);
    body.set('_subject', `${form.dataset.subject || 'Website inquiry'} from ${String(data.name).slice(0, 100)}`);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body });
      if (!res.ok) throw new Error();
      try { localStorage.setItem(LAST_SENT_KEY, String(Date.now())); } catch { /* ignore */ }
      form.reset();
      form.dataset.startedAt = String(Date.now());
      setStatus(status, form.dataset.sent || 'Thanks! Your message has been sent. We’ll be in touch soon.', 'ok');
    } catch {
      setStatus(status, `Something went wrong. Please email us${email ? ` at ${email}` : ''}.`, 'err');
    } finally {
      button.disabled = false;
    }
    return;
  }
  const text = form.dataset.subject ? answersText(form) : `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || '-'}\n\n${data.message}`;
  location.href = `mailto:${email}?subject=${encodeURIComponent(`${form.dataset.subject || 'Website inquiry'} from ${data.name}`)}&body=${encodeURIComponent(text)}`;
  setStatus(status, 'Opening your email app…');
}

// Every answer as “Question: answer” lines; ticked boxes are joined.
function answersText(form) {
  const answers = new Map();
  for (const [k, v] of new FormData(form)) {
    if (k.startsWith('_') || !String(v).trim()) continue;
    answers.set(k, answers.has(k) ? `${answers.get(k)}, ${v}` : String(v));
  }
  const label = { name: 'Name', email: 'Email', phone: 'Phone', message: 'Anything else' };
  return [...answers].map(([k, v]) => `${label[k] || k}: ${v}`).join('\n');
}
