import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceCSS, STYLE_GROUPS } from '../../assets/js/layout.js';
import { renderSection, renderPage, renderFooter } from '../../assets/js/render.js';
import { buildSite } from '../../assets/js/build.js';
import { migrate } from '../../assets/js/schema.js';
import { LAYOUT_ELEMENTS } from '../../assets/js/blocks.js';
import { footerToLayout } from '../../assets/js/convert.js';
import { audit } from '../../assets/js/audit.js';

const doc = (sections, site = {}, pages = []) => migrate({ site: { name: 'Biz', ...site }, pages: [{ title: 'Home', sections }, ...pages] });
const layout = (rows, data = {}) => ({ id: 's-lay', type: 'layout', data: { rows, ...data } });
const one = (el) => layout([{ cols: [{ span: 12, els: [el] }] }]);
const render = (section, d = doc([section]), ctx = {}) => renderSection(section, { site: d, ...ctx });

test('tablet settings sit between every screen and phones', () => {
  const css = pieceCSS('.x .n-0', { pt: 40 }, { pt: 10 }, { tablet: { pt: 24 } });
  assert.equal(css, '.x .n-0{padding-top:40px}@media (max-width: 1023.98px){.x .n-0{padding-top:24px}}@media (max-width: 759.98px){.x .n-0{padding-top:10px}}');
  // A tablet border colour keeps the width set for every screen; phones start from the tablet.
  assert.match(pieceCSS('.a', { bw: 2 }, null, { tablet: { bc: '#ff0000' } }), /1023\.98px\)\{\.a\{border:2px solid #ff0000\}/);
  assert.match(pieceCSS('.a', { bw: 2 }, { bs: 'dashed' }, { tablet: { bc: '#ff0000' } }), /759\.98px\)\{\.a\{border:2px dashed #ff0000\}/);
  // A tablet text size is used as is (no shrinking with the screen).
  assert.match(pieceCSS('.a', { fs: 60 }, null, { tablet: { fs: 44 } }), /1023\.98px\)\{\.a\{font-size:44px\}/);
});

test('columns can have their own width on tablets', () => {
  const html = render(layout([{ cols: [{ span: 4, tablet: { span: 6 }, els: [] }, { span: 8, els: [] }] }]));
  assert.match(html, /lay__col--s4 lay__col--t6 lay__col--m12 n-0-0/);
  assert.match(html, /lay__col--s8 lay__col--m12 n-0-1/, 'no tablet class unless set');
  const rev = render(layout([{ tablet: { reverse: true }, mobile: { reverse: false }, cols: [{ span: 6, els: [] }, { span: 6, els: [] }] }]));
  assert.match(rev, /1023\.98px\)\{\.x-s-lay \.n-0-0\{order:2\}\.x-s-lay \.n-0-1\{order:1\}\}/);
  assert.match(rev, /759\.98px\)\{\.x-s-lay \.n-0-0\{order:0\}/, 'phones put them back');
});

test('hover changes only show with a mouse, on the part being pointed at', () => {
  const css = pieceCSS('.x .n-0', { hbg: '#111827', hlift: 4, hzoom: 105, hshadow: 'lg' }, null, { parts: { box: ' .btn', frame: ' .btn', text: ' .btn' } });
  assert.match(css, /^\.x \.n-0 \.btn\{transition:background-color \.2s ease/);
  assert.match(css, /@media \(hover: hover\)\{\.x \.n-0 \.btn:hover\{background-color:#111827;background-image:none;box-shadow:[^;]+;transform:translateY\(-4px\) scale\(1\.05\);--sec-link:currentColor;--sec-text:#f8fafc/);
  assert.match(pieceCSS('.a', { hcolor: 'accent' }), /\.a:hover\{color:var\(--c-accent\)/);
  assert.equal(pieceCSS('.a', { hbg: 'javascript:alert(1)', hlift: 'x' }), '', 'bad values are dropped');
  assert.doesNotMatch(pieceCSS('.a', { hbg: '#000' }, null, { kind: 'row' }), /hover/, 'rows have no hover');
  assert.ok(STYLE_GROUPS.find((g) => g.id === 'hover').allScreens);
});

test('entrance animations: a class, an optional delay, nothing hidden without the script', () => {
  const html = render(one({ type: 'heading', text: 'Hi', size: 'l', design: { anim: 'up', animDelay: 0.4 } }));
  assert.match(html, /class="lx lx--heading lx-size--l n-0-0-0 anim anim--up"/);
  assert.match(html, /\.x-s-lay \.n-0-0-0\{--anim-delay:0\.4s\}/);
  assert.doesNotMatch(render(one({ type: 'heading', text: 'Hi', design: { anim: 'spin' } })), /anim/);
  const rowAnim = render(layout([{ design: { anim: 'fade' }, cols: [{ span: 12, design: { anim: 'zoom' }, els: [] }] }]));
  assert.match(rowAnim, /lay__row--contained n-0 anim anim--fade/);
  assert.match(rowAnim, /n-0-0 anim anim--zoom/);
});

test('a box with a link is clickable all over, but not while editing', () => {
  const box = { type: 'box', look: 'card', href: '/services/', els: [{ type: 'heading', text: 'Our <services>', size: 's' }] };
  const html = render(one(box));
  assert.match(html, /class="lx lx--box lx-box--card lx--linked n-0-0-0"/);
  assert.match(html, /<a class="lx-cover" href="\/services\/" aria-label="Our &lt;services&gt;"><\/a>/);
  assert.match(render(one({ ...box, href: 'javascript:alert(1)' })), /class="lx-cover" href="#"/);
  assert.match(render(one({ ...box, href: 'https://x.com', newTab: true })), /target="_blank" rel="noopener"/);
  assert.doesNotMatch(render(one(box), undefined, { edit: true }), /lx-cover/);
});

test('site pieces: logo, menu, social links, contact details and copyright line', () => {
  const site = { email: 'hi@biz.com', phone: '(555) 010-2000', location: 'Springfield', social: { facebook: 'https://facebook.com/biz', github: 'javascript:alert(1)' } };
  const els = ['logo', 'menu', 'social', 'contactinfo', 'copyright'].map((t) => LAYOUT_ELEMENTS[t].defaults());
  const sec = layout([{ cols: [{ span: 12, els }] }]);
  const d = doc([sec], site, [{ title: 'About', slug: 'about', sections: [] }, { title: 'Hidden', slug: 'hidden', showInNav: false, sections: [] }]);
  const html = renderPage(d, 0, {});
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.match(main, /<a class="brand" href="\/">.*<span class="brand__name">Biz<\/span><\/a>/);
  assert.match(main, /<nav class="lx-menu lx-menu--row" aria-label="Pages"><ul><li><a href="\/" aria-current="page">Home<\/a><\/li><li><a href="\/about\/">About<\/a><\/li><\/ul><\/nav>/);
  assert.match(main, /<div class="lx-social lx-social--soft"><ul class="social"><li><a href="https:\/\/facebook\.com\/biz"/);
  assert.doesNotMatch(main, /javascript:/);
  assert.match(main, /<ul class="lx-contact lx-contact--icons"><li><a href="mailto:hi@biz\.com"><svg[^>]*>.*<\/svg><span>hi@biz\.com<\/span><\/a><\/li><li><a href="tel:5550102000">/);
  assert.match(main, new RegExp(`<p class="lx-copy"><span>© ${new Date().getFullYear()} Biz</span></p>`));
  // Logo only: the link still has a name. Without settings, nothing shows on the site.
  assert.match(render(one({ type: 'logo', show: 'logo' })), /<a class="brand" href="\/" aria-label="Biz">/);
  const bare = doc([one({ type: 'social' })]);
  assert.doesNotMatch(render(one({ type: 'social' }), bare), /lx--social/);
  assert.match(render(one({ type: 'social' }), bare, { edit: true }), /lx-empty/);
});

test('header options: layout, scrolling and a see-through header over a dark first section', () => {
  const hero = { id: 'h', type: 'hero', data: { heading: 'Hi', bg: 'dark' } };
  const head = (site, sections = [hero]) => renderPage(doc(sections, site), 0, {}).split('</header>')[0];
  assert.match(head({}), /<header class="site-header site-header--light">/);
  assert.match(head({ headerLayout: 'center', headerSticky: 'scroll', headerOverlay: true }), /class="site-header site-header--light site-header--center site-header--scroll site-header--overlay site-header--on-dark"/);
  assert.match(head({ headerLayout: 'bogus', headerSticky: '"><x' }), /<header class="site-header site-header--light">/);
  assert.doesNotMatch(head({ headerOverlay: true }, [{ id: 't', type: 'text', data: { heading: 'Hi' } }]), /on-dark/, 'light first section keeps dark text');
  const posts = migrate({ site: { name: 'Biz', headerOverlay: true }, pages: [{ title: 'Home', sections: [hero] }, { title: 'Blog', slug: 'blog', sections: [{ id: 'b', type: 'blogfeed', data: {} }] }], posts: [{ id: 'p1', title: 'Hello', body: 'Hi', published: true, date: '2026-01-01' }] });
  const built = buildSite(posts, { origin: 'https://e.com' }).files;
  assert.match(built.get('index.html'), /site-header--overlay/);
  const postPage = [...built.keys()].find((k) => /^blog\/.+\/index\.html$/.test(k));
  assert.ok(postPage);
  assert.doesNotMatch(built.get(postPage), /site-header--overlay/, 'blog posts start light, under a solid header');
  assert.doesNotMatch(built.get('404.html'), /site-header--overlay/);
  const extras = head({ phone: '555 0100', headerPhone: true, headerSocial: true, social: { linkedin: 'https://linkedin.com/x' }, headerCta: { label: 'Call', href: '/contact/' } });
  assert.match(extras, /<div class="header__end"><ul class="social social--header">.*<a class="header__phone" href="tel:5550100">.*<a class="btn btn--primary btn--sm header__cta"/);
});

test('the footer can be designed as a layout, starting from the standard one', () => {
  const site = { tagline: 'IT done right', footerText: 'Made in Ohio', email: 'hi@biz.com', social: { facebook: 'https://facebook.com/biz' } };
  const layoutFooter = footerToLayout(site);
  const d = doc([{ id: 'h', type: 'hero', data: { heading: 'Hi' } }], { ...site, footerMode: 'layout', footerLayout: layoutFooter });
  const foot = renderFooter(d, { site: d });
  assert.match(foot, /^<footer class="site-footer site-footer--custom x-__footer is-dark">/);
  assert.match(foot, /IT done right/);
  assert.match(foot, /Made in Ohio/);
  assert.match(foot, /<nav class="lx-menu lx-menu--column" aria-label="Footer pages">/);
  assert.match(foot, /<h2 class="lx-h">Pages<\/h2>|<p class="lx-h">Pages<\/p>/);
  assert.match(foot, /lay__col--s5 lay__col--t12 lay__col--m12/);
  // Its styles go in the page head like any section's.
  const styled = doc([], { footerMode: 'layout', footerLayout: { ...layoutFooter, design: { bg: '#ffffff' } } });
  const page = buildSite(styled, { origin: 'https://e.com' }).files.get('index.html');
  assert.match(page, /<head>[\s\S]*\.x-__footer\.x-__footer\{background-color:#ffffff[\s\S]*<\/head>/);
  assert.doesNotMatch(page, /x-__footer is-dark/, 'a light footer is not dark');
  // The standard footer is back when switched off, and the editor can select its parts.
  assert.match(renderFooter(doc([], { ...site, footerLayout: layoutFooter }), { site: d }), /<footer class="site-footer">/);
  assert.match(renderFooter(d, { site: d, edit: true }), /data-section-id="__footer".*data-node="rows\.0\.cols\.0\.els\.0" data-kind="el"/s);
  assert.match(renderFooter(d, { site: d, edit: true }), /data-edit="footerLayout\.rows\.\d\.cols\.\d\.els\.\d\.html"|data-edit="footerLayout\.rows\.2\.cols\.0\.els\.0\.note"/);
});

test('the checkup looks at clickable boxes and the designed footer', () => {
  const box = { type: 'box', href: '/nope/', els: [{ type: 'heading', text: 'Plans' }] };
  const footer = { rows: [{ cols: [{ span: 12, els: [{ type: 'text', html: '<p><a href="/gone/">Old page</a></p>' }, { type: 'button', label: 'Go', href: '' }] }] }] };
  const found = audit(doc([{ id: 'h', type: 'hero', data: { heading: 'Hi' } }, one(box)], { footerMode: 'layout', footerLayout: footer }));
  assert.ok(found.some((f) => /“Plans”/.test(f.message) && f.where.field === 'rows.0.cols.0.els.0.href'), 'box link');
  assert.ok(found.some((f) => /Old page/.test(f.message) && f.where.field === 'footerLayout.rows.0.cols.0.els.0.html'), 'footer text link');
  assert.ok(found.some((f) => /“Go” button in the footer/.test(f.message)), 'footer button');
});
