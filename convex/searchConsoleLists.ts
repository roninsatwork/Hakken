import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tenantAction, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { requireMySite } from "./siteAccess";
import { listOrder, listPageArgs, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { SEARCH_CONSOLE_PERIODS, searchTypeValidator, type SearchConsolePeriod, type SearchType } from "./searchConsoleSchema";
import { askLive, checkedRange, countryFilters } from "./searchConsoleReads";
import { checkedCountry, countryScope, type CountryScope } from "./searchConsoleCountries";
import { daysIn, historyLimitDay, periodBefore } from "./searchConsoleDays";
import { readPeriod, type PeriodRow } from "./searchConsolePeriods";
import { factsFor } from "./searchConsoleFacts";
import { holdBrandNames } from "./holdProfiles";
import { loadSite } from "./websiteSiteRows";
import {
  BANDS,
  VIEWS,
  VIEW_LIST,
  applyView,
  ctrCurve,
  filterRows,
  pagesByKeyword,
  shapeRows,
  summarise,
  withGone,
  type Filters,
  type ListRow,
  type SitesKeyword,
  type Summary,
  type View,
  type ViewContext,
} from "./utils/searchConsoleViews";
import { trackedKeys } from "./searchConsoleTracking";
import { GOOGLE_DIMENSIONS } from "./searchConsoleApi";
import { bySide, fromGoogle, positionOf, type Row as PackedRow } from "./utils/searchConsolePacks";

/**
 * What the Search Console lists read (docs/plans/active/search-console-plan.md
 * §14.3, items 4 and 9): a website's ready-made period — one record, or a few
 * for a long list — read by index, then searched, filtered, sorted and paged
 * here on the server, so the browser is sent only the page of rows it shows.
 * Nothing here adds up days: that is done once after each collection
 * (`searchConsolePeriods.ts`).
 *
 * The dates a screen asks for are a ready-made period when they end on the
 * newest day held and span 7, 30 or 90 days or 12 months; any other dates are
 * asked of Google when chosen (`searchConsoleLiveList`), free, nothing kept.
 *
 * Every read finds the site through the caller's own hold (`requireMySite`):
 * Google's figures for a website are its company's, never another's holding
 * the same host.
 *
 * A list may be of one country (§16): one the website keeps ready reads that
 * country's own ready-made periods, as quick as all countries; any other —
 * or one just added, before its first collection — is `live`, asked of
 * Google with the country filter, as other dates are.
 */

/** Rows a list holds: the 25,000 with the most clicks; past this the footer says the list is longer. */
const MOST_ROWS = 25_000;
/**
 * Convex carries at most 8,192 items in one array, between functions and to
 * the screen — so a long list travels in parts of 8,000 and is joined where
 * it is read. One website's live list for one country held 8,833 searches
 * (2026-10-03), and a download of every keyword is longer still.
 */
const PART_ROWS = 8_000;
function inParts<T>(rows: readonly T[]): T[][] {
  const parts: T[][] = [];
  for (let at = 0; at < rows.length; at += PART_ROWS) parts.push(rows.slice(at, at + PART_ROWS));
  return parts;
}

/** Rows a short list (countries, devices, kinds of search appearance) holds whole. */
const SPLIT_ROWS = 500;

/** Periods whose keyword-and-page pairs are asked of Google rather than read whole. */
export const LONG_PERIODS: readonly SearchConsolePeriod[] = ["90", "365"];

/** Missed demand reads the website's most-searched keywords in Sites, this many at most. */
const SITES_KEYWORDS_READ = 500;

const listKindValidator = v.union(v.literal("query"), v.literal("page"), v.literal("country"), v.literal("device"), v.literal("appearance"));
type ListKind = "query" | "page" | "country" | "device" | "appearance";

const viewValidator = v.optional(v.union(...VIEWS.map((view) => v.literal(view))));

const nullable = (validator: ReturnType<typeof v.number> | ReturnType<typeof v.string> | ReturnType<typeof v.boolean>) => v.union(validator, v.null());

const rowValidator = v.object({
  key: v.string(),
  clicks: v.number(),
  impressions: v.number(),
  ctr: v.number(),
  position: v.number(),
  band: v.union(...BANDS.map((band) => v.literal(band))),
  previousClicks: nullable(v.number()),
  change: nullable(v.number()),
  previousPosition: nullable(v.number()),
  positionChange: nullable(v.number()),
  share: v.number(),
  count: nullable(v.number()),
  top: nullable(v.string()),
  tracked: v.boolean(),
  kind: nullable(v.string()),
  volume: nullable(v.number()),
  estimate: nullable(v.number()),
  brand: nullable(v.boolean()),
  usualCtr: nullable(v.number()),
  expected: nullable(v.number()),
  topShare: nullable(v.number()),
  next: nullable(v.string()),
  nextShare: nullable(v.number()),
  verdict: v.union(v.literal("high"), v.literal("low"), v.literal("close"), v.null()),
  gap: nullable(v.number()),
});

/** The headings a list orders by, each the best first on its first press. */
export const SORT_KEYS = [
  "key", "clicks", "change", "impressions", "ctr", "position", "positionChange", "share", "count", "top",
  "volume", "estimate", "kind", "brand", "usualCtr", "expected", "topShare", "next", "nextShare", "gap",
] as const;
type SortKey = (typeof SORT_KEYS)[number];
const SORTS: ListSorts<ListRow, SortKey> = {
  key: { value: (row) => row.key, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
  positionChange: { value: (row) => row.positionChange, first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
  count: { value: (row) => row.count, first: "desc" },
  top: { value: (row) => row.top, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  estimate: { value: (row) => row.estimate, first: "desc" },
  kind: { value: (row) => row.kind, first: "asc" },
  brand: { value: (row) => (row.brand === null ? null : row.brand ? 0 : 1), first: "asc" },
  usualCtr: { value: (row) => row.usualCtr, first: "desc" },
  expected: { value: (row) => row.expected, first: "desc" },
  topShare: { value: (row) => row.topShare, first: "desc" },
  next: { value: (row) => row.next, first: "asc" },
  nextShare: { value: (row) => row.nextShare, first: "desc" },
  gap: { value: (row) => row.gap, first: "desc" },
};
const sortValidator = v.optional(v.union(...SORT_KEYS.map((key) => v.literal(key))));

const brandSplitValidator = v.object({ brandClicks: v.number(), nonBrandClicks: v.number(), brandImpressions: v.number(), nonBrandImpressions: v.number() });

/** What a page's hero boxes read: figures over every row its rule lists (`summarise`). */
const summaryValidator = v.object({
  rows: v.number(),
  of: v.number(),
  clicks: v.number(),
  impressions: v.number(),
  tracked: v.number(),
  gaining: v.number(),
  losing: v.number(),
  gained: v.number(),
  lost: v.number(),
  volume: v.number(),
  estimate: v.number(),
  expected: v.number(),
  high: v.number(),
  low: v.number(),
  pagesInvolved: v.union(v.number(), v.null()),
  pagesShown: v.union(v.number(), v.null()),
  bands: v.record(v.string(), v.number()),
  bandsBefore: v.union(v.record(v.string(), v.number()), v.null()),
  brand: v.union(v.null(), v.object({ now: brandSplitValidator, before: v.union(brandSplitValidator, v.null()) })),
  kinds: v.array(v.object({ kind: v.string(), rows: v.number(), clicks: v.number() })),
});

const filterArgs = {
  q: v.optional(v.string()),
  /** "yes": only the tracked; "no": only the rest. */
  tracked: v.optional(v.union(v.literal("yes"), v.literal("no"))),
  band: v.optional(v.union(...BANDS.map((band) => v.literal(band)))),
  /** An intent or a page type, as Sites words them. */
  kind: v.optional(v.string()),
  brand: v.optional(v.union(v.literal("yes"), v.literal("no"))),
  move: v.optional(v.union(v.literal("win"), v.literal("loss"))),
  verdict: v.optional(v.union(v.literal("high"), v.literal("low"), v.literal("close"))),
  /** Missed demand's two lists. */
  missed: v.optional(v.union(v.literal("searched"), v.literal("untracked"))),
};

/** One keyword's pages, or one page's keywords: the pairs that hold it. */
const withinValidator = v.optional(v.object({ kind: v.union(v.literal("query"), v.literal("page")), key: v.string() }));

const listArgs = {
  siteId: v.id("companyWebsites"),
  searchType: searchTypeValidator,
  dimension: listKindValidator,
  view: viewValidator,
  within: withinValidator,
  from: v.string(),
  to: v.string(),
  /** One country, Google's `gbr`; missing for all countries. */
  country: v.optional(v.string()),
  ...filterArgs,
  sort: sortValidator,
  direction: sortDirectionArg,
};

type Ask = {
  searchType: SearchType;
  dimension: ListKind;
  view?: View;
  within?: { kind: "query" | "page"; key: string };
  from: string;
  to: string;
  country?: string;
  sort?: SortKey;
  direction?: "asc" | "desc";
  missed?: "searched" | "untracked";
} & Filters;

async function connectionOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

/** The ready-made period the dates are, or null when they are other dates (asked of Google instead). */
export function periodOf(from: string, to: string, newestDay: string | undefined): SearchConsolePeriod | null {
  if (!newestDay || to !== newestDay) return null;
  const days = String(daysIn(from, to));
  return (SEARCH_CONSOLE_PERIODS as readonly string[]).includes(days) ? (days as SearchConsolePeriod) : null;
}

/** The company's tracked searches or pages on this website, read by its hold. */
async function trackedOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, kind: "query" | "page"): Promise<Set<string>> {
  return new Set(await trackedKeys(ctx, companyWebsiteId, kind));
}

/** The website's brand words, from its Profile: names and misspellings alike. */
async function brandWordsOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">): Promise<string[]> {
  return (await holdBrandNames(ctx, companyWebsiteId)).map((brand) => brand.name);
}

/** The website's most-searched keywords in Sites, for Missed demand. */
async function sitesKeywordsOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">): Promise<SitesKeyword[]> {
  const site = await loadSite(ctx, companyWebsiteId);
  if (!site) return [];
  const rows = await ctx.db
    .query("siteKeywordRanks")
    .withIndex("by_site_volume", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place))
    .order("desc")
    .take(SITES_KEYWORDS_READ);
  return rows.filter((row) => row.volumeKnown).map((row) => ({ keyword: row.keyword, volume: row.volume, kind: row.intent }));
}

