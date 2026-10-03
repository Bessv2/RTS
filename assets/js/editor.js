// Visual site editor. Edits content/site.json through a live canvas.
import { BLOCKS, STYLE_FIELDS, BLOCK_GROUPS } from './blocks.js';
import { renderPage, renderSection, themeCSS, fontsHref, getPath, setPath, esc, pageHref, THEME_PRESETS, FONTS } from './render.js';
import { icon, ICON_NAMES } from './icons.js';
import { publishToGitHub } from './publish.js';

// Refuse to run inside another site's frame (clickjacking protection;
// GitHub Pages can't send X-Frame-Options headers).
if (window.top !== window.self) {
  document.body.innerHTML = '<p style="padding:40px;font-family:system-ui">The editor can only be opened directly.</p>';
  throw new Error('Editor must not be framed');
}

const DRAFT_KEY = 'rts-editor-draft';
const GH_KEY = 'rts-editor-github';
const DEFAULT_REPO = { owner: 'Bessv2', repo: 'RTS', branch: 'main' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = (p = 's') => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const clone = (v) => JSON.parse(JSON.stringify(v));

const state = {
  doc: null, page: 0, sel: null, tab: 'add', device: 'desktop',
  history: [], future: [], snap: '', published: '',
  open: new Set(), commitTimer: 0,
};

// ---------------------------------------------------------------------------
// DOM helper
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
}
const put = (node, ...kids) => { node.append(...kids.filter((k) => k != null && k !== false)); return node; };
const ico = (name) => el('span', { 'data-icon': name, html: icon(name) });
function hydrateIcons(root = document) { $$('[data-icon]:empty', root).forEach((n) => { n.innerHTML = icon(n.dataset.icon); }); }

// ---------------------------------------------------------------------------
// Document helpers
const page = () => state.doc.pages[state.page];
const sections = () => page().sections;
const findSection = (id) => sections().find((s) => s.id === id);
const isChrome = (id) => id === '__header' || id === '__footer';
const targetFor = (id) => (isChrome(id) ? state.doc.site : findSection(id)?.data);

function newSection(type, overrides = {}) {
  return { id: uid(), type, data: { ...BLOCKS[type].defaults(), ...overrides } };
}

function sectionSummary(sec) {
  const d = sec.data || {};
  return d.heading || d.items?.[0]?.title || d.items?.[0]?.value || d.caption || d.text || '';
}

// ---------------------------------------------------------------------------
// History + drafts
function commit() {
  clearTimeout(state.commitTimer);
  state.commitTimer = 0;
  const s = JSON.stringify(state.doc);
  if (s === state.snap) return;
  state.history.push(state.snap);
  if (state.history.length > 150) state.history.shift();
  state.future = [];
  state.snap = s;
  saveDraft(s);
  updateTopbar();
}
function commitSoon() { clearTimeout(state.commitTimer); state.commitTimer = setTimeout(commit, 500); }
function flushCommit() { if (state.commitTimer) commit(); }

function saveDraft(s = JSON.stringify(state.doc)) {
  try {
    if (s === state.published) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, `{"savedAt":${Date.now()},"doc":${s}}`);
  } catch {
    toast('Draft is too large to save in this browser — try smaller images, or publish now.', { error: true });
  }
}

function restore(snap) {
  state.doc = JSON.parse(snap);
  state.snap = snap;
  state.page = Math.min(state.page, state.doc.pages.length - 1);
  if (state.sel && !isChrome(state.sel) && !findSection(state.sel)) state.sel = null;
  saveDraft(snap);
  refreshAll();
}
function undo() { flushCommit(); if (!state.history.length) return; state.future.push(state.snap); restore(state.history.pop()); }
function redo() { if (!state.future.length) return; state.history.push(state.snap); restore(state.future.pop()); }

// ---------------------------------------------------------------------------
// Canvas
const frame = $('#canvas');
const cdoc = () => frame.contentDocument;

