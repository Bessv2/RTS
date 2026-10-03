// Browser tests for the built site, the editor and publishing.
// Run: npm run test:e2e   (needs Playwright: npm install --no-save playwright && npx playwright install chromium)
// GitHub and the form service are mocked, so nothing real is ever published or sent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.webp': 'image/webp' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Minimal static server that behaves like GitHub Pages (folder index.html, 404.html).
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(ROOT, url));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html' }).end(await readFile(join(ROOT, '404.html')));
  }
});

let browser;
let base;
const isNoise = (t) => /fonts\.g|ERR_CERT|ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_CONNECTION|ytimg|status of 404/.test(t);

async function page(ctx = browser) {
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !isNoise(m.text()) && p.errors.push(m.text()));
  return p;
}

before(async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(async () => { await browser?.close(); server.close(); });

test('built pages load with content, without errors', async () => {
  const p = await page();
  for (const path of ['/', '/services/', '/about/', '/blog/', '/contact/', '/blog/turn-on-multi-factor-authentication/']) {
    const res = await p.goto(base + path, { waitUntil: 'load' });
    assert.equal(res.status(), 200, path);
    assert.ok(await p.locator('main#main').count(), `${path} has main`);
    assert.ok((await p.title()).length > 3, `${path} has a title`);
  }
  assert.deepEqual(p.errors, []);
});

test('pages work without JavaScript', async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(`${base}/blog/`);
  assert.ok(await p.locator('.blogfeed article').count() >= 3);
  await ctx.close();
});

test('unknown pages return the 404 page', async () => {
  const p = await page();
  const res = await p.goto(`${base}/does-not-exist/`);
  assert.equal(res.status(), 404);
  assert.match(await p.locator('h1').innerText(), /couldn’t find/);
});

test('old #/ links redirect to the new addresses', async () => {
  const p = await page();
  await p.goto(`${base}/#/contact`);
  await p.waitForURL(`${base}/contact/`);
  await p.goto(`${base}/#/post/turn-on-multi-factor-authentication`);
  await p.waitForURL(`${base}/blog/turn-on-multi-factor-authentication/`);
});

test('blog tag filter, gallery-free pages and mobile menu work', async () => {
  const p = await page();
  await p.goto(`${base}/blog/`);
  const all = await p.locator('.blogfeed > article').count();
  await p.click('.tag-filter button[data-tag="security"]');
  assert.ok(await p.locator('.blogfeed > article:not(.is-filtered)').count() < all);
  await p.setViewportSize({ width: 390, height: 800 });
  await p.click('.nav-toggle');
  assert.ok(await p.locator('.site-header.is-open .nav').isVisible());
});

