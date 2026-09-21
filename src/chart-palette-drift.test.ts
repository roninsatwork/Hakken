import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath, readRepoFile } from './test/driftUtils';

/**
 * A chart takes its colours from the shared palette, not from its own list.
 *
 * The palette exists for one reason beyond tidiness: the owner cannot tell red
 * from green, so the canonical order is arranged such that no two adjacent
 * series are a red/green pair. That property lives in one array. A screen that
 * writes its own list of hexes — or its own list of palette constants in its
 * own order — opts out of it silently.
 *
 * This rule is written because the fix without it did nothing. On 2026-08-26
 * the canonical order was rearranged to separate emerald from rose, and it
 * changed no chart on the platform: nothing imported the array, and the one pie
 * that mattered drew from a hand-written list that still opened emerald, rose.
 * Five files were migrated off private copies and a sixth was missed, which is
 * what happens when instances are fixed and the rule is not.
 *
 * The theme-drift guard cannot cover this. It reads Tailwind class strings, and
 * a chart colour is a prop — `fill={…}`, `stroke="#10b981"` — so a chart is
 * invisible to it by construction.
 */

/** Colours the palette owns. A file naming one of these should import it. */
const PALETTE_HEXES = (() => {
  const source = readRepoFile('src/ui/components/charts/chartPalette.ts');
  return new Set([...source.matchAll(/"(#[0-9a-fA-F]{3,8})"/g)].map((match) => match[1].toLowerCase()));
})();

/** Props a chart library takes a colour through. */
const COLOUR_PROP = /(?:fill|stroke|stopColor|backgroundColor|color)\s*=\s*(?:"(#[0-9a-fA-F]{3,8})"|\{\s*"(#[0-9a-fA-F]{3,8})"\s*\})/g;

const SCAN_ROOTS = ['src/app/(dashboard)', 'src/ui'];

/**
 * Files that name a palette colour in a chart prop and do not import it, with
 * why. May shrink, never grow.
 */
const OWN_COLOURS: ReadonlyMap<string, string> = new Map();

describe('charts paint from the shared palette', () => {
  const chartFiles = SCAN_ROOTS.flatMap((root) =>
    walkFiles(path.join(repoRoot, root), new Set(['.tsx']))
      .map((filePath) => relativePath(filePath).replaceAll(path.sep, '/'))
      .filter((file) => !/\.test\.tsx$/.test(file))
  );

  const offenders = chartFiles.flatMap((file) => {
    const contents = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    if (contents.includes('chartPalette')) return [];

    const named = [...contents.matchAll(COLOUR_PROP)]
      .map((match) => (match[1] ?? match[2]).toLowerCase())
      .filter((hex) => PALETTE_HEXES.has(hex));

    if (named.length === 0 || OWN_COLOURS.has(file)) return [];

    return [`${file}: paints ${[...new Set(named)].join(', ')} without importing the palette`];
  });

  test('the palette itself defines colours to check against', () => {
    // Without this the scan below passes identically whether the palette holds
    // forty colours or none — and a guard that finds nothing to compare is
    // indistinguishable from one that works.
    expect(PALETTE_HEXES.size, 'no colours were read out of chartPalette.ts at all').toBeGreaterThan(5);
    expect(chartFiles.length, 'no screen files were scanned at all').toBeGreaterThan(100);
  });

  test('no screen writes its own copy of a palette colour', () => {
    expect(
      offenders,
      `These name a colour the shared palette already owns, in a chart prop, without importing it — so they sit outside the ordering that keeps adjacent series apart for a reader who cannot distinguish red from green. Import from src/ui/components/charts/chartPalette.ts:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
