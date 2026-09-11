# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

---

# David Ediger Design Website Rebuild

## Project Overview

Rebuilding davidedigerdesign.com — a portfolio/studio site for David Ediger, Creative
Director. Staged on Cloudflare Pages before the domain cutover.

**Architecture: headless WordPress + Astro (static).**
- WordPress at davidedigerdesign.in is a **content API only** — projects, ACF fields,
  taxonomies. No front-end is served from it.
- The Astro site lives in `site/` and fetches project data from the WP REST API **at build
  time**. The published site is fully static; no runtime calls to WordPress.
- Deployed to **Cloudflare Pages** at `ded-site.pages.dev`, building from GitHub
  `davinch1111/ded_site` `main`. Every push to `main` triggers a deploy.

**davidedigerdesign.com is still the OLD WordPress site.** Nothing built here appears there
until the domain cutover. Always verify against `ded-site.pages.dev`.

---

## Repository layout

**The git repository is `site/`, not the project root.** The root holds working assets
(images, video, drafts, reference HTML) and is not version controlled. Anything that must be
committed has to live under `site/`.

```
<project root>            # not a git repo
├── CLAUDE.md             # this file
├── images/ video/ draft/ # working assets, uncommitted
└── site/                 # ← the git repo, deployed to Cloudflare Pages
```

---

## Server — WordPress (content API only)

- **Domain:** davidedigerdesign.in (Hostinger) · **SSH alias:** `ssh ded`
- **WP root:** `/home/u462911715/domains/davidedigerdesign.in/public_html`
- **Env:** PHP 8.3, WP-CLI 2.12.0, MariaDB 11.8
- **REST base:** `https://davidedigerdesign.in/wp-json/wp/v2/`
- Always pass `--path=/home/u462911715/domains/davidedigerdesign.in/public_html` to wp-cli.

```bash
ssh ded "wp cli version --path=/home/u462911715/domains/davidedigerdesign.in/public_html"
```

### mu-plugins
Source of truth is `site/wp-mu-plugins/*.php`. Deploy by `scp`, lint with `php -l`, verify
with `wp eval`. All are additive.

| File | Purpose |
|---|---|
| `ded-cpt.php` | `ded_project` CPT + `discipline` taxonomy; allows `?orderby=menu_order` on the REST collection |
| `ded-fields.php` | Project ACF field group via `acf_add_local_field_group()` — code-defined field names |
| `ded-skill-tax.php` | `skill` taxonomy + canonical seed terms |
| `ded-publish.php` | "Publish to live site" admin control → POSTs to a Cloudflare deploy hook |

---

## Front-End — Astro

### Commands (from `site/`)
```bash
npm run dev       # dev server, port 4321
npm run build     # static build → dist/
npm run preview   # preview the build
```

Astro 6 · Node ≥ 22.12 · deps: `@astrojs/sitemap`, `gsap`, `hls.js`. No UI framework —
interactivity is vanilla JS in Astro `<script>` islands, always bundled to external files.

### Routes (18 pages)

| Route | Source |
|---|---|
| `/` | `src/pages/index.astro` |
| `/work/` | `src/pages/work/index.astro` |
| `/work/<slug>/` | `src/pages/work/[slug].astro` — 8 projects from WP |
| `/services/<slug>/` | `src/pages/services/[slug].astro` — branding, print-signage, web, video, retainer |
| `/start/` | `src/pages/start.astro` |
| `/thanks/` | `src/pages/thanks.astro` — no-JS contact landing, `noindex` |
| `/404` | `src/pages/404.astro` |

`src/pages/_music.astro` is underscore-prefixed, so Astro excludes it from routing.

### Cloudflare Pages Functions (`site/functions/`)

Server-side code, deployed alongside the static build. **Not** part of
`astro build` — exercise it with `npx wrangler pages dev dist`.

| File | Purpose |
|---|---|
| `api/contact.ts` | `POST /api/contact` — contact form backend |
| `_middleware.ts` | `X-Robots-Tag: noindex` for `*.pages.dev` hosts only |

**The preview `noindex` cannot be a `_headers` rule.** `_headers` matches on
PATH and applies to every hostname serving the project, so it cannot tell
`ded-site.pages.dev` from the production domain. Host-based rules need the
middleware.

### Components & data

- `src/layouts/Base.astro` — `<head>`, `@font-face`, **all design tokens in `:root`**, intro
  wipe, global scroll-reveal, Cloudflare Analytics beacon.
