import { v, type Infer } from "convex/values";
import { shiftDay } from "./insightFacts";

/**
 * Sixteen months of Search Console and Google Analytics, month by month
 * (docs/plans/active/insights-intelligence-plan.md, "The history the research
 * reads"; Anthony, 2026-10-12: "can we make Search Console go back … it's
 * free to get", then "go back 16 months"). Google keeps sixteen months of
 * Search Console and answers again for free, so Hakken keeps only the small
 * lines the research reads — each page's and each source's figures a month,
 * and the website's a day — never every search by day
 * (keep-less-history-plan.md, the rule). The detail behind a month is asked
 * of Google when the research needs it.
 */

/** How far back: all Google keeps of Search Console, and the same of Analytics so the two line up. */
export const HISTORY_MONTHS = 16;

/** Rows a month keeps of a list, the most first; the rest are added up as one. */
export const MOST_ROWS = 1_500;

/** The key the rows past `MOST_ROWS` are added up under. */
export const OTHER_KEY = "(other)";

/** Months re-asked every run while Google may still be settling them: the newest two. */
const SETTLING_MONTHS = 2;

export const HISTORY_KINDS = ["SC_PAGES", "GA_PAGES", "GA_SOURCES", "GA_MONTHS", "DAYS"] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];
export const historyKindValidator = v.union(...HISTORY_KINDS.map((kind) => v.literal(kind)));

/**
 * One line of a kept list. Which figures it carries goes by its kind:
 * Search Console's pages clicks, times shown and the position summed by times
 * shown; Analytics' pages and sources visits and enquiries; the months people
 * too; a day both sources' figures side by side.
 */
export const historyRowValidator = v.object({
  key: v.string(),
  clicks: v.optional(v.number()),
  impressions: v.optional(v.number()),
  positionSum: v.optional(v.number()),
  visits: v.optional(v.number()),
  /** Visits from Google's own search: the day's to set against Search Console's clicks. */
  googleVisits: v.optional(v.number()),
  enquiries: v.optional(v.number()),
  people: v.optional(v.number()),
});
export type HistoryRow = Infer<typeof historyRowValidator>;

export type HistoryMonth = { month: string; from: string; to: string };

const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

function monthEnd(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

/** The month before or after another, by its `YYYY-MM`. */
export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
}

/** The oldest day Google still keeps: sixteen months before the newest whole day. */
export function oldestKept(newestDay: string): string {
  const newest = new Date(`${newestDay}T00:00:00Z`);
  return new Date(Date.UTC(newest.getUTCFullYear(), newest.getUTCMonth() - HISTORY_MONTHS, newest.getUTCDate())).toISOString().slice(0, 10);
}

/** Each month from sixteen months ago to the newest day's, oldest first, cut to the days Google keeps and has. */
export function historyMonths(newestDay: string): HistoryMonth[] {
  const oldest = oldestKept(newestDay);
  const months: HistoryMonth[] = [];
  for (let month = oldest.slice(0, 7); month <= newestDay.slice(0, 7); month = shiftMonth(month, 1)) {
    const start = `${month}-01`;
    const end = monthEnd(month);
    months.push({ month, from: start < oldest ? oldest : start, to: end > newestDay ? newestDay : end });
  }
  return months;
}

/**
 * The months a run asks Google for: those not held, those held short of their
 * days (a month still running, or one Google had not finished), and the
 * newest two always, while Google may still be settling them.
 */
export function monthsToFetch(months: readonly HistoryMonth[], held: ReadonlyMap<string, { from: string; to: string }>): HistoryMonth[] {
  const settling = new Set(months.slice(-SETTLING_MONTHS).map((month) => month.month));
  return months.filter((month) => {
    const kept = held.get(month.month);
    return !kept || settling.has(month.month) || kept.to < month.to || kept.from > month.from;
  });
}

/** A page as both sources name it: its path, the website's address taken off. */
export function pathOf(address: string): string {
  const match = /^https?:\/\/[^/]+(\/.*)?$/i.exec(address.trim());
  return match ? match[1] || "/" : address.trim();
}

/** The figure a list is ranked by, to keep the most. */
const weightOf = (row: HistoryRow) => row.impressions ?? row.visits ?? 0;

/** A month's list kept to `MOST_ROWS`, the most first; the rest added up as `OTHER_KEY` so the totals stay whole. */
export function keepMost(rows: readonly HistoryRow[], most = MOST_ROWS): HistoryRow[] {
  const sorted = [...rows].sort((a, b) => weightOf(b) - weightOf(a) || a.key.localeCompare(b.key));
  if (sorted.length <= most) return sorted;
  const kept = sorted.slice(0, most - 1);
  const other: HistoryRow = { key: OTHER_KEY };
  for (const row of sorted.slice(most - 1)) {
    for (const field of ["clicks", "impressions", "positionSum", "visits", "googleVisits", "enquiries"] as const) {
      const value = row[field];
      if (value !== undefined) other[field] = (other[field] ?? 0) + value;
    }
  }
  return [...kept, other];
}

/** Rows added up by key: Google may answer one page under two spellings, and a month is asked in parts. */
export function addUp(rows: readonly HistoryRow[]): HistoryRow[] {
  const byKey = new Map<string, HistoryRow>();
  for (const row of rows) {
    const held = byKey.get(row.key);
    if (!held) {
      byKey.set(row.key, { ...row });
      continue;
    }
    for (const field of ["clicks", "impressions", "positionSum", "visits", "googleVisits", "enquiries", "people"] as const) {
      const value = row[field];
      if (value !== undefined) held[field] = (held[field] ?? 0) + value;
    }
  }
  return [...byKey.values()];
}

