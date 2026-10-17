import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { convertSection, canConvert } from '../../assets/js/convert.js';
import { renderSection } from '../../assets/js/render.js';
import { migrate } from '../../assets/js/schema.js';
import { BLOCKS } from '../../assets/js/blocks.js';
import { audit } from '../../assets/js/audit.js';

const site = migrate(JSON.parse(await readFile(new URL('../../content/site.json', import.meta.url), 'utf8')));
// The words a visitor reads in a section.
const words = (html) => new Set(html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').split(/\s+/).filter((w) => /\w/.test(w)));

test('every section of the live site converts and keeps every word', () => {
  for (const page of site.pages) {
    for (const sec of page.sections) {
      const out = convertSection(sec);
      assert.equal(out.type, 'layout', `${sec.id} converts`);
      assert.equal(out.id, sec.id, 'keeps its id (anchors and styles keep working)');
      for (const k of ['bg', 'pad', 'anchor', 'showOn']) assert.equal(out.data[k], sec.data[k], `${sec.id} keeps ${k}`);
      const before = words(renderSection(sec, { site }));
      const after = words(renderSection(out, { site }));
      const lost = [...before].filter((w) => !after.has(w));
      assert.deepEqual(lost, [], `${sec.id} (${sec.type}) keeps its words`);
    }
  }
});

test('every section type converts; layouts and unknown types stay as they are', () => {
  for (const [type, b] of Object.entries(BLOCKS)) {
    const sec = { id: `s-${type}`, type, data: b.defaults() };
    if (type === 'layout') { assert.equal(canConvert(sec), false); assert.equal(convertSection(sec), sec); continue; }
    assert.ok(canConvert(sec), type);
    const out = convertSection(sec);
    assert.equal(out.type, 'layout', type);
    assert.ok(Array.isArray(out.data.rows), type);
    assert.doesNotThrow(() => renderSection(out, { site, edit: true }), type);
  }
  assert.equal(canConvert({ id: 'x', type: 'nope', data: {} }), false);
});

test('converted pages look like the originals: the main headline, cards, hero card and panel', () => {
  const home = site.pages[0].sections.map(convertSection);
  const hero = renderSection(home[0], { site, first: true });
  assert.match(hero, /class="sec sec--dark pad--spacious blk-layout x-s-hero fx-glow"/);
  assert.match(hero, /<h1 class="lx-h">Reliable technology/);
  assert.match(hero, /class="status-card"/);
  const services = renderSection(home.find((s) => s.id === 's-services'), { site });
  assert.equal((services.match(/lx-box--card/g) || []).length, 6);
  assert.match(services, /id="services"/, 'the anchor still works');
  assert.match(renderSection(home.find((s) => s.id === 's-about'), { site }), /class="split__panel"/);
  // A converted site has nothing new for the checkup to complain about.
  const converted = { ...site, pages: site.pages.map((p) => ({ ...p, sections: p.sections.map(convertSection) })) };
  const before = audit(site).map((f) => f.code).sort();
  assert.deepEqual(audit(converted).map((f) => f.code).sort(), before);
});

test('the section’s own elements come along', () => {
  const sec = { id: 's-t', type: 'text', data: { heading: 'Hi', text: 'Body', elements: [{ type: 'heading', text: 'More', size: 'small', align: 'center' }, { type: 'button', label: 'Go', href: '/x/', style: 'outline' }] } };
  const out = convertSection(sec);
  const last = out.data.rows.at(-1).cols[0].els;
  assert.deepEqual(last.map((e) => e.type), ['heading', 'button']);
  assert.equal(last[0].size, 's');
  assert.deepEqual(last[0].design, { ta: 'center' });
  assert.equal(last[1].style, 'outline');
});
