// Shared renderer used by the public site (index.html) and the editor canvas.
import { BLOCKS } from './blocks.js';
import { icon } from './icons.js';

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

function safeSrc(src) {
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
    + `--radius:${RADII[t.radius] || RADII.soft};--btn-radius:${t.buttons === 'pill' ? '999px' : `var(--radius)`};}`;
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
    edit, esc, icon, site: ctx.site.site,
    list: (path) => (Array.isArray(getPath(data, path)) ? getPath(data, path) : []),
    t(tag, path, cls = '', opts = {}) {
      const v = getPath(data, path) ?? '';
      if (!edit && !String(v).trim()) return '';
      return `<${tag}${cls ? ` class="${cls}"` : ''}${attr(path, opts)}>${esc(v)}</${tag}>`;
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
  const cls = `sec sec--${d.bg || 'light'} pad--${d.pad || 'normal'} blk-${section.type}${section.hidden ? ' is-hidden' : ''}`;
  const attrs = ctx.edit ? ` data-section-id="${esc(section.id)}" data-label="${esc(block.label)}"` : '';
  return `<section class="${cls}"${anchor ? ` id="${anchor}"` : ''}${attrs}>${block.render(d, helpers(d, ctx))}</section>`;
}

export function renderHeader(doc, pageIndex, ctx) {
  const s = doc.site;
  const h = helpers(s, ctx);
  const navPages = doc.pages.map((p, i) => ({ p, i })).filter(({ p }) => p.showInNav !== false);
  const logo = s.logo ? `<img class="brand__logo" src="${esc(safeSrc(s.logo))}" alt="">` : `<span class="brand__mark">${icon(s.logoIcon || 'cpu')}</span>`;
  const cta = s.headerCta && (s.headerCta.label || '').trim()
    ? `<a class="btn btn--primary btn--sm header__cta" href="${esc(safeHref(s.headerCta.href))}"><span${ctx.edit ? ' data-edit="headerCta.label" data-ph="Button"' : ''}>${esc(s.headerCta.label)}</span></a>` : '';
  return `<header class="site-header site-header--${s.headerStyle || 'light'}"${ctx.edit ? ' data-section-id="__header" data-label="Header"' : ''}>
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
