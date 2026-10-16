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

test('elements add headings, text, images, buttons, lines and space to any section', async () => {
  const { BLOCKS, ELEMENTS } = await import('../../assets/js/blocks.js');
  const { audit } = await import('../../assets/js/audit.js');
  const doc = site();
  doc.pages[0].sections = [
    { id: 'h', type: 'hero', data: { heading: 'Hi' } },
    { id: 'e', type: 'blank', data: { elements: [
      { type: 'heading', text: 'Our promise', size: 'large', align: 'center' },
      { type: 'text', text: 'Fast **help**.\nSecond line', width: 'half' },
      { type: 'image', image: 'assets/img/x.png', alt: 'Our office', size: 'small', width: 'half', align: 'right' },
      { type: 'button', label: 'Call us', href: '/contact/', style: 'outline' },
      { type: 'divider' }, { type: 'spacer', size: 'large' },
      { type: 'script', text: '<script>alert(1)</script>' },
      { type: 'heading', text: '<b>x</b>', size: 'huge"><script>', align: 'left" onclick="x', width: '9' },
    ] } },
  ];
  const live = renderPage(doc, 0);
  assert.match(live, /<div class="el el--full el--center"><h2 class="el-heading el-heading--large">Our promise<\/h2><\/div>/);
  assert.match(live, /<div class="el el--half el--left"><div class="el-text"><p>Fast <strong>help<\/strong>\.<br>Second line<\/p><\/div><\/div>/);
  assert.match(live, /<div class="el el--half el--right"><figure class="el-figure el-figure--small el-figure--round"><img src="\/assets\/img\/x.png" alt="Our office"/);
  assert.match(live, /<a class="btn btn--outline" href="\/contact\/"><span>Call us<\/span><\/a>/);
  assert.match(live, /<hr class="el-divider">/);
  assert.match(live, /el-spacer--large/);
  assert.doesNotMatch(live, /<script>alert|onclick|huge/, 'unknown types and settings are dropped, text is escaped');
  assert.match(live, /el-heading--medium">&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(live, /data-el=/, 'editor markers only appear while editing');

  // Elements work on every section, after its own content, and are editable in the editor
  doc.pages[0].sections[0].data.elements = [{ type: 'text', text: 'Under the hero' }];
  const editing = renderPage(doc, 0, { edit: true });
  assert.match(editing, /data-el="0"><div class="el-text" data-edit="elements\.0\.text" data-ph="Text" data-ml data-rich data-md><p>Under the hero/);
  assert.match(renderPage(doc, 0), /<\/div><div class="wrap"><div class="elements"><div class="el el--full el--left"><div class="el-text"><p>Under the hero/);
  doc.pages[0].sections[0].data.elements = [{ type: 'text', text: '- One\n- Two\n\n![Logo](assets/img/l.png)' }];
  assert.match(renderPage(doc, 0), /<ul><li>One<\/li><li>Two<\/li><\/ul><figure><img src="\/assets\/img\/l.png"/, 'lists and images work in text');

  // An empty section shows a hint while editing and nothing on the live site
  doc.pages[0].sections[1].data.elements = [];
  assert.match(renderPage(doc, 0, { edit: true }), /Empty section/);
  assert.doesNotMatch(renderPage(doc, 0), /Empty section|class="elements"[^]*Under the hero[^]*class="elements"/);

  // Checkup: placeholder text, image descriptions and button links
  doc.pages[0].sections[1].data = BLOCKS.blank.defaults();
  doc.pages[0].sections[1].data.elements.push({ ...ELEMENTS.image.defaults(), image: 'assets/img/x.png' }, { ...ELEMENTS.button.defaults(), href: '/missing/' });
  const found = audit(doc);
  assert.deepEqual(found.find((r) => r.code === 'sample-text' && r.where.section === 'e').where.fields, ['elements.0.text', 'elements.1.text']);
  assert.equal(found.find((r) => r.code === 'image-description' && r.where.section === 'e').where.field, 'elements.2.alt');
  assert.equal(found.find((r) => r.code === 'broken-link' && r.where.section === 'e').where.field, 'elements.3');
});

test('business hours: summary, open now in the business time zone, Google details and checks', async () => {
  const H = await import('../../assets/js/hours.js');
  const hours = { enabled: true, timezone: 'America/New_York', note: 'Emergencies by appointment.',
    week: { mon: '08:00-18:00', tue: '08:00-18:00', wed: '08:00-18:00', thu: '08:00-18:00', fri: '08:00-17:30', sat: '09:00-13:00', sun: '' } };
  assert.deepEqual(H.parseRange('08:00-18:00'), [480, 1080]);
  assert.deepEqual(H.parseRange('20:00-00:00'), [1200, 1440], 'closing at midnight');
  assert.equal(H.parseRange('18:00-08:00'), null);
  assert.equal(H.parseRange('8am-6pm'), null);
  assert.equal(H.fmtTime(480), '8am');
  assert.equal(H.fmtTime(810), '1:30pm');
  assert.equal(H.fmtTime(1440), 'midnight');
  assert.equal(H.hoursSummary(hours), 'Mon–Thu 8am–6pm · Fri 8am–5:30pm · Sat 9am–1pm · Sun closed');
  assert.equal(H.hoursSummary({ ...hours, enabled: false }), '');
  // Saturday 11:00 in New York (15:00 UTC)
  assert.deepEqual(H.openStatus(hours, new Date('2026-10-17T15:00:00Z')), { open: true, text: 'Open now · until 1pm' });
  // Saturday 7:00 in New York
  assert.deepEqual(H.openStatus(hours, new Date('2026-10-17T11:00:00Z')), { open: false, text: 'Closed · opens 9am' });
  // Friday 19:00 in New York, 23:00 UTC
  assert.deepEqual(H.openStatus(hours, new Date('2026-10-16T23:00:00Z')), { open: false, text: 'Closed · opens tomorrow 9am' });
  // Sunday noon: next opening is Monday
  assert.deepEqual(H.openStatus(hours, new Date('2026-10-18T16:00:00Z')), { open: false, text: 'Closed · opens tomorrow 8am' });
  assert.deepEqual(H.openStatus({ ...hours, week: { ...hours.week, mon: '' } }, new Date('2026-10-18T16:00:00Z')), { open: false, text: 'Closed · opens Tue 8am' });
  assert.equal(H.openStatus({ ...hours, timezone: 'Not/AZone' }, new Date()) !== null, true, 'a broken time zone falls back to the browser’s');
  assert.deepEqual(H.openingHoursLd(hours), [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], opens: '08:00', closes: '18:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Friday'], opens: '08:00', closes: '17:30' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '09:00', closes: '13:00' },
  ]);
  assert.deepEqual(H.hoursProblems({ ...hours, week: { ...hours.week, tue: '18:00-09:00' } }).map((p) => p.day), ['tue']);
  assert.match(H.hoursProblems({ enabled: true, week: {} })[0].message, /every day is closed/);

  // On the site: contact section, footer, the hours element and Google's details
  const { BLOCKS } = await import('../../assets/js/blocks.js');
  const doc = site();
  doc.site.hours = hours;
  doc.pages[0].sections.push({ id: 'c', type: 'contact', data: { ...BLOCKS.contact.defaults(), hours: 'Old text' } },
    { id: 'e', type: 'blank', data: { elements: [{ type: 'hours', show: 'week' }, { type: 'hours', show: 'summary' }] } });
  const live = renderPage(doc, 0);
  assert.match(live, /<small>Hours<\/small><span>Mon–Thu 8am–6pm · Fri 8am–5:30pm · Sat 9am–1pm · Sun closed<\/span><span class="open-status" data-open-status data-hours="\{&quot;enabled&quot;:true,&quot;timezone&quot;:&quot;America\/New_York&quot;/);
  assert.doesNotMatch(live, /Old text/, 'set hours replace the section’s own text');
  assert.match(live, /class="site-footer__hours">Mon–Thu/);
  assert.match(live, /<dl class="hours" data-tz="America\/New_York"><div class="hours__row" data-day="mon"><dt>Monday<\/dt><dd>8am–6pm<\/dd>/);
  assert.match(live, /data-day="sun"><dt>Sunday<\/dt><dd>Closed<\/dd>/);
  assert.match(live, /<p class="el-hours__line">Mon–Thu/);
  assert.match(live, /<p class="el-hours__note">Emergencies by appointment\.<\/p>/);
  assert.match(renderPage(doc, 0, { edit: true }), /class="open-status is-(open|closed)"[^>]*>(Open now|Closed)/, 'the editor shows the status right away');
  const built = buildSite(doc, { origin: 'https://x.com' }).files.get('index.html');
  assert.match(built, /"openingHoursSpecification":\[\{"@type":"OpeningHoursSpecification","dayOfWeek":\["Monday","Tuesday","Wednesday","Thursday"\],"opens":"08:00","closes":"18:00"\}/);
  doc.site.hours.enabled = false;
  assert.match(renderPage(doc, 0), /<small>Hours<\/small><span>Old text<\/span>/, 'without hours the section text is used');
});

