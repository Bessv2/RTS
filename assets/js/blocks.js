// Block library: every section type the site and editor know about.
// Each block has defaults (new-section content), fields (editor inspector)
// and render(data, h) which returns the inner HTML of the section.

const btn = (label, href) => ({ label, href });

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
      primary: btn('Get started', '#/contact'),
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
      { key: 'cardTitle', label: 'Status card title', type: 'text', when: (d) => d.layout === 'split' && !d.image },
      { key: 'highlights', label: 'Status card items', type: 'list', itemLabel: 'text',
        when: (d) => d.layout === 'split' && !d.image,
        item: () => ({ text: 'New item' }), itemFields: [{ key: 'text', label: 'Text', type: 'text' }] },
    ],
    render(d, h) {
      const media = d.layout !== 'split' ? '' : d.image
        ? `<div class="hero__media">${h.img('image', 'hero__img', d.heading)}</div>`
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
      { key: 'items', label: 'Items', type: 'list', itemLabel: 'name', item: () => ({ name: 'New platform' }),
        itemFields: [{ key: 'name', label: 'Name', type: 'text' }] },
    ],
    render(d, h) {
      return `<div class="wrap logos">
        ${h.t('p', 'heading', 'logos__label', { ph: 'Label' })}
        <ul class="logos__list">${h.list('items').map((_, i) => `<li>${h.t('span', `items.${i}.name`, '', { ph: 'Name' })}</li>`).join('')}</ul>
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
      button: btn('Get in touch', '#/contact'),
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
      { key: 'panelIcon', label: 'Panel icon', type: 'icon', when: (d) => !d.image },
      { key: 'panelText', label: 'Panel caption', type: 'text', when: (d) => !d.image },
    ],
    render(d, h) {
      const media = d.image
        ? h.img('image', 'split__img', d.heading)
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
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'items', label: 'Quotes', type: 'list', itemLabel: 'name',
        item: () => ({ quote: 'A great quote.', name: 'Client name', role: 'Role' }),
        itemFields: [{ key: 'quote', label: 'Quote', type: 'textarea' }, { key: 'name', label: 'Name', type: 'text' }, { key: 'role', label: 'Company / role', type: 'text' }] },
    ],
    render(d, h) {
      return `<div class="wrap">${sectionHeader(h)}
        <div class="grid grid--${Math.min(3, Math.max(1, h.list('items').length))} quotes">${h.list('items').map((_, i) => `<figure class="quote">
          <span class="quote__stars">${h.icon('star')}${h.icon('star')}${h.icon('star')}${h.icon('star')}${h.icon('star')}</span>
          <blockquote>${h.t('p', `items.${i}.quote`, '', { ph: 'Quote', ml: true })}</blockquote>
          <figcaption>${h.t('strong', `items.${i}.name`, '', { ph: 'Name' })}${h.t('span', `items.${i}.role`, '', { ph: 'Role' })}</figcaption>
        </figure>`).join('')}</div></div>`;
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
        { name: 'Basic', price: '$99', period: '/month', text: 'For individuals', features: 'Feature one\nFeature two\nFeature three', button: btn('Choose plan', '#/contact'), featured: false },
        { name: 'Business', price: '$299', period: '/month', text: 'For growing teams', features: 'Everything in Basic\nFeature four\nFeature five', button: btn('Choose plan', '#/contact'), featured: true },
        { name: 'Custom', price: 'Quote', period: '', text: 'For larger projects', features: 'Tailored scope\nDedicated support', button: btn('Contact us', '#/contact'), featured: false },
      ],
    }),
    fields: [
      ...SECTION_HEADER_FIELDS,
      { key: 'items', label: 'Plans', type: 'list', itemLabel: 'name',
        item: () => ({ name: 'Plan', price: '$0', period: '/month', text: '', features: 'Feature', button: btn('Choose plan', '#/contact'), featured: false }),
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
      primary: btn('Contact us', '#/contact'), secondary: btn('', ''),
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

  contact: {
    label: 'Contact',
    group: 'Conversion',
    icon: 'mail',
    description: 'Contact details and a form',
    defaults: () => ({
      bg: 'light', pad: 'normal', anchor: 'contact', showForm: true,
      eyebrow: 'Contact', heading: 'Let’s talk', text: 'Tell us about your project and we’ll get back to you within one business day.',
      hours: 'Mon–Fri, 8am–6pm', button: 'Send message',
    }),
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'hours', label: 'Business hours', type: 'text' },
      { key: 'showForm', label: 'Show contact form', type: 'toggle' },
      { key: 'button', label: 'Form button text', type: 'text', when: (d) => d.showForm },
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
            ${d.hours || h.edit ? `<li><span class="contact__icon">${h.icon('clock')}</span><div><small>Hours</small>${h.t('span', 'hours', '', { ph: 'Business hours' })}</div></li>` : ''}
          </ul>
        </div>
        ${d.showForm ? `<form class="contact__form" data-contact-form novalidate>
          <div class="field-row"><label>Name<input name="name" required autocomplete="name"></label>
          <label>Email<input name="email" type="email" required autocomplete="email"></label></div>
          <label><span>Phone <em>(optional)</em></span><input name="phone" type="tel" autocomplete="tel"></label>
          <label>How can we help?<textarea name="message" rows="5" required></textarea></label>
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
      { key: 'width', label: 'Width', type: 'segmented', options: [['narrow', 'Narrow'], ['wide', 'Wide']] },
      { key: 'caption', label: 'Caption', type: 'text' },
    ],
    render(d, h) {
      return `<figure class="wrap${d.width === 'narrow' ? ' wrap--narrow' : ''} figure">
        ${d.image ? h.img('image', 'figure__img', d.caption) : `<div class="figure__empty">${h.icon('image')}<span>${h.edit ? 'Choose an image in the panel on the right' : ''}</span></div>`}
        ${h.t('figcaption', 'caption', '', { ph: 'Caption (optional)' })}</figure>`;
    },
  },
};

export const STYLE_FIELDS = [
  { key: 'bg', label: 'Background', type: 'swatches', options: [['light', 'Light'], ['alt', 'Tint'], ['dark', 'Dark'], ['brand', 'Brand']] },
  { key: 'pad', label: 'Spacing', type: 'segmented', options: [['compact', 'S'], ['normal', 'M'], ['spacious', 'L']] },
  { key: 'anchor', label: 'Anchor ID', type: 'text', help: 'Lets buttons link here, e.g. #contact' },
];

export const BLOCK_GROUPS = ['Headers', 'Content', 'Social proof', 'Conversion', 'Basic'];