- `src/components/SiteNav.astro` — fixed bar; contents capped by `.nav-inner` to the shell
  width. Desktop inline menu; **<768px** (`max-width: 767.98px`, so 768 itself is desktop)
  hamburger → full-screen overlay with `aria-expanded`, Escape, focus trap, focus moved into
  the panel on open and back to the button on close, and close on link / backdrop / outside
  click. Light-section observer flips the bar over light bands
  (`.work-header, .svc, .about-section, .contact-section, .w-cta`).
- **`src/scripts/scroll-lock.ts` — shared, reference-counted scroll lock.** Applies
  `html.scroll-locked`. Both the intro wipe and the mobile menu hold it; the lock lifts only
  once every holder releases. **Never write `body.style.overflow` directly** — two features
  doing that is exactly the bug this replaced (open the menu mid-intro and the page ended up
  permanently locked).
- `src/components/ServicesSection.astro` — the homepage "where do you need help?" list.
- `src/components/SiteFooter.astro`, `Icon.astro` (inline SVG), `ScrollCue.astro`.
- **`src/data/services.ts` — single source for all five services.** Consumed by both
  `/services/[slug]` and `/start`, so the chooser can never list a service that does not
  exist. It lives in its own module because Astro hoists `getStaticPaths()` into a scope that
  cannot see page frontmatter consts (`SERVICES is not defined` at build).

### `/start`
The "not sure what you need?" path. It **narrows the question and hands off** to the single
contact form at `/#contact` — it deliberately does **not** duplicate the form. There is one
form and one endpoint; a second would mean two sets of validation drifting apart.

### Contact form
`POST /api/contact` → `functions/api/contact.ts`. One handler, two paths:
**with JS** the bundled island sends `Accept: application/json` via `fetch` and renders an
inline status; **without JS** the same POST gets a `303` to `/thanks/` (or back to
`/#contact?error=…`). Fields: `name`, `email`, `company`, `services` (chip checkboxes,
read with `getAll`), `budget`, `timeline`, `description`, plus a `botcheck` honeypot that
returns a decoy success.

Turnstile requires JS, so the no-JS path cannot produce a token. Tokenless submissions are
**accepted and flagged** "Not verified by Turnstile" in the email body rather than rejected —
otherwise progressive enhancement would be broken by design. The same applies when
`TURNSTILE_SECRET_KEY` is unset, so the form works before the keys exist. A **failed**
verification is always rejected.

The site key is read from `PUBLIC_TURNSTILE_SITE_KEY` at build time; with it unset the widget
is omitted entirely. Never hardcode either key.

### WP data fetch (build time)
```
GET /wp-json/wp/v2/ded_project?per_page=24&orderby=menu_order&order=asc&_embed
```
A hardcoded fallback of 6 seed projects keeps the build green if WP is unreachable.
Project pages read ACF: `tagline`, `master_image`, `project_logo`, `fact_*`, `brief_text`,
`approach_text`, `gallery_items`, `video_url`, `outcome_text`, `outcome_stats`, `t_*`,
`hover_video`, and the `show_*` section toggles.

---

## Design System

### Type — Montserrat only
Self-hosted **variable** woff2 (`public/fonts/montserrat-var-latin.woff2`, axis 100–900),
preloaded, `font-display: swap`. No Google Fonts, no Font Awesome — icons are inline SVG.
There is exactly one `@font-face`; never add a second.

All type comes from tokens in `Base.astro :root`. **Do not hardcode type in new work.**

| Token group | Value |
|---|---|
| `--type-h1-*` | `clamp(2.4rem, 5vw + 0.3rem, 5rem)` / 300 / `-0.02em` / 1.04 |
| `--type-head-*` | `clamp(1.8rem, 3vw, 2.8rem)` / 300 / `-0.01em` / 1.1 |
| `--type-item-*` | `clamp(1.05rem, 1.6vw, 1.45rem)` / 300 / `-0.01em` |
| `--type-body-*` | 18px / 300 / 1.7 |
| `--type-eyebrow-*` | 11px / 500 / `0.2em` / uppercase / accent blue |

Colour tokens come in light/dark pairs — `--type-*-color` for light bands,
`--type-*-color-on-dark` for bands over `#03040E`/`#0F1014`. The accent `#3457C6` is only
3.0:1 on near-black, so dark bands use periwinkle `--peri` for eyebrows.

**Every page H1 uses `--type-h1-*`** — homepage hero, project title, `/work`, `/services/*`,
`/start`, 404, and Base's global `h1`. Per-page `max-width` / `text-wrap` stay local.

Still hardcoding their own type, not yet migrated: card titles, stat numerals and labels,
testimonial name/role, form controls, `SiteFooter`.

### Layout
| Token | Value |
|---|---|
| `--shell-max` | `1600px` |
| `--shell-pad` | `clamp(40px, 5vw, 100px)` |
| `--row-pad` | `22px` |

