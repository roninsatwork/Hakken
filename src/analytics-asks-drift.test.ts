import path from 'path';
import { describe, expect, test } from 'vitest';
import { readRepoFile, relativePath, repoRoot, walkFiles } from './test/driftUtils';

/**
 * A Google Analytics screen never asks Google (docs/plans/active/ga-stored-figures-plan.md
 * SF1; Anthony, 2026-10-14: "calling Google won't scale because of rate
 * limits"). Every figure a screen draws is read from what each collection
 * stores; the only asks left are Live, Google's realtime figures, and an
 * event's funnel, kept a week (SF8), and custom dates' lists, which no run
 * prepares: asked once a day when a screen first asks for them, within the
 * website's allowance (sees-header-and-rolling-dates-plan.md, part two, rule
 * 4; Anthony, 2026-10-29: "i want custom dates"). A screen that starts asking
 * again — a new action called from a screen, another public action beside
 * these, a read that falls back to a list asked live — fails here.
 */

const SCREENS = path.join(repoRoot, 'src/app/(dashboard)/app/analytics');
const EXTENSIONS = new Set(['.ts', '.tsx']);

/** The actions a Google Analytics screen may call: Live's realtime figures, an event's funnel, and custom dates' lists (the layout, once a day). */
const ALLOWED_ACTIONS = new Set(['googleAnalyticsRealtime.askGoogleAnalyticsRealtime', 'googleAnalyticsLive.askEventFunnel', 'googleAnalyticsLive.prepareAnalyticsCustom']);

/**
 * Where a read may take a list kept with the live ones: the event funnel's, the module that reads it, and Conversions'
 * "What people did before converting", which reads each action's funnel the night's run kept (ga-conversions-visitors-plan.md CV4).
 */
const LIVE_READERS = new Set(['convex/googleAnalyticsEventReads.ts', 'convex/googleAnalyticsRows.ts', 'convex/googleAnalyticsConversionReads.ts']);

const screenFiles = () => walkFiles(SCREENS, EXTENSIONS).filter((file) => !/\.test\.tsx?$/.test(file));

describe('no Google Analytics screen asks Google (SF1)', () => {
  test('a screen calls no action but Live and the event funnel', () => {
    const called = screenFiles().flatMap((file) => {
      const text = readRepoFile(relativePath(file));
      return [...text.matchAll(/useAction\(\s*api\.(\w+)\.(\w+)/g)].map((match) => ({ file: relativePath(file), action: `${match[1]}.${match[2]}` }));
    });
    expect(called.length).toBeGreaterThan(0);
    expect(called.filter((call) => !ALLOWED_ACTIONS.has(call.action))).toEqual([]);
  });

  test('the live module answers for the event funnel and custom dates alone', () => {
    const text = readRepoFile('convex/googleAnalyticsLive.ts');
    const actions = [...text.matchAll(/export const (\w+)\s*=\s*tenantAction\(/g)].map((match) => match[1]);
    expect(actions).toEqual(['askEventFunnel', 'prepareAnalyticsCustom']);
    // Only the layout asks for them, so a page cannot ask twice.
    const askers = screenFiles().filter((file) => readRepoFile(relativePath(file)).includes('prepareAnalyticsCustom')).map((file) => relativePath(file));
    expect(askers).toEqual(['src/app/(dashboard)/app/analytics/[siteId]/layout.tsx']);
  });

  test('no read falls back to a list asked live, but the event funnel', () => {
    const readers = walkFiles(path.join(repoRoot, 'convex'), EXTENSIONS)
      .filter((file) => /googleAnalytics\w*\.ts$/.test(file) && !file.endsWith('.test.ts'))
      .map((file) => relativePath(file))
      .filter((file) => readRepoFile(file).includes('readLive('));
    expect(readers.filter((file) => !LIVE_READERS.has(file))).toEqual([]);
    const eventReads = readRepoFile('convex/googleAnalyticsEventReads.ts');
    expect([...eventReads.matchAll(/readLive\(([^)]*)\)/g)].map((match) => match[1].includes('funnelAsk('))).toEqual([true]);
    // Conversions reads only funnels, and only those the night's run keeps: 12 months, every device.
    const conversionReads = readRepoFile('convex/googleAnalyticsConversionReads.ts');
    expect([...conversionReads.matchAll(/readLive\(([^)]*)\)/g)].map((match) => match[1].includes('funnelAsk(') && match[1].includes('"365"'))).toEqual([true]);
  });
});
