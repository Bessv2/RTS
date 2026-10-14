// Site checkup: plain-language problems and suggestions to look at before
// publishing. A pure function of site.json, so the editor (Publish dialog,
// Checkup panel) and the tests use exactly the same rules.
//
// audit(doc) returns [{ level, code, message, where }], most serious first.
//   level: 'error'   the live site would be broken, so publishing is blocked
//          'warning' worth fixing, publishing is still allowed
//          'tip'     a suggestion
//   where: { kind: 'site' | 'page' | 'post', page?, section?, post?, field?, fields? }
//          page is a page index, section and post are ids, field is a path
//          inside the section data (or site/post object), e.g. 'items.0.text'.
import { BLOCKS } from './blocks.js';
import { validate, redirectFrom, redirectTo, hashToPath } from './schema.js';
import { renderPage, findRoute, isLivePage, postTitle, publishedPosts, firstSectionIndex, THEME_PRESETS } from './render.js';

const LEVELS = ['error', 'warning', 'tip'];
const LINK = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;
// Keys that hold settings, not words visitors read.
const NOT_TEXT = new Set(['id', 'type', 'icon', 'image', 'bgImage', 'href', 'anchor', 'bg', 'pad', 'overlay', 'layout', 'side', 'columns',
  'style', 'ratio', 'width', 'height', 'align', 'show', 'limit', 'price', 'period', 'url', 'address', 'panelIcon']);
const VALID_ENDPOINT = /^https:\/\/[^\s/]+\/\S*$/i;

// Words the section library fills in for new sections. Seeing them on a live
// page means they were never replaced. Long default sentences and default list
// items like “New service” count; one-word defaults like “Plan” are real words.
let samples;
function sampleTexts() {
  if (samples) return samples;
  samples = new Set(['A short introduction to this page.']);
  const walk = (node, min, key = '') => {
    if (Array.isArray(node)) node.forEach((n) => walk(n, min, key));
    else if (node && typeof node === 'object') { if (!('href' in node)) Object.entries(node).forEach(([k, v]) => walk(v, min, k)); }
    else if (typeof node === 'string' && !NOT_TEXT.has(key) && node.trim().length >= min && /\s|[.?]$/.test(node.trim())) samples.add(node.trim());
  };
  for (const b of Object.values(BLOCKS)) {
    walk(b.defaults(), 24);
    for (const f of b.fields) if (typeof f.item === 'function') walk(f.item(), 1);
  }
  return samples;
}

// Calls visit(value, path) for every string, and visitButton(button, path) for {label, href} objects.
function eachValue(node, path, visit, visitButton) {
  if (Array.isArray(node)) node.forEach((n, i) => eachValue(n, path ? `${path}.${i}` : String(i), visit, visitButton));
  else if (node && typeof node === 'object') {
    if ('href' in node && 'label' in node) visitButton?.(node, path);
    for (const [k, v] of Object.entries(node)) if (k !== 'href') eachValue(v, path ? `${path}.${k}` : k, visit, visitButton);
  } else if (typeof node === 'string') visit(node, path, path.split('.').pop());
}

