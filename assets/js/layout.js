// Layout sections and styles, shared by the site and the editor. Pure functions
// (no DOM), so they run the same in browsers and Node.
//
//  - cleanHTML: the only HTML a rich text element can contain.
//  - Styles: the settings any section, row, column or element can have, and the
//    CSS they become. Every value is checked here; nothing typed in a style ever
//    reaches the page as raw CSS.
//  - renderLayout: a layout section's rows → columns → elements.
//
// Layout section data:
//   { rows: [{ design, mobile, cols: [{ span, design, mobile, els: [{ type, ...content, design, mobile }] }] }] }
// `design` holds the style settings for every screen, `tablet` the changes for
// tablets and small laptops (narrower than 1024px) and `mobile` the changes for
// phones (narrower than 760px). Phones get the tablet changes too unless they have
// their own. A "box" element holds elements of its own (els).
import { esc, safeHref, cssUrl } from './util.js';

// ----------------------------------------------------------------------------
// Rich text
// ----------------------------------------------------------------------------

const KEEP = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'u', 's', 'a', 'span', 'code', 'sub', 'sup']);
const RENAME = { b: 'strong', i: 'em', del: 's', strike: 's', ins: 'u', h1: 'h2', h5: 'h4', h6: 'h4', div: 'p', pre: 'p', tr: 'p', font: 'span', mark: 'span' };
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// Dropped with everything inside them.
const DROP = new Set(['script', 'style', 'iframe', 'object', 'noscript', 'noembed', 'noframes', 'template', 'svg', 'math', 'head', 'title', 'textarea', 'select', 'canvas', 'video', 'audio', 'xmp', 'plaintext', 'button']);
const BLOCKS = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote']);
const PARA = new Set(['p', 'h2', 'h3', 'h4']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', deg: '°', times: '×', euro: '€', pound: '£' };
const FONT_SIZES = { 1: 'x-small', 2: 'small', 3: 'medium', 4: 'large', 5: 'x-large', 6: 'xx-large', 7: 'xxx-large' };

function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});?/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : '';
  });
}

