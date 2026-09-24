import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { listWebsiteId, requireMySite, sitePage } from "./siteAccess";
import { askedQuestions, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import {
  kdBandValidator,
  pageTypeValidator,
  rankBandValidator,
  rankIntentValidator,
  rankStatusValidator,
} from "./utils/siteShapes";

/**
 * What a site ranks for on Google: every keyword, every page, every folder, and
 * what moved — read from the latest-rankings tables (`siteSchema.ts`).
 *
 * **One page at a time, from an index.** Each query picks the index that
 * matches its filter and sort, and reads only the rows on screen. A second
 * filter with no index of its own narrows that read, and `maximumRowsRead`
 * caps how far it may look before handing back a short page — so a rare
 * filter on a huge site returns quickly with fewer rows, rather than scanning
 * the site. See docs/plans/active/user-sites-plan.md, "Speed".
 */

/** How far a narrowed read may look for one page of matches. */
const MAX_ROWS_READ = 1_000;

/** Keywords looked up at once for the "compare with" column. */
const COMPARE_LIMIT = 50;

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

/**
 * Every keyword the site ranks for, best first, or most-searched first.
 *
 * Lost keywords are left out unless asked for by status: a list of what a
 * site ranks for should not end in everything it used to.
 */
export const listKeywords = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    band: v.optional(rankBandValidator),
    intent: v.optional(rankIntentValidator),
    status: v.optional(rankStatusValidator),
    page: v.optional(v.string()),
    /** How hard the search is, as a band of DataForSEO's difficulty. */
    kdBand: v.optional(kdBandValidator),
    sort: v.optional(v.union(v.literal("position"), v.literal("volume"), v.literal("traffic"), v.literal("cpc"))),
  },
  returns: paginationResultValidator(keywordRowValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const place = site.place;
    const narrowed = { ...sitePage(args.paginationOpts), maximumRowsRead: MAX_ROWS_READ };
    const { band, intent, status, page, kdBand } = args;
    const term = args.search?.trim();
    const shape = <Result extends { page: Rank[] }>(result: Result) => ({ ...result, page: result.page.map(keywordRow) });

    // A search reads the search index, most relevant first; the filters it
    // can take ride along as equality filters on the same index.
    if (term) {
      const result = await ctx.db
        .query("siteKeywordRanks")
        .withSearchIndex("search_text", (q) => {
          let search = q.search("searchText", term).eq("websiteId", websiteId).eq("locationCode", place);
          if (band) search = search.eq("band", band);
          if (intent) search = search.eq("intent", intent);
          if (status) search = search.eq("status", status);
          if (kdBand) search = search.eq("kdBand", kdBand);
          return search;
        })
        .filter((q) => q.and(
          page === undefined ? true : q.eq(q.field("page"), page),
          // Lost keywords only when asked for, as on every other path.
          band || status ? true : q.neq(q.field("band"), "zz_none"),
        ))
        .paginate(sitePage(args.paginationOpts));
      return shape(result);
    }

    // Most traffic, or the dearest clicks, first. Every filter narrows the read.
    if (args.sort === "traffic" || args.sort === "cpc") {
      const index = args.sort === "traffic" ? "by_site_traffic" : "by_site_cpc";
      const result = await ctx.db
        .query("siteKeywordRanks")
        .withIndex(index, (q) => q.eq("websiteId", websiteId).eq("locationCode", place))
        .order("desc")
        .filter((q) => q.and(
          band ? q.eq(q.field("band"), band) : status === "LOST" ? true : q.neq(q.field("band"), "zz_none"),
          intent ? q.eq(q.field("intent"), intent) : true,
          status ? q.eq(q.field("status"), status) : true,
          page !== undefined ? q.eq(q.field("page"), page) : true,
          kdBand ? q.eq(q.field("kdBand"), kdBand) : true,
        ))
        .paginate(narrowed);
      return shape(result);
    }

    if (args.sort === "volume") {
      const result = await (intent
        ? ctx.db
          .query("siteKeywordRanks")
          .withIndex("by_site_intent_volume", (q) =>
            q.eq("websiteId", websiteId).eq("locationCode", place).eq("intent", intent))
        : ctx.db
          .query("siteKeywordRanks")
          .withIndex("by_site_volume", (q) => q.eq("websiteId", websiteId).eq("locationCode", place)))
        .order("desc")
        .filter((q) => q.and(
          band ? q.eq(q.field("band"), band) : status === "LOST" ? true : q.neq(q.field("band"), "zz_none"),
          status ? q.eq(q.field("status"), status) : true,
          page !== undefined ? q.eq(q.field("page"), page) : true,
          kdBand ? q.eq(q.field("kdBand"), kdBand) : true,
        ))
        .paginate(narrowed);
      return shape(result);
    }

    // Best position first. The band leads each index after the site, and bands
    // sort as the positions they cover, so one range reads in position order
    // and a band filter is the same range made shorter.
    const live = status !== "LOST";
    if (page !== undefined) {
      const result = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_page_band_position", (q) => {
          const base = q.eq("websiteId", websiteId).eq("locationCode", place).eq("page", page);
          return band ? base.eq("band", band) : live ? base.lt("band", "zz_none") : base;
        })
        .filter((q) => q.and(
          intent ? q.eq(q.field("intent"), intent) : true,
          status ? q.eq(q.field("status"), status) : true,
          kdBand ? q.eq(q.field("kdBand"), kdBand) : true,
        ))
        .paginate(narrowed);
      return shape(result);
    }
    if (status) {
      const result = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_status_band_position", (q) => {
          const base = q.eq("websiteId", websiteId).eq("locationCode", place).eq("status", status);
          return band ? base.eq("band", band) : base;
        })
        .filter((q) => q.and(
          intent ? q.eq(q.field("intent"), intent) : true,
          kdBand ? q.eq(q.field("kdBand"), kdBand) : true,
        ))
        .paginate(narrowed);
      return shape(result);
    }
    if (intent) {
      const result = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_intent_band_position", (q) => {
          const base = q.eq("websiteId", websiteId).eq("locationCode", place).eq("intent", intent);
          return band ? base.eq("band", band) : base.lt("band", "zz_none");
        })
        .filter((q) => (kdBand ? q.eq(q.field("kdBand"), kdBand) : true))
        .paginate(narrowed);
      return shape(result);
    }
    if (kdBand) {
      const result = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_kd_band_position", (q) => {
          const base = q.eq("websiteId", websiteId).eq("locationCode", place).eq("kdBand", kdBand);
          return band ? base.eq("band", band) : base.lt("band", "zz_none");
        })
        .paginate(sitePage(args.paginationOpts));
      return shape(result);
    }
    const result = await ctx.db
      .query("siteKeywordRanks")
      .withIndex("by_site_band_position", (q) => {
        const base = q.eq("websiteId", websiteId).eq("locationCode", place);
        return band ? base.eq("band", band) : base.lt("band", "zz_none");
      })
      .paginate(sitePage(args.paginationOpts));
    return shape(result);
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

