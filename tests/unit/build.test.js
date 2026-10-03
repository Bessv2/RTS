import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSite, staleFiles, CSP } from '../../assets/js/build.js';
import { migrate, validate } from '../../assets/js/schema.js';

const doc = migrate(JSON.parse(await readFile(new URL('../../content/site.json', import.meta.url), 'utf8')));
const { files, paths } = buildSite(doc, { origin: 'https://example.com' });
const html = [...files].filter(([p]) => p.endsWith('.html'));

test('the published content is valid', () => {
  assert.deepEqual(validate(doc), []);
});

test('every page and published post gets its own HTML file', () => {
  assert.ok(files.has('index.html'));
  doc.pages.slice(1).forEach((p) => assert.ok(files.has(`${p.slug}/index.html`), p.slug));
  doc.posts.filter((p) => p.published !== false).forEach((p) => assert.ok(files.has(`blog/${p.slug}/index.html`), p.slug));
  for (const f of ['404.html', 'sitemap.xml', 'feed.xml', 'robots.txt', 'generated.json']) assert.ok(files.has(f), f);
  assert.deepEqual(JSON.parse(files.get('generated.json')).files, paths.filter((p) => p !== 'generated.json'));
});

test('pages are complete, secure documents with real links', () => {
  for (const [path, page] of html) {
    assert.ok(page.includes(`content="${CSP}"`), `${path} has the CSP`);
    assert.match(page, /<title>[^<]+<\/title>/, `${path} has a title`);
    assert.match(page, /<main id="main">/, `${path} has main content`);
    assert.doesNotMatch(page, /href="#\//, `${path} has no old hash links`);
    for (const m of page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) JSON.parse(m[1]);
  }
  assert.match(files.get('index.html'), /<link rel="canonical" href="https:\/\/roetechnologyservices\.com\/">/);
  assert.match(files.get('404.html'), /noindex/);
});

test('drafts are excluded everywhere', () => {
  const withDraft = structuredClone(doc);
  withDraft.posts.push({ id: 'd', kind: 'post', slug: 'secret-draft', title: 'Secret draft', date: '2030-01-01', published: false, body: 'x' });
  const out = buildSite(withDraft, {});
  assert.ok(!out.files.has('blog/secret-draft/index.html'));
  for (const [, c] of out.files) assert.doesNotMatch(c, /secret-draft|Secret draft/);
});

test('sitemap and feed list the right URLs', () => {
  const sitemap = files.get('sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/roetechnologyservices\.com\/<\/loc>/);
  assert.match(sitemap, /\/blog\/turn-on-multi-factor-authentication\//);
  assert.equal((files.get('feed.xml').match(/<item>/g) || []).length, doc.posts.filter((p) => p.published !== false).length);
});

test('stale cleanup only ever removes generated page files', () => {
  const prev = JSON.stringify({ files: ['old/index.html', 'blog/gone/index.html', 'assets/js/site.js', 'content/site.json', 'index.html', '../evil/index.html'] });
  assert.deepEqual(staleFiles(prev, paths), ['old/index.html', 'blog/gone/index.html']);
  assert.deepEqual(staleFiles('not json', paths), []);
});