test('call button: floating on phones (or everywhere), needs a phone number', async () => {
  const { audit } = await import('../../assets/js/audit.js');
  const doc = site();
  doc.site.callButton = { enabled: true };
  assert.doesNotMatch(renderPage(doc, 0), /callbar/, 'no phone, no button');
  assert.equal(audit(doc).find((r) => r.code === 'call-button').where.field, 'phone');
  doc.site.phone = '+1 (555) 123-4567';
  assert.match(renderPage(doc, 0), /<div class="callbar callbar--phones"><a class="callbar__btn" href="tel:\+15551234567"><svg[^]*?<span>Call now<\/span><\/a><\/div>/);
  doc.site.callButton = { enabled: true, label: 'Ring <us>', text: true, show: 'all' };
  const html = renderPage(doc, 0);
  assert.match(html, /callbar callbar--all/);
  assert.match(html, /<span>Ring &lt;us&gt;<\/span>/);
  assert.match(html, /<a class="callbar__btn callbar__btn--alt" href="sms:\+15551234567">[^]*?<span>Text us<\/span>/);
  assert.equal(audit(doc).filter((r) => r.code === 'call-button').length, 0);
  doc.site.callButton.enabled = false;
  assert.doesNotMatch(renderPage(doc, 0), /callbar/);
});

