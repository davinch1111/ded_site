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

**LIVE on davidedigerdesign.com since 2026-09-24.** The cutover is done — this
Astro site is what the domain serves. Verify against `davidedigerdesign.com`;
`ded-site.pages.dev` still serves the identical build as a preview and is
`noindex`, so it is no longer the place to check "what users see".

- **Canonical is the bare domain.** `www` 301s to it. Every canonical, OG URL
  and sitemap entry uses `https://davidedigerdesign.com`.
- **`functions/_middleware.ts` is what keeps the preview out of search**, and
  it is allow-by-default: only hosts ending `.pages.dev` get
  `X-Robots-Tag: noindex, nofollow`, and production is never named, so it
  cannot be caught by a typo. Verified live — the apex sends no such header.
  **Never invert this to a production-host allowlist.**

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
npm run build     # static build → dist/, then postbuild: check-redirects
npm run preview   # preview the build

npx wrangler pages dev dist   # the ONLY way to exercise _redirects + functions
```

**`npm run build` runs `scripts/check-redirects.mjs` as `postbuild`.** That is the
same command Cloudflare Pages runs, so a broken redirect map fails the deploy
instead of shipping. See *Redirects* below.

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

### Redirects (`public/_redirects`)

The 301 map from the old WordPress site, covering all 33 URLs in
`docs/old-urls.txt`. **Live since the cutover** — these rules are now serving
real inbound traffic from search results and old links, so a bad rule is a
visible 404 rather than a dormant one.

- **A redirect beats a static asset on Cloudflare Pages.** A rule whose source
  matches a path this site builds makes that page **unreachable**. `/work/ →
  /#work` was written for the *old* site's work landing page and also swallowed
  the new `/work/` index, which built on every deploy and 301'd away for weeks.
  The new index answers on that exact path, so the old URL needs **no rule**.
- **Work rules target `/work/`, never `/#work`.** Search engines discard the
  fragment, so every `/#…` rule resolves to plain `/` — all the old portfolio
  equity consolidated onto the homepage instead of the work index. `/#about`,
  `/#contact` and `/#services` stay as fragments: no standalone page exists.
- Specific rules must precede splats.

**`scripts/check-redirects.mjs` runs on every build** and fails it on four
things: a source that shadows a built page, a splat that shadows built pages, a
target that doesn't exist in `dist/`, and a fragment target whose `id` is not on
the page. It reads `dist/_redirects` (the copy that deploys) against `dist/`.
Targets rot on their own — `/el-salvador-photo-gallery/` pointed at a project
later unpublished from WP, so the redirect led to a 404 with nothing to flag it.

`_redirects` is edge logic: `npm run preview` and any static server ignore it.
Test with `npx wrangler pages dev dist`.

### SEO / AI search

| Surface | Where |
|---|---|
| `site` + sitemap | `astro.config.mjs` — `https://davidedigerdesign.com`, `@astrojs/sitemap` |
| Crawl directives | `public/robots.txt` → sitemap index |
| AI crawlers | `public/llms.txt` |
| Entity schema | `src/pages/index.astro` — `ProfessionalService` in an `@graph` |
| Per-project schema | `src/pages/work/[slug].astro` — `CreativeWork` |

- **The sitemap filter is deliberate.** `/thanks/` is `noindex`, so it is
  excluded — listing a noindex URL in a sitemap is a contradictory signal and
  shows up in Search Console as "Submitted URL marked noindex". 16 URLs.
  Sitemaps serve **200**; the old WP site returned valid XML under a 404, which
  is why crawlers ignored it.
- **The `ProfessionalService` OfferCatalog is built from `src/data/services.ts`**,
  not retyped, so schema cannot advertise a service with no page. Same reason
  `/start`'s chooser reads from it.
- **Project meta descriptions are composed, not chosen.** The old
  `acf.tagline || acf.brief_text` stopped at the first truthy value, so a
  two-word tagline ("be happy") beat a full brief and all eight projects shipped
  8–53 character descriptions. Now tagline + brief, topped up from discipline
  terms below 70 chars, trimmed on a word boundary. The same string feeds the
  `CreativeWork` description.
- **Project `og:image` still points at `davidedigerdesign.in`** (the WP
  backend). Social previews therefore depend on that host; moving them to the
  production domain or R2 is an open asset-hosting decision.
