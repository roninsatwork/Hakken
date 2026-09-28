/**
 * Search Console's days (docs/plans/active/search-console-plan.md §4).
 *
 * Google's days are Pacific time, and its figures for a day settle over two
 * to three days; it keeps sixteen months. Days here are `YYYY-MM-DD`, as
 * Google writes them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Google keeps sixteen months. */
const HISTORY_MONTHS = 16;

export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The newest day asked for: the last whole day in California. Reckoned at
 * UTC−8 all year: in summer that is an hour behind, which only delays a day's
 * first fetch by that hour.
 */
export function newestWholeDay(now: number): string {
  return shiftDay(new Date(now - 8 * 60 * 60 * 1000).toISOString().slice(0, 10), -1);
}

/** The oldest day Google still keeps: sixteen months before the newest whole day. */
export function historyLimitDay(now: number): string {
  const newest = new Date(`${newestWholeDay(now)}T00:00:00Z`);
  const limit = new Date(Date.UTC(newest.getUTCFullYear(), newest.getUTCMonth() - HISTORY_MONTHS, newest.getUTCDate()));
  return limit.toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, newest first. */
export function daysNewestFirst(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = to; day >= from; day = shiftDay(day, -1)) days.push(day);
  return days;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A day as the screens send it: `YYYY-MM-DD`, and a real one. */
export function isDay(value: string): boolean {
  return DAY_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Days from one to the other, counting both. */
export function daysIn(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** The same number of days just before a range: what its change is measured against. */
export function periodBefore(from: string, to: string): { from: string; to: string } {
  return { from: shiftDay(from, -daysIn(from, to)), to: shiftDay(from, -1) };
}

/** Clicks, impressions, click-through rate and position, as figures. */
export type Figures = { clicks: number; impressions: number; ctr: number; position: number };

/**
 * Days' figures added up: clicks and impressions summed, the click-through
 * rate worked out from them, and the position averaged over every time the
 * site was shown — each day's weighted by its impressions, as Google averages
 * it. Null when nothing was shown.
 */
export function addUp(rows: ReadonlyArray<{ clicks: number; impressions: number; position: number }>): Figures | null {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weighted += row.position * row.impressions;
  }
  if (impressions === 0) return null;
  return { clicks, impressions, ctr: clicks / impressions, position: weighted / impressions };
}