/** Analytics' `YYYYMMDD` and `YYYYMM` as Hakken writes days and months. */
export const dayOfGoogle = (value: string) => (/^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value);
export const monthOfGoogle = (value: string) => (/^\d{6}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}` : value);

/** Whether a visit came from Google's own search, as Analytics names it. */
export const fromGoogleSearch = (channel: string, source: string) => channel === "Organic Search" && source.trim().toLowerCase() === "google";

/** A source's key as kept: Analytics' channel and its source, joined. */
export const SOURCE_JOIN = "\u001f";

// ---------------------------------------------------------------------------
// The counting check (Anthony, 2026-10-12): Analytics' visits from Google set
// against Search Console's clicks, day by day — Google counts its clicks
// itself, so a lasting change in how many of them Analytics sees is the
// website's counting changing, not its visitors.

/**
 * Days either side of a day the check compares: eight weeks, so a month's dip
 * that comes back (Ronins' June 2026) is not taken for a change — four weeks
 * did, on 16 months of its days.
 */
const CHECK_WINDOW = 56;
/** Clicks a side needs before the check says anything. */
const CHECK_LEAST_CLICKS = 200;
/** How far the share must move, either way, to be a change. */
const CHECK_LEAST_MOVE = 0.25;
/** The span the share is read over, now and a year before. */
const SHARE_DAYS = 90;

export type CountingChange = {
  /** The first day of the new level. */
  changedOn: string;
  /** Analytics' visits from Google for each of Google's clicks, the eight weeks before and from that day. */
  before: number;
  after: number;
  clicksBefore: number;
  clicksAfter: number;
};

/**
 * The day Analytics' share of Google's clicks changed most and stayed
 * changed: for each day, the share in the eight weeks before against the
 * eight from it, the biggest move of a quarter or more, with enough clicks
 * either side to trust. Null when the share held.
 */
export function countingChange(days: ReadonlyArray<{ key: string; clicks?: number; googleVisits?: number }>): CountingChange | null {
  const sorted = [...days].filter((day) => day.clicks !== undefined && day.googleVisits !== undefined).sort((a, b) => a.key.localeCompare(b.key));
  let best: CountingChange | null = null;
  let bestMove = 0;
  for (let at = CHECK_WINDOW; at + CHECK_WINDOW <= sorted.length; at += 1) {
    const before = sorted.slice(at - CHECK_WINDOW, at);
    const after = sorted.slice(at, at + CHECK_WINDOW);
    // Days missing between the two make a window longer than it says: only whole runs of days are compared.
    if (shiftDay(before[0].key, CHECK_WINDOW * 2 - 1) !== after[after.length - 1].key) continue;
    const clicksBefore = before.reduce((sum, day) => sum + (day.clicks ?? 0), 0);
    const clicksAfter = after.reduce((sum, day) => sum + (day.clicks ?? 0), 0);
    if (clicksBefore < CHECK_LEAST_CLICKS || clicksAfter < CHECK_LEAST_CLICKS) continue;
    const shareBefore = before.reduce((sum, day) => sum + (day.googleVisits ?? 0), 0) / clicksBefore;
    const shareAfter = after.reduce((sum, day) => sum + (day.googleVisits ?? 0), 0) / clicksAfter;
    if (shareBefore === 0) continue;
    const move = Math.abs(shareAfter - shareBefore) / shareBefore;
    if (move >= CHECK_LEAST_MOVE && move > bestMove) {
      bestMove = move;
      best = { changedOn: sorted[at].key, before: shareBefore, after: shareAfter, clicksBefore, clicksAfter };
    }
  }
  return best;
}

/** Analytics' visits from Google for each of Google's clicks between two days, with the clicks; null without enough. */
export function shareBetween(days: ReadonlyArray<{ key: string; clicks?: number; googleVisits?: number }>, from: string, to: string): { share: number; clicks: number } | null {
  let clicks = 0, visits = 0, held = 0;
  for (const day of days) {
    if (day.key < from || day.key > to || day.clicks === undefined || day.googleVisits === undefined) continue;
    clicks += day.clicks;
    visits += day.googleVisits;
    held += 1;
  }
  return clicks >= CHECK_LEAST_CLICKS && held >= SHARE_DAYS * 0.9 ? { share: visits / clicks, clicks } : null;
}

export type CountingCheck = {
  /** A sudden change, and the day it began; null when there was none. */
  step: CountingChange | null;
  /** The share over the last 90 days, and over the same 90 days a year before: a slow drift shows here. */
  now: { from: string; to: string; share: number; clicks: number } | null;
  yearAgo: { from: string; to: string; share: number; clicks: number } | null;
};

/** The counting check whole: a sudden step, and the share now against a year before. */
export function countingCheck(days: ReadonlyArray<{ key: string; clicks?: number; googleVisits?: number }>): CountingCheck {
  const keys = days.map((day) => day.key).sort();
  const newest = keys[keys.length - 1];
  if (!newest) return { step: null, now: null, yearAgo: null };
  const from = shiftDay(newest, 1 - SHARE_DAYS);
  const yearFrom = shiftDay(from, -364), yearTo = shiftDay(newest, -364);
  const now = shareBetween(days, from, newest);
  const yearAgo = shareBetween(days, yearFrom, yearTo);
  return {
    step: countingChange(days),
    now: now && { from, to: newest, ...now },
    yearAgo: yearAgo && { from: yearFrom, to: yearTo, ...yearAgo },
  };
}

/** The months a hold keeps: none older than sixteen months before its newest. */
export const firstMonthKept = (newestDay: string) => monthStart(oldestKept(newestDay)).slice(0, 7);