/**
 * The pairs holding one keyword or one page, as rows keyed by the other
 * side: a page's keywords, or a keyword's pages — each with how many pages
 * (or keywords) it has across the whole website.
 */
async function pairsWithin(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
  within: { kind: "query" | "page"; key: string },
  country: string | undefined,
): Promise<{ from: string; to: string; rows: PeriodRow[] } | null> {
  const pairs = await readPeriod(ctx, companyWebsiteId, searchType, "pair", period, which, country);
  if (!pairs) return null;
  const other = within.kind === "query" ? "page" : "query";
  const counted = which === "NOW" ? await readPeriod(ctx, companyWebsiteId, searchType, other, period, "NOW", country) : null;
  const counts = new Map((counted?.rows ?? []).map((row) => [row.key, row]));
  const rows = pairs.rows.flatMap((pair): PeriodRow[] => {
    const mine = within.kind === "query" ? pair.key : pair.page;
    if (mine !== within.key) return [];
    const key = within.kind === "query" ? (pair.page ?? "") : pair.key;
    const whole = counts.get(key);
    return [{
      key,
      clicks: pair.clicks,
      impressions: pair.impressions,
      positionSum: pair.positionSum,
      ...(whole?.count !== undefined ? { count: whole.count } : {}),
      ...(whole?.kind !== undefined ? { kind: whole.kind } : {}),
      ...(whole?.volume !== undefined ? { volume: whole.volume } : {}),
      ...(whole?.estimate !== undefined ? { estimate: whole.estimate } : {}),
    }];
  });
  return { from: pairs.from, to: pairs.to, rows };
}

