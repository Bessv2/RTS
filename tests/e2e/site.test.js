// Browser tests for the built site and the old editor address.
// Run: npm run test:e2e   (needs Playwright: npm install --no-save playwright && npx playwright install chromium)
// The form service is mocked, so nothing real is ever sent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.webp': 'image/webp' };

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

test('the old editor address points to the new editor and rescues old drafts', async () => {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const p = await page(ctx);
  // What the retired built-in editor may have left in this browser
  await p.goto(`${base}/`);
  await p.evaluate(() => new Promise((resolve) => {
    localStorage.setItem('rts-editor-github', JSON.stringify({ owner: 'Bessv2', repo: 'RTS', token: 'github_pat_OLD' }));
    const req = indexedDB.open('rts-editor', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); req.result.createObjectStore('versions', { keyPath: 'id' }); };
    req.onsuccess = () => {
      const tx = req.result.transaction(['kv', 'versions'], 'readwrite');
      tx.objectStore('kv').put({ savedAt: Date.now(), json: JSON.stringify({ site: { name: 'Draft biz' }, pages: [{ title: 'Home', sections: [] }] }) }, 'draft');
      tx.objectStore('versions').put({ id: 'v1', name: 'Before redesign', savedAt: Date.now() - 1000, json: JSON.stringify({ site: { name: 'Old' }, pages: [{ title: 'Home', sections: [] }] }) });
      tx.oncomplete = () => { req.result.close(); resolve(); };
    };
  }));
  await p.goto(`${base}/editor.html`);
  assert.equal(await p.locator('a.btn--primary').getAttribute('href'), 'https://editor.roetechnologyservices.com/');
  await p.locator('#rescue li').first().waitFor();
  assert.equal(await p.locator('#rescue li').count(), 2, 'the draft and the saved version');
  assert.ok(await p.locator('#token-note').isVisible());
  assert.equal(await p.evaluate(() => localStorage.getItem('rts-editor-github')), null, 'the saved token is removed');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#rescue li').first().locator('button').click()]);
  assert.equal(JSON.parse(await readFile(await dl.path(), 'utf8')).site.name, 'Draft biz');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('the moved page stays quiet when there is nothing to rescue', async () => {
  const p = await page();
  await p.goto(`${base}/editor.html`);
  await p.waitForTimeout(300);
  assert.ok(await p.locator('#rescue').isHidden());
  assert.ok(await p.locator('#token-note').isHidden());
  const dbs = await p.evaluate(() => indexedDB.databases().then((list) => list.map((d) => d.name)));
  assert.ok(!dbs.includes('rts-editor'), 'no empty database is left behind');
  assert.deepEqual(p.errors, []);
  await p.close();
});
