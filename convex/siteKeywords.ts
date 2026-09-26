import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { listHold, requireMySite, SITE_PAGE_MAX } from "./siteAccess";
import { askedQuestions, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import { keywordStanding, readKeywordCopy, type KeywordCopyRow } from "./siteKeywordCopy";
import { pagesCopyKey, readListCopy } from "./siteListCopies";
import { listOrder, listPageArgs, listPageResult, pageOfList, preparingPage, sortDirectionArg, type ListSorts } from "./siteListPages";
import {
  kdBandValidator,
  pageTypeValidator,
  rankBandValidator,
  rankIntentValidator,
  rankStatusValidator,
} from "./utils/siteShapes";
import { wordStartMatcher } from "./utils/wordStarts";

/**
 * What a site ranks for on Google: every keyword, every page, every folder, and
 * what moved — read from the latest-rankings tables (`siteSchema.ts`).
 *
 * **Counted exactly, any page at once.** The keyword and page tables are
 * searched, filtered, sorted and counted from their compact copies
 * (`siteKeywordCopy.ts`, `siteListCopies.ts`; docs/plans/active/
 * sites-table-pages-plan.md §5.2) — a few records however large the site —
 * and only the rows on screen are then read in full. The numbered footer
 * gets the list's true total and can open its last page in one request.
 */

/** Keywords looked up at once for the "compare with" column: a page's worth at the largest page size. */
const COMPARE_LIMIT = SITE_PAGE_MAX;

/**
 * The Top pages copy's layout (`siteListCopyBuilders.ts` writes it). The id
 * leads, so the pages on screen are read by id; a rebuild replaces each
 * page's row in place (`writePages`), so the id holds from one to the next.
 */
export const PAGE_COPY_FIELDS = ["id", "page", "section", "pageType", "keywords", "traffic", "topKeyword", "bestPosition", "referringDomains"] as const;

/**
 * One page's citation rows read for its AI columns: a row per form of its
 * address (www or not, http or https) per question, engine and place.
 */
const CITED_ROWS_PER_PAGE = 400;

/** A site's folders. A structure, not a list of pages. */
const MAX_SECTIONS = 300;

type Rank = Doc<"siteKeywordRanks">;

const nullableNumber = v.union(v.number(), v.null());
const nullableString = v.union(v.string(), v.null());

/** One keyword as a table shows it. */
const keywordRowValidator = v.object({
  _id: v.id("siteKeywordRanks"),
  keyword: v.string(),
  position: nullableNumber,
  previousPosition: nullableNumber,
  change: v.number(),
  status: rankStatusValidator,
  band: rankBandValidator,
  url: nullableString,
  page: v.string(),
  previousPage: nullableString,
  volume: nullableNumber,
  intent: rankIntentValidator,
  day: v.string(),
  firstSeenDay: v.string(),
  // Phase 2: what DataForSEO says about the search and the traffic it brings.
  cpc: nullableNumber,
  difficulty: nullableNumber,
  trend: v.array(v.number()),
  traffic: nullableNumber,
  trafficValue: nullableNumber,
  serpFeatures: v.array(v.string()),
});

/** One ranking page as Top pages shows it. */
const pageRowValidator = v.object({
  _id: v.id("sitePageRanks"),
  page: v.string(),
  url: v.string(),
  section: v.string(),
  keywords: v.number(),
  bestPosition: v.number(),
  top3: v.number(),
  volumeSum: v.number(),
  topKeyword: v.string(),
  topKeywordVolume: v.number(),
  firstSeenDay: v.string(),
  day: v.string(),
  aiEngines: v.array(v.string()),
  aiTimes: v.number(),
  traffic: nullableNumber,
  trafficValue: nullableNumber,
  pageRank: nullableNumber,
  referringDomains: nullableNumber,
  backlinks: nullableNumber,
  pageType: pageTypeValidator,
});

function keywordRow(row: Rank) {
  return {
    _id: row._id,
    keyword: row.keyword,
    position: row.position ?? null,
    previousPosition: row.previousPosition ?? null,
    change: row.change,
    status: row.status,
    band: row.band,
    url: row.url ?? null,
    page: row.page,
    previousPage: row.previousPage ?? null,
    volume: row.volumeKnown ? row.volume : null,
    intent: row.intent,
    day: row.day,
    firstSeenDay: row.firstSeenDay,
    cpc: row.cpc ?? null,
    difficulty: row.difficulty ?? null,
    trend: row.trend ?? [],
    traffic: row.traffic ?? null,
    trafficValue: row.trafficValue ?? null,
    serpFeatures: row.serpFeatures ?? [],
  };
}

/** The rows of one page of a keyword table, read in full: one read by id per row on screen. */
async function fullKeywordRows(ctx: QueryCtx, shown: readonly KeywordCopyRow[]) {
  const rows = await Promise.all(shown.map((row) => ctx.db.get(row.id)));
  // A row removed since the copy was built (a purge) is simply not shown.
  return rows.flatMap((row) => (row ? [keywordRow(row)] : []));
}

const byKeyword = (row: KeywordCopyRow) => row.keyword;

/**
 * The columns a keyword table sorts by (docs/plans/active/
 * sites-table-sorting-plan.md), each read from the compact copy, so the order
 * is the whole list's: the keyword A to Z, position from the top, the day it
 * was last seen newest first, and every other figure the most first. A
 * heading pressed again reverses it.
 */
const KEYWORD_SORTS: ListSorts<KeywordCopyRow, "keyword" | "position" | "change" | "volume" | "cpc" | "traffic" | "lastSeen"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  position: { value: (row) => row.position, first: "asc" },
  change: { value: (row) => row.change, first: "desc" },
  volume: { value: (row) => row.volume, first: "desc" },
  cpc: { value: (row) => row.cpc, first: "desc" },
  traffic: { value: (row) => row.traffic, first: "desc" },
  lastSeen: { value: (row) => row.day, first: "desc" },
};