/** Ordered over the whole list by the heading pressed. */
export function sortRows(rows: ListRow[], sort: SortKey | undefined, direction: "asc" | "desc" | undefined): ListRow[] {
  return rows.sort(listOrder(SORTS, sort ?? "clicks", direction, (row) => row.key));
}

type ListAnswer = {
  rows: ListRow[];
  cut: number | null;
  /** The days the list counts, as held: a 12-month period of a website held for less says so. */
  from: string | null;
  to: string | null;
  /** Clicks of every row the page's rule lists, before searching or filtering. */
  named: number | null;
  /** Rows the page's rule lists, before searching or filtering. */
  listed: number;
  /** Whether the period before is held, so the change can be shown. */
  comparable: boolean;
  /** Other dates than a ready-made period: asked of Google instead. */
  live: boolean;
  /** Connected but nothing built yet. */
  preparing: boolean;
  /** The hero boxes' figures; null when nothing is listed yet. */
  summary: Summary | null;
};

/**
 * A ready-made list, shaped, put through the page's rule, searched, filtered
 * and ordered — or what to say instead — for all countries or one country
 * kept ready. Exported for its load test.
 */
export async function readList(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, args: Ask): Promise<ListAnswer> {
  checkedCountry(args.country);
  const empty = { rows: [], cut: null, from: null, to: null, named: null, listed: 0, comparable: false, summary: null };
  const live = { ...empty, live: true, preparing: false };
  const connection = await connectionOf(ctx, companyWebsiteId);
  if (!connection?.newestDay) return { ...empty, live: false, preparing: false };
  let scope: CountryScope = { read: "ALL" };
  if (args.country !== undefined) {
    const hold = await ctx.db.get(companyWebsiteId);
    if (!hold) return { ...empty, live: false, preparing: false };
    scope = await countryScope(ctx, hold, connection, args.country);
  }
  // A country not kept ready, or not yet collected: asked of Google with its filter.
  if (scope.read === "LIVE") return live;
  const country = scope.read === "KEPT" ? scope.country : undefined;
  const period = periodOf(args.from, args.to, scope.read === "KEPT" ? scope.newestDay : connection.newestDay);
  if (!period) return live;
  const view = args.view ?? "all";
  const within = args.within;
  // A whole period of keyword-and-page pairs is too much to read for 90 days or 12 months: those are asked of Google.
  if ((within || view === "competing") && LONG_PERIODS.includes(period)) return live;
  // One keyword's pages are rows keyed by page, one page's keywords by keyword.
  const dimension = within ? (within.kind === "query" ? "page" : "query") : (VIEW_LIST[view] ?? args.dimension);
  // A country keeps no country list of its own: Google answers it, filtered to that one country.
  if (country !== undefined && dimension === "country") return live;
  const read = async (which: "NOW" | "BEFORE") => (within
    ? await pairsWithin(ctx, companyWebsiteId, args.searchType, period, which, within, country)
    : await readPeriod(ctx, companyWebsiteId, args.searchType, dimension, period, which, country));
  const now = await read("NOW");
  if (!now) return { ...empty, live: false, preparing: true };
  const before = await read("BEFORE");
  const tracked = dimension === "query" || dimension === "page" ? await trackedOf(ctx, companyWebsiteId, dimension) : new Set<string>();
  const brandWords = dimension === "query" ? await brandWordsOf(ctx, companyWebsiteId) : null;
  const shaped = shapeRows(view === "moves" ? withGone(now.rows, before?.rows ?? null) : now.rows, before?.rows ?? null, { tracked, brandWords });
  const context: ViewContext = { missedList: args.missed ?? "searched", tracked, days: daysIn(args.from, args.to) };
  if (view === "lowCtr") {
    const keywords = await readPeriod(ctx, companyWebsiteId, args.searchType, "query", period, "NOW", country);
    context.curve = ctrCurve((keywords?.rows ?? []).map((row) => ({ clicks: row.clicks, impressions: row.impressions, position: positionOf(row) ?? 0 })));
  }
  if (view === "competing") {
    const pairs = await readPeriod(ctx, companyWebsiteId, args.searchType, "pair", period, "NOW", country);
    context.pages = pagesByKeyword(pairs?.rows ?? []);
  }
  if (view === "missed" && context.missedList === "searched") context.sitesKeywords = await sitesKeywordsOf(ctx, companyWebsiteId);
  const listed = applyView(view, shaped, context);
  const named = listed.reduce((sum, row) => sum + row.clicks, 0);
  const summary = summarise(listed, shaped, before?.rows ?? null, { ...context, brandWords });
  const sorted = sortRows(filterRows(listed, args), args.sort, args.direction);
  const cut = sorted.length > MOST_ROWS ? MOST_ROWS : null;
  return {
    rows: cut ? sorted.slice(0, MOST_ROWS) : sorted,
    cut,
    from: now.from,
    to: now.to,
    named,
    listed: listed.length,
    comparable: before !== null,
    live: false,
    preparing: false,
    summary,
  };
}

