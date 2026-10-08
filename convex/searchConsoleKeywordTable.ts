import { compareTermsQuickly, termToken, tokenPlace } from "./utils/searchConsoleTerms";
import { BANDS, bandOf, emptyRow, filterRows, isBrand, type Band, type BandCounts, type BrandSplit, type Filters, type ListRow, type Summary, type View, type ViewContext } from "./utils/searchConsoleViews";
import { wordStartMatcher } from "./utils/wordStarts";
import { sortRows, type SortKey } from "./searchConsoleSorts";
import type { Doc } from "./_generated/dataModel";
import { unpackNumbers } from "./utils/searchConsolePacks";
import { UNKNOWN } from "./searchConsoleFacts";

/**
 * A ready-made list of keywords shaped, put through its page's rule, searched,
 * filtered, ordered and counted as columns of numbers — never a row object for
 * every keyword (core-data-normalisation-plan.md, step 4b).
 *
 * A Convex query holds 64 MB and runs for a second. Made one object a row, a
 * list of keywords at five times morehandles.co.uk — 200,000 keywords, and
 * Pages competing's 230,000 pairs beside them — held 88 MB, and Pages competing
 * 184 (measured 2026-10-08): it failed at twice morehandles.co.uk's size. Held
 * as columns — a keyword its place in the build's book, each figure a number in
 * a typed array — a list is a few megabytes, and only the rows a screen shows
 * or a download sends are made into rows (`ListRows`).
 *
 * The answer is the row rules' own (`searchConsoleViews.ts`, which still shape
 * a list of pages and a list asked of Google): row for row, figure for figure
 * and in the same order — `searchConsoleKeywordTable.test.ts` holds the two
 * together for every view, filter and heading.
 */

/** A list's rows as a caller reads them: how many, and those it shows, made when asked. */
export type ListRows = { readonly length: number; slice(start?: number, end?: number): ListRow[] };

/** A ready-made list of keywords, as columns. A keyword is its place in the build's book. */
export type KeywordColumns = {
  length: number;
  key: Int32Array;
  clicks: Float64Array;
  impressions: Float64Array;
  positionSum: Float64Array;
  /** How many pages the keyword brought people to; -1 where the list keeps none. */
  count: Int32Array | null;
  /** Its top page's place in the page book; -1 where the list keeps none. */
  top: Int32Array | null;
  /** Its intent, as a code into `kinds`; 0 where the list keeps none. */
  kind: Uint16Array | null;
  kinds: readonly string[];
  /** Sites' searches a month, and estimated visits; NaN where the list keeps none, below 0 not known. */
  volume: Float64Array | null;
  estimate: Float64Array | null;
  /** Its use of the website's brand words, judged at build: 1 yes, 0 no, 2 not judged. */
  brand: Uint8Array | null;
};

/** Pages competing's pairs: each keyword with each page it was shown with, both as places. */
export type PairColumns = { length: number; key: Int32Array; page: Int32Array; clicks: Float64Array; impressions: Float64Array };

export type KeywordTableAsk = {
  view: View;
  filters: Filters;
  sort: SortKey | undefined;
  direction: "asc" | "desc" | undefined;
  /** The most rows a list holds (`consoleListRows`): past it, the list is cut. */
  most: number;
  /** The company's tracked keywords: tokens where the book holds them, text where not. */
  tracked: ReadonlySet<string>;
  brandWords: readonly string[] | null;
  context: ViewContext;
  /** Pages competing: how many pages Google showed for any keyword, when the list holds it. */
  pagesShown: number | null;
  /** Every keyword's text, in place order: for a search, and Missed demand's match with Sites. */
  bookTexts: readonly string[] | null;
};

export type KeywordTable = { rows: ListRows; listed: number; named: number; summary: Summary; cut: number | null };

/** A stored part as columns are read from it: its keywords and pages as places in the build's book, packed. */
type StoredPart = Pick<Doc<"searchConsolePeriods">, "keys" | "clicks" | "impressions" | "positionSums" | "counts" | "tops" | "pages" | "pageBook" | "kinds" | "kindBook" | "volumes" | "estimates" | "brands">;

/** Whether a period's parts hold places in their build's book throughout — older parts hold text, and are read as rows. */
function inBook(parts: readonly StoredPart[]): boolean {
  return parts.every((part) => typeof part.keys === "string" && !part.pageBook
    && (part.tops === undefined || typeof part.tops === "string") && (part.pages === undefined || typeof part.pages === "string")
    && (part.kinds === undefined || typeof part.kinds === "string"));
}