- `llms.txt` is hand-written and **will drift** — update it when projects or
  services change. It explicitly disclaims `ded-site.pages.dev` and
  `davidedigerdesign.in` so a crawler cites the bare domain.

### Accessibility

Lighthouse **SEO 100 / Accessibility 100**, desktop and mobile, on `/`,
`/work/`, `/start/`, `/services/web/` and a project page.

- **Audit at mobile widths too.** The nav brand link had no accessible name
  below 768px on every page — its only alt-bearing children (`.nav-logotype`)
  are `display: none` there, which removes them from the accessibility tree.
  It is now named on the anchor, which is width-independent. A desktop-only
  audit cannot catch this class of bug.
- **`alt=""` is correct on the emblems, work-card thumbnails and lightbox** —
  cards take their name from a visible `<h2>`, and the lightbox alt is set in
  JS on open. Adding alt text there double-announces.
- **Do not put an `aria-label` on a card that has visible text.** It *replaces*
  the accessible name rather than extending it, so it must contain every
  visible word or it fails WCAG 2.5.3 Label in Name and breaks speech input.
- `/404.html` scores a11y 95 on purpose: the ghost "404" numeral is 1.27:1,
  `aria-hidden`, pure decoration (WCAG 1.4.3 exempt). Its SEO 66 is the
  `noindex` penalty, correct for an error page.

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
- **`src/styles/service-page.css` — the shared `.sv-*` page shell.** Imported by
  `services/[slug].astro`, `start.astro` and `thanks.astro`; all five routes
  resolve to one bundle. **Astro bundles page styles PER ENTRY POINT**, so a
  class authored in one page's `<style is:global>` is emitted *only* for that
  page. `.sv-*` used to live in `services/[slug].astro`, which left `/start/`
  and `/thanks/` with no container, no header offset and no section rhythm in
  production. A comment pointing at another page's style block is not a
  dependency — an import is. Never share classes across pages any other way.

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

#### Turnstile FAILS CLOSED — do not reopen it

Verification rejects on **all five** paths: no secret, no token, `success:false`,
`hostname` not in `ALLOWED_TURNSTILE_HOSTNAMES`, or siteverify unreachable.
Rejection is a `400` asking the visitor to reload.

It used to return `'skipped'` when the secret **or the token** was missing, and
send the mail anyway with "Not verified by Turnstile" appended. **That note was
the spam channel.** Bots do not run JS, so they never send a token, so every one
of them took the skipped branch — a direct POST omitting the token was all it
took. Both keys were correctly set in Production the whole time; this was logic,
not configuration.

**The no-JS path can no longer submit.** Turnstile cannot mint a token without
JS, so that is unavoidable once the form fails closed — it is the exact hole
spam walked through. A `<noscript>` block states this and gives the studio
address. Restoring the old progressive-enhancement behaviour re-opens the hole.

Preview hosts are **not** in the hostname allowlist, so the form does not submit
on `ded-site.pages.dev`. Add the host temporarily to test there.

#### Layers in front of the mail

Everything below is a **silent drop**: the normal success response, nothing
sent, so a bot cannot learn which trap it hit. The reason goes to the log only.

| Trap | Rule |
|---|---|
| Honeypots | `hp_field_x` (aria-hidden wrapper) and `botcheck` |
| Time trap | `ts` stamped on load; missing or `<3s` |
| Content | HTML tags, `[url=`, more than 2 URLs, >30% Cyrillic |
| Sender | `BLOCKED_EMAIL_DOMAINS` — mail.ru, rambler.ru + disposables |

**A false positive here costs a lead, and both of the ones we shipped were
invisible to everybody.** The visitor saw "Thanks, I'll be in touch"; no mail
arrived; nobody knew. Weigh any new rule against that, not against the spam it
catches.

- **Never name a honeypot after a real field.** It was `website`, which is
  exactly what Chrome's autofill matches — and Chrome and several password
  managers ignore `autocomplete="off"`. Autofill populated the trap and killed
  genuine enquiries. `hp_field_x` matches no autofill category, the label is
  bland, and `data-lpignore` / `data-1p-ignore` / `data-form-type` cover the
  managers that ignore `autocomplete`. `website` is deliberately **not** still
  checked server-side — a cached page plus autofill is the exact bug.
