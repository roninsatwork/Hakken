import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { readRepoFile, relativePath, repoRoot, walkFiles } from './test/driftUtils';

/**
 * Google's updates are marked on every Sites chart that runs over dates, one
 * way, by one part (docs/plans/active/knowledge-news-and-digest-plan.md,
 * "Google updates on the Sites charts" — approved 2026-09-30: "ensure we
 * don't get drift as i love this look").
 *
 * The look test beside `GoogleUpdateMarkers` holds its numbers. This holds the
 * rest: that every dated chart part draws the markers, so a new page on one
 * gets them without doing anything; that no Sites page draws a chart of its
 * own around them; that no chart row is dated by its label alone, which would
 * leave its chart without markers; and that Google's colours, the dashed line
 * and the hover card are written in their one part and nowhere else.
 */

const COMPONENTS = 'src/app/(dashboard)/app/sites/_components';
const MARKERS = `${COMPONENTS}/GoogleUpdateMarkers.tsx`;
const MARK = `${COMPONENTS}/GoogleMark.tsx`;

/** The chart parts that run over dates, and the file each lives in. */
const DATED_CHART_PARTS: ReadonlyArray<[string, string]> = [
  [`${COMPONENTS}/SiteCharts.tsx`, 'SiteLineChart'],
  [`${COMPONENTS}/SiteCharts.tsx`, 'SiteStackedAreaChart'],
  [`${COMPONENTS}/SiteCharts.tsx`, 'SiteBarChart'],
  [`${COMPONENTS}/SiteGainLossChart.tsx`, 'SiteGainLossChart'],
];

/**
 * The Sites files allowed to draw with Recharts: the chart parts themselves,
 * and the markers. A page draws through these. The treemap and the scatter
 * chart carry no dates, so no markers.
 */
const DRAWS_WITH_RECHARTS = new Set([
  `${COMPONENTS}/SiteCharts.tsx`,
  `${COMPONENTS}/SiteGainLossChart.tsx`,
  `${COMPONENTS}/SiteTreemap.tsx`,
  MARKERS,
]);

// Keyword research's 24 months of searches are drawn on the same parts (keyword-research-plan.md, board 2).
const SITES_ROOTS = ['src/app/(dashboard)/app/sites', 'src/app/(dashboard)/app/search-console', 'src/app/(dashboard)/app/keyword-research'];

const GOOGLE_COLOURS = /#(?:4285f4|34a853|fbbc05|ea4335)\b/i;

const posix = (file: string) => file.split(path.sep).join('/');

const sourceFiles = (roots: string[], extensions = new Set(['.ts', '.tsx'])) =>
  roots
    .flatMap((root) => walkFiles(path.join(repoRoot, root), extensions))
    .map((file) => posix(relativePath(file)))
    .filter((file) => !/\.test\.tsx?$/.test(file));

/** A function's body, from `export function Name(` to the next top-level export. */
function functionBody(file: string, name: string): string {
  const source = readRepoFile(file);
  const start = source.indexOf(`export function ${name}(`);
  if (start === -1) return '';
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('Google updates on the Sites charts', () => {
  const sitesFiles = sourceFiles(SITES_ROOTS);

  test('the scan finds the Sites screens and the dated chart parts', () => {
    expect(sitesFiles.length, 'no Sites files were scanned at all').toBeGreaterThan(40);
    for (const [file, name] of DATED_CHART_PARTS) {
      expect(functionBody(file, name), `${name} was not found in ${file}`).not.toBe('');
    }
  });

  test('every dated chart part reads the updates and draws the markers', () => {
    const missing = DATED_CHART_PARTS.flatMap(([file, name]) => {
      const body = functionBody(file, name);
      return ['useGoogleUpdates(', '<GoogleUpdateFrame', '<GoogleUpdateMarkers']
        .filter((needle) => !body.includes(needle))
        .map((needle) => `${name} (${file}) no longer has ${needle}`);
    });
    expect(missing, 'A Sites chart that runs over dates marks the Google updates inside them, through GoogleUpdateMarkers:').toEqual([]);
  });

  test('no Sites page draws a chart with Recharts directly', () => {
    const offenders = sitesFiles.filter(
      (file) => !DRAWS_WITH_RECHARTS.has(file) && /from ["']recharts["']/.test(fs.readFileSync(path.join(repoRoot, file), 'utf8')),
    );
    expect(offenders, 'Draw through the Sites chart parts (SiteCharts.tsx, SiteGainLossChart.tsx), which mark the Google updates:').toEqual([]);
  });

  test('no chart row is dated by its label alone', () => {
    // A row labelled with a day but not carrying it reads as a chart of named
    // things, and gets no markers. `datedRow` carries both.
    const offenders = sitesFiles.flatMap((file) => {
      const lines = fs.readFileSync(path.join(repoRoot, file), 'utf8').split('\n');
      return lines.flatMap((line, index) => {
        if (!/\blabel: formatShortDay\(/.test(line)) return [];
        const before = lines.slice(Math.max(0, index - 3), index).join('\n');
        return /\bday: /.test(before) ? [] : [`${file}:${index + 1}`];
      });
    });
    expect(offenders, 'Build dated chart rows with datedRow (sites/_components/datedRows.ts):').toEqual([]);
  });

  test("Google's colours, the dashed line and the hover card live in their one part", () => {
    const everywhere = sourceFiles(['src']);
    const colours = everywhere.filter((file) => file !== MARK && GOOGLE_COLOURS.test(fs.readFileSync(path.join(repoRoot, file), 'utf8')));
    expect(colours, `Google's four colours are written once, in ${MARK}:`).toEqual([]);

    const parts = everywhere.filter(
      (file) => file !== MARKERS && /data-google-update-(?:line|logo|card)|GOOGLE_UPDATE_LOOK/.test(fs.readFileSync(path.join(repoRoot, file), 'utf8')),
    );
    expect(parts, `The markers' line, logo and card are drawn by ${MARKERS} alone:`).toEqual([]);
  });
});
