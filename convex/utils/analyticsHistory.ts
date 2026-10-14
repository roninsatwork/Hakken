import { monthStart, weekStart } from "./searchConsolePacks";

/**
 * How Google Analytics' channels are kept over time (docs/plans/active/
 * ga-stored-figures-plan.md SF2, SF2b; Anthony, 2026-10-14: "90 days same as
 * other sections, then weekly then monthly"): a day for 90 days, a week to
 * 12 months, a month to two years, nothing older — the shape keyword
 * positions are kept in (keep-less-history-plan.md, Decision 1). A week or a
 * month holds the sum of its days; a week rolled into its month counts in the
 * month it starts in. Plain code, no Convex, so the collection, the screens'
 * reads and the tests share one rule.
 */

/** Days kept as days, the newest included. */
export const ANALYTICS_DAYS_KEPT = 90;
/** Days back to which the past is kept by week: a year. */
export const WEEKS_REACH_DAYS = 365;
/** Days back to which anything is kept: two years. */
export const HISTORY_REACH_DAYS = 730;

export type Grain = "day" | "week" | "month";

const DAY_MS = 86_400_000;
const time = (day: string) => Date.parse(`${day}T00:00:00Z`);
const shift = (day: string, days: number) => new Date(time(day) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Where each grain begins, with `newest` the newest day held: the first day
 * kept as a day, the first week kept as a week (a Monday), the first month
 * kept at all.
 */
export function historyFloors(newest: string): { day: string; week: string; month: string } {
  return {
    day: shift(newest, -(ANALYTICS_DAYS_KEPT - 1)),
    week: weekStart(shift(newest, -(WEEKS_REACH_DAYS - 1))),
    month: monthStart(shift(newest, -(HISTORY_REACH_DAYS - 1))),
  };
}

/** The record a day's figures live in: the day itself, its week, its month — or none, past two years. */
export function homeOf(day: string, newest: string): { grain: Grain; start: string } | null {
  const floors = historyFloors(newest);
  if (day >= floors.day) return { grain: "day", start: day };
  if (day >= floors.week) return { grain: "week", start: weekStart(day) };
  if (day >= floors.month) return { grain: "month", start: monthStart(day) };
  return null;
}

/** The month a week rolls into: the one it starts in. */
export function monthOfWeek(start: string): string {
  return monthStart(start);
}

/** The last day of a week or month starting on `start`. */
export function grainEnd(grain: Grain, start: string): string {
  if (grain === "day") return start;
  if (grain === "week") return shift(start, 6);
  return shift(monthStart(shift(start, 31)), -1);
}

/**
 * The points a chart over `from` to `to` draws, each at the finest grain kept
 * for its date (SF2b): days where days are kept, then weeks, then months. A
 * point's `end` is cut where the next grain begins, so no day is drawn twice;
 * a week or month only partly inside the dates is drawn when most of it is.
 */
export function pointsBetween(from: string, to: string, newest: string): Array<{ grain: Grain; start: string; end: string }> {
  const floors = historyFloors(newest);
  const out: Array<{ grain: Grain; start: string; end: string }> = [];
  const seen = new Set<string>();
  for (let day = from; day <= to; day = shift(day, 1)) {
    const home = homeOf(day, newest);
    if (!home) continue;
    const key = `${home.grain}|${home.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const next = home.grain === "week" ? floors.day : home.grain === "month" ? floors.week : null;
    const whole = grainEnd(home.grain, home.start);
    const end = next !== null && whole >= next ? shift(next, -1) : whole;
    // A coarse point mostly before the dates is the span before's, not these dates'.
    if (home.start < from && time(end) - time(from) < time(from) - time(home.start)) continue;
    out.push({ grain: home.grain, start: home.start, end });
  }
  return out;
}

/** The days a point stands for: a day's 1, a week's 7 or fewer where it is cut. */
export function daysIn(point: { start: string; end: string }): number {
  return Math.round((time(point.end) - time(point.start)) / DAY_MS) + 1;
}

/**
 * A day, week or month record's device for a home country (ga-stored-figures-plan.md
 * SF7): the device alone for the main home country (`mobile`, or empty for
 * every device), and `mobile|fra` for another, so each country's records sit
 * beside the main one's and roll up the same way.
 */
export function dayDevice(device: string, country = ""): string {
  return country ? `${device}|${country}` : device;
}

/** The home country a record's device names: empty for the main one. */
export function countryOfDayDevice(key: string): string {
  const at = key.indexOf("|");
  return at < 0 ? "" : key.slice(at + 1);
}
