import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { SearchConsolePeriod, SearchType } from "./searchConsoleSchema";
import { bookOfParts, partsToRead, periodFromParts } from "./searchConsolePeriodReads";
import { BookNames, wholeBook, type BookScope } from "./searchConsolePeriodBooks";
import { tokenPlace } from "./utils/searchConsoleTerms";
import { keywordColumnsOf, keywordTable, pairColumnsOf, type ListRows } from "./searchConsoleKeywordTable";
import type { SortKey } from "./searchConsoleSorts";
import type { Filters, SitesKeyword, Summary, View, ViewContext, ViewRules } from "./utils/searchConsoleViews";

/**
 * A ready-made list of keywords for the list screens (`readList`), read as
 * columns (`searchConsoleKeywordTable.ts`, core-data-normalisation-plan.md
 * step 4b): the keywords Google showed, the days before, and Pages competing's
 * pairs, each one build's. Lists from two builds — one rebuilt while the other
 * waited on Google — or kept as text before 2026-10-08 are left to the row
 * reading (`asRows`), with the parts read.
 */

export type KeywordListAsk = {
  searchType: SearchType;
  period: SearchConsolePeriod;
  country: string | undefined;
  view: View;
  filters: Filters;
  sort: SortKey | undefined;
  direction: "asc" | "desc" | undefined;
  missed: "searched" | "untracked";
  days: number;
  rules: ViewRules;
  /** The most rows a list holds (`consoleListRows`). */
  most: number;
  tracked: () => Promise<ReadonlySet<string>>;
  brandWords: () => Promise<string[]>;
  sitesKeywords: () => Promise<SitesKeyword[]>;
};

export type KeywordList = {
  rows: ListRows;
  cut: number | null;
  from: string;
  to: string;
  named: number;
  listed: number;
  comparable: boolean;
  summary: Summary;
  names: BookNames;
};

/** The parts read, for the row reading to use rather than read again. */
export type KeywordParts = { now: Doc<"searchConsolePeriods">[]; before: Doc<"searchConsolePeriods">[]; competing: Doc<"searchConsolePeriods">[] | null };

export async function keywordListOf(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  ask: KeywordListAsk,
): Promise<KeywordList | "PREPARING" | { asRows: KeywordParts }> {
  const read = async (list: "query" | "competing", which: "NOW" | "BEFORE") =>
    await partsToRead(ctx, companyWebsiteId, ask.searchType, list, ask.period, which, ask.country);
  const nowParts = await read("query", "NOW");
  if (nowParts.length === 0) return "PREPARING";
  const beforeParts = await read("query", "BEFORE");
  const pairParts = ask.view === "competing" ? await read("competing", "NOW") : null;
  if (pairParts && pairParts.length === 0) return "PREPARING";
  const book = bookOfParts(nowParts);
  const builds = new Set([nowParts, beforeParts, pairParts ?? []].flatMap((parts) => (parts.length > 0 ? [parts[0].builtAt] : [])));
  const asRows = { asRows: { now: nowParts, before: beforeParts, competing: pairParts } };
  if (!book || builds.size > 1) return asRows;
  const now = keywordColumnsOf(nowParts);
  const before = beforeParts.length > 0 ? keywordColumnsOf(beforeParts) : null;
  const pairs = pairParts ? pairColumnsOf(pairParts) : null;
  if (!now || (beforeParts.length > 0 && !before) || (pairParts && !pairs)) return asRows;

  const names = new BookNames(ctx, book);
  // The company's tracked searches as tokens, where the book holds them: up to 200 look-ups, each a small record.
  const tracked = new Set(await Promise.all([...(await ask.tracked())].map(async (text) => await names.tokenOf("query", text))));
  const missedSearched = ask.view === "missed" && ask.missed === "searched";
  // A search, and Missed demand's match with Sites, read every keyword's text: the keyword book whole (§5.5).
  const bookTexts = ask.filters.q?.trim() || missedSearched ? await wholeBook(ctx, book, "query") : null;
  const context: ViewContext = {
    rules: ask.rules,
    missedList: ask.missed,
    tracked,
    days: ask.days,
    ...(missedSearched ? { sitesKeywords: await ask.sitesKeywords() } : {}),
  };
  const table = keywordTable(now, before, pairs, {
    view: ask.view,
    filters: ask.filters,
    sort: ask.sort,
    direction: ask.direction,
    most: ask.most,
    tracked,
    brandWords: await ask.brandWords(),
    context,
    pagesShown: pairParts?.[0]?.shown ?? null,
    bookTexts,
  });
  return {
    rows: table.rows,
    cut: table.cut,
    from: nowParts[0].from,
    to: nowParts[0].to,
    named: table.named,
    listed: table.listed,
    comparable: before !== null,
    summary: table.summary,
    names,
  };
}

/**
 * A ready-made keyword list's figures, a keyword at a time, never a row object
 * for each (step 4b): for a reader wanting a few keywords' figures — New and
 * lost's, an AI search's position — or a sum over them all, the click rate at
 * each position. A list kept as text is read as rows.
 */
export type KeywordFigures = {
  length: number;
  /** The book naming the list's keywords; null for a list of text. */
  book: BookScope | null;
  /** A keyword's row by its token — or its text, in a list of text — or -1. */
  rowOf: (key: string) => number;
  clicks: (row: number) => number;
  impressions: (row: number) => number;
  positionSum: (row: number) => number;
};

export async function keywordFiguresOf(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  period: SearchConsolePeriod,
  country: string | undefined,
): Promise<KeywordFigures | null> {
  const parts = await partsToRead(ctx, companyWebsiteId, searchType, "query", period, "NOW", country);
  if (parts.length === 0) return null;
  const columns = keywordColumnsOf(parts);
  if (columns) {
    let size = 0;
    for (const place of columns.key) if (place >= size) size = place + 1;
    const at = new Int32Array(size).fill(-1);
    for (let row = 0; row < columns.length; row += 1) at[columns.key[row]] = row;
    return {
      length: columns.length,
      book: bookOfParts(parts),
      rowOf: (key) => {
        const place = tokenPlace(key)?.place;
        return place === undefined || place >= size ? -1 : at[place];
      },
      clicks: (row) => columns.clicks[row],
      impressions: (row) => columns.impressions[row],
      positionSum: (row) => columns.positionSum[row],
    };
  }
  const list = await periodFromParts(ctx, companyWebsiteId, searchType, "query", parts, country);
  const rows = list?.rows ?? [];
  const at = new Map(rows.map((row, index) => [row.key, index]));
  return {
    length: rows.length,
    book: list?.book ?? null,
    rowOf: (key) => at.get(key) ?? -1,
    clicks: (row) => rows[row].clicks,
    impressions: (row) => rows[row].impressions,
    positionSum: (row) => rows[row].positionSum,
  };
}

/** Each keyword's figures in turn for the click rate at each position (`ctrCurve`): one object, reused. */
export function* curveRows(figures: KeywordFigures | null): Generator<{ clicks: number; impressions: number; position: number }> {
  if (!figures) return;
  const row = { clicks: 0, impressions: 0, position: 0 };
  for (let at = 0; at < figures.length; at += 1) {
    row.clicks = figures.clicks(at);
    row.impressions = figures.impressions(at);
    row.position = row.impressions > 0 ? figures.positionSum(at) / row.impressions : 0;
    yield row;
  }
}