test('quote request form asks the chosen questions and counts as a form', async () => {
  const { BLOCKS } = await import('../../assets/js/blocks.js');
  const { audit } = await import('../../assets/js/audit.js');
  const doc = site();
  doc.site.email = 'a@b.c';
  doc.pages[0].sections.push({ id: 'q', type: 'quote', data: { ...BLOCKS.quote.defaults(), intro: 'Tell us more.', questions: [
    { label: 'Home or business?', type: 'radio', options: 'Home, Business', required: true },
    { label: 'Services', type: 'checkboxes', options: 'Wi-Fi, <b>Cameras</b>', required: true },
    { label: 'Devices', type: 'select', options: '1–5, 6+' },
    { label: 'Name', type: 'text' },
    { label: '_gotcha', type: 'textarea', required: true },
    { label: '   ', type: 'text' },
    { label: 'Pick one', type: 'radio', options: '' },
  ] } });
  const html = renderPage(doc, 0);
  const form = html.match(/<form class="contact__form quote__form"[^]*?<\/form>/)[0];
  assert.match(form, /data-subject="Quote request" data-endpoint="" data-email="a@b.c"/);
  assert.match(form, /<legend>Home or business\?<\/legend><label class="choice"><input type="radio" name="Home or business\?" value="Home" required>/);
  assert.match(form, /<fieldset class="choices" data-required><legend>Services<\/legend>/);
  assert.match(form, /value="&lt;b&gt;Cameras&lt;\/b&gt;"><span>&lt;b&gt;Cameras&lt;\/b&gt;<\/span>/);
  assert.match(form, /<span>Devices <em>\(optional\)<\/em><\/span><select name="Devices"><option value="">Choose…<\/option><option>1–5<\/option><option>6\+<\/option><\/select>/);
  assert.match(form, /<input name="Name \(4\)"/, 'a question can’t take over the name field');
  assert.match(form, /<textarea name="gotcha \(5\)" rows="4" maxlength="3000" required>/, 'or the spam trap');
  assert.match(form, /<span>Pick one <em>\(optional\)<\/em><\/span><input name="Pick one"/, 'a choice without choices becomes a text box');
  assert.equal((form.match(/<label/g) || []).length, 13, 'the blank question is left out');
  assert.match(form, /name="message"/);

  // Without an endpoint and without an email the form can't send anything
  delete doc.site.email;
  assert.match(audit(doc).find((r) => r.code === 'form-destination' && r.level === 'error').message, /^The quote request form has nowhere to send/);
  // The starter questions and the thank-you message are fine as they are
  doc.site.email = 'a@b.c';
  doc.pages[0].sections[1].data = { ...BLOCKS.quote.defaults(), heading: 'Get a price', intro: 'Quick questions.' };
  assert.equal(audit(doc).filter((r) => r.code === 'sample-text' && r.where.section === 'q').length, 0);
});