- **The form-age ceiling is 24h and VISIBLE**, not 2h and silent. Someone who
  writes a careful brief over lunch is the *most* valuable enquiry, and the old
  limit discarded precisely those. An expired form now returns a 400 telling
  them to copy, reload and resend. The ceiling is near-useless defensively
  anyway: bots submit in seconds and die on Turnstile and the 3s floor.
- **A clock running ahead produces a negative age**, which used to fall into
  the "too fast" branch and be dropped. Skew is now logged and skipped. Safe,
  because forging a future `ts` still does not produce a Turnstile token.

Cyrillic is measured against **letters, not characters**, so punctuation and
digits cannot dilute the ratio.

Two rules instead show a **visible** error, because a person can fix them: no
service selected, and a description under 30 characters.

Logs carry the reason and the email **domain only** — never the address, name,
or message body.

**The honeypot and `<noscript>` are styled from the stylesheet, never `style=""`.**
The CSP has no `style-src-attr 'unsafe-inline'`, so an inline style would be
dropped and the honeypot would render visibly to everyone. The `ts` stamp rides
the existing bundled island for the same reason.

The site key is read from `PUBLIC_TURNSTILE_SITE_KEY` at build time; with it unset the widget
is omitted entirely. Never hardcode either key.

**Testing without a browser:** Cloudflare's always-pass secret
`1x0000000000000000000000000000000AA` makes siteverify succeed for any token —
but it reports `hostname: example.com`, which the allowlist rejects, so add that
host temporarily too. Reaching the `RESEND_API_KEY` 500 locally means a
submission cleared every anti-spam gate.

### WP data fetch (build time)
```
GET /wp-json/wp/v2/ded_project?per_page=24&orderby=menu_order&order=asc&_embed
```
**WP must be reachable at build time — the build FAILS without it.** Only the
homepage degrades gracefully (`index.astro` has `FALLBACK_PROJECTS`, 6 seed
entries). `work/[slug].astro` throws on a network error *and* on an empty
result ("Aborting build to avoid silent empty site"), which fails the whole
deploy. That is deliberate — shipping a work section with no work is worse than
not shipping — but it means **davidedigerdesign.in is a hard dependency of every
deploy**, and a WP outage blocks releases of unrelated changes.

Note for local builds: if David's VPN (IPVanish) is on, `.in` is unroutable from
his machine and `npm run build` fails with exactly this error. Check the VPN
before assuming WordPress is down.
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
- **Every row reads `num → title → body → arrow`** — including the full-width
  retainer row 05, whose two columns are `.svc__wide-head` (num + title) and
  `.svc__wide-main` (body + arrow). The arrow used to sit inside `.svc__wide-head`,
  which announced the link label before the text explaining it and rendered it
  literally above the description at ≤860px. `.svc__wide-main` is the grid item,
  so `align-self` belongs there, not on `.svc__body--wide`.

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

## Email signature assets — hosted on `.in`, NOT `.com`

David's Apple Mail signature loads six images. They are served from
**`https://davidedigerdesign.in/email/`** (Hostinger, LiteSpeed, no CDN), not
from this site. That looks backwards. Do not "tidy it up".

**Cloudflare blocks Apple Mail's image fetch.** The same six files serve a clean
`200 image/png` from `davidedigerdesign.com/email/` — verified with curl, with
Gmail/Outlook/Apple-Mail/Yahoo proxy user-agents, and by loading them in a
browser on David's own machine. Mail still rendered them broken. Copying the
identical files to `.in` fixed it immediately. The likely cause is Bot Fight
Mode or a WAF managed rule challenging Mail's TLS fingerprint, which a
user-agent test cannot reproduce. **Open item: a WAF Skip rule scoped to
`/email/*` would let them move back here.** Nobody has looked in the dashboard yet.

`public/email/*.png` is still committed and still deployed to `.com`. **Leave it
there.** Mail sent before 2026-09-26 references those URLs, and they work for
recipients; deleting them breaks images in already-delivered messages.

Two gotchas worth keeping:

- **David's VPN (IPVanish) does not route to `.in`.** With it on, the whole host
  is unreachable from his machine, so he sees broken images in his own compose
  window. Recipients fetch over their own connections and are unaffected. A
  "the images broke again" report should start by asking whether the VPN is on.