const answerFacts = {
  current: v.boolean(),
  named: v.union(v.number(), v.null()),
  /** Rows the page's rule lists before any search or filter: the "of" in "12 of 268 pages". */
  listed: v.number(),
  comparable: v.boolean(),
  live: v.boolean(),
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
};

/**
 * One page of a list, counted exactly (Keywords, Pages). `preparing` while a
 * newly connected website's periods are first being built; `live` when the
 * dates are not a ready-made period, or the country is not kept ready — the
 * page then asks Google for them (`searchConsoleLiveList`).
 */
export const searchConsoleListPage = tenantQuery({
  args: { ...listArgs, ...listPageArgs },
  returns: v.object({
    rows: v.array(rowValidator),
    total: v.number(),
    page: v.number(),
    pages: v.number(),
    size: v.number(),
    cut: v.union(v.number(), v.null()),
    preparing: v.boolean(),
    summary: v.union(summaryValidator, v.null()),
    ...answerFacts,
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const list = await readList(ctx, site.hold._id, args);
    const page = pageOfList(list.rows, args.page, args.rows, list.cut);
    return {
      ...page,
      preparing: list.preparing,
      summary: list.summary,
      current: true,
      named: list.named,
      listed: list.listed,
      comparable: list.comparable,
      live: list.live,
      from: list.from,
      to: list.to,
    };
  },
});

/**
 * A short list whole — countries, devices, kinds of search appearance — for
 * a page holding several tables. With a country, its devices and kinds of
 * search appearance; its countries are asked of Google (`live`): a country
 * keeps no country list of its own.
 */
export const searchConsoleSplitList = tenantQuery({
  args: listArgs,
  returns: v.object({ rows: v.array(rowValidator), preparing: v.boolean(), ...answerFacts }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const list = await readList(ctx, site.hold._id, args);
    return { rows: list.rows.slice(0, SPLIT_ROWS), preparing: list.preparing, current: true, named: list.named, listed: list.listed, comparable: list.comparable, live: list.live, from: list.from, to: list.to };
  },
});

// ---------------------------------------------------------------------------
// Other dates: asked of Google when chosen (§14.3, item 4)
// ---------------------------------------------------------------------------

export const liveTarget = internalQuery({
  args: { companyId: v.id("companies"), siteId: v.id("companyWebsites"), kind: v.union(v.literal("query"), v.literal("page"), v.null()), view: viewValidator },
  returns: v.union(v.null(), v.object({
    connectionId: v.id("searchConsoleConnections"),
    property: v.string(),
    host: v.string(),
    facts: v.union(v.null(), v.object({ websiteId: v.id("websites"), place: v.number() })),
    tracked: v.array(v.string()),
    brandWords: v.union(v.array(v.string()), v.null()),
    sitesKeywords: v.array(v.object({ keyword: v.string(), volume: v.number(), kind: v.string() })),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId) return null;
    const connection = await connectionOf(ctx, hold._id);
    if (!connection || connection.status !== "CONNECTED" || !connection.property) return null;
    const website = await ctx.db.get(hold.websiteId);
    const tracked = args.kind ? [...(await trackedOf(ctx, hold._id, args.kind))] : [];
    const site = await loadSite(ctx, hold._id);
    return {
      connectionId: connection._id,
      property: connection.property,
      host: website?.displayHost ?? "site",
      facts: site ? { websiteId: site.website._id, place: site.place } : null,
      tracked,
      brandWords: args.kind === "query" ? await brandWordsOf(ctx, hold._id) : null,
      sitesKeywords: args.view === "missed" ? await sitesKeywordsOf(ctx, hold._id) : [],
    };
  },
});

type LiveProblem = "NOT_CONNECTED" | "GOOGLE_REFUSED" | "GOOGLE_BUSY";

/** What a live ask needs of the website: written out, as the actions in this file read it through `internal`. */
type LiveTarget = {
  connectionId: Id<"searchConsoleConnections">;
  property: string;
  host: string;
  facts: { websiteId: Id<"websites">; place: number } | null;
  tracked: string[];
  brandWords: string[] | null;
  sitesKeywords: SitesKeyword[];
};

type LiveListAnswer =
  | { ok: true; rows: ListRow[][]; cut: number | null; named: number; comparable: boolean; summary: Summary }
  | { ok: false; problem: LiveProblem };

/** A filter asked of Google with a list: one keyword, one page, one country or one device. */
type Filter = { dimension: "query" | "page" | "country" | "device" | "searchAppearance"; key: string };

/** One of Google's lists for any dates, as rows a list adds up: the pairs, or the one split asked. */
async function askGoogle(
  ctx: ActionCtx,
  target: { connectionId: Id<"searchConsoleConnections">; property: string },
  searchType: SearchType,
  list: "pair" | "page" | "country" | "device" | "appearance",
  from: string,
  to: string,
  filters: readonly Filter[] = [],
): Promise<{ ok: true; rows: PackedRow[] } | { ok: false; problem: LiveProblem }> {
  const answer = await askLive(ctx, target, {
    startDate: from,
    endDate: to,
    type: searchType,
    dimensions: [...GOOGLE_DIMENSIONS[list]],
    ...(filters.length > 0
      ? { dimensionFilterGroups: [{ filters: filters.map((filter) => ({ dimension: filter.dimension, operator: "equals", expression: filter.key })) }] }
      : {}),
  });
  return answer.ok ? { ok: true, rows: fromGoogle(answer.rows, list === "pair") } : answer;
}

/** The country filter a live list carries, checked: none for all countries. */
function countryFilter(country: string | undefined): Filter[] {
  const code = checkedCountry(country);
  return code === undefined ? [] : [{ dimension: "country", key: code }];
}


/**
 * A list's rows for any dates, added up as the ready-made periods are:
 * searches from the pairs, pages Google's own — and the pairs, for the views
 * that read them.
 */
async function liveRows(
  ctx: ActionCtx,
  target: { connectionId: Id<"searchConsoleConnections">; property: string },
  searchType: SearchType,
  dimension: ListKind,
  from: string,
  to: string,
  filters: readonly Filter[],
  within?: { kind: "query" | "page"; key: string },
): Promise<{ ok: true; rows: PeriodRow[]; pairs: PackedRow[] } | { ok: false; problem: LiveProblem }> {
  if (dimension === "country" || dimension === "device" || dimension === "appearance") {
    const split = await askGoogle(ctx, target, searchType, dimension, from, to, filters);
    return split.ok ? { ...split, pairs: [] } : split;
  }
  if (within) {
    // One keyword's pages, or one page's keywords: its pairs, keyed by the other side.
    const pairs = await askGoogle(ctx, target, searchType, "pair", from, to, [...filters, { dimension: within.kind, key: within.key }]);
    if (!pairs.ok) return pairs;
    return {
      ok: true,
      rows: pairs.rows.map((pair) => ({ ...pair, key: within.kind === "query" ? (pair.page ?? "") : pair.key, page: undefined })),
      pairs: pairs.rows,
    };
  }
  const pairs = await askGoogle(ctx, target, searchType, "pair", from, to, filters);
  if (!pairs.ok) return pairs;
  const side = bySide(pairs.rows, dimension);
  if (dimension === "query") return { ok: true, rows: [...side.values()].map((summed) => ({ ...summed })), pairs: pairs.rows };
  const pages = await askGoogle(ctx, target, searchType, "page", from, to, filters);
  if (!pages.ok) return pages;
  return {
    ok: true,
    rows: pages.rows.map((row) => ({ ...row, count: side.get(row.key)?.count ?? 0, top: side.get(row.key)?.top ?? "" })),
    pairs: pairs.rows,
  };
}

/** Rows of a live list Sites' facts are looked up for: the most clicks first. */
const LIVE_FACTS_ROWS = 5_000;

/** A live list's rows with Sites' intent and searches a month, or page type and estimated visits, beside the first few thousand. */
async function withFacts(
  ctx: ActionCtx,
  target: { websiteId: Id<"websites">; place: number },
  kind: "query" | "page",
  rows: PeriodRow[],
): Promise<PeriodRow[]> {
  const keys = [...rows].sort((left, right) => right.clicks - left.clicks).slice(0, LIVE_FACTS_ROWS).map((row) => row.key);
  const facts = await factsFor(ctx, target, kind, keys);
  return rows.map((row) => {
    const known = facts.get(row.key);
    if (!known) return row;
    return { ...row, kind: known.kind, ...(kind === "query" ? { volume: known.number } : { estimate: known.number }) };
  });
}

/**
 * A list for dates that are not a ready-made period — or for one country or
 * device — asked of Google when chosen and sent whole, put through the
 * page's rule, for the page to search, filter, order and page itself: with
 * the period before for the change. Sites' facts are not looked up for it.
 */
export const searchConsoleLiveList = tenantAction({
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: listKindValidator,
    view: viewValidator,
    within: withinValidator,
    missed: v.optional(v.union(v.literal("searched"), v.literal("untracked"))),
    from: v.string(),
    to: v.string(),
    country: v.optional(v.string()),
    device: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      /** In parts of 8,000 (`PART_ROWS`): join them to read the list. */
      rows: v.array(v.array(rowValidator)),
      cut: v.union(v.number(), v.null()),
      named: v.number(),
      comparable: v.boolean(),
      summary: summaryValidator,
    }),
    v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
  ),
  handler: async (ctx, args): Promise<LiveListAnswer> => {
    checkedRange(args.from, args.to);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const view = args.view ?? "all";
    const within = args.within;
    const dimension = within ? (within.kind === "query" ? "page" : "query") : (VIEW_LIST[view] ?? args.dimension);
    const kind = dimension === "query" || dimension === "page" ? dimension : null;
    const filters: Filter[] = [
      ...countryFilter(args.country),
      ...(args.device ? [{ dimension: "device" as const, key: args.device }] : []),
    ];
    const target: LiveTarget | null = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind, view });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    const now = await liveRows(ctx, target, args.searchType, dimension, args.from, args.to, filters, within);
    if (!now.ok) return now;
    const before = periodBefore(args.from, args.to);
    // Google keeps sixteen months: days before it would read as nothing, not as a fall.
    const earlier = before.from >= historyLimitDay(Date.now())
      ? await liveRows(ctx, target, args.searchType, dimension, before.from, before.to, filters, within)
      : { ok: false as const, problem: "GOOGLE_REFUSED" as const };
    // Sites' facts beside the rows with the most clicks, as the ready-made periods carry them.
    const rows = kind && target.facts ? await withFacts(ctx, target.facts, kind, now.rows) : now.rows;
    const tracked = new Set(target.tracked);
    const earlierRows = earlier.ok ? earlier.rows : null;
    const shaped = shapeRows(view === "moves" ? withGone(rows, earlierRows) : rows, earlierRows, { tracked, brandWords: target.brandWords });
    const context: ViewContext = { missedList: args.missed ?? "searched", sitesKeywords: target.sitesKeywords, tracked, days: daysIn(args.from, args.to) };
    if (view === "lowCtr") {
      const keywords = [...bySide(now.pairs, "query").values()];
      context.curve = ctrCurve(keywords.map((row) => ({ clicks: row.clicks, impressions: row.impressions, position: positionOf(row) ?? 0 })));
    }
    if (view === "competing") context.pages = pagesByKeyword(now.pairs);
    const listed = applyView(view, shaped, context);
    const sorted = sortRows(listed, undefined, undefined);
    const named = listed.reduce((sum, row) => sum + row.clicks, 0);
    const summary = summarise(listed, shaped, earlierRows, { ...context, brandWords: target.brandWords });
    return { ok: true as const, rows: inParts(sorted.slice(0, MOST_ROWS)), cut: sorted.length > MOST_ROWS ? MOST_ROWS : null, named, comparable: earlier.ok, summary };
  },
});

