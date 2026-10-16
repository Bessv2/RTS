// Shared renderer used by the static build, the preview page and the editor canvas.
// Pure functions only (no DOM access), so it runs the same in browsers and Node.
import { BLOCKS, renderElements } from './blocks.js';
import { POSTS_BASE, redirectFrom, redirectTo } from './schema.js';
import { icon, SOCIAL } from './icons.js';
import { hasHours, hoursSummary, openBadge } from './hours.js';

export const FONTS = {
  'Inter': 'Inter:wght@400;500;600;700;800',
  'Manrope': 'Manrope:wght@400;500;600;700;800',
  'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700;800',
  'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
  'IBM Plex Sans': 'IBM+Plex+Sans:wght@400;500;600;700',
  'DM Sans': 'DM+Sans:wght@400;500;600;700',
  'Sora': 'Sora:wght@400;500;600;700;800',
  'Merriweather': 'Merriweather:wght@400;700;900',
};

export const THEME_PRESETS = {
  midnight: { name: 'Midnight', primary: '#2563eb', accent: '#22d3ee', dark: '#0b1220', bg: '#ffffff', surface: '#f4f7fb', text: '#0f172a' },
  emerald: { name: 'Emerald', primary: '#059669', accent: '#a3e635', dark: '#06201a', bg: '#ffffff', surface: '#f1f8f5', text: '#0b1f19' },
  violet: { name: 'Violet', primary: '#7c3aed', accent: '#f472b6', dark: '#140f26', bg: '#ffffff', surface: '#f6f4fd', text: '#1a1530' },
  slate: { name: 'Slate & Amber', primary: '#d97706', accent: '#fbbf24', dark: '#16181d', bg: '#ffffff', surface: '#f6f5f2', text: '#18181b' },
  crimson: { name: 'Crimson', primary: '#dc2626', accent: '#fb923c', dark: '#1a0f12', bg: '#ffffff', surface: '#faf5f5', text: '#1c1416' },
  ocean: { name: 'Ocean', primary: '#0891b2', accent: '#2dd4bf', dark: '#071a24', bg: '#ffffff', surface: '#f0f8fa', text: '#0c1d24' },
};

const RADII = { sharp: '4px', soft: '12px', round: '20px' };

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Lightweight formatting for paragraphs: **bold**, *italic*, `code`, [link](url).
// Text is escaped first, so only these patterns ever become HTML.
export function rich(v) {
  const code = [];
  return esc(String(v ?? '').replace(/\0/g, ''))
    .replace(/`([^`\n]+)`/g, (m, c) => `\0${code.push(c) - 1}\0`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?![\s*])([^*\n]+?)\*(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
      const url = safeHref(href.replace(/&amp;/g, '&'));
      const ext = /^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${esc(url)}"${ext}>${text}</a>`;
    })
    .replace(/\0(\d+)\0/g, (m, i) => `<code>${code[i]}</code>`);
}

export function cssUrl(src) {
  const v = safeSrc(src);
  return v ? `url("${v.replace(/["\\\s()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}")` : '';
}

export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

// Only allow safe link schemes in rendered hrefs.
export function safeHref(href) {
  const v = String(href || '').trim();
  if (!v) return '#';
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|[\w-]+\.html)/i.test(v)) return v;
  if (/^[a-z][\w+.-]*:/i.test(v)) return '#';
  return v;
}

// Image sources: data images, https URLs, or site files. Site-relative paths are
// made root-relative so they work from nested pages like /blog/my-post/.
export function safeSrc(src) {
  const v = String(src || '').trim();
  if (!v) return '';
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(v)) return v;
  if (/^https?:\/\//i.test(v) || v.startsWith('/')) return v;
  if (/^[a-z][\w+.-]*:/i.test(v)) return '';
  return `/${v.replace(/^\.\//, '')}`;
}

export function fontsHref(theme) {
  const fams = [...new Set([theme.headingFont, theme.bodyFont])].filter((f) => FONTS[f]).map((f) => `family=${FONTS[f]}`);
  return fams.length ? `https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap` : '';
}

// Theme values end up inside a <style> tag, so only plain colors and font names get through.
const COLOR = /^#[0-9a-f]{3,8}$/i;
const fontName = (f) => String(f || '').replace(/[^\w\s-]/g, '').trim() || 'Inter';

