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

test('scheduled posts go live on their date', async () => {
  const { today, isLivePost, publishedPosts } = await import('../../assets/js/render.js');
  const day = today();
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(isLivePost({ date: '2000-01-01' }), true);
  assert.equal(isLivePost({ date: '2999-01-01' }), false);
  assert.equal(isLivePost({ date: '2999-01-01' }, '2999-01-01'), true);
  assert.equal(isLivePost({ date: '2000-01-01', published: false }), false);
  const doc = site({ posts: [
    { id: 'a', kind: 'post', slug: 'now', title: 'Now', date: day, body: 'x' },
    { id: 'b', kind: 'post', slug: 'later', title: 'Later post', date: '2999-01-01', body: 'x' },
  ] });
  assert.deepEqual(publishedPosts(doc).map((p) => p.id), ['a']);
  assert.equal(findRoute(doc, '/blog/later/'), null);
  assert.equal(findRoute(doc, '/blog/later/', { drafts: true }).post.id, 'b');
  const { files } = buildSite(doc, { origin: 'https://x.com' });
  assert.ok(files.has('blog/now/index.html'));
  for (const [, c] of files) assert.doesNotMatch(c, /Later post|\/blog\/later\//);
});

test('sections can be shown on computers or phones only', () => {
  const doc = site();
  doc.pages[0].sections.push({ id: 'd', type: 'text', data: { heading: 'Desk', showOn: 'desktop' } }, { id: 'm', type: 'text', data: { heading: 'Mob', showOn: 'mobile"x' } });
  const html = renderPage(doc, 0);
  assert.match(html, /class="sec [^"]*show-on--desktop/);
  assert.doesNotMatch(html, /show-on--mobile"x|show-on--mobilex/, 'unknown values add nothing');
});

test('per-page share images, search engine verification and language', () => {
  const doc = site();
  doc.site.lang = 'es';
  doc.site.googleVerification = 'abc_123"><script>';
  doc.site.bingVerification = 'B1N6';
  doc.pages[1].shareImage = 'assets/about-card.png';
  const { files } = buildSite(doc, { origin: 'https://x.com' });
  const home = files.get('index.html');
  assert.match(home, /<html lang="es">/);
  assert.match(home, /<meta name="google-site-verification" content="abc_123script">/);
  assert.match(home, /<meta name="msvalidate.01" content="B1N6">/);
  assert.doesNotMatch(files.get('about/index.html'), /site-verification/, 'only on the home page');
  assert.match(files.get('about/index.html'), /<meta property="og:image" content="https:\/\/x.com\/assets\/about-card.png">/);
  doc.site.lang = 'en"><b>';
  assert.match(buildSite(doc, {}).files.get('index.html'), /<html lang="en">/);
});

test('image descriptions and the contact form message', async () => {
  const doc = site();
  doc.pages[0].sections = [
    { id: 'h', type: 'hero', data: { layout: 'split', heading: 'Welcome', image: 'assets/a.png', imageAlt: 'Our team at work' } },
    { id: 'i', type: 'image', data: { image: 'assets/b.png' } },
    { id: 'c', type: 'contact', data: { heading: 'Hi', showForm: true, sentText: 'Got it, thanks!' } },
  ];
  const html = renderPage(doc, 0);
  assert.match(html, /alt="Our team at work"/);
  assert.match(html, /data-sent="Got it, thanks!"/);
  const { audit } = await import('../../assets/js/audit.js');
  doc.site.email = 'a@b.c';
  assert.ok(audit(doc).some((r) => r.code === 'image-description' && r.where.section === 'i'));
});

test('hard-to-read theme colors are flagged', async () => {
  const { audit } = await import('../../assets/js/audit.js');
  const doc = site();
  doc.theme = { text: '#bbbbbb', bg: '#ffffff', primary: '#ffee00', dark: '#9a9a9a' };
  const msgs = audit(doc).filter((r) => r.code === 'contrast').map((r) => r.message).join('\n');
  assert.match(msgs, /page background/);
  assert.match(msgs, /dark sections/);
  assert.match(msgs, /White text on your brand color/);
  assert.equal(audit(doc).find((r) => r.code === 'contrast').where.field, 'theme');
});

test('booking calendars embed known providers and link to anything else', async () => {
  const { parseBooking, BLOCKS } = await import('../../assets/js/blocks.js');
  const { CSP } = await import('../../assets/js/build.js');
  assert.deepEqual(parseBooking('https://calendly.com/roe/30min'), { provider: 'Calendly', embed: 'https://calendly.com/roe/30min', link: 'https://calendly.com/roe/30min' });
  assert.equal(parseBooking('https://calendar.google.com/calendar/appointments/schedules/AbC').embed, 'https://calendar.google.com/calendar/appointments/schedules/AbC?gv=true');
  assert.equal(parseBooking('https://cal.com/roe').embed, 'https://cal.com/roe?embed=true');
  assert.equal(parseBooking('https://outlook.office365.com/owa/calendar/Roe@x.com/bookings/').provider, 'Microsoft Bookings');
  assert.deepEqual(parseBooking('https://example.com/book'), { provider: '', embed: '', link: 'https://example.com/book' });
  assert.equal(parseBooking('http://calendly.com/roe'), null);
  assert.equal(parseBooking('javascript:alert(1)'), null);
  assert.equal(parseBooking('https://calendly.com.evil.com/x').embed, '', 'look-alike hosts are only linked');
  for (const origin of ['https://calendly.com', 'https://outlook.office365.com', 'https://calendar.google.com']) assert.ok(CSP.includes(origin), origin);

  const doc = site();
  doc.site.email = 'a@b.c';
  doc.pages[0].sections = [
    { id: 'h', type: 'hero', data: { heading: 'Hi' } },
    { id: 'b1', type: 'booking', data: { ...BLOCKS.booking.defaults(), url: 'https://calendly.com/roe/30min' } },
    { id: 'b2', type: 'booking', data: { ...BLOCKS.booking.defaults(), url: 'https://example.com/book', button: 'Schedule now' } },
    { id: 'b3', type: 'booking', data: { ...BLOCKS.booking.defaults(), url: '' } },
  ];
  const live = renderPage(doc, 0);
  assert.match(live, /<iframe class="booking__frame" src="https:\/\/calendly.com\/roe\/30min" title="Book a time \(Calendly\)" loading="lazy">/);
  assert.match(live, /<a class="btn btn--primary btn--lg" href="https:\/\/example.com\/book" target="_blank" rel="noopener">Schedule now/);
  const editing = renderPage(doc, 0, { edit: true });
  assert.doesNotMatch(editing, /<iframe/, 'the editor shows a placeholder instead of the calendar');
  assert.match(editing, /Calendly calendar/);
  const { audit } = await import('../../assets/js/audit.js');
  assert.deepEqual(audit(doc).filter((r) => r.code === 'booking-link').map((r) => r.where.section), ['b3']);
});
