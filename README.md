# Roe Technology Services website

Consulting and technology services for small to medium businesses and residential clients.
Live at **https://roetechnologyservices.com** (GitHub Pages).

The site has a built-in visual editor, so you can change it without touching code.

## Editing the site

1. Open **https://roetechnologyservices.com/editor.html** on a laptop or desktop.
2. Click any text on the page and type. Click a section to change its images, buttons, icons,
   background and spacing in the panel on the right.
3. Use the left rail to:
   - **Add** new sections: hero, services grid, image + text, gallery, video, map, team, stats,
     checklist, steps, testimonials, pricing, FAQ, call to action, contact, text and image.
     Your saved sections and anything you've copied show up at the top.
   - **Layers**: reorder (drag), hide or delete sections
   - **Pages**: add, rename, reorder or remove pages and set search-engine titles
   - **Blog**: write posts (full articles with their own page) and blurbs (short notes, tips
     or links you like). See "Writing blog posts" below.
   - **Images**: upload photos once and reuse them anywhere, plus built-in tech-style images
   - **Design**: color themes, colors, fonts, corner style and custom CSS
   - **Settings**: business details, contact form, announcement bar, social links, browser-tab
     icon, share image and backups
   - **History**: saved versions, cloud drafts and every published version
4. Your work is saved automatically as a draft in your browser. Use **Preview** to see the
   real site with your draft.
5. Handy extras:
   - Format paragraph text with `**bold**`, `*italic*` and `[link text](https://…)`.
   - Any section can have a **background image**. White text and a darkening overlay keep it readable.
   - Use the section toolbar to **copy** a section to another page or **save** it for later.
   - **Find & replace** (magnifying glass in the top bar) changes wording across every page.
   - Shortcuts: Ctrl+Z / Ctrl+Shift+Z undo/redo, Ctrl+D duplicate, Ctrl+C / Ctrl+V copy and paste
     sections, Delete removes the selected section.
6. Click **Publish**. This builds every page of the site and commits it to this repository in a
   single step; GitHub Pages updates the live site about a minute later. New images go to
   `assets/uploads/`, and the sitemap, RSS feed and search/social preview tags are refreshed.

### Writing blog posts

1. Open the **Blog** tab and click **New post** or **New blurb**.
2. Give it a title, date and tags (comma separated, e.g. `Security, Tips`). Posts also get a
   cover image and a one-line summary.
3. Write in the text box. The toolbar adds **bold**, *italic*, links, headings, lists, quotes
   and images, and the preview in the middle updates as you type.
4. Turn off **Show on website** to keep something as a private draft.
5. Click **Publish**. Posts show up wherever a **Blog feed** section is placed (the Blog page
   and the "Latest" strip on the home page), newest first. Each post gets its own page at
   `/blog/your-post-title/`.

Publishing also updates `feed.xml`, an RSS feed people can subscribe to in a feed reader.

### Where your work is stored

| What | Where |
| --- | --- |
| Working draft and saved versions | Your browser (IndexedDB), on the computer you are using |
| Cloud draft | The `editor-drafts` branch of this repository (never affects the live site) |
| Published content | `content/site.json` and `assets/uploads/` on `main` |
| Built pages | `index.html`, `<page>/index.html`, `blog/<post>/index.html`, `404.html`, `sitemap.xml`, `feed.xml`, `robots.txt` (generated, listed in `generated.json`) |
| Built-in images | `assets/library/` (add your own SVG/PNG files and list them in `manifest.json`) |

### One-time publishing setup

Publishing needs a GitHub fine-grained personal access token:

