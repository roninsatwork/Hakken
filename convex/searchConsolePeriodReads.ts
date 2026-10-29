import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { SearchConsolePeriod, SearchConsolePeriodList, SearchType } from "./searchConsoleSchema";
import { unpackNumbers, unpackedPart, type Row, type Unpacked } from "./utils/searchConsolePacks";
import { termToken, tokenPlace, type BookKind } from "./utils/searchConsoleTerms";
import { textsFrom, wholeBook, type BookScope } from "./searchConsolePeriodBooks";
import { PARTS_MOST } from "./searchConsoleRollups";
import { UNKNOWN } from "./searchConsoleFacts";
import { CALENDAR_PERIODS, isCalendarPeriod } from "./utils/calendarPeriods";

/**
 * Reading the ready-made periods (search-console-plan.md §14.3): a list
 * whole, or one keyword's pages and one page's keywords by index — always
 * from a period's newest complete build, so a list being built again is
 * never read half done. Apart from `searchConsolePeriods.ts`, which builds
 * them, to keep each file a size one can hold in mind.
 */

/** A ready-made period's parts, from its newest complete build only (`firstPartOf`). */
export async function periodParts(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
) {
  // Its number columns as lists: packed as text when stored (`packNumbers`); its places in the build's book as tokens.
  return (await storedParts(ctx, companyWebsiteId, country, searchType, list, period, which)).map((part) => unpackedPart(withTokens(part)));
}

/** A ready-made period's parts as stored, from its newest complete build only, in order. */
async function storedParts(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
): Promise<Doc<"searchConsolePeriods">[]> {
  const parts = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q
      .eq("companyWebsiteId", companyWebsiteId)
      .eq("country", country)
      .eq("searchType", searchType)
      .eq("list", list)
      .eq("period", period)
      .eq("which", which))
    .take(PARTS_MOST);
  // One read: an older build is beside the newest only while it is being cleared.
  const built = parts.filter((part) => part.part === 0).reduce((newest, part) => Math.max(newest, part.builtAt), -Infinity);
  return parts.filter((part) => part.builtAt === built).sort((left, right) => left.part - right.part);
}

/** A period's parts as a list reads them: one kept on another period's very days (`sameDaysAs`) read as that period. */
export async function partsToRead(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
  country?: string,
): Promise<Doc<"searchConsolePeriods">[]> {
  const parts = await storedParts(ctx, companyWebsiteId, country, searchType, list, period, which);
  if (parts.length === 0) return parts;
  const instead = await sameDaysInstead(ctx, { companyWebsiteId, country, searchType, list }, period, which, parts[0], parts.length);
  if (instead) return await storedParts(ctx, companyWebsiteId, country, searchType, list, instead.period as SearchConsolePeriod, "NOW");
  return parts;
}

/** The build a period's parts name its keywords and pages in, when they are places in its book (§5.1). */
export function bookOfParts(parts: readonly Doc<"searchConsolePeriods">[]): BookScope | null {
  const first = parts[0];
  if (!first || typeof first.keys !== "string" || first.keys.length === 0) return null;
  return { companyWebsiteId: first.companyWebsiteId, ...(first.country === undefined ? {} : { country: first.country }), searchType: first.searchType, builtAt: first.builtAt };
}

/**
 * A part's places in its build's book as tokens (`termToken`, core-data-normalisation-plan.md
 * §5.1): a keyword list's and Pages competing's keys in the keyword book, a page list's in the
 * page book; a keyword's top page or a page's top keyword; Pages competing's pages. A part kept
 * before 2026-10-08 holds text, read as it is.
 */
export function withTokens<T extends { list: SearchConsolePeriodList; keys: string | string[]; tops?: string | string[]; pages?: string | string[]; pageBook?: string[] }>(
  part: T,
): Omit<T, "keys"> & { keys: string[] } {
  if (typeof part.keys !== "string") return { ...part, keys: part.keys };
  const tokens = (kind: BookKind, packed: string) => unpackNumbers(packed).map((place) => termToken(kind, place));
  return {
    ...part,
    keys: tokens(part.list === "page" ? "page" : "query", part.keys),
    ...(typeof part.tops === "string" && !part.pageBook ? { tops: tokens(part.list === "page" ? "query" : "page", part.tops) } : {}),
    ...(typeof part.pages === "string" && !part.pageBook ? { pages: tokens("page", part.pages) } : {}),
  };
}

