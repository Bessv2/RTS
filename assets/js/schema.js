// Content schema: versioning, migrations, defaults and validation for site.json.
//
// Every change to the shape of site.json gets a migration here so older
// content (drafts, backups, published history) keeps working forever.
// To change the format: bump SCHEMA_VERSION and add MIGRATIONS[oldVersion].

export const SCHEMA_VERSION = 2;
export const POSTS_BASE = 'blog';

// Old hash routes (#/services, #/post/my-post) become real paths.
export function hashToPath(href) {
  const m = String(href).match(/^#\/([\w/-]*)$/);
  if (!m) return href;
  const route = m[1].replace(/\/+$/, '');
  if (!route) return '/';
  const post = route.match(/^post\/([\w-]+)$/);
  return post ? `/${POSTS_BASE}/${post[1]}/` : `/${route}/`;
}

function mapStrings(node, fn) {
  if (Array.isArray(node)) return node.map((n) => mapStrings(n, fn));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, mapStrings(v, fn)]));
  return typeof node === 'string' ? fn(node) : node;
}

const MIGRATIONS = {
  // v1 → v2: hash routing replaced by real URLs.
  1: (doc) => mapStrings(doc, (s) => {
    if (s.startsWith('data:')) return s;
    if (/^#\/[\w/-]*$/.test(s)) return hashToPath(s);
    return s.replace(/\]\((#\/[\w/-]*)\)/g, (m, h) => `](${hashToPath(h)})`);
  }),
};

export function migrate(input) {
  let doc = JSON.parse(JSON.stringify(input || {}));
  let v = Number(doc.version) || 1;
  if (v > SCHEMA_VERSION) throw new Error(`This content was made by a newer version of the editor (v${v}). Please update the site code.`);
  while (v < SCHEMA_VERSION) {
    doc = MIGRATIONS[v](doc);
    v += 1;
    doc.version = v;
  }
  return normalize(doc);
}

export function normalize(doc) {
  doc.version = SCHEMA_VERSION;
  doc.site ||= {};
  doc.site.name ||= 'My Business';
  doc.theme ||= {};
  doc.pages = Array.isArray(doc.pages) && doc.pages.length ? doc.pages : [{ id: 'p-home', title: 'Home', slug: '', showInNav: true, sections: [] }];
  doc.pages.forEach((p) => { p.sections ||= []; p.slug = p.slug || ''; });
  doc.pages[0].slug = '';
  delete doc.pages[0].draft;
  doc.media ||= [];
  doc.saved ||= [];
  doc.posts ||= [];
  if (!Array.isArray(doc.redirects)) doc.redirects = [];
  return doc;
}

const RESERVED = new Set(['assets', 'content', 'scripts', 'tests', 'editor', 'preview', POSTS_BASE]);
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

// Redirects send visitors from an old address to a new one, e.g. after a
// page is renamed: { from: '/old-page/', to: '/new-page/' }.
// redirectFrom() turns the old address into 'old-page' or 'blog/old-post',
// or '' when it can't be used.
export function redirectFrom(v) {
  const parts = String(v || '').trim().toLowerCase().split(/[?#]/)[0].split('/').filter(Boolean);
  if (parts.length === 1 && SLUG.test(parts[0]) && !RESERVED.has(parts[0])) return parts[0];
  if (parts.length === 2 && parts[0] === POSTS_BASE && SLUG.test(parts[1])) return parts.join('/');
  return '';
}

// The new address: a full https:// link, or a path on this site.
export function redirectTo(v) {
  const t = String(v || '').trim();
  if (/^https?:\/\//i.test(t) || t.startsWith('/')) return t;
  return `/${t.replace(/^\.?\/+|\/+$/g, '')}/`;
}

// Returns a list of human-readable problems; empty means the content is OK to publish.
export function validate(doc) {
  const problems = [];
  const slugs = new Set();
  doc.pages.forEach((p, i) => {
    if (i === 0) return;
    if (!SLUG.test(p.slug || '')) problems.push(`Page “${p.title}” needs a web address made of lowercase letters, numbers and dashes.`);
    else if (RESERVED.has(p.slug) && !(p.slug === POSTS_BASE && p.sections.some((s) => s.type === 'blogfeed'))) problems.push(`Page “${p.title}” can't use the web address “${p.slug}” because it is reserved.`);
    if (slugs.has(p.slug)) problems.push(`Two pages use the web address “${p.slug}”.`);
    slugs.add(p.slug);
  });
  const postSlugs = new Set();
  doc.posts.forEach((p) => {
    if (!SLUG.test(p.slug || '')) problems.push(`Post “${p.title || p.id}” needs a valid web address.`);
    if (postSlugs.has(p.slug)) problems.push(`Two posts use the web address “${p.slug}”.`);
    postSlugs.add(p.slug);
  });
  const froms = new Set();
  (doc.redirects || []).forEach((r) => {
    const from = redirectFrom(r.from);
    if (!from) problems.push(`The redirect from “${r.from || '(empty)'}” needs an old address like /old-page/ or /${POSTS_BASE}/old-post/.`);
    else if (froms.has(from)) problems.push(`Two redirects start at “/${from}/”.`);
    else if (!String(r.to || '').trim()) problems.push(`The redirect from “/${from}/” needs a new address.`);
    froms.add(from);
  });
  return problems;
}