function canvasHTML() {
  const t = state.doc.theme || {};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <base href="${esc(new URL('.', location.href).href)}">
    <link id="theme-fonts" rel="stylesheet" href="${esc(fontsHref(t))}">
    <link rel="stylesheet" href="assets/css/site.css"><link rel="stylesheet" href="assets/css/editor-canvas.css">
    <style id="theme-vars">${themeCSS(t)}</style></head>
    <body class="edit-mode"><div id="app"></div></body></html>`;
}

function initCanvas() {
  return new Promise((resolve) => {
    frame.addEventListener('load', function onLoad() {
      const d = cdoc();
      if (!d?.getElementById('app')) return; // initial about:blank
      frame.removeEventListener('load', onLoad);
      d.addEventListener('click', onCanvasClick, true);
      d.addEventListener('input', onCanvasInput);
      d.addEventListener('keydown', onCanvasKey);
      d.addEventListener('paste', onCanvasPaste);
      d.addEventListener('focusout', () => flushCommit());
      d.addEventListener('submit', (e) => e.preventDefault(), true);
      resolve();
    });
    frame.srcdoc = canvasHTML();
  });
}

function makeEditable(root) {
  $$('[data-edit]', root).forEach((n) => {
    try { n.contentEditable = 'plaintext-only'; } catch { n.contentEditable = 'true'; }
    n.spellcheck = true;
  });
}

function renderCanvas({ keepScroll = true } = {}) {
  const d = cdoc();
  if (!d?.getElementById('app')) return;
  const y = d.defaultView.scrollY;
  const app = d.getElementById('app');
  app.innerHTML = renderPage(state.doc, state.page, { edit: true });
  makeEditable(app);
  decorateSelection();
  d.defaultView.scrollTo(0, keepScroll ? y : 0);
}

function refreshSection(id) {
  if (isChrome(id)) { renderCanvas(); return; }
  const d = cdoc();
  const old = d.querySelector(`[data-section-id="${CSS.escape(id)}"]`);
  const sec = findSection(id);
  if (!old || !sec) { renderCanvas(); return; }
  const tmp = d.createElement('div');
  tmp.innerHTML = renderSection(sec, { edit: true, site: state.doc });
  const fresh = tmp.firstElementChild;
  old.replaceWith(fresh);
  makeEditable(fresh);
  decorateSelection();
}

function applyTheme() {
  const d = cdoc();
  const t = state.doc.theme || {};
  d.getElementById('theme-vars').textContent = themeCSS(t);
  const link = d.getElementById('theme-fonts');
  const href = fontsHref(t);
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

function decorateSelection() {
  const d = cdoc();
  $$('.ed-chip, .ed-tools, .ed-add', d).forEach((n) => n.remove());
  $$('.is-selected', d).forEach((n) => n.classList.remove('is-selected'));
  if (!state.sel) return;
  const node = d.querySelector(`[data-section-id="${CSS.escape(state.sel)}"]`);
  if (!node) return;
  node.classList.add('is-selected');
  const chip = d.createElement('div');
  chip.className = 'ed-chip';
  chip.textContent = node.dataset.label;
  node.append(chip);
  if (isChrome(state.sel)) return;
  const i = sections().findIndex((s) => s.id === state.sel);
  const hidden = findSection(state.sel).hidden;
  const tools = d.createElement('div');
  tools.className = 'ed-tools';
  tools.innerHTML = [
    ['up', 'chevron-up', 'Move up', i === 0], ['down', 'chevron-down', 'Move down', i === sections().length - 1],
    ['duplicate', 'copy', 'Duplicate'], ['hide', hidden ? 'eye' : 'eye-off', hidden ? 'Show on live site' : 'Hide on live site'],
    ['settings', 'sliders', 'Edit settings'], ['delete', 'trash', 'Delete'],
  ].map(([t, ic, title, dis]) => `<button type="button" data-tool="${t}" title="${title}"${dis ? ' disabled' : ''}>${icon(ic)}</button>`).join('');
  node.append(tools);
  const add = d.createElement('button');
  add.type = 'button';
  add.className = 'ed-add';
  add.dataset.tool = 'add';
  add.innerHTML = `${icon('plus')}Add section`;
  node.append(add);
}

function scrollToSection(id, flash = false) {
  const node = cdoc()?.querySelector(`[data-section-id="${CSS.escape(id)}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (flash) { node.classList.add('ed-flash'); setTimeout(() => node.classList.remove('ed-flash'), 1000); }
}

function onCanvasClick(e) {
  const tool = e.target.closest('[data-tool]');
  if (tool) {
    e.preventDefault();
    e.stopPropagation();
    if (!tool.disabled) runTool(tool.dataset.tool, state.sel);
    return;
  }
  if (e.target.closest('a, summary, button')) e.preventDefault();
  const sec = e.target.closest('[data-section-id]');
  const id = sec?.dataset.sectionId || null;
  if (id !== state.sel) select(id);
}

function onCanvasInput(e) {
  const n = e.target.closest?.('[data-edit]');
  if (!n) return;
  const id = n.closest('[data-section-id]')?.dataset.sectionId;
  const target = targetFor(id);
  if (!target) return;
  let value = n.innerText;
  value = n.hasAttribute('data-ml') ? value.replace(/\n$/, '') : value.replace(/\s*\n\s*/g, ' ');
  if (value === '' && n.innerHTML !== '') n.innerHTML = ''; // so the placeholder reappears
  setPath(target, n.dataset.edit, value);
  if (state.sel !== id) select(id, { quiet: true });
  const input = $(`#inspector [data-path="${CSS.escape(n.dataset.edit)}"]`);
  if (input && document.activeElement !== input) input.value = value;
  if (id === '__header' && n.dataset.edit === 'name') {
    const fb = cdoc().querySelector('.site-footer .brand__name');
    if (fb) fb.textContent = value;
  }
  commitSoon();
}

function onCanvasKey(e) {
  const n = e.target.closest?.('[data-edit]');
  if (n) {
    if (e.key === 'Escape' || (e.key === 'Enter' && !n.hasAttribute('data-ml'))) { e.preventDefault(); n.blur(); }
    if ((e.metaKey || e.ctrlKey) && /^[zy]$/i.test(e.key)) { /* let browser undo inside text */ return; }
    return;
  }
  onGlobalKey(e);
}

function onCanvasPaste(e) {
  const n = e.target.closest?.('[data-edit]');
  if (!n || n.contentEditable === 'plaintext-only') return;
  e.preventDefault();
  cdoc().execCommand('insertText', false, e.clipboardData.getData('text/plain'));
}

// ---------------------------------------------------------------------------
// Selection + section operations
function select(id, { quiet = false, scroll = false } = {}) {
  flushCommit();
  state.sel = id;
  decorateSelection();
  renderInspector();
  if (state.tab === 'layers') renderPanel();
  if (scroll && id) scrollToSection(id);
  if (!quiet && id && isChrome(id)) { /* header/footer use the site panel */ }
}

function insertIndex() {
  const i = sections().findIndex((s) => s.id === state.sel);
  return i === -1 ? sections().length : i + 1;
}

function addSection(type) {
  const sec = newSection(type, type === 'hero' && state.page > 0 ? { layout: 'center', pad: 'normal' } : {});
  const at = state.sel === '__header' ? 0 : insertIndex();
  sections().splice(at, 0, sec);
  commit();
  state.sel = sec.id;
  renderCanvas();
  renderInspector();
  renderPanel();
  setTimeout(() => scrollToSection(sec.id, true), 30);
  toast(`${BLOCKS[type].label} added`);
}

function runTool(tool, id) {
  const list = sections();
  const i = list.findIndex((s) => s.id === id);
  if (tool === 'add') { setTab('add'); return; }
  if (tool === 'settings') { $('#inspector').scrollTop = 0; $('#inspector .in, #inspector textarea')?.focus(); return; }
  if (i === -1) return;
  if (tool === 'up' || tool === 'down') {
    const j = tool === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commit(); renderCanvas(); renderPanel();
    setTimeout(() => scrollToSection(id), 20);
  } else if (tool === 'duplicate') {
    const copy = clone(list[i]);
    copy.id = uid();
    list.splice(i + 1, 0, copy);
    state.sel = copy.id;
    commit(); renderCanvas(); renderPanel(); renderInspector();
    setTimeout(() => scrollToSection(copy.id, true), 20);
  } else if (tool === 'hide') {
    list[i].hidden = !list[i].hidden;
    commit(); refreshSection(id); renderPanel(); renderInspector();
    toast(list[i].hidden ? 'Section hidden on the live site' : 'Section visible again');
  } else if (tool === 'delete') {
    const label = BLOCKS[list[i].type]?.label || 'Section';
    list.splice(i, 1);
    state.sel = null;
    commit(); renderCanvas(); renderPanel(); renderInspector();
    toast(`${label} deleted`, { action: 'Undo', onAction: undo });
  }
}

// ---------------------------------------------------------------------------
// Inspector (right panel)
const SITE_FIELDS = [
  { key: 'name', label: 'Business name', type: 'text' },
  { key: 'logo', label: 'Logo image', type: 'image', help: 'Optional. Wide logos look best around 36px tall.' },
  { key: 'logoIcon', label: 'Logo icon (when no image)', type: 'icon', when: (d) => !d.logo },
  { key: 'headerStyle', label: 'Header style', type: 'segmented', options: [['light', 'Light'], ['dark', 'Dark']] },
  { key: 'headerCta', label: 'Header button', type: 'button' },
  { key: 'tagline', label: 'Footer tagline', type: 'textarea' },
  { key: 'footerText', label: 'Footer note', type: 'text' },
];

function renderInspector() {
  const box = $('#inspector');
  const scroll = box.scrollTop;
  box.replaceChildren();
  if (!state.sel) {
    box.append(el('div', { class: 'empty' },
      el('span', { class: 'empty__icon' }, ico('sparkle')),
      el('h3', {}, 'Select something to edit'),
      el('p', {}, 'Click any section on the page. Click text to type directly on the page.'),
      el('div', { class: 'kbd-list' },
        el('div', {}, 'Undo / Redo', el('span', {}, el('kbd', {}, 'Ctrl Z'), ' ', el('kbd', {}, 'Ctrl ⇧ Z'))),
        el('div', {}, 'Delete section', el('kbd', {}, 'Del')),
        el('div', {}, 'Deselect', el('kbd', {}, 'Esc')),
        el('div', {}, 'Save draft', el('kbd', {}, 'Ctrl S')))));
    return;
  }
  if (isChrome(state.sel)) {
    box.append(el('div', { class: 'p-head' }, el('h2', {}, ico('layout'), 'Header & footer')));
    const body = el('div', { class: 'p-body' }, el('p', { class: 'p-hint' }, 'These appear on every page. Navigation links come from your Pages.'));
    renderFields(body, SITE_FIELDS, state.doc.site, () => renderCanvas());
    box.append(body);
    box.scrollTop = scroll;
    return;
  }
  const sec = findSection(state.sel);
  const block = BLOCKS[sec.type];
  box.append(el('div', { class: 'p-head' },
    el('h2', {}, ico(block.icon), block.label),
    el('div', { class: 'insp-actions' },
      el('button', { class: 'ed-icon-btn ed-icon-btn--sm', title: sec.hidden ? 'Show on live site' : 'Hide on live site', onclick: () => runTool('hide', sec.id) }, ico(sec.hidden ? 'eye' : 'eye-off')),
      el('button', { class: 'ed-icon-btn ed-icon-btn--sm', title: 'Duplicate', onclick: () => runTool('duplicate', sec.id) }, ico('copy')),
      el('button', { class: 'ed-icon-btn ed-icon-btn--sm ed-icon-btn--danger', title: 'Delete', onclick: () => runTool('delete', sec.id) }, ico('trash')))));
  const groups = [['Content', block.fields, true], ['Section style', STYLE_FIELDS, true]];
  for (const [title, fields, open] of groups) {
    const inner = el('div');
    renderFields(inner, fields, sec.data, () => refreshSection(sec.id));
    box.append(el('details', { class: 'insp-group', open }, el('summary', {}, title, el('span', { class: 'chev' }, ico('chevron-down'))), inner));
  }
  box.scrollTop = scroll;
}

// Builds form controls for a field schema. `onRender` refreshes the canvas.
function renderFields(container, fields, target, onRender, base = '') {
  const rebuild = () => renderInspector();
  const change = (path, value, { structural = false, soon = false } = {}) => {
    setPath(target, path, value);
    onRender();
    if (soon) commitSoon(); else commit();
    if (structural) rebuild();
  };
  for (const f of fields) {
    if (f.when && !f.when(base ? getPath(target, base.slice(0, -1)) : target)) continue;
    const path = base + (f.key || '');
    const val = f.key ? getPath(target, path) : undefined;
    container.append(fieldControl(f, path, val, change, target, onRender));
  }
}

function linkSuggestions() {
  let dl = $('#link-suggest');
  if (!dl) { dl = el('datalist', { id: 'link-suggest' }); document.body.append(dl); }
  const opts = [];
  state.doc.pages.forEach((p, i) => opts.push([pageHref(p, i), `Page: ${p.title}`]));
  state.doc.pages.forEach((p) => p.sections.forEach((s) => s.data?.anchor && opts.push([`#${s.data.anchor}`, `Section on current page: ${s.data.anchor}`])));
  if (state.doc.site.email) opts.push([`mailto:${state.doc.site.email}`, 'Email']);
  if (state.doc.site.phone) opts.push([`tel:${state.doc.site.phone.replace(/[^+\d]/g, '')}`, 'Phone']);
  dl.replaceChildren(...[...new Map(opts)].map(([v, l]) => el('option', { value: v, label: l })));
  return 'link-suggest';
}

function fieldControl(f, path, val, change, target, onRender) {
  const wrap = el('div', { class: 'f' });
  const label = f.label ? el('label', {}, f.label) : null;
  const help = f.help ? el('p', { class: 'f__help' }, f.help) : null;
  switch (f.type) {
    case 'note':
      return el('p', { class: 'note' }, f.text);
    case 'text':
    case 'link': {
      const input = el('input', { class: 'in', type: 'text', value: val ?? '', 'data-path': path, list: f.type === 'link' ? linkSuggestions() : null,
        oninput: (e) => change(path, e.target.value, { soon: true }) });
      put(wrap, label, input, help);
      return wrap;
    }
    case 'textarea': {
      const ta = el('textarea', { rows: 3, 'data-path': path, oninput: (e) => change(path, e.target.value, { soon: true }) });
      ta.value = val ?? '';
      put(wrap, label, ta, help);
      return wrap;
    }
    case 'select': {
      const s = el('select', { onchange: (e) => change(path, e.target.value, { structural: true }) },
        f.options.map(([v, l]) => el('option', { value: v, selected: String(val) === v }, l)));
      put(wrap, label, s, help);
      return wrap;
    }
    case 'segmented': {
      const seg = el('div', { class: 'ed-seg ed-seg--full' }, f.options.map(([v, l]) =>
        el('button', { type: 'button', class: String(val) === v ? 'is-on' : '', onclick: () => change(path, v, { structural: true }) }, l)));
      put(wrap, el('span', { class: 'f__label' }, f.label), seg, help);
      return wrap;
    }
    case 'swatches': {
      const colors = { light: 'var(--sw-bg)', alt: 'var(--sw-surface)', dark: 'var(--sw-dark)', brand: 'var(--sw-primary)' };
      const t = { ...THEME_PRESETS.midnight, ...state.doc.theme };
      const real = { light: t.bg, alt: t.surface, dark: t.dark, brand: t.primary };
      const row = el('div', { class: 'sw-row' }, f.options.map(([v, l]) =>
        el('button', { type: 'button', class: `sw${val === v ? ' is-on' : ''}`, title: l, onclick: () => change(path, v, { structural: true }) },
          el('i', { style: `background:${real[v] || colors[v]}` }), l)));
      put(wrap, el('span', { class: 'f__label' }, f.label), row);
      return wrap;
    }
    case 'toggle': {
      const lab = el('label', { class: 'switch' }, f.label, el('input', { type: 'checkbox', checked: !!val, onchange: (e) => change(path, e.target.checked, { structural: true }) }));
      put(wrap, lab, help);
      return wrap;
    }
    case 'color': {
      const hex = el('input', { class: 'in', type: 'text', value: val || '', maxlength: 7 });
      const pick = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(val) ? val : '#000000' });
      pick.addEventListener('input', () => { hex.value = pick.value; change(path, pick.value, { soon: true }); });
      hex.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { pick.value = hex.value; change(path, hex.value); } else hex.value = getPath(target, path); });
      put(wrap, label, el('div', { class: 'color' }, pick, hex));
      return wrap;
    }
    case 'button': {
      const b = val || {};
      const lbl = el('input', { class: 'in', type: 'text', placeholder: 'Button text (empty = hidden)', value: b.label || '', 'data-path': `${path}.label`,
        oninput: (e) => change(`${path}.label`, e.target.value, { soon: true }) });
      const url = el('input', { class: 'in', type: 'text', placeholder: 'Link: #/contact, https://…', value: b.href || '', list: linkSuggestions(),
        oninput: (e) => change(`${path}.href`, e.target.value, { soon: true }) });
      put(wrap, el('span', { class: 'f__label' }, f.label), el('div', { class: 'f-btn' }, lbl, el('div', { class: 'f-btn__url' }, ico('link'), url)), help);
      return wrap;
    }
    case 'icon': {
      const det = el('details', { class: 'icon-pick' },
        el('summary', {}, ico(val || 'sparkle'), (val || 'Choose icon').replace(/-/g, ' '), el('span', { class: 'chev' }, ico('chevron-down'))),
        el('div', { class: 'icon-grid' }, ICON_NAMES.map((n) =>
          el('button', { type: 'button', title: n, class: n === val ? 'is-on' : '', onclick: () => change(path, n, { structural: true }) }, ico(n)))));
      put(wrap, el('span', { class: 'f__label' }, f.label), det);
      return wrap;
    }
    case 'image': {
      const preview = el('div', { class: `img-field__preview${val ? ' has-img' : ''}`, style: val ? `background-image:url("${String(val).replace(/"/g, '%22')}")` : '' }, val ? '' : 'No image');
      const file = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
        const f0 = e.target.files[0];
        if (!f0) return;
        try { change(path, await imageToDataURL(f0), { structural: true }); } catch (err) { toast(err.message, { error: true }); }
      } });
      const url = el('input', { class: 'in', type: 'text', placeholder: 'or paste an image URL', value: String(val || '').startsWith('data:') ? '' : (val || ''),
        onchange: (e) => change(path, e.target.value.trim(), { structural: true }) });
      put(wrap, el('span', { class: 'f__label' }, f.label), el('div', { class: 'img-field' }, preview,
        el('div', { class: 'img-field__btns' },
          el('button', { type: 'button', class: 'ed-btn ed-btn--sm', onclick: () => file.click() }, ico('upload'), val ? 'Replace' : 'Upload'),
          val ? el('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--danger', onclick: () => change(path, '', { structural: true }) }, ico('trash'), 'Remove') : null),
        url, file), help);
      return wrap;
    }
    case 'list': {
      const items = Array.isArray(val) ? val : [];
      const list = el('div', { class: 'list-f' });
      items.forEach((item, i) => {
        const key = `${state.sel}:${path}.${i}`;
        const isOpen = state.open.has(key);
        const move = (dir) => {
          const j = i + dir;
          if (j < 0 || j >= items.length) return;
          [items[i], items[j]] = [items[j], items[i]];
          state.open.delete(key);
          change(path, items, { structural: true });
        };
        const head = el('div', { class: 'list-item__head', onclick: (e) => {
          if (e.target.closest('button')) return;
          if (isOpen) state.open.delete(key); else state.open.add(key);
          renderInspector();
        } },
        el('span', { class: 'chev' }, ico('chevron-right')),
        el('span', { class: 't' }, String(item[f.itemLabel] || `Item ${i + 1}`)),
        el('button', { type: 'button', class: 'ed-icon-btn ed-icon-btn--sm', title: 'Move up', disabled: i === 0, onclick: () => move(-1) }, ico('chevron-up')),
        el('button', { type: 'button', class: 'ed-icon-btn ed-icon-btn--sm', title: 'Move down', disabled: i === items.length - 1, onclick: () => move(1) }, ico('chevron-down')),
        el('button', { type: 'button', class: 'ed-icon-btn ed-icon-btn--sm ed-icon-btn--danger', title: 'Remove', onclick: () => { items.splice(i, 1); state.open.clear(); change(path, items, { structural: true }); } }, ico('trash')));
        const node = el('div', { class: `list-item${isOpen ? ' is-open' : ''}` }, head);
        if (isOpen) {
          const body = el('div', { class: 'list-item__body' });
          renderFields(body, f.itemFields, target, onRender, `${path}.${i}.`);
          node.append(body);
        }
        list.append(node);
      });
      list.append(el('button', { type: 'button', class: 'list-add', onclick: () => {
        items.push(f.item());
        state.open.add(`${state.sel}:${path}.${items.length - 1}`);
        change(path, items, { structural: true });
      } }, ico('plus'), 'Add item'));
      put(wrap, el('span', { class: 'f__label' }, f.label, el('span', { class: 'badge' }, String(items.length))), list);
      return wrap;
    }
    default:
      return wrap;
  }
}

