// Turns a premade section into a layout section that looks the same, so every
// part of it can be moved, styled and added to. Pure functions on site.json.
//
// Headings, text, buttons, images and cards become layout elements; parts that
// are one piece by nature (a form, the FAQ, the blog feed, a logo strip) become
// widgets (the same section inside a column). The section keeps its id, name,
// anchor, background, spacing and its own style.
import { BLOCKS, LAYOUT_ELEMENTS } from './blocks.js';
import { rich, markdown, safeSrc } from './render.js';
import { cleanHTML } from './layout.js';

const KEEP = ['bg', 'pad', 'bgImage', 'overlay', 'showOn', 'anchor', 'design', 'mobile', 'effect'];
const filled = (v) => String(v ?? '').trim() !== '';
const button = (b) => (b && filled(b.label) ? b : null);

// Formatted text (**bold**, links) → rich text HTML. Line breaks only show while
// editing in sections, so on the page they are spaces, as they were.
const html = (text) => (filled(text) ? cleanHTML(`<p>${rich(String(text).replace(/\s*\n\s*/g, ' '))}</p>`) : '');
const mdHTML = (text) => (filled(text) ? cleanHTML(markdown(text, safeSrc)) : '');

const el = {
  label: (text, design) => ({ type: 'heading', text, size: 'label', level: 'p', ...(design ? { design } : {}) }),
  heading: (text, size, design) => ({ type: 'heading', text, size, level: 'auto', ...(design ? { design } : {}) }),
  text: (text, size, design) => ({ type: 'text', html: html(text), size, ...(design ? { design } : {}) }),
  button: (b, style, size = 'lg') => ({ type: 'button', label: b.label, href: b.href || '', style, size }),
  buttons: (list, design) => {
    const els = list.filter(([b]) => button(b)).map(([b, style, size]) => el.button(b, style, size));
    if (!els.length) return [];
    return els.length === 1 && !design?.justify ? [{ ...els[0], ...(design?.mt != null ? { design: { mt: design.mt } } : {}) }] : [{ type: 'box', look: 'plain', design: { dir: 'row', gap: 12, ...design }, els }];
  },
};

// Eyebrow, heading and intro of a section, as its own centred row.
function headerRow(d, { align = 'center' } = {}) {
  const els = [];
  if (filled(d.eyebrow)) els.push(el.label(d.eyebrow, { mb: -6 }));
  if (filled(d.heading)) els.push(el.heading(d.heading, 'l'));
  if (filled(d.intro)) els.push(el.text(d.intro, 'l', { mt: -4, fs: 19 }));
  if (!els.length) return null;
  // As wide as a section header (720px of text plus the page margins).
  return { design: { width: 'narrow', maxW: 784, ...(align === 'center' ? { ta: 'center' } : {}) }, cols: [{ span: 12, els }] };
}

// A widget (the section inside a column) without the header that moved above it.
function widgetRow(type, d, { header = true, width } = {}) {
  const w = { ...d, type: `w-${type}` };
  for (const k of KEEP) delete w[k];
  delete w.elements;
  if (header) { w.eyebrow = ''; w.heading = ''; w.intro = ''; }
  return { ...(width ? { design: { width } } : {}), cols: [{ span: 12, els: [w] }] };
}