/**
 * A ready-made keyword list's parts as columns: each figure as the row reading would make it
 * (`readPeriod`) — a count of 0 where the part keeps counts and has none, "UNJUDGED" for an
 * intent not held, Sites' "not known" below 0. Null when a part holds text (`inBook`).
 */
export function keywordColumnsOf(parts: readonly StoredPart[]): KeywordColumns | null {
  if (!inBook(parts)) return null;
  const decoded = parts.map((part) => ({ part, keys: unpackNumbers(part.keys as string) }));
  const length = decoded.reduce((sum, { keys }) => sum + keys.length, 0);
  const has = (pick: (part: StoredPart) => unknown) => parts.some((part) => pick(part) !== undefined);
  const columns: KeywordColumns = {
    length,
    key: new Int32Array(length),
    clicks: new Float64Array(length),
    impressions: new Float64Array(length),
    positionSum: new Float64Array(length),
    count: has((part) => part.counts) ? new Int32Array(length).fill(NONE) : null,
    top: has((part) => part.tops) ? new Int32Array(length).fill(NONE) : null,
    kind: has((part) => part.kinds) ? new Uint16Array(length) : null,
    kinds: [""],
    volume: has((part) => part.volumes) ? new Float64Array(length).fill(Number.NaN) : null,
    estimate: has((part) => part.estimates) ? new Float64Array(length).fill(Number.NaN) : null,
    brand: has((part) => part.brands) ? new Uint8Array(length).fill(2) : null,
  };
  const kindCodes = new Map<string, number>();
  let at = 0;
  for (const { part, keys } of decoded) {
    const clicks = unpackNumbers(part.clicks);
    const impressions = unpackNumbers(part.impressions);
    const positionSums = unpackNumbers(part.positionSums);
    const counts = part.counts === undefined ? null : unpackNumbers(part.counts);
    const tops = part.tops === undefined ? null : unpackNumbers(part.tops as string);
    const kinds = part.kinds === undefined ? null : unpackNumbers(part.kinds as string);
    const volumes = part.volumes === undefined ? null : unpackNumbers(part.volumes);
    const brands = part.brands === undefined ? null : unpackNumbers(part.brands);
    // A part's intents named by its own book, each name given one code for the list.
    const kindOf = (place: number | undefined) => {
      const name = place === undefined ? "UNJUDGED" : part.kindBook?.[place] ?? "";
      let code = kindCodes.get(name);
      if (code === undefined) {
        code = columns.kinds.length;
        kindCodes.set(name, code);
        (columns.kinds as string[]).push(name);
      }
      return code;
    };
    for (let index = 0; index < keys.length; index += 1, at += 1) {
      columns.key[at] = keys[index];
      columns.clicks[at] = clicks[index] ?? 0;
      columns.impressions[at] = impressions[index] ?? 0;
      columns.positionSum[at] = positionSums[index] ?? 0;
      if (counts && columns.count) columns.count[at] = counts[index] ?? 0;
      if (tops && columns.top) columns.top[at] = tops[index] ?? NONE;
      if (kinds && columns.kind) columns.kind[at] = kindOf(kinds[index]);
      if (volumes && columns.volume) columns.volume[at] = volumes[index] ?? UNKNOWN;
      if (part.estimates && columns.estimate) columns.estimate[at] = part.estimates[index] ?? UNKNOWN;
      if (brands && columns.brand) columns.brand[at] = brands[index] === 1 ? 1 : 0;
    }
  }
  return columns;
}

/** Pages competing's parts as columns: each keyword and page a place in the build's book. Null when a part holds text. */
export function pairColumnsOf(parts: readonly StoredPart[]): PairColumns | null {
  if (!inBook(parts) || parts.some((part) => part.pages === undefined && part.keys.length > 0)) return null;
  const decoded = parts.map((part) => ({ part, keys: unpackNumbers(part.keys as string) }));
  const length = decoded.reduce((sum, { keys }) => sum + keys.length, 0);
  const pairs: PairColumns = { length, key: new Int32Array(length), page: new Int32Array(length), clicks: new Float64Array(length), impressions: new Float64Array(length) };
  let at = 0;
  for (const { part, keys } of decoded) {
    const pages = unpackNumbers((part.pages as string | undefined) ?? "");
    const clicks = unpackNumbers(part.clicks);
    const impressions = unpackNumbers(part.impressions);
    for (let index = 0; index < keys.length; index += 1, at += 1) {
      pairs.key[at] = keys[index];
      pairs.page[at] = pages[index] ?? NONE;
      pairs.clicks[at] = clicks[index] ?? 0;
      pairs.impressions[at] = impressions[index] ?? 0;
    }
  }
  return pairs;
}