/** Wins and losses: keywords by how they moved at their last check, biggest move first. */
export const listMoves = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    status: v.union(v.literal("UP"), v.literal("DOWN"), v.literal("NEW"), v.literal("LOST")),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(keywordRowValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const term = args.search?.trim();
    // A search reads the search index, most relevant first, within the move chosen.
    const result = term
      ? await ctx.db
        .query("siteKeywordRanks")
        .withSearchIndex("search_text", (q) =>
          q.search("searchText", term).eq("websiteId", site.website._id).eq("locationCode", site.place).eq("status", args.status))
        .paginate(sitePage(args.paginationOpts))
      // Up is a positive change, so the biggest win is the largest; down is
      // negative, so the biggest drop is the smallest.
      : await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_status_change", (q) =>
          q.eq("websiteId", site.website._id).eq("locationCode", site.place).eq("status", args.status))
        .order(args.status === "UP" ? "desc" : "asc")
        .paginate(sitePage(args.paginationOpts));
    return { ...result, page: result.page.map(keywordRow) };
  },
});

/** The pages the site ranks with, most keywords first, with which AI engines cite each. */
export const listPages = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    section: v.optional(v.string()),
    pageType: v.optional(pageTypeValidator),
    sort: v.optional(v.union(v.literal("keywords"), v.literal("traffic"))),
  },
  returns: paginationResultValidator(pageRowValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const place = site.place;
    const term = args.search?.trim();
    const { section, pageType } = args;
    const narrowed = { ...sitePage(args.paginationOpts), maximumRowsRead: MAX_ROWS_READ };

    const result = term
      ? await ctx.db
        .query("sitePageRanks")
        .withSearchIndex("search_text", (q) => {
          let search = q.search("searchText", term).eq("websiteId", websiteId).eq("locationCode", place);
          if (section) search = search.eq("section", section);
          if (pageType) search = search.eq("pageType", pageType);
          return search;
        })
        .paginate(sitePage(args.paginationOpts))
      : args.sort === "traffic"
        ? await ctx.db
          .query("sitePageRanks")
          .withIndex("by_site_traffic", (q) => q.eq("websiteId", websiteId).eq("locationCode", place))
          .order("desc")
          .filter((q) => q.and(
            section ? q.eq(q.field("section"), section) : true,
            pageType ? q.eq(q.field("pageType"), pageType) : true,
          ))
          .paginate(narrowed)
        : section
          ? await ctx.db
            .query("sitePageRanks")
            .withIndex("by_site_section_keywords", (q) =>
              q.eq("websiteId", websiteId).eq("locationCode", place).eq("section", section))
            .order("desc")
            .filter((q) => (pageType ? q.eq(q.field("pageType"), pageType) : true))
            .paginate(narrowed)
          : pageType
            ? await ctx.db
              .query("sitePageRanks")
              .withIndex("by_site_type_keywords", (q) =>
                q.eq("websiteId", websiteId).eq("locationCode", place).eq("pageType", pageType))
              .order("desc")
              .paginate(sitePage(args.paginationOpts))
            : await ctx.db
              .query("sitePageRanks")
              .withIndex("by_site_keywords", (q) => q.eq("websiteId", websiteId).eq("locationCode", place))
              .order("desc")
              .paginate(sitePage(args.paginationOpts));

    // Which engines cite each page on screen, by its path so every form of
    // its address counts: one short read per row, counting only the answers
    // to the questions this site is measured on (D17).
    const asked = new Set((await askedQuestions(ctx, listWebsiteId(site), place, QUESTIONS_FOR_CITED_PAGES))
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
    return { ...result, page };
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
