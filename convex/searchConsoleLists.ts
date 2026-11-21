import { v, type Infer, type ObjectType } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { moduleAction, moduleQuery } from "./tenantFunctions";
import { MENU_FEATURES } from "./utils/coreModules";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { requireMySite, type SiteReader } from "./siteAccess";
import { listPageArgs, pageOfList, sortDirectionArg } from "./siteListPages";
import { VOLATILITY_PERIOD, searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import { askLive, checkedRange, countryFilters } from "./searchConsoleReads";
import { askGoogle, countryFilter, inParts, listFilters, liveRows, type Filter, type ListKind, type LiveProblem } from "./searchConsoleLiveAsks";
import { checkedCountry, countryScope, type CountryScope } from "./searchConsoleCountries";
import { beforeOf, historyLimitDay, periodOf } from "./searchConsoleDays";
export { periodOf } from "./searchConsoleDays";
import { periodFromParts, readPeriod, type PeriodRow } from "./searchConsolePeriodReads";
import { keySeriesAnswer, namedMovers, namedTracked, totalsOf } from "./searchConsoleSpans";
import { keywordListOf, namedCannibalisation, type KeywordParts } from "./searchConsoleKeywordList";
import type { ListRows } from "./searchConsoleKeywordTable";
import { BookNames, BookShelf, keysAsText, namedRows, textsFrom } from "./searchConsolePeriodBooks";
import { SORT_KEYS, sortRows, type SortKey } from "./searchConsoleSorts";
import { checkedLongest, consoleLimitsOf, consoleLimitsValidator, viewRulesOf, type ConsoleLimits } from "./searchConsoleLimits";
import { factKeys, factsFor, factsWanted, withFactsKnown, withListFacts } from "./searchConsoleFacts";
import { pageKindSetupValidator, readPageKinds, readPageKindSetup } from "./pageKinds";
import { classificationTypeValidator } from "./pagesSchema";
import { loadSite } from "./websiteSiteRows";
import {
  BANDS,
  VIEWS,
  VIEWS_BY_WHOLE_PAGE,
  VIEW_LIST,
  applyView,
  ctrCurve,
  filterRows,
  pagesByKeyword,
  shapeRows,
  summarise,
  sourceRowsOf,
  withPageKinds,
  withSectionsInPages,
  type Filters,
  type ListRow,
  type Summary,
  type View,
  type ViewContext,
} from "./utils/searchConsoleViews";
import { brandWordsOf, connectionOf, trackedOf } from "./searchConsoleListSources";
import { GOOGLE_MOST_ROWS, LISTS_OF } from "./searchConsoleApi";
import { EXPORT_FIELDS, exportFileName, exportValue } from "./utils/searchConsoleExport";
import { type Row as PackedRow } from "./utils/searchConsolePacks";
import { NOT_SORTED_KIND, pageKindsFrom, type PageKinds, type PageKindSetup } from "./utils/pageKinds";
import { withTitles } from "./pageTitles";
import { calendarPeriodValidator, ukDay, type CalendarPeriod } from "./utils/calendarPeriods";

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

/** Rows a short list (countries, devices, kinds of search appearance) holds whole. */
const SPLIT_ROWS = 500;

const listKindValidator = v.union(v.literal("query"), v.literal("page"), v.literal("country"), v.literal("device"), v.literal("appearance"));

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
  /** Its impressions in the dates before, for a tracked list's boxes (`ListRow.previousImpressions`). */
  previousImpressions: v.optional(nullable(v.number())),
  positionChange: nullable(v.number()),
  share: v.number(),
  count: nullable(v.number()),
  top: nullable(v.string()),
  tracked: v.boolean(),
  kind: nullable(v.string()),
  volume: nullable(v.number()),
  brand: nullable(v.boolean()),
  usualCtr: nullable(v.number()),
  expected: nullable(v.number()),
  topShare: nullable(v.number()),
  next: nullable(v.string()),
  nextShare: nullable(v.number()),
  gap: nullable(v.number()),
  /** Keyword cannibalisation: days Google swapped the page it showed most; null for a period not counted day by day. */
  swaps: v.optional(nullable(v.number())),
  title: v.optional(v.string()), // A page's title, from the website's page list (google-analytics-plan.md GA27): only on the rows shown.
});

// The headings a list orders by, and its order (`searchConsoleSorts.ts`).
const sortValidator = v.optional(v.union(...SORT_KEYS.map((key) => v.literal(key))));

export const brandSplitValidator = v.object({ brandClicks: v.number(), nonBrandClicks: v.number(), brandImpressions: v.number(), nonBrandImpressions: v.number() });
const movedValidator = v.union(v.null(), v.object({ key: v.string(), clicks: v.number(), previousClicks: v.number() }));
const pageMovedValidator = v.union(v.null(), v.object({ key: v.string(), clicks: v.number(), previousClicks: v.number(), title: v.optional(v.string()) }));
const trackedMoveValidator = v.union(v.null(), v.object({
  key: v.string(), clicks: v.number(), previousClicks: v.number(), position: v.union(v.number(), v.null()), previousPosition: v.union(v.number(), v.null()), title: v.optional(v.string()),
}));

/** What a page's hero boxes read: figures over every row its rule lists (`summarise`). */
const sharedKeywordValidator = v.union(v.null(), v.object({
  key: v.string(), impressions: v.number(), clicks: v.number(), count: v.number(), topShare: v.number(), nextShare: v.number(), swaps: v.union(v.number(), v.null()),
}));