const QUERY = "query";
const NONE = -1;
const known = (value: number) => (Number.isNaN(value) || value < 0 ? null : value);

/**
 * The rows a list is shaped from: the keywords Google showed, then — for Wins
 * and losses — those gone since the days before, and — for a tracked list —
 * those tracked that Google did not show (`withGone`, `withTracked`).
 */
type Source = {
  length: number;
  /** The keyword's row in the list now; -1 for one gone or tracked and not shown. */
  now: Int32Array;
  /** Its place in the book; -1 for a tracked keyword the book does not hold. */
  place: Int32Array;
  /** The text of a tracked keyword the book does not hold, by source row. */
  texts: Map<number, string>;
  /** Its row in the days before; -1 for none, or no days before held. */
  before: Int32Array;
};

/** Each value's row by its place: -1 for none. */
function rowsByPlace(keys: Int32Array, size: number): Int32Array {
  const at = new Int32Array(size).fill(NONE);
  for (let row = 0; row < keys.length; row += 1) at[keys[row]] = row;
  return at;
}

function sourceOf(view: View, now: KeywordColumns, before: KeywordColumns | null, tracked: ReadonlySet<string>, size: number): Source {
  const nowAt = rowsByPlace(now.key, size);
  const extra: Array<{ place: number; text?: string }> = [];
  if (view === "moves" && before) {
    for (let row = 0; row < before.length; row += 1) if (nowAt[before.key[row]] === NONE && before.clicks[row] > 0) extra.push({ place: before.key[row] });
  }
  if (view === "tracked") {
    for (const key of tracked) {
      const at = tokenPlace(key);
      if (!at) extra.push({ place: NONE, text: key });
      else if (at.place >= size || nowAt[at.place] === NONE) extra.push({ place: at.place });
    }
  }
  const length = now.length + extra.length;
  const source: Source = { length, now: new Int32Array(length), place: new Int32Array(length), texts: new Map(), before: new Int32Array(length).fill(NONE) };
  for (let row = 0; row < now.length; row += 1) {
    source.now[row] = row;
    source.place[row] = now.key[row];
  }
  extra.forEach((row, at) => {
    source.now[now.length + at] = NONE;
    source.place[now.length + at] = row.place;
    if (row.text !== undefined) source.texts.set(now.length + at, row.text);
  });
  if (before) {
    const beforeAt = rowsByPlace(before.key, size);
    for (let row = 0; row < length; row += 1) {
      const place = source.place[row];
      if (place !== NONE && place < size) source.before[row] = beforeAt[place];
    }
  }
  return source;
}

/** Pages competing's figures for each keyword shown with two pages or more: the rows it lists, and what it adds. */
type Competing = { slot: Int32Array; count: Int32Array; top: Int32Array; next: Int32Array; topClicks: Float64Array; nextClicks: Float64Array; clicks: Float64Array };

/**
 * Each keyword's pages, a page and its section links one (folded at build), most clicks first,
 * then most impressions, then A to Z (`pagesByKeyword`): how many, the top two and their clicks.
 */
function competingOf(pairs: PairColumns, size: number): Competing {
  // The pairs by keyword: counted, then placed (each keyword's in the order kept).
  const starts = new Int32Array(size + 1);
  for (let row = 0; row < pairs.length; row += 1) starts[pairs.key[row] + 1] += 1;
  for (let place = 0; place < size; place += 1) starts[place + 1] += starts[place];
  const order = new Int32Array(pairs.length);
  const filled = starts.slice(0, size);
  for (let row = 0; row < pairs.length; row += 1) order[filled[pairs.key[row]]++] = row;

  const slot = new Int32Array(size).fill(NONE);
  const found: Array<[number, number, number, number, number, number, number]> = [];
  const pages: number[] = [];
  const clicks: number[] = [];
  const impressions: number[] = [];
  for (let place = 0; place < size; place += 1) {
    const from = starts[place];
    const to = starts[place + 1];
    if (to - from < 2) continue;
    pages.length = 0;
    clicks.length = 0;
    impressions.length = 0;
    for (let at = from; at < to; at += 1) {
      const row = order[at];
      const held = pages.indexOf(pairs.page[row]);
      if (held === NONE) {
        pages.push(pairs.page[row]);
        clicks.push(pairs.clicks[row]);
        impressions.push(pairs.impressions[row]);
      } else {
        clicks[held] += pairs.clicks[row];
        impressions[held] += pairs.impressions[row];
      }
    }
    if (pages.length < 2) continue;
    const ranked = pages.map((_, at) => at).sort((left, right) => clicks[right] - clicks[left] || impressions[right] - impressions[left]
      || compareTermsQuickly(termToken("page", pages[left]), termToken("page", pages[right])));
    const total = clicks.reduce((sum, value) => sum + value, 0);
    slot[place] = found.length;
    found.push([pages.length, pages[ranked[0]], pages[ranked[1]], clicks[ranked[0]], clicks[ranked[1]], total, place]);
  }
  const competing: Competing = {
    slot,
    count: Int32Array.from(found, (entry) => entry[0]),
    top: Int32Array.from(found, (entry) => entry[1]),
    next: Int32Array.from(found, (entry) => entry[2]),
    topClicks: Float64Array.from(found, (entry) => entry[3]),
    nextClicks: Float64Array.from(found, (entry) => entry[4]),
    clicks: Float64Array.from(found, (entry) => entry[5]),
  };
  return competing;
}

