import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashToPath, migrate, validate, SCHEMA_VERSION } from '../../assets/js/schema.js';

test('hash routes become real paths', () => {
  assert.equal(hashToPath('#/'), '/');
  assert.equal(hashToPath('#/contact'), '/contact/');
  assert.equal(hashToPath('#/post/my-post'), '/blog/my-post/');
  assert.equal(hashToPath('#contact'), '#contact');
  assert.equal(hashToPath('https://x.com'), 'https://x.com');
});

test('v1 content is migrated to the current version', () => {
  const v1 = {
    version: 1,
    site: { name: 'Biz', headerCta: { label: 'Go', href: '#/contact' }, logo: 'data:image/png;base64,#/notalink' },
    pages: [{ id: 'h', title: 'Home', slug: '', sections: [{ id: 's', type: 'text', data: { text: 'See [our services](#/services) and [a post](#/post/hello).' } }] }],
  };
  const doc = migrate(v1);
  assert.equal(doc.version, SCHEMA_VERSION);
  assert.equal(doc.site.headerCta.href, '/contact/');
  assert.equal(doc.pages[0].sections[0].data.text, 'See [our services](/services/) and [a post](/blog/hello/).');
  assert.equal(doc.site.logo, 'data:image/png;base64,#/notalink', 'data URLs are never rewritten');
  assert.deepEqual(doc.posts, []);
  assert.deepEqual(migrate(doc), doc, 'migration is idempotent');
  assert.equal(v1.site.headerCta.href, '#/contact', 'input is not mutated');
});

test('content from a newer editor is refused instead of corrupted', () => {
  assert.throws(() => migrate({ version: SCHEMA_VERSION + 1, pages: [] }), /newer version/);
});

test('validate catches duplicate and reserved web addresses', () => {
  const doc = migrate({
    site: { name: 'x' },
    pages: [{ title: 'Home', slug: '', sections: [] }, { title: 'A', slug: 'a', sections: [] }, { title: 'B', slug: 'a', sections: [] }, { title: 'C', slug: 'assets', sections: [] }],
    posts: [{ id: '1', slug: 'p' }, { id: '2', slug: 'p' }],
  });
  const problems = validate(doc).join('\n');
  assert.match(problems, /Two pages use the web address “a”/);
  assert.match(problems, /reserved/);
  assert.match(problems, /Two posts use/);
});