// Resize uploads so drafts stay small; SVGs are kept as-is.
async function imageToDataURL(file) {
  const read = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  if (file.type === 'image/svg+xml') {
    if (file.size > 400_000) throw new Error('That SVG is too large (max 400 KB).');
    return read(file);
  }
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) url = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
  return url;
}

// ---------------------------------------------------------------------------
// Left panel
const THUMBS = {
  hero: '<div class="thumb thumb--dark"><div class="t-row"><div style="display:grid;gap:4px"><i style="width:40%" class="t-acc"></i><i></i><i style="width:70%"></i><div class="t-row" style="width:60%"><i class="t-acc" style="height:8px"></i><i style="height:8px"></i></div></div><div class="t-box" style="height:36px"></div></div></div>',
  logos: '<div class="thumb"><div class="t-row"><i></i><i></i><i></i><i></i></div></div>',
  services: '<div class="thumb"><i style="width:40%;margin:0 auto" class="t-dark"></i><div class="t-row"><div class="t-box"></div><div class="t-box"></div><div class="t-box"></div></div></div>',
  split: '<div class="thumb"><div class="t-row"><div class="t-img"></div><div style="display:grid;gap:4px;align-content:center"><i class="t-dark"></i><i></i><i style="width:60%"></i></div></div></div>',
  stats: '<div class="thumb thumb--dark"><div class="t-row"><i class="t-acc" style="height:10px"></i><i class="t-acc" style="height:10px"></i><i class="t-acc" style="height:10px"></i></div><div class="t-row"><i></i><i></i><i></i></div></div>',
  checklist: '<div class="thumb"><div class="t-row"><i class="t-acc"></i><i class="t-acc"></i></div><div class="t-row"><i></i><i></i></div><div class="t-row"><i></i><i></i></div></div>',
  steps: '<div class="thumb"><div class="t-row"><div class="t-box"></div><div class="t-box"></div><div class="t-box"></div><div class="t-box"></div></div></div>',
  testimonials: '<div class="thumb"><div class="t-row"><div class="t-box" style="height:34px"></div><div class="t-box" style="height:34px"></div></div></div>',
  pricing: '<div class="thumb"><div class="t-row"><div class="t-box" style="height:40px"></div><div class="t-box" style="height:40px;border-color:#3b82f6"></div><div class="t-box" style="height:40px"></div></div></div>',
  faq: '<div class="thumb"><div class="t-box" style="height:9px"></div><div class="t-box" style="height:9px"></div><div class="t-box" style="height:9px"></div></div>',
  cta: '<div class="thumb thumb--brand"><div class="t-row" style="align-items:center"><div style="display:grid;gap:4px"><i></i><i style="width:60%"></i></div><i style="height:12px;background:#fff;flex:.5"></i></div></div>',
  contact: '<div class="thumb"><div class="t-row"><div style="display:grid;gap:4px;align-content:center"><i class="t-dark"></i><i></i><i></i></div><div class="t-box" style="height:44px"></div></div></div>',
  text: '<div class="thumb"><i class="t-dark" style="width:50%"></i><i></i><i></i><i style="width:70%"></i></div>',
  image: '<div class="thumb"><div class="t-img"></div></div>',
};