/** The pages any of the keywords marked was shown with, of every page any keyword was (`summarise`). */
function pagesAmong(pairs: PairColumns, marked: Uint8Array | null): number {
  const seen = new Set<number>();
  for (let row = 0; row < pairs.length; row += 1) if (!marked || marked[pairs.key[row]] === 1) seen.add(pairs.page[row]);
  return seen.size;
}

/** A keyword list, as its page shows it: the rows asked for, how many it lists, and its hero boxes' figures. */
export function keywordTable(now: KeywordColumns, before: KeywordColumns | null, pairs: PairColumns | null, ask: KeywordTableAsk): KeywordTable {
  // Every place any list holds, or the company tracks: the size of each look-up by place.
  let size = 0;
  for (const keys of [now.key, before?.key, pairs?.key]) if (keys) for (const place of keys) if (place >= size) size = place + 1;
  for (const key of ask.tracked) {
    const at = tokenPlace(key);
    if (at && at.kind === QUERY && at.place >= size) size = at.place + 1;
  }
  const source = sourceOf(ask.view, now, before, ask.tracked, size);
  const trackedPlace = new Uint8Array(size);
  const trackedTexts = new Set<string>();
  for (const key of ask.tracked) {
    const at = tokenPlace(key);
    if (at) {
      if (at.kind === QUERY) trackedPlace[at.place] = 1;
    } else {
      trackedTexts.add(key);
    }
  }

  // ── A source row's shaped figures (`shapeRows`) ──────────────────────────
  const nowRow = source.now;
  const clicksOf = (row: number) => (nowRow[row] === NONE ? 0 : now.clicks[nowRow[row]]);
  const impressionsOf = (row: number) => (nowRow[row] === NONE ? 0 : now.impressions[nowRow[row]]);
  const positionOf = (row: number) => {
    const impressions = impressionsOf(row);
    return impressions > 0 ? now.positionSum[nowRow[row]] / impressions : 0;
  };
  let total = 0;
  for (let row = 0; row < source.length; row += 1) total += clicksOf(row);
  const previousClicksOf = (row: number): number | null => (before ? (source.before[row] === NONE ? null : before.clicks[source.before[row]]) : null);
  const changeOf = (row: number): number | null => (before ? clicksOf(row) - (previousClicksOf(row) ?? 0) : null);
  const previousPositionOf = (row: number): number | null => {
    const was = source.before[row];
    return before && was !== NONE && before.impressions[was] > 0 ? before.positionSum[was] / before.impressions[was] : null;
  };
  const positionChangeOf = (row: number): number | null => {
    const previous = previousPositionOf(row);
    return previous === null || impressionsOf(row) === 0 ? null : previous - positionOf(row);
  };
  const nameOf = (row: number) => source.texts.get(row) ?? termToken(QUERY, source.place[row]);
  const trackedOf = (row: number) => (source.place[row] === NONE ? trackedTexts.has(source.texts.get(row) ?? "") : trackedPlace[source.place[row]] === 1);
  const column = <T>(values: { [index: number]: T } | null, row: number): T | undefined => (values && nowRow[row] !== NONE ? values[nowRow[row]] : undefined);
  const countOf = (row: number): number | null => {
    const value = column(now.count, row);
    return value === undefined || value === NONE ? null : value;
  };
  const topOf = (row: number): number => column(now.top, row) ?? NONE;
  const kindOf = (row: number): string | null => {
    const code = column(now.kind, row);
    return code === undefined || code === 0 ? null : now.kinds[code];
  };
  const volumeOf = (row: number) => known(column(now.volume, row) ?? Number.NaN);
  const estimateOf = (row: number) => known(column(now.estimate, row) ?? Number.NaN);
  const brandWords = ask.brandWords;
  const brandOf = (row: number): boolean | null => {
    if (!brandWords) return null;
    const judged = column(now.brand, row);
    return judged === 0 || judged === 1 ? judged === 1 : isBrand(nameOf(row), brandWords);
  };

  // ── The page's rule (`applyView`) ────────────────────────────────────────
  const competing = ask.view === "competing" && pairs ? competingOf(pairs, size) : null;
  const slotOf = (row: number) => (competing && source.place[row] !== NONE ? competing.slot[source.place[row]] : NONE);
  if (ask.view === "missed" && ask.context.missedList !== "untracked") return missedTable(ask, source, shaped, summaryOfAll(), before !== null);
  const keep: (row: number) => boolean = ask.view === "tracked" ? trackedOf
    : ask.view === "missed" ? (row) => !trackedOf(row)
    : ask.view === "almost" ? (row) => positionOf(row) > 3 && positionOf(row) <= 20
    : ask.view === "competing" ? (row) => slotOf(row) !== NONE
    : ask.view === "moves" ? (row) => {
      const change = changeOf(row);
      return change !== null && change !== 0;
    }
    : () => true;
  let count = 0;
  for (let row = 0; row < source.length; row += 1) if (keep(row)) count += 1;
  const listed = new Int32Array(count);
  for (let row = 0, at = 0; row < source.length; row += 1) if (keep(row)) listed[at++] = row;

  function shaped(row: number): ListRow {
    const previousPosition = previousPositionOf(row);
    const top = topOf(row);
    const out: ListRow = {
      key: nameOf(row),
      clicks: clicksOf(row),
      impressions: impressionsOf(row),
      ctr: impressionsOf(row) > 0 ? clicksOf(row) / impressionsOf(row) : 0,
      position: positionOf(row),
      band: bandOf(positionOf(row)),
      previousClicks: previousClicksOf(row),
      change: changeOf(row),
      previousPosition,
      positionChange: positionChangeOf(row),
      share: total > 0 ? clicksOf(row) / total : 0,
      count: countOf(row),
      top: top === NONE ? null : termToken("page", top),
      tracked: trackedOf(row),
      kind: kindOf(row),
      volume: volumeOf(row),
      estimate: estimateOf(row),
      brand: brandOf(row),
      usualCtr: null,
      expected: null,
      topShare: null,
      next: null,
      nextShare: null,
      verdict: null,
      gap: null,
    };
    const at = slotOf(row);
    if (ask.view === "competing" && competing && at !== NONE) {
      const clicks = competing.clicks[at];
      out.count = competing.count[at];
      out.top = termToken("page", competing.top[at]);
      out.topShare = clicks > 0 ? competing.topClicks[at] / clicks : null;
      out.next = termToken("page", competing.next[at]);
      out.nextShare = clicks > 0 ? competing.nextClicks[at] / clicks : null;
    }
    return out;
  }

  // ── The hero boxes' figures, over every row the rule lists (`summarise`) ──
  function summaryOfAll(): AllFigures {
    const brand = brandWords ? emptySplit() : null;
    if (brand) for (let row = 0; row < source.length; row += 1) addToSplit(brand, brandOf(row) === true, clicksOf(row), impressionsOf(row));
    let beforeBands: BandCounts | null = null;
    let beforeBrand: BrandSplit | null = null;
    if (before) {
      beforeBands = emptyBands();
      beforeBrand = brandWords ? emptySplit() : null;
      for (let row = 0; row < before.length; row += 1) {
        if (before.impressions[row] > 0) beforeBands[bandOf(before.positionSum[row] / before.impressions[row])] += 1;
        if (beforeBrand && brandWords) {
          const judged = before.brand ? before.brand[row] : 2;
          const isOne = judged === 0 || judged === 1 ? judged === 1 : isBrand(termToken(QUERY, before.key[row]), brandWords);
          addToSplit(beforeBrand, isOne, before.clicks[row], before.impressions[row]);
        }
      }
    }
    return { of: source.length, brand: brand ? { now: brand, before: beforeBrand } : null, bandsBefore: beforeBands };
  }
  const tally = new Tally(summaryOfAll(), before !== null);
  for (const row of listed) {
    tally.add({
      clicks: clicksOf(row), impressions: impressionsOf(row), position: positionOf(row), previousClicks: previousClicksOf(row), change: changeOf(row),
      tracked: trackedOf(row), volume: volumeOf(row), estimate: estimateOf(row), kind: kindOf(row), band: bandOf(positionOf(row)),
    });
  }
  const summary = tally.summary();
  if (competing && pairs) {
    const marked = new Uint8Array(size);
    for (const row of listed) if (source.place[row] !== NONE) marked[source.place[row]] = 1;
    summary.pagesInvolved = pagesAmong(pairs, marked);
    summary.pagesShown = ask.pagesShown ?? pagesAmong(pairs, null);
  }
  const named = tally.clicks();

  // ── Searched and filtered (`filterRows`), then ordered (`sortRows`) ─────────
  const filters = ask.filters;
  const matches = wordStartMatcher(filters.q?.trim().toLowerCase());
  const textOf = (row: number) => {
    const text = source.texts.get(row);
    if (text !== undefined) return text;
    return ask.bookTexts?.[source.place[row]] ?? "";
  };
  const passes = (row: number) => (!matches || matches(textOf(row)))
    && (!filters.tracked || (filters.tracked === "yes") === trackedOf(row))
    && (!filters.band || bandOf(positionOf(row)) === filters.band)
    && (!filters.kind || (kindOf(row) ?? "UNJUDGED") === filters.kind)
    && (!filters.brand || (filters.brand === "yes") === (brandOf(row) === true))
    && (!filters.move || (filters.move === "win" ? (changeOf(row) ?? 0) > 0 : (changeOf(row) ?? 0) < 0))
    && !filters.verdict;
  const kept = filters.q || filters.tracked || filters.band || filters.kind || filters.brand || filters.move || filters.verdict
    ? listed.filter(passes)
    : listed;
  const order = ordered(kept, ask, {
    positionOf, source, nameOf, clicksOf, impressionsOf, changeOf, positionChangeOf, countOf, volumeOf, estimateOf, kindOf, brandOf, total,
    topOf: (row) => {
      const at = slotOf(row);
      return ask.view === "competing" && competing && at !== NONE ? competing.top[at] : topOf(row);
    },
    competing: ask.view === "competing" && competing ? { slotOf, competing } : null,
  });
  const cut = order.length > ask.most ? ask.most : null;
  const shown = cut ? order.subarray(0, cut) : order;
  return {
    rows: { length: shown.length, slice: (start = 0, end = shown.length) => Array.from(shown.subarray(start, Math.min(end, shown.length)), shaped) },
    listed: listed.length,
    named,
    summary,
    cut,
  };
}