const summaryValidator = v.object({
  rows: v.number(),
  of: v.number(),
  clicks: v.number(),
  impressions: v.number(),
  previousClicks: v.union(v.number(), v.null()),
  position: v.union(v.number(), v.null()),
  tracked: v.number(),
  gaining: v.number(),
  losing: v.number(),
  gained: v.number(),
  lost: v.number(),
  volume: v.number(),
  expected: v.number(),
  pagesInvolved: v.union(v.number(), v.null()),
  pagesShown: v.union(v.number(), v.null()),
  bands: v.record(v.string(), v.number()),
  bandsBefore: v.union(v.record(v.string(), v.number()), v.null()),
  brand: v.union(v.null(), v.object({ now: brandSplitValidator, before: v.union(brandSplitValidator, v.null()) })),
  kinds: v.array(v.object({ kind: v.string(), rows: v.number(), clicks: v.number(), impressions: v.number(), previousClicks: v.union(v.number(), v.null()) })),
  types: v.array(v.object({ type: classificationTypeValidator, rows: v.number(), clicks: v.number() })),
  /** What Hakken sees over the whole list (`ListSees`): searches' lists only, their movers named by the read. */
  wholeList: v.optional(v.object({
    bandClicks: v.record(v.string(), v.number()),
    bandClicksBefore: v.union(v.record(v.string(), v.number()), v.null()),
    crossed: v.union(v.null(), v.object({ top3In: v.number(), top3Out: v.number(), pageOneIn: v.number(), pageOneOut: v.number() })),
    movers: v.union(v.null(), v.object({ brandUp: movedValidator, brandDown: movedValidator, otherUp: movedValidator, otherDown: movedValidator })),
  })),
  /** The span before's rows added up (`Summary.beforeTotals`): a list's own boxes against it. */
  beforeTotals: v.optional(v.union(v.null(), v.object({ clicks: v.number(), impressions: v.number(), position: v.union(v.number(), v.null()) }))),
  clickedRows: v.optional(v.number()),
  halfRows: v.optional(v.union(v.number(), v.null())), clickedBefore: v.optional(v.union(v.number(), v.null())),
  /** The pages that gained and lost most clicks (`Summary.pageMovers`), named, with their titles. */
  pageMovers: v.optional(v.union(v.null(), v.object({ up: pageMovedValidator, down: pageMovedValidator }))),
  /** Shown but not clicked's own figures (`Summary.lowCtr`): each position on Google, and the pages short by most clicks. */
  lowCtr: v.optional(v.object({
    positions: v.array(v.object({ position: v.number(), pages: v.number(), clicks: v.number(), expected: v.number(), all: v.number() })),
    top: v.array(v.object({ key: v.string(), clicks: v.number(), expected: v.number(), impressions: v.number(), position: v.number(), title: v.optional(v.string()) })),
  })),
  /** Keyword cannibalisation's own figures (`Summary.cannibalisation`), its keywords named. */
  cannibalisation: v.optional(v.object({
    busiest: sharedKeywordValidator,
    closest: sharedKeywordValidator,
    mostSwapped: sharedKeywordValidator,
    crowded: sharedKeywordValidator,
    averagePages: v.union(v.number(), v.null()),
    swapped: v.union(v.number(), v.null()),
    averageSwaps: v.union(v.number(), v.null()),
  })),
  /** A tracked list's own figures over every row it tracks (`Summary.trackedList`), its rows named. */
  trackedList: v.optional(v.object({
    before: v.union(v.null(), v.object({ clicks: v.number(), impressions: v.number(), position: v.union(v.number(), v.null()) })),
    movers: v.union(v.null(), v.object({ up: trackedMoveValidator, down: trackedMoveValidator })),
    places: v.union(v.null(), v.object({ up: trackedMoveValidator, down: trackedMoveValidator })),
    firstPage: v.object({
      now: v.number(), before: v.union(v.number(), v.null()), came: v.union(v.number(), v.null()), left: v.union(v.number(), v.null()),
      cameTop: trackedMoveValidator, leftTop: trackedMoveValidator,
    }),
    busiest: trackedMoveValidator,
    quietest: v.union(v.null(), v.object({
      key: v.string(), clicks: v.number(), previousClicks: v.number(), position: v.union(v.number(), v.null()), previousPosition: v.union(v.number(), v.null()),
      impressions: v.number(), title: v.optional(v.string()),
    })),
    notShown: v.number(),
  })),
});

const filterArgs = {
  q: v.optional(v.string()),
  /** "yes": only the tracked; "no": only the rest. */
  tracked: v.optional(v.union(v.literal("yes"), v.literal("no"))),
  band: v.optional(v.union(...BANDS.map((band) => v.literal(band)))),
  /** An intent or a page type, as Sites words them — or, once the website has classifications, a classification's id or Not sorted. */
  kind: v.optional(v.string()),
  brand: v.optional(v.union(v.literal("yes"), v.literal("no"))),
  /** Volatility: keywords whose position rose, or fell. */
  way: v.optional(v.union(v.literal("up"), v.literal("down"))),
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
  period: v.optional(calendarPeriodValidator),
  /** One country, Google's `gbr`; missing for all countries. */
  country: v.optional(v.string()),
  /** A list of pages in the country chosen alone, as Pages shows them (18 November 2026), never every country's. */
  inCountry: v.optional(v.boolean()),
  ...filterArgs,
  sort: sortValidator,
  direction: sortDirectionArg,
};