function setTab(tab) {
  state.tab = tab;
  $$('.ed-rail button').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === tab));
  renderPanel();
}

function renderPanel() {
  const box = $('#panel');
  const scroll = box.scrollTop;
  box.replaceChildren();
  ({ add: panelAdd, layers: panelLayers, pages: panelPages, theme: panelTheme, site: panelSite, help: panelHelp })[state.tab](box);
  box.scrollTop = scroll;
}

function panelHead(title, iconName, ...extra) { return el('div', { class: 'p-head' }, el('h2', {}, ico(iconName), title), ...extra); }

function panelAdd(box) {
  box.append(panelHead('Add a section', 'plus'));
  const body = el('div', { class: 'p-body' });
  const after = state.sel && !isChrome(state.sel) ? findSection(state.sel) : null;
  body.append(el('div', { class: 'p-callout' }, ico('arrow-right'),
    after ? `Adds after “${BLOCKS[after.type].label}”` : 'Adds to the end of the page',
    after ? el('button', { type: 'button', onclick: () => select(null) }, 'Add at end') : null));
  for (const g of BLOCK_GROUPS) {
    const entries = Object.entries(BLOCKS).filter(([, b]) => b.group === g);
    if (!entries.length) continue;
    body.append(el('p', { class: 'p-sub' }, g), el('div', { class: 'blocks' }, entries.map(([type, b]) =>
      el('button', { type: 'button', class: 'block-card', title: b.description, onclick: () => addSection(type) },
        el('div', { html: THUMBS[type] || '<div class="thumb"></div>' }),
        el('strong', {}, b.label, el('small', {}, b.description))))));
  }
  box.append(body);
}