// ── Ordering ───────────────────────────────────────────────────────────────

type Readers = {
  positionOf: (row: number) => number;
  source: Source;
  nameOf: (row: number) => string;
  clicksOf: (row: number) => number;
  impressionsOf: (row: number) => number;
  changeOf: (row: number) => number | null;
  positionChangeOf: (row: number) => number | null;
  countOf: (row: number) => number | null;
  volumeOf: (row: number) => number | null;
  estimateOf: (row: number) => number | null;
  kindOf: (row: number) => string | null;
  brandOf: (row: number) => boolean | null;
  topOf: (row: number) => number;
  total: number;
  competing: { slotOf: (row: number) => number; competing: Competing } | null;
};

/** What each heading orders by, as a number — NaN a blank — or, for a name, a place in the book (`SORTS`). */
function sortValue(key: SortKey, read: Readers): ((row: number) => number) | null {
  const numberOr = (value: number | null) => (value === null ? Number.NaN : value);
  const share = (pick: "topClicks" | "nextClicks") => (row: number) => {
    const competing = read.competing;
    const at = competing ? competing.slotOf(row) : NONE;
    if (!competing || at === NONE) return Number.NaN;
    const clicks = competing.competing.clicks[at];
    return clicks > 0 ? competing.competing[pick][at] / clicks : Number.NaN;
  };
  switch (key) {
    case "clicks": return read.clicksOf;
    case "change": return (row) => numberOr(read.changeOf(row));
    case "impressions": return read.impressionsOf;
    case "ctr": return (row) => (read.impressionsOf(row) > 0 ? read.clicksOf(row) / read.impressionsOf(row) : 0);
    case "position": return (row) => (read.impressionsOf(row) > 0 ? read.positionOf(row) : Number.NaN);
    case "positionChange": return (row) => numberOr(read.positionChangeOf(row));
    case "share": return (row) => (read.total > 0 ? read.clicksOf(row) / read.total : 0);
    case "count": return (row) => {
      const competing = read.competing;
      const at = competing ? competing.slotOf(row) : NONE;
      return competing && at !== NONE ? competing.competing.count[at] : numberOr(read.countOf(row));
    };
    case "top": return (row) => {
      const top = read.topOf(row);
      return top === NONE ? Number.NaN : top;
    };
    case "next": return (row) => {
      const competing = read.competing;
      const at = competing ? competing.slotOf(row) : NONE;
      return competing && at !== NONE ? competing.competing.next[at] : Number.NaN;
    };
    case "volume": return (row) => numberOr(read.volumeOf(row));
    case "estimate": return (row) => numberOr(read.estimateOf(row));
    case "brand": return (row) => {
      const brand = read.brandOf(row);
      return brand === null ? Number.NaN : brand ? 0 : 1;
    };
    case "topShare": return share("topClicks");
    case "nextShare": return share("nextClicks");
    case "band": return (row) => (read.impressionsOf(row) > 0 ? BANDS.indexOf(bandOf(read.positionOf(row))) : Number.NaN);
    // Only other views' figures: blank for every keyword.
    case "usualCtr": case "expected": case "gap": return () => Number.NaN;
    // A keyword's name: its place, the book being sorted — unless a row holds text the book does not.
    case "key": return read.source.texts.size === 0 ? (row) => read.source.place[row] : null;
    // An intent, as text.
    case "kind": return null;
  }
}