/** First parts read for a period: the one being swapped in, and the one before it. */
export const FIRST_PARTS_READ = 3;

/**
 * A ready-made period's first part, which says its days: the newest complete
 * build's — a build writes its first part last, so a build being written is
 * not read until it is whole.
 */
export async function firstPartOf(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
) {
  const firsts = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q
      .eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType).eq("list", list).eq("period", period).eq("which", which).eq("part", 0))
    .take(FIRST_PARTS_READ);
  return firsts.reduce<(typeof firsts)[number] | null>((newest, part) => (newest === null || part.builtAt > newest.builtAt ? part : newest), null);
}

/**
 * A period kept on another's very days (`sameDaysAs`, calendar-periods-plan.md
 * phase 4): given the first part read for a period, when its slot holds only
 * the empty part saying its days, the first part of the period before it in
 * the menu's order holding those same days. Null otherwise — the period is
 * read as it is, with no read more than before.
 */
async function sameDaysInstead(
  ctx: { db: QueryCtx["db"] },
  scope: { companyWebsiteId: Id<"companyWebsites">; country: string | undefined; searchType: SearchType; list: SearchConsolePeriodList },
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
  first: { keys: string | string[]; from: string; to: string; part: number } | null,
  parts: number,
) {
  if (!isCalendarPeriod(period) || which !== "NOW" || !first || first.keys.length > 0 || parts > 1) return null;
  for (const other of CALENDAR_PERIODS.slice(0, CALENDAR_PERIODS.indexOf(period))) {
    const held = await firstPartOf(ctx, scope.companyWebsiteId, scope.country, scope.searchType, scope.list, other, "NOW");
    if (held && held.from === first.from && held.to === first.to && held.keys.length > 0) return held;
  }
  return null;
}

/**
 * A row of a ready-made period: its figures, and — where kept — its count and top, Sites' facts
 * (UNKNOWN for none), and whether a keyword uses the website's brand words (judged at build).
 */
export type PeriodRow = Row & { count?: number; top?: string; kind?: string; volume?: number; estimate?: number; brand?: boolean };

/** A ready-made period's list — all countries', or one country's kept ready — its parts put back together; null when nothing is built for it. */
export async function readPeriod(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
  country?: string,
): Promise<ReadPeriod | null> {
  return await periodFromParts(ctx, companyWebsiteId, searchType, list, await partsToRead(ctx, companyWebsiteId, searchType, list, period, which, country), country);
}

export type ReadPeriod = { from: string; to: string; builtAt: number; shown: number | null; rows: PeriodRow[]; book: BookScope | null };

/**
 * A ready-made period's list with its pages left as places in the build's
 * book, for a reader that names only the few rows it needs (`BookNames`):
 * a landing page's own four stages read every page's figures but name only
 * the page asked for — the whole book of a large website's pages, read whole,
 * was most of what such a read cost (google-analytics-plan.md §13).
 */
export async function readPeriodUnnamed(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
): Promise<ReadPeriod | null> {
  return await periodFromParts(ctx, companyWebsiteId, searchType, list, await partsToRead(ctx, companyWebsiteId, searchType, list, period, which), undefined, false);
}

/** A period's parts, read already (`partsToRead`), as rows: what `readPeriod` returns. */
export async function periodFromParts(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  stored: readonly Doc<"searchConsolePeriods">[],
  country?: string,
  /** False to leave a page list's pages as places in its book (`readPeriodUnnamed`). */
  named = true,
): Promise<ReadPeriod | null> {
  const scope = country;
  const parts = stored.map((part) => unpackedPart(withTokens(part)));
  if (parts.length === 0) return null;
  const rows: PeriodRow[] = [];
  for (const part of parts) rowsOfPart(part, rows);
  const book = parts.some((part) => typeof part.keys[0] === "string" && tokenPlace(part.keys[0]) !== null)
    ? { companyWebsiteId, ...(scope === undefined ? {} : { country: scope }), searchType, builtAt: parts[0].builtAt }
    : null;
  // A list of pages is a website's pages at most — read with their addresses whole (§5.3).
  if (book && list === "page" && named) {
    const pages = await wholeBook(ctx, book, "page");
    for (const row of rows) {
      const at = tokenPlace(row.key);
      if (at) row.key = pages[at.place] ?? "";
    }
  }
  return { from: parts[0].from, to: parts[0].to, builtAt: parts[0].builtAt, shown: parts[0].shown ?? null, rows, book };
}

