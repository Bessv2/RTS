// Shared renderer used by the public site (index.html) and the editor canvas.
import { BLOCKS } from './blocks.js';
import { icon, SOCIAL } from './icons.js';

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

// Lightweight formatting for paragraphs: **bold**, *italic*, [link](url).
// Text is escaped first, so only these three patterns ever become HTML.
export function rich(v) {
  return esc(v)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?![\s*])([^*\n]+?)\*(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
      const url = safeHref(href.replace(/&amp;/g, '&'));
      const ext = /^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${esc(url)}"${ext}>${text}</a>`;
    });
}

export function cssUrl(src) {
  const v = safeSrc(src);
  return v ? `url("${v.replace(/["\\\s()]/g, (c) => encodeURIComponent(c))}")` : '';
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

export function safeSrc(src) {
  const v = String(src || '').trim();
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(v)) return v;
  if (/^[a-z][\w+.-]*:/i.test(v) && !/^https?:/i.test(v)) return '';
  return v;
}

export function fontsHref(theme) {
  const fams = [...new Set([theme.headingFont, theme.bodyFont])].filter((f) => FONTS[f]).map((f) => `family=${FONTS[f]}`);
  return fams.length ? `https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap` : '';
}

export function themeCSS(theme) {
  const t = { ...THEME_PRESETS.midnight, ...theme };
  return `:root{--c-primary:${t.primary};--c-accent:${t.accent};--c-dark:${t.dark};--c-bg:${t.bg};--c-surface:${t.surface};--c-text:${t.text};`
    + `--font-head:'${t.headingFont || 'Inter'}',system-ui,sans-serif;--font-body:'${t.bodyFont || 'Inter'}',system-ui,sans-serif;`
    + `--radius:${RADII[t.radius] || RADII.soft};--btn-radius:${t.buttons === 'pill' ? '999px' : `var(--radius)`};}`
    + (t.customCSS ? `\n/* custom */\n${String(t.customCSS).replace(/<\/?style/gi, '')}` : '');
}

export function pageHref(page, index) {
  return index === 0 || !page.slug ? '#/' : `#/${page.slug}`;
}