export function themeCSS(theme) {
  const t = { ...THEME_PRESETS.midnight, ...theme };
  const c = (k) => (COLOR.test(String(t[k] || '').trim()) ? String(t[k]).trim() : THEME_PRESETS.midnight[k]);
  return `:root{--c-primary:${c('primary')};--c-accent:${c('accent')};--c-dark:${c('dark')};--c-bg:${c('bg')};--c-surface:${c('surface')};--c-text:${c('text')};`
    + `--font-head:'${fontName(t.headingFont)}',system-ui,sans-serif;--font-body:'${fontName(t.bodyFont)}',system-ui,sans-serif;`
    + `--radius:${RADII[t.radius] || RADII.soft};--btn-radius:${t.buttons === 'pill' ? '999px' : `var(--radius)`};}`
    + (t.customCSS ? `\n/* custom */\n${String(t.customCSS).replace(/<\/?(style|script)/gi, '')}` : '');
}

export function pageHref(page, index) {
  return index === 0 || !page.slug ? '/' : `/${encodeURIComponent(page.slug)}/`;
}

// Unpublished (draft) pages are kept in the content but never built or linked.
// The home page is always live.
export const isLivePage = (page, index) => index === 0 || !page.draft;
const inNav = (page, index) => page.showInNav !== false && isLivePage(page, index);

// Section anchors can only contain letters, numbers, dashes and underscores.
export const anchorId = (v) => String(v || '').replace(/^#/, '').replace(/[^\w-]/g, '');

function helpers(data, ctx, sectionPath = '') {
  const edit = !!ctx.edit;
  // The first section on a page carries its main headline (h1) and loads its images first.
  let h1 = !!ctx.first;
  const attr = (path, opts = {}) => edit
    ? ` data-edit="${esc(sectionPath + path)}" data-ph="${esc(opts.ph || 'Type here…')}"${opts.ml ? ' data-ml' : ''}`
    : '';
  const h = {
    edit, esc, icon, site: ctx.site.site, doc: ctx.site,
    blog: { publishedPosts, renderPostCard, postTags },
    src: (v) => safeSrc(v),
    safeHref: (v) => safeHref(v),
    list: (path) => (Array.isArray(getPath(data, path)) ? getPath(data, path) : []),
    t(tag, path, cls = '', opts = {}) {
      const v = getPath(data, path) ?? '';
      if (!edit && !String(v).trim()) return '';
      if (h1 && /^h[12]$/.test(tag)) { tag = 'h1'; h1 = false; }
      // md: paragraphs, lists and subheadings (markdown); ml: one formatted paragraph.
      const body = opts.md ? markdown(v, safeSrc) : opts.ml ? rich(v) : esc(v);
      return `<${tag}${cls ? ` class="${cls}"` : ''}${attr(path, opts)}${edit && (opts.ml || opts.md) ? ' data-rich' : ''}${edit && opts.md ? ' data-md' : ''}>${body}</${tag}>`;
    },
    img(path, cls, alt = '') {
      const src = safeSrc(getPath(data, path));
      const load = ctx.first ? 'fetchpriority="high"' : 'loading="lazy"';
      return src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" ${load} decoding="async">` : '';
    },
    btns(...specs) {
      const out = specs.map(([path, cls]) => {
        const b = getPath(data, path) || {};
        if (!edit && !String(b.label || '').trim()) return '';
        if (edit && !String(b.label || '').trim()) return '';
        return `<a class="btn ${cls}" href="${esc(safeHref(b.href))}"><span${attr(`${path}.label`, { ph: 'Button' })}>${esc(b.label)}</span></a>`;
      }).join('');
      return out ? `<div class="btns">${out}</div>` : '';
    },
  };
  return h;
}

// Section settings that end up in class names may only be simple words.
const MODIFIERS = ['bg', 'pad', 'overlay', 'layout', 'columns', 'style', 'ratio', 'width', 'height', 'align', 'side', 'show', 'limit', 'showOn'];

export function renderSection(section, ctx) {
  const block = BLOCKS[section.type];
  if (!block) return '';
  if (section.hidden && !ctx.edit) return '';
  const d = { ...(section.data || {}) };
  for (const k of MODIFIERS) if (d[k] != null && typeof d[k] !== 'object') d[k] = String(d[k]).replace(/[^\w-]/g, '');
  const anchor = anchorId(d.anchor);
  const bgImg = cssUrl(d.bgImage);
  const device = d.showOn === 'desktop' || d.showOn === 'mobile' ? ` show-on--${d.showOn}` : '';
  const cls = `sec sec--${d.bg || 'light'} pad--${d.pad || 'normal'} blk-${section.type}${bgImg ? ` has-bgimg ov--${d.overlay || 'medium'}` : ''}${device}${section.hidden ? ' is-hidden' : ''}`;
  const attrs = (ctx.edit ? ` data-section-id="${esc(section.id)}" data-label="${esc(block.label)}"` : '')
    + (bgImg ? ` style="background-image:linear-gradient(var(--ov-color),var(--ov-color)),${esc(bgImg)}"` : '');
  const h = helpers(d, ctx);
  return `<section class="${cls}"${anchor ? ` id="${anchor}"` : ''}${attrs}>${block.render(d, h)}${renderElements(d, h)}</section>`;
}

// The announcement bar's optional dates (YYYY-MM-DD, both days included):
// state is 'before' the start, 'after' the end, or 'live'.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function announceWindow(ann = {}, day = today()) {
  const start = DAY.test(ann.start || '') ? ann.start : '';
  const end = DAY.test(ann.end || '') ? ann.end : '';
  const state = start && day < start ? 'before' : end && day > end ? 'after' : 'live';
  return { start, end, state };
}