type Ask = {
  searchType: SearchType;
  dimension: ListKind;
  view?: View;
  within?: { kind: "query" | "page"; key: string };
  period?: CalendarPeriod;
  from: string;
  to: string;
  country?: string;
  inCountry?: boolean;
  sort?: SortKey;
  direction?: "asc" | "desc";
} & Filters;

type ListAnswer = {
  rows: ListRows;
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
  /** A list of searches for a kind of result that keeps none — Google Images, Discover: said so, not "being added up". */
  noSearches?: boolean;
  /** The hero boxes' figures; null when nothing is listed yet. */
  summary: Summary | null;
  /** The website's classifications, when a list of its pages was read and it has any: what each row's kind names. */
  pageKinds: PageKinds | null;
  /** The book naming the rows' tokens (§5.1): `namedRows` names the rows a caller shows. Null for rows of text. */
  names?: BookNames | null;
};

/**
 * A ready-made list, shaped, put through the page's rule, searched, filtered
 * and ordered — or what to say instead — for all countries or one country
 * kept ready. Exported for its load test. A list of keywords is read as
 * columns (`keywordListOf`); `how.rows` reads it a row a keyword instead — the
 * reading the columns are held to, row for row (`searchConsoleKeywordTable.test.ts`).
 */
export async function readList(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, args: Ask, how: { rows?: boolean } = {}): Promise<ListAnswer> {
  checkedCountry(args.country);
  const empty = { rows: [], cut: null, from: null, to: null, named: null, listed: 0, comparable: false, summary: null, pageKinds: null };
  const live = { ...empty, live: true, preparing: false };
  const hold = await ctx.db.get(companyWebsiteId);
  if (!hold) return { ...empty, live: false, preparing: false };
  const limits = await consoleLimitsOf(ctx, hold);
  checkedLongest(args.from, args.to, limits);
  const connection = await connectionOf(ctx, companyWebsiteId);
  if (!connection?.newestDay) return { ...empty, live: false, preparing: false };
  const scope: CountryScope = args.country === undefined ? { read: "ALL" } : await countryScope(ctx, hold, connection, args.country);
  // A country not kept ready, or not yet collected: asked of Google with its filter.
  if (scope.read === "LIVE") return live;
  const country = scope.read === "KEPT" ? scope.country : undefined;
  const view = args.view ?? "all";
  // Volatility lists its own ready-made day, whatever the dates (search-console-volatility-plan.md §2.1).
  const period = view === "volatility" ? VOLATILITY_PERIOD : periodOf(args.from, args.to, scope.read === "KEPT" ? scope.newestDay : connection.newestDay, ukDay(), args.period);
  if (!period) return live;
  const within = args.within;
  // One keyword's pages are rows keyed by page, one page's keywords by keyword.
  const dimension = within ? (within.kind === "query" ? "page" : "query") : (VIEW_LIST[view] ?? args.dimension);
  // A kind of result keeping no searches (store less round two, A) lists none: the screen says so.
  if (!LISTS_OF[args.searchType].includes("pair") && (dimension === "query" || within !== undefined || view === "competing")) {
    return { ...empty, live: false, preparing: false, noSearches: true };
  }
  // A country keeps no country list of its own: Google answers it, filtered to that one country.
  if (country !== undefined && dimension === "country") return live;
  // One keyword's pages, or one page's keywords: asked of Google when opened, for every period
  // (keep-less-history-plan.md, 5.1; Anthony, 2026-10-08: "ok lets do this one").
  if (within) return live;
  // The country's own pages (Pages, 18 November 2026): the main home country's web pages are kept for each ready-made
  // period (`countryPage`); another country, another kind of result, or a period not kept yet is asked of Google with the
  // country's filter. The every-country `page` list stays for the screens not redone yet.
  const inCountry = args.inCountry === true && dimension === "page";
  if (inCountry && (country !== undefined || args.searchType !== "web")) return live;
  // A list of keywords as columns, never a row a keyword (step 4b): a busy website's would outgrow a read.
  let held: KeywordParts | null = null;
  if (dimension === "query" && !how.rows) {
    const keywords = await keywordListOf(ctx, companyWebsiteId, {
      searchType: args.searchType, period, country, view, filters: args, sort: args.sort, direction: args.direction,
      rules: viewRulesOf(limits), most: limits.listRows, tracked: async () => await trackedOf(ctx, companyWebsiteId, "query"),
      brandWords: async () => await brandWordsOf(ctx, companyWebsiteId),
    });
    if (keywords === "PREPARING") return { ...empty, live: false, preparing: true };
    if ("asRows" in keywords) held = keywords.asRows;
    else return { ...keywords, live: false, preparing: false, pageKinds: null };
  }
  // Each whole book read once, however many of the lists below name it (speed fixes, 18 November 2026).
  const shelf = new BookShelf(ctx);
  const read = async (which: "NOW" | "BEFORE") => (held
    ? await periodFromParts(ctx, companyWebsiteId, args.searchType, dimension, which === "NOW" ? held.now : held.before, country, true, shelf)
    : await readPeriod(ctx, companyWebsiteId, args.searchType, inCountry ? "countryPage" : dimension, period, which, country, shelf));
  let now = await read("NOW");
  if (!now) return inCountry ? live : { ...empty, live: false, preparing: true };
  let before = await read("BEFORE");
  // Only the pairs of keywords two or more pages were shown for, kept ready, and how many pages Google showed at all.
  let competing = view !== "competing" ? null
    : held?.competing ? await periodFromParts(ctx, companyWebsiteId, args.searchType, "competing", held.competing, country)
    : await readPeriod(ctx, companyWebsiteId, args.searchType, "competing", period, "NOW", country);
  if (view === "competing" && !competing) return { ...empty, live: false, preparing: true };
  // Keywords and pages as tokens of their build's book (core-data-normalisation-plan.md §5.1), joined, grouped and
  // sorted by token. Lists from two builds — one rebuilt while the other waited on Google — are joined by their keys as
  // text, each from its own build's book of that kind, read once (`keysAsText`): never every book whole, which was 14.4 MB
  // for More Handles' pages in October against September (speed fixes, 18 November 2026). The rows on screen name their
  // top keyword or page from the dates' own book, as before.
  const twoBuilds = new Set([now, before, competing].flatMap((list) => (list?.book ? [list.book.builtAt] : []))).size > 1;
  if (twoBuilds) {
    now = await keysAsText(shelf, now, { tops: true });
    before = before ? await keysAsText(shelf, before, { tops: false }) : null;
    competing = competing ? await keysAsText(shelf, competing, { tops: false, pages: true }) : null;
  }
  const names = now.book ? new BookNames(ctx, now.book) : null;
  // Whether the keys are still places in the book, or text.
  const keysAreTokens = names !== null && !twoBuilds && dimension === "query";
  const trackedTexts = dimension === "query" || dimension === "page" ? await trackedOf(ctx, companyWebsiteId, dimension) : new Set<string>();
  // The company's tracked searches as tokens, where the book holds them: up to 200 look-ups, each a small record.
  const tracked = keysAreTokens && names
    ? new Set(await Promise.all([...trackedTexts].map(async (text) => await names.tokenOf("query", text))))
    : trackedTexts;
  const brandWords = dimension === "query" ? await brandWordsOf(ctx, companyWebsiteId) : null;
  // A list of pages reads the website's classifications once, and names each page by them.
  const pageKinds = dimension === "page" ? await readPageKinds(ctx, companyWebsiteId) : null;
  const shaped = withPageKinds(shapeRows(sourceRowsOf(view, now.rows, tracked), before?.rows ?? null, { tracked, brandWords }), pageKinds);
  const context: ViewContext = { rules: viewRulesOf(limits), tracked };
  if (view === "lowCtr") {
    // The click rate pages usually get at each position, from the pages listed themselves, each page once with its
    // section links (fix 2, 21 November 2026): a page set against pages, never against searches, which Google counts once
    // however many of the website's pages it showed (search-console-and-analytics-data-plan-2026-11-21.md).
    context.curve = ctrCurve(withSectionsInPages(shaped).map((row) => ({ clicks: row.clicks, impressions: row.impressions, position: row.position })), limits.curvePositions);
  }
  if (competing) {
    context.pages = pagesByKeyword(competing.rows);
    context.pagesShown = competing.shown ?? undefined;
    // Each keyword's Swaps, kept beside each of its pairs (`counts`) where its period was counted day by day.
    const swaps = new Map(competing.rows.flatMap((row) => (row.count === undefined ? [] : [[row.key, row.count] as const])));
    if (swaps.size > 0) context.swaps = swaps;
  }
  // A search reads every keyword's text: the keyword book whole (§5.5).
  const textOf = keysAreTokens && names && args.q?.trim()
    ? textsFrom(await shelf.whole(names.scope, "query"))
    : undefined;
  context.textOf = textOf;
  // A view that compares or counts pages weighs each page once, its section links folded in.
  const weighed = dimension === "page" && VIEWS_BY_WHOLE_PAGE.has(view) ? withSectionsInPages(shaped) : shaped;
  const listed = applyView(view, weighed, context);
  const named = listed.reduce((sum, row) => sum + row.clicks, 0);
  const summary = summarise(listed, weighed, before?.rows ?? null, {
    ...context,
    brandWords,
    pageList: dimension === "page",
    splitList: dimension === "country" || dimension === "device",
    ...(pageKinds ? { kindType: pageKinds.typeOf, kindOfPage: (page: string) => pageKinds.kindOf(page) } : {}),
    wholeList: view === "all" && dimension === "query",
    trackedList: view === "tracked",
    lowCtrList: view === "lowCtr",
    competingList: view === "competing",
  });
  // Keyword cannibalisation's keywords the eye names, named as the rows on screen are.
  if (summary.cannibalisation && names && keysAreTokens) summary.cannibalisation = await namedCannibalisation(summary.cannibalisation, names);
  // The four searches What Hakken sees moved most, named as the rows on screen are: the rest stay tokens.
  const movers = summary.wholeList?.movers;
  if (movers && names) {
    for (const way of ["brandUp", "brandDown", "otherUp", "otherDown"] as const) {
      const moved = movers[way];
      if (moved) movers[way] = { ...moved, key: await names.textOf(moved.key) };
    }
  }
  // The two pages that moved most, named, each with its title where the website has one.
  if (summary.pageMovers) summary.pageMovers = await namedMovers(ctx, companyWebsiteId, summary.pageMovers, names);
  // Shown but not clicked's pages short by most clicks, each with its title where the website has one.
  if (summary.lowCtr) summary.lowCtr = { ...summary.lowCtr, top: await withTitles(ctx, companyWebsiteId, summary.lowCtr.top) };
  // A tracked list's movers and the busiest onto and off the first page, named as the rows on screen are.
  if (summary.trackedList) summary.trackedList = await namedTracked(ctx, companyWebsiteId, summary.trackedList, names, dimension === "page");
  const sorted = sortRows(filterRows(listed, args, textOf), args.sort, args.direction, pageKinds);
  // A keyword's pages, or a page's keywords, hold their own limit; every other list the list limit.
  const most = within ? limits.pairedRows : limits.listRows;
  const cut = sorted.length > most ? most : null;
  return {
    rows: cut ? sorted.slice(0, most) : sorted,
    cut,
    from: now.from,
    to: now.to,
    named,
    listed: listed.length,
    comparable: before !== null,
    live: false,
    preparing: false,
    summary,
    pageKinds,
    names,
  };
}