- **The signatures were also structurally corrupt**, independently of hosting.
  Both declared `Content-Type: multipart/related` with a boundary that was never
  closed — no `--boundary--` terminator. Browsers tolerate that; Mail's MIME
  parser does not. They now ship as plain `text/html`, which is correct because
  there are zero `cid:` references — every image is a remote URL, so the
  multipart container was vestigial. If images break after a signature is edited
  in a generator, check the MIME envelope before blaming the host.

## Conventions & gotchas

- All front-end work goes in `site/`. Never build pages or Elementor layouts on WordPress.
- **The Fact-Forcing Gate is gone.** It came from the `everything-claude-code`
  plugin, which was archived out of `~/.claude/skills/` on 2026-09-23 after a
  security audit (it auto-ran 40 hooks and logged every tool input to
  `~/.claude/homunculus/`). No hooks are installed now. Nothing needs to be
  presented before a Bash or Edit call any more.
- **`docs/` is a pre-cutover archive of the OLD site**, captured while it was
  still reachable: `old-urls.txt` (33 URLs) and `old-site-content.md` (text).
  **`/about/`, `/awards/`, `/studio-2/` and `/typography/` are Brooklyn theme
  DEMO content — never reuse that copy.** Note the old sitemaps served HTTP 404
  while returning valid XML, which is why indexing was patchy; they were
  captured by reading the body regardless of status.
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

**Recently shipped (all on `main`, newest first):**
- `a9b8fd1` — contact form hardened: Turnstile **fails closed** (the `'skipped'`
  branch was the spam channel), plus honeypot, time trap, content heuristics and
  a domain blocklist, all silent. 13 cases tested.
- `4eaae8b` — a11y: four WCAG AA contrast failures fixed (`.foot-copy` was
  1.98:1); nav brand link named, it had NO accessible name below 768px on every
  page; `aria-label` removed from `/work/` cards (WCAG 2.5.3). Lighthouse SEO
  100 / a11y 100, desktop and mobile.
- `b17803d` — `public/llms.txt` for AI crawlers.
- `fc78d14` — homepage entity upgraded Organization → `ProfessionalService`
  (BC address, areaServed, OfferCatalog built from `src/data/services.ts`).
- `34406c0` — project meta descriptions composed rather than picked by `||`;
  all eight went from 8–53 chars to 145–150.
- `511df51` — noindex `/thanks/` excluded from the sitemap.
- `d110ce1` — services row 05: the link moves below its description, so all five
  rows read `num → title → body → arrow` in DOM (= tab / screen-reader) order.
- `82ca29a` — `/work/` unshadowed (the redirect that hid it is deleted, not
  rewritten); old portfolio URLs repointed from `/#work` to `/work/`;
  `/el-salvador-photo-gallery/` no longer redirects into a 404;
  `scripts/check-redirects.mjs` added as `postbuild`; 404 page made useful and
  its link targets raised to the WCAG 24px minimum.
- `c3ba05b` — `/start/` and `/thanks/` rendered unstyled in production: the
  `.sv-*` system moves into `src/styles/service-page.css` and is imported,
  not borrowed from another page's `<style is:global>`.
- `fd31dfe` · `e7194fc` — old-site text archive + 33-URL inventory captured
  before cutover (`docs/old-site-content.md`, `docs/old-urls.txt`).
- `d4251b6` · `0f1e7c3` · `ea4c3e6` — hero: landscape phone fills the large
  viewport with proximity snap; bottom-weighted portrait layout; WP-managed
  mobile fallback image field.
- `8122867` — mobile nav: wordmark no longer collides with the burger.
- `8640ec5` — shared scroll lock; mobile-nav gaps (outside click, focus into panel, class
  lock, 767.98 breakpoint); first-party contact backend (Pages Function + Turnstile +
  Resend) replacing Web3Forms; `/thanks/`; preview-host `noindex` middleware.
- `5eb9dfb` — "More work" cards fall back to ACF `master_image`, fixing black tiles on the
  four projects with no WP featured image.
- `f2f7ecb` — project pages: `overflow-x: clip` not `hidden`, fixing the swallowed first
  wheel gesture.
- `839a125` — services + industry rows: unified shell width, inset highlight padding, hover
  jiggle, animated top rule; nav aligned to the shell.