/**
 * Every keyword the site ranks for, best first, most-searched, most visits or
 * dearest clicks first — or those on one page, in one band, of one intent,
 * movement or difficulty, or matching a search (word starts, T8).
 *
 * The searches the latest check found (T9): lost keywords only when asked for
 * by status, and those still held from an older check only with `older` — a
 * list of what a site ranks for should not end in everything it used to.
 */
export const listKeywords = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    search: v.optional(v.string()),
    band: v.optional(rankBandValidator),
    intent: v.optional(rankIntentValidator),
    status: v.optional(rankStatusValidator),
    /** Only the searches still held from a check before the latest (T9). */
    older: v.optional(v.boolean()),
    /** Only the searches one of the site's pages ranks with: its path. (`page` is the page of the table.) */
    path: v.optional(v.string()),
    /** How hard the search is, as a band of DataForSEO's difficulty. */
    kdBand: v.optional(kdBandValidator),
    sort: v.optional(v.union(
      v.literal("keyword"), v.literal("position"), v.literal("change"), v.literal("volume"),
      v.literal("cpc"), v.literal("traffic"), v.literal("lastSeen"),
    )),
    /**
     * Which way: each column's own first — the keyword A to Z, top position,
     * the biggest rise, most searched, dearest clicks, most visits, the newest
     * seen — unless a heading pressed again asks for the other. Always over
     * the whole list, before the page is cut.
     */
    direction: sortDirectionArg,
  },
  returns: listPageResult(keywordRowValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const copy = await readKeywordCopy(ctx, site.website._id, site.place);
    if (!copy) return preparingPage(args.rows);
    const matches = wordStartMatcher(args.search);
    const list = copy.rows.filter((row) => {
      const standing = keywordStanding(row, copy.latestCheckDay);
      if (args.status === "LOST") {
        if (standing !== "lost") return false;
      } else if (args.older) {
        if (standing !== "older" || (args.status && row.status !== args.status)) return false;
      } else if (standing !== "current" || (args.status && row.status !== args.status)) {
        return false;
      }
      return (!args.band || row.band === args.band)
        && (!args.intent || row.intent === args.intent)
        && (args.path === undefined || row.page === args.path)
        && (!args.kdBand || row.kdBand === args.kdBand)
        && (!matches || matches(row.keyword, row.page));
    }).sort(listOrder(KEYWORD_SORTS, args.sort ?? "position", args.direction, byKeyword));
    const page = pageOfList(list, args.page, args.rows);
    return { ...page, rows: await fullKeywordRows(ctx, page.rows) };
  },
});