function announceNote({ start, end, state }) {
  if (state === 'after') return `Ended ${formatDate(end)} · visitors don’t see it`;
  if (state === 'before') return `Starts ${formatDate(start)}${end ? ` · ends ${formatDate(end)}` : ''}`;
  return end ? `Showing until ${formatDate(end)}` : `Showing since ${formatDate(start)}`;
}

export function renderHeader(doc, pageIndex, ctx) {
  const s = doc.site;
  const h = helpers(s, ctx);
  const navPages = doc.pages.map((p, i) => ({ p, i })).filter(({ p, i }) => inNav(p, i));
  const logo = s.logo ? `<img class="brand__logo" src="${esc(safeSrc(s.logo))}" alt="">` : `<span class="brand__mark">${icon(s.logoIcon || 'cpu')}</span>`;
  const cta = s.headerCta && (s.headerCta.label || '').trim()
    ? `<a class="btn btn--primary btn--sm header__cta" href="${esc(safeHref(s.headerCta.href))}"><span${ctx.edit ? ' data-edit="headerCta.label" data-ph="Button"' : ''}>${esc(s.headerCta.label)}</span></a>` : '';
  const ann = s.announcement || {};
  const win = announceWindow(ann);
  // Pages are rebuilt daily; between rebuilds the visitor's browser checks the dates too.
  const when = ctx.edit ? '' : `${win.start ? ` data-start="${win.start}"` : ''}${win.end ? ` data-end="${win.end}"` : ''}${win.state === 'before' ? ' hidden' : ''}`;
  const note = ctx.edit && (win.start || win.end) ? `<span class="announce__note">${esc(announceNote(win))}</span>` : '';
  const bar = ann.enabled && (ann.text || ctx.edit) && (ctx.edit || win.state !== 'after')
    ? `<div class="announce${ctx.edit && win.state !== 'live' ? ' is-off' : ''}"${when}${ctx.edit ? ' data-section-id="__header" data-label="Announcement bar"' : ''}><div class="wrap announce__inner">${icon('megaphone')}${h.t('span', 'announcement.text', '', { ph: 'Announcement text' })}${ann.link && ann.linkText ? `<a href="${esc(safeHref(ann.link))}">${esc(ann.linkText)} →</a>` : ''}${note}</div></div>`
    : '';
  return `${bar}<header class="site-header site-header--${s.headerStyle || 'light'}"${ctx.edit ? ' data-section-id="__header" data-label="Header"' : ''}>
    <div class="wrap site-header__inner">
      <a class="brand" href="/">${logo}${h.t('span', 'name', 'brand__name', { ph: 'Business name' })}</a>
      <nav class="nav" aria-label="Main"><ul class="nav__list">${navPages.map(({ p, i }) =>
        `<li><a href="${pageHref(p, i)}"${i === pageIndex ? ' aria-current="page"' : ''}>${esc(p.title)}</a></li>`).join('')}</ul>${cta}</nav>
      <button class="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false">${icon('menu')}</button>
    </div></header>`;
}