**One shell, one box model: padding goes INSIDE the max-width.** Every band
(`.work-header-inner`, `.work-grid-inner`, `.svc__inner`, `.about-inner`, `.quotes-inner`,
`.contact-inner`, `.nav-inner`) uses `max-width: var(--shell-max); padding: 0 var(--shell-pad)`.
Putting the padding on the *section* instead makes that band wider than the rest above
~1744px viewport — that was a real bug. Measured content width: 1296 @1440, 1408 @1920,
310 @390, identical across all bands.

### Colour
Dark-first. `--bg-dark #03040E`, `--bg-surface #111217`, `--text-primary #F5F4F0`,
`--text-dark #0F1014`, `--accent #3457C6`, `--accent-hover #2A47A0`, `--bg-light #F6F3EC`.
Project-page surfaces use the `--w-*` set. A legacy warm-paper palette (`--sand`, `--taupe`,
`--peri`…) survives for tiles and is being phased out component by component.

### List rows (Studio services + Industry experience)
Both use the same pattern, and changes should stay in step:
- Two columns `1.06fr 0.94fr`, right column dropped 60px; one column ≤860px.
- **Column-major**: the left column takes the first half of the items, the right the
  remainder, so DOM order is sequential and tab/screen-reader order matches reading order
  (WCAG 2.4.3). Never split odd/even — that renders 01,03,02,04 in the DOM.
- **Inset highlight**: uniform `--row-pad` with an equal negative horizontal margin, so text
  sits on the column edge at rest and only the hover tint bleeds outward.
- The divider is a `::before` inset by `--row-pad` (not a `border-top`), so it stays flush
  with the text rather than the bled-out box.
- **Hover**: 3px nudge on the `translate` property — *not* `transform`, which both reveal
  systems already own at higher specificity — plus the rule thickening 1px → 3px and the
  blue sweeping to full width via `scaleX`, 360ms.
- Slot classes (`.svc__item--01`…`05`, `.arow--01`…`09`) carry `--rule-x` / `--delay`.
  Unitless fractions, because the sweep is a transform.

### Motion
Scoped transitions, ease-out, `scale(0.97)` on `:active`. No parallax.
**Every motion must be inert under `prefers-reduced-motion: reduce`** — for the list rows
that means no jiggle, no rule growth, no sweep; the background tint alone confirms hover.

### Project page — "How it landed"
`outcome_text` renders as a **lead sentence** in the pull-quote face (28ch measure) plus the
remainder as body copy in **two balanced columns**, one column ≤880px. Before this it set the
whole field at up to 41.6px on an 18ch measure, which turned a 660-character case study into
a tall ribbon, and hard newlines collapsed because it was a single `<p>`.

---

## Security / CSP

**The CSP is strict — no `unsafe-inline` anywhere.** The effective policy is emitted as a
per-page `<meta>` tag from `site/astro.config.mjs` → `security.csp.directives`.
`public/_headers` carries **only** `frame-ancestors` (which a meta CSP cannot express).

> "Add a domain to `_headers`" almost always means **`astro.config.mjs`**.

Consequences for all new work:
- **No inline `style=""`.** Per-item values go through CSS classes and custom properties.
  Runtime CSSOM (`el.style.x = …`) is exempt, but parsed attributes are not.
- **No inline `<script>`.** `build.inlineStylesheets: 'never'` and
  `vite.build.assetsInlineLimit: 0` keep everything external.
- Fail-safe pattern: content is **visible by default**; hidden/animated states are gated on
  `html.js-*` classes set only once a script runs.

Verify after any change: `dist/index.html` should contain **zero** `style="` and no inline
executable `<script>`.

---

## Conventions & gotchas

- All front-end work goes in `site/`. Never build pages or Elementor layouts on WordPress.
- A **Fact-Forcing Gate** requires presenting facts before the first Bash and first
  Edit/Write of a session — expect it, present the facts, retry.
- **Verification harness is not committed.** Recreate throwaway `site/_serve.mjs` (static
  server) + `site/_verify.mjs` (Playwright) as needed, then delete them. Playwright is
  installed `--no-save`; Chromium and WebKit are cached.
  When writing the server, use `fileURLToPath()`, not `URL.pathname` — the project path
  contains spaces, which `pathname` leaves percent-encoded.
- The intro wipe holds the shared scroll lock for `INTRO_TOTAL_MS = 4300`, then releases it
  (on `animationend`, on the timer, on a +3s backstop, and on bfcache restore). Intentional,
  not a leak — but measuring page state inside that window is misleading. Wait it out before
  asserting on scroll or lock state. Reduced motion skips the intro and never locks.
