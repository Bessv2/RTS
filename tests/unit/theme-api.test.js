import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../assets/js/theme-api.js';

// Everything the standalone editor (Bessv2/rts-editor) relies on. If this test
// fails, either restore the export or bump EDITOR_API and update the editor.
const REQUIRED = {
  EDITOR_API: 'number', SCHEMA_VERSION: 'number', POSTS_BASE: 'string', CSP: 'string',
  BLOCKS: 'object', STYLE_FIELDS: 'object', BLOCK_GROUPS: 'object', THEME_PRESETS: 'object', FONTS: 'object', ICON_NAMES: 'object', SOCIAL: 'object',
  renderPage: 'function', renderSection: 'function', renderPostPage: 'function', renderNotFound: 'function', findRoute: 'function',
  postTitle: 'function', formatDate: 'function', themeCSS: 'function', fontsHref: 'function', getPath: 'function', setPath: 'function',
  esc: 'function', pageHref: 'function', rich: 'function', safeSrc: 'function', icon: 'function',
  migrate: 'function', validate: 'function', buildSite: 'function', staleFiles: 'function', enhance: 'function',
  FEATURES: 'object', isLivePage: 'function', anchorId: 'function', redirectFrom: 'function', redirectTo: 'function', audit: 'function',
};

test('theme API exposes everything the editor needs', () => {
  for (const [name, type] of Object.entries(REQUIRED)) assert.equal(typeof api[name], type, `${name} should be a ${type}`);
  assert.equal(api.EDITOR_API, 1);
});

test('every block has the shape the editor expects', () => {
  for (const [type, b] of Object.entries(api.BLOCKS)) {
    assert.equal(typeof b.label, 'string', type);
    assert.ok(api.BLOCK_GROUPS.includes(b.group), `${type} group`);
    assert.equal(typeof b.defaults, 'function', type);
    assert.ok(Array.isArray(b.fields), type);
    assert.equal(typeof b.render, 'function', type);
  }
});
