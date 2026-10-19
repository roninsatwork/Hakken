import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { readRepoFile, repoRoot } from './test/driftUtils';

/**
 * The rules every step of a website's Google Analytics and Search Console
 * collection keeps (docs/plans/active/collection-reliability-plan.md, RR5;
 * Anthony, 2026-10-15: "we need this reliable and scalable i cannot stress
 * this highly enough"). Each was broken somewhere before it was a rule, and a
 * run failed there:
 *
 * - **A step is booked with its watch** (RR1). A step started straight on the
 *   scheduler has no watch: when the platform stops it, nothing carries its
 *   run on and its closing never runs (kordatackle.com, 15 October).
 * - **Google's answers are added up as they arrive** (RR2). An Analytics ask
 *   held whole grew with the website until a step ran out of memory
 *   (kordatackle.com's 90-day mobile page lists, 15 October).
 * - **No collection table is read whole** (RR3). A read of everything a
 *   website has grows with the website until one call is too big (ronins.co.uk
 *   and morehandles.co.uk, 14 October: "too many system operations").
 */

const CONVEX = path.join(repoRoot, 'convex');

/** The backend's own code: every module, not its tests or generated files. */
const backendFiles = () => fs.readdirSync(CONVEX)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts'))
  .map((name) => `convex/${name}`);

/** A call's arguments, as written: from its opening bracket to the one that closes it. */
function callArguments(source: string, open: number): string {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    const char = source[at];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, at);
  }
  return source.slice(open + 1);
}

/** How many arguments a call passes: commas at its own depth, plus one. */
function argumentCount(args: string): number {
  if (args.trim() === '') return 0;
  let depth = 0;
  let count = 1;
  for (const char of args) {
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) count += 1;
  }
  // A trailing comma is not another argument.
  return args.trimEnd().endsWith(',') ? count - 1 : count;
}

const lineOf = (source: string, at: number) => source.slice(0, at).split('\n').length;

describe('a step is booked with its watch (RR1)', () => {
  /** The collection's steps, each run by its chain (`collectionSteps.ts`, `stepFunction`). */
  const STEPS = /internal\.(googleAnalyticsSteps\.\w+|searchConsoleSteps\.\w+|searchConsoleSettle\.settlePart)\b/g;

  test('only the watch books a collection step: every other module hands on through it', () => {
    const offenders: string[] = [];
    for (const file of backendFiles()) {
      if (file === 'convex/collectionSteps.ts') continue;
      const source = readRepoFile(file);
      for (const match of source.matchAll(STEPS)) offenders.push(`${file}:${lineOf(source, match.index ?? 0)} ${match[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  test('the watch books every kind of step there is', () => {
    const watch = readRepoFile('convex/collectionSteps.ts');
    for (const file of ['convex/googleAnalyticsSteps.ts', 'convex/searchConsoleSteps.ts']) {
      for (const match of readRepoFile(file).matchAll(/export const (\w+) = internalAction/g)) {
        const name = `internal.${path.basename(file, '.ts')}.${match[1]}`;
        expect(watch, `${name} is a step the watch does not book`).toContain(name);
      }
    }
  });
});

describe("Google's answers are added up as they arrive (RR2)", () => {
  /**
   * Analytics asks read whole, each for a reason that does not grow with the
   * website: every address's visits for the strangers check (fifty kept).
   * What counts, read on connecting, adds its answers up as they arrive since
   * it reads them by address (conversion-addresses-plan.md). May shrink, never
   * grow: a new ask passes its sink.
   */
  const WHOLE_ASKS = new Map([
    ['convex/googleAnalyticsApi.ts', 1],
  ]);

  test('every Google Analytics ask in a collection passes the sink its rows are added up in', () => {
    const whole = new Map<string, number>();
    for (const file of backendFiles()) {
      const source = readRepoFile(file);
      for (const match of source.matchAll(/\brunReport\(/g)) {
        const at = match.index ?? 0;
        // Its own definition, and mentions in comments.
        if (/function\s+$/.test(source.slice(Math.max(0, at - 20), at)) || /^\s*\*/.test(source.slice(source.lastIndexOf('\n', at) + 1, at))) continue;
        if (argumentCount(callArguments(source, at + 'runReport'.length)) >= 4) continue;
        whole.set(file, (whole.get(file) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(whole)).toEqual(Object.fromEntries(WHOLE_ASKS));
  });

  test("a Search Console ask holds no more than Google gives at once: 50,000 rows a day", () => {
    const api = readRepoFile('convex/searchConsoleApi.ts');
    expect(api).toMatch(/const MOST_ROWS = 50_000;/);
    expect(api).toMatch(/for \(let startRow = 0; startRow < MOST_ROWS; startRow \+= GOOGLE_PAGE_ROWS\)/);
  });
});

describe('no collection table is read whole (RR3)', () => {
  /** Where the collectors' tables are defined: each table there grows with a website, its days or its pages. */
  const SCHEMAS = [
    'convex/googleAnalyticsSchema.ts',
    'convex/searchConsoleSchema.ts',
    'convex/bingWebmasterSchema.ts',
    'convex/collectionStepsSchema.ts',
    'convex/pagesSchema.ts',
  ];
  const tables = () => SCHEMAS.flatMap((file) => [...readRepoFile(file).matchAll(/^ {2,4}(\w+): defineTable\(/gm)].map((match) => match[1]));

  test('the tables are found', () => {
    expect(tables()).toEqual(expect.arrayContaining(['googleAnalyticsDays', 'googleAnalyticsPeriods', 'searchConsoleLists', 'searchConsolePeriods', 'holdPages', 'collectionSteps', 'bingPeriods']));
  });

  test('every read of one takes a fixed number of records — .take, .first, .unique or .paginate — never .collect()', () => {
    const names = new Set(tables());
    const offenders: string[] = [];
    for (const file of backendFiles()) {
      const source = readRepoFile(file);
      for (const match of source.matchAll(/\.query\("(\w+)"\)/g)) {
        if (!names.has(match[1])) continue;
        const rest = source.slice(match.index ?? 0, (match.index ?? 0) + 2_000);
        const ends = /\.(collect|take|first|unique|paginate)\(/.exec(rest);
        if (!ends || ends[1] === 'collect') offenders.push(`${file}:${lineOf(source, match.index ?? 0)} ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
