#!/usr/bin/env node
/**
 * Build-time guard for the Cloudflare Pages redirect map.
 *
 * Runs as `postbuild`, so `npm run build` — the command Cloudflare Pages runs —
 * fails the deploy rather than shipping a broken map. It validates dist/_redirects
 * (the copy that actually deploys) against dist/ (the pages that actually exist).
 *
 * Two classes of defect, both of which shipped to production before this existed:
 *
 *   SHADOWED SOURCE. On Cloudflare Pages a redirect wins over a static asset at
 *   the same path, so a rule whose source matches a built page makes that page
 *   unreachable. `/work/  /#work  301` was written for the OLD site's work
 *   landing page and also matched the new /work/ index, which built on every
 *   deploy and 301'd away from for weeks with nothing to flag it.
 *
 *   MISSING TARGET. `/el-salvador-photo-gallery/` pointed at a project page that
 *   was later unpublished from WordPress, so the redirect led to a 404. Targets
 *   drift out from under the map whenever CMS content changes, which is exactly
 *   the kind of rot a human reviewer will not catch.
 *
 * Fragment targets (/#contact) are checked too: the path must exist AND the page
 * must really carry that id. A rule pointing at /#testimonials when no element
 * has id="testimonials" silently dumps the visitor at the top of the homepage.
 *
 * Exit 0 = clean, exit 1 = at least one error. External (http://…) targets are
 * skipped; we cannot verify someone else's server at build time.
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, never URL.pathname — the project path contains spaces, which
// pathname leaves percent-encoded and every fs call then fails on.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const MAP = join(DIST, '_redirects');

const exists = async (p) => access(p).then(() => true, () => false);

/** Every .html file in dist/, as a list of paths relative to dist/. */
async function htmlFiles(dir = DIST) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(relative(DIST, full));
  }
  return out;
}

/**
 * The route a built HTML file answers on.
 * index.html → /   ·   work/index.html → /work/   ·   404.html → /404.html
 */
const routeOf = (rel) => {
  const p = rel.split('\\').join('/');
  if (p === 'index.html') return '/';
  if (p.endsWith('/index.html')) return `/${p.slice(0, -'index.html'.length)}`;
  return `/${p}`;
};

/**
 * Resolve a site path to a file in dist/, trying the same candidates Cloudflare
 * Pages does. Returns the file path, or null when nothing answers there.
 */
async function resolve(path) {
  const bare = path.replace(/^\//, '');
  const candidates = path.endsWith('/')
    ? [join(DIST, bare, 'index.html')]
    : [join(DIST, bare), join(DIST, `${bare}.html`), join(DIST, bare, 'index.html')];
  for (const c of candidates) if (await exists(c)) return c;
  return null;
}

/** Parse `source target [status]`, skipping blanks and # comments. */
function parse(text) {
  return text
    .split('\n')
    .map((raw, i) => ({ raw, line: i + 1 }))
    .filter(({ raw }) => raw.trim() && !raw.trim().startsWith('#'))
    .map(({ raw, line }) => {
      const [source, target, status] = raw.trim().split(/\s+/);
      return { source, target, status, line };
    });
}

async function main() {
  if (!(await exists(MAP))) {
    console.log('check-redirects: no dist/_redirects, nothing to check.');
    return 0;
  }

  const rules = parse(await readFile(MAP, 'utf8'));
  const routes = (await htmlFiles()).map(routeOf);
  const errors = [];

  for (const { source, target, line } of rules) {
    const at = `_redirects:${line}  ${source} → ${target}`;

    if (!target) {
      errors.push(`${at}\n    Malformed rule: no target.`);
      continue;
    }

    // ── Source must not shadow a page this site builds ──────────────
    if (source.endsWith('*')) {
      const prefix = source.slice(0, -1);
      const hit = routes.filter((r) => r.startsWith(prefix) && r !== prefix);
      if (hit.length) {
        errors.push(
          `${at}\n    Splat shadows ${hit.length} built page(s), which become unreachable:\n` +
            hit.slice(0, 5).map((r) => `      ${r}`).join('\n') +
            (hit.length > 5 ? `\n      …and ${hit.length - 5} more` : '')
        );
      }
    } else if (routes.includes(source)) {
      errors.push(
        `${at}\n    Source is a page this site builds. On Cloudflare Pages the\n` +
          `    redirect wins over the static asset, so ${source} becomes unreachable.\n` +
          `    Delete the rule — the built page already answers on that path.`
      );
    }

    // ── Target must exist ───────────────────────────────────────────
    if (/^https?:\/\//.test(target)) continue; // external, unverifiable here
    if (target.includes(':')) continue; // placeholder capture, e.g. /work/:slug

    const [path, fragment] = target.split('#');
    const file = await resolve(path || '/');

    if (!file) {
      errors.push(`${at}\n    Target does not exist in dist/. Nothing is built at ${path || '/'}.`);
      continue;
    }

    if (fragment) {
      const html = await readFile(file, 'utf8');
      if (!new RegExp(`id=["']?${fragment}["'\\s>]`).test(html)) {
        errors.push(
          `${at}\n    ${path || '/'} exists but has no element with id="${fragment}".\n` +
            `    The visitor would land at the top of the page instead of the section.`
        );
      }
    }
  }

  if (errors.length) {
    console.error(`\ncheck-redirects: ${errors.length} problem(s) in dist/_redirects\n`);
    for (const e of errors) console.error(`  ✗ ${e}\n`);
    return 1;
  }

  console.log(`check-redirects: ${rules.length} rules OK against ${routes.length} built pages.`);
  return 0;
}

process.exit(await main());
