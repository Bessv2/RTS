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
  headerScroll(header);
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
  zoomPostImages(root);
  root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.classList.add('is-done');
      b.title = 'Link copied';
      setTimeout(() => { b.classList.remove('is-done'); b.title = 'Copy link'; }, 2000);
    } catch { prompt('Copy this link:', b.dataset.copy); }
  }));
  root.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));
  if (!preview) rememberTicks(root);
  showOpenStatus(root);
  reveal(root);
  motion(root);
}

// A header that hides while scrolling down, or is see-through until the page scrolls.
function headerScroll(header) {
  if (!header) return;
  const away = header.classList.contains('site-header--scroll');
  const overlay = header.classList.contains('site-header--overlay');
  if (!away && !overlay) return;
  const root = document.documentElement;
  // The page starts below a see-through header of any height.
  const measure = () => root.style.setProperty('--hdr-h', `${header.offsetHeight}px`);
  if (overlay) { measure(); addEventListener('resize', measure, { passive: true }); }
  let last = scrollY;
  const onScroll = () => {
    const y = scrollY;
    header.classList.toggle('is-scrolled', y > 8);
    if (away && Math.abs(y - last) > 4) {
      header.classList.toggle('is-away', y > last && y > header.offsetHeight + 40 && !header.classList.contains('is-open'));
      last = y;
    }
  };
  // Keyboard users moving into the header always see it.
  header.addEventListener('focusin', () => header.classList.remove('is-away'));
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Images in a post open full size when clicked (or with Enter on the keyboard).
function zoomPostImages(root) {
  const figures = [...root.querySelectorAll('.post__body figure')].filter((f) => f.querySelector(':scope > img'));
  if (!figures.length) return;
  const buttons = figures.map((f) => {
    const img = f.querySelector(':scope > img');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'zoom';
    b.dataset.src = img.getAttribute('src');
    b.dataset.alt = img.alt;
    b.setAttribute('aria-label', img.alt ? `Enlarge image: ${img.alt}` : 'Enlarge image');
    img.replaceWith(b);
    b.append(img);
    return b;
  });
  buttons.forEach((b, i) => b.addEventListener('click', () => openLightbox(buttons, i)));
}

// Tick boxes in checklists remember what was ticked, in this browser only.
function rememberTicks(root) {
  const boxes = [...root.querySelectorAll('input[data-task]')];
  if (!boxes.length) return;
  const key = `ticks:${location.pathname}`;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(saved) && saved.length === boxes.length) boxes.forEach((b, i) => { b.checked = !!saved[i]; });
  } catch { /* storage blocked: the boxes still work, they just aren't remembered */ }
  boxes.forEach((b) => b.addEventListener('change', () => {
    try { localStorage.setItem(key, JSON.stringify(boxes.map((x) => x.checked))); } catch { /* storage blocked */ }
  }));
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
    box.innerHTML = `<img src="${esc(a.getAttribute('href') || a.dataset.src)}" alt="${esc(caption || a.dataset.alt || '')}">${caption ? `<p>${esc(caption)}</p>` : ''}
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
  // Entrance animations chosen in the editor play once each piece is in view.
  const pieces = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); pieces.unobserve(e.target); }
  }), { rootMargin: '0px 0px -6% 0px' });
  root.querySelectorAll('.anim').forEach((el) => pieces.observe(el));
}

// Moving pieces: numbers that count up, rotating words, ticker pause buttons and
// the back-to-top button. Everything is readable before (and without) this runs.
function motion(root) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('.lx-ticker__pause').forEach((b) => b.addEventListener('click', () => {
    const t = b.closest('.lx-ticker');
    const paused = t.classList.toggle('is-paused');
    b.setAttribute('aria-pressed', String(paused));
    b.setAttribute('aria-label', paused ? 'Play the moving text' : 'Pause the moving text');
    b.innerHTML = icon(paused ? 'play' : 'pause');
  }));
  const top = root.querySelector('.to-top');
  if (top) {
    const show = () => top.classList.toggle('is-shown', scrollY > innerHeight * 0.8);
    addEventListener('scroll', show, { passive: true });
    show();
  }
  if (still || !('IntersectionObserver' in window)) return;
  const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    seen.unobserve(e.target);
    if (e.target.matches('[data-count]')) countUp(e.target);
    else rotate(e.target);
  }), { rootMargin: '0px 0px -10% 0px' });
  root.querySelectorAll('.lx-counter__value[data-count]').forEach((n) => seen.observe(n));
  root.querySelectorAll('.lx-rot__words').forEach((n) => { if (n.children.length > 1) seen.observe(n); });
}

export function formatCount(value, decimals = 0, commas = false) {
  const fixed = Number(value).toFixed(decimals);
  if (!commas) return fixed;
  const [whole, part] = fixed.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (part ? `.${part}` : '');
}

function countUp(n) {
  const target = Number(n.dataset.count);
  const decimals = Number(n.dataset.decimals) || 0;
  const commas = n.hasAttribute('data-commas');
  const start = performance.now();
  const ms = 1600;
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3;
    n.textContent = formatCount(target * eased, decimals, commas);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Rotating words take turns for a few rounds, then stop on the first word.
function rotate(box) {
  const words = [...box.children];
  let i = 0;
  let turns = 0;
  const max = words.length * 3;
  const timer = setInterval(() => {
    const out = words[i];
    i = (i + 1) % words.length;
    turns += 1;
    out.classList.remove('is-on');
    out.classList.add('is-out');
    words[i].classList.remove('is-out');
    words[i].classList.add('is-on');
    setTimeout(() => out.classList.remove('is-out'), 500);
    if (turns >= max && i === 0) clearInterval(timer);
  }, 2200);
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
