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

import { appError } from "./appError";

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

/** A part as stored: its number columns packed as text (`packNumbers`), or lists. */
export type StoredPacked = Omit<Packed, "clicks" | "impressions" | "positionSums"> & {
  clicks: StoredNumbers;
  impressions: StoredNumbers;
  positionSums: StoredNumbers;
};

export function* rowsOf(packed: Packed | StoredPacked): Generator<Row> {
  const clicks = unpackNumbers(packed.clicks);
  const impressions = unpackNumbers(packed.impressions);
  const positionSums = unpackNumbers(packed.positionSums);
  for (let index = 0; index < packed.keys.length; index += 1) {
    yield {
      key: packed.keys[index],
      ...(packed.pages ? { page: packed.pages[index] } : {}),
      clicks: clicks[index] ?? 0,
      impressions: impressions[index] ?? 0,
      positionSum: positionSums[index] ?? 0,
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

// ── Whole numbers packed as text ───────────────────────────────────────────

/**
 * A kept list's columns of whole numbers — clicks, impressions, position
 * sums, counts, searches a month — stored as text (keep-less-history-plan.md,
 * part 8; 2026-10-08). Convex keeps every number in nine bytes, and nearly
 * all of these are small: most of a list's clicks are 0. Each number is
 * written in base 32, five bits a character, lowest first; its last character
 * comes from the alphabet's second half, so none needs a separator. 0 to 15
 * take one character, to 511 two, to 16,383 three. A sign is folded in (−1 is
 * "not known"); a fraction is rounded — a position sum is a whole number of
 * places, Google's to a millionth.
 */
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
const DIGIT_AT = new Map([...DIGITS].map((digit, at) => [digit, at]));

/** A column of whole numbers as stored: packed text, or a list as kept before 2026-10-08. */
export type StoredNumbers = string | number[];

export function packNumbers(values: readonly number[]): string {
  let text = "";
  for (const value of values) {
    if (!Number.isFinite(value)) throw appError("INVALID_INPUT", `A kept figure must be a number, not ${value}.`);
    const whole = Math.round(value);
    let rest = whole >= 0 ? whole * 2 : -whole * 2 - 1;
    for (; rest >= 32; rest = Math.floor(rest / 32)) text += DIGITS[rest % 32];
    text += DIGITS[32 + rest];
  }
  return text;
}

export function unpackNumbers(stored: StoredNumbers): number[] {
  if (typeof stored !== "string") return stored;
  const values: number[] = [];
  let rest = 0;
  let scale = 1;
  for (const digit of stored) {
    const at = DIGIT_AT.get(digit) ?? 0;
    if (at < 32) {
      rest += at * scale;
      scale *= 32;
      continue;
    }
    rest += (at - 32) * scale;
    values.push(rest % 2 === 0 ? rest / 2 : -(rest + 1) / 2);
    rest = 0;
    scale = 1;
  }
  return values;
}

const PACKED_COLUMNS = ["clicks", "impressions", "positionSums", "counts", "volumes"] as const;
type PackedColumn = (typeof PACKED_COLUMNS)[number];

/**
 * A ready-made period's page addresses — a keyword's top page (`tops`),
 * Pages competing's pages (`pages`) — kept once a part (part 8.2,
 * 2026-10-08): the part's own book of the addresses it holds (`pageBook`),
 * each row its place in the book, packed as text. A part of 2,000 rows holds
 * 700 to 950 pages, each address about 50 characters a row before. Kept with
 * the part, not the website's page list (`searchConsolePageRefs.ts`), so a
 * screen reading it — Pages competing folds a page's `#section` links, a
 * table sorts by top page — needs no look-up however many pages a website has.
 *
 * A search's intent or a page's type (`kinds`) the same way, in `kindBook`
 * (part 8.4): "UNJUDGED", "BUYING", "CATEGORY" a row before, a character now.
 */
const BOOKED_COLUMNS = { tops: "pageBook", pages: "pageBook", kinds: "kindBook" } as const;
type BookedColumn = keyof typeof BOOKED_COLUMNS;

/** Values as a book of each once, in the order first met, and each row's place in it, packed. */
export function bookPages(addresses: readonly string[]): { book: string[]; places: string } {
  const place = new Map<string, number>();
  const places = addresses.map((address) => {
    const held = place.get(address);
    if (held !== undefined) return held;
    place.set(address, place.size);
    return place.size - 1;
  });
  return { book: [...place.keys()], places: packNumbers(places) };
}

/**
 * What a period's part keeps in its own books: a keyword list's top pages, or
 * Pages competing's pages, and any list's kinds.
 */
export function bookedColumns(part: { list: string; tops?: readonly string[] | string; pages?: readonly string[] | string; kinds?: readonly string[] }): {
  tops?: string;
  pages?: string;
  pageBook?: string[];
  kinds?: string;
  kindBook?: string[];
} {
  const column = part.list === "query" ? "tops" : part.list === "competing" ? "pages" : null;
  // Already places in the build's book (core-data-normalisation-plan.md §5.1): nothing to book here.
  const addresses = column ? part[column] : undefined;
  const pages = column && Array.isArray(addresses) && addresses.length > 0 ? bookPages(addresses) : null;
  const kinds = part.kinds && part.kinds.length > 0 ? bookPages(part.kinds) : null;
  return {
    ...(column && pages ? { [column]: pages.places, pageBook: pages.book } : {}),
    ...(kinds ? { kinds: kinds.places, kindBook: kinds.book } : {}),
  };
}

/** A stored part with its number columns as lists, and its booked addresses as addresses. */
export type Unpacked<T> = { [K in keyof T]: K extends PackedColumn | BookedColumn ? Exclude<T[K], string> : T[K] };

/** A part as stored, read back: its number columns as lists, its booked addresses as addresses, the rest as it is. */
export function unpackedPart<
  T extends Partial<Record<PackedColumn, StoredNumbers>> & Partial<Record<BookedColumn, string | string[]>> & { pageBook?: string[]; kindBook?: string[] },
>(
  part: T,
): Unpacked<T> {
  const out: Record<string, unknown> = { ...part };
  for (const column of PACKED_COLUMNS) {
    const stored = part[column];
    if (stored !== undefined) out[column] = unpackNumbers(stored);
  }
  for (const [column, book] of Object.entries(BOOKED_COLUMNS) as Array<[BookedColumn, "pageBook" | "kindBook"]>) {
    const stored = part[column];
    if (typeof stored === "string") out[column] = unpackNumbers(stored).map((place) => part[book]?.[place] ?? "");
  }
  return out as Unpacked<T>;
}

/** A part's number columns as they are stored: spread over the part when writing it. */
export function packedColumns(part: {
  clicks: readonly number[];
  impressions: readonly number[];
  positionSums: readonly number[];
  counts?: readonly number[];
  volumes?: readonly number[];
}): { clicks: string; impressions: string; positionSums: string; counts?: string; volumes?: string } {
  return {
    clicks: packNumbers(part.clicks),
    impressions: packNumbers(part.impressions),
    positionSums: packNumbers(part.positionSums),
    ...(part.counts ? { counts: packNumbers(part.counts) } : {}),
    ...(part.volumes ? { volumes: packNumbers(part.volumes) } : {}),
  };
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