/**
 * Where these keywords stood on an earlier day: the "compare with" column.
 *
 * Only for the rows on screen — one point read each — so comparing two dates
 * never reads either date in full.
 */
export const keywordsOnDay = tenantQuery({
  args: { siteId: v.id("companyWebsites"), day: v.string(), keywords: v.array(v.string()) },
  returns: v.array(v.object({
    keyword: v.string(),
    position: v.union(v.number(), v.null()),
    url: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const found = await Promise.all(args.keywords.slice(0, COMPARE_LIMIT).map(async (keyword) => {
      // Only a search on the site's own keyword list — the rows this column
      // sits beside. Asked of any other, a position could exist only because
      // a company tracks that search (docs/plans/active/
      // private-tracking-lists-plan.md), and would say so.
      const listed = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_keyword", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place).eq("keyword", keyword))
        .first();
      if (!listed) return { keyword, position: null, url: null };
      const row = await ctx.db
        .query("seoKeywordPositions")
        .withIndex("by_website_keyword_place_day", (q) =>
          q.eq("websiteId", site.website._id).eq("keyword", keyword).eq("locationCode", site.place).eq("day", args.day))
        .first();
      return { keyword, position: row?.position ?? null, url: row?.url ?? null };
    }));
    return found;
  },
});

/**
 * Wins and losses' columns that sort: the keyword A to Z; "From → to" by
 * where it stands now, from the top (a lost search stands nowhere, so last);
 * and the change by the size of the move, the biggest first, a rise or a
 * drop alike.
 */
const MOVE_SORTS: ListSorts<KeywordCopyRow, "keyword" | "fromTo" | "change"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  fromTo: { value: (row) => row.position, first: "asc" },
  change: { value: (row) => Math.abs(row.change), first: "desc" },
};

/**
 * Wins and losses: the searches that moved at the latest check — the same
 * moves the side menu counts (T10), for both are read from the site
 * rebuild's ranking day. A search that last moved at an older check has not
 * moved since, and is not listed as moving now. Wins and losses open on the
 * biggest move first; new and lost searches, which have no move to measure,
 * A to Z, as they always have.
 */
export const listMoves = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    status: v.union(v.literal("UP"), v.literal("DOWN"), v.literal("NEW"), v.literal("LOST")),
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("keyword"), v.literal("fromTo"), v.literal("change"))),
    direction: sortDirectionArg,
  },
  returns: listPageResult(keywordRowValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const copy = await readKeywordCopy(ctx, site.website._id, site.place);
    if (!copy) return preparingPage(args.rows);
    const matches = wordStartMatcher(args.search);
    const opening = args.status === "UP" || args.status === "DOWN" ? "change" : "keyword";
    const list = copy.rows
      .filter((row) => row.status === args.status && row.day === copy.rankingDay && (!matches || matches(row.keyword, row.page)))
      .sort(listOrder(MOVE_SORTS, args.sort ?? opening, args.direction, byKeyword));
    const page = pageOfList(list, args.page, args.rows);
    return { ...page, rows: await fullKeywordRows(ctx, page.rows) };
  },
});

/** A page as Top pages' compact copy holds it: every column the table sorts by. */
type PageCopyRow = {
  id: Id<"sitePageRanks">;
  path: string;
  section: string;
  pageType: string;
  keywords: number;
  traffic: number | null;
  topKeyword: string;
  bestPosition: number | null;
  referringDomains: number | null;
};

/**
 * Top pages' columns that sort, all held in the copy for every page: the
 * address A to Z, the best position from the top, the rest the most first.
 */
const PAGE_SORTS: ListSorts<PageCopyRow, "page" | "traffic" | "keywords" | "best" | "linking"> = {
  page: { value: (row) => row.path, first: "asc" },
  traffic: { value: (row) => row.traffic, first: "desc" },
  keywords: { value: (row) => row.keywords, first: "desc" },
  best: { value: (row) => row.bestPosition, first: "asc" },
  linking: { value: (row) => row.referringDomains, first: "desc" },
};

/**
 * The pages the site ranks with, most keywords first unless a heading asks
 * otherwise — in one folder, of one type, or matching a search (word starts,
 * T8) — with which AI engines cite each. Counted from Top pages' compact
 * copy, so the total is exact and any page opens at once.
 */