test('resource links group by topic, show where they lead and are checked', async () => {
  const { BLOCKS } = await import('../../assets/js/blocks.js');
  const { audit } = await import('../../assets/js/audit.js');
  const doc = site();
  doc.pages[0].sections.push({ id: 'r', type: 'resources', data: { ...BLOCKS.resources.defaults(), items: [
    { title: 'Secure Our World', text: 'Four easy ways.', url: 'https://www.cisa.gov/secure-our-world', category: 'Safety', icon: 'shield-check' },
    { title: 'Our services', text: 'What we do.', url: '/about/', category: 'Safety' },
    { title: 'Report fraud', text: '', url: 'https://reportfraud.ftc.gov/', category: 'Help' },
    { title: 'Bad', url: 'javascript:alert(1)', category: 'Help' },
    { title: 'Missing page', url: '/nope/', category: 'Help' },
    { title: '', url: 'https://x.com' },
  ] } });
  const html = renderPage(doc, 0);
  assert.match(html, /<h3 class="res-group__title">Safety<\/h3>[^]*Secure Our World[^]*Our services[^]*<h3 class="res-group__title">Help<\/h3>[^]*Report fraud/);
  assert.match(html, /<a class="res" href="https:\/\/www.cisa.gov\/secure-our-world" target="_blank" rel="noopener">/);
  assert.match(html, /<small class="res__src">cisa.gov <svg/);
  assert.match(html, /<a class="res" href="\/about\/"><span/, 'links on the site open in the same tab');
  assert.doesNotMatch(html, /javascript:/);
  assert.equal((html.match(/class="res"/g) || []).length, 5, 'untitled links are left out');
  const found = audit(doc);
  assert.deepEqual(found.filter((r) => r.code === 'resource-link').map((r) => r.where.field), ['items.3.url']);
  assert.equal(found.find((r) => r.code === 'broken-link' && r.where.field === 'items.4.url')?.where.section, 'r');
  assert.equal(found.filter((r) => r.code === 'sample-text' && r.where.fields?.some((f) => f.startsWith('items'))).length, 0, 'the starter links are real');
});

test('blog posts: reading time, share links, related posts and richer search data', async () => {
  const doc = site({ posts: [
    { id: 'a', slug: 'a', kind: 'post', title: 'Backups 101', date: '2026-10-01', published: true, tags: 'Security, Backups', body: Array(450).fill('word').join(' ') },
    { id: 'b', slug: 'b', kind: 'post', title: 'Wi-Fi tips', date: '2026-10-05', published: true, tags: 'Networking', body: 'Short.' },
    { id: 'c', slug: 'c', kind: 'post', title: 'Ransomware', date: '2026-09-01', published: true, tags: 'security', body: 'Text.' },
    { id: 'd', slug: 'd', kind: 'post', title: 'Draft', date: '2026-09-02', published: false, tags: 'Security', body: 'x' },
  ] });
  doc.pages[1].sections.push({ id: 'f', type: 'faq', data: { items: [{ q: 'Do you **really** help homes?', a: 'Yes, [we do](/contact/).' }, { q: '', a: 'skip' }] } });
  doc.pages.push({ title: 'Blog', slug: 'blog', sections: [{ id: 'bf', type: 'blogfeed', data: {} }] });
  const { files } = buildSite(doc, { origin: 'https://example.com' });
  const a = files.get('blog/a/index.html');
  assert.match(a, /<span class="post-meta__read">2 min read<\/span>/);
  assert.match(a, /href="https:\/\/www.linkedin.com\/sharing\/share-offsite\/\?url=https%3A%2F%2Fexample.com%2Fblog%2Fa%2F"/);
  assert.match(a, /data-copy="https:\/\/example.com\/blog\/a\/"/);
  const related = a.match(/<section class="sec sec--alt pad--normal related"[^]*?<\/section>/)[0];
  assert.ok(related.indexOf('Ransomware') < related.indexOf('Wi-Fi tips'), 'shared tags first');
  assert.doesNotMatch(related, /Draft|Backups 101/);
  assert.match(a, /"@type":"BreadcrumbList".*"name":"Blog","item":"https:\/\/example.com\/blog\/"}.*"name":"Backups 101"/);
  assert.match(a, /"wordCount":450/);
  const about = files.get('about/index.html');
  assert.match(about, /"@type":"FAQPage","mainEntity":\[\{"@type":"Question","name":"Do you really help homes\?","acceptedAnswer":\{"@type":"Answer","text":"Yes, we do."\}\}\]/);
  assert.match(about, /"@type":"BreadcrumbList","itemListElement":\[\{"@type":"ListItem","position":1,"name":"Biz","item":"https:\/\/example.com\/"\},\{"@type":"ListItem","position":2,"name":"About","item":"https:\/\/example.com\/about\/"\}\]/);
  assert.doesNotMatch(files.get('index.html'), /BreadcrumbList/, 'the home page needs no trail');
});