function attrsOf(src) {
  const out = {};
  const rx = /([^\s"'=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = rx.exec(src))) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

const SIZE_WORDS = /^(x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/;
function fontSize(v) {
  if (SIZE_WORDS.test(v)) return v;
  const m = v.match(/^(\d{1,3}(?:\.\d+)?)(px|em|rem|%)$/);
  if (!m) return '';
  const n = Number(m[1]);
  const [lo, hi] = { px: [8, 200], em: [0.5, 8], rem: [0.5, 8], '%': [50, 800] }[m[2]];
  return n >= lo && n <= hi ? `${n}${m[2]}` : '';
}

// The inline styles rich text may keep: colours, size, weight, italic,
// underline/strike-through, and (on paragraphs and headings) alignment.
function cleanStyle(style, block) {
  const out = [];
  for (const decl of String(style || '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim().replace(/\s*!important$/i, '').toLowerCase();
    let ok = '';
    if (block) {
      if (prop === 'text-align' && /^(left|center|right|justify)$/.test(val)) ok = val;
    } else if (prop === 'color' || prop === 'background-color') ok = cssColor(val);
    else if (prop === 'font-size') ok = fontSize(val);
    else if (prop === 'font-weight' && /^(normal|bold|[1-9]00)$/.test(val)) ok = val;
    else if (prop === 'font-style' && /^(normal|italic)$/.test(val)) ok = val;
    else if ((prop === 'text-decoration' || prop === 'text-decoration-line') && /^(none|underline|line-through)( (underline|line-through))?$/.test(val)) ok = val;
    else if (prop === 'font-family' && /^var\(--font-(head|body)\)$/.test(val)) ok = val;
    if (ok) out.push(`${prop === 'text-decoration-line' ? 'text-decoration' : prop}:${ok}`);
  }
  return out.join(';');
}

// Rich text → safe HTML. Keeps paragraphs, headings (h2–h4), lists, quotes,
// bold/italic/underline/strike, links, code and coloured or resized text;
// everything else is removed (scripts and styles together with their contents).
// Always returns well-formed markup, so it can never close the element it sits in.
export function cleanHTML(html) {
  const src = String(html ?? '');
  const out = [];
  const stack = []; // { name: tag as written, tag: tag written out, or '' when left out }
  const closeTo = (i) => { while (stack.length > i) { const e = stack.pop(); if (e.tag) out.push(`</${e.tag}>`); } };
  const lastIndex = (test) => { for (let i = stack.length - 1; i >= 0; i--) if (test(stack[i])) return i; return -1; };
  const rx = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<[!?][^>]*>?|[^<]+|</gi;
  let m;
  while ((m = rx.exec(src))) {
    const [tok, closing, rawName, rawAttrs] = m;
    if (!rawName) {
      if (tok[0] !== '<' || tok === '<') out.push(esc(decode(tok)));
      continue;
    }
    const name = rawName.toLowerCase();
    if (closing) {
      const i = lastIndex((e) => e.name === name);
      if (i >= 0) closeTo(i);
      continue;
    }
    if (DROP.has(name)) {
      const end = src.toLowerCase().indexOf(`</${name}`, rx.lastIndex);
      if (end < 0) break;
      const gt = src.indexOf('>', end);
      rx.lastIndex = gt < 0 ? src.length : gt + 1;
      continue;
    }
    if (VOID.has(name)) {
      if (name === 'br') out.push('<br>');
      else if (name === 'hr') { const para = lastIndex((e) => PARA.has(e.tag)); if (para >= 0) closeTo(para); out.push('<hr>'); }
      continue;
    }
    let tag = RENAME[name] || (KEEP.has(name) ? name : '');
    if (stack.length >= 24) tag = '';
    const a = tag ? attrsOf(rawAttrs) : {};
    let attrs = '';
    if (tag && BLOCKS.has(tag)) {
      // A new paragraph, heading, list or quote ends an open paragraph or heading,
      // and a new list item ends the previous one, like a browser would.
      const para = lastIndex((e) => PARA.has(e.tag));
      if (para >= 0) closeTo(para);
      if (tag === 'li') {
        const li = lastIndex((e) => e.tag === 'li');
        if (li > lastIndex((e) => e.tag === 'ul' || e.tag === 'ol')) closeTo(li);
      }
      const align = cleanStyle(a.style, true) || (/^(left|center|right|justify)$/i.test(a.align || '') ? `text-align:${a.align.toLowerCase()}` : '');
      if (align && tag !== 'ul' && tag !== 'ol') attrs = ` style="${align}"`;
      if (tag === 'ol' && /^\d{1,4}$/.test(a.start || '') && a.start !== '1') attrs += ` start="${a.start}"`;
    } else if (tag === 'a') {
      const href = String(a.href || '').trim();
      const safe = href ? safeHref(href) : '#';
      if (safe === '#' && href !== '#') tag = '';
      else attrs = ` href="${esc(safe)}"${a.target === '_blank' ? ' target="_blank" rel="noopener"' : ''}`;
    } else if (tag === 'span') {
      let style = a.style || '';
      if (name === 'font') style = [a.color ? `color:${a.color}` : '', FONT_SIZES[a.size] ? `font-size:${FONT_SIZES[a.size]}` : ''].filter(Boolean).join(';');
      const css = cleanStyle(style, false);
      if (css) attrs = ` style="${esc(css)}"`; else tag = '';
    }
    stack.push({ name, tag });
    if (tag) out.push(`<${tag}${attrs}>`);
  }
  closeTo(0);
  const html2 = out.join('').trim();
  // Nothing visible left (an emptied editor leaves <p><br></p>): store nothing.
  return /<hr>/.test(html2) || html2.replace(/<[^>]+>|&nbsp;|\s| /g, '') ? html2 : '';
}

// ----------------------------------------------------------------------------
// Styles
// ----------------------------------------------------------------------------

// Theme colours by name, so a design follows the theme when it changes.
export const COLOR_TOKENS = {
  primary: 'var(--c-primary)', accent: 'var(--c-accent)', dark: 'var(--c-dark)', text: 'var(--c-text)',
  bg: 'var(--c-bg)', surface: 'var(--c-surface)', white: '#ffffff', black: '#000000', transparent: 'transparent',
};

export function cssColor(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  if (COLOR_TOKENS[s]) return COLOR_TOKENS[s];
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) return s;
  if (/^var\(--c-(primary|accent|dark|text|bg|surface)\)$/.test(s)) return s;
  const m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d{1,4}|1\.0+)\s*)?\)$/);
  if (m && [m[1], m[2], m[3]].every((n) => Number(n) <= 255)) return m[4] != null ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${m[4]})` : `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
  return '';
}

const num = (v, min, max) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const px = (v, min, max) => { const n = num(v, min, max); return n == null ? '' : `${Math.round(n)}px`; };
const oneOf = (v, list) => (list.includes(v) ? v : '');

export const SHADOWS = {
  sm: '0 1px 3px rgba(15, 23, 42, .12), 0 1px 2px rgba(15, 23, 42, .08)',
  md: '0 12px 32px -12px rgba(15, 23, 42, .3)',
  lg: '0 28px 64px -24px rgba(15, 23, 42, .45)',
  glow: '0 0 0 1px color-mix(in srgb, var(--c-primary) 35%, transparent), 0 20px 50px -18px var(--c-primary)',
};

