#!/usr/bin/env node
/**
 * Regenerate src/data/projects.snapshot.json from live WordPress.
 *
 *   npm run snapshot
 *
 * RUN THIS WHENEVER PROJECTS CHANGE IN WP, and commit the result. The snapshot
 * is what the build falls back to when davidedigerdesign.in is unreachable, so
 * a stale snapshot means a stale site on the day WP happens to be down — which
 * is exactly the day nobody is in a position to notice.
 *
 * It uses the same fetch as the build (src/data/wp-projects.mjs), so the two
 * cannot drift apart.
 *
 * Fails loudly and writes nothing if WP is unreachable: overwriting a good
 * snapshot with a broken one would quietly destroy the fallback.
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchProjectsFromWp } from '../src/data/wp-projects.mjs';

// fileURLToPath, not URL.pathname — the project path contains spaces.
const OUT = fileURLToPath(new URL('../src/data/projects.snapshot.json', import.meta.url));

try {
  const { projects, media } = await fetchProjectsFromWp();

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    endpoint: 'https://davidedigerdesign.in/wp-json/wp/v2/ded_project',
    note: 'Committed build fallback. Regenerate with `npm run snapshot` when projects change in WP.',
    projects,
    media,
  };

  let previous = null;
  if (existsSync(OUT)) {
    try { previous = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* unreadable, treat as none */ }
  }

  writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  const slugs = projects.map((p) => p.slug);
  console.log(`snapshot: ${projects.length} projects, ${media.length} media items`);
  if (previous) {
    const before = new Set(previous.projects.map((p) => p.slug));
    const added = slugs.filter((s) => !before.has(s));
    const removed = [...before].filter((s) => !slugs.includes(s));
    console.log(`  previous: ${previous.projects.length} projects, dated ${previous.fetchedAt.slice(0, 10)}`);
    if (added.length) console.log(`  ADDED:   ${added.join(', ')}`);
    if (removed.length) console.log(`  REMOVED: ${removed.join(', ')}`);
    if (!added.length && !removed.length) console.log('  no projects added or removed (field edits may still differ)');
  }
  console.log(`  written: src/data/projects.snapshot.json — commit this file`);
} catch (e) {
  console.error(`\nsnapshot FAILED: ${e instanceof Error ? e.message : String(e)}`);
  console.error('  Nothing written — the existing snapshot is untouched.');
  console.error('  If WP is up, check the VPN: IPVanish does not route to davidedigerdesign.in.\n');
  process.exit(1);
}