/** The first direction each heading's first press orders by (`SORTS`). */
const FIRST: Record<SortKey, "asc" | "desc"> = {
  key: "asc", clicks: "desc", change: "desc", impressions: "desc", ctr: "desc", position: "asc", positionChange: "desc", share: "desc",
  count: "desc", top: "asc", volume: "desc", estimate: "desc", kind: "asc", brand: "asc", usualCtr: "desc", expected: "desc",
  topShare: "desc", next: "asc", nextShare: "desc", gap: "desc", band: "asc",
};

/** The rows kept, ordered over the whole list by the heading pressed: blanks last, ties by name (`listOrder`). */
function ordered(rows: Int32Array, ask: KeywordTableAsk, read: Readers): Int32Array {
  const key = ask.sort ?? "clicks";
  const direction = ask.direction ?? FIRST[key];
  const sign = direction === "asc" ? 1 : -1;
  const places = read.source.place;
  // Ties by name: two keywords of the book by their places — the book is sorted — and text as text.
  const byName = (left: number, right: number) => {
    const leftPlace = places[left];
    const rightPlace = places[right];
    if (leftPlace !== NONE && rightPlace !== NONE && !read.source.texts.has(left) && !read.source.texts.has(right)) return leftPlace - rightPlace;
    return compareTermsQuickly(read.nameOf(left), read.nameOf(right));
  };
  const value = sortValue(key, read);
  if (value) {
    const values = new Float64Array(read.source.length);
    for (const row of rows) values[row] = value(row);
    return Int32Array.from(rows).sort((left, right) => {
      const leftValue = values[left];
      const rightValue = values[right];
      const leftBlank = Number.isNaN(leftValue);
      const rightBlank = Number.isNaN(rightValue);
      if (leftBlank || rightBlank) return leftBlank === rightBlank ? byName(left, right) : leftBlank ? 1 : -1;
      return (leftValue - rightValue) * sign || byName(left, right);
    });
  }
  // A keyword's name, or its intent: text.
  const text = key === "key" ? read.nameOf : read.kindOf;
  return Int32Array.from(rows).sort((left, right) => {
    const leftText = text(left);
    const rightText = text(right);
    const leftBlank = leftText === null || leftText === "";
    const rightBlank = rightText === null || rightText === "";
    if (leftBlank || rightBlank) return leftBlank === rightBlank ? byName(left, right) : leftBlank ? 1 : -1;
    return compareTermsQuickly(leftText, rightText) * sign || byName(left, right);
  });
}

