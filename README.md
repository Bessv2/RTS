# Roe Technology Services website

Consulting and technology services for small to medium businesses and residential clients.
Live at **https://roetechnologyservices.com** (GitHub Pages).

The site has a built-in visual editor, so you can change it without touching code.

## Editing the site

1. Open **https://roetechnologyservices.com/editor.html** on a laptop or desktop.
2. Click any text on the page and type. Click a section to change its images, buttons, icons,
   background and spacing in the panel on the right.
3. Use the left rail to:
   - **Add** new sections (hero, services grid, image + text, stats, checklist, steps,
     testimonials, pricing, FAQ, call to action, contact, text, image)
   - **Layers**: reorder (drag), hide or delete sections
   - **Pages**: add, rename, reorder or remove pages and set search-engine titles
   - **Design**: switch color themes, colors, fonts and corner style
   - **Settings**: business name, email, phone, location and contact form, plus backups
4. Your work is saved automatically as a draft in your browser. Use **Preview** to see the
   real site with your draft.
5. Click **Publish**. This commits the changes to this repository and GitHub Pages updates the
   live site about a minute later.

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

No build step, no framework, just static files GitHub Pages can serve:

| Path | Purpose |
| --- | --- |
| `content/site.json` | All site content, pages, theme and settings (the editor writes this) |
| `index.html` + `assets/js/site.js` | Public site: loads `site.json` and renders the current page |
| `editor.html` + `assets/js/editor.js` | The visual editor |
| `assets/js/blocks.js` | Section library: defaults, editor fields and HTML for each section type |
| `assets/js/render.js` | Shared renderer used by both the site and the editor canvas |
| `assets/js/publish.js` | Publishes to GitHub in a single commit (images go to `assets/uploads/`) |
| `assets/css/site.css` | Site styles, driven by theme CSS variables |
| `assets/css/editor.css`, `editor-canvas.css` | Editor UI and in-canvas selection styles |

To add a new section type, add an entry to `BLOCKS` in `assets/js/blocks.js` (plus styles in
`site.css`) and it shows up in the editor automatically.

Run locally with any static server, for example `npx http-server .`, then open
`http://localhost:8080/` and `http://localhost:8080/editor.html`.
