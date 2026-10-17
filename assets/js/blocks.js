// Block library: every section type the site and editor know about.
// Each block has defaults (new-section content), fields (editor inspector)
// and render(data, h) which returns the inner HTML of the section.

import { hasHours, hoursSummary, hoursTable, openBadge } from './hours.js';
import { renderLayout } from './layout.js';

const btn = (label, href) => ({ label, href });

// The Google (or other) review page from Settings, when it is a full https:// address.
export const reviewLink = (site) => (/^https:\/\/[^\s/]+\.[^\s]+$/i.test(String(site?.reviewUrl || '').trim()) ? String(site.reviewUrl).trim() : '');
const reviewButton = (h, label, cls) => {
  const url = reviewLink(h.site);
  return url ? `<a class="btn ${cls}" href="${h.esc(url)}" target="_blank" rel="noopener">${h.icon('star')}<span>${h.esc(String(label || '').trim() || 'Leave us a review')}</span></a>` : '';
};

// Turns a YouTube/Vimeo page link into a privacy-friendly embed URL.
export function parseVideo(url) {
  const u = String(url || '').trim();
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) return { embed: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return { embed: `https://player.vimeo.com/video/${m[1]}?autoplay=1`, thumb: '' };
  return null;
}

// Booking calendars that allow being shown inside a page. Any other link
// becomes a "Book a time" button. Keep in sync with the editor's preview CSP.
const withParam = (u, k, v) => { const c = new URL(u.href); c.searchParams.set(k, v); return c.href; };
const BOOKING = [
  [/^calendly\.com$/, 'Calendly', (u) => u.href],
  [/^cal\.com$/, 'Cal.com', (u) => withParam(u, 'embed', 'true')],
  [/^outlook\.office(365)?\.com$/, 'Microsoft Bookings', (u) => u.href],
  [/^calendar\.google\.com$/, 'Google Calendar', (u) => withParam(u, 'gv', 'true')],
  [/^meetings\.hubspot\.com$/, 'HubSpot', (u) => withParam(u, 'embed', 'true')],
  [/^app\.acuityscheduling\.com$/, 'Acuity Scheduling', (u) => u.href],
];
export const BOOKING_ORIGINS = ['https://calendly.com', 'https://cal.com', 'https://app.cal.com', 'https://outlook.office365.com', 'https://outlook.office.com',
  'https://calendar.google.com', 'https://meetings.hubspot.com', 'https://app.acuityscheduling.com'];

// { provider, embed, link } for an https booking link (embed is '' when it can only be linked to), or null.
export function parseBooking(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const p = BOOKING.find(([rx]) => rx.test(u.hostname));
  return p ? { provider: p[1], embed: p[2](u), link: u.href } : { provider: '', embed: '', link: u.href };
}

const SECTION_HEADER_FIELDS = [
  { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'intro', label: 'Intro text', type: 'textarea' },
];

function sectionHeader(h, align = 'center') {
  const inner = h.t('span', 'eyebrow', 'eyebrow', { ph: 'Eyebrow' })
    + h.t('h2', 'heading', 'sec-title', { ph: 'Section heading' })
    + h.t('p', 'intro', 'sec-intro', { ph: 'A short introduction for this section.', ml: true });
  return inner ? `<header class="sec-head sec-head--${align}">${inner}</header>` : '';
}

