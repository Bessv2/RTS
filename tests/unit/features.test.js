import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rich, markdown, findRoute, renderPage, anchorId } from '../../assets/js/render.js';
import { buildSite, staleFiles } from '../../assets/js/build.js';
import { migrate, validate, redirectFrom, redirectTo } from '../../assets/js/schema.js';

const site = (extra = {}) => migrate({
  site: { name: 'Biz' },
  pages: [
    { title: 'Home', sections: [{ id: 'h', type: 'hero', data: { heading: 'Welcome', image: 'assets/a.png', layout: 'split' } }] },
    { title: 'About', slug: 'about', sections: [{ id: 'c', type: 'contact', data: { heading: 'Say hi', showForm: false, anchor: 'contact' } }] },
    { title: 'Secret', slug: 'secret', draft: true, sections: [{ id: 't', type: 'text', data: { heading: 'Not ready' } }] },
    { title: 'Landing', slug: 'landing', noindex: true, showInNav: false, sections: [] },
    { title: 'Hidden', slug: 'hidden', showInNav: false, sections: [] },
  ],
  ...extra,
});

test('inline code is escaped and not formatted', () => {
  assert.equal(rich('Run `ls **x**` now'), 'Run <code>ls **x**</code> now');
  assert.equal(rich('`<b>`'), '<code>&lt;b&gt;</code>');
  assert.equal(rich('a\0b'), 'ab');
});

test('markdown code blocks and callouts', () => {
  const html = markdown('```bash\necho "<hi>"\n**not bold**\n```\n\n> [!TIP]\n> Use a **password manager**.\n>\n> Second paragraph.\n\n> plain quote\n> continues');
  assert.match(html, /<pre class="code" data-lang="bash"><code>echo &quot;&lt;hi&gt;&quot;\n\*\*not bold\*\*<\/code><\/pre>/);
  assert.match(html, /<aside class="callout callout--tip"><p class="callout__title"><svg[^>]*>.*<\/svg>Tip<\/p><p>Use a <strong>password manager<\/strong>.<\/p><p>Second paragraph.<\/p><\/aside>/);
  assert.match(html, /<blockquote><p>plain quote<br>continues<\/p><\/blockquote>/);
  assert.match(markdown('```\nunclosed'), /<pre class="code"><code>unclosed<\/code><\/pre>/);
  assert.match(markdown('> [!warning] Careful'), /callout--warning.*Warning<\/p><p>Careful<\/p>/);
});

test('the first section carries the h1 and loads its images first', () => {
  const doc = site();
  const home = renderPage(doc, 0);
  assert.match(home, /<img class="hero__img" src="\/assets\/a.png" alt="Welcome" fetchpriority="high" decoding="async">/);
  assert.match(renderPage(doc, 1), /<h1 class="sec-title">Say hi<\/h1>/);
  assert.equal(anchorId('#my anchor!'), 'myanchor');
});

test('unpublished pages are never built, linked or found', () => {
  const doc = site();
  const { files } = buildSite(doc, { origin: 'https://x.com' });
  assert.ok(!files.has('secret/index.html'));
  for (const [, c] of files) assert.doesNotMatch(c, /Not ready|\/secret\//);
  assert.equal(findRoute(doc, '/secret/'), null);
  assert.equal(findRoute(doc, '/secret/', { drafts: true }).index, 2);
  assert.deepEqual(validate(doc), []);
  assert.equal(migrate({ pages: [{ title: 'Home', draft: true, sections: [] }] }).pages[0].draft, undefined, 'home is always live');
});

test('hidden-from-search pages are noindexed and left out of the sitemap; menu-hidden pages stay in', () => {
  const { files } = buildSite(site(), { origin: 'https://x.com' });
  assert.match(files.get('landing/index.html'), /<meta name="robots" content="noindex">/);
  const sitemap = files.get('sitemap.xml');
  assert.doesNotMatch(sitemap, /\/landing\//);
  assert.match(sitemap, /\/hidden\//);
  assert.match(sitemap, /\/about\//);
});

test('redirects forward old addresses without replacing real pages', () => {
  const doc = site({ redirects: [
    { from: '/old-about/', to: '/about/' },
    { from: 'blog/old-post', to: 'https://example.org/new' },
    { from: '/about/', to: '/landing/' },
    { from: 'secret', to: '/about/' },
  ] });
  assert.deepEqual(validate(doc), []);
  const { files, paths } = buildSite(doc, { origin: 'https://x.com' });
  const stub = files.get('old-about/index.html');
  assert.match(stub, /<meta http-equiv="refresh" content="0; url=\/about\/">/);
  assert.match(stub, /<link rel="canonical" href="https:\/\/x.com\/about\/">/);
  assert.match(stub, /noindex/);
  assert.match(files.get('blog/old-post/index.html'), /url=https:\/\/example.org\/new/);
  assert.doesNotMatch(files.get('about/index.html'), /refresh/, 'a real page wins');
  assert.match(files.get('secret/index.html'), /url=\/about\//, 'an unpublished page can be redirected');
  assert.doesNotMatch(files.get('sitemap.xml'), /old-about/);
  assert.deepEqual(staleFiles(JSON.stringify({ files: ['gone/index.html', 'old-about/index.html'] }), paths), ['gone/index.html']);
  assert.deepEqual(findRoute(doc, '/old-about/'), { type: 'redirect', to: '/about/' });
});

test('redirect addresses are checked', () => {
  assert.equal(redirectFrom('/Old-Page/'), 'old-page');
  assert.equal(redirectFrom('blog/x'), 'blog/x');
  assert.equal(redirectFrom('assets'), '');
  assert.equal(redirectFrom('../etc'), '');
  assert.equal(redirectFrom('a/b'), '');
  assert.equal(redirectTo('new-page'), '/new-page/');
  assert.equal(redirectTo('https://a.com'), 'https://a.com');
  const problems = validate(site({ redirects: [{ from: 'assets', to: '/' }, { from: 'x', to: '' }, { from: 'y', to: '/' }, { from: '/y/', to: '/' }] })).join('\n');
  assert.match(problems, /needs an old address/);
  assert.match(problems, /needs a new address/);
  assert.match(problems, /Two redirects/);
  assert.doesNotMatch(buildSite(site({ redirects: [{ from: 'z', to: 'javascript:alert(1)' }] }), {}).files.get('z/index.html'), /url=javascript:|href="javascript:/i);
});