type ReadPart = Unpacked<Pick<Doc<"searchConsolePeriods">, "clicks" | "impressions" | "positionSums" | "counts" | "tops" | "kinds" | "volumes" | "estimates">>
  & { keys: string[]; pages?: string[]; brands?: string };

/**
 * A part's rows, each with the figures kept beside it at its place, onto `rows`. Made
 * one object a row, field by field: at five times morehandles.co.uk a list is hundreds of
 * thousands of rows, and a row copied through spreads, twice, was a third of its read.
 */
export function rowsOfPart(part: ReadPart, rows: PeriodRow[]): void {
  const brands = part.brands ? unpackNumbers(part.brands) : null;
  const { keys, pages, counts, tops, kinds, volumes, estimates } = part;
  const clicks = unpackNumbers(part.clicks);
  const impressions = unpackNumbers(part.impressions);
  const positionSums = unpackNumbers(part.positionSums);
  for (let index = 0; index < keys.length; index += 1) {
    const row: PeriodRow = { key: keys[index], clicks: clicks[index] ?? 0, impressions: impressions[index] ?? 0, positionSum: positionSums[index] ?? 0 };
    if (pages) row.page = pages[index];
    if (brands) row.brand = brands[index] === 1;
    if (counts) row.count = counts[index] ?? 0;
    if (tops) row.top = tops[index] ?? "";
    if (kinds) row.kind = kinds[index] ?? "UNJUDGED";
    if (volumes) row.volume = volumes[index] ?? UNKNOWN;
    if (estimates) row.estimate = estimates[index] ?? UNKNOWN;
    rows.push(row);
  }
}

/**
 * A stored part read whole as text: its numbers unpacked, its places in its build's book named
 * from the books read whole — for a reader wanting every row's text, and the tests.
 */
export async function periodPartAsText(ctx: { db: QueryCtx["db"] }, part: Doc<"searchConsolePeriods">) {
  const tokened = unpackedPart(withTokens(part));
  if (typeof part.keys !== "string") return tokened;
  const book = { companyWebsiteId: part.companyWebsiteId, ...(part.country === undefined ? {} : { country: part.country }), searchType: part.searchType, builtAt: part.builtAt };
  const texts = { query: textsFrom(await wholeBook(ctx, book, "query")), page: textsFrom(await wholeBook(ctx, book, "page")) };
  const text = (value: string) => (tokenPlace(value)?.kind === "page" ? texts.page(value) : texts.query(value));
  return {
    ...tokened,
    keys: tokened.keys.map(text),
    ...(Array.isArray(tokened.tops) ? { tops: tokened.tops.map(text) } : {}),
    ...(Array.isArray(tokened.pages) ? { pages: tokened.pages.map(text) } : {}),
  };
}

/**
 * The period the background reads judge "lately" by — the keep rule, Your
 * pages' clicks, competing pages: the rolling Last 3 months, which always
 * reaches 90 days back (sees-header-and-rolling-dates-plan.md, part two; it
 * was this quarter and last together until the quarters were retired on
 * 2026-10-29).
 */
export const RECENT_PERIODS = ["last3Months"] as const;
export type RecentPeriod = (typeof RECENT_PERIODS)[number];
export const recentPeriodValidator = v.literal("last3Months");

/** The period whose parts hold a period's rows: itself, or the one it repeats when kept on its very days (`sameDaysAs`). */
export async function holdingPeriod(
  ctx: { db: QueryCtx["db"] },
  scope: { companyWebsiteId: Id<"companyWebsites">; country: string | undefined; searchType: SearchType; list: SearchConsolePeriodList },
  period: SearchConsolePeriod,
): Promise<SearchConsolePeriod> {
  const first = await firstPartOf(ctx, scope.companyWebsiteId, scope.country, scope.searchType, scope.list, period, "NOW");
  const instead = await sameDaysInstead(ctx, scope, period, "NOW", first, first ? 1 : 0);
  return instead ? (instead.period as SearchConsolePeriod) : period;
}