const CONVERT = {
  hero(d) {
    const split = d.layout === 'split';
    const copy = [];
    if (filled(d.eyebrow)) copy.push(el.label(d.eyebrow, { mb: -6 }));
    copy.push(el.heading(d.heading || '', 'hero'));
    if (filled(d.text)) copy.push(el.text(d.text, 'l', { mt: 2, maxW: 620, ...(split ? {} : { place: 'center' }) }));
    copy.push(...el.buttons([[d.primary, 'primary'], [d.secondary, 'ghost']], { mt: 12, ...(split ? {} : { justify: 'center' }) }));
    if (!split) return { rows: [{ cols: [{ span: 12, design: { ta: 'center' }, els: copy }] }] };
    const media = d.image
      ? { type: 'image', image: d.image, alt: d.imageAlt ?? d.heading ?? '', caption: '', ratio: 'auto', href: '', design: { shadow: 'lg' } }
      : { type: 'status', title: d.cardTitle || '', items: (d.highlights || []).map((it) => ({ text: it?.text || '' })) };
    return { rows: [{ design: { valign: 'center', gap: 64 }, mobile: { gap: 40 }, cols: [{ span: 7, els: copy }, { span: 5, els: [media] }] }] };
  },
  services(d) {
    const cols = Number(d.columns) || 3;
    const card = d.style !== 'plain';
    const items = (d.items || []).map((it) => {
      const els = [
        { type: 'icon', icon: it.icon || 'sparkle', look: 'soft', design: { mb: 12 } },
        el.heading(it.title || '', 's'),
        el.text(it.text || '', 's'),
      ];
      return { span: 12 / cols, mobile: cols === 4 ? { span: 6 } : {}, els: [card ? { type: 'box', look: 'card', design: { gap: 8 }, els } : { type: 'box', look: 'plain', design: { gap: 8 }, els }] };
    });
    return { rows: [headerRow(d), items.length && { design: { gap: 28 }, mobile: { gap: 16 }, cols: items }].filter(Boolean) };
  },
  split(d) {
    const copy = [];
    if (filled(d.eyebrow)) copy.push(el.label(d.eyebrow, { mb: -6 }));
    if (filled(d.heading)) copy.push(el.heading(d.heading, 'l'));
    if (filled(d.text)) copy.push(el.text(d.text, 'm', { mt: -2 }));
    const bullets = (d.bullets || []).filter((b) => filled(b?.text));
    if (bullets.length) copy.push({ type: 'checklist', style: 'circle', items: bullets.map((b) => ({ text: b.text })), design: { mt: 4 } });
    copy.push(...el.buttons([[d.button, 'primary', 'md']], { mt: 12 }));
    const media = d.image
      ? { type: 'image', image: d.image, alt: d.imageAlt ?? d.heading ?? '', caption: '', ratio: 'landscape', href: '', design: { shadow: 'lg' } }
      : { type: 'panel', icon: d.panelIcon || 'cpu', text: d.panelText || '' };
    const left = d.side === 'left';
    const cols = [{ span: 6, els: copy }, { span: 6, els: [media] }];
    return { rows: [{ design: { valign: 'center', gap: 72 }, mobile: { gap: 40, ...(left ? { reverse: true } : {}) }, cols: left ? cols.reverse() : cols }] };
  },
  cta(d) {
    const copy = [el.heading(d.heading || '', 'l', { fs: 40 })];
    if (filled(d.text)) copy.push(el.text(d.text, 'm', { mt: -8 }));
    const btns = el.buttons([[d.primary, 'light'], [d.secondary, 'ghost']], { justify: 'end' });
    // On the right on computers, under the text on phones.
    if (btns[0]) btns[0].mobile = { justify: 'start' };
    return { rows: [{ design: { valign: 'center', gap: 32 }, cols: [{ span: 8, design: { maxW: 680 }, els: copy }, { span: 4, els: btns }] }] };
  },
  text(d) {
    const els = [];
    if (filled(d.eyebrow)) els.push(el.label(d.eyebrow, { mb: -6 }));
    if (filled(d.heading)) els.push(el.heading(d.heading, 'l'));
    if (filled(d.text)) els.push({ type: 'text', html: mdHTML(d.text), size: 'm' });
    return { rows: [{ design: { width: 'narrow', ...(d.align === 'center' ? { ta: 'center' } : {}) }, cols: [{ span: 12, els }] }] };
  },
  image(d) {
    if (!d.image) return { rows: [] };
    return { rows: [{ design: d.width === 'narrow' ? { width: 'narrow' } : {}, cols: [{ span: 12, els: [{ type: 'image', image: d.image, alt: d.imageAlt || '', caption: d.caption || '', ratio: 'auto', href: '' }] }] }] };
  },
  video(d) {
    return { rows: [headerRow(d), { design: d.width === 'narrow' ? { width: 'narrow' } : {}, cols: [{ span: 12, els: [{ type: 'video', url: d.url || '', caption: d.caption || '' }] }] }].filter(Boolean) };
  },
  blank() { return { rows: [] }; },
};

// Sections that become a header row and a widget, and the ones kept whole.
const WITH_HEADER = { gallery: {}, map: {}, team: {}, blogfeed: {}, checklist: {}, steps: {}, testimonials: {}, pricing: {}, faq: { width: 'narrow' }, booking: {}, resources: {} };
const WHOLE = ['logos', 'stats', 'contact', 'quote'];

// The section's own elements (Elements under its content) as a row of their own.
function elementsRow(list) {
  const els = (Array.isArray(list) ? list : []).map((e) => {
    if (!e || typeof e !== 'object') return null;
    const { align, width, ...rest } = e;
    const design = align === 'center' || align === 'right' ? { ta: align } : undefined;
    if (e.type === 'heading') return { ...el.heading(e.text || '', { small: 's', large: 'l' }[e.size] || 'm'), ...(design ? { design } : {}) };
    if (e.type === 'text') return { type: 'text', html: mdHTML(e.text), size: 'm', ...(design ? { design } : {}) };
    if (e.type === 'image') return { type: 'image', image: e.image || '', alt: e.alt || '', caption: e.caption || '', ratio: 'auto', href: '', ...(design ? { design } : {}) };
    if (e.type === 'button') return { type: 'button', label: e.label || '', href: e.href || '', style: e.style || 'primary', size: 'md', ...(design ? { design } : {}) };
    return LAYOUT_ELEMENTS[e.type] ? { ...rest, ...(design ? { design } : {}) } : null;
  }).filter(Boolean);
  return els.length ? { cols: [{ span: 12, els }] } : null;
}

export const canConvert = (sec) => !!sec && sec.type !== 'layout' && !!BLOCKS[sec.type] && (!!CONVERT[sec.type] || !!WITH_HEADER[sec.type] || WHOLE.includes(sec.type));

// A layout section that looks like `sec` (or sec itself when it can't be converted).
export function convertSection(sec) {
  if (!canConvert(sec)) return sec;
  // Only what the section really has: missing fields show nothing in the section either.
  const d = { ...(sec.data || {}) };
  let rows;
  if (CONVERT[sec.type]) ({ rows } = CONVERT[sec.type](d));
  else if (WITH_HEADER[sec.type]) rows = [headerRow(d), widgetRow(sec.type, d, WITH_HEADER[sec.type])].filter(Boolean);
  else rows = [widgetRow(sec.type, d, { header: false })];
  const extra = elementsRow(sec.data?.elements);
  if (extra) rows.push(extra);
  const data = { rows };
  for (const k of KEEP) if (sec.data?.[k] != null && sec.data[k] !== '') data[k] = sec.data[k];
  // The home page header's glow and grid come along as the section's background effect.
  if (sec.type === 'hero' && data.bg === 'dark' && !data.effect) data.effect = 'glow';
  const out = { ...sec, type: 'layout', data };
  return JSON.parse(JSON.stringify(out));
}