// ── The hero boxes ───────────────────────────────────────────────────────────

type AllFigures = { of: number; brand: Summary["brand"]; bandsBefore: BandCounts | null };

const emptyBands = (): BandCounts => ({ "1-3": 0, "4-10": 0, "11-20": 0, "21-50": 0, "51+": 0 });
const emptySplit = (): BrandSplit => ({ brandClicks: 0, nonBrandClicks: 0, brandImpressions: 0, nonBrandImpressions: 0 });

function addToSplit(split: BrandSplit, brand: boolean, clicks: number, impressions: number): void {
  if (brand) {
    split.brandClicks += clicks;
    split.brandImpressions += impressions;
  } else {
    split.nonBrandClicks += clicks;
    split.nonBrandImpressions += impressions;
  }
}

type Listed = {
  clicks: number;
  impressions: number;
  position: number;
  previousClicks: number | null;
  change: number | null;
  tracked: boolean;
  volume: number | null;
  estimate: number | null;
  kind: string | null;
  band: Band;
};

/** The figures over every row a list's rule lists, row by row in the list's order, as `summarise` adds them. */
class Tally {
  private readonly bands = emptyBands();
  private readonly kinds = new Map<string, { kind: string; rows: number; clicks: number }>();
  private rows = 0;
  private sum = { clicks: 0, impressions: 0, previousClicks: 0, positionSum: 0 };
  private counts = { tracked: 0, gaining: 0, losing: 0, gained: 0, lost: 0, volume: 0, estimate: 0 };

