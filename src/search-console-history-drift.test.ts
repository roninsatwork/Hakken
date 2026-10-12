import path from 'path';
import { describe, expect, test } from 'vitest';
import { readRepoFile, relativePath, repoRoot, walkFiles } from './test/driftUtils';

/**
 * Search Console's screens reach back to Google's sixteen-month line, not to
 * the day Hakken's collection began (insights-intelligence-plan.md, phase 9:
 * "a check that fails a screen cut at the first collection").
 *
 * The website's day totals are fetched back to Google's line once
 * (`daysFrom`), its long lists are asked of Google, and the date picker stops
 * at the line (`historyFrom`). `oldestDay` stays where collection began — what
 * New and lost and Volatility count from — so a screen starting its days
 * there is cut at the first collection. Only the connection page, which says
 * both, reads it.
 */

const SCREENS = 'src/app/(dashboard)/app/search-console';

/** The one screen allowed to name where collection began: it says both days. */
const NAMES_COLLECTION_START = new Set([`${SCREENS}/[siteId]/connection/page.tsx`]);

const posix = (file: string) => file.split(path.sep).join('/');

const screenFiles = () =>
  walkFiles(path.join(repoRoot, SCREENS), new Set(['.ts', '.tsx']))
    .map((file) => posix(relativePath(file)))
    .filter((file) => !/\.test\.tsx?$/.test(file));

describe('Search Console screens reach back sixteen months', () => {
  test('no screen starts its days where collection began', () => {
    const cut = screenFiles().filter((file) => !NAMES_COLLECTION_START.has(file) && /\boldestDay\b/.test(readRepoFile(file)));
    expect(cut).toEqual([]);
  });

  test('the date picker stops at Google\'s line', () => {
    expect(readRepoFile(`${SCREENS}/[siteId]/layout.tsx`)).toMatch(/<SiteDateRange[^>]*\boldest=\{status\.historyFrom\}/);
  });

  test('the backend reads the days from where they begin, not where collection began', () => {
    // The Performance read, and Google updates' read of the days around each update.
    for (const file of ['convex/searchConsoleReads.ts', 'convex/searchConsoleChanges.ts']) {
      expect(readRepoFile(file), file).toMatch(/\bdaysFrom\b/);
    }
    // The long periods are asked of Google back to its line.
    expect(readRepoFile('convex/searchConsolePeriods.ts')).toMatch(/slotsOf\([^)]*historyLimitDay\(/);
  });
});