- `6470c38` — the five `/services/*` pages + `/start`, `src/data/services.ts`, column-major
  tab order, unified H1 token, two-column "How it landed", blue favicon.

**Done, previously listed as open:** mobile hamburger nav (outside click, focus
management, class-based lock); contact form on a first-party endpoint;
`favicon.svg` blue `#3457C6`; OG image at 1200×630; the `/work/` redirect shadow
and the redirect-into-a-404 (both closed by `82ca29a`).

### Branches

`feat/d1-enquiries` (`f068b7e`, local + origin) parks the D1 enquiry store,
admin inbox and R2 backup. **The INSERT does not work.** Do not merge it or
build on it without being asked.

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

1. **Hero mobile fallback image is still empty.** The WP field exists and the
   markup renders only when it is set; until David uploads a graphic, phones
   ≤480px get the dark background with no image behind the headline.
   *(Domain + email cutover is DONE — live on the bare domain since 2026-09-24,
   DNS on Cloudflare, SiteGround MX carried over untouched and still serving
   mail.)*
2. **Favicon raster set is stale.** `favicon.svg` is blue, but `favicon.ico`,
   `favicon-16x16.png`, `favicon-32x32.png`, `favicon.png` and `apple-touch-icon.png` are
   still the earlier artwork. Regenerate all from the blue SVG.
3. **Contact form — confirm the test email actually arrived.** A real browser
   submission WAS made on 2026-09-26 from Brave: Turnstile auto-solved a
   794-char token, both honeypots stayed empty, `ts` was 130s old, and the form
   returned `ok` with the success message. Subject *"New project inquiry —
   Claude Code TEST submission"*, reply-to `mk3@mk-4.com`. **Nobody has checked
   the inbox.** That matters because a silent drop returns the IDENTICAL success
   message — the response alone does not prove delivery. Confirm it landed at
   info@davidedigerdesign.com (SiteGround MX) and that reply-to works.

   **The Chrome/Brave autofill check was NOT completed.** Brave offered no
   autofill dropdown — that profile has no saved address data, so there was
   nothing to trigger. No automated test can prove a real browser's heuristics
   leave `hp_field_x` alone, and an autofilled honeypot silently destroys the
   enquiry. With a saved address in the browser, autofill the form and inspect
   `hp_field_x` in devtools; do not just watch the visible inputs.

4. **Populate remaining projects.** 8 live; more to add via the `ded_project` CPT.
   Two were unpublished from WP around 2026-09-10 — `el-salvador-home-building-video` and
   `innotech-building-design` — so their pages 404. `/el-salvador-photo-gallery/` is parked
   on `/work/` until the first returns; repoint it at the project if it is restored.
5. **Nav and footer still link to `/#work`, not `/work/`.** They were written
   while the `/work/` index was unreachable. Now that it resolves, `SiteNav` and
   `SiteFooter` should probably point at the real page. Not changed yet — it is
   a visible navigation change and wants David's say-so.
6. **Cloudflare blocks Apple Mail from loading images off `.com`.** Email
   signature assets live on `davidedigerdesign.in` as a workaround — see *Email
   signature assets* above. To bring them back here, add a WAF **Skip** rule
   scoped to `/email/*` (suspect Bot Fight Mode or a managed rule matching on
   TLS fingerprint), then repoint the two Mail signatures. Parked by David
   2026-09-26; not urgent, but it will bite anything else that needs an email
   client to fetch from this domain.
7. **Service page copy is studio-written and unreviewed.** It makes concrete claims
   (two-business-day reply, press checks, no rediscovery fee) — David should confirm or
   correct before launch.
8. **Publish-to-live hook URL is still empty.** `wp_option ded_publish_hook_url` is unset, so
   the button bounces to Settings → Publish to Live. David must paste the Cloudflare deploy
   hook there. **Never hardcode or commit that URL.**
9. **Auto-rebuild webhook** from WP publish (currently manual, or the admin button).
10. **Finish the type migration** for the components listed under Type above.

---

## Guardrails

- **Never touch davidedigerdesign.com** — it is live production until cutover.
- Never delete or overwrite WP demo pages, the front page, the theme, or the database.
- All front-end work goes in `site/`, never on the WP server.
- Confirm with David before anything irreversible.
