import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { audit } from '../../assets/js/audit.js';
import { migrate } from '../../assets/js/schema.js';
import { BLOCKS } from '../../assets/js/blocks.js';

const live = migrate(JSON.parse(await readFile(new URL('../../content/site.json', import.meta.url), 'utf8')));
const codes = (doc) => audit(doc).map((r) => r.code);
const find = (doc, code) => audit(doc).filter((r) => r.code === code);

const base = (pages, extra = {}) => migrate({
  version: 2,
  site: { name: 'Biz', description: 'We fix computers.', email: 'a@b.c', shareImage: 'assets/s.png', ...extra.site },
  pages,
  posts: extra.posts || [],
  redirects: extra.redirects || [],
});
const hero = (heading = 'Welcome', more = {}) => ({ id: `h-${heading}`, type: 'hero', data: { layout: 'center', heading, ...more } });

test('the published site has no errors or warnings', () => {
  assert.deepEqual(audit(live).filter((r) => r.level !== 'tip').map((r) => r.message), []);
});

test('results are sorted errors first and say where the problem is', () => {
  const doc = base([{ title: 'Home', sections: [hero(), { id: 'c', type: 'contact', data: { showForm: true } }] }], { site: { email: '' } });
  const r = audit(doc);
  assert.equal(r[0].level, 'error');
  assert.equal(r[0].code, 'form-destination');
  assert.deepEqual(r[0].where, { kind: 'site', field: 'email' });
  assert.ok(r.every((x, i) => i === 0 || ['error', 'warning', 'tip'].indexOf(x.level) >= ['error', 'warning', 'tip'].indexOf(r[i - 1].level)));
});

test('content problems from validate() are errors', () => {
  const doc = base([{ title: 'Home', sections: [hero()] }, { title: 'A', slug: 'a', sections: [hero('A')] }, { title: 'B', slug: 'a', sections: [hero('B')] }]);
  assert.ok(find(doc, 'invalid').some((r) => r.level === 'error' && /Two pages/.test(r.message)));
});