- **`overflow: hidden` does not stop `window.scrollTo()`** — it only blocks *user* scrolling.
  Test scroll locks with a real `mouse.wheel`, or you will get a false negative.
- **Never pair `overflow-x: hidden` with a visible Y axis.** Per CSS Overflow 3 the visible
  axis computes to `auto`, silently creating a scroll container that swallows the first wheel
  gesture. Use `overflow-x: clip` (this was a real bug on project pages).

---

## Current Status

Live on Cloudflare Pages at `ded-site.pages.dev`. **8 projects. 18 pages.**

**Recently shipped (all on `main`):**
- `8640ec5` — shared scroll lock; mobile-nav gaps (outside click, focus into panel, class
  lock, 767.98 breakpoint); first-party contact backend (Pages Function + Turnstile +
  Resend) replacing Web3Forms; `/thanks/`; preview-host `noindex` middleware.
- `5eb9dfb` — "More work" cards fall back to ACF `master_image`, fixing black tiles on the
  four projects with no WP featured image.
- `f2f7ecb` — project pages: `overflow-x: clip` not `hidden`, fixing the swallowed first
  wheel gesture.
- `0cde9a2` — this file rewritten against the built site.
- `839a125` — services + industry rows: unified shell width, inset highlight padding, hover
  jiggle, animated top rule; nav aligned to the shell.
- `6470c38` — the five `/services/*` pages + `/start`, `src/data/services.ts`, column-major
  tab order, unified H1 token, two-column "How it landed", blue favicon.

**Done, previously listed as open:** mobile hamburger nav (now complete — outside click,
focus management, class-based lock); contact form on a first-party endpoint;
`favicon.svg` blue `#3457C6`; OG image at 1200×630.

### Cloudflare dashboard settings this repo expects

The code is deployed but **inert until these exist**:

| Setting | Where | Value |
|---|---|---|
| `RESEND_API_KEY` | Pages → Settings → Env vars (secret, Production + Preview) | Resend API key |
| `TURNSTILE_SECRET_KEY` | same, secret | Turnstile secret |
| `PUBLIC_TURNSTILE_SITE_KEY` | same, **plain** (build-time) | Turnstile site key |
| Resend domain | Resend dashboard | verify `send.davidedigerdesign.com`, add its DNS records |

Without `RESEND_API_KEY` the form returns a clean "misconfigured" error rather than failing
silently. Without the Turnstile keys the widget is omitted and submissions are accepted but
marked unverified.

---

## Open items

1. **Domain + email cutover** to davidedigerdesign.com. **Preserve the SiteGround MX
   records** when DNS moves — mail must keep flowing through SiteGround. Carry MX over
   before switching the apex.
2. **Favicon raster set is stale.** `favicon.svg` is blue, but `favicon.ico`,
   `favicon-16x16.png`, `favicon-32x32.png`, `favicon.png` and `apple-touch-icon.png` are
   still the earlier artwork. Regenerate all from the blue SVG.
3. **Contact form — set the keys and send a live test.** See the dashboard table above.
   Until `RESEND_API_KEY` is set the form cannot deliver. Confirm arrival at
   info@davidedigerdesign.com (SiteGround MX) and check reply-to works.
4. **Populate remaining projects.** 8 live; more to add via the `ded_project` CPT.
   Two were unpublished from WP around 2026-09-10 — `el-salvador-home-building-video` and
   `innotech-building-design` — so their pages now 404. **`public/_redirects` still points
   `/el-salvador-photo-gallery/` at the first of them**, i.e. a redirect into a 404. Repoint
   or restore.
5. **`/work/` index is shadowed by a redirect.** `public/_redirects` has
   `/work/ → /#work 301`, meant for the *old* site's work landing page, but it also matches
   the new `/work/` index — which is built but unreachable in production. Remove that line
   or scope it.
6. **Service page copy is studio-written and unreviewed.** It makes concrete claims
   (two-business-day reply, press checks, no rediscovery fee) — David should confirm or
   correct before launch.
7. **Publish-to-live hook URL is still empty.** `wp_option ded_publish_hook_url` is unset, so
   the button bounces to Settings → Publish to Live. David must paste the Cloudflare deploy
   hook there. **Never hardcode or commit that URL.**
8. **Auto-rebuild webhook** from WP publish (currently manual, or the admin button).
9. **Finish the type migration** for the components listed under Type above.

---

## Guardrails

- **Never touch davidedigerdesign.com** — it is live production until cutover.
- Never delete or overwrite WP demo pages, the front page, the theme, or the database.
- All front-end work goes in `site/`, never on the WP server.
- Confirm with David before anything irreversible.