export const BLOCKS = {
  hero: {
    label: 'Hero',
    group: 'Headers',
    icon: 'layout',
    description: 'Big headline, intro and buttons',
    defaults: () => ({
      bg: 'dark', pad: 'spacious', layout: 'split',
      eyebrow: 'Technology partner',
      heading: 'Technology that just works.',
      text: 'Describe what you do and who you help in one or two sentences.',
      primary: btn('Get started', '/contact/'),
      secondary: btn('Learn more', '#services'),
      image: '',
      cardTitle: 'System status',
      highlights: [{ text: 'Network secured' }, { text: 'Backups verified' }, { text: 'Devices up to date' }],
    }),
    fields: [
      { key: 'layout', label: 'Layout', type: 'segmented', options: [['split', 'Split'], ['center', 'Centered']] },
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'heading', label: 'Headline', type: 'textarea' },
      { key: 'text', label: 'Intro text', type: 'textarea' },
      { key: 'primary', label: 'Primary button', type: 'button' },
      { key: 'secondary', label: 'Secondary button', type: 'button' },
      { key: 'image', label: 'Image (split layout)', type: 'image', help: 'Leave empty to show the status card instead.' },
      { key: 'imageAlt', label: 'Image description', type: 'text', when: (d) => !!d.image, help: 'What the image shows, for people using screen readers and for search engines. Leave empty if it is only decoration.' },
      { key: 'cardTitle', label: 'Status card title', type: 'text', when: (d) => d.layout === 'split' && !d.image },
      { key: 'highlights', label: 'Status card items', type: 'list', itemLabel: 'text',
        when: (d) => d.layout === 'split' && !d.image,
        item: () => ({ text: 'New item' }), itemFields: [{ key: 'text', label: 'Text', type: 'text' }] },
    ],
    render(d, h) {
      const media = d.layout !== 'split' ? '' : d.image
        ? `<div class="hero__media">${h.img('image', 'hero__img', d.imageAlt ?? d.heading)}</div>`
        : `<div class="hero__media"><div class="status-card">
            <div class="status-card__top"><span class="dots"><i></i><i></i><i></i></span>${h.t('span', 'cardTitle', 'status-card__title', { ph: 'Card title' })}</div>
            <ul class="status-card__list">${h.list('highlights').map((_, i) =>
              `<li><span class="status-ok">${h.icon('check')}</span>${h.t('span', `highlights.${i}.text`, '', { ph: 'Item' })}<span class="pulse"></span></li>`).join('')}</ul>
            <div class="status-card__bar"><span></span></div>
          </div></div>`;
      return `<div class="wrap hero__inner hero--${d.layout === 'split' ? 'split' : 'center'}">
        <div class="hero__copy">
          ${h.t('span', 'eyebrow', 'eyebrow', { ph: 'Eyebrow' })}
          ${h.t('h1', 'heading', 'hero__title', { ph: 'Your headline', ml: true })}
          ${h.t('p', 'text', 'lead', { ph: 'Intro text', ml: true })}
          ${h.btns(['primary', 'btn--primary btn--lg'], ['secondary', 'btn--ghost btn--lg'])}
        </div>${media}</div>`;
    },
  },

  logos: {
    label: 'Technology strip',
    group: 'Content',
    icon: 'grid',
    description: 'A row of platforms or partners',
    defaults: () => ({
      bg: 'alt', pad: 'compact',
      heading: 'Platforms we work with',
      items: ['Microsoft 365', 'Google Workspace', 'Apple Business Manager', 'Chromebooks', 'Windows Server'].map((name) => ({ name })),
    }),
    fields: [
      { key: 'heading', label: 'Label', type: 'text' },
      { key: 'items', label: 'Items', type: 'list', itemLabel: 'name', item: () => ({ name: 'New platform', image: '' }),
        itemFields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'image', label: 'Logo image (optional)', type: 'image', help: 'Shown instead of the name. Transparent PNG or SVG works best.' }] },
    ],
    render(d, h) {
      return `<div class="wrap logos">
        ${h.t('p', 'heading', 'logos__label', { ph: 'Label' })}
        <ul class="logos__list">${h.list('items').map((it, i) => `<li>${it.image ? h.img(`items.${i}.image`, 'logos__img', it.name) : h.t('span', `items.${i}.name`, '', { ph: 'Name' })}</li>`).join('')}</ul>
      </div>`;
    },
  },

  services: {
    label: 'Services grid',
    group: 'Content',
    icon: 'grid',
    description: 'Cards with icon, title and text',
    defaults: () => ({
      bg: 'light', pad: 'normal', columns: '3', style: 'card',
      eyebrow: 'Services', heading: 'What we do', intro: 'A quick overview of how we can help.',
      items: [
        { icon: 'shield-check', title: 'Security', text: 'Describe this service in a sentence or two.' },
        { icon: 'network', title: 'Networking', text: 'Describe this service in a sentence or two.' },
        { icon: 'headset', title: 'Support', text: 'Describe this service in a sentence or two.' },
      ],
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'columns', label: 'Columns', type: 'segmented', options: [['2', '2'], ['3', '3'], ['4', '4']] },
      { key: 'style', label: 'Card style', type: 'segmented', options: [['card', 'Cards'], ['plain', 'Minimal']] },
      { key: 'items', label: 'Services', type: 'list', itemLabel: 'title',
        item: () => ({ icon: 'sparkle', title: 'New service', text: 'Describe this service.' }),
        itemFields: [
          { key: 'icon', label: 'Icon', type: 'icon' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'text', label: 'Description', type: 'textarea' },
        ] },
    ],
    render(d, h) {
      return `<div class="wrap">${sectionHeader(h)}
        <div class="grid grid--${d.columns || 3} features features--${d.style || 'card'}">
          ${h.list('items').map((it, i) => `<article class="feature">
            <span class="feature__icon">${h.icon(it.icon)}</span>
            ${h.t('h3', `items.${i}.title`, 'feature__title', { ph: 'Title' })}
            ${h.t('p', `items.${i}.text`, 'feature__text', { ph: 'Description', ml: true })}
          </article>`).join('')}
        </div></div>`;
    },
  },

  split: {
    label: 'Image + text',
    group: 'Content',
    icon: 'layout',
    description: 'Side-by-side story with bullets',
    defaults: () => ({
      bg: 'light', pad: 'normal', side: 'right',
      eyebrow: 'About us', heading: 'Tell your story',
      text: 'Share who you are, what you believe in and why clients choose you.',
      bullets: [{ text: 'First key point' }, { text: 'Second key point' }, { text: 'Third key point' }],
      button: btn('Get in touch', '/contact/'),
      image: '', panelIcon: 'cpu', panelText: '',
    }),
    fields: [
      { key: 'side', label: 'Image side', type: 'segmented', options: [['left', 'Left'], ['right', 'Right']] },
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'bullets', label: 'Bullet points', type: 'list', itemLabel: 'text', item: () => ({ text: 'New point' }),
        itemFields: [{ key: 'text', label: 'Text', type: 'text' }] },
      { key: 'button', label: 'Button', type: 'button' },
      { key: 'image', label: 'Image', type: 'image', help: 'Without an image, a branded panel is shown.' },
      { key: 'imageAlt', label: 'Image description', type: 'text', when: (d) => !!d.image, help: 'What the image shows, for people using screen readers and for search engines. Leave empty if it is only decoration.' },
      { key: 'panelIcon', label: 'Panel icon', type: 'icon', when: (d) => !d.image },
      { key: 'panelText', label: 'Panel caption', type: 'text', when: (d) => !d.image },
    ],
    render(d, h) {
      const media = d.image
        ? h.img('image', 'split__img', d.imageAlt ?? d.heading)
        : `<div class="split__panel"><span class="split__panel-icon">${h.icon(d.panelIcon || 'cpu')}</span>${h.t('p', 'panelText', 'split__panel-text', { ph: 'Optional caption' })}</div>`;
      return `<div class="wrap split split--${d.side === 'left' ? 'left' : 'right'}">
        <div class="split__copy">
          ${h.t('span', 'eyebrow', 'eyebrow', { ph: 'Eyebrow' })}
          ${h.t('h2', 'heading', 'sec-title', { ph: 'Heading' })}
          ${h.t('p', 'text', 'split__text', { ph: 'Text', ml: true })}
          ${h.list('bullets').length ? `<ul class="checks">${h.list('bullets').map((_, i) =>
            `<li>${h.icon('check-circle')}${h.t('span', `bullets.${i}.text`, '', { ph: 'Point' })}</li>`).join('')}</ul>` : ''}
          ${h.btns(['button', 'btn--primary'])}
        </div>
        <div class="split__media">${media}</div>
      </div>`;
    },
  },

  gallery: {
    label: 'Gallery',
    group: 'Media',
    icon: 'image',
    description: 'Photo grid that opens full size',
    defaults: () => ({
      bg: 'light', pad: 'normal', columns: '3', ratio: 'landscape',
      eyebrow: 'Our work', heading: 'Recent projects', intro: '',
      items: [
        { image: 'assets/library/network-mesh.svg', caption: 'Office network upgrade' },
        { image: 'assets/library/server-grid.svg', caption: 'Server room buildout' },
        { image: 'assets/library/circuit.svg', caption: 'Security system install' },
      ],
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'columns', label: 'Columns', type: 'segmented', options: [['2', '2'], ['3', '3'], ['4', '4']] },
      { key: 'ratio', label: 'Image shape', type: 'segmented', options: [['square', 'Square'], ['landscape', 'Wide'], ['portrait', 'Tall'], ['natural', 'Original']] },
      { key: 'items', label: 'Photos', type: 'list', itemLabel: 'caption', item: () => ({ image: '', caption: '' }),
        itemFields: [{ key: 'image', label: 'Photo', type: 'image' }, { key: 'caption', label: 'Caption', type: 'text' }] },
    ],
    render(d, h) {
      return `<div class="wrap">${sectionHeader(h)}
        <div class="grid grid--${d.columns || 3} gallery gallery--${d.ratio || 'landscape'}">${h.list('items').map((it, i) => {
          const img = h.img(`items.${i}.image`, 'gallery__img', it.caption);
          return `<figure class="gallery__item">${img ? `<a href="${h.esc(h.src(it.image))}" data-lightbox="${i}" aria-label="View ${h.esc(it.caption || 'photo')}">${img}</a>` : `<div class="gallery__empty">${h.icon('image')}</div>`}
            ${h.t('figcaption', `items.${i}.caption`, '', { ph: 'Caption (optional)' })}</figure>`;
        }).join('')}</div></div>`;
    },
  },

  video: {
    label: 'Video',
    group: 'Media',
    icon: 'play',
    description: 'YouTube or Vimeo video',
    defaults: () => ({ bg: 'light', pad: 'normal', width: 'wide', eyebrow: '', heading: 'See how we work', intro: '', url: '', caption: '' }),
    fields: [
      { key: 'url', label: 'Video link', type: 'text', help: 'Paste a YouTube or Vimeo link. The video only loads when a visitor presses play.' },
      ...SECTION_HEADER_FIELDS,
      { key: 'width', label: 'Width', type: 'segmented', options: [['narrow', 'Narrow'], ['wide', 'Wide']] },
      { key: 'caption', label: 'Caption', type: 'text' },
    ],
    render(d, h) {
      const v = parseVideo(d.url);
      const player = v
        ? `<div class="video" data-embed="${h.esc(v.embed)}">${v.thumb ? `<img class="video__thumb" src="${h.esc(v.thumb)}" alt="" loading="lazy">` : ''}
            <button class="video__play" type="button" aria-label="Play video">${h.icon('play')}</button></div>`
        : `<div class="video video--empty">${h.icon('play')}<span>${h.edit ? 'Paste a YouTube or Vimeo link in the panel on the right' : ''}</span></div>`;
      return `<div class="wrap${d.width === 'narrow' ? ' wrap--narrow' : ''}">${sectionHeader(h)}${player}
        ${h.t('p', 'caption', 'video__caption', { ph: 'Caption (optional)' })}</div>`;
    },
  },

  map: {
    label: 'Map',
    group: 'Media',
    icon: 'map-pin',
    description: 'Google map of your location',
    defaults: () => ({ bg: 'alt', pad: 'normal', height: 'medium', eyebrow: 'Find us', heading: 'Where we work', intro: '', address: '' }),
    fields: [
      { key: 'address', label: 'Address or place', type: 'text', help: 'A street address, city or business name, e.g. “Springfield, IL”.' },
      ...SECTION_HEADER_FIELDS,
      { key: 'height', label: 'Map height', type: 'segmented', options: [['short', 'S'], ['medium', 'M'], ['tall', 'L']] },
    ],
    render(d, h) {
      const addr = String(d.address || '').trim();
      const map = addr && !h.edit
        ? `<iframe class="map__frame" src="https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map of ${h.esc(addr)}"></iframe>`
        : `<div class="map__placeholder">${h.icon('map-pin')}<strong>${h.esc(addr || (h.edit ? 'Add an address in the panel on the right' : ''))}</strong>${addr ? '<small>The live map appears on your published site</small>' : ''}</div>`;
      return `<div class="wrap">${sectionHeader(h)}<div class="map map--${d.height || 'medium'}">${map}</div></div>`;
    },
  },

  team: {
    label: 'Team',
    group: 'Social proof',
    icon: 'users',
    description: 'People with photo and role',
    defaults: () => ({
      bg: 'light', pad: 'normal', columns: '3',
      eyebrow: 'Our team', heading: 'The people behind the work', intro: '',
      items: [
        { image: '', name: 'Your name', role: 'Founder & Lead Technician', bio: 'A short bio about experience and certifications.' },
      ],
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'columns', label: 'Columns', type: 'segmented', options: [['2', '2'], ['3', '3'], ['4', '4']] },
      { key: 'items', label: 'People', type: 'list', itemLabel: 'name',
        item: () => ({ image: '', name: 'Name', role: 'Role', bio: '' }),
        itemFields: [
          { key: 'image', label: 'Photo', type: 'image' }, { key: 'name', label: 'Name', type: 'text' },
          { key: 'role', label: 'Role', type: 'text' }, { key: 'bio', label: 'Short bio', type: 'textarea' },
        ] },
    ],
    render(d, h) {
      const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
      return `<div class="wrap">${sectionHeader(h)}
        <div class="grid grid--${d.columns || 3} team">${h.list('items').map((it, i) => `<article class="person">
          ${it.image ? h.img(`items.${i}.image`, 'person__img', it.name) : `<span class="person__avatar">${h.esc(initials(it.name))}</span>`}
          ${h.t('h3', `items.${i}.name`, 'person__name', { ph: 'Name' })}
          ${h.t('p', `items.${i}.role`, 'person__role', { ph: 'Role' })}
          ${h.t('p', `items.${i}.bio`, 'person__bio', { ph: 'Short bio', ml: true })}
        </article>`).join('')}</div></div>`;
    },
  },

  blogfeed: {
    label: 'Blog feed',
    group: 'Content',
    icon: 'pen',
    description: 'Your latest posts and blurbs',
    defaults: () => ({ bg: 'light', pad: 'normal', eyebrow: 'Blog', heading: 'Latest from the blog', intro: '', show: 'all', limit: '3', layout: 'grid', showTags: false, search: false }),
    fields: [
      { type: 'note', text: 'Write posts and blurbs in the Blog tab on the left. They appear here automatically, newest first.' },
      ...SECTION_HEADER_FIELDS,
      { key: 'show', label: 'Show', type: 'segmented', options: [['all', 'Everything'], ['post', 'Posts'], ['blurb', 'Blurbs']] },
      { key: 'limit', label: 'How many', type: 'segmented', options: [['3', '3'], ['6', '6'], ['9', '9'], ['all', 'All']], help: 'Use “All” on your main Blog page.' },
      { key: 'layout', label: 'Layout', type: 'segmented', options: [['grid', 'Grid'], ['list', 'List']] },
      { key: 'showTags', label: 'Let visitors filter by tag', type: 'toggle' },
      { key: 'search', label: 'Add a search box', type: 'toggle', help: 'Visitors type a word and see the matching posts. Best with “All”.' },
    ],
    render(d, h) {
      const head = sectionHeader(h);
      const all = h.blog.publishedPosts(h.doc, d.show || 'all');
      const items = d.limit === 'all' ? all : all.slice(0, Number(d.limit) || 3);
      const tags = [...new Set(items.flatMap((p) => h.blog.postTags(p)))].sort((a, b) => a.localeCompare(b));
      const filter = d.showTags && tags.length > 1
        ? `<div class="tag-filter" role="group" aria-label="Filter by tag"><button type="button" class="is-on" data-tag="">All</button>${tags.map((t) => `<button type="button" data-tag="${h.esc(t.toLowerCase())}">${h.esc(t)}</button>`).join('')}</div>`
        : '';
      const search = !!d.search && items.length > 1;
      const box = search
        ? `<div class="blog-search"><label>${h.icon('search')}<input type="search" placeholder="Search posts" aria-label="Search the blog" autocomplete="off" data-blog-search></label></div>`
        : '';
      const body = items.length
        ? `<div class="blogfeed blogfeed--${d.layout === 'list' ? 'list' : 'grid'}">${items.map((p) => h.blog.renderPostCard(p, h.doc, { search, level: h.sub() })).join('')}</div>`
          + (search || filter ? '<p class="blogfeed__none" role="status" aria-live="polite"></p>' : '')
        : `<div class="blogfeed__empty">${h.icon('pen')}<span>${h.edit ? 'No posts yet. Write your first one in the Blog tab.' : 'New posts are coming soon.'}</span></div>`;
      return `<div class="wrap">${head}${box}${filter}${body}</div>`;
    },
  },

  stats: {
    label: 'Stats',
    group: 'Content',
    icon: 'chart',
    description: 'Key numbers in a row',
    defaults: () => ({
      bg: 'dark', pad: 'compact',
      items: [{ value: '10+', label: 'Years experience' }, { value: '500+', label: 'Happy clients' }, { value: '24/7', label: 'Support' }],
    }),
    fields: [
      { key: 'items', label: 'Stats', type: 'list', itemLabel: 'value', item: () => ({ value: '100%', label: 'Label' }),
        itemFields: [{ key: 'value', label: 'Number', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }] },
    ],
    render(d, h) {
      return `<div class="wrap"><dl class="stats">${h.list('items').map((_, i) => `<div class="stat">
        ${h.t('dt', `items.${i}.value`, 'stat__value', { ph: '0' })}
        ${h.t('dd', `items.${i}.label`, 'stat__label', { ph: 'Label' })}</div>`).join('')}</dl></div>`;
    },
  },

  checklist: {
    label: 'Checklist',
    group: 'Content',
    icon: 'list',
    description: 'Skills, features or inclusions',
    defaults: () => ({
      bg: 'alt', pad: 'normal', columns: '2',
      eyebrow: 'Expertise', heading: 'What we bring', intro: '',
      items: [{ text: 'First item' }, { text: 'Second item' }, { text: 'Third item' }, { text: 'Fourth item' }],
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'columns', label: 'Columns', type: 'segmented', options: [['1', '1'], ['2', '2'], ['3', '3']] },
      { key: 'items', label: 'Items', type: 'list', itemLabel: 'text', item: () => ({ text: 'New item' }),
        itemFields: [{ key: 'text', label: 'Text', type: 'textarea' }] },
    ],
    render(d, h) {
      return `<div class="wrap">${sectionHeader(h)}
        <ul class="checklist grid grid--${d.columns || 2}">${h.list('items').map((_, i) =>
          `<li><span class="checklist__mark">${h.icon('check')}</span>${h.t('span', `items.${i}.text`, '', { ph: 'Item', ml: true })}</li>`).join('')}</ul></div>`;
    },
  },

  steps: {
    label: 'Process steps',
    group: 'Content',
    icon: 'steps',
    description: 'Numbered how-it-works steps',
    defaults: () => ({
      bg: 'light', pad: 'normal',
      eyebrow: 'How it works', heading: 'A simple process', intro: '',
      items: [
        { title: 'Talk', text: 'Tell us what you need.' },
        { title: 'Plan', text: 'We design the right solution.' },
        { title: 'Deliver', text: 'We implement and support it.' },
      ],
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'items', label: 'Steps', type: 'list', itemLabel: 'title', item: () => ({ title: 'New step', text: 'Describe this step.' }),
        itemFields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea' }] },
    ],
    render(d, h) {
      return `<div class="wrap">${sectionHeader(h)}
        <ol class="steps">${h.list('items').map((_, i) => `<li class="step">
          <span class="step__num">${String(i + 1).padStart(2, '0')}</span>
          ${h.t('h3', `items.${i}.title`, 'step__title', { ph: 'Step' })}
          ${h.t('p', `items.${i}.text`, 'step__text', { ph: 'Description', ml: true })}</li>`).join('')}</ol></div>`;
    },
  },

  testimonials: {
    label: 'Testimonials',
    group: 'Social proof',
    icon: 'message',
    description: 'Quotes from happy clients',
    defaults: () => ({
      bg: 'alt', pad: 'normal',
      eyebrow: 'Testimonials', heading: 'What clients say', intro: '',
      items: [
        { quote: 'Replace this with a real quote from a client.', name: 'Client name', role: 'Company or role' },
        { quote: 'Replace this with a real quote from a client.', name: 'Client name', role: 'Company or role' },
      ],
      reviewButton: false, reviewLabel: 'Leave us a review',
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'items', label: 'Quotes', type: 'list', itemLabel: 'name',
        item: () => ({ quote: 'A great quote.', name: 'Client name', role: 'Role' }),
        itemFields: [{ key: 'quote', label: 'Quote', type: 'textarea' }, { key: 'name', label: 'Name', type: 'text' }, { key: 'role', label: 'Company / role', type: 'text' }] },
      { key: 'reviewButton', label: 'Show a “Leave a review” button', type: 'toggle', help: 'Links to the review page set in Settings (for example your Google reviews).' },
      { key: 'reviewLabel', label: 'Button text', type: 'text', keepDefaults: true, when: (d) => d.reviewButton },
    ],
    render(d, h) {
      const review = d.reviewButton ? reviewButton(h, d.reviewLabel, 'btn--outline') : '';
      return `<div class="wrap">${sectionHeader(h)}
        <div class="grid grid--${Math.min(3, Math.max(1, h.list('items').length))} quotes">${h.list('items').map((_, i) => `<figure class="quote">
          <span class="quote__stars">${h.icon('star')}${h.icon('star')}${h.icon('star')}${h.icon('star')}${h.icon('star')}</span>
          <blockquote>${h.t('p', `items.${i}.quote`, '', { ph: 'Quote', ml: true })}</blockquote>
          <figcaption>${h.t('strong', `items.${i}.name`, '', { ph: 'Name' })}${h.t('span', `items.${i}.role`, '', { ph: 'Role' })}</figcaption>
        </figure>`).join('')}</div>${review ? `<div class="btns quotes__review">${review}</div>` : ''}</div>`;
    },
  },

  pricing: {
    label: 'Pricing',
    group: 'Social proof',
    icon: 'tag',
    description: 'Plans or packages',
    defaults: () => ({
      bg: 'light', pad: 'normal',
      eyebrow: 'Pricing', heading: 'Simple, transparent plans', intro: '',
      items: [
        { name: 'Basic', price: '$99', period: '/month', text: 'For individuals', features: 'Feature one\nFeature two\nFeature three', button: btn('Choose plan', '/contact/'), featured: false },
        { name: 'Business', price: '$299', period: '/month', text: 'For growing teams', features: 'Everything in Basic\nFeature four\nFeature five', button: btn('Choose plan', '/contact/'), featured: true },
        { name: 'Custom', price: 'Quote', period: '', text: 'For larger projects', features: 'Tailored scope\nDedicated support', button: btn('Contact us', '/contact/'), featured: false },
      ],
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'items', label: 'Plans', type: 'list', itemLabel: 'name',
        item: () => ({ name: 'Plan', price: '$0', period: '/month', text: '', features: 'Feature', button: btn('Choose plan', '/contact/'), featured: false }),
        itemFields: [
          { key: 'name', label: 'Name', type: 'text' }, { key: 'price', label: 'Price', type: 'text' },
          { key: 'period', label: 'Period', type: 'text' }, { key: 'text', label: 'Short description', type: 'text' },
          { key: 'features', label: 'Features (one per line)', type: 'textarea' },
          { key: 'button', label: 'Button', type: 'button' }, { key: 'featured', label: 'Highlight this plan', type: 'toggle' },
        ] },
    ],
    render(d, h) {
      return `<div class="wrap">${sectionHeader(h)}
        <div class="grid grid--${Math.min(4, Math.max(1, h.list('items').length))} plans">${h.list('items').map((it, i) => `<article class="plan${it.featured ? ' plan--featured' : ''}">
          ${it.featured ? '<span class="plan__badge">Most popular</span>' : ''}
          ${h.t('h3', `items.${i}.name`, 'plan__name', { ph: 'Plan' })}
          <p class="plan__price">${h.t('span', `items.${i}.price`, 'plan__amount', { ph: '$0' })}${h.t('span', `items.${i}.period`, 'plan__period', { ph: '/mo' })}</p>
          ${h.t('p', `items.${i}.text`, 'plan__text', { ph: 'Description' })}
          <ul class="plan__features">${String(it.features || '').split('\n').filter((f) => f.trim()).map((f) => `<li>${h.icon('check')}<span>${h.esc(f)}</span></li>`).join('')}</ul>
          ${h.btns([`items.${i}.button`, it.featured ? 'btn--primary btn--block' : 'btn--outline btn--block'])}
        </article>`).join('')}</div></div>`;
    },
  },

  faq: {
    label: 'FAQ',
    group: 'Content',
    icon: 'help',
    description: 'Questions and answers',
    defaults: () => ({
      bg: 'light', pad: 'normal',
      eyebrow: 'FAQ', heading: 'Frequently asked questions', intro: '',
      items: [
        { q: 'A common question?', a: 'A clear, helpful answer.' },
        { q: 'Another common question?', a: 'A clear, helpful answer.' },
      ],
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'items', label: 'Questions', type: 'list', itemLabel: 'q', item: () => ({ q: 'New question?', a: 'Answer.' }),
        itemFields: [{ key: 'q', label: 'Question', type: 'text' }, { key: 'a', label: 'Answer', type: 'textarea' }] },
    ],
    render(d, h) {
      return `<div class="wrap wrap--narrow">${sectionHeader(h)}
        <div class="faq">${h.list('items').map((_, i) => `<details class="faq__item"${h.edit || i === 0 ? ' open' : ''}>
          <summary>${h.t('span', `items.${i}.q`, '', { ph: 'Question' })}<span class="faq__toggle">${h.icon('plus')}</span></summary>
          ${h.t('p', `items.${i}.a`, 'faq__a', { ph: 'Answer', ml: true })}</details>`).join('')}</div></div>`;
    },
  },

  cta: {
    label: 'Call to action',
    group: 'Conversion',
    icon: 'zap',
    description: 'Bold banner with a button',
    defaults: () => ({
      bg: 'brand', pad: 'normal',
      heading: 'Ready to get started?', text: 'Tell visitors what to do next.',
      primary: btn('Contact us', '/contact/'), secondary: btn('', ''),
    }),
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'primary', label: 'Primary button', type: 'button' },
      { key: 'secondary', label: 'Secondary button', type: 'button' },
    ],
    render(d, h) {
      return `<div class="wrap cta">
        <div>${h.t('h2', 'heading', 'cta__title', { ph: 'Heading' })}${h.t('p', 'text', 'cta__text', { ph: 'Text', ml: true })}</div>
        ${h.btns(['primary', 'btn--light btn--lg'], ['secondary', 'btn--ghost btn--lg'])}
      </div>`;
    },
  },

  booking: {
    label: 'Booking calendar',
    group: 'Conversion',
    icon: 'calendar',
    description: 'Let visitors book a call or appointment',
    defaults: () => ({
      bg: 'light', pad: 'normal', height: 'medium', url: '', button: 'Book a time',
      eyebrow: 'Book a call', heading: 'Pick a time that works for you', intro: 'Choose a time for a free consultation. You’ll get a confirmation by email.',
    }),
    fields: [
      { key: 'url', label: 'Booking link', type: 'text', help: 'Paste your Calendly, Microsoft Bookings, Google Calendar appointment page, Cal.com, HubSpot or Acuity link. Other booking links show as a button.' },
      ...SECTION_HEADER_FIELDS,
      { key: 'height', label: 'Calendar height', type: 'segmented', options: [['short', 'S'], ['medium', 'M'], ['tall', 'L']] },
      { key: 'button', label: 'Button text', type: 'text', help: 'Used when the calendar can’t be shown inside the page.' },
    ],
    render(d, h) {
      const b = parseBooking(d.url);
      const label = h.esc(String(d.button || '').trim() || 'Book a time');
      let body = '';
      if (!b) {
        body = h.edit ? `<div class="map__placeholder">${h.icon('calendar')}<strong>Paste your booking link in the panel on the right</strong></div>` : '';
      } else if (b.embed && h.edit) {
        body = `<div class="map__placeholder">${h.icon('calendar')}<strong>${h.esc(b.provider)} calendar</strong><small>The calendar appears on your published site and in Preview</small></div>`;
      } else if (b.embed) {
        body = `<iframe class="booking__frame" src="${h.esc(b.embed)}" title="Book a time (${h.esc(b.provider)})" loading="lazy"></iframe>
          <p class="booking__alt"><a href="${h.esc(b.link)}" target="_blank" rel="noopener">Trouble seeing the calendar? Open it in a new tab ${h.icon('external')}</a></p>`;
      } else {
        body = `<div class="btns booking__btns"><a class="btn btn--primary btn--lg" href="${h.esc(b.link)}" target="_blank" rel="noopener">${label} ${h.icon('external')}</a></div>`;
      }
      return `<div class="wrap">${sectionHeader(h)}<div class="booking booking--${d.height || 'medium'}">${body}</div></div>`;
    },
  },

  resources: {
    label: 'Resource links',
    group: 'Content',
    icon: 'bookmark',
    description: 'Helpful links, guides and tools',
    defaults: () => ({
      bg: 'light', pad: 'normal', layout: 'grid',
      eyebrow: 'Resources', heading: 'Helpful links', intro: 'Free, trustworthy guides and tools we recommend.',
      items: [
        { title: 'Secure Our World', text: 'Four easy ways to stay safe online, from the U.S. Cybersecurity and Infrastructure Security Agency.', url: 'https://www.cisa.gov/secure-our-world', category: 'Stay safe online', icon: 'shield-check' },
        { title: 'Have I Been Pwned', text: 'Check whether your email address appeared in a known data breach.', url: 'https://haveibeenpwned.com/', category: 'Stay safe online', icon: 'search' },
        { title: 'Spot a phishing scam', text: 'The FTC’s guide to recognizing and avoiding phishing emails and texts.', url: 'https://consumer.ftc.gov/articles/how-recognize-avoid-phishing-scams', category: 'Stay safe online', icon: 'mail' },
        { title: 'Report fraud', text: 'Tell the Federal Trade Commission about scams and fraud, even if you didn’t lose money.', url: 'https://reportfraud.ftc.gov/', category: 'If something goes wrong', icon: 'megaphone' },
      ],
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'layout', label: 'Layout', type: 'segmented', options: [['grid', 'Cards'], ['list', 'List']] },
      { key: 'items', label: 'Links', type: 'list', itemLabel: 'title', keepDefaults: true,
        item: () => ({ title: 'New link', text: '', url: 'https://', category: '', icon: 'globe' }),
        itemFields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'url', label: 'Link', type: 'link' },
          { key: 'text', label: 'Short description', type: 'textarea' },
          { key: 'category', label: 'Group (optional)', type: 'text', help: 'Links with the same group are shown together under its name.' },
          { key: 'icon', label: 'Icon', type: 'icon' },
        ] },
    ],
    render(d, h) {
      const groups = new Map();
      h.list('items').forEach((it, i) => {
        if (!it || (!h.edit && !String(it.title || '').trim())) return;
        const g = String(it.category || '').trim();
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push([it, i]);
      });
      const card = ([it, i]) => {
        const href = h.safeHref(it.url);
        let host = '';
        try { host = /^https?:/i.test(href) ? new URL(href).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
        const ext = /^https?:/i.test(href);
        return `<a class="res" href="${h.esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}><span class="res__icon">${h.icon(it.icon || 'globe')}</span>
          <span class="res__body">${h.t('strong', `items.${i}.title`, 'res__title', { ph: 'Title' })}${h.t('span', `items.${i}.text`, 'res__text', { ph: 'Short description', ml: true })}
          ${host ? `<small class="res__src">${h.esc(host)} ${h.icon('external')}</small>` : ''}</span></a>`;
      };
      const many = groups.size > 1 || (groups.size === 1 && !groups.has(''));
      const head = sectionHeader(h);
      const tag = h.sub();
      const body = [...groups].map(([g, items]) => `<div class="res-group">${many && g ? `<${tag} class="res-group__title">${h.esc(g)}</${tag}>` : ''}
        <div class="res-list res-list--${d.layout === 'list' ? 'list' : 'grid'}">${items.map(card).join('')}</div></div>`).join('');
      return `<div class="wrap">${head}${body || (h.edit ? '<p class="res-empty">Add links in the panel on the right.</p>' : '')}</div>`;
    },
  },

  quote: {
    label: 'Quote request',
    group: 'Conversion',
    icon: 'clipboard',
    description: 'A form that asks the right questions',
    defaults: () => ({
      bg: 'alt', pad: 'normal', anchor: 'quote',
      eyebrow: 'Free quote', heading: 'Request a quote', intro: 'Answer a few quick questions and we’ll get back to you within one business day.',
      questions: [
        { label: 'Is this for your home or a business?', type: 'radio', options: 'Home, Business', required: true },
        { label: 'What do you need help with?', type: 'checkboxes', options: 'Network & Wi-Fi, Computers & laptops, Security cameras, Backups, Email & Microsoft 365, Something else', required: true },
        { label: 'How many devices?', type: 'select', options: '1–5, 6–20, 21–50, More than 50', required: false },
        { label: 'Best time to reach you', type: 'select', options: 'Morning, Afternoon, Evening', required: false },
      ],
      details: true, button: 'Request my quote',
      sentText: 'Thanks! We’ve got your request and will reply within one business day.',
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'questions', label: 'Questions', type: 'list', itemLabel: 'label', keepDefaults: true,
        item: () => ({ label: 'New question', type: 'text', options: '', required: false }),
        itemFields: [
          { key: 'label', label: 'Question', type: 'text' },
          { key: 'type', label: 'Answer', type: 'select', options: [['text', 'Short answer'], ['textarea', 'Long answer'], ['select', 'Dropdown list'], ['radio', 'Pick one'], ['checkboxes', 'Pick any']] },
          { key: 'options', label: 'Choices', type: 'text', help: 'Separate the choices with commas.', when: (q) => ['select', 'radio', 'checkboxes'].includes(q.type) },
          { key: 'required', label: 'Must be answered', type: 'toggle' },
        ] },
      { key: 'details', label: 'Ask “Anything else we should know?”', type: 'toggle' },
      { key: 'button', label: 'Button text', type: 'text' },
      { key: 'sentText', label: 'Message after sending', type: 'text', keepDefaults: true, help: 'Shown to visitors once their request has been sent.' },
      { type: 'note', text: 'Name, email and phone are always asked. Requests go to the form endpoint in Settings, or open the visitor’s email app addressed to your email.' },
    ],
    render(d, h) {
      const used = new Set(['name', 'email', 'phone', 'message']);
      const fieldName = (label, i) => {
        let n = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 80) || `Question ${i + 1}`;
        while (used.has(n.toLowerCase()) || n.startsWith('_')) n = `${n.replace(/^_+/, '')} (${i + 1})`;
        used.add(n.toLowerCase());
        return n;
      };
      const qs = h.list('questions').map((q, i) => {
        const label = String(q?.label || '').trim();
        if (!label) return '';
        const n = h.esc(fieldName(label, i));
        const req = q.required ? ' required' : '';
        const mark = q.required ? '' : ' <em>(optional)</em>';
        const opts = String(q.options || '').split(',').map((o) => o.trim()).filter(Boolean).slice(0, 30);
        if (['radio', 'checkboxes'].includes(q.type) && opts.length) {
          const type = q.type === 'radio' ? 'radio' : 'checkbox';
          return `<fieldset class="choices"${q.required && type === 'checkbox' ? ' data-required' : ''}><legend>${h.esc(label)}${mark}</legend>${opts.map((o, j) =>
            `<label class="choice"><input type="${type}" name="${n}" value="${h.esc(o)}"${type === 'radio' && j === 0 ? req : ''}><span>${h.esc(o)}</span></label>`).join('')}</fieldset>`;
        }
        if (q.type === 'select' && opts.length) {
          return `<label><span>${h.esc(label)}${mark}</span><select name="${n}"${req}><option value="">Choose…</option>${opts.map((o) => `<option>${h.esc(o)}</option>`).join('')}</select></label>`;
        }
        if (q.type === 'textarea') return `<label><span>${h.esc(label)}${mark}</span><textarea name="${n}" rows="4" maxlength="3000"${req}></textarea></label>`;
        return `<label><span>${h.esc(label)}${mark}</span><input name="${n}" maxlength="200"${req}></label>`;
      }).join('');
      return `<div class="wrap wrap--narrow quote">${sectionHeader(h)}
        <form class="contact__form quote__form" data-contact-form data-subject="Quote request" data-endpoint="${h.esc(h.site.formEndpoint || '')}" data-email="${h.esc(h.site.email || '')}"${d.sentText ? ` data-sent="${h.esc(d.sentText)}"` : ''} novalidate>
          <div class="field-row"><label>Name<input name="name" required maxlength="100" autocomplete="name"></label>
          <label>Email<input name="email" type="email" required maxlength="200" autocomplete="email"></label></div>
          <label><span>Phone <em>(optional)</em></span><input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
          ${qs}
          ${d.details ? '<label><span>Anything else we should know? <em>(optional)</em></span><textarea name="message" rows="4" maxlength="5000"></textarea></label>' : ''}
          <div class="hp" aria-hidden="true"><label>Leave this field empty<input name="_gotcha" tabindex="-1" autocomplete="off"></label></div>
          <button class="btn btn--primary btn--block btn--lg" type="submit">${h.t('span', 'button', '', { ph: 'Send' }) || 'Request my quote'}</button>
          <p class="form-status" role="status"></p>
        </form></div>`;
    },
  },

  contact: {
    label: 'Contact',
    group: 'Conversion',
    icon: 'mail',
    description: 'Contact details and a form',
    defaults: () => ({
      bg: 'light', pad: 'normal', anchor: 'contact', showForm: true,
      eyebrow: 'Contact', heading: 'Let’s talk', text: 'Tell us about your project and we’ll get back to you within one business day.',
      hours: 'Mon–Fri, 8am–6pm', button: 'Send message',
      sentText: 'Thanks! Your message has been sent. We’ll be in touch soon.',
    }),
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'hours', label: 'Business hours', type: 'textarea', help: 'Press Enter to start a new line, e.g. weekdays on one line and weekends on the next. Used only while business hours aren’t set in Settings.' },
      { key: 'showForm', label: 'Show contact form', type: 'toggle' },
      { key: 'button', label: 'Form button text', type: 'text', when: (d) => d.showForm },
      { key: 'sentText', label: 'Message after sending', type: 'text', keepDefaults: true, when: (d) => d.showForm, help: 'Shown to visitors once their message has been sent.' },
      { type: 'note', text: 'Email, phone and location come from Site settings, so they stay the same everywhere.' },
    ],
    render(d, h) {
      const s = h.site;
      const row = (ic, label, value, href) => value ? `<li><span class="contact__icon">${h.icon(ic)}</span><div><small>${label}</small>${href ? `<a href="${h.esc(href)}">${h.esc(value)}</a>` : `<span>${h.esc(value)}</span>`}</div></li>` : '';
      return `<div class="wrap contact${d.showForm ? '' : ' contact--solo'}">
        <div class="contact__info">
          ${h.t('span', 'eyebrow', 'eyebrow', { ph: 'Eyebrow' })}
          ${h.t('h2', 'heading', 'sec-title', { ph: 'Heading' })}
          ${h.t('p', 'text', 'contact__text', { ph: 'Text', ml: true })}
          <ul class="contact__list">
            ${row('mail', 'Email', s.email, s.email && `mailto:${s.email}`)}
            ${row('phone', 'Phone', s.phone, s.phone && `tel:${s.phone.replace(/[^+\d]/g, '')}`)}
            ${row('map-pin', 'Service area', s.location)}
            ${hasHours(s.hours)
    ? `<li><span class="contact__icon">${h.icon('clock')}</span><div><small>Hours</small><span>${h.esc(hoursSummary(s.hours))}</span>${openBadge(s.hours, h.esc, h.edit)}</div></li>`
    : d.hours || h.edit ? `<li><span class="contact__icon">${h.icon('clock')}</span><div><small>Hours</small>${h.t('span', 'hours', 'contact__lines', { ph: 'Business hours', ml: true })}</div></li>` : ''}
          </ul>
        </div>
        ${d.showForm ? `<form class="contact__form" data-contact-form data-endpoint="${h.esc(h.site.formEndpoint || '')}" data-email="${h.esc(h.site.email || '')}"${d.sentText ? ` data-sent="${h.esc(d.sentText)}"` : ''} novalidate>
          <div class="field-row"><label>Name<input name="name" required maxlength="100" autocomplete="name"></label>
          <label>Email<input name="email" type="email" required maxlength="200" autocomplete="email"></label></div>
          <label><span>Phone <em>(optional)</em></span><input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
          <label>How can we help?<textarea name="message" rows="5" required minlength="10" maxlength="5000"></textarea></label>
          <div class="hp" aria-hidden="true"><label>Leave this field empty<input name="_gotcha" tabindex="-1" autocomplete="off"></label></div>
          <button class="btn btn--primary btn--block btn--lg" type="submit">${h.t('span', 'button', '', { ph: 'Send' }) || 'Send message'}</button>
          <p class="form-status" role="status"></p>
        </form>` : ''}
      </div>`;
    },
  },

  text: {
    label: 'Text',
    group: 'Basic',
    icon: 'type',
    description: 'Heading and paragraph',
    defaults: () => ({ bg: 'light', pad: 'normal', align: 'left', eyebrow: '', heading: 'A heading', text: 'Write anything here. Press Enter for a new line.' }),
    fields: [
      { key: 'align', label: 'Alignment', type: 'segmented', options: [['left', 'Left'], ['center', 'Center']] },
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'text', label: 'Text', type: 'textarea' },
    ],
    render(d, h) {
      return `<div class="wrap wrap--narrow prose prose--${d.align === 'center' ? 'center' : 'left'}">
        ${h.t('span', 'eyebrow', 'eyebrow', { ph: 'Eyebrow' })}${h.t('h2', 'heading', 'sec-title', { ph: 'Heading' })}${h.t('p', 'text', '', { ph: 'Text', ml: true })}</div>`;
    },
  },

  image: {
    label: 'Image',
    group: 'Basic',
    icon: 'image',
    description: 'A single image with caption',
    defaults: () => ({ bg: 'light', pad: 'normal', width: 'wide', image: '', caption: '' }),
    fields: [
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'imageAlt', label: 'Image description', type: 'text', when: (d) => !!d.image, help: 'What the image shows, for people using screen readers and for search engines. Leave empty if it is only decoration.' },
      { key: 'width', label: 'Width', type: 'segmented', options: [['narrow', 'Narrow'], ['wide', 'Wide']] },
      { key: 'caption', label: 'Caption', type: 'text' },
    ],
    render(d, h) {
      return `<figure class="wrap${d.width === 'narrow' ? ' wrap--narrow' : ''} figure">
        ${d.image ? h.img('image', 'figure__img', d.imageAlt || d.caption) : `<div class="figure__empty">${h.icon('image')}<span>${h.edit ? 'Choose an image in the panel on the right' : ''}</span></div>`}
        ${h.t('figcaption', 'caption', '', { ph: 'Caption (optional)' })}</figure>`;
    },
  },

  layout: {
    label: 'Layout',
    group: 'Basic',
    icon: 'grid',
    description: 'Design your own: rows of columns with any elements, each styled your way',
    scoped: true,
    defaults: () => ({
      bg: 'light', pad: 'normal',
      rows: [{ cols: [
        { span: 6, els: [{ type: 'heading', text: 'Design anything here', size: 'l', level: 'auto' }, { type: 'text', size: 'm', html: '<p>Add rows and columns, drag elements between them and style every piece: colours, spacing, borders and fonts, with separate settings for phones.</p>' }, { type: 'button', label: 'Get in touch', href: '/contact/', style: 'primary', size: 'md' }] },
        { span: 6, els: [{ type: 'image', image: 'assets/library/network-mesh.svg', alt: '', ratio: 'landscape' }] },
      ], design: { valign: 'center' } }],
    }),
    fields: [{ type: 'note', text: 'Click a row, column or element on the page to change it. Use + Add element inside a column, and drag pieces to move them.' }],
    render: (d, h) => renderLayout(d, h, LAYOUT_ELEMENTS),
  },
  blank: {
    label: 'Empty section',
    group: 'Basic',
    icon: 'layout',
    description: 'Build your own from text, images and buttons',
    defaults: () => ({ bg: 'light', pad: 'normal', elements: [ELEMENTS.heading.defaults(), ELEMENTS.text.defaults()] }),
    fields: [{ type: 'note', text: 'Add headings, text, images, buttons and more under “Elements” below.' }],
    render(d, h) {
      // The elements themselves are added by renderSection, like on every section.
      return h.edit && !h.list('elements').length
        ? `<div class="wrap"><div class="map__placeholder">${h.icon('plus')}<strong>Empty section</strong><small>Add text, images or buttons in the panel on the right</small></div></div>`
        : '';
    },
  },
};