test('broken links, old links, unpublished targets, missing anchors and empty buttons', () => {
  const doc = base([
    { title: 'Home', sections: [
      hero('Welcome', { primary: { label: 'Go', href: '/nope/' }, secondary: { label: 'Later', href: '' } }),
      { id: 't', type: 'text', data: { heading: 'Hi', text: 'See [old](#/contact), [draft](/secret/), [jump](#missing), [ok](/about/#team) and [file](/feed.xml).' } },
    ] },
    { title: 'About', slug: 'about', sections: [hero('About', {}), { id: 'team', type: 'text', data: { heading: 'Team', anchor: 'team' } }] },
    { title: 'Secret', slug: 'secret', draft: true, sections: [hero('Secret')] },
  ], { posts: [{ id: 'p1', kind: 'post', slug: 'x', title: 'X', summary: 'S', body: 'Read [this](/gone/).', date: '2026-01-01' }] });
  const msgs = audit(doc).map((r) => r.message).join('\n');
  assert.match(msgs, /“Go” button in “Hero” on “Home” goes to \/nope\/, which doesn’t exist/);
  assert.match(msgs, /“Later” button .* doesn’t go anywhere yet/);
  assert.match(msgs, /old-style address \(#\/contact\)\. Use \/contact\/ instead/);
  assert.match(msgs, /goes to \/secret\/, which isn’t published/);
  assert.match(msgs, /jumps to #missing/);
  assert.match(msgs, /in “X” goes to \/gone\//);
  assert.doesNotMatch(msgs, /\/about\/#team|feed\.xml/);
  const btn = find(doc, 'button-no-link')[0];
  assert.deepEqual(btn.where, { kind: 'page', page: 0, section: 'h-Welcome', field: 'secondary' });
});

test('pages without a main headline, with two, or with nothing on them', () => {
  const doc = base([
    { title: 'Home', sections: [hero(), hero('Again')] },
    { title: 'Logos', slug: 'logos', sections: [{ id: 'l', type: 'logos', data: { items: [{ name: 'X' }] } }] },
    { title: 'Empty', slug: 'empty', sections: [{ id: 'e', type: 'text', hidden: true, data: { heading: 'x' } }] },
    { title: 'Draft', slug: 'draft', draft: true, sections: [] },
  ]);
  assert.match(find(doc, 'many-h1')[0].message, /“Home” has 2 main headlines/);
  assert.match(find(doc, 'no-h1')[0].message, /“Logos” has no main headline/);
  assert.match(find(doc, 'empty-page')[0].message, /“Empty” has nothing on it/);
  assert.ok(!audit(doc).some((r) => r.where.page === 3), 'unpublished pages are not checked');
});

test('leftover sample text is found and grouped per section', () => {
  const services = { id: 's', type: 'services', data: BLOCKS.services.defaults() };
  const doc = base([{ title: 'Home', sections: [hero(), services, { id: 'st', type: 'steps', data: { heading: 'How', items: [{ title: 'Plan', text: 'We plan it.' }] } }] }]);
  const r = find(doc, 'sample-text');
  assert.equal(r.length, 1, 'one result per section, and real one-word titles like “Plan” are fine');
  assert.equal(r[0].where.section, 's');
  assert.ok(r[0].where.fields.includes('items.0.text'));
  assert.match(r[0].message, /still has sample text: “.+” and \d+ more/);
});

test('search engine titles and descriptions', () => {
  const doc = base([
    { title: 'Home', noindex: true, sections: [hero()] },
    { title: 'A', slug: 'a', seoTitle: 'Same', seoDescription: 'x'.repeat(170), sections: [hero('A')] },
    { title: 'B', slug: 'b', seoTitle: 'Same', sections: [hero('B')] },
  ], { site: { description: '', shareImage: '' } });
  const c = codes(doc);
  for (const code of ['noindex-home', 'duplicate-title', 'long-description', 'page-description', 'site-description', 'share-image']) assert.ok(c.includes(code), code);
});

test('contact form destinations', () => {
  const page = [{ title: 'Home', sections: [hero(), { id: 'c', type: 'contact', data: { showForm: true } }] }];
  assert.ok(!codes(base(page)).some((c) => c.startsWith('form-')), 'email is enough');
  assert.equal(find(base(page, { site: { email: '', formEndpoint: 'formspree.io/f/x' } }), 'form-endpoint')[0].level, 'error');
  assert.equal(find(base(page, { site: { formEndpoint: 'formspree.io/f/x' } }), 'form-endpoint')[0].level, 'warning');
  assert.ok(!codes(base(page, { site: { email: '', formEndpoint: 'https://formspree.io/f/x' } })).some((c) => c.startsWith('form-')));
  const hiddenForm = [{ title: 'Home', sections: [hero(), { id: 'c', type: 'contact', data: { showForm: false } }] }];
  assert.ok(!codes(base(hiddenForm, { site: { email: '' } })).includes('form-destination'));
});

test('blog posts and redirects', () => {
  const doc = base([{ title: 'Home', sections: [hero()] }, { title: 'About', slug: 'about', sections: [hero('About')] }], {
    posts: [
      { id: '1', kind: 'post', slug: 'untitled-post', title: 'Untitled post', body: '', date: '2026-01-01' },
      { id: '2', kind: 'post', slug: 'hidden', title: 'Hidden', body: '', published: false, date: '2026-01-01' },
    ],
    redirects: [{ from: '/about/', to: '/' }, { from: '/old/', to: '/old/' }, { from: '/older/', to: '/missing/' }, { from: '/fine/', to: '/about/' }],
  });
  const c = codes(doc);
  for (const code of ['post-title', 'post-empty', 'post-summary', 'redirect-unused', 'redirect-loop', 'redirect-broken']) assert.ok(c.includes(code), code);
  assert.ok(!audit(doc).some((r) => r.where.post === '2'), 'unpublished posts are not checked');
  assert.equal(find(doc, 'redirect-broken').length, 1);
});