export const answerFacts = {
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
export const searchConsoleListPage = moduleQuery({
  module: MENU_FEATURES.searchConsole,
  args: { ...listArgs, ...listPageArgs },
  returns: v.object({
    rows: v.array(rowValidator),
    total: v.number(),
    page: v.number(),
    pages: v.number(),
    size: v.number(),
    cut: v.union(v.number(), v.null()),
    preparing: v.boolean(),
    noSearches: v.optional(v.boolean()),
    summary: v.union(summaryValidator, v.null()),
    ...answerFacts,
  }),
  handler: async (ctx, args) => await readListPage(ctx, args),
});

/** One page of a list: the screens' read, and a chat app's (`chatAppEyes/searchConsole.ts`). */
export async function readListPage(ctx: SiteReader, args: ObjectType<typeof listArgs> & ObjectType<typeof listPageArgs>) {
  checkedRange(args.from, args.to);
  const site = await requireMySite(ctx, args.siteId);
  const list = await readList(ctx, site.hold._id, args);
  const page = pageOfList(list.rows, args.page, args.rows, list.cut);
  // Only the page's rows named: the rest stay tokens of the book (core-data-normalisation-plan.md §5.3); a page's title (GA27) beside it.
  const named: Array<Awaited<ReturnType<typeof namedRows>>[number] & { title?: string }> = await namedRows(list, page.rows);
  return {
    ...page,
    rows: args.dimension === "page" ? await withTitles(ctx, site.hold._id, named) : named,
    preparing: list.preparing,
    ...(list.noSearches ? { noSearches: true } : {}),
    summary: list.summary,
    current: true,
    named: list.named,
    listed: list.listed,
    comparable: list.comparable,
    live: list.live,
    from: list.from,
    to: list.to,
  };
}

/**
 * A short list whole — countries, devices, kinds of search appearance — for
 * a page holding several tables, with its summary (Countries and devices'
 * boxes, 2026-11-18). With a country, its devices and kinds of search
 * appearance; its countries are asked of Google (`live`).
 */
export const searchConsoleSplitList = moduleQuery({
  module: MENU_FEATURES.searchConsole,
  args: listArgs,
  returns: v.object({ rows: v.array(rowValidator), preparing: v.boolean(), summary: v.optional(v.union(summaryValidator, v.null())), ...answerFacts }),
  handler: async (ctx, args) => await readSplitList(ctx, args),
});

/** A short list whole: the screens' read, and a chat app's (`chatAppEyes/searchConsole.ts`). */
export async function readSplitList(ctx: SiteReader, args: ObjectType<typeof listArgs>) {
  checkedRange(args.from, args.to);
  const site = await requireMySite(ctx, args.siteId);
  const list = await readList(ctx, site.hold._id, args);
  const { preparing, summary, named, listed, comparable, live, from, to } = list;
  return { rows: await namedRows(list, list.rows.slice(0, SPLIT_ROWS)), preparing, summary, current: true, named, listed, comparable, live, from, to };
}

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
    /** A list of pages: the website's classifications, to name each page by, once it has any. */
    pageKinds: v.union(v.null(), pageKindSetupValidator),
    limits: consoleLimitsValidator,
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId) return null;
    const limits = await consoleLimitsOf(ctx, hold);
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
      pageKinds: args.kind === "page" ? await readPageKindSetup(ctx, hold._id) : null,
      limits,
    };
  },
});