test('contact form blocks bots and sends real messages', async () => {
  const ctx = await browser.newContext();
  const sent = [];
  await ctx.route('https://formspree.io/**', (r) => { sent.push(r.request().postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  const p = await page(ctx);
  await p.goto(`${base}/contact/`);
  const fill = async (msg = 'Hello, I need help with my office network.') => {
    await p.fill('[name=name]', 'Test'); await p.fill('[name=email]', 't@example.com'); await p.fill('[name=message]', msg);
  };
  await fill(); await p.click('form button[type=submit]');
  assert.equal(sent.length, 0, 'too-fast submissions are dropped');
  await p.waitForTimeout(3100);
  await fill(); await p.evaluate(() => { document.querySelector('[name=_gotcha]').value = 'bot'; }); await p.click('form button[type=submit]');
  assert.equal(sent.length, 0, 'honeypot submissions are dropped');
  await fill('spam http://a.com http://b.com http://c.com'); await p.click('form button[type=submit]');
  assert.equal(sent.length, 0, 'link-stuffed messages are rejected');
  await fill(); await p.click('form button[type=submit]');
  await p.waitForFunction(() => document.querySelector('.form-status').classList.contains('ok'));
  assert.equal(sent.length, 1);
  await fill(); await p.click('form button[type=submit]');
  assert.equal(sent.length, 1, 'cooldown between messages');
  await ctx.close();
});

test('editor edits, previews and publishes the full site', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const tree = [];
  const blobs = [];
  await ctx.route('https://api.github.com/**', async (r) => {
    const path = new URL(r.request().url()).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const json = (o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === '/git/ref/heads/main') return json({ object: { sha: 'c0' } });
    if (path === '/git/commits/c0') return json({ tree: { sha: 't0' } });
    if (path === '/git/blobs') { blobs.push(JSON.parse(r.request().postData())); return json({ sha: `b${blobs.length - 1}` }); }
    if (path === '/contents/generated.json') return r.fulfill({ status: 200, contentType: 'text/plain', body: JSON.stringify({ files: ['index.html', 'old-page/index.html'] }) });
    if (path === '/git/trees') { tree.push(...JSON.parse(r.request().postData()).tree); return json({ sha: 't1' }); }
    if (path === '/git/commits') return json({ sha: 'c1c1c1c1', html_url: 'https://github.com/x' });
    if (path === '/git/refs/heads/main') return json({});
    return json({ message: 'Not Found' }, 404);
  });
  const p = await page(ctx);
  p.on('dialog', (d) => d.accept());
  await p.goto(`${base}/editor.html`, { waitUntil: 'load' });
  const canvas = p.frameLocator('#canvas');
  await canvas.locator('.hero__title').first().waitFor();

  // Inline text editing
  await canvas.locator('.hero__title').first().click();
  await p.keyboard.press('Control+a');
  await p.keyboard.type('Future-proof IT for everyone');
  await canvas.locator('.blk-services').first().click();

  // Add a section from the library
  await p.click('.ed-rail button[data-tab="add"]');
  await p.click('.block-card:has-text("Gallery")');
  assert.ok(await canvas.locator('.blk-gallery').count());

  // Upload an image into the library
  await p.click('.ed-rail button[data-tab="media"]');
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.p-head button:has-text("Upload")')]);
  await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
  await p.locator('.ed-panel .media-grid').first().locator('.media-tile').first().waitFor();

  // Preview shows the unpublished draft
  const [preview] = await Promise.all([ctx.waitForEvent('page'), p.click('#preview')]);
  await preview.waitForLoadState('load');
  await preview.locator('.hero__title').first().waitFor();
  assert.match(await preview.locator('.hero__title').first().innerText(), /Future-proof IT/);
  await preview.click('.nav__list a:has-text("Services")');
  assert.match(preview.url(), /path=%2Fservices%2F/);

  // Publish
  await p.click('#publish');
  await p.fill('.ed-modal input[type=password]', 'github_pat_TEST');
  await p.click('button:has-text("Publish now")');
  await p.locator('.log .ok', { hasText: 'Done' }).waitFor();
  const paths = tree.map((t) => t.path);
  for (const f of ['content/site.json', 'index.html', 'services/index.html', 'blog/index.html', 'sitemap.xml', 'feed.xml', 'generated.json']) assert.ok(paths.includes(f), f);
  assert.ok(paths.some((f) => /^assets\/uploads\/[0-9a-f]+\.(webp|png)$/.test(f)), 'uploaded image committed');
  assert.deepEqual(tree.filter((t) => t.sha === null).map((t) => t.path), ['old-page/index.html'], 'removed pages are deleted');
  const home = Buffer.from(blobs[Number(tree.find((t) => t.path === 'index.html').sha.slice(1))].content, 'base64').toString();
  assert.match(home, /Future-proof IT for everyone/);
  const content = Buffer.from(blobs[Number(tree.find((t) => t.path === 'content/site.json').sha.slice(1))].content, 'base64').toString();
  assert.doesNotMatch(content, /data:image/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('the editor refuses to run inside another site', async () => {
  const p = await page();
  await p.setContent(`<iframe src="${base}/editor.html"></iframe>`);
  const frame = p.frames()[1];
  await frame.waitForLoadState('load');
  await frame.waitForFunction(() => document.body.innerText.includes('only be opened directly'));
});
