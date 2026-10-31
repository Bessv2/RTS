import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animClass, pieceCSS, STYLE_GROUPS } from '../../assets/js/layout.js';
import { renderSection, renderPage } from '../../assets/js/render.js';
import { migrate } from '../../assets/js/schema.js';
import { LAYOUT_ELEMENTS } from '../../assets/js/blocks.js';
import { formatCount } from '../../assets/js/enhance.js';
import { audit } from '../../assets/js/audit.js';

const doc = (sections, site = {}) => migrate({ site: { name: 'Biz', ...site }, pages: [{ title: 'Home', sections }] });
const layout = (rows) => ({ id: 's-m', type: 'layout', data: { rows } });
const one = (el) => layout([{ cols: [{ span: 12, els: [el] }] }]);
const render = (section, d = doc([section]), ctx = {}) => renderSection(section, { site: d, ...ctx });

test('an entrance, a scroll effect, a loop and sticky can go on one piece', () => {
  assert.equal(animClass({ anim: 'up', scroll: 'parallax', loop: 'float', sticky: true }), ' anim anim--up sfx sfx--parallax loop loop--float is-sticky');
  assert.equal(animClass({ anim: 'nope', scroll: 'x', loop: 'y', sticky: 'yes' }), '', 'only known values');
  assert.equal(pieceCSS('.a', { anim: 'up', animSpeed: 'slow', animDelay: 0.5, scroll: 'fade', scrollAmt: '3', loop: 'spin', loopSpeed: 'fast' }),
    '.a{--anim-delay:0.5s;--anim-dur:1.28s;--sfx:3;--loop-k:0.6}');
  assert.equal(pieceCSS('.a', { scrollAmt: '3', loopSpeed: 'fast' }), '', 'strength and speed only with an effect');
  const motion = STYLE_GROUPS.find((g) => g.id === 'motion');
  assert.ok(motion.allScreens);
  for (const key of ['anim', 'animSpeed', 'stagger', 'scroll', 'scrollAmt', 'loop', 'loopSpeed', 'sticky']) assert.ok(motion.items.some((it) => it.key === key), key);
});

test('“one after another” passes the entrance to what is inside, each a little later', () => {
  const html = render(layout([{ design: { anim: 'up', stagger: true, animDelay: 0.2 }, cols: [
    { span: 4, els: [] }, { span: 4, els: [] }, { span: 4, design: { anim: 'zoom' }, els: [] }] }]));
  assert.match(html, /lay__row--contained n-0"/, 'the row itself does not animate');
  assert.match(html, /n-0-0 anim anim--up/);
  assert.match(html, /n-0-1 anim anim--up/);
  assert.match(html, /n-0-2 anim anim--zoom"/, 'its own entrance wins');
  assert.match(html, /\.x-s-m \.n-0-0\{--anim-delay:0\.2s\}\.x-s-m \.n-0-1\{--anim-delay:0\.32s\}/);
  const box = render(one({ type: 'box', design: { anim: 'fade', stagger: true }, els: [{ type: 'heading', text: 'A' }, { type: 'heading', text: 'B' }] }));
  assert.match(box, /n-0-0-0-0 anim anim--fade/);
  assert.match(box, /n-0-0-0-1 anim anim--fade/);
});

test('counter: the final number is on the page, ready to count up', () => {
  const html = render(one({ type: 'counter', value: '1,250', prefix: '$', suffix: '+', label: 'Raised', size: 'xl' }));
  assert.match(html, /<span class="lx-counter__num">\$<span class="lx-counter__value" data-count="1250" data-decimals="0" data-commas>1,250<\/span>\+<\/span>/);
  assert.match(html, /lx-counter--xl/);
  assert.match(render(one({ type: 'counter', value: '4.9' })), /data-count="4\.9" data-decimals="1"/);
  assert.doesNotMatch(render(one({ type: 'counter', value: '24/7' })), /data-count/, 'not a plain number: shown as typed');
  assert.match(render(one({ type: 'counter', value: '<b>1</b>' })), /&lt;b&gt;1&lt;\/b&gt;/);
  assert.equal(formatCount(1249.6, 0, true), '1,250');
  assert.equal(formatCount(4.86, 1), '4.9');
});

test('ticker: the words twice for a seamless loop, the copy hidden from screen readers, a pause button', () => {
  const html = render(one({ type: 'ticker', items: [{ text: 'Fast' }, { text: '<Kind>' }, { text: ' ' }], speed: 'fast', direction: 'right', size: 'l' }));
  assert.match(html, /class="lx-ticker lx-ticker--l lx-ticker--right" style="--tk-dur:8s"/);
  assert.equal((html.match(/class="lx-ticker__item"/g) || []).length, 4, 'two words, twice');
  assert.match(html, /<span class="lx-ticker__group" aria-hidden="true">/);
  assert.match(html, /&lt;Kind&gt;/);
  assert.match(html, /<button type="button" class="lx-ticker__pause" aria-label="Pause the moving text" aria-pressed="false">/);
  assert.doesNotMatch(render(one({ type: 'ticker', items: [] })), /lx-ticker/);
});

test('rotating words: one heading, every word said once to screen readers', () => {
  const html = render(one({ type: 'rotator', before: 'We build', words: 'websites, apps,brands', after: 'that work.', level: 'auto' }), undefined, { first: true });
  assert.match(html, /<h1 class="lx-h lx-rot"><span class="sr-only">We build websites, apps and brands that work\.<\/span><span aria-hidden="true">We build <span class="lx-rot__words"><span class="lx-rot__word is-on">websites<\/span><span class="lx-rot__word">apps<\/span><span class="lx-rot__word">brands<\/span><\/span> that work\.<\/span><\/h1>/);
  assert.match(render(one({ type: 'rotator', words: 'a, b', level: 'h3' }), undefined, { edit: true }), /<h3 class="lx-h lx-rot">.*class="lx-rot__more"/s);
});

test('reading progress bar and back-to-top button are site options', () => {
  const page = (site) => renderPage(doc([], site), 0, {});
  assert.doesNotMatch(page({}), /scroll-progress|to-top/);
  const html = page({ scrollProgress: true, backToTop: true });
  assert.match(html, /^<div class="scroll-progress" aria-hidden="true"><\/div>/);
  assert.match(html, /<a class="to-top" href="#main" aria-label="Back to top"/);
});

test('moving pieces left with their sample text are flagged before publishing', () => {
  const els = ['counter', 'ticker', 'rotator'].map((t) => LAYOUT_ELEMENTS[t].defaults());
  const found = audit(doc([{ id: 'h', type: 'hero', data: { heading: 'Hi' } }, layout([{ cols: [{ span: 12, els }] }])], { description: 'x' }));
  assert.ok(found.some((f) => f.code === 'sample-text' && /Projects finished|Friendly service|We help with/.test(f.message)));
});

test('sample text inside a converted section’s paragraphs is found too', () => {
  const html = '<p>' + 'Describe what you do and who you help in one or two sentences.' + '</p>';
  const found = audit(doc([{ id: 'h', type: 'hero', data: { heading: 'Hi' } }, one({ type: 'text', html, size: 'm' })], { description: 'x' }));
  assert.ok(found.some((f) => f.code === 'sample-text' && f.where.field === 'rows.0.cols.0.els.0.html'));
});
