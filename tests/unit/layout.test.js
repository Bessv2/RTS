import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHTML, cssColor, styleDecls, pieceCSS, hideClasses, walkLayout, nodeClass, newRow, sectionCSS } from '../../assets/js/layout.js';
import { renderSection, renderPage } from '../../assets/js/render.js';
import { buildSite } from '../../assets/js/build.js';
import { migrate } from '../../assets/js/schema.js';
import { BLOCKS, LAYOUT_ELEMENTS } from '../../assets/js/blocks.js';

const doc = (sections, extra = {}) => migrate({ site: { name: 'Biz' }, pages: [{ title: 'Home', sections }], ...extra });
const layout = (rows, data = {}) => ({ id: 's-lay', type: 'layout', data: { rows, ...data } });
const render = (section, ctx = {}) => renderSection(section, { site: doc([section]), ...ctx });

test('rich text keeps formatting and drops everything unsafe', () => {
  assert.equal(cleanHTML('<div>Hi <b>there</b></div><div><i>two</i></div>'), '<p>Hi <strong>there</strong></p><p><em>two</em></p>');
  assert.equal(cleanHTML('<p>a<script>alert(1)</script>b<style>p{}</style>c</p>'), '<p>abc</p>');
  assert.equal(cleanHTML('<img src=x onerror=alert(1)><p onclick="x()">t</p>'), '<p>t</p>');
  assert.equal(cleanHTML('<a href="javascript:alert(1)">bad</a> <a href="/contact/">ok</a>'), 'bad <a href="/contact/">ok</a>');
  assert.equal(cleanHTML('<a href="https://x.com" target="_blank">x</a>'), '<a href="https://x.com" target="_blank" rel="noopener">x</a>');
  assert.equal(cleanHTML('<span style="color: rgb(37, 99, 235); position: fixed; background-image: url(x)">c</span>'), '<span style="color:rgb(37, 99, 235)">c</span>');
  assert.equal(cleanHTML('<span style="color: expression(alert(1))">c</span>'), 'c');
  assert.equal(cleanHTML('<span style="color:var(--c-primary);font-size:24px">c</span>'), '<span style="color:var(--c-primary);font-size:24px">c</span>');
  assert.equal(cleanHTML('<font color="#ff0000" size="5">big</font>'), '<span style="color:#ff0000;font-size:x-large">big</span>');
  assert.equal(cleanHTML('<p style="text-align: center; color: red">mid</p>'), '<p style="text-align:center">mid</p>');
  assert.equal(cleanHTML('<h1>Title</h1><h5>small</h5>'), '<h2>Title</h2><h4>small</h4>');
  assert.equal(cleanHTML('<ul><li>a<li>b</ul>'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(cleanHTML('x < y & "z"'), 'x &lt; y &amp; &quot;z&quot;');
  assert.equal(cleanHTML('<p>&nbsp;</p><p><br></p>'), '');
  assert.equal(cleanHTML(null), '');
});

test('rich text can never break out of the element it sits in', () => {
  for (const evil of ['</div><script>x</script>', '<p><strong>open', '<scr<script>ipt>alert(1)</script>', '<svg><script>x</script></svg>after', '<p title="a>b">t</p>', '<!--<script>-->x', '<iframe src=x>']) {
    const out = cleanHTML(evil);
    assert.doesNotMatch(out, /<(script|svg|iframe|div)|<\/div>|on\w+=/i, evil);
    const opens = (out.match(/<(p|strong|em|span|a|ul|ol|li|h\d|blockquote|u|s|code|sub|sup)\b/g) || []).length;
    const closes = (out.match(/<\/(p|strong|em|span|a|ul|ol|li|h\d|blockquote|u|s|code|sub|sup)>/g) || []).length;
    assert.equal(opens, closes, evil);
  }
  assert.equal(cleanHTML('<p><strong>open'), '<p><strong>open</strong></p>');
  // Cleaning twice changes nothing, so the editor can clean on every keystroke.
  const once = cleanHTML('<div>It’s <b>bold</b> &amp; <span style="color:#fff">white</span></div>');
  assert.equal(cleanHTML(once), once);
});

test('style values are checked, clamped and never copied raw', () => {
  assert.equal(cssColor('#ABC'), '#abc');
  assert.equal(cssColor('primary'), 'var(--c-primary)');
  assert.equal(cssColor('rgba(1,2,3,.5)'), 'rgba(1, 2, 3, .5)');
  assert.equal(cssColor('red;background:url(x)'), '');
  assert.equal(cssColor('rgb(300,0,0)'), '');
  const d = styleDecls({ pt: 99999, mt: -9999, fs: '18', fw: 650, rad: 'x', bg: '}body{display:none', shadow: 'evil' });
  assert.deepEqual(d.box, ['padding-top:600px']);
  assert.deepEqual(d.outer, ['margin-top:-400px']);
  assert.deepEqual(d.text, ['font-size:18px', 'font-weight:700']);
  assert.deepEqual(d.frame, []);
  // An image address can't close the style tag or the CSS rule.
  const css = pieceCSS('.x .n-0', { img: 'https://e.com/a</style><script>.png' }, null);
  assert.doesNotMatch(css, /<|>(?!\s*\.)/);
  assert.match(css, /%3C\/style%3E/);
});

test('phone settings go in a media query, and colours keep text readable', () => {
  const css = pieceCSS('.x .n-0', { pt: 40, fs: 48 }, { pt: 16, fs: 30 });
  assert.match(css, /^\.x \.n-0\{padding-top:40px;font-size:clamp\(29px, 4\.00vw, 48px\)\}@media \(max-width: 759\.98px\)\{\.x \.n-0\{padding-top:16px;font-size:30px\}\}$/);
  assert.match(pieceCSS('.a', { bg: '#111827' }), /--sec-text:#f8fafc/);
  assert.match(pieceCSS('.a', { bg: '#fef3c7' }), /--sec-text:var\(--c-text\)/);
  assert.match(pieceCSS('.a', { bg: 'primary' }, null, { theme: { primary: '#2563eb' } }), /--sec-text:#f8fafc/);
  assert.doesNotMatch(pieceCSS('.a', { bg: '#111827', color: '#ff0000' }), /#f8fafc/);
  assert.match(pieceCSS('.a', { color: 'accent' }), /color:var\(--c-accent\);--sec-text:var\(--c-accent\)/);
  assert.equal(hideClasses({ hide: true }, { hide: false }), ' hide-d');
  assert.equal(hideClasses({ hide: true }), ' hide-d hide-m');
  assert.equal(hideClasses({}, { hide: true }), ' hide-m');
});

test('layout sections render rows, columns and elements with scoped styles', () => {
  const sec = layout([{ design: { valign: 'center', width: 'narrow' }, cols: [
    { span: 7, mobile: { span: 6 }, els: [{ type: 'heading', text: 'Hello', size: 'xl' }, { type: 'text', html: '<p>Hi <b>you</b><script>x</script></p>', design: { color: 'primary' } }] },
    { span: 5, els: [{ type: 'box', design: { bg: 'dark', pt: 20 }, els: [{ type: 'button', label: 'Go', href: '/contact/', design: { bg: '#ff0000', rad: 4 } }] }] },
  ] }]);
  const html = render(sec, { first: true });
  assert.match(html, /<section class="sec sec--light pad--normal blk-layout x-s-lay">/);
  assert.match(html, /<div class="wrap lay__row lay__row--narrow n-0"><div class="lay__col lay__col--s7 lay__col--m6 n-0-0">/);
  assert.match(html, /<div class="lx lx--heading lx-size--xl n-0-0-0"><h1 class="lx-h">Hello<\/h1><\/div>/);
  assert.match(html, /<div class="lx-rich"><p>Hi <strong>you<\/strong><\/p><\/div>/);
  assert.match(html, /<div class="lx lx--box n-0-1-0"><div class="lx lx--button n-0-1-0-0"><a class="btn btn--primary" href="\/contact\/"><span>Go<\/span><\/a><\/div><\/div>/);
  const css = html.match(/<style data-s>(.*)<\/style><\/section>$/)[1];
  assert.match(css, /\.x-s-lay \.n-0\{align-items:center\}/);
  assert.match(css, /\.x-s-lay \.n-0-0-1\{color:var\(--c-primary\)/);
  assert.match(css, /\.x-s-lay \.n-0-1-0-0 \.btn\{background-color:#ff0000;background-image:none;border-radius:4px/);
  assert.doesNotMatch(html, /data-node|data-edit/);
});

test('layout sections are editable in the editor', () => {
  const sec = layout([{ cols: [{ span: 6, els: [{ type: 'text', html: '<p>x</p>' }, { type: 'image', image: '' }] }, { span: 6, els: [] }] }]);
  const html = render(sec, { edit: true });
  assert.match(html, /data-node="rows\.0" data-kind="row"/);
  assert.match(html, /data-node="rows\.0\.cols\.1" data-kind="col"><button type="button" class="lay__add" data-add-el="rows\.0\.cols\.1">/);
  assert.match(html, /<div class="lx-rich" data-edit="rows\.0\.cols\.0\.els\.0\.html" data-ph="Write something…" data-html><p>x<\/p><\/div>/);
  assert.match(html, /data-node="rows\.0\.cols\.0\.els\.1" data-kind="el"><div class="figure__empty">/);
  assert.match(render(layout([]), { edit: true }), /class="lay__none" data-add-row/);
  assert.equal(render(layout([])).includes('lay__none'), false);
  // Empty elements are left out on the live site, an empty column keeps its space.
  assert.match(render(sec), /<div class="lay__col lay__col--s6 lay__col--m12 n-0-0"><div class="lx lx--text lx-text--m n-0-0-0"><div class="lx-rich"><p>x<\/p><\/div><\/div><\/div>/);
  assert.match(render(sec), /<div class="lay__col lay__col--s6 lay__col--m12 n-0-1"><\/div>/);
});

test('heading levels: automatic keeps the outline, a chosen level is kept', () => {
  const sec = layout([{ cols: [{ span: 12, els: [
    { type: 'heading', text: 'Auto' }, { type: 'heading', text: 'Kept', level: 'h3' }, { type: 'heading', text: 'Label', level: 'p', size: 'label' },
  ] }] }]);
  const html = render(sec, { first: true });
  assert.match(html, /<h1 class="lx-h">Auto<\/h1>/);
  assert.match(html, /<h3 class="lx-h">Kept<\/h3>/);
  assert.match(html, /<p class="lx-h">Label<\/p>/);
  assert.match(render(sec), /<h2 class="lx-h">Auto<\/h2>/);
});

test('any section can have its own style, and the build puts styles in the head', () => {
  const hero = { id: 's-h', type: 'hero', data: { ...BLOCKS.hero.defaults(), design: { bg: '#0f172a', pt: 40, minH: 'screen', cv: 'center' }, mobile: { pt: 20 } } };
  assert.match(sectionCSS(hero), /^\.x-s-h\.x-s-h\{padding-top:40px;min-height:100svh;background-color:#0f172a;background-image:none;--sec-link/);
  assert.match(sectionCSS(hero), /display:flex;flex-direction:column;justify-content:center\}@media \(max-width: 759\.98px\)\{\.x-s-h\.x-s-h\{padding-top:20px\}\}$/);
  assert.equal(sectionCSS({ id: 's-x', type: 'hero', data: {} }), '');
  const d = doc([hero, layout([{ cols: [{ span: 12, els: [{ type: 'heading', text: 'Hi', design: { fs: 20 } }] }] }])]);
  assert.match(renderPage(d, 0), /<style data-s>/);
  const page = buildSite(d, { origin: 'https://e.com' }).files.get('index.html');
  assert.doesNotMatch(page, /<style data-s>/);
  assert.match(page, /<style id="section-styles">\.x-s-h\.x-s-h\{[^<]*\.x-s-lay \.n-0-0-0\{font-size:20px\}<\/style>\n[\s\S]*<\/head>/);
});

test('layout helpers', () => {
  assert.deepEqual(newRow([4, 8]), { cols: [{ span: 4, els: [] }, { span: 8, els: [] }] });
  assert.equal(nodeClass('rows.2.cols.0.els.3.els.1'), 'n-2-0-3-1');
  const seen = [];
  walkLayout({ rows: [{ cols: [{ els: [{ type: 'box', els: [{ type: 'text' }] }, { type: 'heading' }] }] }] }, (n, p, kind) => seen.push(`${kind}:${p}`));
  assert.deepEqual(seen, ['row:rows.0', 'col:rows.0.cols.0', 'el:rows.0.cols.0.els.0', 'el:rows.0.cols.0.els.0.els.0', 'el:rows.0.cols.0.els.1']);
  for (const [type, def] of Object.entries(LAYOUT_ELEMENTS)) {
    assert.equal(def.defaults().type, type, type);
    assert.ok(def.label && def.icon && Array.isArray(def.fields) && typeof def.render === 'function', type);
    assert.equal('align' in def.defaults() || 'width' in def.defaults(), false, type);
  }
  // Every element renders on its own in a layout without errors.
  const els = Object.values(LAYOUT_ELEMENTS).map((def) => def.defaults());
  const html = render(layout([{ cols: [{ span: 12, els }] }]), { edit: true });
  for (const type of Object.keys(LAYOUT_ELEMENTS)) assert.match(html, new RegExp(`lx--${type}\\b`), type);
});