/** What a live ask needs of the website: written out, as the actions in this file read it through `internal`. */
type LiveTarget = {
  connectionId: Id<"searchConsoleConnections">;
  property: string;
  host: string;
  facts: { websiteId: Id<"websites">; place: number } | null;
  tracked: string[];
  brandWords: string[] | null;
  pageKinds: PageKindSetup | null;
  limits: ConsoleLimits;
};

type LiveListAnswer =
  | { ok: true; rows: ListRow[][]; cut: number | null; named: number; comparable: boolean; summary: Summary; keywordsApart?: true; pairsCut?: number; listCut?: number }
  | { ok: false; problem: LiveProblem };

/**
 * Each row's count across the whole website, kept beside the list it is in
 * for a ready-made period: a page's keywords on the page list, a keyword's
 * pages on the keyword list — for the rows of one keyword's pages or one
 * page's keywords asked of Google (keep-less-history-plan.md, 5.1). Nothing
 * for other dates, as before.
 */
export const keptCounts = internalQuery({
  args: {
    companyId: v.id("companies"),
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    list: v.union(v.literal("query"), v.literal("page")),
    from: v.string(),
    to: v.string(),
    country: v.optional(v.string()),
    keys: v.array(v.string()),
  },
  returns: v.array(v.object({ key: v.string(), count: v.number() })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId) return [];
    const connection = await connectionOf(ctx, hold._id);
    if (!connection?.newestDay) return [];
    const scope = args.country === undefined ? { read: "ALL" as const } : await countryScope(ctx, hold, connection, args.country);
    if (scope.read === "LIVE") return [];
    const period = periodOf(args.from, args.to, scope.read === "KEPT" ? scope.newestDay : connection.newestDay);
    if (!period) return [];
    const kept = await readPeriod(ctx, hold._id, args.searchType, args.list, period, "NOW", scope.read === "KEPT" ? scope.country : undefined);
    // A keyword list keeps each keyword as its token in the build's book (§5.1): each asked for looked up by its text.
    const names = kept?.book && args.list === "query" ? new BookNames(ctx, kept.book) : null;
    const wanted = new Map<string, string>();
    for (const key of args.keys) wanted.set(names ? await names.tokenOf("query", key) : key, key);
    return (kept?.rows ?? []).flatMap((row) => {
      const key = wanted.get(row.key);
      return key !== undefined && row.count !== undefined ? [{ key, count: row.count }] : [];
    });
  },
});