function panelLayers(box) {
  box.append(panelHead(`Layers · ${page().title}`, 'layers'));
  const body = el('div', { class: 'p-body' }, el('p', { class: 'p-hint' }, 'Drag to reorder. Click to select.'));
  const list = el('ul', { class: 'layers' });
  const fixed = (id, label) => el('li', { class: `layer is-fixed${state.sel === id ? ' is-sel' : ''}`, onclick: () => select(id, { scroll: true }) },
    el('span', { class: 'layer__icon' }, ico('layout')), el('span', { class: 'layer__txt' }, el('strong', {}, label), el('small', {}, 'Shared on all pages')));
  list.append(fixed('__header', 'Header'));
  let dragId = null;
  sections().forEach((sec) => {
    const b = BLOCKS[sec.type];
    const li = el('li', { class: `layer${state.sel === sec.id ? ' is-sel' : ''}${sec.hidden ? ' is-hidden' : ''}`, draggable: 'true',
      onclick: (e) => { if (!e.target.closest('button')) select(sec.id, { scroll: true }); },
      ondragstart: (e) => { dragId = sec.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sec.id); },
      ondragover: (e) => {
        if (!dragId || dragId === sec.id) return;
        e.preventDefault();
        const r = li.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        li.classList.toggle('drop-before', before);
        li.classList.toggle('drop-after', !before);
      },
      ondragleave: () => li.classList.remove('drop-before', 'drop-after'),
      ondrop: (e) => {
        e.preventDefault();
        const before = li.classList.contains('drop-before');
        li.classList.remove('drop-before', 'drop-after');
        const arr = sections();
        const from = arr.findIndex((s) => s.id === dragId);
        const [moved] = arr.splice(from, 1);
        let to = arr.findIndex((s) => s.id === sec.id);
        if (!before) to += 1;
        arr.splice(to, 0, moved);
        dragId = null;
        commit(); renderCanvas(); renderPanel();
      },
    },
    el('span', { class: 'layer__grip' }, ico('grip')),
    el('span', { class: 'layer__icon' }, ico(b.icon)),
    el('span', { class: 'layer__txt' }, el('strong', {}, b.label), el('small', {}, sectionSummary(sec))),
    el('span', { class: 'layer__actions' },
      el('button', { type: 'button', class: 'ed-icon-btn ed-icon-btn--sm', title: sec.hidden ? 'Show' : 'Hide', onclick: () => runTool('hide', sec.id) }, ico(sec.hidden ? 'eye' : 'eye-off')),
      el('button', { type: 'button', class: 'ed-icon-btn ed-icon-btn--sm ed-icon-btn--danger', title: 'Delete', onclick: () => runTool('delete', sec.id) }, ico('trash'))));
    list.append(li);
  });
  list.append(fixed('__footer', 'Footer'));
  body.append(list);
  if (!sections().length) body.append(el('p', { class: 'p-hint', style: 'margin-top:12px' }, 'This page is empty — add a section from the Add tab.'));
  box.append(body);
}