1. Go to GitHub → Settings → Developer settings → [Fine-grained tokens](https://github.com/settings/personal-access-tokens/new).
2. Repository access: **Only select repositories** → `Bessv2/RTS`.
3. Permissions → Repository → **Contents: Read and write**.
4. Paste the token into the Publish dialog. You can choose to remember it on that computer.

The token is only sent to GitHub's API. Anyone can open the editor page, but nobody can
publish without a token that has write access to this repository.

### Contact form

Messages are delivered through [Formspree](https://formspree.io): the endpoint is set in
**Settings → Form endpoint** (must start with `https://`). If it is empty, the form opens the
visitor's email app instead.

## Security and spam protection

Built into the site:

- **Honeypot field**: a hidden field people never see. Bots that fill it are silently ignored
  (Formspree also recognizes it as `_gotcha`).
- **Minimum fill time**: submissions made within 3 seconds of the form appearing are treated as bots.
- **Cooldown**: one message per minute per browser.
- **Link limit**: messages with more than 2 links are rejected.
- **Length limits** on every field.
- Bots get a fake "sent" message, so they get no signal to adapt to.
- **Content Security Policy** on every page: only the site's own scripts can run, which blocks
  injected-script attacks. The editor may only talk to `api.github.com`.
- **The editor refuses to load inside another site's frame** (clickjacking protection), and
  `robots.txt` keeps it out of search results.
- Links entered in the editor are restricted to safe types (`https:`, `mailto:`, `tel:`, page links).

Recommended Formspree settings (in your Formspree dashboard, open the form, then Settings):

- Keep **spam filtering** turned on.
- If your plan offers it, **restrict submissions to your domain** (`roetechnologyservices.com`).
- Turn on **email notifications** and check the **Spam** tab occasionally for false positives.

Keeping publishing safe:

- Use a fine-grained token limited to this one repository with only **Contents: Read and write**,
  and give it an expiration date. Only tick "Remember token" on your own computer.
- Never paste the token anywhere other than the editor's Publish dialog. If it is ever exposed,
  revoke it on GitHub and create a new one.
- Turn on **two-factor authentication** for your GitHub account.
- In the repository's **Settings → Pages**, make sure **Enforce HTTPS** is checked.

## How it works

The site is designed to keep working for years with as little maintenance as possible:

- **No frameworks, no runtime dependencies.** Plain HTML, CSS and JavaScript modules that every
  browser supports. There is nothing to upgrade and no package that can be abandoned.
- **Every page is a real, pre-built HTML file** (`/services/`, `/blog/my-post/`). Pages load
  instantly, work without JavaScript, and each blog post can be found by search engines.
  JavaScript only adds interactivity (menu, form, gallery, video, tag filter).
- **Content is data.** Everything lives in `content/site.json`, which carries a format version.
  Older content (drafts, backups, history) is upgraded automatically when it is opened.
- **One build, two places.** `assets/js/build.js` turns the content into pages. The editor runs
  it in your browser when you publish, and GitHub Actions runs the same code with Node, so the
  live pages always match the content.
- **Automatic checks.** Every change runs unit tests and browser tests on GitHub.

```
content/site.json ──► assets/js/build.js ──► index.html, services/index.html, blog/…/index.html,
   (your content)       (shared builder)      404.html, sitemap.xml, feed.xml, robots.txt
        ▲                    ▲     ▲
   editor.html          Publish   scripts/build.mjs  ◄── GitHub Actions (on push + monthly)
```

| Path | Purpose |
| --- | --- |
| `content/site.json` | All content, pages, posts, theme and settings |
| `assets/js/schema.js` | Content format version, upgrades (migrations) and validation |
| `assets/js/render.js` | Turns content into HTML. Pure functions, runs in browsers and Node |
| `assets/js/blocks.js` | Section library: defaults, editor fields and HTML for each section type |
| `assets/js/build.js` | Builds complete pages, sitemap, RSS feed, robots.txt and 404 page |
| `assets/js/site.js` | Interactivity on the live site; renders drafts on `preview.html` |
| `assets/js/editor.js` | The visual editor (`editor.html`) |
| `assets/js/publish.js` | GitHub integration: publish in one commit, version history, cloud drafts |
| `assets/js/store.js` | Browser storage (IndexedDB) for drafts and saved versions |
| `assets/library/` | Built-in images offered in the editor's image library |
| `scripts/build.mjs` | Command-line build used by GitHub Actions and for local work |
| `tests/unit/`, `tests/e2e/` | Unit tests (Node's built-in runner) and browser tests (Playwright) |
| `.github/workflows/` | CI (tests on every change) and automatic page rebuilds |

Generated files (`index.html`, the page folders, `404.html`, `sitemap.xml`, `feed.xml`,
`robots.txt`, `generated.json`) should not be edited by hand. Change `content/site.json` or the
code and rebuild.

## Working on the code

Requirements: [Node.js](https://nodejs.org) 20 or newer. Nothing else to install.

```sh
npm run build        # regenerate pages from content/site.json
npm run check        # fail if generated pages are out of date
npm test             # unit tests
npm run serve        # local server at http://localhost:8080 (also /editor.html)
```

Browser tests need Playwright, which is only used for testing:

```sh
npm install --no-save playwright && npx playwright install chromium
npm run test:e2e
```

### Adding a section type

Add an entry to `BLOCKS` in `assets/js/blocks.js` (defaults, editor fields and a `render`
function) plus its styles in `assets/css/site.css`. It appears in the editor automatically.
Add a test if it has any logic.

### Changing the content format

If a change means existing `site.json` files need a different shape:

1. Increase `SCHEMA_VERSION` in `assets/js/schema.js`.
2. Add a function to `MIGRATIONS` that upgrades content from the previous version.
3. Add a test in `tests/unit/schema.test.js` with an example of old content.
4. Run `npm run build`. It upgrades `content/site.json` and rebuilds the pages.

Old drafts, backups and published history are upgraded the same way when opened in the editor,
so nothing ever has to be converted by hand.

### Old links

Links from the first version of the site (`/#/services`, `/#/post/my-post`) automatically
redirect to the new addresses.