/** Rows asked of Google with each one's count across the website, where the list kept for the dates has it. */
async function withKeptCounts(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  args: { siteId: Id<"companyWebsites">; searchType: SearchType; from: string; to: string; country?: string },
  list: "query" | "page",
  rows: PeriodRow[],
  most: number,
): Promise<PeriodRow[]> {
  // The rows a screen can list, the most clicks first: each a key one count is looked up for.
  const keys = [...rows].sort((left, right) => right.clicks - left.clicks).slice(0, most).map((row) => row.key);
  const counts: Array<{ key: string; count: number }> = await ctx.runQuery(internal.searchConsoleLists.keptCounts, {
    companyId, siteId: args.siteId, searchType: args.searchType, list, from: args.from, to: args.to,
    ...(args.country === undefined ? {} : { country: args.country }), keys,
  });
  const byKey = new Map(counts.map((one) => [one.key, one.count]));
  return rows.map((row) => (byKey.has(row.key) ? { ...row, count: byKey.get(row.key) } : row));
}

/**
 * A list for dates that are not a ready-made period — or for one country or
 * device — asked of Google when chosen and sent whole, put through the
 * page's rule, for the page to search, filter, order and page itself: with
 * the period before for the change, asked at the same time. Sites' facts
 * are looked up for the rows the rule lists, the most clicks first (drift
 * fixes, 2026-10-03: looking them up for every row Google returned made a
 * year of Pages competing wait half a minute).
 */
/** The rules that read a live list's pairs whatever it lists: Shown but not clicked's click rate by place, Pages competing's pages. */
const PAIR_VIEWS: ReadonlySet<View> = new Set(["lowCtr", "competing"]);

