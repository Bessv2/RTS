import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rich, markdown, safeHref, safeSrc, cssUrl, findRoute, renderPage } from '../../assets/js/render.js';
import { migrate } from '../../assets/js/schema.js';

test('rich text escapes HTML and only allows safe formatting', () => {
  assert.equal(rich('<b>x</b> **bold**'), '&lt;b&gt;x&lt;/b&gt; <strong>bold</strong>');
  assert.equal(rich('2*3*4'), '2*3*4');
  assert.match(rich('[x](javascript:alert(1))'), /href="#"/);
  assert.match(rich('[x](https://a.com)'), /target="_blank" rel="noopener"/);
});

test('markdown renders blocks without allowing raw HTML', () => {
  const html = markdown('## Title\n- a\n- b\n\n> quote\n\n<script>alert(1)</script>\n\n![cap](media:img1)', (v) => (v === 'media:img1' ? 'assets/x.png' : v));
  assert.match(html, /<h2>Title<\/h2><ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<img src="\/assets\/x.png" alt="cap"/);
});

test('links and image sources are restricted to safe schemes', () => {
  assert.equal(safeHref('javascript:alert(1)'), '#');
  assert.equal(safeHref('/contact/'), '/contact/');
  assert.equal(safeHref('mailto:a@b.c'), 'mailto:a@b.c');
  assert.equal(safeSrc('javascript:x'), '');
  assert.equal(safeSrc('assets/a.png'), '/assets/a.png');
  assert.equal(safeSrc('./assets/a.png'), '/assets/a.png');
  assert.equal(safeSrc('https://x.com/a.png'), 'https://x.com/a.png');
  assert.equal(cssUrl('x");}body{color:red'), 'url("/x%22%29;}body{color:red")');
  assert.equal(cssUrl('a b(1).png'), 'url("/a%20b%281%29.png")');
});

test('routes resolve pages and published posts only', () => {
  const doc = migrate({ site: { name: 'x' }, pages: [{ title: 'Home', sections: [] }, { title: 'About', slug: 'about', sections: [] }],
    posts: [{ id: '1', slug: 'live', published: true }, { id: '2', slug: 'draft', published: false }] });
  assert.deepEqual(findRoute(doc, '/'), { type: 'page', index: 0 });
  assert.deepEqual(findRoute(doc, '/about/'), { type: 'page', index: 1 });
  assert.equal(findRoute(doc, '/blog/live/').post.id, '1');
  assert.equal(findRoute(doc, '/blog/draft/'), null);
  assert.equal(findRoute(doc, '/nope/'), null);
});

test('hidden sections are skipped on the live site', () => {
  const doc = migrate({ site: { name: 'x' }, pages: [{ title: 'Home', sections: [
    { id: 'a', type: 'text', data: { heading: 'Visible' } }, { id: 'b', type: 'text', hidden: true, data: { heading: 'Secret' } }] }] });
  const html = renderPage(doc, 0);
  assert.match(html, /Visible/);
  assert.doesNotMatch(html, /Secret/);
});