  constructor(private readonly all: AllFigures, private readonly beforeHeld: boolean) {}

  add(row: Listed): void {
    this.rows += 1;
    this.sum.clicks += row.clicks;
    this.sum.impressions += row.impressions;
    this.sum.previousClicks += row.previousClicks ?? 0;
    this.sum.positionSum += row.position * row.impressions;
    if (row.tracked) this.counts.tracked += 1;
    const change = row.change ?? 0;
    if (change > 0) {
      this.counts.gaining += 1;
      this.counts.gained += change;
    } else if (change < 0) {
      this.counts.losing += 1;
      this.counts.lost -= change;
    }
    this.counts.volume += row.volume ?? 0;
    this.counts.estimate += row.estimate ?? 0;
    if (row.impressions > 0) this.bands[row.band] += 1;
    const kind = row.kind ?? "UNJUDGED";
    const entry = this.kinds.get(kind) ?? { kind, rows: 0, clicks: 0 };
    entry.rows += 1;
    entry.clicks += row.clicks;
    this.kinds.set(kind, entry);
  }

  clicks(): number {
    return this.sum.clicks;
  }

  summary(): Summary {
    return {
      rows: this.rows,
      of: this.all.of,
      clicks: this.sum.clicks,
      impressions: this.sum.impressions,
      previousClicks: this.beforeHeld ? this.sum.previousClicks : null,
      position: this.sum.impressions > 0 ? this.sum.positionSum / this.sum.impressions : null,
      ...this.counts,
      expected: 0,
      high: 0,
      low: 0,
      pagesInvolved: null,
      pagesShown: null,
      bands: this.bands,
      bandsBefore: this.all.bandsBefore,
      brand: this.all.brand,
      kinds: [...this.kinds.values()].sort((left, right) => right.rows - left.rows || right.clicks - left.clicks),
      types: [],
    };
  }
}

// ── Missed demand ────────────────────────────────────────────────────────────

/**
 * Missed demand (`applyView`, "missed"): Sites' most-searched keywords for the
 * website that Google barely shows it for — a few thousand at most — or every
 * keyword not yet tracked. The first are made into rows and put through the
 * row rules whole, as few; the second listed by column.
 */
function missedTable(ask: KeywordTableAsk, source: Source, toRow: (row: number) => ListRow, all: AllFigures, beforeHeld: boolean): KeywordTable {
  const context = ask.context;
  // Each keyword's row by its text: the book is sorted A to Z, so a text is found by halving.
  const texts = ask.bookTexts ?? [];
  const nowAt = new Map<number, number>();
  for (let row = 0; row < source.length; row += 1) if (source.place[row] !== NONE) nowAt.set(source.place[row], row);
  const rowOfText = (text: string): number | null => {
    let low = 0;
    let high = texts.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const order = compareTermsQuickly(texts[middle], text);
      if (order === 0) return nowAt.get(middle) ?? null;
      if (order < 0) low = middle + 1;
      else high = middle - 1;
    }
    return null;
  };
  const rows = (context.sitesKeywords ?? []).flatMap((keyword): ListRow[] => {
    if (keyword.volume < context.rules.searchedALot) return [];
    const at = rowOfText(keyword.keyword);
    const row = at === null ? null : toRow(at);
    if (row && row.impressions >= context.rules.barelyShown) return [];
    return [row
      ? { ...row, volume: keyword.volume, kind: row.kind ?? keyword.kind }
      : { ...emptyRow(keyword.keyword), volume: keyword.volume, kind: keyword.kind, tracked: context.tracked?.has(keyword.keyword) ?? false }];
  });
  const tally = new Tally(all, beforeHeld);
  for (const row of rows) tally.add(row);
  const summary = tally.summary();
  const textOf = (key: string) => {
    const at = tokenPlace(key);
    return at ? texts[at.place] ?? "" : key;
  };
  const sorted = sortRows(filterRows(rows, ask.filters, textOf), ask.sort, ask.direction);
  const cut = sorted.length > ask.most ? ask.most : null;
  const shown = cut ? sorted.slice(0, cut) : sorted;
  return { rows: shown, listed: rows.length, named: tally.clicks(), summary, cut };
}