function slugify(s) { return String(s).toLowerCase().trim().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function goToPage(i) {
  flushCommit();
  state.page = i;
  state.sel = null;
  renderCanvas({ keepScroll: false });
  renderInspector();
  renderPanel();
  updateTopbar();
}

function panelPages(box) {
  box.append(panelHead('Pages', 'file', el('button', { type: 'button', class: 'ed-btn ed-btn--sm', onclick: openAddPage }, ico('plus'), 'New')));
  const body = el('div', { class: 'p-body' }, el('p', { class: 'p-hint' }, 'The first page is your home page. Pages shown in navigation appear in the header and footer.'));
  const list = el('div', { class: 'pages' });
  state.doc.pages.forEach((p, i) => {
    const cur = i === state.page;
    const item = el('div', { class: `page-item${cur ? ' is-current' : ''}` },
      el('div', { class: 'page-item__row', onclick: (e) => { if (!e.target.closest('button') && !cur) goToPage(i); } },
        ico(i === 0 ? 'home' : 'file'), el('strong', {}, p.title), el('small', {}, i === 0 ? '/' : `/${p.slug}`),
        p.showInNav === false ? el('span', { class: 'badge' }, 'Hidden') : null));
    if (cur) {
      const b = el('div', { class: 'page-item__body' });
      const upd = (rerender = true) => { commitSoon(); if (rerender) renderCanvas(); updateTopbar(); };
      b.append(
        el('div', { class: 'f', style: 'margin-top:10px' }, el('label', {}, 'Page name'), el('input', { class: 'in', value: p.title, oninput: (e) => {
          const auto = p.slug === slugify(p.title);
          p.title = e.target.value;
          if (i > 0 && auto) { p.slug = slugify(p.title); const sl = $('.page-slug', b); if (sl) sl.value = p.slug; }
          upd();
        } })),
        i > 0 ? el('div', { class: 'f' }, el('label', {}, 'URL'), el('input', { class: 'in page-slug', value: p.slug, oninput: (e) => { p.slug = slugify(e.target.value) || `page-${i}`; upd(); },
          onchange: (e) => { e.target.value = p.slug; renderPanel(); } })) : null,
        el('div', { class: 'f' }, el('label', { class: 'switch' }, 'Show in navigation', el('input', { type: 'checkbox', checked: p.showInNav !== false, onchange: (e) => { p.showInNav = e.target.checked; commit(); renderCanvas(); renderPanel(); } }))),
        el('p', { class: 'p-sub' }, 'Search engines'),
        el('div', { class: 'f' }, el('label', {}, 'Page title'), el('input', { class: 'in', value: p.seoTitle || '', placeholder: `${p.title} | ${state.doc.site.name}`, oninput: (e) => { p.seoTitle = e.target.value; upd(false); } })),
        el('div', { class: 'f' }, el('label', {}, 'Description'), Object.assign(el('textarea', { rows: 3, placeholder: 'One or two sentences that describe this page.', oninput: (e) => { p.seoDescription = e.target.value; upd(false); } }), { value: p.seoDescription || '' })),
        el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
          el('button', { type: 'button', class: 'ed-btn ed-btn--sm', disabled: i <= 1, title: i === 0 ? 'Home stays first' : 'Move up', onclick: () => movePage(i, -1) }, ico('chevron-up')),
          el('button', { type: 'button', class: 'ed-btn ed-btn--sm', disabled: i === 0 || i === state.doc.pages.length - 1, title: 'Move down', onclick: () => movePage(i, 1) }, ico('chevron-down')),
          el('button', { type: 'button', class: 'ed-btn ed-btn--sm', onclick: () => duplicatePage(i) }, ico('copy'), 'Duplicate'),
          i > 0 ? el('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--danger', onclick: () => deletePage(i) }, ico('trash'), 'Delete') : null));
      item.append(b);
    }
    list.append(item);
  });
  body.append(list);
  box.append(body);
}

function uniqueSlug(base) {
  let s = base || 'page';
  let n = 2;
  while (state.doc.pages.some((p) => p.slug === s)) s = `${base}-${n++}`;
  return s;
}

function movePage(i, dir) {
  const j = i + dir;
  const ps = state.doc.pages;
  if (j < 1 || j >= ps.length || i < 1) return;
  [ps[i], ps[j]] = [ps[j], ps[i]];
  state.page = j;
  commit(); renderCanvas(); renderPanel(); updateTopbar();
}

function duplicatePage(i) {
  const copy = clone(state.doc.pages[i]);
  copy.id = uid('p');
  copy.title = `${copy.title} copy`;
  copy.slug = uniqueSlug(slugify(copy.title));
  copy.sections.forEach((s) => { s.id = uid(); });
  state.doc.pages.splice(i + 1, 0, copy);
  commit();
  goToPage(i + 1);
}

function deletePage(i) {
  const p = state.doc.pages[i];
  if (!confirm(`Delete the “${p.title}” page? You can undo this.`)) return;
  state.doc.pages.splice(i, 1);
  commit();
  goToPage(Math.max(0, i - 1));
  toast(`Page “${p.title}” deleted`, { action: 'Undo', onAction: undo });
}

const PAGE_TEMPLATES = {
  blank: { label: 'Blank', desc: 'Just a header section', sections: ['hero'] },
  services: { label: 'Services', desc: 'Grid, FAQ, call to action', sections: ['hero', 'services', 'faq', 'cta'] },
  about: { label: 'About', desc: 'Story, skills, stats', sections: ['hero', 'split', 'checklist', 'stats'] },
  landing: { label: 'Landing', desc: 'Full marketing page', sections: ['hero', 'logos', 'services', 'stats', 'steps', 'cta'] },
  pricing: { label: 'Pricing', desc: 'Plans and FAQ', sections: ['hero', 'pricing', 'faq'] },
  contact: { label: 'Contact', desc: 'Contact details + form', sections: ['contact'] },
};

function openAddPage() {
  let tpl = 'blank';
  const name = el('input', { class: 'in', placeholder: 'e.g. Pricing', value: '' });
  const grid = el('div', { class: 'templates' });
  const paint = () => grid.replaceChildren(...Object.entries(PAGE_TEMPLATES).map(([k, t]) =>
    el('button', { type: 'button', class: `tpl${k === tpl ? ' is-on' : ''}`, onclick: () => { tpl = k; if (!name.value || Object.values(PAGE_TEMPLATES).some((x) => x.label === name.value)) name.value = k === 'blank' ? '' : t.label; paint(); } },
      el('strong', {}, t.label), el('small', {}, t.desc))));
  paint();
  const create = () => {
    const title = name.value.trim() || 'New page';
    const isSub = true;
    const secs = PAGE_TEMPLATES[tpl].sections.map((type) => newSection(type, type === 'hero' && isSub
      ? { layout: 'center', pad: 'normal', eyebrow: title, heading: title, text: 'A short introduction to this page.', secondary: { label: '', href: '' } } : {}));
    state.doc.pages.push({ id: uid('p'), title, slug: uniqueSlug(slugify(title) || 'page'), showInNav: true, seoTitle: '', seoDescription: '', sections: secs });
    commit();
    closeModal();
    goToPage(state.doc.pages.length - 1);
    toast(`Page “${title}” created`);
  };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  openModal('New page', el('div', {},
    el('p', { class: 'p-sub' }, 'Start from'), grid,
    el('div', { class: 'f' }, el('label', {}, 'Page name'), name),
    el('div', { class: 'modal-actions' }, el('button', { type: 'button', class: 'ed-btn', onclick: closeModal }, 'Cancel'), el('button', { type: 'button', class: 'ed-btn ed-btn--primary', onclick: create }, 'Create page'))));
  setTimeout(() => name.focus(), 50);
}

