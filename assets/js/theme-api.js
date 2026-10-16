// Theme API: the single, versioned entry point the standalone editor
// (github.com/Bessv2/rts-editor) loads from this site at runtime.
//
// The site owns how content looks (sections, renderer, styles, page builder);
// the editor only edits content. Keeping that boundary in one file means the
// editor always renders and builds with exactly the code that is live here.
//
// Compatibility rules:
//  - Adding exports or optional fields: keep EDITOR_API the same.
//  - Removing/renaming an export or changing a signature: bump EDITOR_API and
//    release a matching editor version. The editor refuses to run against an
//    API version it does not support, instead of corrupting content.
export const EDITOR_API = 1;

// Optional capabilities the editor can switch on when present. Additive, so
// older editors simply ignore them.
export const FEATURES = ['page-drafts', 'noindex', 'redirects', 'code', 'callouts', 'audit', 'page-share-image', 'verification', 'scheduled-posts', 'section-labels', 'booking', 'elements', 'call-button', 'hours', 'quote-form', 'resources', 'analytics', 'reviews', 'blog-search', 'announcement-dates', 'not-found', 'post-toc', 'task-lists'];

export { BLOCKS, STYLE_FIELDS, BLOCK_GROUPS, ELEMENTS, renderElements, parseVideo, parseBooking, BOOKING_ORIGINS } from './blocks.js';
export {
  FONTS, THEME_PRESETS, esc, rich, cssUrl, getPath, setPath, safeHref, safeSrc, fontsHref, themeCSS,
  pageHref, renderSection, renderHeader, renderFooter, renderPage, findRoute, renderNotFound, markdown,
  postHref, formatDate, postTags, publishedPosts, postTitle, renderPostCard, renderPostPage,
  isLivePage, anchorId, firstSectionIndex, isLivePost, today, announceWindow, NOT_FOUND, postHeadings,
} from './render.js';
export { icon, ICON_NAMES, SOCIAL } from './icons.js';
export { SCHEMA_VERSION, POSTS_BASE, hashToPath, migrate, normalize, validate, redirectFrom, redirectTo } from './schema.js';
export { CSP, buildSite, staleFiles, documentHTML, rssFeed, redirectHTML, analyticsFor } from './build.js';
export { enhance } from './enhance.js';
export { audit } from './audit.js';
export { DAYS, parseRange, hoursSummary, openStatus } from './hours.js';