test('visitor stats: only a valid ID adds the chosen service, and the security policy allows just that', async () => {
  const { audit } = await import('../../assets/js/audit.js');
  const doc = site();
  const home = () => buildSite(doc, { origin: 'https://example.com' }).files.get('index.html');
  assert.doesNotMatch(home(), /cloudflareinsights|goatcounter/);
  doc.site.analytics = { provider: 'cloudflare', id: '0123456789abcdef0123456789abcdef' };
  let html = home();
  assert.match(html, /<script defer src="https:\/\/static.cloudflareinsights.com\/beacon.min.js" data-cf-beacon="\{&quot;token&quot;:&quot;0123456789abcdef0123456789abcdef&quot;\}"><\/script>/);
  assert.match(html, /script-src 'self' https:\/\/static.cloudflareinsights.com;/);
  assert.match(buildSite(doc, { origin: 'https://example.com' }).files.get('about/index.html'), /cloudflareinsights/, 'on every page');
  doc.site.analytics = { provider: 'goatcounter', id: 'roetech' };
  html = home();
  assert.match(html, /<script data-goatcounter="https:\/\/roetech.goatcounter.com\/count" async src="https:\/\/gc.zgo.at\/count.js"><\/script>/);
  assert.match(html, /script-src 'self' https:\/\/gc.zgo.at;/);
  assert.doesNotMatch(html, /cloudflareinsights/);
  for (const bad of ['"><script>alert(1)</script>', 'roe tech', 'evil.com/x']) {
    doc.site.analytics = { provider: 'goatcounter', id: bad };
    assert.doesNotMatch(home(), /goatcounter|alert\(1\)|evil/);
    assert.match(home(), /script-src 'self';/);
    assert.equal(audit(doc).find((r) => r.code === 'analytics').where.field, 'analytics.id');
  }
  doc.site.analytics = { provider: 'cloudflare', id: 'short' };
  assert.match(audit(doc).find((r) => r.code === 'analytics').message, /32 letters and numbers/);
});

test('review button: testimonials and the review element link to the review page', async () => {
  const { BLOCKS } = await import('../../assets/js/blocks.js');
  const { audit } = await import('../../assets/js/audit.js');
  const doc = site();
  doc.pages[0].sections.push({ id: 't', type: 'testimonials', data: { ...BLOCKS.testimonials.defaults(), items: [{ quote: 'Great.', name: 'Pat', role: 'Owner' }], reviewButton: true } },
    { id: 'e', type: 'blank', data: { elements: [{ type: 'review', label: 'Rate us', style: 'outline', align: 'center' }] } });
  assert.doesNotMatch(renderPage(doc, 0), /quotes__review|Rate us/, 'no review page, no button');
  assert.match(renderPage(doc, 0, { edit: true }), /Add your review page in Settings/);
  assert.deepEqual(audit(doc).filter((r) => r.code === 'review-link').map((r) => r.where.field), ['reviewUrl', 'reviewUrl']);
  doc.site.reviewUrl = 'https://g.page/r/abc123/review';
  const html = renderPage(doc, 0);
  assert.match(html, /<div class="btns quotes__review"><a class="btn btn--outline" href="https:\/\/g.page\/r\/abc123\/review" target="_blank" rel="noopener"><svg[^]*?<span>Leave us a review<\/span><\/a><\/div>/);
  assert.match(html, /<div class="el el--full el--center"><div class="btns el-btns"><a class="btn btn--outline" href="https:\/\/g.page\/r\/abc123\/review"[^]*?<span>Rate us<\/span>/);
  assert.equal(audit(doc).filter((r) => r.code === 'review-link').length, 0);
  doc.site.reviewUrl = 'javascript:alert(1)';
  assert.doesNotMatch(renderPage(doc, 0), /javascript:/);
  assert.match(audit(doc).find((r) => r.code === 'review-link').message, /must be a full address/);
});