function panelTheme(box) {
  const t = state.doc.theme;
  box.append(panelHead('Design', 'droplet'));
  const body = el('div', { class: 'p-body' });
  const set = (k, v, soon = false) => { t[k] = v; applyTheme(); if (soon) commitSoon(); else { commit(); renderPanel(); } };
  body.append(el('p', { class: 'p-sub' }, 'Color themes'), el('div', { class: 'presets' }, Object.entries(THEME_PRESETS).map(([k, p]) =>
    el('button', { type: 'button', class: `preset${t.preset === k ? ' is-on' : ''}`, onclick: () => {
      Object.assign(t, { preset: k, primary: p.primary, accent: p.accent, dark: p.dark, bg: p.bg, surface: p.surface, text: p.text });
      applyTheme(); commit(); renderPanel(); if (state.sel) renderInspector();
    } }, el('span', { class: 'preset__sw' }, ...[p.dark, p.primary, p.accent, p.surface].map((c) => el('span', { style: `background:${c}` }))), p.name))));
  body.append(el('p', { class: 'p-sub' }, 'Colors'));
  const colorRows = [['primary', 'Brand color'], ['accent', 'Accent'], ['dark', 'Dark sections'], ['surface', 'Tinted sections'], ['text', 'Text']];
  for (const [k, l] of colorRows) {
    const f = fieldControl({ type: 'color', label: l }, k, t[k], (path, v, o) => { t.preset = 'custom'; set(path, v, o?.soon); }, t, () => {});
    body.append(f);
  }
  body.append(el('p', { class: 'p-sub' }, 'Typography'));
  const fontSel = (k, l) => el('div', { class: 'f' }, el('label', {}, l), el('select', { onchange: (e) => set(k, e.target.value) },
    Object.keys(FONTS).map((f) => el('option', { value: f, selected: t[k] === f, style: `font-family:'${f}'` }, f))));
  body.append(fontSel('headingFont', 'Headings'), fontSel('bodyFont', 'Body text'));
  body.append(el('p', { class: 'p-sub' }, 'Shape'));
  body.append(fieldControl({ type: 'segmented', label: 'Corners', options: [['sharp', 'Sharp'], ['soft', 'Soft'], ['round', 'Round']] }, 'radius', t.radius, (p, v) => set(p, v), t));
  body.append(fieldControl({ type: 'segmented', label: 'Buttons', options: [['rounded', 'Rounded'], ['pill', 'Pill']] }, 'buttons', t.buttons, (p, v) => set(p, v), t));
  box.append(body);
}

function panelSite(box) {
  const s = state.doc.site;
  box.append(panelHead('Site settings', 'sliders'));
  const body = el('div', { class: 'p-body' });
  const fields = [
    { key: 'name', label: 'Business name', type: 'text' },
    { key: 'description', label: 'Site description (for search engines)', type: 'textarea' },
    { type: 'note', text: 'Contact details are used in the Contact section and the footer.' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'location', label: 'Location / service area', type: 'text' },
    { key: 'formEndpoint', label: 'Form endpoint (optional)', type: 'text', help: 'Paste your Formspree (or similar) https:// URL to receive form messages by email. Spam protection is built in. Leave empty to open the visitor’s email app instead.' },
  ];
  body.append(el('p', { class: 'p-sub' }, 'Business'));
  renderFields(body, fields, s, () => renderCanvas());
  body.append(el('p', { class: 'p-sub' }, 'Header & footer'),
    el('button', { type: 'button', class: 'ed-btn ed-btn--block', onclick: () => select('__header', { scroll: true }) }, ico('layout'), 'Edit header & footer'));
  body.append(el('p', { class: 'p-sub' }, 'Backup'),
    el('div', { style: 'display:grid;gap:6px' },
      el('button', { type: 'button', class: 'ed-btn ed-btn--block', onclick: downloadJSON }, ico('download'), 'Download backup (site.json)'),
      el('button', { type: 'button', class: 'ed-btn ed-btn--block', onclick: importJSON }, ico('upload'), 'Restore from file'),
      el('button', { type: 'button', class: 'ed-btn ed-btn--block ed-btn--danger', onclick: resetToPublished }, ico('refresh'), 'Discard draft (load live version)')));
  box.append(body);
}

function panelHelp(box) {
  box.append(panelHead('How it works', 'help'));
  box.append(el('div', { class: 'p-body' },
    el('ol', { class: 'help-steps' },
      el('li', {}, el('strong', {}, 'Edit text on the page. '), 'Click any text in the preview and type.'),
      el('li', {}, el('strong', {}, 'Select a section '), 'to change images, buttons, icons, colors and spacing on the right.'),
      el('li', {}, el('strong', {}, 'Add sections '), 'from the Add tab. Reorder them with the arrows or drag in Layers.'),
      el('li', {}, el('strong', {}, 'Change the look '), 'in Design — one click swaps the whole color theme.'),
      el('li', {}, el('strong', {}, 'Your work saves automatically '), 'as a draft in this browser.'),
      el('li', {}, el('strong', {}, 'Click Publish '), 'to make it live. The site updates about a minute later.')),
    el('p', { class: 'p-sub' }, 'Shortcuts'),
    el('div', { class: 'kbd-list' },
      el('div', {}, 'Undo', el('kbd', {}, 'Ctrl Z')), el('div', {}, 'Redo', el('kbd', {}, 'Ctrl ⇧ Z')),
      el('div', {}, 'Delete selected section', el('kbd', {}, 'Del')), el('div', {}, 'Finish editing text', el('kbd', {}, 'Esc')),
      el('div', {}, 'Save draft', el('kbd', {}, 'Ctrl S')))));
}

// ---------------------------------------------------------------------------
// Data import / export / publish
function downloadJSON() {
  const blob = new Blob([`${JSON.stringify(state.doc, null, 2)}\n`], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'site.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importJSON() {
  const input = el('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    try {
      const d = JSON.parse(await input.files[0].text());
      if (!Array.isArray(d.pages) || !d.pages.length || !d.site) throw new Error();
      state.doc = d; state.page = 0; state.sel = null;
      commit(); refreshAll();
      toast('Site restored from file');
    } catch { toast('That file is not a valid site.json backup.', { error: true }); }
  });
  input.click();
}

async function resetToPublished() {
  if (!confirm('Discard your draft and load the live version? You can undo this.')) return;
  try {
    state.doc = await fetchPublished();
    state.page = 0; state.sel = null;
    commit(); refreshAll();
    toast('Loaded the live version', { action: 'Undo', onAction: undo });
  } catch (e) { toast(e.message, { error: true }); }
}

async function fetchPublished() {
  const res = await fetch(`content/site.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load content/site.json (${res.status})`);
  return res.json();
}

function loadGH() { try { return { ...DEFAULT_REPO, ...JSON.parse(localStorage.getItem(GH_KEY) || '{}') }; } catch { return { ...DEFAULT_REPO }; } }