// WCAG contrast ratio between two #rrggbb colors (1 to 21).
function luminance(hex) {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const short = (t, n = 40) => { const s = String(t).replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

export function audit(doc) {
  const out = [];
  const add = (level, code, message, where = { kind: 'site' }) => out.push({ level, code, message, where });
  const s = doc.site || {};

  for (const problem of validate(doc)) add('error', 'invalid', problem);

  // Anchor ids on each page, from the page as it will be published.
  const html = new Map();
  const pageHTML = (i) => { if (!html.has(i)) html.set(i, renderPage(doc, i)); return html.get(i); };
  const ids = (i) => new Set([...pageHTML(i).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  function linkProblem(href, pageIndex) {
    const h = String(href || '').trim();
    if (!h || h === '#') return 'empty';
    if (/^#\//.test(h)) return 'old';
    if (/^([a-z][\w+.-]*:|\/\/)/i.test(h)) return '';
    const [path, hash = ''] = h.split('#');
    if (!path) return pageIndex == null || !hash || ids(pageIndex).has(hash) ? '' : 'anchor';
    if (!path.startsWith('/') || /\.[a-z0-9]{2,5}$/i.test(path.split('?')[0])) return '';
    const route = findRoute(doc, path);
    if (!route) return findRoute(doc, path, { drafts: true }) ? 'draft' : 'missing';
    return hash && route.type === 'page' && !ids(route.index).has(hash) ? 'anchor' : '';
  }

  function checkLink(href, label, place, where, { button = false } = {}) {
    const problem = linkProblem(href, where.kind === 'page' ? where.page : null);
    if (!problem) return;
    const what = button ? `The “${short(label)}” button ${place}` : `The link “${short(label)}” ${place}`;
    const h = String(href || '').trim();
    const messages = {
      empty: `${what} doesn’t go anywhere yet.`,
      old: `${what} uses an old-style address (${h}). Use ${hashToPath(h)} instead.`,
      missing: `${what} goes to ${h}, which doesn’t exist.`,
      draft: `${what} goes to ${h}, which isn’t published.`,
      anchor: `${what} jumps to #${h.split('#')[1]}, but no section on that page has that anchor ID.`,
    };
    add('warning', problem === 'empty' ? 'button-no-link' : 'broken-link', messages[problem], where);
  }

  function checkText(text, place, where) {
    for (const m of String(text).matchAll(LINK)) if (!m[1]) checkLink(m[3], m[2] || m[3], place, where);
  }

  // Site settings, header and footer
  if (!String(s.description || '').trim()) add('warning', 'site-description', 'Add a site description in Settings. Search engines show it under your site’s name.', { kind: 'site', field: 'description' });
  if (!s.shareImage) add('tip', 'share-image', 'Add a share image in Settings so links to your site look good on social media and in messages.', { kind: 'site', field: 'shareImage' });
  if (String(s.headerCta?.label || '').trim()) checkLink(s.headerCta.href, s.headerCta.label, 'in the header', { kind: 'site', field: 'headerCta' }, { button: true });
  if (s.announcement?.enabled && s.announcement.link) checkLink(s.announcement.link, s.announcement.linkText || s.announcement.link, 'in the announcement bar', { kind: 'site', field: 'announcement.link' });
  for (const f of ['tagline', 'footerText']) if (s[f]) checkText(s[f], 'in the footer', { kind: 'site', field: f });

  // Theme colors people have to read
  const theme = { ...THEME_PRESETS.midnight, ...doc.theme };
  const color = (k) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(theme[k] || '')) ? theme[k] : THEME_PRESETS.midnight[k]);
  const design = { kind: 'site', field: 'theme' };
  const ratio = (v) => `${(Math.floor(v * 10) / 10).toFixed(1)}:1`;
  for (const [bg, where] of [['bg', 'the page background'], ['surface', 'tinted sections']]) {
    const r = contrast(color('text'), color(bg));
    if (r < 4.5) add('warning', 'contrast', `Text is hard to read on ${where} (contrast ${ratio(r)}; aim for at least 4.5:1). Pick a darker text color or a lighter background in Design.`, design);
  }
  const onDark = contrast('#f8fafc', color('dark'));
  if (onDark < 4.5) add('warning', 'contrast', `Text in dark sections is hard to read (contrast ${ratio(onDark)}; aim for at least 4.5:1). Pick a darker “Dark sections” color in Design.`, design);
  const onBrand = contrast('#ffffff', color('primary'));
  if (onBrand < 3) add('warning', 'contrast', `White text on your brand color is hard to read (contrast ${ratio(onBrand)}; aim for at least 3:1). Buttons and brand sections use it, so pick a darker brand color in Design.`, design);

  // Pages
  const titles = new Map();
  let formPage = -1;
  doc.pages.forEach((page, i) => {
    if (!isLivePage(page, i)) return;
    const name = `“${page.title}”`;
    const at = { kind: 'page', page: i };
    if (firstSectionIndex(page) === -1) add('warning', 'empty-page', `${name} has nothing on it yet. Add a section, or turn off “Show on website” until it is ready.`, at);
    else {
      const h1 = (pageHTML(i).match(/<h1[\s>]/g) || []).length;
      if (!h1) add('warning', 'no-h1', `${name} has no main headline. Give its first section a heading, or start the page with a Hero section, so visitors and search engines know what the page is about.`, at);
      else if (h1 > 1) add('warning', 'many-h1', `${name} has ${h1} main headlines. Keep one Hero section per page so the page’s topic is clear.`, at);
    }
    const title = page.seoTitle || (i === 0 ? s.name : `${page.title} | ${s.name}`);
    if (titles.has(title)) add('warning', 'duplicate-title', `${name} and “${titles.get(title)}” have the same search engine title. Give each page its own title in Pages → Search engines.`, { ...at, field: 'seoTitle' });
    else titles.set(title, page.title);
    if (String(title).length > 65) add('tip', 'long-title', `${name}’s search engine title is ${String(title).length} characters. Search engines cut titles off after about 60.`, { ...at, field: 'seoTitle' });
    const desc = String(page.seoDescription || '').trim();
    if (!desc) add('tip', 'page-description', `Add a search engine description for ${name} in Pages → Search engines.`, { ...at, field: 'seoDescription' });
    else if (desc.length > 160) add('tip', 'long-description', `${name}’s search engine description is ${desc.length} characters. Search engines cut it off after about 160.`, { ...at, field: 'seoDescription' });
    if (i === 0 && page.noindex) add('warning', 'noindex-home', 'Your home page is hidden from search engines, so people searching for you won’t find your site.', { ...at, field: 'noindex' });

    for (const sec of page.sections || []) {
      const block = BLOCKS[sec.type];
      if (!block || sec.hidden) continue;
      const secName = String(sec.label || '').trim() || block.label;
      const place = `in “${secName}” on ${name}`;
      const where = { ...at, section: sec.id };
      const leftover = [];
      eachValue(sec.data || {}, '', (v, path, key) => {
        if (NOT_TEXT.has(key)) return;
        if (sampleTexts().has(v.trim())) leftover.push([path, v]);
        checkText(v, place, { ...where, field: path });
      }, (b, path) => { if (String(b.label || '').trim()) checkLink(b.href, b.label, place, { ...where, field: path }, { button: true }); });
      if (leftover.length) {
        add('warning', 'sample-text', `“${secName}” on ${name} still has sample text: “${short(leftover[0][1], 50)}”${leftover.length > 1 ? ` and ${leftover.length - 1} more` : ''}.`,
          { ...where, field: leftover[0][0], fields: leftover.map(([p]) => p) });
      }
      if (sec.type === 'contact' && sec.data?.showForm && formPage < 0) formPage = i;
      if (sec.type === 'image' && sec.data?.image && !String(sec.data.imageAlt || sec.data.caption || '').trim()) {
        add('tip', 'image-description', `The image in “${secName}” on ${name} has no description. Add one so screen readers and search engines know what it shows.`, { ...where, field: 'imageAlt' });
      }
      if (sec.type === 'gallery') {
        const bare = (sec.data?.items || []).filter((it) => it.image && !String(it.caption || '').trim()).length;
        if (bare) add('tip', 'image-description', `${bare} photo${bare === 1 ? '' : 's'} in “${secName}” on ${name} ${bare === 1 ? 'has' : 'have'} no caption. Captions also describe photos for screen readers.`, where);
      }
    }
  });

  // The contact form needs somewhere to send messages.
  if (formPage >= 0) {
    const endpoint = String(s.formEndpoint || '').trim();
    const where = { kind: 'site', field: endpoint ? 'formEndpoint' : 'email' };
    if (endpoint && !VALID_ENDPOINT.test(endpoint)) {
      if (s.email) add('warning', 'form-endpoint', 'The form endpoint in Settings must be a full https:// address. Until it is fixed, the contact form opens the visitor’s email app instead.', where);
      else add('error', 'form-endpoint', 'The contact form can’t send messages: the form endpoint in Settings must be a full https:// address.', where);
    } else if (!endpoint && !String(s.email || '').trim()) {
      add('error', 'form-destination', 'The contact form has nowhere to send messages. Add your email address or a form endpoint in Settings.', where);
    }
  }

  // Blog
  for (const p of publishedPosts(doc)) {
    const at = { kind: 'post', post: p.id };
    const blurb = (p.kind || 'post') === 'blurb';
    const name = `“${short(postTitle(p) || 'Untitled', 50)}”`;
    if (!blurb && (!String(p.title || '').trim() || p.title === 'Untitled post')) add('warning', 'post-title', `A blog post is still called ${name}. Give it a title.`, { ...at, field: 'title' });
    if (!String(p.body || '').trim() && !(blurb && p.title)) add('warning', 'post-empty', `${name} has no text yet. Write something, or turn off “Show on website”.`, { ...at, field: 'body' });
    if (!blurb && !String(p.summary || '').trim()) add('tip', 'post-summary', `Add a summary to ${name}. It’s shown on blog cards and in search results.`, { ...at, field: 'summary' });
    checkText(p.body || '', `in ${name}`, { ...at, field: 'body' });
  }

  // Redirects
  for (const r of doc.redirects || []) {
    const from = redirectFrom(r.from);
    if (!from || !String(r.to || '').trim()) continue;
    const where = { kind: 'site', field: 'redirects' };
    const route = findRoute(doc, `/${from}/`);
    const to = redirectTo(r.to);
    if (route && route.type !== 'redirect') add('warning', 'redirect-unused', `The redirect from /${from}/ does nothing, because a page or post now uses that address. Remove it in Settings → Redirects.`, where);
    else if (to === `/${from}/`) add('warning', 'redirect-loop', `The redirect from /${from}/ points to itself.`, where);
    else if (to.startsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(to.split(/[?#]/)[0]) && !findRoute(doc, to)) add('warning', 'redirect-broken', `The redirect from /${from}/ goes to ${to}, which doesn’t exist.`, where);
  }

  return out.map((r, i) => [r, i]).sort((a, b) => LEVELS.indexOf(a[0].level) - LEVELS.indexOf(b[0].level) || a[1] - b[1]).map(([r]) => r);
}