const splitRowValidator = v.object({ key: v.string(), clicks: v.number(), impressions: v.number(), share: v.number() });

/** Kinds of rich result one ask counts the pages of, at most. */
const APPEARANCES_ASKED = 20;

/**
 * How many of the website's pages Google showed in each kind of rich result
 * (Rich results, drawn as "16 · Rich results") — in one country, when one is
 * named: Google will not list a kind beside its pages, so each kind's pages
 * are asked for on their own when the page opens.
 */
export const searchConsoleAppearancePages = tenantAction({
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    from: v.string(),
    to: v.string(),
    kinds: v.array(v.string()),
    country: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), pages: v.array(v.object({ kind: v.string(), pages: v.number() })) }),
    v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
  ),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const inCountry = countryFilter(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: null });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    const pages: { kind: string; pages: number }[] = [];
    for (const kind of args.kinds.slice(0, APPEARANCES_ASKED)) {
      const answer = await askGoogle(ctx, target, args.searchType, "page", args.from, args.to, [{ dimension: "searchAppearance", key: kind }, ...inCountry]);
      if (!answer.ok) return answer;
      pages.push({ kind, pages: answer.rows.length });
    }
    return { ok: true as const, pages };
  },
});

/**
 * Where one keyword's or one page's clicks came from: its countries and
 * devices, asked of Google when its screen opens. With a country chosen its
 * devices follow it; its countries are every country still, as on Countries
 * and devices (§16).
 */