export const searchConsoleLiveList = moduleAction({
  module: MENU_FEATURES.searchConsole,
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: listKindValidator,
    view: viewValidator,
    within: withinValidator,
    from: v.string(),
    to: v.string(),
    period: v.optional(calendarPeriodValidator),
    country: v.optional(v.string()),
    inCountry: listArgs.inCountry,
    device: v.optional(v.string()),
    /**
     * A list of pages without each page's keywords and top one, which only its download shows: asked when it's downloaded
     * (`searchConsoleLivePageKeywords`). Google's pairs were 5.4 of Pages' 7.4 seconds for More Handles in October (speed
     * fixes, 18 November 2026). The rules that read the pairs ask for them whatever this says.
     */
    keywordsApart: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      /** In parts of 8,000 (`inParts`): join them to read the list. */
      rows: v.array(v.array(rowValidator)),
      cut: v.union(v.number(), v.null()),
      named: v.number(),
      comparable: v.boolean(),
      summary: summaryValidator,
      /** Each page's keywords and top one left out, to be asked when the list is downloaded (`keywordsApart`). */
      keywordsApart: v.optional(v.literal(true)),
      /**
       * The list read Google's keyword-and-page pairs, and they stopped at its most an ask (`GOOGLE_MOST_ROWS`), the
       * fewest clicks left out: the screen says so (Anthony, 18 November 2026: "add it for completeness").
       */
      pairsCut: v.optional(v.number()),
      /**
       * The list Google answered itself, its pages, countries or devices, stopped at its most an ask (`GOOGLE_MOST_ROWS`),
       * the fewest clicks left out: the screen says so in the same place (review fixes, 18 November 2026).
       */
      listCut: v.optional(v.number()),
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
    const filters = listFilters(args.country, args.device);
    const target: LiveTarget | null = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind, view });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    const { limits } = target;
    checkedLongest(args.from, args.to, limits);
    const before = beforeOf(args.from, args.to, args.period);
    // Google keeps sixteen months, and has no figures for some websites' stretches inside them (`googleHasSpan`): days it has
    // none for would read as nothing, not as a fall, so they are neither asked of it nor set against (a page's keywords on More
    // Handles' Last 6 months, 2026-11-17).
    const beforeHeld: boolean = before.from >= historyLimitDay(Date.now())
      && await ctx.runQuery(internal.searchConsoleSpans.googleHasDays, { companyId, siteId: args.siteId, from: before.from, to: before.to });
    // Each page's keywords only where a rule reads the pairs, or the screen didn't ask for them apart; never for the dates
    // before, whose pairs no list of pages reads (speed fixes, 18 November 2026).
    const pageKeywords = !args.keywordsApart || within !== undefined || PAIR_VIEWS.has(view);
    const how = { within, inCountry: args.inCountry === true };
    // Only the facts the screen shows (`factsWanted`): none on a list of pages once the website has Classifications.
    const want = kind ? factsWanted(kind, target.pageKinds !== null) : null;
    const facts = kind && want ? target.facts : null;
    // The "all" rule lists every row Google answered, in its order: their facts are looked up as soon as the answer for the
    // dates is in, while the dates before are still being asked.
    const askedNow = liveRows(ctx, target, args.searchType, dimension, args.from, args.to, filters, { ...how, pageKeywords });
    const early = view === "all" && kind && want && facts
      ? askedNow.then(async (answer) => (answer.ok ? await factsFor(ctx, facts, kind, factKeys(answer.rows, limits.liveFactsRows), want) : null))
      : null;
    const [now, earlier, earlyFacts] = await Promise.all([
      askedNow,
      beforeHeld
        ? liveRows(ctx, target, args.searchType, dimension, before.from, before.to, filters, { ...how, pageKeywords: false })
        : { ok: false as const, problem: "GOOGLE_REFUSED" as const },
      early,
    ]);
    if (!now.ok) return now;
    // One keyword's pages, or one page's keywords: each row's count across the whole website — a page's keywords,
    // a keyword's pages — from the list kept for the dates, when they are a ready-made period (5.1).
    const rows = within ? await withKeptCounts(ctx, companyId, args, within.kind === "query" ? "page" : "query", now.rows, limits.pairedRows) : now.rows;
    const tracked = new Set(target.tracked);
    const earlierRows = earlier.ok ? earlier.rows : null;
    const pageKinds = dimension === "page" && target.pageKinds ? pageKindsFrom(target.pageKinds) : null;
    const shaped = withPageKinds(shapeRows(sourceRowsOf(view, rows, tracked), earlierRows, { tracked, brandWords: target.brandWords }), pageKinds);
    const context: ViewContext = { rules: viewRulesOf(limits), tracked };
    if (view === "lowCtr") {
      // Pages set against pages, as the kept list does (fix 2).
      context.curve = ctrCurve(withSectionsInPages(shaped).map((row) => ({ clicks: row.clicks, impressions: row.impressions, position: row.position })), limits.curvePositions);
    }
    if (view === "competing") context.pages = pagesByKeyword(now.pairs);
    const weighed = dimension === "page" && VIEWS_BY_WHOLE_PAGE.has(view) ? withSectionsInPages(shaped) : shaped;
    const ruled = applyView(view, weighed, context);
    // A page's classification stays its kind once the website has any; Sites' type only names the rest.
    const listed = !kind || !want || !facts ? ruled
      : withPageKinds(earlyFacts ? withFactsKnown(ruled, earlyFacts, kind, want) : await withListFacts(ctx, facts, kind, ruled, limits.liveFactsRows, want), pageKinds);
    const sorted = sortRows(listed, undefined, undefined);
    const named = listed.reduce((sum, row) => sum + row.clicks, 0);
    const summary = summarise(listed, weighed, earlierRows, {
      ...context,
      brandWords: target.brandWords,
      pageList: dimension === "page",
      splitList: dimension === "country" || dimension === "device",
      ...(pageKinds ? { kindType: pageKinds.typeOf, kindOfPage: (page: string) => pageKinds.kindOf(page) } : {}),
      trackedList: view === "tracked",
      lowCtrList: view === "lowCtr",
      competingList: view === "competing",
      // A list asked of Google carries the whole list's own figures too, as a ready-made one does: a country not kept ready,
      // a device chosen or dates of one's own, for Position bands' eye (search-console-position-bands-way-3-plan-2026-11-19.md).
      wholeList: view === "all" && dimension === "query",
    });
    const most = within ? limits.pairedRows : limits.listRows;
    return {
      ok: true as const, rows: inParts(sorted.slice(0, most)), cut: sorted.length > most ? most : null, named, comparable: earlier.ok, summary,
      ...(dimension === "page" && !pageKeywords ? { keywordsApart: true as const } : {}),
      ...(now.pairsCut ? { pairsCut: GOOGLE_MOST_ROWS } : {}),
      ...(now.listCut ? { listCut: GOOGLE_MOST_ROWS } : {}),
    };
  },
});

const splitRowValidator = v.object({ key: v.string(), clicks: v.number(), impressions: v.number(), share: v.number() });

/**
 * How many of the website's pages Google showed in each kind of rich result
 * (Rich results, drawn as "16 · Rich results") — in one country, when one is
 * named: Google will not list a kind beside its pages, so each kind's pages
 * are asked for on their own when the page opens.
 */
export const searchConsoleAppearancePages = moduleAction({
  module: MENU_FEATURES.searchConsole,
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
    const target: LiveTarget | null = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: null });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    checkedLongest(args.from, args.to, target.limits);
    const pages: { kind: string; pages: number }[] = [];
    for (const kind of args.kinds.slice(0, target.limits.richResultKinds)) {
      const answer = await askGoogle(ctx, target, args.searchType, "page", args.from, args.to, [{ dimension: "searchAppearance", key: kind }, ...inCountry]);
      if (!answer.ok) return answer;
      pages.push({ kind, pages: answer.rows.length });
    }
    return { ok: true as const, pages };
  },
});

type SplitRow = { key: string; clicks: number; impressions: number; share: number };
type KeySplitsAnswer = { ok: true; countries: SplitRow[]; devices: SplitRow[] } | { ok: false; problem: LiveProblem };

/**
 * Where one keyword's or one page's clicks came from: its countries and
 * devices, asked of Google when its screen opens. With a country chosen its
 * devices follow it; its countries are every country still, as on Countries
 * and devices (§16).
 */