function helpers(data, ctx, sectionPath = '') {
  const edit = !!ctx.edit;
  const attr = (path, opts = {}) => edit
    ? ` data-edit="${esc(sectionPath + path)}" data-ph="${esc(opts.ph || 'Type here…')}"${opts.ml ? ' data-ml' : ''}`
    : '';
  const h = {
    edit, esc, icon, site: ctx.site.site, doc: ctx.site,
    blog: { publishedPosts, renderPostCard, postTags },
    src: (v) => safeSrc(v),
    list: (path) => (Array.isArray(getPath(data, path)) ? getPath(data, path) : []),
    t(tag, path, cls = '', opts = {}) {
      const v = getPath(data, path) ?? '';
      if (!edit && !String(v).trim()) return '';
      const body = opts.ml ? rich(v) : esc(v);
      return `<${tag}${cls ? ` class="${cls}"` : ''}${attr(path, opts)}${edit && opts.ml ? ' data-rich' : ''}>${body}</${tag}>`;
    },
    img(path, cls, alt = '') {
      const src = safeSrc(getPath(data, path));
      return src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : '';
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

export function renderSection(section, ctx) {
  const block = BLOCKS[section.type];
  if (!block) return '';
  if (section.hidden && !ctx.edit) return '';
  const d = section.data || {};
  const anchor = String(d.anchor || '').replace(/[^\w-]/g, '');
  const bgImg = cssUrl(d.bgImage);
  const cls = `sec sec--${d.bg || 'light'} pad--${d.pad || 'normal'} blk-${section.type}${bgImg ? ` has-bgimg ov--${d.overlay || 'medium'}` : ''}${section.hidden ? ' is-hidden' : ''}`;
  const attrs = (ctx.edit ? ` data-section-id="${esc(section.id)}" data-label="${esc(block.label)}"` : '')
    + (bgImg ? ` style="background-image:linear-gradient(var(--ov-color),var(--ov-color)),${esc(bgImg)}"` : '');
  return `<section class="${cls}"${anchor ? ` id="${anchor}"` : ''}${attrs}>${block.render(d, helpers(d, ctx))}</section>`;
}

export function renderHeader(doc, pageIndex, ctx) {
  const s = doc.site;
  const h = helpers(s, ctx);
  const navPages = doc.pages.map((p, i) => ({ p, i })).filter(({ p }) => p.showInNav !== false);
  const logo = s.logo ? `<img class="brand__logo" src="${esc(safeSrc(s.logo))}" alt="">` : `<span class="brand__mark">${icon(s.logoIcon || 'cpu')}</span>`;
  const cta = s.headerCta && (s.headerCta.label || '').trim()
    ? `<a class="btn btn--primary btn--sm header__cta" href="${esc(safeHref(s.headerCta.href))}"><span${ctx.edit ? ' data-edit="headerCta.label" data-ph="Button"' : ''}>${esc(s.headerCta.label)}</span></a>` : '';
  const ann = s.announcement || {};
  const bar = ann.enabled && (ann.text || ctx.edit)
    ? `<div class="announce"${ctx.edit ? ' data-section-id="__header" data-label="Announcement bar"' : ''}><div class="wrap announce__inner">${icon('megaphone')}${h.t('span', 'announcement.text', '', { ph: 'Announcement text' })}${ann.link && ann.linkText ? `<a href="${esc(safeHref(ann.link))}">${esc(ann.linkText)} →</a>` : ''}</div></div>`
    : '';
  return `${bar}<header class="site-header site-header--${s.headerStyle || 'light'}"${ctx.edit ? ' data-section-id="__header" data-label="Header"' : ''}>
    <div class="wrap site-header__inner">
      <a class="brand" href="#/">${logo}${h.t('span', 'name', 'brand__name', { ph: 'Business name' })}</a>
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
        <a class="brand" href="#/">${s.logo ? `<img class="brand__logo" src="${esc(safeSrc(s.logo))}" alt="">` : `<span class="brand__mark">${icon(s.logoIcon || 'cpu')}</span>`}<span class="brand__name">${esc(s.name)}</span></a>
        ${h.t('p', 'tagline', 'site-footer__tagline', { ph: 'Short tagline', ml: true })}
        ${socialLinks(s)}
      </div>
      <div><h4>Pages</h4><ul>${doc.pages.map((p, i) => (p.showInNav !== false ? `<li><a href="${pageHref(p, i)}">${esc(p.title)}</a></li>` : '')).join('')}</ul></div>
      <div><h4>Contact</h4><ul>
        ${s.email ? `<li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ''}
        ${s.phone ? `<li><a href="tel:${esc(s.phone.replace(/[^+\d]/g, ''))}">${esc(s.phone)}</a></li>` : ''}
        ${s.location ? `<li>${esc(s.location)}</li>` : ''}
      </ul></div>
    </div>
    <div class="wrap site-footer__bottom"><span>© ${year} ${esc(s.name)}</span>${h.t('span', 'footerText', '', { ph: 'Footer note' })}</div>
  </footer>`;
}

function socialLinks(s) {
  const links = SOCIAL.filter(([k]) => /^https?:\/\//i.test(String(s.social?.[k] || '').trim()));
  return links.length ? `<ul class="social">${links.map(([k, label]) =>
    `<li><a href="${esc(s.social[k].trim())}" target="_blank" rel="noopener" aria-label="${label}" title="${label}">${icon(k)}</a></li>`).join('')}</ul>` : '';
}

export function renderPage(doc, pageIndex, ctx = {}) {
  const c = { ...ctx, site: doc };
  const page = doc.pages[pageIndex];
  return renderHeader(doc, pageIndex, c)
    + `<main id="main">${(page.sections || []).map((s) => renderSection(s, c)).join('')}</main>`
    + renderFooter(doc, c);
}

export function findPageIndex(doc, hash) {
  const slug = String(hash || '').replace(/^#\/?/, '').split(/[?#]/)[0];
  if (!slug) return 0;
  const i = doc.pages.findIndex((p) => p.slug === slug);
  return i;
}

// ---------------------------------------------------------------------------
// Blog
// Block-level markdown for post bodies: ## headings, lists, > quotes,
// ![images](src), --- rules and blank-line paragraphs. Inline formatting
// goes through rich(), which escapes everything first.
export function markdown(src, resolve = (v) => v) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '';
  let para = [];
  let list = null;
  const inline = (t) => rich(t).replace(/\n/g, '<br>');
  const flushP = () => { if (para.length) { html += `<p>${inline(para.join('\n'))}</p>`; para = []; } };
  const flushL = () => { if (list) { html += `<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`; list = null; } };
  const block = () => { flushP(); flushL(); };
  for (const line of lines) {
    let m;
    if (!line.trim()) { block(); continue; }
    if ((m = line.match(/^(#{2,4})\s+(.*)/))) { block(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      flushP();
      if (list?.tag !== tag) { flushL(); list = { tag, items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)/))) { block(); html += `<blockquote><p>${inline(m[1])}</p></blockquote>`; continue; }
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
  block();
  return html;
}

export const postHref = (p) => `#/post/${p.slug}`;

// Images inside post text can point at the media library as media:<id>.
const mediaResolver = (doc) => (v) => (String(v).startsWith('media:') ? (doc.media || []).find((m) => m.id === String(v).slice(6))?.src || '' : v);

export function formatDate(d) {
  const t = new Date(`${String(d || '').slice(0, 10)}T12:00:00`);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const postTags = (p) => String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);

export function publishedPosts(doc, kind = 'all') {
  return (doc.posts || [])
    .filter((p) => p.published !== false && (kind === 'all' || (p.kind || 'post') === kind))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

const plain = (t) => String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`-]+/g, ' ').replace(/\s+/g, ' ').trim();
export function postTitle(p) {
  if (p.title) return p.title;
  const t = plain(p.body);
  return t.length > 70 ? `${t.slice(0, 67)}…` : t;
}

function tagChips(p) {
  const tags = postTags(p);
  return tags.length ? `<span class="post-tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : '';
}

export function renderPostCard(p, doc = {}) {
  const tags = esc(postTags(p).join('|').toLowerCase());
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
  return doc.pages.findIndex((p) => (p.sections || []).some((s) => s.type === 'blogfeed' && !s.hidden && s.data?.limit === 'all'));
}

export function renderPostPage(doc, post, ctx = {}) {
  const c = { ...ctx, edit: false, site: doc };
  let bi = blogPageIndex(doc);
  if (bi < 0) bi = doc.pages.findIndex((p) => (p.sections || []).some((s) => s.type === 'blogfeed'));
  const back = bi >= 0 ? pageHref(doc.pages[bi], bi) : '#/';
  const all = publishedPosts(doc, 'post');
  const i = all.findIndex((p) => p.id === post.id);
  const newer = i > 0 ? all[i - 1] : null;
  const older = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  const img = safeSrc(post.image);
  const host = (() => { try { return post.link ? new URL(post.link).hostname.replace(/^www\./, '') : ''; } catch { return ''; } })();
  return renderHeader(doc, bi, c)
    + `<main id="main"><article class="sec sec--light pad--normal post">
      <header class="wrap wrap--narrow post__head">
        <a class="post__back" href="${back}">${icon('arrow-right')} Back to blog</a>
        <div class="post-meta"><time datetime="${esc(post.date)}">${formatDate(post.date)}</time>${tagChips(post)}</div>
        <h1 class="post__title">${esc(postTitle(post))}</h1>
        ${post.summary ? `<p class="lead post__summary">${esc(post.summary)}</p>` : ''}
      </header>
      ${img ? `<figure class="wrap post__cover"><img src="${esc(img)}" alt=""></figure>` : ''}
      <div class="wrap wrap--narrow post__body">${markdown(post.body, mediaResolver(doc)) || (ctx.preview ? '<p class="post__empty">Start writing in the panel on the left…</p>' : '')}
        ${host ? `<p class="post__src"><a href="${esc(safeHref(post.link))}" target="_blank" rel="noopener">Source: ${esc(host)} ${icon('external')}</a></p>` : ''}</div>
      ${newer || older ? `<nav class="wrap wrap--narrow post__nav" aria-label="More posts">
        ${older ? `<a href="${postHref(older)}"><small>Previous</small>${esc(postTitle(older))}</a>` : '<span></span>'}
        ${newer ? `<a class="next" href="${postHref(newer)}"><small>Next</small>${esc(postTitle(newer))}</a>` : ''}</nav>` : ''}
    </article></main>`
    + renderFooter(doc, c);
}