export function renderFooter(doc, ctx) {
  const s = doc.site;
  const h = helpers(s, ctx);
  const year = new Date().getFullYear();
  return `<footer class="site-footer"${ctx.edit ? ' data-section-id="__footer" data-label="Footer"' : ''}>
    <div class="wrap site-footer__grid">
      <div class="site-footer__brand">
        <a class="brand" href="/">${s.logo ? `<img class="brand__logo" src="${esc(safeSrc(s.logo))}" alt="">` : `<span class="brand__mark">${icon(s.logoIcon || 'cpu')}</span>`}<span class="brand__name">${esc(s.name)}</span></a>
        ${h.t('p', 'tagline', 'site-footer__tagline', { ph: 'Short tagline', ml: true })}
        ${socialLinks(s)}
      </div>
      <div><h4>Pages</h4><ul>${doc.pages.map((p, i) => (inNav(p, i) ? `<li><a href="${pageHref(p, i)}">${esc(p.title)}</a></li>` : '')).join('')}</ul></div>
      <div><h4>Contact</h4><ul>
        ${s.email ? `<li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ''}
        ${s.phone ? `<li><a href="tel:${esc(s.phone.replace(/[^+\d]/g, ''))}">${esc(s.phone)}</a></li>` : ''}
        ${s.location ? `<li>${esc(s.location)}</li>` : ''}${hasHours(s.hours) ? `\n        <li class="site-footer__hours">${esc(hoursSummary(s.hours))} ${openBadge(s.hours, esc, ctx.edit)}</li>` : ''}
      </ul></div>
    </div>
    <div class="wrap site-footer__bottom"><span>© ${year} ${esc(s.name)}</span>${h.t('span', 'footerText', '', { ph: 'Footer note' })}</div>
  </footer>${callBar(s)}`;
}

// The floating “Call now” (and “Text us”) button, on phones or on every screen.
function callBar(s) {
  const c = s.callButton || {};
  const tel = String(s.phone || '').replace(/[^+\d]/g, '');
  if (!c.enabled || tel.replace(/\D/g, '').length < 3) return '';
  const where = c.show === 'all' ? 'all' : 'phones';
  return `<div class="callbar-space callbar--${where}" aria-hidden="true"></div><div class="callbar callbar--${where}">`
    + `<a class="callbar__btn" href="tel:${esc(tel)}">${icon('phone')}<span>${esc(String(c.label || '').trim() || 'Call now')}</span></a>`
    + (c.text ? `<a class="callbar__btn callbar__btn--alt" href="sms:${esc(tel)}">${icon('message')}<span>${esc(String(c.textLabel || '').trim() || 'Text us')}</span></a>` : '')
    + '</div>';
}

function socialLinks(s) {
  const links = SOCIAL.filter(([k]) => /^https?:\/\//i.test(String(s.social?.[k] || '').trim()));
  return links.length ? `<ul class="social">${links.map(([k, label]) =>
    `<li><a href="${esc(s.social[k].trim())}" target="_blank" rel="noopener" aria-label="${label}" title="${label}">${icon(k)}</a></li>`).join('')}</ul>` : '';
}

// Index of the section that renders first on the live site (or in the editor).
export function firstSectionIndex(page, edit = false) {
  return (page.sections || []).findIndex((s) => BLOCKS[s.type] && (edit || !s.hidden));
}

export function renderPage(doc, pageIndex, ctx = {}) {
  const c = { ...ctx, site: doc };
  const page = doc.pages[pageIndex];
  const first = firstSectionIndex(page, !!ctx.edit);
  return renderHeader(doc, pageIndex, c)
    + `<main id="main">${(page.sections || []).map((s, i) => renderSection(s, i === first ? { ...c, first: true } : c)).join('')}</main>`
    + renderFooter(doc, c);
}

// Resolves a URL path (/services/, /blog/my-post/) to a page, post or redirect.
// Unpublished pages and posts are only found with { drafts: true } (previews).
export function findRoute(doc, path, { drafts = false } = {}) {
  const parts = String(path || '/').split(/[?#]/)[0].split('/').filter(Boolean);
  if (!parts.length) return { type: 'page', index: 0 };
  if (parts.length === 2 && parts[0] === POSTS_BASE) {
    const post = (doc.posts || []).find((p) => p.slug === parts[1] && (drafts || isLivePost(p)));
    if (post) return { type: 'post', post };
  }
  if (parts.length === 1) {
    const index = doc.pages.findIndex((p, i) => i > 0 && p.slug === parts[0] && (drafts || !p.draft));
    if (index > 0) return { type: 'page', index };
  }
  const from = redirectFrom(parts.join('/'));
  const r = from && (doc.redirects || []).find((x) => redirectFrom(x.from) === from);
  return r && String(r.to || '').trim() ? { type: 'redirect', to: safeHref(redirectTo(r.to)) } : null;
}

export const NOT_FOUND = {
  heading: 'We couldn’t find that page',
  text: 'The link may be old or mistyped. Try the home page or one of the pages below.',
  button: 'Go to the home page',
};

// The “page not found” page. site.notFound = { heading, text, button, links }
// changes the wording; links (on unless false) lists the menu pages.
export function renderNotFound(doc) {
  const c = { site: doc };
  const nf = { ...NOT_FOUND, ...Object.fromEntries(Object.entries(doc.site.notFound || {}).filter(([, v]) => v !== '')) };
  const pages = nf.links === false ? [] : doc.pages.map((p, i) => ({ p, i })).filter(({ p, i }) => i > 0 && inNav(p, i));
  const blog = nf.links !== false && blogPageIndex(doc) < 0 && publishedPosts(doc).length ? publishedPosts(doc).slice(0, 3) : [];
  const links = pages.map(({ p, i }) => `<li><a href="${pageHref(p, i)}">${esc(p.title)} ${icon('arrow-right')}</a></li>`)
    .concat(blog.map((p) => `<li><a href="${postHref(p)}">${esc(postTitle(p))} ${icon('arrow-right')}</a></li>`));
  return renderHeader(doc, -1, c)
    + `<main id="main"><section class="sec sec--light pad--spacious"><div class="wrap wrap--narrow notfound">
        <span class="eyebrow">Error 404</span><h1 class="sec-title">${esc(nf.heading)}</h1>
        <p class="sec-intro">${rich(nf.text)}</p>
        <div class="btns" style="justify-content:center"><a class="btn btn--primary btn--lg" href="/">${esc(nf.button)}</a></div>
        ${links.length ? `<ul class="notfound__links" aria-label="Pages on this site">${links.join('')}</ul>` : ''}
      </div></section></main>`
    + renderFooter(doc, c);
}

// ---------------------------------------------------------------------------
// Blog
// Ids for post headings: lower-case words joined by dashes, unique within the
// post, never clashing with ids the page itself uses.
export function headingSlugger() {
  const seen = new Map([['main', 1], ['related-title', 1], ['top', 1]]);
  return (text) => {
    const base = plain(text).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'section';
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}-${n}` : base;
  };
}