function openPublish() {
  flushCommit();
  const gh = loadGH();
  const inp = (k, ph, type = 'text') => el('input', { class: 'in', type, value: gh[k] || '', placeholder: ph, autocomplete: 'off', spellcheck: false });
  const owner = inp('owner', 'GitHub user'); const repo = inp('repo', 'Repository'); const branch = inp('branch', 'main');
  const token = inp('token', 'github_pat_…', 'password');
  const remember = el('input', { type: 'checkbox', checked: !!gh.token });
  const msg = el('input', { class: 'in', value: 'Update site content' });
  const log = el('div', { class: 'log', hidden: true });
  const go = el('button', { type: 'button', class: 'ed-btn ed-btn--primary' }, ico('send'), 'Publish now');
  const write = (t, cls) => { log.hidden = false; log.append(el('div', { class: cls || '' }, t)); log.scrollTop = log.scrollHeight; };
  go.addEventListener('click', async () => {
    const cfg = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main', token: token.value.trim() };
    if (!cfg.owner || !cfg.repo || !cfg.token) { write('Fill in repository and token first.', 'err'); return; }
    try { localStorage.setItem(GH_KEY, JSON.stringify(remember.checked ? cfg : { ...cfg, token: '' })); } catch { /* ignore */ }
    go.disabled = true;
    log.replaceChildren();
    try {
      const r = await publishToGitHub({ ...cfg, message: msg.value.trim() || 'Update site content', doc: state.doc, log: write });
      state.published = JSON.stringify(state.doc);
      saveDraft();
      updateTopbar();
      write('Done! Your site will update in about a minute.', 'ok');
      if (r.commitUrl) log.append(el('div', {}, el('a', { href: r.commitUrl, target: '_blank', rel: 'noopener', style: 'color:#93c5fd' }, 'View commit on GitHub')));
      toast('Published! Changes go live in about a minute.');
    } catch (e) {
      write(`Error: ${e.message}`, 'err');
    } finally { go.disabled = false; }
  });

  const ghPane = el('div', {},
    el('p', {}, 'Publishing saves your changes to your website’s GitHub repository. GitHub Pages then updates the live site automatically.'),
    el('details', { class: 'note' }, el('summary', { style: 'cursor:pointer;font-weight:600' }, 'First time? Create an access token'),
      el('ol', { class: 'steps-mini', style: 'margin-top:8px' },
        el('li', {}, 'Open ', el('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'GitHub → Fine-grained tokens'), '.'),
        el('li', {}, 'Repository access: “Only select repositories” → your site repository.'),
        el('li', {}, 'Permissions → Repository → Contents: “Read and write”.'),
        el('li', {}, 'Generate, copy the token and paste it below.'))),
    el('div', { class: 'f-row' }, el('div', { class: 'f' }, el('label', {}, 'Owner'), owner), el('div', { class: 'f' }, el('label', {}, 'Repository'), repo)),
    el('div', { class: 'f-row' }, el('div', { class: 'f' }, el('label', {}, 'Branch'), branch), el('div', { class: 'f' }, el('label', {}, 'Access token'), token)),
    el('div', { class: 'f' }, el('label', { class: 'switch' }, 'Remember token on this computer', remember)),
    el('div', { class: 'f' }, el('label', {}, 'Change note'), msg),
    log,
    el('div', { class: 'modal-actions' }, el('button', { type: 'button', class: 'ed-btn', onclick: closeModal }, 'Cancel'), go));

  const filePane = el('div', { hidden: true },
    el('p', {}, 'Prefer to publish by hand? Download your content file and replace content/site.json in the repository.'),
    el('div', { class: 'note' }, 'Uploaded images are embedded inside the file when you publish this way.'),
    el('div', { class: 'modal-actions' }, el('button', { type: 'button', class: 'ed-btn ed-btn--primary', onclick: downloadJSON }, ico('download'), 'Download site.json')));

  const tabs = el('div', { class: 'ed-tabs' });
  const tab = (label, pane, on) => el('button', { type: 'button', class: on ? 'is-on' : '', onclick: (e) => {
    $$('button', tabs).forEach((b) => b.classList.remove('is-on'));
    e.currentTarget.classList.add('is-on');
    ghPane.hidden = pane !== ghPane; filePane.hidden = pane !== filePane;
  } }, label);
  tabs.append(tab('Publish to GitHub', ghPane, true), tab('Download file', filePane));
  openModal('Publish your site', el('div', {}, tabs, ghPane, filePane));
}

// ---------------------------------------------------------------------------
// Modal, toasts, top bar
function openModal(title, content) {
  $('#modal-title').textContent = title;
  $('#modal-body').replaceChildren(content);
  $('#modal').hidden = false;
  hydrateIcons($('#modal'));
}
function closeModal() { $('#modal').hidden = true; }
$$('#modal [data-close]').forEach((n) => n.addEventListener('click', closeModal));

function toast(text, { action, onAction, error = false } = {}) {
  const t = el('div', { class: `toast${error ? ' is-err' : ''}` }, text);
  if (action) t.append(el('button', { type: 'button', onclick: () => { onAction(); t.remove(); } }, action));
  $('#toasts').append(t);
  setTimeout(() => t.remove(), action ? 6000 : 3200);
}

function updateTopbar() {
  $('#undo').disabled = !state.history.length;
  $('#redo').disabled = !state.future.length;
  const sel = $('#page-select');
  sel.replaceChildren(...state.doc.pages.map((p, i) => el('option', { value: String(i), selected: i === state.page }, p.title)));
  const dirty = state.snap !== state.published;
  const st = $('#status');
  st.textContent = dirty ? 'Draft saved · not published' : 'Published';
  st.classList.toggle('is-dirty', dirty);
}

function setDevice(d) {
  state.device = d;
  $('#frame-wrap').dataset.device = d;
  $$('#device-toggle button').forEach((b) => b.classList.toggle('is-on', b.dataset.device === d));
}

function refreshAll() {
  applyTheme();
  renderCanvas();
  renderPanel();
  renderInspector();
  updateTopbar();
}

function onGlobalKey(e) {
  const mod = e.metaKey || e.ctrlKey;
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flushCommit(); saveDraft(); toast('Draft saved'); return; }
  if (inField) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && state.sel && !isChrome(state.sel)) { e.preventDefault(); runTool('delete', state.sel); }
  else if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else select(null); }
}

// ---------------------------------------------------------------------------
// Boot
async function boot() {
  hydrateIcons();
  let published = null;
  try { published = await fetchPublished(); } catch (e) { toast(e.message, { error: true }); }
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { /* ignore */ }
  state.doc = draft?.doc || published;
  if (!state.doc) return;
  state.doc.theme ||= {};
  state.published = published ? JSON.stringify(published) : '';
  state.snap = JSON.stringify(state.doc);

  await initCanvas();
  refreshAll();
  if (draft?.doc && state.snap !== state.published) toast('Restored your unpublished draft', { action: 'Discard', onAction: resetToPublished });

  $$('.ed-rail button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $$('#device-toggle button').forEach((b) => b.addEventListener('click', () => setDevice(b.dataset.device)));
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  $('#page-select').addEventListener('change', (e) => goToPage(+e.target.value));
  $('#publish').addEventListener('click', openPublish);
  $('#preview').addEventListener('click', () => { flushCommit(); saveDraft(); window.open(`./?preview=1${pageHref(page(), state.page)}`, '_blank'); });
  document.addEventListener('keydown', onGlobalKey);
  addEventListener('beforeunload', () => flushCommit());
}

boot();