// Every style setting, grouped as the editor shows them. `on` lists the kinds of
// piece it applies to: section, row, col, el (any element) or box.
export const STYLE_GROUPS = [
  { id: 'layout', label: 'Layout', items: [
    { key: 'width', label: 'Content width', type: 'select', on: ['row'], options: [['contained', 'Normal'], ['narrow', 'Narrow'], ['wide', 'Wide'], ['full', 'Full width'], ['edge', 'Edge to edge']] },
    { key: 'gap', label: 'Space between', type: 'px', min: 0, max: 200, on: ['section', 'row', 'col', 'box'] },
    { key: 'valign', label: 'Line up columns', type: 'segmented', on: ['row'], options: [['stretch', 'Fill'], ['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']] },
    { key: 'cv', label: 'Content position', type: 'segmented', on: ['section', 'col'], options: [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']] },
    { key: 'dir', label: 'Direction', type: 'segmented', on: ['box'], options: [['column', 'Stacked'], ['row', 'Side by side']] },
    { key: 'justify', label: 'Spread', type: 'segmented', on: ['box'], options: [['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['between', 'Spread']] },
    { key: 'items', label: 'Line up', type: 'segmented', on: ['box'], options: [['stretch', 'Fill'], ['start', 'Start'], ['center', 'Center'], ['end', 'End']] },
    { key: 'reverse', label: 'Reverse the order when stacked', type: 'toggle', on: ['row'], phoneOnly: true },
    { key: 'order', label: 'Order when stacked', type: 'number', min: -12, max: 12, on: ['col'], phoneOnly: true },
  ] },
  { id: 'spacing', label: 'Spacing', items: [
    { key: 'pt', label: 'Padding top', type: 'px', min: 0, max: 600 },
    { key: 'pb', label: 'Padding bottom', type: 'px', min: 0, max: 600 },
    { key: 'pl', label: 'Padding left', type: 'px', min: 0, max: 400 },
    { key: 'pr', label: 'Padding right', type: 'px', min: 0, max: 400 },
    { key: 'mt', label: 'Margin top', type: 'px', min: -400, max: 600, on: ['row', 'col', 'el', 'box'] },
    { key: 'mb', label: 'Margin bottom', type: 'px', min: -400, max: 600, on: ['row', 'col', 'el', 'box'] },
  ] },
  { id: 'size', label: 'Size', items: [
    { key: 'maxW', label: 'Max width', type: 'px', min: 40, max: 3000, on: ['row', 'col', 'el', 'box'] },
    { key: 'minH', label: 'Min height', type: 'px', min: 0, max: 2000, screen: true },
    { key: 'place', label: 'Position', type: 'segmented', on: ['row', 'col', 'el', 'box'], options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], help: 'Where it sits when it is narrower than the space around it.' },
  ] },
  { id: 'background', label: 'Background', items: [
    { key: 'bg', label: 'Colour', type: 'color' },
    { key: 'bg2', label: 'Gradient to', type: 'color' },
    { key: 'ang', label: 'Gradient angle', type: 'number', min: 0, max: 360, when: (s) => !!s.bg2 },
    { key: 'img', label: 'Image', type: 'image' },
    { key: 'bgSize', label: 'Image fit', type: 'segmented', options: [['cover', 'Fill'], ['contain', 'Fit'], ['auto', 'Actual']], when: (s) => !!s.img },
    { key: 'bgPos', label: 'Image focus', type: 'segmented', options: [['center', 'Center'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']], when: (s) => !!s.img },
    { key: 'ov', label: 'Darken image (%)', type: 'number', min: 0, max: 95, when: (s) => !!s.img },
  ] },
  { id: 'border', label: 'Border & shadow', items: [
    { key: 'bw', label: 'Border width', type: 'px', min: 0, max: 40 },
    { key: 'bs', label: 'Border style', type: 'segmented', options: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], when: (s) => num(s.bw, 0, 40) > 0 },
    { key: 'bc', label: 'Border colour', type: 'color', when: (s) => num(s.bw, 0, 40) > 0 },
    { key: 'rad', label: 'Rounded corners', type: 'px', min: 0, max: 999 },
    { key: 'shadow', label: 'Shadow', type: 'segmented', options: [['none', 'None'], ['sm', 'S'], ['md', 'M'], ['lg', 'L'], ['glow', 'Glow']] },
  ] },
  { id: 'text', label: 'Text', items: [
    { key: 'color', label: 'Text colour', type: 'color' },
    { key: 'font', label: 'Font', type: 'segmented', options: [['head', 'Headings'], ['body', 'Body']] },
    { key: 'fs', label: 'Size', type: 'px', min: 8, max: 200 },
    { key: 'fw', label: 'Weight', type: 'select', options: [['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semi-bold'], ['700', 'Bold'], ['800', 'Extra bold'], ['900', 'Black']] },
    { key: 'lh', label: 'Line height', type: 'number', min: 0.8, max: 3, step: 0.05 },
    { key: 'ls', label: 'Letter spacing (em)', type: 'number', min: -0.1, max: 0.5, step: 0.01 },
    { key: 'ta', label: 'Align', type: 'segmented', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']] },
    { key: 'tt', label: 'Capitals', type: 'segmented', options: [['none', 'Normal'], ['uppercase', 'ALL CAPS'], ['capitalize', 'Title Case']] },
  ] },
  // Hover and animation settings are the same on every screen (allScreens).
  { id: 'hover', label: 'Hover', allScreens: true, items: [
    { type: 'note', text: 'How it changes when a mouse pointer is over it. Phones and tablets don’t show this.' },
    { key: 'hbg', label: 'Background colour', type: 'color', on: ['col', 'el', 'box'] },
    { key: 'hcolor', label: 'Text colour', type: 'color', on: ['col', 'el', 'box'] },
    { key: 'hbc', label: 'Border colour', type: 'color', on: ['col', 'el', 'box'] },
    { key: 'hshadow', label: 'Shadow', type: 'segmented', on: ['col', 'el', 'box'], options: [['none', 'None'], ['sm', 'S'], ['md', 'M'], ['lg', 'L'], ['glow', 'Glow']] },
    { key: 'hlift', label: 'Lift up', type: 'px', min: 0, max: 24, on: ['col', 'el', 'box'] },
    { key: 'hzoom', label: 'Grow (%)', type: 'number', min: 100, max: 120, on: ['col', 'el', 'box'] },
  ] },
  { id: 'motion', label: 'Animation', allScreens: true, items: [
    { key: 'anim', label: 'Entrance', type: 'select', on: ['row', 'col', 'el', 'box'], options: [['', 'None'], ['fade', 'Fade in'], ['up', 'Slide up'], ['down', 'Slide down'], ['left', 'Slide in from the left'], ['right', 'Slide in from the right'], ['zoom', 'Zoom in']],
      help: 'Plays once when it scrolls into view. Visitors who turn off animations on their device see it straight away.' },
    { key: 'animDelay', label: 'Delay (seconds)', type: 'number', min: 0, max: 3, step: 0.1, on: ['row', 'col', 'el', 'box'], when: (s) => !!s.anim },
  ] },
  { id: 'visibility', label: 'Visibility', items: [
    { key: 'hide', label: 'Hide', type: 'toggle', on: ['row', 'col', 'el', 'box'] },
  ] },
];

export const ANIMATIONS = ['fade', 'up', 'down', 'left', 'right', 'zoom'];

const SHADOW_KEYS = ['none', ...Object.keys(SHADOWS)];
const PLACE = { left: '0 auto', center: 'auto', right: 'auto 0' };
const BG_POS = ['center', 'top', 'bottom', 'left', 'right'];

// Relative brightness of a colour (0 dark … 1 light), or null when unknown.
// Theme names are looked up in the theme so the text colour can follow.
function lightness(c, theme = {}) {
  const s = String(c || '').trim().toLowerCase();
  const tok = s.match(/^var\(--c-(\w+)\)$/);
  const v = tok ? String(theme[tok[1]] || '') : s;
  let r; let g; let b;
  let m = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (m) {
    const x = m[1].length <= 4 ? m[1].split('').map((ch) => ch + ch).join('') : m[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  } else if ((m = v.match(/^rgba?\((\d+), (\d+), (\d+)/))) [r, g, b] = m.slice(1, 4).map(Number);
  else return null;
  const lin = (u) => { const x = u / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// A dark background (a dark colour, or a well darkened image): the piece gets
// the is-dark class so the site's dark-section styles (accent colours, icons) apply inside it.
export function isDark(design, theme = {}) {
  if (!design || typeof design !== 'object') return false;
  if (cssUrl(design.img) && num(design.ov, 0, 95) >= 30) return true;
  const l = lightness(cssColor(design.bg), theme);
  return l != null && l < 0.36;
}
const darkClass = (design, theme) => (isDark(design, theme) ? ' is-dark' : '');

const LIGHT_TEXT = '--sec-link:currentColor;--sec-text:#f8fafc;--sec-muted:rgba(255, 255, 255, .88);--sec-line:rgba(255, 255, 255, .16);--sec-card:rgba(255, 255, 255, .06);color:var(--sec-text)';
const DARK_TEXT = '--sec-link:var(--c-primary);--sec-text:var(--c-text);--sec-muted:color-mix(in srgb, var(--c-text) 64%, transparent);--sec-line:color-mix(in srgb, var(--c-text) 10%, transparent);--sec-card:#fff;color:var(--sec-text)';

// One piece's style → CSS declarations, split by where they go: `outer` on the
// piece itself (spacing around it, width, alignment), `box` for its padding,
// background, border and shadow, `text` for its type settings, `layout` for how
// it arranges what is inside it. Elements like buttons send box/text to an inner
// part (the button itself) instead. `phone` is true for the changes for a smaller
// screen (tablets or phones), and `base` is what they change.
export function styleDecls(s = {}, { kind = 'el', theme = {}, phone = false, base = {} } = {}) {
  const out = { outer: [], box: [], frame: [], text: [], layout: [], inner: [] };
  if (!s || typeof s !== 'object') return out;
  const add = (part, prop, val) => { if (val !== '' && val != null) out[part].push(`${prop}:${val}`); };
  // Spacing
  // A section's top padding leaves room for a see-through header over it (site.css --hdr-pad).
  const pt = px(s.pt, 0, 600);
  add('box', 'padding-top', pt && kind === 'section' ? `calc(${pt} + var(--hdr-pad, 0px))` : pt);
  for (const [k, prop, min, max] of [['pb', 'padding-bottom', 0, 600], ['pl', 'padding-left', 0, 400], ['pr', 'padding-right', 0, 400]]) add('box', prop, px(s[k], min, max));
  if (kind !== 'section') {
    add('outer', 'margin-top', px(s.mt, -400, 600));
    add('outer', 'margin-bottom', px(s.mb, -400, 600));
    add('outer', 'max-width', px(s.maxW, 40, 3000));
    add('outer', 'margin-inline', PLACE[s.place]);
  }
  if (s.minH === 'screen') add('box', 'min-height', '100svh'); else add('box', 'min-height', px(s.minH, 0, 2000));
  // Background: colour, or a gradient, with an optional image and darkening on top.
  const bg = cssColor(s.bg);
  const bg2 = cssColor(s.bg2);
  const img = cssUrl(s.img);
  const ov = img ? num(s.ov, 0, 95) : null;
  const layers = [];
  if (ov) layers.push(`linear-gradient(color-mix(in srgb, var(--c-dark) ${Math.round(ov)}%, transparent), color-mix(in srgb, var(--c-dark) ${Math.round(ov)}%, transparent))`);
  if (img) layers.push(img);
  if (bg && bg2) layers.push(`linear-gradient(${Math.round(num(s.ang, 0, 360) ?? 135)}deg, ${bg}, ${bg2})`);
  if (bg) add('box', 'background-color', bg);
  if (layers.length) add('box', 'background-image', layers.join(', '));
  else if (bg) add('box', 'background-image', 'none');
  if (img) {
    add('box', 'background-size', oneOf(s.bgSize, ['cover', 'contain', 'auto']) || 'cover');
    add('box', 'background-position', oneOf(s.bgPos, BG_POS) || 'center');
    add('box', 'background-repeat', 'no-repeat');
  }
  // Border and shadow
  // On phones a changed border colour or style keeps the width set for every screen.
  const bw = num(s.bw, 0, 40) ?? (s.bc || s.bs ? num(base.bw, 0, 40) : null);
  if (bw != null) {
    const bs = oneOf(s.bs, ['solid', 'dashed', 'dotted']) || oneOf(base.bs, ['solid', 'dashed', 'dotted']) || 'solid';
    add('frame', 'border', bw ? `${Math.round(bw)}px ${bs} ${cssColor(s.bc) || cssColor(base.bc) || 'var(--sec-line)'}` : '0');
  }
  add('frame', 'border-radius', px(s.rad, 0, 999));
  if (oneOf(s.shadow, SHADOW_KEYS)) add('frame', 'box-shadow', s.shadow === 'none' ? 'none' : SHADOWS[s.shadow]);
  // Text. A chosen text colour also becomes the colour for muted text and lines
  // inside; with only a background colour, text turns light or dark to stay readable.
  const color = cssColor(s.color);
  if (color) out.text.push(`color:${color};--sec-text:${color};--sec-muted:color-mix(in srgb, ${color} 74%, transparent)`);
  else if (bg || ov != null) {
    const l = ov >= 30 ? 0 : lightness(bg, theme);
    if (l != null && !(phone && cssColor(base.color))) out.text.push(l < 0.36 ? LIGHT_TEXT : DARK_TEXT);
  }
  if (s.font === 'head' || s.font === 'body') add('text', 'font-family', `var(--font-${s.font})`);
  const fs = num(s.fs, 8, 200);
  if (fs != null) {
    // Big text shrinks with the screen on its own (a size set for phones wins there).
    add('text', 'font-size', !phone && fs > 28 ? `clamp(${Math.round(Math.max(22, fs * 0.6))}px, ${(fs / 12).toFixed(2)}vw, ${Math.round(fs)}px)` : `${Math.round(fs)}px`);
  }
  const fw = num(s.fw, 100, 900);
  if (fw != null) add('text', 'font-weight', String(Math.round(fw / 100) * 100));
  const lh = num(s.lh, 0.8, 3);
  if (lh != null) add('text', 'line-height', String(Math.round(lh * 100) / 100));
  const ls = num(s.ls, -0.1, 0.5);
  if (ls != null) add('text', 'letter-spacing', `${Math.round(ls * 1000) / 1000}em`);
  add('outer', 'text-align', oneOf(s.ta, ['left', 'center', 'right', 'justify']));
  add('text', 'text-transform', oneOf(s.tt, ['none', 'uppercase', 'capitalize', 'lowercase']));
  // How it arranges what is inside it
  const gap = px(s.gap, 0, 200);
  if (kind === 'row') add('inner', '--lay-gap', gap);
  else if (kind === 'box' || kind === 'col' || kind === 'section') add('inner', 'gap', gap);
  if (kind === 'row') add('layout', 'align-items', { stretch: 'stretch', top: 'start', center: 'center', bottom: 'end' }[s.valign] || '');
  if (kind === 'col' || kind === 'section') {
    const cv = { top: 'flex-start', center: 'center', bottom: 'flex-end' }[s.cv];
    if (cv) { if (kind === 'section') add('layout', 'display', 'flex'); if (kind === 'section') add('layout', 'flex-direction', 'column'); add('layout', 'justify-content', cv); }
  }
  if (kind === 'box') {
    if (s.dir === 'row' || s.dir === 'column') add('layout', 'flex-direction', s.dir);
    add('layout', 'justify-content', { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }[s.justify] || '');
    add('layout', 'align-items', { stretch: 'stretch', start: 'flex-start', center: 'center', end: 'flex-end' }[s.items] || '');
  }
  if (kind === 'col' && phone) { const o = num(s.order, -12, 12); if (o != null) add('outer', 'order', String(Math.round(o))); }
  if (!phone && oneOf(s.anim, ANIMATIONS)) { const delay = num(s.animDelay, 0, 3); if (delay) add('outer', '--anim-delay', `${Math.round(delay * 10) / 10}s`); }
  return out;
}

// Hover changes → declarations for the piece's box/frame/text parts.
function hoverDecls(s = {}, theme = {}) {
  const out = { box: [], frame: [], text: [], icons: '' };
  const bg = cssColor(s.hbg);
  if (bg) {
    out.box.push(`background-color:${bg}`);
    if (!cssUrl(s.img)) out.box.push('background-image:none');
  }
  const color = cssColor(s.hcolor);
  if (color) out.text.push(`color:${color};--sec-text:${color};--sec-muted:color-mix(in srgb, ${color} 74%, transparent)`);
  else if (bg) {
    const l = lightness(bg, theme);
    if (l != null) {
      out.text.push(l < 0.36 ? LIGHT_TEXT : DARK_TEXT);
      // Icons inside stay visible on the new background.
      out.icons = l < 0.36 ? '#fff' : 'var(--c-primary)';
    }
  }
  const bc = cssColor(s.hbc);
  if (bc) out.frame.push(`border-color:${bc}`);
  if (oneOf(s.hshadow, SHADOW_KEYS)) out.frame.push(`box-shadow:${s.hshadow === 'none' ? 'none' : SHADOWS[s.hshadow]}`);
  const lift = num(s.hlift, 0, 24);
  const zoom = num(s.hzoom, 100, 120);
  const moves = [lift ? `translateY(-${Math.round(lift)}px)` : '', zoom && zoom !== 100 ? `scale(${Math.round(zoom) / 100})` : ''].filter(Boolean);
  if (moves.length) out.frame.push(`transform:${moves.join(' ')}`);
  return out;
}
const HOVER_EASE = 'transition:background-color .2s ease, color .2s ease, border-color .2s ease, box-shadow .2s ease, transform .2s ease';

const TABLET = '@media (max-width: 1023.98px)';
const PHONE = '@media (max-width: 759.98px)';
const rule = (sel, decls) => (decls.length ? `${sel}{${decls.join(';')}}` : '');
const obj = (v) => (v && typeof v === 'object' ? v : null);

// CSS for one piece. `sel` is its scoped selector; `parts` can send groups of
// settings to an inner part (for example { box: ' .btn', text: ' .btn' }).
// Settings for every screen come first, then the tablet changes, then the phone
// changes, so each smaller screen starts from the one above it.
export function pieceCSS(sel, design, mobile, { kind = 'el', theme = {}, parts = {}, inner = '', tablet } = {}) {
  const all = obj(design) || {};
  // Hover changes, only on screens with a mouse pointer. A part inside the piece
  // (a button) changes when the pointer is over that part.
  const hover = {};
  let icons = '';
  if (kind !== 'section' && kind !== 'row') {
    const hv = hoverDecls(all, theme);
    for (const part of ['box', 'frame', 'text']) if (hv[part].length) (hover[sel + (parts[part] || '')] ||= []).push(...hv[part]);
    icons = hv.icons;
  }
  const screens = [[obj(design), false, {}], [obj(tablet), true, all], [obj(mobile), true, { ...all, ...(obj(tablet) || {}) }]];
  const css = screens.map(([s, phone, base], i) => {
    if (!s) return [];
    const d = styleDecls(s, { kind, theme, phone, base });
    const by = {};
    for (const part of ['outer', 'box', 'frame', 'text', 'layout']) {
      const target = sel + (parts[part] || '');
      (by[target] ||= []).push(...d[part]);
    }
    if (d.inner.length) (by[sel + inner] ||= []).push(...d.inner);
    if (i === 0) for (const t of Object.keys(hover)) (by[t] ||= []).push(HOVER_EASE);
    return Object.entries(by).map(([t, decls]) => rule(t, decls)).filter(Boolean);
  });
  let hv = Object.entries(hover).map(([t, decls]) => rule(`${t}:hover`, decls)).join('');
  if (icons) hv += rule(`${sel + (parts.box || '')}:hover .lx-icon`, [`color:${icons}`]);
  return css[0].join('') + (css[1].length ? `${TABLET}{${css[1].join('')}}` : '') + (css[2].length ? `${PHONE}{${css[2].join('')}}` : '') + (hv ? `@media (hover: hover){${hv}}` : '');
}

// Visibility classes: hidden on computers, tablets and/or phones (the editor
// still shows them). Each screen follows the one above it unless set.
export function hideClasses(design, mobile, tablet) {
  const d = design?.hide === true;
  const t = tablet?.hide ?? d;
  const p = mobile?.hide ?? t;
  return `${d ? ' hide-d' : ''}${t === true ? ' hide-t' : ''}${p === true ? ' hide-m' : ''}`;
}

// Entrance animation classes (enhance.js plays them when they scroll into view).
export const animClass = (design) => (oneOf(design?.anim, ANIMATIONS) ? ` anim anim--${design.anim}` : '');

// A section id as a class name: x-<id>.
export const scopeClass = (id) => { const v = String(id || '').replace(/[^\w-]/g, ''); return v ? `x-${v}` : ''; };

// The section's own style (any section type, not only layouts).
export function sectionCSS(section, theme = {}) {
  const d = section?.data || {};
  const scope = scopeClass(section?.id);
  if (!scope || (!d.design && !d.mobile && !d.tablet)) return '';
  return pieceCSS(`.${scope}.${scope}`, d.design, d.mobile, { kind: 'section', theme, inner: ' > .lay', tablet: d.tablet });
}

// ----------------------------------------------------------------------------
// Rows and columns
// ----------------------------------------------------------------------------

// Column presets for a new row, in twelfths.
export const ROW_PRESETS = [[12], [6, 6], [4, 4, 4], [3, 3, 3, 3], [4, 8], [8, 4], [3, 9], [9, 3], [3, 6, 3], [5, 7], [7, 5]];
export const newCol = (span = 12, els = []) => ({ span, els });
export const newRow = (spans = [12]) => ({ cols: spans.map((s) => newCol(s)) });

const ROW_WIDTHS = ['contained', 'narrow', 'wide', 'full', 'edge'];
const MAX_DEPTH = 4;

// All of a layout's rows, columns and elements (box contents included), with
// their paths, for the editor's layers list and for checks.
export function walkLayout(d, fn) {
  const els = (list, path, depth) => (Array.isArray(list) ? list : []).forEach((el, i) => {
    const p = `${path}.els.${i}`;
    fn(el, p, 'el', depth);
    if (el?.type === 'box' && depth < MAX_DEPTH) els(el.els, p, depth + 1);
  });
  (Array.isArray(d?.rows) ? d.rows : []).forEach((row, r) => {
    fn(row, `rows.${r}`, 'row', 0);
    (Array.isArray(row?.cols) ? row.cols : []).forEach((col, c) => {
      fn(col, `rows.${r}.cols.${c}`, 'col', 0);
      els(col?.els, `rows.${r}.cols.${c}`, 1);
    });
  });
}

// The premade sections in a section: itself, or the ones placed in a layout's
// columns (widgets), as { type, data, path }. Lets the site find its blog page,
// FAQs and forms wherever they are.
export function blocksIn(sec) {
  if (!sec || typeof sec !== 'object') return [];
  if (sec.type !== 'layout') return [{ type: sec.type, data: sec.data || {}, path: '' }];
  const out = [];
  walkLayout(sec.data, (el, path, kind) => { if (kind === 'el' && typeof el?.type === 'string' && el.type.startsWith('w-')) out.push({ type: el.type.slice(2), data: el, path }); });
  return out;
}

// rows.0.cols.1.els.2 → n-0-1-2 (a piece's class inside its section).
export const nodeClass = (path) => `n-${String(path).split('.').filter((x) => /^\d+$/.test(x)).join('-')}`;

const spanOf = (v, fallback) => { const n = num(v, 1, 12); return n == null ? fallback : Math.round(n); };

// The name of a box that is a link: its first heading, button or line of text.
function boxLabel(box, depth = 0) {
  for (const el of Array.isArray(box?.els) ? box.els : []) {
    const t = el?.type === 'heading' ? el.text : el?.type === 'button' ? el.label : el?.type === 'text' ? String(el.html || '').replace(/<[^>]*>/g, ' ') : el?.type === 'box' && depth < MAX_DEPTH ? boxLabel(el, depth + 1) : '';
    const v = String(t || '').replace(/\s+/g, ' ').trim();
    if (v) return v.length > 90 ? `${v.slice(0, 88)}…` : v;
  }
  return '';
}

// A layout section's markup. `elements` is the element library: each entry has
// render(el, path, h) and optional parts (where box/text styles go inside it).
// The CSS is collected in h.css, which renderSection puts in one <style>.
export function renderLayout(d, h, elements) {
  const scope = scopeClass(h.secId);
  const theme = h.theme || {};
  const css = (path, design, mobile, opts) => { if (scope && (design || mobile || opts.tablet)) h.css.push(pieceCSS(`.${scope} .${nodeClass(path)}`, design, mobile, { theme, ...opts })); };
  const nodeAttrs = (path, kind) => (h.edit ? ` data-node="${path}" data-kind="${kind}"` : '');
  const renderEls = (list, path, depth) => (Array.isArray(list) ? list : []).map((el, i) => {
    const p = `${path}.els.${i}`;
    const def = el && elements[el.type];
    if (!def) return '';
    let body;
    let linked = '';
    if (el.type === 'box') {
      // A box shows even when empty: with a colour or a height it is a shape of its own.
      body = depth < MAX_DEPTH ? renderEls(el.els, p, depth + 1) : '';
      if (!body && h.edit) body = `<button type="button" class="lay__add" data-add-el="${p}">${h.icon('plus')}<span>Add to box</span></button>`;
      // A box with a link is clickable all over (links and buttons inside still work on their own).
      const href = String(el.href || '').trim();
      if (href && !h.edit) {
        body += `<a class="lx-cover" href="${esc(safeHref(href))}"${el.newTab ? ' target="_blank" rel="noopener"' : ''} aria-label="${esc(boxLabel(el) || 'Open')}"></a>`;
        linked = ' lx--linked';
      }
    } else {
      body = def.render(el, p, h);
      if (!body) return '';
    }
    css(p, el.design, el.mobile, { kind: el.type === 'box' ? 'box' : 'el', parts: def.parts || {}, tablet: el.tablet });
    const extra = def.cls ? def.cls(el) : '';
    return `<div class="lx lx--${el.type}${extra ? ` ${extra}` : ''}${linked} ${nodeClass(p)}${hideClasses(el.design, el.mobile, el.tablet)}${darkClass(el.design, theme)}${animClass(el.design)}"${nodeAttrs(p, 'el')}>${body}</div>`;
  }).join('');

  const rows = (Array.isArray(d.rows) ? d.rows : []).map((row, r) => {
    const rp = `rows.${r}`;
    const cols = Array.isArray(row?.cols) ? row.cols : [];
    const rs = row?.design || {};
    const width = oneOf(rs.width, ROW_WIDTHS) || 'contained';
    css(rp, row?.design, row?.mobile, { kind: 'row', tablet: row?.tablet });
    // Columns in reverse order when stacked (on tablets, and on phones unless they say otherwise).
    const tRev = row?.tablet?.reverse === true;
    const pRev = (row?.mobile?.reverse ?? tRev) === true;
    if (scope && (tRev || pRev)) {
      const orders = (rev) => cols.map((c, i) => `.${scope} .${nodeClass(`${rp}.cols.${i}`)}{order:${rev ? cols.length - i : 0}}`).join('');
      if (tRev) h.css.push(`${TABLET}{${orders(true)}}`);
      if (pRev !== tRev) h.css.push(`${PHONE}{${orders(pRev)}}`);
    }
    const inner = cols.map((col, c) => {
      const cp = `${rp}.cols.${c}`;
      css(cp, col?.design, col?.mobile, { kind: 'col', tablet: col?.tablet });
      let body = renderEls(col?.els, cp, 1);
      if (!body && h.edit) body = `<button type="button" class="lay__add" data-add-el="${cp}">${h.icon('plus')}<span>Add element</span></button>`;
      // A width for tablets only when one is set; otherwise tablets use the computer width.
      const tSpan = col?.tablet?.span != null && col.tablet.span !== '' ? ` lay__col--t${spanOf(col.tablet.span, 12)}` : '';
      return `<div class="lay__col lay__col--s${spanOf(col?.span, 12)}${tSpan} lay__col--m${spanOf(col?.mobile?.span, 12)} ${nodeClass(cp)}${hideClasses(col?.design, col?.mobile, col?.tablet)}${darkClass(col?.design, theme)}${animClass(col?.design)}"${nodeAttrs(cp, 'col')}>${body}</div>`;
    }).join('');
    return `<div class="wrap lay__row lay__row--${width} ${nodeClass(rp)}${hideClasses(rs, row?.mobile, row?.tablet)}${darkClass(rs, theme)}${animClass(rs)}"${nodeAttrs(rp, 'row')}>${inner}</div>`;
  }).join('');
  if (!rows) {
    return h.edit
      ? `<div class="wrap"><button type="button" class="lay__none" data-add-row>${h.icon('plus')}<strong>Empty layout</strong><small>Add a row of columns to start designing</small></button></div>`
      : '';
  }
  return `<div class="lay">${rows}</div>`;
}