export const searchConsoleKeySplits = tenantAction({
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: v.union(v.literal("query"), v.literal("page")),
    key: v.string(),
    from: v.string(),
    to: v.string(),
    country: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), countries: v.array(splitRowValidator), devices: v.array(splitRowValidator) }),
    v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
  ),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const inCountry = countryFilter(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: null });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    const filters: Filter[] = [{ dimension: args.dimension, key: args.key }];
    const countries = await askGoogle(ctx, target, args.searchType, "country", args.from, args.to, filters);
    if (!countries.ok) return countries;
    const devices = await askGoogle(ctx, target, args.searchType, "device", args.from, args.to, [...filters, ...inCountry]);
    if (!devices.ok) return devices;
    const shaped = (rows: PackedRow[]) => {
      const total = rows.reduce((sum, row) => sum + row.clicks, 0);
      return rows
        .map((row) => ({ key: row.key, clicks: row.clicks, impressions: row.impressions, share: total > 0 ? row.clicks / total : 0 }))
        .sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions);
    };
    return { ok: true as const, countries: shaped(countries.rows), devices: shaped(devices.rows) };
  },
});

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

/** Every row of a ready-made list in the order on screen, for its download: only a hold of the caller's company. */
export const exportRows = internalQuery({
  args: { ...listArgs, companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId) return null;
    const website = await ctx.db.get(hold.websiteId);
    const list = await readList(ctx, hold._id, args);
    return { host: website?.displayHost ?? "site", rows: inParts(list.rows), cut: list.cut };
  },
});