// Elements: small pieces (a heading, text, an image, a button, a line or some
// space) that can be added to any section, below its own content. Each one is
// a plain object in the section's data.elements list: { type, ...fields }.
const ALIGN = { key: 'align', label: 'Alignment', type: 'segmented', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] };
const WIDTH = { key: 'width', label: 'Width', type: 'segmented', options: [['full', 'Full'], ['twothirds', '⅔'], ['half', '½'], ['third', '⅓']], help: 'Narrower elements sit side by side on computers.' };
export const ELEMENTS = {
  heading: {
    label: 'Heading', icon: 'heading',
    defaults: () => ({ type: 'heading', text: 'A new heading', size: 'medium', align: 'left', width: 'full' }),
    fields: [{ key: 'text', label: 'Heading', type: 'text' }, { key: 'size', label: 'Size', type: 'segmented', options: [['small', 'S'], ['medium', 'M'], ['large', 'L']] }, ALIGN, WIDTH],
  },
  text: {
    label: 'Text', icon: 'align-left',
    defaults: () => ({ type: 'text', text: 'Write your text here. Use **bold**, *italic* and links.', align: 'left', width: 'full' }),
    fields: [{ key: 'text', label: 'Text', type: 'markdown', rows: 6 }, ALIGN, WIDTH],
  },
  image: {
    label: 'Image', icon: 'image',
    defaults: () => ({ type: 'image', image: '', alt: '', caption: '', size: 'medium', align: 'center', width: 'full', round: true }),
    fields: [
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Image description', type: 'text', help: 'What the image shows, for screen readers and search engines.' },
      { key: 'caption', label: 'Caption', type: 'text' },
      { key: 'size', label: 'Size', type: 'segmented', options: [['small', 'S'], ['medium', 'M'], ['large', 'L'], ['fill', 'Fill']] },
      { key: 'round', label: 'Rounded corners', type: 'toggle' },
      ALIGN, WIDTH,
    ],
  },
  button: {
    label: 'Button', icon: 'button',
    defaults: () => ({ type: 'button', label: 'Get in touch', href: '/contact/', style: 'primary', align: 'left', width: 'full' }),
    fields: [
      { key: 'label', label: 'Button text', type: 'text' },
      { key: 'href', label: 'Link', type: 'link' },
      { key: 'style', label: 'Style', type: 'segmented', options: [['primary', 'Solid'], ['outline', 'Outline'], ['ghost', 'Plain']] },
      ALIGN, WIDTH,
    ],
  },
  feature: {
    label: 'Icon box', icon: 'sparkle',
    defaults: () => ({ type: 'feature', icon: 'shield-check', title: 'A short title', text: 'One or two sentences about this point.', align: 'left', width: 'third' }),
    fields: [{ key: 'icon', label: 'Icon', type: 'icon' }, { key: 'title', label: 'Title', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea' }, ALIGN, WIDTH],
  },
  checklist: {
    label: 'Checklist', icon: 'check-circle',
    defaults: () => ({ type: 'checklist', style: 'check', align: 'left', width: 'full', items: [{ text: 'First point' }, { text: 'Second point' }, { text: 'Third point' }] }),
    fields: [
      { key: 'items', label: 'Points', type: 'list', itemLabel: 'text', item: () => ({ text: 'New point' }), itemFields: [{ key: 'text', label: 'Text', type: 'text' }] },
      { key: 'style', label: 'Marks', type: 'segmented', options: [['check', '✓'], ['bullet', '•'], ['number', '1.']] },
      ALIGN, WIDTH,
    ],
  },
  quote: {
    label: 'Quote', icon: 'quote',
    defaults: () => ({ type: 'quote', text: 'A short quote worth repeating.', name: '', align: 'left', width: 'full' }),
    fields: [{ key: 'text', label: 'Quote', type: 'textarea' }, { key: 'name', label: 'Who said it (optional)', type: 'text' }, ALIGN, WIDTH],
  },
  video: {
    label: 'Video', icon: 'play',
    defaults: () => ({ type: 'video', url: '', caption: '', width: 'full' }),
    fields: [
      { key: 'url', label: 'Video link', type: 'text', help: 'Paste a YouTube or Vimeo link. The video only loads when a visitor presses play.' },
      { key: 'caption', label: 'Caption', type: 'text' },
      WIDTH,
    ],
  },
  review: {
    label: 'Review button', icon: 'star',
    defaults: () => ({ type: 'review', label: 'Leave us a review', style: 'primary', align: 'left', width: 'full' }),
    fields: [
      { type: 'note', text: 'Opens the review page set in Settings → Business (for example your Google reviews).' },
      { key: 'label', label: 'Button text', type: 'text' },
      { key: 'style', label: 'Style', type: 'segmented', options: [['primary', 'Solid'], ['outline', 'Outline'], ['ghost', 'Plain']] },
      ALIGN, WIDTH,
    ],
  },
  hours: {
    label: 'Opening hours', icon: 'clock',
    defaults: () => ({ type: 'hours', show: 'week', align: 'left', width: 'full' }),
    fields: [
      { type: 'note', text: 'The hours come from Settings → Business hours, so they stay the same everywhere.' },
      { key: 'show', label: 'Show', type: 'segmented', options: [['week', 'Whole week'], ['summary', 'One line']] },
      ALIGN, WIDTH,
    ],
  },
  divider: {
    label: 'Line', icon: 'minus',
    defaults: () => ({ type: 'divider', width: 'full' }),
    fields: [WIDTH],
  },
  spacer: {
    label: 'Space', icon: 'spacing',
    defaults: () => ({ type: 'spacer', size: 'medium', width: 'full' }),
    fields: [{ key: 'size', label: 'Height', type: 'segmented', options: [['small', 'S'], ['medium', 'M'], ['large', 'L']] }],
  },
};

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

// One element's own markup (without the wrapper that places it), or '' when it
// has nothing to show. `p` is its path in the section data, for editable text.
export function elementBody(el, p, h) {
  let body = '';
  if (el.type === 'heading') {
    const size = pick(el.size, ['small', 'medium', 'large'], 'medium');
    body = h.t(size === 'small' ? 'h3' : 'h2', `${p}.text`, `el-heading el-heading--${size}`, { ph: 'Heading' });
  } else if (el.type === 'text') {
    body = h.t('div', `${p}.text`, 'el-text', { ph: 'Text', ml: true, md: true });
  } else if (el.type === 'image') {
    const src = h.src(el.image);
    const size = pick(el.size, ['small', 'medium', 'large', 'fill'], 'medium');
    if (src) {
      body = `<figure class="el-figure el-figure--${size}${el.round === false ? '' : ' el-figure--round'}"><img src="${h.esc(src)}" alt="${h.esc(el.alt || '')}" loading="lazy" decoding="async">${h.t('figcaption', `${p}.caption`, '', { ph: 'Caption (optional)' })}</figure>`;
    } else if (h.edit) {
      body = `<div class="figure__empty el-figure--${size}">${h.icon('image')}<span>Click to choose an image</span></div>`;
    }
  } else if (el.type === 'button') {
    const style = pick(el.style, ['primary', 'outline', 'ghost'], 'primary');
    body = h.btns([p, `btn--${style}`]).replace('class="btns"', 'class="btns el-btns"');
  } else if (el.type === 'feature') {
    body = `<div class="el-feature"><span class="el-feature__icon">${h.icon(el.icon || 'sparkle')}</span>${h.t('h3', `${p}.title`, 'el-feature__title', { ph: 'Title' })}${h.t('p', `${p}.text`, 'el-feature__text', { ph: 'Text', ml: true })}</div>`;
  } else if (el.type === 'checklist') {
    const style = pick(el.style, ['check', 'bullet', 'number'], 'check');
    const items = (Array.isArray(el.items) ? el.items : []).map((it, j) => (h.edit || String(it?.text || '').trim()
      ? `<li>${style === 'check' ? `<span class="el-list__mark">${h.icon('check')}</span>` : ''}${h.t('span', `${p}.items.${j}.text`, '', { ph: 'Point' })}</li>` : '')).join('');
    body = items ? `<${style === 'number' ? 'ol' : 'ul'} class="el-list el-list--${style}">${items}</${style === 'number' ? 'ol' : 'ul'}>` : '';
  } else if (el.type === 'quote') {
    body = String(el.text || '').trim() || h.edit ? `<figure class="el-quote"><blockquote>${h.t('p', `${p}.text`, '', { ph: 'Quote', ml: true })}</blockquote>${h.t('figcaption', `${p}.name`, '', { ph: 'Who said it (optional)' })}</figure>` : '';
  } else if (el.type === 'video') {
    const v = parseVideo(el.url);
    const player = v
      ? `<div class="video" data-embed="${h.esc(v.embed)}">${v.thumb ? `<img class="video__thumb" src="${h.esc(v.thumb)}" alt="" loading="lazy">` : ''}<button class="video__play" type="button" aria-label="Play video">${h.icon('play')}</button></div>`
      : h.edit ? `<div class="video video--empty">${h.icon('play')}<span>Paste a YouTube or Vimeo link in the panel on the right</span></div>` : '';
    body = player ? `${player}${h.t('p', `${p}.caption`, 'video__caption', { ph: 'Caption (optional)' })}` : '';
  } else if (el.type === 'review') {
    const b = reviewButton(h, el.label, `btn--${pick(el.style, ['primary', 'outline', 'ghost'], 'primary')}`);
    body = b ? `<div class="btns el-btns">${b}</div>` : h.edit ? `<div class="figure__empty el-hours--empty">${h.icon('star')}<span>Add your review page in Settings → Business</span></div>` : '';
  } else if (el.type === 'hours') {
    const hours = h.site.hours;
    if (hasHours(hours)) {
      body = `<div class="el-hours">${openBadge(hours, h.esc, h.edit)}${el.show === 'summary' ? `<p class="el-hours__line">${h.esc(hoursSummary(hours))}</p>` : hoursTable(hours, h.esc)}${hours.note ? `<p class="el-hours__note">${h.esc(hours.note)}</p>` : ''}</div>`;
    } else if (h.edit) {
      body = `<div class="figure__empty el-hours--empty">${h.icon('clock')}<span>Set your hours in Settings → Business hours</span></div>`;
    }
  } else if (el.type === 'divider') {
    body = '<hr class="el-divider">';
  } else if (el.type === 'spacer') {
    body = `<div class="el-spacer el-spacer--${pick(el.size, ['small', 'medium', 'large'], 'medium')}"></div>`;
  }
  return body;
}

// The section's elements, or '' when it has none. Uses the section's helpers,
// so text is editable in the editor and the first heading on a page is its h1.
export function renderElements(d, h) {
  const list = h.list('elements');
  const out = list.map((el, i) => {
    if (!el || !ELEMENTS[el.type]) return '';
    const align = pick(el.align, ['left', 'center', 'right'], 'left');
    const width = pick(el.width, ['full', 'twothirds', 'half', 'third'], 'full');
    const body = elementBody(el, `elements.${i}`, h);
    return body ? `<div class="el el--${width} el--${align}"${h.edit ? ` data-el="${i}"` : ''}>${body}</div>` : '';
  }).join('');
  return out ? `<div class="wrap"><div class="elements">${out}</div></div>` : '';
}

// Elements for layout sections. Their look comes from their style settings
// (design and mobile, see layout.js), so they mostly hold content. `parts` sends a group of style
// settings to an inner part, like the button itself instead of the space it sits in.
const LEVEL = { key: 'level', label: 'Heading level', type: 'select', options: [['auto', 'Automatic'], ['h1', 'H1 – page title'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4'], ['p', 'Not a heading']],
  help: 'Automatic keeps the page outline in order: the first heading on a page becomes its title (H1).' };
const BUTTON_STYLES = [['primary', 'Solid'], ['outline', 'Outline'], ['ghost', 'Plain'], ['light', 'White']];
const RATIOS = { auto: '', square: '1 / 1', landscape: '4 / 3', wide: '16 / 9', portrait: '3 / 4', tall: '2 / 3' };
// A classic element reused as is, without its own alignment and width (columns and styles do that).
const classic = (type, extra = {}) => {
  const base = ELEMENTS[type];
  return {
    label: base.label, icon: base.icon,
    defaults: () => { const d = base.defaults(); delete d.align; delete d.width; return d; },
    fields: base.fields.filter((f) => f !== ALIGN && f !== WIDTH),
    render: (el, p, h) => elementBody(el, p, h),
    ...extra,
  };
};

export const LAYOUT_ELEMENTS = {
  heading: {
    label: 'Heading', icon: 'heading',
    defaults: () => ({ type: 'heading', text: 'A new heading', size: 'l', level: 'auto' }),
    fields: [
      { key: 'text', label: 'Heading', type: 'text' },
      { key: 'size', label: 'Size', type: 'segmented', options: [['label', 'Label'], ['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']] },
      LEVEL,
    ],
    cls: (el) => `lx-size--${pick(el.size, ['label', 's', 'm', 'l', 'xl'], 'l')}`,
    render(el, p, h) {
      const level = pick(el.level, ['auto', 'h1', 'h2', 'h3', 'h4', 'p'], 'auto');
      return h.t(level === 'auto' ? 'h2' : level, `${p}.text`, 'lx-h', { ph: 'Heading', exact: level !== 'auto' });
    },
  },
  text: {
    label: 'Text', icon: 'align-left',
    defaults: () => ({ type: 'text', html: '<p>Write your text here. Select words to make them <strong>bold</strong>, add a link or change their colour.</p>', size: 'm' }),
    fields: [
      { type: 'note', text: 'Click the text on the page to type. Select words for bold, links, lists, headings and colours.' },
      { key: 'size', label: 'Size', type: 'segmented', options: [['s', 'S'], ['m', 'M'], ['l', 'L']] },
    ],
    cls: (el) => `lx-text--${pick(el.size, ['s', 'm', 'l'], 'm')}`,
    render: (el, p, h) => h.html('div', `${p}.html`, 'lx-rich', { ph: 'Write something…' }),
  },
  image: {
    label: 'Image', icon: 'image',
    defaults: () => ({ type: 'image', image: '', alt: '', caption: '', ratio: 'auto', href: '' }),
    fields: [
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Image description', type: 'text', help: 'What the image shows, for screen readers and search engines.' },
      { key: 'caption', label: 'Caption', type: 'text' },
      { key: 'ratio', label: 'Shape', type: 'select', options: [['auto', 'Original'], ['square', 'Square'], ['landscape', 'Landscape 4:3'], ['wide', 'Wide 16:9'], ['portrait', 'Portrait 3:4'], ['tall', 'Tall 2:3']], help: 'Other shapes crop the image to fit.' },
      { key: 'href', label: 'Link (optional)', type: 'link' },
    ],
    parts: { frame: ' img' },
    render(el, p, h) {
      const img = h.img(`${p}.image`, 'lx-img__img', el.alt || '');
      if (!img) return h.edit ? `<div class="figure__empty">${h.icon('image')}<span>Click to choose an image</span></div>` : '';
      const ratio = RATIOS[el.ratio] ? ` style="--ratio:${RATIOS[el.ratio]}"` : '';
      const href = String(el.href || '').trim();
      const linked = href && !h.edit ? `<a href="${h.esc(h.safeHref(href))}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''}>${img}</a>` : img;
      return `<figure class="lx-img${ratio ? ' lx-img--crop' : ''}"${ratio}>${linked}${h.t('figcaption', `${p}.caption`, '', { ph: 'Caption (optional)' })}</figure>`;
    },
  },
  button: {
    label: 'Button', icon: 'button',
    defaults: () => ({ type: 'button', label: 'Get in touch', href: '/contact/', style: 'primary', size: 'md', icon: '', newTab: false }),
    fields: [
      { key: 'label', label: 'Button text', type: 'text' },
      { key: 'href', label: 'Link', type: 'link' },
      { key: 'style', label: 'Style', type: 'segmented', options: BUTTON_STYLES },
      { key: 'size', label: 'Size', type: 'segmented', options: [['sm', 'S'], ['md', 'M'], ['lg', 'L']] },
      { key: 'icon', label: 'Icon (optional)', type: 'icon', optional: true },
      { key: 'newTab', label: 'Open in a new tab', type: 'toggle' },
    ],
    parts: { box: ' .btn', frame: ' .btn', text: ' .btn' },
    render(el, p, h) {
      if (!String(el.label || '').trim() && !h.edit) return '';
      const style = pick(el.style, ['primary', 'outline', 'ghost', 'light'], 'primary');
      const size = pick(el.size, ['sm', 'md', 'lg'], 'md');
      const tab = el.newTab ? ' target="_blank" rel="noopener"' : '';
      return `<a class="btn btn--${style}${size === 'md' ? '' : ` btn--${size}`}" href="${h.esc(h.safeHref(el.href))}"${tab}>${el.icon ? h.icon(el.icon) : ''}<span${h.attr(`${p}.label`, { ph: 'Button' })}>${h.esc(el.label)}</span></a>`;
    },
  },
  icon: {
    label: 'Icon', icon: 'sparkle',
    defaults: () => ({ type: 'icon', icon: 'shield-check', look: 'soft' }),
    fields: [
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'look', label: 'Look', type: 'segmented', options: [['plain', 'Plain'], ['soft', 'Tinted'], ['solid', 'Solid'], ['ring', 'Ring']] },
    ],
    parts: { text: ' .lx-icon', box: ' .lx-icon', frame: ' .lx-icon' },
    render: (el, p, h) => `<span class="lx-icon lx-icon--${pick(el.look, ['plain', 'soft', 'solid', 'ring'], 'soft')}">${h.icon(el.icon || 'sparkle')}</span>`,
  },
  box: {
    label: 'Box', icon: 'box',
    defaults: () => ({
      type: 'box', design: { pt: 32, pb: 32, pl: 32, pr: 32, rad: 18, bg: 'surface' },
      els: [{ type: 'heading', text: 'A card title', size: 's', level: 'auto' }, { type: 'text', html: '<p>A sentence or two about this.</p>', size: 'm' }],
    }),
    fields: [{ type: 'note', text: 'A box groups elements into a card or a coloured panel. Drag elements into it, and set its colours, border and direction under Style.' }],
    render: () => '',
  },
  feature: classic('feature', { label: 'Icon box' }),
  checklist: classic('checklist'),
  quote: classic('quote'),
  video: classic('video', { parts: { frame: ' .video' } }),
  review: classic('review'),
  hours: classic('hours'),
  divider: classic('divider'),
  spacer: classic('spacer'),
};

export const STYLE_FIELDS = [
  { key: 'bg', label: 'Background', type: 'swatches', options: [['light', 'Light'], ['alt', 'Tint'], ['dark', 'Dark'], ['brand', 'Brand']] },
  { key: 'bgImage', label: 'Background image', type: 'image', help: 'Text turns white over the image for readability.' },
  { key: 'overlay', label: 'Image darkness', type: 'segmented', options: [['light', 'Light'], ['medium', 'Medium'], ['strong', 'Strong']], when: (d) => !!d.bgImage },
  { key: 'pad', label: 'Spacing', type: 'segmented', options: [['compact', 'S'], ['normal', 'M'], ['spacious', 'L']] },
  { key: 'showOn', label: 'Show on', type: 'segmented', options: [['all', 'All devices'], ['desktop', 'Computers'], ['mobile', 'Phones']], help: 'Phones means screens narrower than 760px.' },
  { key: 'anchor', label: 'Anchor ID', type: 'text', help: 'Lets buttons link here, e.g. #contact' },
];

export const BLOCK_GROUPS = ['Headers', 'Content', 'Media', 'Social proof', 'Conversion', 'Basic'];