export const listPages = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    search: v.optional(v.string()),
    section: v.optional(v.string()),
    pageType: v.optional(pageTypeValidator),
    sort: v.optional(v.union(v.literal("page"), v.literal("traffic"), v.literal("keywords"), v.literal("best"), v.literal("linking"))),
    direction: sortDirectionArg,
  },
  returns: listPageResult(pageRowValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const place = site.place;
    const copy = await readListCopy(ctx, "pages", pagesCopyKey(websiteId, place), PAGE_COPY_FIELDS);
    if (!copy) return preparingPage(args.rows);
    const matches = wordStartMatcher(args.search);
    const pagesHeld: PageCopyRow[] = copy.rows.map(([id, path, section, pageType, keywords, traffic, topKeyword, bestPosition, referringDomains]) => ({
      id: id as Id<"sitePageRanks">,
      path: path as string,
      section: section as string,
      pageType: pageType as string,
      keywords: keywords as number,
      traffic: traffic as number | null,
      topKeyword: topKeyword as string,
      bestPosition: bestPosition as number | null,
      referringDomains: referringDomains as number | null,
    }));
    const name = (row: PageCopyRow) => row.path;
    const list = pagesHeld
      .filter((row) => (!args.section || row.section === args.section)
        && (!args.pageType || row.pageType === args.pageType)
        && (!matches || matches(row.path, row.topKeyword)))
      .sort(listOrder(PAGE_SORTS, args.sort ?? "keywords", args.direction, name));
    const shown = pageOfList(list, args.page, args.rows);
    const result = {
      page: (await Promise.all(shown.rows.map((row) => ctx.db.get(row.id)))).flatMap((row) => (row ? [row] : [])),
    };

    // Which engines cite each page on screen, by its path so every form of
    // its address counts: one short read per row, counting only the answers
    // to the questions this site is measured on (D17).
    const asked = new Set((await askedQuestions(ctx, listHold(site), place, QUESTIONS_FOR_CITED_PAGES))
      .map((entry) => `${entry.prompt}\u0000${entry.engine}\u0000${entry.locationCode}`));
    const page = await Promise.all(result.page.map(async (row) => {
      const citedRows = (await ctx.db
        .query("siteCitedPages")
        .withIndex("by_site_page", (q) => q.eq("websiteId", websiteId).eq("page", row.page))
        .take(CITED_ROWS_PER_PAGE))
        .filter((entry) => asked.has(`${entry.prompt}\u0000${entry.engine}\u0000${entry.locationCode}`));
      const cited = citedRows.length === 0 ? null : {
        engines: [...new Set(citedRows.map((entry) => entry.engine))].sort(),
        times: citedRows.reduce((sum, entry) => sum + entry.times, 0),
      };
      return {
        _id: row._id,
        page: row.page,
        url: row.url,
        section: row.section,
        keywords: row.keywords,
        bestPosition: row.bestPosition,
        top3: row.top3,
        volumeSum: row.volumeSum,
        topKeyword: row.topKeyword,
        topKeywordVolume: row.topKeywordVolume,
        firstSeenDay: row.firstSeenDay,
        day: row.day,
        aiEngines: cited?.engines ?? [],
        aiTimes: cited?.times ?? 0,
        traffic: row.traffic ?? null,
        trafficValue: row.trafficValue ?? null,
        pageRank: row.pageRank ?? null,
        referringDomains: row.referringDomains ?? null,
        backlinks: row.backlinks ?? null,
        pageType: row.pageType ?? "UNJUDGED",
      };
    }));
    return { ...shown, rows: page };
  },
});

/** The site's folders: pages, keywords and page-one results in each. */
export const listSections = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    section: v.string(),
    pages: v.number(),
    keywords: v.number(),
    top3: v.number(),
    volumeSum: v.number(),
    traffic: v.union(v.number(), v.null()),
    day: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rows = await ctx.db
      .query("siteSections")
      .withIndex("by_site_keywords", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place))
      .order("desc")
      .take(MAX_SECTIONS);
    return rows.map((row) => ({
      section: row.section,
      pages: row.pages,
      keywords: row.keywords,
      top3: row.top3,
      volumeSum: row.volumeSum,
      traffic: row.traffic ?? null,
      day: row.day ?? null,
    }));
  },
});
