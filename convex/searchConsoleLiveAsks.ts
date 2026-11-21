import { v, type Infer } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { moduleAction } from "./tenantFunctions";
import { MENU_FEATURES } from "./utils/coreModules";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { askLive, checkedRange } from "./searchConsoleReads";
import { checkedCountry } from "./searchConsoleCountries";
import { checkedLongest, type ConsoleLimits } from "./searchConsoleLimits";
import { searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import { GOOGLE_DIMENSIONS, GOOGLE_MOST_ROWS } from "./searchConsoleApi";
import { bySide, fromGoogle, type Row as PackedRow } from "./utils/searchConsolePacks";
import type { PeriodRow } from "./searchConsolePeriodReads";

/**
 * Search Console's lists asked of Google for any dates (search-console-plan.md §14.3, item 4): the asks themselves, moved
 * here from `searchConsoleLists.ts` on 18 November 2026 as it neared a thousand lines, and each page's keywords asked
 * apart, for a list of pages' download (speed fixes, 18 November 2026).
 */

export type LiveProblem = "NOT_CONNECTED" | "GOOGLE_REFUSED" | "GOOGLE_BUSY";

/** A filter asked of Google with a list: one keyword, one page, one country or one device. */
export type Filter = { dimension: "query" | "page" | "country" | "device" | "searchAppearance"; key: string };

/** The lists a screen reads: keywords, pages, and the short lists of countries, devices and kinds of search appearance. */
export type ListKind = "query" | "page" | "country" | "device" | "appearance";

/**
 * Convex carries at most 8,192 items in one array, between functions and to
 * the screen — so a long list travels in parts of 8,000 and is joined where
 * it is read. One website's live list for one country held 8,833 searches
 * (2026-10-03), and a download of every keyword is longer still.
 */
const PART_ROWS = 8_000;
export function inParts<T>(rows: readonly T[]): T[][] {
  const parts: T[][] = [];
  for (let at = 0; at < rows.length; at += PART_ROWS) parts.push(rows.slice(at, at + PART_ROWS));
  return parts;
}

/** One of Google's lists for any dates, as rows: `everyCountry` asks it of no country, a page's figures (`EVERY_COUNTRY_LISTS`). */
export async function askGoogle(
  ctx: ActionCtx,
  target: { connectionId: Id<"searchConsoleConnections">; property: string },
  searchType: SearchType,
  list: "pair" | "query" | "page" | "country" | "device" | "appearance",
  from: string,
  to: string,
  given: readonly Filter[] = [],
  how: { everyCountry?: boolean } = {},
): Promise<{ ok: true; rows: PackedRow[]; cut: boolean } | { ok: false; problem: LiveProblem }> {
  const filters = how.everyCountry ? given.filter((filter) => filter.dimension !== "country") : given;
  const answer = await askLive(ctx, target, {
    startDate: from,
    endDate: to,
    type: searchType,
    dimensions: [...GOOGLE_DIMENSIONS[list]],
    ...(filters.length > 0
      ? { dimensionFilterGroups: [{ filters: filters.map((filter) => ({ dimension: filter.dimension, operator: "equals", expression: filter.key })) }] }
      : {}),
    // Every keyword with every page is often past Google's 25,000 a page: both its pages asked at once. One keyword's or one
    // page's own pairs are a few hundred.
  }, { ...how, together: list === "pair" && !given.some((filter) => filter.dimension === "query" || filter.dimension === "page") });
  // Google gives at most 50,000 rows an ask: a list that long may have been cut, its fewest clicks left out.
  return answer.ok ? { ok: true, rows: fromGoogle(answer.rows, list === "pair"), cut: answer.rows.length >= GOOGLE_MOST_ROWS } : answer;
}

/** The country filter a live list carries, checked: none for all countries. */
export function countryFilter(country: string | undefined): Filter[] {
  const code = checkedCountry(country);
  return code === undefined ? [] : [{ dimension: "country", key: code }];
}

/** The filters a live list carries: its country and its device. */
export function listFilters(country: string | undefined, device: string | undefined): Filter[] {
  return [...countryFilter(country), ...(device ? [{ dimension: "device" as const, key: device }] : [])];
}

/**
 * A list's rows for any dates, added up as the ready-made periods are:
 * searches from the pairs, pages Google's own — and the pairs, for the views
 * that read them. A list of pages asks for the pairs only with `pageKeywords`:
 * they give each page its keywords and top one, which only its download shows,
 * and the views that read the pairs (speed fixes, 18 November 2026: the pairs
 * were 5.4 of a Pages list's 7.4 seconds for More Handles in October). `pairsCut` and `listCut`: Google's pairs, or the
 * list it answered itself (pages, countries, devices), stopped at its most an ask (`GOOGLE_MOST_ROWS`), the fewest clicks
 * left out, for the screen to say so (review fixes, 18 November 2026). A list of keywords is its pairs.
 */
export async function liveRows(
  ctx: ActionCtx,
  target: { connectionId: Id<"searchConsoleConnections">; property: string },
  searchType: SearchType,
  dimension: ListKind,
  from: string,
  to: string,
  filters: readonly Filter[],
  how: { within?: { kind: "query" | "page"; key: string }; inCountry?: boolean; pageKeywords: boolean },
): Promise<{ ok: true; rows: PeriodRow[]; pairs: PackedRow[]; pairsCut: boolean; listCut: boolean } | { ok: false; problem: LiveProblem }> {
  const { within, inCountry = false } = how;
  if (dimension === "country" || dimension === "device" || dimension === "appearance") {
    const split = await askGoogle(ctx, target, searchType, dimension, from, to, filters);
    return split.ok ? { ok: true, rows: split.rows, pairs: [], pairsCut: false, listCut: split.cut } : split;
  }
  if (within) {
    // One keyword's pages, or one page's keywords: its pairs, keyed by the other side.
    const pairs = await askGoogle(ctx, target, searchType, "pair", from, to, [...filters, { dimension: within.kind, key: within.key }]);
    if (!pairs.ok) return pairs;
    return {
      ok: true,
      rows: pairs.rows.map((pair) => ({ ...pair, key: within.kind === "query" ? (pair.page ?? "") : pair.key, page: undefined })),
      pairs: pairs.rows,
      pairsCut: pairs.cut,
      listCut: false,
    };
  }
  // A list of pages asks for its pages beside the pairs, at the same time: the pages of every country, their searches the
  // country's (`EVERY_COUNTRY_LISTS`), or both the country's (`inCountry`, Pages since 18 November 2026).
  const withPairs = dimension === "query" || how.pageKeywords;
  // A list of keywords asks Google for each search alone beside the pairs (fix 1, 21 November 2026): a search's own figures
  // as Google counts it, once however many pages it showed; the pairs give its pages and top page.
  const [pairs, pages, searches] = await Promise.all([
    withPairs ? askGoogle(ctx, target, searchType, "pair", from, to, filters) : null,
    dimension === "page" ? askGoogle(ctx, target, searchType, "page", from, to, filters, { everyCountry: !inCountry }) : null,
    dimension === "query" ? askGoogle(ctx, target, searchType, "query", from, to, filters) : null,
  ]);
  if (pairs && !pairs.ok) return pairs;
  if (searches && !searches.ok) return searches;
  if (!pages) {
    if (!pairs) return { ok: true, rows: [], pairs: [], pairsCut: false, listCut: false };
    const side = bySide(pairs.rows, "query");
    // A list of keywords: every keyword Google answered, its figures its own, its pages counted from the pairs.
    if (searches) {
      return {
        ok: true,
        rows: searches.rows.map((row) => ({ ...row, count: side.get(row.key)?.count ?? 0, top: side.get(row.key)?.top ?? "" })),
        pairs: pairs.rows,
        pairsCut: pairs.cut,
        listCut: searches.cut,
      };
    }
    return { ok: true, rows: [...side.values()].map((summed) => ({ ...summed })), pairs: pairs.rows, pairsCut: pairs.cut, listCut: false };
  }
  if (!pages.ok) return pages;
  if (!pairs) return { ok: true, rows: pages.rows, pairs: [], pairsCut: false, listCut: pages.cut };
  const side = bySide(pairs.rows, "page");
  return {
    ok: true,
    rows: pages.rows.map((row) => ({ ...row, count: side.get(row.key)?.count ?? 0, top: side.get(row.key)?.top ?? "" })),
    pairs: pairs.rows,
    pairsCut: pairs.cut,
    listCut: pages.cut,
  };
}

const pageKeywordsAnswer = v.union(
  v.object({
    ok: v.literal(true),
    /** In parts of 8,000 (`inParts`): each page Google tied a search to, its keywords and the one with most clicks. */
    pages: v.array(v.array(v.object({ key: v.string(), count: v.number(), top: v.string() }))),
    /** Google's pairs stopped at its most an ask (`GOOGLE_MOST_ROWS`): the download says so. */
    pairsCut: v.optional(v.number()),
  }),
  v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
);

/**
 * Each page's keywords and its top one, for a list of pages asked of Google without them (`keywordsApart`): asked when
 * the list is downloaded, the only place they show (Pages and Tracked pages' Keywords and Top keyword columns), with the
 * list's own dates, country and device. One ask of Google's pairs: two requests for More Handles in October.
 */
export const searchConsoleLivePageKeywords = moduleAction({
  module: MENU_FEATURES.searchConsole,
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    from: v.string(),
    to: v.string(),
    country: v.optional(v.string()),
    device: v.optional(v.string()),
  },
  returns: pageKeywordsAnswer,
  handler: async (ctx, args): Promise<Infer<typeof pageKeywordsAnswer>> => {
    checkedRange(args.from, args.to);
    const filters = listFilters(args.country, args.device);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target: { connectionId: Id<"searchConsoleConnections">; property: string; limits: ConsoleLimits } | null =
      await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: null });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    checkedLongest(args.from, args.to, target.limits);
    const pairs = await askGoogle(ctx, target, args.searchType, "pair", args.from, args.to, filters);
    if (!pairs.ok) return pairs;
    const pages = [...bySide(pairs.rows, "page").values()].map((page) => ({ key: page.key, count: page.count ?? 0, top: page.top ?? "" }));
    return { ok: true as const, pages: inParts(pages), ...(pairs.cut ? { pairsCut: GOOGLE_MOST_ROWS } : {}) };
  },
});