/** The figures a download can hold, by the row's own names. */
const EXPORT_FIELDS = [
  "key", "clicks", "change", "impressions", "ctr", "position", "positionChange", "count", "top", "tracked", "kind",
  "volume", "estimate", "brand", "usualCtr", "expected", "topShare", "next", "nextShare", "verdict", "gap", "previousClicks", "previousPosition",
] as const;
type ExportField = (typeof EXPORT_FIELDS)[number];

/** A figure as a spreadsheet reads it: rates in per cent, positions to one place. */
function exportValue(row: ListRow, field: ExportField): string | number | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "yes" : "";
  if (typeof value === "string") return value;
  if (field === "ctr" || field === "usualCtr" || field === "topShare" || field === "nextShare") return Math.round(value * 10_000) / 100;
  if (field === "position" || field === "positionChange" || field === "previousPosition") return Math.round(value * 10) / 10;
  return value;
}

/** A cell of a download: quoted where needed, and never read as a formula by a spreadsheet. */
function cell(value: string | number | null): string {
  if (value === null) return "";
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A list whole, as CSV, built here and returned for the page to save — in the
 * order and with the search on screen. `headers` are the page's own words for
 * its columns, in the reader's language.
 */
export const exportSearchConsoleList = tenantAction({
  args: {
    ...listArgs,
    headers: v.array(v.string()),
    /** The row's figure under each heading, in the same order. */
    fields: v.array(v.union(...EXPORT_FIELDS.map((field) => v.literal(field)))),
  },
  returns: v.object({ fileName: v.string(), csv: v.string(), rows: v.number(), cut: v.union(v.number(), v.null()) }),
  handler: async (ctx, args): Promise<{ fileName: string; csv: string; rows: number; cut: number | null }> => {
    checkedRange(args.from, args.to);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const { headers, fields, ...list } = args;
    const found = await ctx.runQuery(internal.searchConsoleLists.exportRows, { ...list, companyId });
    if (!found) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const lines = found.rows.flat().map((row) => fields.map((field) => cell(exportValue(row, field))).join(","));
    return {
      fileName: `${found.host}-search-console-${args.view && args.view !== "all" ? args.view : args.dimension}-${args.from}-${args.to}.csv`,
      csv: [headers.map(cell).join(","), ...lines].join("\n"),
      rows: lines.length,
      cut: found.cut,
    };
  },
});

// ---------------------------------------------------------------------------
// One search or page over time: asked of Google when its screen opens (§14.3, item 5)
// ---------------------------------------------------------------------------

const dayValidator = v.object({ day: v.string(), clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() });
const figuresValidator = v.object({ clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() });

/** Figures added up from days: position weighted by impressions, as Google's own. */
function totalsOf(days: readonly { clicks: number; impressions: number; position: number }[]) {
  if (days.length === 0) return null;
  const clicks = days.reduce((sum, day) => sum + day.clicks, 0);
  const impressions = days.reduce((sum, day) => sum + day.impressions, 0);
  const positionSum = days.reduce((sum, day) => sum + day.position * day.impressions, 0);
  return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position: impressions > 0 ? positionSum / impressions : 0 };
}

