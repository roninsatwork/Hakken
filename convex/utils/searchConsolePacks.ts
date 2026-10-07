/**
 * Search Console's kept lists, packed (docs/plans/active/search-console-plan.md
 * §14.3): one record for a whole day, week or month of a list instead of one
 * record per row, as parallel arrays — row `i` across them all — split into
 * parts of 2,000 rows. Pure: no database here, so packing, merging and adding
 * up are tested on their own.
 *
 * Position is kept as a sum weighted by impressions (`position ×
 * impressions`): an average over any days, weeks or months is then exactly
 * Google's, which a plain average of averages is not.
 */

import { compareValues } from "convex/values";

/** Rows in one part of a kept list: a Convex record holds 1MB at most, and an array 8,192 items. */
export const PART_ROWS = 2_000;

export type Packed = {
  keys: string[];
  /** A pair's page, row for row with its search. Only on pairs. */
  pages?: string[];
  clicks: number[];
  impressions: number[];
  positionSums: number[];
};

export type Row = { key: string; page?: string; clicks: number; impressions: number; positionSum: number };

/** One of Google's rows, as `queryAnalytics` gives it. */
export type GoogleRow = { keys: string[]; clicks: number; impressions: number; position: number };

/** Google's rows as rows: a pair's search and page from its two keys. */
export function fromGoogle(rows: readonly GoogleRow[], pairs: boolean): Row[] {
  return rows.map((row) => ({
    key: row.keys[0] ?? "",
    ...(pairs ? { page: row.keys[1] ?? "" } : {}),
    clicks: row.clicks,
    impressions: row.impressions,
    positionSum: row.position * row.impressions,
  }));
}

export function* rowsOf(packed: Packed): Generator<Row> {
  for (let index = 0; index < packed.keys.length; index += 1) {
    yield {
      key: packed.keys[index],
      ...(packed.pages ? { page: packed.pages[index] } : {}),
      clicks: packed.clicks[index] ?? 0,
      impressions: packed.impressions[index] ?? 0,
      positionSum: packed.positionSums[index] ?? 0,
    };
  }
}

/** Rows packed into parts of `PART_ROWS`, most clicks first, so the first part is the one most read. */
export function pack(rows: readonly Row[], pairs: boolean): Packed[] {
  const sorted = [...rows].sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions
    || left.key.localeCompare(right.key) || (left.page ?? "").localeCompare(right.page ?? ""));
  const parts: Packed[] = [];
  for (let start = 0; start < sorted.length || parts.length === 0; start += PART_ROWS) {
    const slice = sorted.slice(start, start + PART_ROWS);
    parts.push({
      keys: slice.map((row) => row.key),
      ...(pairs ? { pages: slice.map((row) => row.page ?? "") } : {}),
      clicks: slice.map((row) => row.clicks),
      impressions: slice.map((row) => row.impressions),
      positionSums: slice.map((row) => row.positionSum),
    });
    if (sorted.length === 0) break;
  }
  return parts;
}

/**
 * Pairs packed in key order — by keyword, or by page — each part with the
 * first key it holds, so one keyword's or one page's rows are found by index
 * (`readKeyed`): the parts starting with that key, and the one just before.
 * Ordered as Convex orders an index (`compareValues`), most clicks first
 * within a key.
 */
export function packByKey(rows: readonly Row[], side: "query" | "page"): Array<Packed & { pages: string[]; firstKey: string }> {
  const keyOf = (row: Row) => (side === "query" ? row.key : (row.page ?? ""));
  const otherOf = (row: Row) => (side === "query" ? (row.page ?? "") : row.key);
  const sorted = [...rows].sort((left, right) => compareValues(keyOf(left), keyOf(right))
    || right.clicks - left.clicks || right.impressions - left.impressions || compareValues(otherOf(left), otherOf(right)));
  const parts: Array<Packed & { pages: string[]; firstKey: string }> = [];
  for (let start = 0; start < sorted.length; start += PART_ROWS) {
    const slice = sorted.slice(start, start + PART_ROWS);
    parts.push({
      keys: slice.map((row) => row.key),
      pages: slice.map((row) => row.page ?? ""),
      clicks: slice.map((row) => row.clicks),
      impressions: slice.map((row) => row.impressions),
      positionSums: slice.map((row) => row.positionSum),
      firstKey: keyOf(slice[0]),
    });
  }
  return parts;
}

const SEPARATOR = "\u0001";
const rowKey = (row: Row) => (row.page === undefined ? row.key : `${row.key}${SEPARATOR}${row.page}`);

/** Rows of several lists added up by their key (a pair by its search and page together): Google's answers for pieces of a period. */
export function addUpRows(lists: Iterable<readonly Row[]>): Row[] {
  const sums = new Map<string, Row>();
  for (const list of lists) {
    for (const row of list) {
      const key = rowKey(row);
      const held = sums.get(key);
      if (held) {
        held.clicks += row.clicks;
        held.impressions += row.impressions;
        held.positionSum += row.positionSum;
      } else {
        sums.set(key, { ...row });
      }
    }
  }
  return [...sums.values()];
}

