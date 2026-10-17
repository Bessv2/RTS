// Small escaping and URL helpers shared by every renderer. No imports, so any
// module can use them without import cycles.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Only allow safe link schemes in rendered hrefs.
export function safeHref(href) {
  const v = String(href || '').trim();
  if (!v) return '#';
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|[\w-]+\.html)/i.test(v)) return v;
  if (/^[a-z][\w+.-]*:/i.test(v)) return '#';
  return v;
}

// Image sources: data images, https URLs, or site files. Site-relative paths are
// made root-relative so they work from nested pages like /blog/my-post/.
export function safeSrc(src) {
  const v = String(src || '').trim();
  if (!v) return '';
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(v)) return v;
  if (/^https?:\/\//i.test(v) || v.startsWith('/')) return v;
  if (/^[a-z][\w+.-]*:/i.test(v)) return '';
  return `/${v.replace(/^\.\//, '')}`;
}

export function cssUrl(src) {
  const v = safeSrc(src);
  return v ? `url("${v.replace(/["\\\s()'<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}")` : '';
}