test('icon box, checklist, quote and video elements', async () => {
  const { audit } = await import('../../assets/js/audit.js');
  const doc = site();
  doc.pages[0].sections.push({ id: 'e', type: 'blank', data: { elements: [
    { type: 'feature', icon: 'wifi', title: 'Fast Wi-Fi', text: 'Coverage in every room.', width: 'third' },
    { type: 'checklist', style: 'check', items: [{ text: 'Backups' }, { text: '' }, { text: 'Updates <b>' }] },
    { type: 'checklist', style: 'number', items: [{ text: 'One' }] },
    { type: 'quote', text: 'They fixed it in an hour.', name: 'Pat' },
    { type: 'video', url: 'https://youtu.be/dQw4w9WgXcQ', caption: 'How we work' },
    { type: 'video', url: 'not a video' },
  ] } });
  const html = renderPage(doc, 0);
  assert.match(html, /<div class="el el--third el--left"><div class="el-feature"><span class="el-feature__icon"><svg[^]*?<\/span><h2 class="el-feature__title">Fast Wi-Fi<\/h2><p class="el-feature__text">Coverage in every room\.<\/p>/);
  assert.match(html, /<ul class="el-list el-list--check"><li><span class="el-list__mark"><svg[^]*?<\/span><span>Backups<\/span><\/li><li><span class="el-list__mark">[^]*?<span>Updates &lt;b&gt;<\/span><\/li><\/ul>/);
  assert.equal((html.match(/el-list--check[^]*?<\/ul>/)[0].match(/<li>/g) || []).length, 2, 'empty points are left out');
  assert.match(html, /<ol class="el-list el-list--number"><li><span>One<\/span><\/li><\/ol>/);
  assert.match(html, /<figure class="el-quote"><blockquote><p>They fixed it in an hour\.<\/p><\/blockquote><figcaption>Pat<\/figcaption><\/figure>/);
  assert.match(html, /<div class="video" data-embed="https:\/\/www.youtube-nocookie.com\/embed\/dQw4w9WgXcQ\?autoplay=1&amp;rel=0">/);
  assert.match(html, /<p class="video__caption">How we work<\/p>/);
  assert.equal((html.match(/class="video"/g) || []).length, 1, 'a bad video link shows nothing on the live site');
  assert.match(renderPage(doc, 0, { edit: true }), /Paste a YouTube or Vimeo link/);
  doc.pages[0].sections[1].data.elements.push({ type: 'video', url: '' });
  assert.equal(audit(doc).find((r) => r.code === 'video-link').where.field, 'elements.6.url');
});