/** Every row of every list added up by its key (a pair by its search and page together). */
export function addUp(lists: Iterable<Packed>): Row[] {
  const sums = new Map<string, Row>();
  for (const list of lists) {
    for (const row of rowsOf(list)) {
      const key = rowKey(row);
      const held = sums.get(key);
      if (held) {
        held.clicks += row.clicks;
        held.impressions += row.impressions;
        held.positionSum += row.positionSum;
      } else {
        sums.set(key, { ...row });
      }
    }
  }
  return [...sums.values()];
}

/** Google's average position from a weighted sum; null with no impressions. */
export function positionOf(row: { impressions: number; positionSum: number }): number | null {
  return row.impressions > 0 ? row.positionSum / row.impressions : null;
}

export type Summed = { key: string; clicks: number; impressions: number; positionSum: number; count: number; top: string };

/**
 * Each search's totals added up from its pairs, with how many pages it
 * brought people to and the one with the most clicks; or, by the page side,
 * each page's searches and its top search.
 */
export function bySide(pairs: readonly Row[], side: "query" | "page"): Map<string, Summed> {
  const out = new Map<string, Summed & { topClicks: number; topImpressions: number }>();
  for (const pair of pairs) {
    const key = side === "query" ? pair.key : pair.page ?? "";
    const other = side === "query" ? pair.page ?? "" : pair.key;
    const held = out.get(key);
    if (!held) {
      out.set(key, { key, clicks: pair.clicks, impressions: pair.impressions, positionSum: pair.positionSum, count: 1, top: other, topClicks: pair.clicks, topImpressions: pair.impressions });
      continue;
    }
    held.clicks += pair.clicks;
    held.impressions += pair.impressions;
    held.positionSum += pair.positionSum;
    held.count += 1;
    if (pair.clicks > held.topClicks || (pair.clicks === held.topClicks && pair.impressions > held.topImpressions)) {
      held.top = other;
      held.topClicks = pair.clicks;
      held.topImpressions = pair.impressions;
    }
  }
  return new Map([...out].map(([key, { topClicks: _clicks, topImpressions: _impressions, ...summed }]) => [key, summed]));
}

// ── Days, weeks and months ─────────────────────────────────────────────────

const time = (day: string) => Date.parse(`${day}T00:00:00Z`);
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Monday a day's week starts on (Google's days, so plain calendar arithmetic). */
export function weekStart(day: string): string {
  const at = time(day);
  const weekday = (new Date(at).getUTCDay() + 6) % 7;
  return dayOf(at - weekday * 86_400_000);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** What each point or bar of a chart is: the page's step (2026-10-04, charts in the dates and step chosen). */
export type ChartStep = "day" | "week" | "month";

/** The first day of the day, week or month a day falls in. */
export function stepStart(day: string, step: ChartStep): string {
  if (step === "day") return day;
  return step === "week" ? weekStart(day) : monthStart(day);
}

/** The last day of the day, week or month starting on `start`. */
export function stepEnd(start: string, step: ChartStep): string {
  if (step === "day") return start;
  if (step === "week") return dayOf(time(start) + 6 * 86_400_000);
  return dayOf(time(monthStart(dayOf(time(start) + 31 * 86_400_000))) - 86_400_000);
}

/**
 * Days kept, every kind of result's: 60 (keep-less-history-plan.md, part 3;
 * 90 and rolled into weeks and months until 2026-10-07) — the 7 and 30 days
 * and the 30 days before them. The 90 days and twelve months are asked of
 * Google (`searchConsoleLongLists.ts`); nothing is rolled up.
 */
export const DAYS_KEPT = 60;

/**
 * How far back a chart's weeks are shown as weeks: before it, by month. The
 * weeks worked out from days before 2026-10-07 reached six months; those
 * kept since, the charts' whole reach.
 */
export const WEEKS_KEPT_DAYS = 183;

/** The first day still kept as a day, with `newest` the newest day held. */
export function firstDayKept(newest: string): string {
  return dayOf(time(newest) - (DAYS_KEPT - 1) * 86_400_000);
}

/**
 * The first day still kept as a day for a kind of result: every kind's, since
 * nothing is rolled up (image search's went into their weeks once the week was
 * over until 2026-10-07, finish-off plan item 2C).
 */
export function firstDayKeptFor(_searchType: string, newest: string): string {
  return firstDayKept(newest);
}

/** A chart's week starting before this is shown in its month. */
export function firstWeekKept(newest: string): string {
  return dayOf(time(newest) - WEEKS_KEPT_DAYS * 86_400_000);
}
