// Static site builder. Turns site.json into finished HTML files.
// Runs in the browser (the editor's Publish button) and in Node (scripts/build.mjs
// and GitHub Actions), so the live site is always produced by the same code.
import { renderPage, renderPostPage, renderNotFound, themeCSS, fontsHref, esc, safeSrc, pageHref, postHref, postTitle, publishedPosts } from './render.js';
import { POSTS_BASE } from './schema.js';

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
  + "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; "
  + "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.google.com; base-uri 'self'; object-src 'none'; form-action 'self'";

export const DEFAULT_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232563eb'/%3E%3Cpath d='M10 9h7a5 5 0 0 1 0 10h-1l5 5M10 9v15' stroke='white' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const GENERATED_LIST = 'generated.json';

function siteOrigin(doc, fallback) {
  const v = String(doc.site?.url || fallback || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(v) ? v : `https://${v || 'example.com'}`;
}

// JSON-LD must not be able to close its <script> tag.
const ldJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c');
const xml = (v) => String(v ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const plain = (t) => String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`]+/g, '').replace(/\s+/g, ' ').trim();

// One complete HTML document. `body` is the rendered page markup.
export function documentHTML(doc, { path, title, description, body, image, type = 'website', jsonLd = [], noindex = false, origin }) {
  const s = doc.site || {};
  const t = doc.theme || {};
  const abs = (p) => (!p ? '' : /^https?:\/\//i.test(p) ? p : `${origin}${p.startsWith('/') ? '' : '/'}${p}`);
  const share = safeSrc(image || s.shareImage);
  const shareAbs = share && !share.startsWith('data:') ? abs(share) : '';
  const favicon = safeSrc(s.favicon) || DEFAULT_FAVICON;
  const fonts = fontsHref(t);
  const url = abs(path);
  return `<!doctype html>
<html lang="${esc(s.lang || 'en')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`}
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="${esc(s.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  ${shareAbs ? `<meta property="og:image" content="${esc(shareAbs)}">` : ''}
  <meta name="twitter:card" content="${shareAbs ? 'summary_large_image' : 'summary'}">
  <link rel="icon" href="${esc(favicon)}">
  <meta name="theme-color" content="${esc(t.dark || '#0b1220')}">
  <link rel="alternate" type="application/rss+xml" title="${esc(s.name)} blog" href="/feed.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${fonts ? `<link rel="stylesheet" href="${esc(fonts)}">` : ''}
  <link rel="stylesheet" href="/assets/css/site.css">
  <style id="theme-vars">${themeCSS(t)}</style>
  ${jsonLd.map((d) => `<script type="application/ld+json">${ldJson(d)}</script>`).join('\n  ')}
  <script type="module" src="/assets/js/site.js"></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div id="app">${body}</div>
</body>
</html>
`;
}

function organization(doc, origin) {
  const s = doc.site || {};
  const sameAs = Object.values(s.social || {}).filter((v) => /^https?:\/\//i.test(String(v)));
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: s.name,
    description: s.description || s.tagline,
    url: `${origin}/`,
    ...(s.email ? { email: s.email } : {}),
    ...(s.phone ? { telephone: s.phone } : {}),
    ...(s.location ? { areaServed: s.location } : {}),
    ...(s.logo && !String(s.logo).startsWith('data:') ? { logo: `${origin}${safeSrc(s.logo)}` } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function rssFeed(doc, origin) {
  const s = doc.site || {};
  const items = publishedPosts(doc).slice(0, 30).map((p) => {
    const blurb = (p.kind || 'post') === 'blurb';
    const text = plain(p.body);
    const title = p.title || (text.length > 80 ? `${text.slice(0, 80).replace(/\s+\S*$/, '')}…` : text) || 'Note';
    const link = blurb && /^https?:\/\//i.test(p.link || '') ? p.link : `${origin}${postHref(p)}`;
    const date = new Date(`${String(p.date || '').slice(0, 10)}T12:00:00Z`);
    return `    <item>
      <title>${xml(title)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="false">${xml(p.id)}</guid>${Number.isNaN(date.getTime()) ? '' : `
      <pubDate>${date.toUTCString()}</pubDate>`}
      <description>${xml(p.summary || text.slice(0, 400))}</description>
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(s.name)}</title>
    <link>${xml(origin)}/</link>
    <description>${xml(s.description || s.tagline || '')}</description>
${items}
  </channel>
</rss>
`;
}

// Returns { files: Map<path, contents>, paths: string[] } for every generated file.
export function buildSite(doc, { origin: fallbackOrigin } = {}) {
  const origin = siteOrigin(doc, fallbackOrigin);
  const s = doc.site || {};
  const files = new Map();
  const urls = [];

  doc.pages.forEach((page, i) => {
    const path = pageHref(page, i);
    const title = page.seoTitle || (i === 0 ? s.name : `${page.title} | ${s.name}`);
    files.set(i === 0 ? 'index.html' : `${page.slug}/index.html`, documentHTML(doc, {
      path, title, description: page.seoDescription || s.description || '', body: renderPage(doc, i), origin,
      jsonLd: i === 0 ? [organization(doc, origin), { '@context': 'https://schema.org', '@type': 'WebSite', name: s.name, url: `${origin}/` }] : [],
    }));
    if (page.showInNav !== false || i === 0) urls.push({ loc: `${origin}${path}` });
  });

  for (const post of publishedPosts(doc)) {
    const path = postHref(post);
    const title = postTitle(post) || 'Post';
    const image = safeSrc(post.image);
    files.set(`${POSTS_BASE}/${post.slug}/index.html`, documentHTML(doc, {
      path, title: `${title} | ${s.name}`, description: post.summary || plain(post.body).slice(0, 160) || s.description || '',
      body: renderPostPage(doc, post), image: post.image, type: 'article', origin,
      jsonLd: [{
        '@context': 'https://schema.org', '@type': 'BlogPosting', headline: title, datePublished: post.date,
        description: post.summary || undefined, url: `${origin}${path}`,
        ...(image && !image.startsWith('data:') ? { image: `${origin}${image}` } : {}),
        author: { '@type': 'Organization', name: s.name }, publisher: { '@type': 'Organization', name: s.name },
      }],
    }));
    urls.push({ loc: `${origin}${path}`, lastmod: post.date });
  }

  files.set('404.html', documentHTML(doc, { path: '/404.html', title: `Page not found | ${s.name}`, description: s.description || '', body: renderNotFound(doc), origin, noindex: true }));
  files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${xml(String(u.lastmod).slice(0, 10))}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);
  files.set('feed.xml', rssFeed(doc, origin));
  files.set('robots.txt', `User-agent: *\nDisallow: /editor.html\nDisallow: /preview.html\n\nSitemap: ${origin}/sitemap.xml\n`);
  const paths = [...files.keys()].sort();
  files.set(GENERATED_LIST, `${JSON.stringify({ note: 'Files generated from content/site.json. Do not edit by hand.', files: paths }, null, 2)}\n`);
  return { files, paths: [...paths, GENERATED_LIST] };
}

// Files listed in an older generated.json that the new build no longer produces.
export function staleFiles(previousListJson, paths) {
  try {
    const prev = JSON.parse(previousListJson || '{}').files || [];
    const keep = new Set(paths);
    // Only generated page files can ever be removed, never code or content.
    const pageFile = new RegExp(`^(?:[a-z0-9][a-z0-9-]*/|${POSTS_BASE}/[a-z0-9][a-z0-9-]*/)index\\.html$`);
    return prev.filter((p) => !keep.has(p) && pageFile.test(p));
  } catch { return []; }
}