test('blog search box: matching words on each card, every word must match, combined with the tag', async () => {
  const { feedMatch } = await import('../../assets/js/enhance.js');
  const doc = site({ posts: [
    { id: 'a', slug: 'a', kind: 'post', title: 'Backups 101', summary: 'Keep three copies', date: '2026-10-01', published: true, tags: 'Security', body: 'Use an **external drive**.' },
    { id: 'b', slug: 'b', kind: 'post', title: 'Wi-Fi tips', date: '2026-10-05', published: true, tags: 'Networking', body: 'Move the router.' },
  ] });
  doc.pages.push({ title: 'Blog', slug: 'blog', sections: [{ id: 'bf', type: 'blogfeed', data: { limit: 'all', search: true, showTags: true } }] });
  const html = renderPage(doc, doc.pages.length - 1);
  assert.match(html, /<input type="search" placeholder="Search posts" aria-label="Search the blog" autocomplete="off" data-blog-search>/);
  assert.match(html, /data-tags="security" data-text="backups 101 keep three copies security use an external drive/);
  assert.match(html, /<p class="blogfeed__none" role="status" aria-live="polite"><\/p>/);
  const off = structuredClone(doc);
  off.pages.at(-1).sections[0].data.search = false;
  assert.doesNotMatch(renderPage(off, off.pages.length - 1), /data-blog-search|data-text=/);

  const card = { tags: 'security|backups', text: 'backups 101 keep three copies' };
  assert.ok(feedMatch(card, '', ''));
  assert.ok(feedMatch(card, 'security', 'Three  BACKUPS'));
  assert.ok(!feedMatch(card, 'networking', ''));
  assert.ok(!feedMatch(card, '', 'backups router'));
});

test('announcement bar dates: hidden before the start, gone after the end, a note in the editor', async () => {
  const { announceWindow, renderHeader } = await import('../../assets/js/render.js');
  const { audit } = await import('../../assets/js/audit.js');
  assert.deepEqual(announceWindow({}, '2026-10-16'), { start: '', end: '', state: 'live' });
  assert.equal(announceWindow({ start: '2026-10-20' }, '2026-10-16').state, 'before');
  assert.equal(announceWindow({ start: '2026-10-16', end: '2026-10-16' }, '2026-10-16').state, 'live');
  assert.equal(announceWindow({ end: '2026-10-15' }, '2026-10-16').state, 'after');
  assert.equal(announceWindow({ start: 'soon', end: '10/31' }, '2026-10-16').state, 'live', 'odd values are ignored');

  const doc = site();
  const bar = (ann, edit = false) => {
    const d = { ...doc, site: { ...doc.site, announcement: { enabled: true, text: 'Holiday hours', ...ann } } };
    return renderHeader(d, 0, { edit, site: d }).match(/^<div class="announce[^]*?<\/div><\/div>/)?.[0] || '';
  };
  assert.match(bar({ start: '2999-01-01', end: '2999-01-31' }), /^<div class="announce" data-start="2999-01-01" data-end="2999-01-31" hidden>/);
  assert.match(bar({ end: '2999-01-31' }), /^<div class="announce" data-end="2999-01-31">/);
  assert.equal(bar({ end: '2000-01-31' }), '', 'an ended announcement is left out');
  assert.match(bar({}), /^<div class="announce">/);
  assert.match(bar({ end: '2000-01-31' }, true), /class="announce is-off"[^]*<span class="announce__note">Ended Jan 31, 2000 · visitors don’t see it<\/span>/);
  assert.match(bar({ start: '2999-01-01', end: '2999-01-31' }, true), /Starts Jan 1, 2999 · ends Jan 31, 2999/);
  assert.match(bar({ end: '2999-01-31' }, true), /class="announce" [^]*Showing until Jan 31, 2999/);

  const check = (ann) => audit({ ...doc, site: { ...doc.site, announcement: { enabled: true, text: 'Hi', ...ann } } }).filter((p) => p.code === 'announcement-dates');
  assert.equal(check({ start: '2999-02-01', end: '2999-01-01' })[0].level, 'warning');
  assert.equal(check({ end: '2000-01-01' })[0].level, 'tip');
  assert.deepEqual(check({ end: '2999-01-01' }), []);
});

test('page not found: own wording, and links to the menu pages', async () => {
  const { renderNotFound, NOT_FOUND } = await import('../../assets/js/render.js');
  const doc = site();
  const plain = renderNotFound(doc);
  assert.match(plain, new RegExp(`<h1 class="sec-title">${NOT_FOUND.heading}</h1>`));
  assert.match(plain, /<ul class="notfound__links" aria-label="Pages on this site"><li><a href="\/about\/">About /);
  assert.doesNotMatch(plain, /href="\/(secret|landing|hidden)\/"/, 'only published menu pages');
  doc.site.notFound = { heading: 'Lost?', text: 'Call **us** instead.', button: '', links: false };
  const own = renderNotFound(doc);
  assert.match(own, /<h1 class="sec-title">Lost\?<\/h1>/);
  assert.match(own, /<p class="sec-intro">Call <strong>us<\/strong> instead.<\/p>/);
  assert.match(own, new RegExp(`>${NOT_FOUND.button}</a>`), 'an empty field keeps the standard wording');
  assert.doesNotMatch(own, /notfound__links/);
  doc.site.notFound = { links: true };
  doc.posts = [{ id: 'p', slug: 'p', kind: 'post', title: 'Fresh post', date: '2026-01-01', published: true, body: 'x' }];
  assert.match(renderNotFound(doc), /href="\/blog\/p\/">Fresh post/, 'recent posts when no page lists them all');
});

test('posts: numbered lists keep their numbers, tick-box checklists, heading links and a contents list', async () => {
  const { postHeadings, headingSlugger } = await import('../../assets/js/render.js');
  assert.match(markdown('## One\n1. a\n## Two\n4. b\n5. c'), /<ol><li>a<\/li><\/ol><h2>Two<\/h2><ol start="4"><li>b<\/li><li>c<\/li><\/ol>/);
  assert.equal(markdown('- [ ] Do **this**\n- [x] Done'),
    '<ul class="tasks"><li class="task"><label><input type="checkbox" data-task><span>Do <strong>this</strong></span></label></li><li class="task"><label><input type="checkbox" data-task checked><span>Done</span></label></li></ul>');
  assert.equal(markdown('- [link](/x/) plain'), '<ul><li><a href="/x/">link</a> plain</li></ul>', 'ordinary lists are unchanged');
  assert.equal(markdown('## Hi *there*\n### Hi there\n#### Small', undefined, { ids: true }), '<h2 id="hi-there">Hi <em>there</em></h2><h3 id="hi-there-2">Hi there</h3><h4>Small</h4>');
  assert.doesNotMatch(markdown('## Plain'), /id=/, 'ids only when asked');
  const slug = headingSlugger();
  assert.deepEqual(['Main', 'Café & Wi‑Fi!', '***'].map(slug), ['main-2', 'cafe-wi-fi', 'section']);
  assert.equal(postHeadings('## 1. Wi-Fi & **fast** [links](/x/)')[0].text, '1. Wi-Fi & fast links');
  assert.deepEqual(postHeadings('## A\n```\n## not a heading\n```\n### B\n#### C\n## A'), [
    { level: 2, text: 'A', id: 'a' }, { level: 3, text: 'B', id: 'b' }, { level: 2, text: 'A', id: 'a-2' }]);

  const body = '## First part\nText.\n### Detail\nMore.\n## Second part\n- [ ] Tick me\n## Third part\nEnd.';
  const doc = site({ posts: [{ id: 'a', slug: 'a', kind: 'post', title: 'Guide', date: '2026-10-01', published: true, body }, { id: 'b', slug: 'b', kind: 'post', title: 'Short', date: '2026-10-02', published: true, body: '## Only\nOne heading.' }] });
  const { files } = buildSite(doc, { origin: 'https://example.com' });
  const guide = files.get('blog/a/index.html');
  assert.match(guide, /<nav class="post__toc" aria-labelledby="toc-title">.*In this post<\/p><ul><li><a href="#first-part">First part<\/a><\/li><li class="sub"><a href="#detail">Detail<\/a><\/li><li><a href="#second-part">Second part<\/a><\/li><li><a href="#third-part">Third part<\/a><\/li><\/ul><\/nav>/);
  for (const id of ['first-part', 'detail', 'second-part', 'third-part']) assert.match(guide, new RegExp(`<h[23] id="${id}">`));
  assert.match(guide, /<input type="checkbox" data-task>/);
  assert.match(guide, /data-print title="Print" aria-label="Print this post"/);
  assert.doesNotMatch(files.get('blog/b/index.html'), /post__toc/, 'short posts need no contents list');
  doc.posts[0].toc = false;
  assert.doesNotMatch(buildSite(doc, { origin: 'https://example.com' }).files.get('blog/a/index.html'), /post__toc/, 'can be turned off per post');
});

test('posts can show when they were last updated', async () => {
  const { postUpdated } = await import('../../assets/js/render.js');
  assert.equal(postUpdated({ date: '2026-10-01', updated: '2026-10-20' }), '2026-10-20');
  assert.equal(postUpdated({ date: '2026-10-01', updated: '2026-10-01' }), '', 'not the same day');
  assert.equal(postUpdated({ date: '2026-10-01', updated: '2026-09-01' }), '', 'not before the post');
  assert.equal(postUpdated({ date: '2026-10-01', updated: 'soon' }), '');
  const doc = site({ posts: [{ id: 'a', slug: 'a', kind: 'post', title: 'Guide', date: '2026-10-01', updated: '2026-10-20', published: true, body: 'Text.' }] });
  const { files } = buildSite(doc, { origin: 'https://example.com' });
  const page = files.get('blog/a/index.html');
  assert.match(page, /<span class="post-meta__updated">Updated <time datetime="2026-10-20">Oct 20, 2026<\/time><\/span>/);
  assert.match(page, /"datePublished":"2026-10-01","dateModified":"2026-10-20"/);
  assert.match(files.get('sitemap.xml'), /\/blog\/a\/<\/loc><lastmod>2026-10-20<\/lastmod>/);
  delete doc.posts[0].updated;
  const plain = buildSite(doc, { origin: 'https://example.com' }).files.get('blog/a/index.html');
  assert.doesNotMatch(plain, /post-meta__updated/);
  assert.match(plain, /"dateModified":"2026-10-01"/);
});

test('headings never skip a level: item titles move up when a section has no heading', async () => {
  const { BLOCKS } = await import('../../assets/js/blocks.js');
  const doc = site();
  const services = { ...BLOCKS.services.defaults() };
  doc.pages[1].sections = [
    { id: 'h', type: 'hero', data: { heading: 'About us' } },
    { id: 'a', type: 'services', data: { ...services, heading: 'What we do' } },
    { id: 'b', type: 'services', data: { ...services, eyebrow: '', heading: '', intro: '' } },
    { id: 'c', type: 'resources', data: { heading: '', items: [{ title: 'A', url: 'https://a.example', category: 'One' }, { title: 'B', url: 'https://b.example', category: 'Two' }] } },
  ];
  const html = renderPage(doc, 1);
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  levels.forEach((n, i) => assert.ok(i === 0 || n <= levels[i - 1] + 1, `h${levels[i - 1]} is followed by h${n}`));
  assert.match(html, /<h2 class="sec-title">What we do<\/h2>[^]*?<h3 class="feature__title">/, 'under a heading, items are h3');
  const b = html.split('blk-services')[2];
  assert.match(b, /<h2 class="feature__title">/, 'without a heading, items are h2');
  assert.match(html, /<h2 class="res-group__title">One<\/h2>/);
  assert.match(html, /<h2 class="site-footer__title">Pages<\/h2>/);
  assert.doesNotMatch(html, /<h4/);
});
