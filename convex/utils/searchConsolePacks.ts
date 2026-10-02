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

const SEPARATOR = "\u0001";
const rowKey = (row: Row) => (row.page === undefined ? row.key : `${row.key}${SEPARATOR}${row.page}`);

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

/** Days kept as days (plan §14.3: 90), weeks kept as weeks for a year past that. */
export const DAYS_KEPT = 90;
export const WEEKS_KEPT_DAYS = 365;

/** The first day still kept as a day, with `newest` the newest day held. */
export function firstDayKept(newest: string): string {
  return dayOf(time(newest) - (DAYS_KEPT - 1) * 86_400_000);
}

/** A week starting before this goes into its month. */
export function firstWeekKept(newest: string): string {
  return dayOf(time(newest) - WEEKS_KEPT_DAYS * 86_400_000);
}