export const searchConsoleKeySplits = moduleAction({
  module: MENU_FEATURES.searchConsole,
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
  handler: async (ctx, args): Promise<KeySplitsAnswer> => {
    checkedRange(args.from, args.to);
    const inCountry = countryFilter(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target: LiveTarget | null = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: null });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    checkedLongest(args.from, args.to, target.limits);
    const filters: Filter[] = [{ dimension: args.dimension, key: args.key }];
    // Its devices follow the country, a page's too since 18 November 2026, as its figures do.
    const [countries, devices] = await Promise.all([
      askGoogle(ctx, target, args.searchType, "country", args.from, args.to, filters),
      askGoogle(ctx, target, args.searchType, "device", args.from, args.to, [...filters, ...inCountry]),
    ]);
    if (!countries.ok) return countries;
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
const exportFieldsValidator = v.array(v.union(...EXPORT_FIELDS.map((field) => v.literal(field))));

/** A list's rows as the download's lines, the fields asked for in order: 25,000 rows sent whole were 12 MB, a second (step 4b). */
export const exportRows = internalQuery({
  args: { ...listArgs, companyId: v.id("companies"), fields: exportFieldsValidator },
  handler: async (ctx, args) => {
    const { fields, companyId, ...ask } = args;
    const hold = await ctx.db.get(ask.siteId);
    if (!hold || hold.companyId !== companyId) return null;
    const website = await ctx.db.get(hold.websiteId);
    const list = await readList(ctx, hold._id, ask);
    // A page's classification by its name in the file, as the screen shows it; Unclassified in words (as Your pages' download).
    const pageKinds = list.pageKinds;
    const lines = (await namedRows(list, list.rows.slice())).map((named) => {
      const row = pageKinds && named.kind !== null
        ? { ...named, kind: named.kind === NOT_SORTED_KIND ? "Unclassified" : (pageKinds.nameOf(named.kind) ?? named.kind) }
        : named;
      return fields.map((field) => cell(exportValue(row, field))).join(",");
    });
    return { host: website?.displayHost ?? "site", lines: inParts(lines), cut: list.cut };
  },
});

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
export const exportSearchConsoleList = moduleAction({
  module: MENU_FEATURES.searchConsole,
  args: {
    ...listArgs,
    headers: v.array(v.string()),
    /** The row's figure under each heading, in the same order. */
    fields: exportFieldsValidator,
  },
  returns: v.object({ fileName: v.string(), csv: v.string(), rows: v.number(), cut: v.union(v.number(), v.null()) }),
  handler: async (ctx, args): Promise<{ fileName: string; csv: string; rows: number; cut: number | null }> => {
    checkedRange(args.from, args.to);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const { headers, ...list } = args;
    const found = await ctx.runQuery(internal.searchConsoleLists.exportRows, { ...list, companyId });
    if (!found) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const lines = found.lines.flat();
    return {
      fileName: exportFileName(found.host, args.view, args.dimension, args.from, args.to),
      csv: [headers.map(cell).join(","), ...lines].join("\n"),
      rows: lines.length,
      cut: found.cut,
    };
  },
});

// ---------------------------------------------------------------------------
// One search or page over time: asked of Google when its screen opens (§14.3, item 5)
// ---------------------------------------------------------------------------

/**
 * One search's or one page's days, and its totals against the period before
 * where Google still keeps it (phase 9) — in one country, when one is named —
 * asked of Google when its screen opens: nothing is kept per search or page per day.
 */
export const searchConsoleKeySeries = moduleAction({
  module: [MENU_FEATURES.visibility, MENU_FEATURES.searchConsole],
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: v.union(v.literal("query"), v.literal("page"), v.literal("country")), // A country's: Countries and devices' ticks (2026-11-18).
    key: v.string(),
    from: v.string(),
    to: v.string(),
    period: v.optional(calendarPeriodValidator),
    country: v.optional(v.string()),
  },
  returns: keySeriesAnswer,
  // Written out: the handler asks a query of this same file (`googleHasDays`), which TypeScript can't follow round.
  handler: async (ctx, args): Promise<Infer<typeof keySeriesAnswer>> => {
    checkedRange(args.from, args.to);
    checkedCountry(args.country);
    if (args.dimension === "country") checkedCountry(args.key); // A country's own days: its code, and no second country beside it.
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target: LiveTarget | null = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: null });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    checkedLongest(args.from, args.to, target.limits);
    const before = beforeOf(args.from, args.to, args.period);
    // A keyword's days and a page's are the country's, as Pages' list is since 18 November 2026.
    const answer = await askLive(ctx, target, {
      startDate: before.from,
      endDate: args.to,
      type: args.searchType,
      dimensions: ["date"],
      dimensionFilterGroups: [{ filters: [{ dimension: args.dimension, operator: "equals", expression: args.key }, ...(args.dimension === "country" ? [] : countryFilters(args.country))] }],
    });
    if (!answer.ok) return answer;
    const all = answer.rows
      .map((row) => ({ day: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))
      .sort((left, right) => left.day.localeCompare(right.day));
    const [days, earlier] = [all.filter((day) => day.day >= args.from), all.filter((day) => day.day >= before.from && day.day <= before.to)];
    // Inside Google's sixteen months, and a span Google has the website's figures for (`googleHasSpan`).
    const previousHeld: boolean = before.from >= historyLimitDay(Date.now())
      && await ctx.runQuery(internal.searchConsoleSpans.googleHasDays, { companyId, siteId: args.siteId, from: before.from, to: before.to });
    return { ok: true as const, days, daysBefore: previousHeld ? earlier : [], totals: totalsOf(days), previous: previousHeld ? totalsOf(earlier) : null, previousHeld };
  },
});