/**
 * One search's or one page's days, and its totals against the period
 * before — in one country, when one is named — asked of Google when its
 * screen opens: nothing is kept per search or page per day.
 */
export const searchConsoleKeySeries = tenantAction({
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: v.union(v.literal("query"), v.literal("page")),
    key: v.string(),
    from: v.string(),
    to: v.string(),
    country: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), days: v.array(dayValidator), totals: v.union(figuresValidator, v.null()), previous: v.union(figuresValidator, v.null()), previousHeld: v.boolean() }),
    v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
  ),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    checkedCountry(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: null });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    const before = periodBefore(args.from, args.to);
    const answer = await askLive(ctx, target, {
      startDate: before.from,
      endDate: args.to,
      type: args.searchType,
      dimensions: ["date"],
      dimensionFilterGroups: [{ filters: [{ dimension: args.dimension, operator: "equals", expression: args.key }, ...countryFilters(args.country)] }],
    });
    if (!answer.ok) return answer;
    const all = answer.rows
      .map((row) => ({ day: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))
      .sort((left, right) => left.day.localeCompare(right.day));
    const days = all.filter((day) => day.day >= args.from);
    const earlier = all.filter((day) => day.day < args.from);
    return { ok: true as const, days, totals: totalsOf(days), previous: totalsOf(earlier), previousHeld: true };
  },
});
