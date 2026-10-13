// Public site behavior. Pages arrive fully rendered as static HTML (see build.js);
// this script only adds interactivity: menu, contact form, gallery, video, tag filter.
import { enhance } from './enhance.js';
import { hashToPath } from './schema.js';

// Links from the old site version (#/services, #/post/x) still work.
if (/^#\/[\w/-]*$/.test(location.hash)) location.replace(hashToPath(location.hash));

enhance(document);
