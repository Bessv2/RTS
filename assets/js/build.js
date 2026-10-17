// Static site builder. Turns site.json into finished HTML files.
// Runs in the browser (the editor's Publish button) and in Node (scripts/build.mjs
// and GitHub Actions), so the live site is always produced by the same code.
import { renderPage, renderPostPage, renderNotFound, themeCSS, fontsHref, esc, safeSrc, safeHref, pageHref, postHref, postTitle, publishedPosts, isLivePage, firstSectionIndex, postUpdated } from './render.js';
import { POSTS_BASE, redirectFrom, redirectTo } from './schema.js';
import { BOOKING_ORIGINS } from './blocks.js';
import { openingHoursLd } from './hours.js';

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
  + "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; "
  + `frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.google.com ${BOOKING_ORIGINS.join(' ')}; base-uri 'self'; object-src 'none'; form-action 'self'`;

export const DEFAULT_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232563eb'/%3E%3Cpath d='M10 9h7a5 5 0 0 1 0 10h-1l5 5M10 9v15' stroke='white' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const GENERATED_LIST = 'generated.json';

function siteOrigin(doc, fallback) {
  const v = String(doc.site?.url || fallback || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(v) ? v : `https://${v || 'example.com'}`;
}

// JSON-LD must not be able to close its <script> tag.
const ldJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c');
const xml = (v) => String(v ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const plain = (t) => String(t || '').replace(/```[\w+#.-]*|\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gi, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`]+/g, '').replace(/\s+/g, ' ').trim();

const pageLang = (s) => (/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(String(s.lang || '')) ? s.lang : 'en');
const token = (v) => String(v || '').trim().replace(/[^\w-]/g, '');

// Search engine ownership checks (Google Search Console, Bing Webmaster Tools), on the home page.
function verification(s) {
  const out = [];
  if (token(s.googleVerification)) out.push(`<meta name="google-site-verification" content="${token(s.googleVerification)}">`);
  if (token(s.bingVerification)) out.push(`<meta name="msvalidate.01" content="${token(s.bingVerification)}">`);
  return out.join('\n  ');
}

// Visitor stats (site.analytics = { provider, id }): Cloudflare Web Analytics or
// GoatCounter, both free and cookie-free. Only the chosen service's script is
// allowed on the pages, and only with an ID in its exact format.
const ANALYTICS = {
  cloudflare: { valid: (v) => /^[a-f0-9]{32}$/i.test(v), host: 'https://static.cloudflareinsights.com',
    tag: (v) => `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="${esc(JSON.stringify({ token: v }))}"></script>` },
  goatcounter: { valid: (v) => /^[a-z0-9][a-z0-9-]{1,62}$/i.test(v), host: 'https://gc.zgo.at',
    tag: (v) => `<script data-goatcounter="https://${v}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>` },
};
export function analyticsFor(site) {
  const a = site?.analytics || {};
  const p = ANALYTICS[a.provider];
  const id = String(a.id || '').trim();
  return p && p.valid(id) ? { provider: a.provider, id, host: p.host, tag: p.tag(id) } : null;
}
const cspFor = (doc) => { const a = analyticsFor(doc.site); return a ? CSP.replace("script-src 'self'", `script-src 'self' ${a.host}`) : CSP; };

// Link previews (Facebook, LinkedIn, X, messages) can't show SVG images. The
// built-in library images have 1200×630 JPEG twins, used instead; any other
// SVG is skipped so the site's share image (or no image) is used.
const LIBRARY_TWINS = new Set(['circuit', 'dots-light', 'gradient-blue', 'hex-shield', 'network-mesh', 'server-grid', 'topography', 'waves']);
const FULL_SIZE = /^\/assets\/library\/[\w-]+\.jpg$/;
export function shareImage(src) {
  const s = safeSrc(src);
  if (!s || s.startsWith('data:')) return '';
  const lib = s.match(/^\/?assets\/library\/([\w-]+)\.svg$/);
  if (lib) return LIBRARY_TWINS.has(lib[1]) ? `/assets/library/${lib[1]}.jpg` : '';
  return /\.svg([?#]|$)/i.test(s) ? '' : s;
}

// One complete HTML document. `body` is the rendered page markup.
export function documentHTML(doc, { path, title, description, body, image, type = 'website', jsonLd = [], noindex = false, preload = '', origin }) {
  const s = doc.site || {};
  const t = doc.theme || {};
  const abs = (p) => (!p ? '' : /^https?:\/\//i.test(p) ? p : `${origin}${p.startsWith('/') ? '' : '/'}${p}`);
  const share = shareImage(image) || shareImage(s.shareImage);
  const shareAbs = share ? abs(share) : '';
  const favicon = safeSrc(s.favicon) || DEFAULT_FAVICON;
  const fonts = fontsHref(t);
  const url = abs(path);
  const stats = analyticsFor(s);
  // Section styles (written inside each section by renderSection) move into the head.
  const styles = [];
  const html = String(body).replace(/<style data-s>([^<]*)<\/style>/g, (m, css) => { styles.push(css); return ''; });
  return `<!doctype html>
<html lang="${esc(pageLang(s))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${cspFor(doc)}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`}${path === '/' && verification(s) ? `\n  ${verification(s)}` : ''}
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="${esc(s.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  ${shareAbs ? `<meta property="og:image" content="${esc(shareAbs)}">${FULL_SIZE.test(share) ? '\n  <meta property="og:image:width" content="1200">\n  <meta property="og:image:height" content="630">' : ''}` : ''}
  <meta name="twitter:card" content="${shareAbs ? 'summary_large_image' : 'summary'}">
  <link rel="icon" href="${esc(favicon)}">
  <meta name="theme-color" content="${esc(t.dark || '#0b1220')}">
  <link rel="alternate" type="application/rss+xml" title="${esc(s.name)} blog" href="/feed.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${fonts ? `<link rel="stylesheet" href="${esc(fonts)}">` : ''}
  <link rel="stylesheet" href="/assets/css/site.css">
  ${preload ? `<link rel="preload" as="image" href="${esc(preload)}" fetchpriority="high">` : ''}
  <style id="theme-vars">${themeCSS(t)}</style>${styles.length ? `\n  <style id="section-styles">${styles.join('')}</style>` : ''}
  ${jsonLd.map((d) => `<script type="application/ld+json">${ldJson(d)}</script>`).join('\n  ')}
  <script type="module" src="/assets/js/site.js"></script>${stats ? `\n  ${stats.tag}` : ''}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div id="app">${html}</div>
</body>
</html>
`;
}

// A tiny page that forwards visitors (and search engines) to a new address.
export function redirectHTML(doc, to, origin) {
  const abs = /^https?:\/\//i.test(to) ? to : `${origin}${to}`;
  return `<!doctype html>
<html lang="${esc(pageLang(doc.site || {}))}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="robots" content="noindex">
  <title>This page has moved | ${esc(doc.site?.name)}</title>
  <link rel="canonical" href="${esc(abs)}">
  <meta http-equiv="refresh" content="0; url=${esc(to)}">
</head>
<body>
  <main id="main"><p>This page has moved to <a href="${esc(to)}">${esc(abs)}</a>.</p></main>
</body>
</html>
`;
}

// Background image of the first section: worth fetching before the stylesheet asks for it.
function heroImage(page) {
  const first = page.sections?.[firstSectionIndex(page)];
  const src = safeSrc(first?.data?.bgImage);
  return src && !src.startsWith('data:') ? src : '';
}

// “Home › Services” trails for search results.
function breadcrumbs(origin, trail) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name: String(name || '').trim() || 'Page', item: `${origin}${path}` })),
  };
}

// The blog page in a post's trail, when the site has one.
function blogCrumb(doc) {
  const i = doc.pages.findIndex((p, n) => n > 0 && isLivePage(p, n) && (p.sections || []).some((sec) => sec.type === 'blogfeed'));
  return i > 0 ? [[doc.pages[i].title, pageHref(doc.pages[i], i)]] : [];
}

// Questions and answers from the page's visible FAQ sections, for search engines and assistants.
function faqPage(page) {
  const qa = (page.sections || []).filter((sec) => sec.type === 'faq' && !sec.hidden)
    .flatMap((sec) => (Array.isArray(sec.data?.items) ? sec.data.items : []))
    .map((it) => [plain(it?.q), plain(it?.a)]).filter(([q, a]) => q && a);
  return qa.length ? [{
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }] : [];
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
    ...(openingHoursLd(s.hours).length ? { openingHoursSpecification: openingHoursLd(s.hours) } : {}),
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
    if (!isLivePage(page, i)) return;
    const path = pageHref(page, i);
    const title = page.seoTitle || (i === 0 ? s.name : `${page.title} | ${s.name}`);
    files.set(i === 0 ? 'index.html' : `${page.slug}/index.html`, documentHTML(doc, {
      path, title, description: page.seoDescription || s.description || '', body: renderPage(doc, i), origin,
      noindex: !!page.noindex, preload: heroImage(page), image: page.shareImage,
      jsonLd: [
        ...(i === 0 ? [organization(doc, origin), { '@context': 'https://schema.org', '@type': 'WebSite', name: s.name, url: `${origin}/` }]
          : [breadcrumbs(origin, [[s.name, '/'], [page.title, path]])]),
        ...faqPage(page),
      ],
    }));
    // Pages hidden from the menu are still public; only "hide from search engines" leaves the sitemap.
    if (!page.noindex) urls.push({ loc: `${origin}${path}` });
  });

  for (const post of publishedPosts(doc)) {
    const path = postHref(post);
    const title = postTitle(post) || 'Post';
    files.set(`${POSTS_BASE}/${post.slug}/index.html`, documentHTML(doc, {
      path, title: `${title} | ${s.name}`, description: post.summary || plain(post.body).slice(0, 160) || s.description || '',
      body: renderPostPage(doc, post, { origin }), image: post.image, type: 'article', origin,
      jsonLd: [{
        '@context': 'https://schema.org', '@type': 'BlogPosting', headline: title, datePublished: post.date, dateModified: postUpdated(post) || post.date,
        description: post.summary || undefined, url: `${origin}${path}`,
        ...(shareImage(post.image) ? { image: `${origin}${shareImage(post.image)}` } : {}),
        author: { '@type': 'Organization', name: s.name }, publisher: { '@type': 'Organization', name: s.name },
        wordCount: plain(post.body).split(' ').filter(Boolean).length || undefined,
      }, breadcrumbs(origin, [[s.name, '/'], ...blogCrumb(doc), [title, path]])],
    }));
    urls.push({ loc: `${origin}${path}`, lastmod: postUpdated(post) || post.date });
  }

  // Redirects never replace a real page or post.
  for (const r of doc.redirects || []) {
    const from = redirectFrom(r.from);
    const file = from && `${from}/index.html`;
    if (!file || files.has(file) || !String(r.to || '').trim()) continue;
    files.set(file, redirectHTML(doc, safeHref(redirectTo(r.to)), origin));
  }

  files.set('404.html', documentHTML(doc, { path: '/404.html', title: `Page not found | ${s.name}`, description: s.description || '', body: renderNotFound(doc), origin, noindex: true }));
  files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${xml(String(u.lastmod).slice(0, 10))}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);
  files.set('feed.xml', rssFeed(doc, origin));
  files.set('robots.txt', `User-agent: *\nDisallow: /editor.html\n\nSitemap: ${origin}/sitemap.xml\n`);
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