// The words of one line of markdown, without its formatting (hyphens and all).
const UNESC = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const inlineText = (md) => rich(md).replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => UNESC[e]).trim();

// The ## and ### headings of a post: [{ level, text, id }], with the same ids markdown() gives them.
export function postHeadings(body) {
  const slug = headingSlugger();
  let fence = false;
  const out = [];
  for (const line of String(body || '').replace(/\r/g, '').split('\n')) {
    if (fence ? /^\s*```\s*$/.test(line) : /^\s*```\s*[\w+#.-]{0,20}\s*$/.test(line)) { fence = !fence; continue; }
    const m = !fence && line.match(/^(#{2,4})\s+(.*)/);
    if (!m) continue;
    const id = m[1].length < 4 ? slug(m[2]) : '';
    if (id) out.push({ level: m[1].length, text: inlineText(m[2]), id });
  }
  return out;
}

// Callout boxes: a quote whose first line is [!TIP], [!NOTE] or [!WARNING]
// (the same syntax GitHub uses; IMPORTANT and CAUTION also work).
const CALLOUTS = {
  NOTE: ['note', 'Note', 'info'], IMPORTANT: ['note', 'Important', 'info'],
  TIP: ['tip', 'Tip', 'bulb'], WARNING: ['warning', 'Warning', 'alert'], CAUTION: ['warning', 'Caution', 'alert'],
};

// Block-level markdown for post bodies: ## headings, lists, > quotes and
// callouts, ``` code blocks, ![images](src), --- rules and blank-line
// paragraphs. Inline formatting goes through rich(), which escapes everything first.
// ids: give ## and ### headings an id (see headingSlugger) so they can be linked to.
// Task list items (- [ ] and - [x]) become tick boxes.
export function markdown(src, resolve = (v) => v, { ids = false } = {}) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const slug = headingSlugger();
  let html = '';
  let para = [];
  let list = null;
  let quote = null;
  let fence = null;
  const inline = (t) => rich(t).replace(/\n/g, '<br>');
  const paras = (ls) => ls.join('\n').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => `<p>${inline(t)}</p>`).join('');
  const flushP = () => { if (para.length) { html += `<p>${inline(para.join('\n'))}</p>`; para = []; } };
  const item = (t) => {
    const task = t.match(/^\[([ xX])\]\s+(.*)$/);
    return task ? `<li class="task"><label><input type="checkbox" data-task${task[1] === ' ' ? '' : ' checked'}><span>${inline(task[2])}</span></label></li>` : `<li>${inline(t)}</li>`;
  };
  const flushL = () => {
    if (!list) return;
    const tasks = list.tag === 'ul' && list.items.some((i) => /^\[[ xX]\]\s/.test(i));
    const attrs = list.start > 1 ? ` start="${list.start}"` : tasks ? ' class="tasks"' : '';
    html += `<${list.tag}${attrs}>${list.items.map(item).join('')}</${list.tag}>`;
    list = null;
  };
  const flushQ = () => {
    if (!quote) return;
    const m = quote[0].match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
    if (m) {
      const [cls, label, ic] = CALLOUTS[m[1].toUpperCase()];
      html += `<aside class="callout callout--${cls}"><p class="callout__title">${icon(ic)}${label}</p>${paras([m[2], ...quote.slice(1)])}</aside>`;
    } else html += `<blockquote>${paras(quote)}</blockquote>`;
    quote = null;
  };
  const flushF = () => {
    html += `<pre class="code"${fence.lang ? ` data-lang="${esc(fence.lang)}"` : ''}><code>${esc(fence.lines.join('\n'))}</code></pre>`;
    fence = null;
  };
  const block = () => { flushP(); flushL(); flushQ(); };
  for (const line of lines) {
    let m;
    if (fence) {
      if (/^\s*```\s*$/.test(line)) flushF(); else fence.lines.push(line);
      continue;
    }
    if ((m = line.match(/^\s*```\s*([\w+#.-]{0,20})\s*$/))) { block(); fence = { lang: m[1], lines: [] }; continue; }
    if ((m = line.match(/^>\s?(.*)/))) { flushP(); flushL(); (quote ||= []).push(m[1]); continue; }
    flushQ();
    if (!line.trim()) { block(); continue; }
    if ((m = line.match(/^(#{2,4})\s+(.*)/))) {
      block();
      const n = m[1].length;
      html += `<h${n}${ids && n < 4 ? ` id="${slug(m[2])}"` : ''}>${inline(m[2])}</h${n}>`;
      continue;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      flushP();
      if (list?.tag !== tag) { flushL(); list = { tag, items: [], start: tag === 'ol' ? parseInt(line, 10) : 0 }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/))) {
      block();
      const s = safeSrc(resolve(m[2]));
      if (s) html += `<figure><img src="${esc(s)}" alt="${esc(m[1])}" loading="lazy">${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ''}</figure>`;
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) { block(); html += '<hr>'; continue; }
    flushL();
    para.push(line);
  }
  if (fence) flushF();
  block();
  return html;
}

export const postHref = (p) => `/${POSTS_BASE}/${encodeURIComponent(p.slug)}/`;

// Images inside post text can point at the media library as media:<id>.
const mediaResolver = (doc) => (v) => (String(v).startsWith('media:') ? (doc.media || []).find((m) => m.id === String(v).slice(6))?.src || '' : v);

export function formatDate(d) {
  const t = new Date(`${String(d || '').slice(0, 10)}T12:00:00`);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const postTags = (p) => String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);

// Today's date (UTC) as YYYY-MM-DD. Posts dated later are scheduled: they go
// live on that day, when the site is next built (GitHub rebuilds it daily).
export const today = () => new Date().toISOString().slice(0, 10);
export const isLivePost = (p, day = today()) => p.published !== false && !(String(p.date || '').slice(0, 10) > day);

export function publishedPosts(doc, kind = 'all') {
  const day = today();
  return (doc.posts || [])
    .filter((p) => isLivePost(p, day) && (kind === 'all' || (p.kind || 'post') === kind))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

const plain = (t) => String(t || '').replace(/```[\w+#.-]*|\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gi, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`-]+/g, ' ').replace(/\s+/g, ' ').trim();
export function postTitle(p) {
  if (p.title) return p.title;
  const t = plain(p.body);
  return t.length > 70 ? `${t.slice(0, 67)}…` : t;
}

function tagChips(p) {
  const tags = postTags(p);
  return tags.length ? `<span class="post-tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : '';
}

// search: also carry the words a blog search box looks through.
export function renderPostCard(p, doc = {}, { search = false } = {}) {
  const tags = esc(postTags(p).join('|').toLowerCase()) + (search ? `" data-text="${esc(searchText(p))}` : '');
  const meta = `<div class="post-meta"><time datetime="${esc(p.date)}">${formatDate(p.date)}</time>${tagChips(p)}</div>`;
  if ((p.kind || 'post') === 'blurb') {
    let host = '';
    try { host = p.link ? new URL(p.link).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
    return `<article class="blurb-card" data-tags="${tags}"><span class="blurb-card__icon">${icon('sparkle')}</span>${meta}
      ${p.title ? `<h3 class="blurb-card__title">${esc(p.title)}</h3>` : ''}
      <div class="blurb-card__text">${markdown(p.body, mediaResolver(doc))}</div>
      ${host ? `<a class="blurb-card__src" href="${esc(safeHref(p.link))}" target="_blank" rel="noopener">via ${esc(host)} ${icon('external')}</a>` : ''}</article>`;
  }
  const img = safeSrc(p.image);
  return `<article class="post-card" data-tags="${tags}">
    <a class="post-card__img" href="${postHref(p)}" tabindex="-1" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="post-card__ph">${icon('pen')}</span>`}</a>
    <div class="post-card__body">${meta}
      <h3 class="post-card__title"><a href="${postHref(p)}">${esc(postTitle(p))}</a></h3>
      ${p.summary ? `<p class="post-card__sum">${esc(p.summary)}</p>` : ''}
      <a class="post-card__more" href="${postHref(p)}">Read more ${icon('arrow-right')}</a>
    </div></article>`;
}

export function blogPageIndex(doc) {
  return doc.pages.findIndex((p, i) => isLivePage(p, i) && (p.sections || []).some((s) => s.type === 'blogfeed' && !s.hidden && s.data?.limit === 'all'));
}

// A post's “last updated” day (YYYY-MM-DD), when it is set and later than the post's date.
export const postUpdated = (p) => (DAY.test(p.updated || '') && p.updated > String(p.date || '').slice(0, 10) ? p.updated : '');

// What the blog search looks through: title, summary, tags and the start of the text.
export const searchText = (p) => `${postTitle(p)} ${p.summary || ''} ${postTags(p).join(' ')} ${plain(p.body).slice(0, 1200)}`
  .toLowerCase().replace(/\s+/g, ' ').trim();

// About 200 words a minute; at least one.
export const readingMinutes = (post) => Math.max(1, Math.round(plain(post.body).split(' ').filter(Boolean).length / 200));

// Up to `n` other posts, the ones sharing the most tags first, then the newest.
export function relatedPosts(doc, post, n = 3) {
  const tags = new Set(postTags(post).map((t) => t.toLowerCase()));
  return publishedPosts(doc, 'post').filter((p) => p.id !== post.id)
    .map((p, i) => ({ p, i, score: postTags(p).filter((t) => tags.has(t.toLowerCase())).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i).slice(0, n).map(({ p }) => p);
}

// Plain share links (no tracking scripts) plus “Copy link” for the live site.
function shareLinks(url, title) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    ['facebook', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['linkedin', 'LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['xsocial', 'X', `https://twitter.com/intent/tweet?url=${u}&text=${t}`],
    ['mail', 'Email', `mailto:?subject=${t}&body=${u}`],
  ];
  return `<div class="share"><span class="share__label">Share</span>${links.map(([ic, label, href]) =>
    `<a class="share__btn" href="${esc(href)}"${ic === 'mail' ? '' : ' target="_blank" rel="noopener"'} aria-label="Share on ${label}" title="${label}">${icon(ic)}</a>`).join('')}`
    + `<button type="button" class="share__btn share__copy" data-copy="${esc(url)}" title="Copy link" aria-label="Copy link">${icon('link')}</button>`
    + `<button type="button" class="share__btn" data-print title="Print" aria-label="Print this post">${icon('printer')}</button></div>`;
}

export function renderPostPage(doc, post, ctx = {}) {
  const c = { ...ctx, edit: false, site: doc };
  let bi = blogPageIndex(doc);
  if (bi < 0) bi = doc.pages.findIndex((p, i) => isLivePage(p, i) && (p.sections || []).some((s) => s.type === 'blogfeed'));
  const back = bi >= 0 ? pageHref(doc.pages[bi], bi) : '/';
  const all = publishedPosts(doc, 'post');
  const i = all.findIndex((p) => p.id === post.id);
  const newer = i > 0 ? all[i - 1] : null;
  const older = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  const img = safeSrc(post.image);
  const host = (() => { try { return post.link ? new URL(post.link).hostname.replace(/^www\./, '') : ''; } catch { return ''; } })();
  const related = (post.kind || 'post') === 'post' ? relatedPosts(doc, post) : [];
  // Long posts (three or more ## headings) start with a list of their parts, unless toc is false.
  const heads = (post.kind || 'post') === 'post' && post.toc !== false ? postHeadings(post.body) : [];
  const toc = heads.filter((x) => x.level === 2).length >= 3
    ? `<nav class="post__toc" aria-labelledby="toc-title"><p class="post__toc-title" id="toc-title">${icon('list')}In this post</p><ul>${heads.map((x) =>
      `<li${x.level === 3 ? ' class="sub"' : ''}><a href="#${x.id}">${esc(x.text)}</a></li>`).join('')}</ul></nav>`
    : '';
  return renderHeader(doc, bi, c)
    + `<main id="main"><article class="sec sec--light pad--normal post">
      <header class="wrap wrap--narrow post__head">
        <a class="post__back" href="${back}">${icon('arrow-right')} Back to blog</a>
        <div class="post-meta"><time datetime="${esc(post.date)}">${formatDate(post.date)}</time>${postUpdated(post) ? `<span class="post-meta__updated">Updated <time datetime="${post.updated}">${formatDate(post.updated)}</time></span>` : ''}<span class="post-meta__read">${readingMinutes(post)} min read</span>${tagChips(post)}</div>
        <h1 class="post__title">${esc(postTitle(post))}</h1>
        ${post.summary ? `<p class="lead post__summary">${esc(post.summary)}</p>` : ''}
      </header>
      ${img ? `<figure class="wrap post__cover"><img src="${esc(img)}" alt="" fetchpriority="high" decoding="async"></figure>` : ''}
      <div class="wrap wrap--narrow post__body">${toc}${markdown(post.body, mediaResolver(doc), { ids: true }) || (ctx.preview ? '<p class="post__empty">Start writing in the panel on the left…</p>' : '')}
        ${host ? `<p class="post__src"><a href="${esc(safeHref(post.link))}" target="_blank" rel="noopener">Source: ${esc(host)} ${icon('external')}</a></p>` : ''}
        ${ctx.origin ? shareLinks(`${ctx.origin}${postHref(post)}`, postTitle(post)) : ''}</div>
      ${newer || older ? `<nav class="wrap wrap--narrow post__nav" aria-label="More posts">
        ${older ? `<a href="${postHref(older)}"><small>Previous</small>${esc(postTitle(older))}</a>` : '<span></span>'}
        ${newer ? `<a class="next" href="${postHref(newer)}"><small>Next</small>${esc(postTitle(newer))}</a>` : ''}</nav>` : ''}
    </article>${related.length ? `<section class="sec sec--alt pad--normal related" aria-labelledby="related-title"><div class="wrap">
      <h2 class="sec-title related__title" id="related-title">Keep reading</h2>
      <div class="blogfeed blogfeed--grid related__grid">${related.map((p) => renderPostCard(p, doc)).join('')}</div></div></section>` : ''}</main>`
    + renderFooter(doc, c);
}
