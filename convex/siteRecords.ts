import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { aiEngineValidator } from "./seoAiEngines";
import { normaliseKeyword } from "./seoJudgments";
import { listHold, myRivals, requireMySite } from "./siteAccess";
import { holdSearch } from "./holdLists";
import { keywordStanding, readKeywordCopy } from "./siteKeywordCopy";
import { heldTo, listOrder, listPageArgs, listPageResult, pageOfList, preparingPage, sortDirectionArg, type ListSorts } from "./siteListPages";
import { bare, isHost } from "./siteGoogleSerp";
import { askedQuestions, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import {
  keywordFeatureValidator,
  pageTypeValidator,
  rankBandValidator,
  rankIntentValidator,
  rankStatusValidator,
} from "./utils/siteShapes";

/**
 * One record's own screen on the client's Sites pages: everything stored about
 * one keyword, or one page, read by its key.
 *
 * Anthony, 2026-09-24: "I don't want any modals that are clickable from the
 * tables or anywhere in this section. These are all new screens with a back
 * button" (docs/plans/active/sites-ux-updates-plan.md §3). A table shows the
 * few columns a reader decides on; the rest of what we keep about a row is
 * here, on the screen the row opens.
 *
 * Point reads only: each part is one index lookup by the record's key, capped,
 * so a record's screen costs the same on a site of a hundred keywords as on
 * one of ten thousand.
 */

/** Rivals looked up for "your competitors on this search". A group is a handful. */
const MAX_RIVALS = 12;

/** A page's citation rows, one per form of its address per question, engine and place. */
const CITED_ROWS = 400;

/** Questions listed as citing one page. */
const CITING_QUESTIONS_SHOWN = 20;

/** Linking pages listed on a page's screen; the count beside them is the whole. */
const LINKS_SHOWN = 10;

/** Results kept per results page: Google's hundred. */
const SERP_RESULTS = 100;

/**
 * A feature's rows read whole: at most the newest full keyword list, whose
 * limit is 10,000, with room for an older list's rows not yet cleared.
 */
const FEATURE_LIST_READ = 15_000;

/** A keyword no longer than any search anybody types. */
const MAX_KEYWORD = 200;

/** A path no longer than an address a browser keeps. */
const MAX_PATH = 2_000;

const nullableNumber = v.union(v.number(), v.null());
const nullableString = v.union(v.string(), v.null());

const rankValidator = v.object({
  position: nullableNumber,
  band: rankBandValidator,
  status: rankStatusValidator,
  change: v.number(),
  previousPosition: nullableNumber,
  previousDay: nullableString,
  url: nullableString,
  page: v.string(),
  previousPage: nullableString,
  volume: nullableNumber,
  intent: rankIntentValidator,
  day: v.string(),
  firstSeenDay: v.string(),
  cpc: nullableNumber,
  difficulty: nullableNumber,
  trend: v.array(v.number()),
  serpFeatures: v.array(v.string()),
  traffic: nullableNumber,
  trafficValue: nullableNumber,
  pageRank: nullableNumber,
  pageReferringDomains: nullableNumber,
  pageBacklinks: nullableNumber,
  competition: nullableNumber,
  competitionLevel: nullableString,
  searchIntent: nullableString,
  resultsCount: nullableNumber,
});

function rankOf(row: Doc<"siteKeywordRanks">) {
  return {
    position: row.position ?? null,
    band: row.band,
    status: row.status,
    change: row.change,
    previousPosition: row.previousPosition ?? null,
    previousDay: row.previousDay ?? null,
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
    serpFeatures: row.serpFeatures ?? [],
    traffic: row.traffic ?? null,
    trafficValue: row.trafficValue ?? null,
    pageRank: row.pageRank ?? null,
    pageReferringDomains: row.pageReferringDomains ?? null,
    pageBacklinks: row.pageBacklinks ?? null,
    competition: row.competition ?? null,
    competitionLevel: row.competitionLevel ?? null,
    searchIntent: row.searchIntent ?? null,
    resultsCount: row.resultsCount ?? null,
  };
}

/**
 * Everything kept about one search this site ranks for, or could: where it
 * stands and what the search is worth, where else on Google's page it shows,
 * how its competitors do on the same search, and whether it is one of the
 * searches the site is measured on every day. The screen draws the position
 * history itself, from `searchPositions`.
 */
export const keywordRecord = tenantQuery({
  args: { siteId: v.id("companyWebsites"), keyword: v.string() },
  returns: v.object({
    keyword: v.string(),
    rank: v.union(rankValidator, v.null()),
    // What the search itself is worth — the same whoever ranks for it — from
    // this site's ranking, or a competitor's when this site does not rank.
    search: v.union(v.object({
      volume: nullableNumber,
      cpc: nullableNumber,
      difficulty: nullableNumber,
      competitionLevel: nullableString,
      searchIntent: nullableString,
      resultsCount: nullableNumber,
      trend: v.array(v.number()),
      serpFeatures: v.array(v.string()),
      intent: rankIntentValidator,
    }), v.null()),
    features: v.array(v.object({
      feature: keywordFeatureValidator,
      position: nullableNumber,
      page: nullableString,
      day: v.string(),
    })),
    rivals: v.array(v.object({
      siteId: v.id("companyWebsites"),
      host: v.string(),
      relationship: v.union(v.literal("OWNED"), v.literal("TRACKED")),
      position: nullableNumber,
      page: nullableString,
      day: nullableString,
    })),
    tracked: v.union(v.object({
      isActive: v.boolean(),
      lastPosition: nullableNumber,
      bestPosition: nullableNumber,
      firstCheckedDay: nullableString,
      lastCheckedDay: nullableString,
    }), v.null()),
    // Google's page for the search as its newest check found it — kept for the
    // searches the site is measured on.
    serp: v.union(v.object({
      day: v.string(),
      results: v.array(v.object({
        position: v.number(),
        domain: v.string(),
        url: nullableString,
        isYou: v.boolean(),
        rivalSiteId: v.union(v.id("companyWebsites"), v.null()),
      })),
      features: v.array(v.string()),
      questions: v.array(v.string()),
      related: v.array(v.string()),
    }), v.null()),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const keyword = normaliseKeyword(args.keyword).slice(0, MAX_KEYWORD);
    const websiteId = site.website._id;
    const place = site.place;

    const [rank, features, rivals, listed, stats, serp] = await Promise.all([
      ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_keyword", (q) => q.eq("websiteId", websiteId).eq("locationCode", place).eq("keyword", keyword))
        .first(),
      ctx.db
        .query("siteKeywordFeatures")
        .withIndex("by_site_keyword", (q) => q.eq("websiteId", websiteId).eq("locationCode", place).eq("keyword", keyword))
        .take(20),
      myRivals(ctx, site),
      // On this company's own list, or not: never another company's.
      holdSearch(ctx, listHold(site), keyword),
      ctx.db
        .query("websiteSearchStats")
        .withIndex("by_key", (q) => q.eq("websiteId", websiteId).eq("keyword", keyword).eq("locationCode", place))
        .first(),
      ctx.db
        .query("siteSerpPages")
        .withIndex("by_keyword_place_day", (q) => q.eq("keyword", keyword).eq("locationCode", place))
        .order("desc")
        .first(),
    ]);

    // Each competitor's own latest ranking for the same search, from the same place.
    const rivalRanks = await Promise.all(rivals.slice(0, MAX_RIVALS).map(async (rival) => ({
      rival,
      row: await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_keyword", (q) =>
          q.eq("websiteId", rival.website._id).eq("locationCode", place).eq("keyword", keyword))
        .first(),
    })));
    const facts = rank ?? rivalRanks.find((entry) => entry.row !== null)?.row ?? null;
    const rivalRows = rivalRanks.map(({ rival, row }) => {
      const ranking = row && row.status !== "LOST" ? row : null;
      return {
        siteId: rival.hold._id,
        host: rival.summary.host,
        relationship: rival.summary.relationship,
        position: ranking?.position ?? null,
        page: ranking?.page ?? null,
        day: row?.day ?? null,
      };
    });

    return {
      keyword,
      rank: rank ? rankOf(rank) : null,
      search: facts
        ? {
          volume: facts.volumeKnown ? facts.volume : null,
          cpc: facts.cpc ?? null,
          difficulty: facts.difficulty ?? null,
          competitionLevel: facts.competitionLevel ?? null,
          searchIntent: facts.searchIntent ?? null,
          resultsCount: facts.resultsCount ?? null,
          trend: facts.trend ?? [],
          serpFeatures: facts.serpFeatures ?? [],
          intent: facts.intent,
        }
        : null,
      features: features.map((row) => ({
        feature: row.feature,
        position: row.position ?? null,
        page: row.page ?? null,
        day: row.day,
      })),
      rivals: rivalRows.sort((left, right) => (left.position ?? 999) - (right.position ?? 999) || left.host.localeCompare(right.host)),
      // The tracked facts and the results page exist because somebody tracks
      // the search, so they are shown only when this company does — they
      // would otherwise say that someone else tracks it
      // (docs/plans/active/private-tracking-lists-plan.md).
      tracked: listed
        ? {
          isActive: listed.isActive,
          lastPosition: stats?.lastPosition ?? null,
          bestPosition: stats?.bestPosition ?? null,
          firstCheckedDay: stats?.firstCheckedDay ?? null,
          lastCheckedDay: stats?.lastCheckedDay ?? null,
        }
        : null,
      serp: serp && listed
        ? {
          day: serp.day,
          results: serp.results.slice(0, SERP_RESULTS).map((result) => {
            const rival = rivals.find((entry) => isHost(result.domain, entry.website.host));
            return {
              position: result.position,
              domain: bare(result.domain),
              url: result.url ?? null,
              isYou: isHost(result.domain, site.website.host),
              rivalSiteId: rival ? rival.hold._id : null,
            };
          }),
          features: serp.features,
          questions: serp.questions,
          related: serp.related,
        }
        : null,
    };
  },
});

/**
 * Everything kept about one page of this site: how it ranks and what that
 * brings, what the newest crawl found on it, which AI answers link to it, and
 * the websites linking to it. Its keywords are the All keywords list narrowed
 * to it (`listKeywords` with `page`), which the screen pages itself.
 */
export const pageRecord = tenantQuery({
  args: { siteId: v.id("companyWebsites"), page: v.string() },
  returns: v.object({
    page: v.string(),
    rank: v.union(v.object({
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
      traffic: nullableNumber,
      trafficValue: nullableNumber,
      pageRank: nullableNumber,
      referringDomains: nullableNumber,
      backlinks: nullableNumber,
      pageType: pageTypeValidator,
    }), v.null()),
    crawl: v.union(v.object({
      url: v.string(),
      day: v.string(),
      statusCode: nullableNumber,
      problems: v.array(v.string()),
      score: nullableNumber,
      loadMs: nullableNumber,
      largestPaintMs: nullableNumber,
      sizeBytes: nullableNumber,
      words: nullableNumber,
      internalLinks: nullableNumber,
      externalLinks: nullableNumber,
      inboundLinks: nullableNumber,
      clickDepth: nullableNumber,
      redirectTo: nullableString,
      canonical: nullableString,
    }), v.null()),
    cited: v.object({
      times: v.number(),
      questions: v.array(v.object({
        prompt: v.string(),
        engine: aiEngineValidator,
        times: v.number(),
        lastDay: v.string(),
      })),
    }),
    links: v.array(v.object({
      // One linking page can link here twice — once with words, once with an image.
      _id: v.id("siteBacklinks"),
      domainFrom: v.string(),
      urlFrom: v.string(),
      anchor: nullableString,
      dofollow: v.boolean(),
      domainRank: v.number(),
      status: v.union(v.literal("LIVE"), v.literal("NEW"), v.literal("LOST")),
      firstSeen: nullableString,
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const page = args.page.slice(0, MAX_PATH);
    const websiteId = site.website._id;
    const place = site.place;

    const [rank, crawl, citedRows, asked, links] = await Promise.all([
      ctx.db
        .query("sitePageRanks")
        .withIndex("by_site_page", (q) => q.eq("websiteId", websiteId).eq("locationCode", place).eq("page", page))
        .first(),
      ctx.db
        .query("siteCrawlPages")
        .withIndex("by_site_page", (q) => q.eq("websiteId", websiteId).eq("page", page))
        .order("desc")
        .first(),
      ctx.db
        .query("siteCitedPages")
        .withIndex("by_site_page", (q) => q.eq("websiteId", websiteId).eq("page", page))
        .take(CITED_ROWS),
      askedQuestions(ctx, listHold(site), place, QUESTIONS_FOR_CITED_PAGES),
      // The strongest links first, from the list of every link kept.
      ctx.db
        .query("siteBacklinks")
        .withIndex("by_site_pass_page_rank", (q) => q.eq("websiteId", websiteId).eq("pass", "ALL").eq("pageTo", page))
        .order("desc")
        .take(LINKS_SHOWN),
    ]);

    // Only the answers to the questions this site is measured on count (D17),
    // and every form of the page's address is the one page.
    const wanted = new Set(asked.map((entry) => `${entry.prompt}\u0000${entry.engine}\u0000${entry.locationCode}`));
    const byQuestion = new Map<string, { prompt: string; engine: Doc<"siteCitedPages">["engine"]; times: number; lastDay: string }>();
    for (const row of citedRows) {
      if (!wanted.has(`${row.prompt}\u0000${row.engine}\u0000${row.locationCode}`)) continue;
      const key = `${row.prompt}\u0000${row.engine}`;
      const held = byQuestion.get(key);
      if (held) {
        held.times += row.times;
        if (row.lastDay > held.lastDay) held.lastDay = row.lastDay;
      } else {
        byQuestion.set(key, { prompt: row.prompt, engine: row.engine, times: row.times, lastDay: row.lastDay });
      }
    }
    const questions = [...byQuestion.values()].sort((left, right) => right.times - left.times || left.prompt.localeCompare(right.prompt));

    return {
      page,
      rank: rank
        ? {
          url: rank.url,
          section: rank.section,
          keywords: rank.keywords,
          bestPosition: rank.bestPosition,
          top3: rank.top3,
          volumeSum: rank.volumeSum,
          topKeyword: rank.topKeyword,
          topKeywordVolume: rank.topKeywordVolume,
          firstSeenDay: rank.firstSeenDay,
          day: rank.day,
          traffic: rank.traffic ?? null,
          trafficValue: rank.trafficValue ?? null,
          pageRank: rank.pageRank ?? null,
          referringDomains: rank.referringDomains ?? null,
          backlinks: rank.backlinks ?? null,
          pageType: rank.pageType ?? "UNJUDGED",
        }
        : null,
      crawl: crawl
        ? {
          url: crawl.url,
          day: crawl.day,
          statusCode: crawl.statusCode ?? null,
          problems: crawl.problems,
          score: crawl.score ?? null,
          loadMs: crawl.loadMs ?? null,
          largestPaintMs: crawl.largestPaintMs ?? null,
          sizeBytes: crawl.sizeBytes ?? null,
          words: crawl.words ?? null,
          internalLinks: crawl.internalLinks ?? null,
          externalLinks: crawl.externalLinks ?? null,
          inboundLinks: crawl.inboundLinks ?? null,
          clickDepth: crawl.clickDepth ?? null,
          redirectTo: crawl.redirectTo ?? null,
          canonical: crawl.canonical ?? null,
        }
        : null,
      cited: {
        times: questions.reduce((sum, entry) => sum + entry.times, 0),
        questions: questions.slice(0, CITING_QUESTIONS_SHOWN),
      },
      links: links.map((row) => ({
        _id: row._id,
        domainFrom: row.domainFrom,
        urlFrom: row.urlFrom,
        anchor: row.anchor ?? null,
        dofollow: row.dofollow,
        domainRank: row.domainRank,
        status: row.status,
        firstSeen: row.firstSeen ?? null,
      })),
    };
  },
});

/**
 * The searches behind one of Search features' figures — every search where
 * this site shows in an AI Overview, holds the answer box, or sits in the map
 * of local businesses — from the newest keyword list's feature rows. Each with
 * where the site ranks in the ordinary results and how often it is searched,
 * from the site's keyword copy read once, so every row has both before the
 * order is chosen and any column sorts the whole list (docs/plans/active/
 * sites-table-sorting-plan.md §4.6). Most searched first unless a heading
 * asks otherwise.
 */
/**
 * A feature's searches' columns that sort: the search A to Z, its place in
 * the feature and its ordinary ranking from the top, and the most searched
 * first.
 */
const FEATURE_SORTS: ListSorts<{ keyword: string; position: number | null; organicPosition: number | null; volume: number | null }, "keyword" | "position" | "organic" | "volume"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  position: { value: (row) => row.position, first: "asc" },
  organic: { value: (row) => row.organicPosition, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
};

export const featureKeywords = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    feature: keywordFeatureValidator,
    ...listPageArgs,
    sort: v.optional(v.union(v.literal("keyword"), v.literal("position"), v.literal("organic"), v.literal("volume"))),
    direction: sortDirectionArg,
  },
  returns: listPageResult(v.object({
    _id: v.id("siteKeywordFeatures"),
    keyword: v.string(),
    position: nullableNumber,
    page: nullableString,
    day: v.string(),
    organicPosition: nullableNumber,
    volume: nullableNumber,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const place = site.place;
    // Read whole — a feature is a share of one keyword list — and counted
    // exactly (docs/plans/active/sites-table-pages-plan.md §5.1). An older
    // list's row for a search this one also holds is not counted twice.
    const read = await ctx.db
      .query("siteKeywordFeatures")
      .withIndex("by_site_feature_keyword", (q) => q.eq("websiteId", websiteId).eq("locationCode", place).eq("feature", args.feature))
      .take(FEATURE_LIST_READ + 1);
    const { rows: held, cut } = heldTo(read, FEATURE_LIST_READ);
    const newest = new Map<string, Doc<"siteKeywordFeatures">>();
    for (const row of held) {
      const kept = newest.get(row.keyword);
      if (!kept || row.day > kept.day) newest.set(row.keyword, row);
    }
    const copy = await readKeywordCopy(ctx, websiteId, place);
    if (!copy) return preparingPage(args.rows);
    const ranks = new Map(copy.rows.map((row) => [row.keyword, row]));
    const list = [...newest.values()].map((row) => {
      const rank = ranks.get(row.keyword);
      return {
        _id: row._id,
        keyword: row.keyword,
        position: row.position ?? null,
        page: row.page ?? null,
        day: row.day,
        organicPosition: rank && rank.status !== "LOST" ? rank.position : null,
        volume: rank?.volume ?? null,
      };
    }).sort(listOrder(FEATURE_SORTS, args.sort ?? "volume", args.direction, (row) => row.keyword));
    return pageOfList(list, args.page, args.rows, cut);
  },
});

/**
 * The searches this site and one of its competitors both rank for, the
 * competitor's most valuable first, each with where both stand — or only
 * those where the competitor is ahead, or only those where this site is. The
 * competitor must be one beside this site (its group, `myRivals`): an address
 * cannot compare against a website the company does not hold.
 *
 * Read from the competitor's own latest rankings, a page at a time, each
 * beside this site's for the same search from the same place; a page with
 * few shared searches comes back short, and the table tops it up.
 */
/**
 * A competitor's shared searches' columns that sort: the search A to Z, both
 * positions from the top, the most places between the two first, and the
 * most searched and the competitor's most visits first — its opening order.
 */
const SHARED_SORTS: ListSorts<{ keyword: string; theirPosition: number; yourPosition: number; volume: number | null; theirTraffic: number | null }, "keyword" | "theirs" | "yours" | "gap" | "volume" | "theirVisits"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  theirs: { value: (row) => row.theirPosition, first: "asc" },
  yours: { value: (row) => row.yourPosition, first: "asc" },
  gap: { value: (row) => Math.abs(row.theirPosition - row.yourPosition), first: "desc" },
  volume: { value: (row) => row.volume, first: "desc" },
  theirVisits: { value: (row) => row.theirTraffic, first: "desc" },
};

export const sharedSearches = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    rivalId: v.id("companyWebsites"),
    lead: v.optional(v.union(v.literal("THEM"), v.literal("YOU"))),
    ...listPageArgs,
    sort: v.optional(v.union(
      v.literal("keyword"), v.literal("theirs"), v.literal("yours"), v.literal("gap"), v.literal("volume"), v.literal("theirVisits"),
    )),
    direction: sortDirectionArg,
  },
  returns: listPageResult(v.object({
    _id: v.id("siteKeywordRanks"),
    keyword: v.string(),
    theirPosition: v.number(),
    yourPosition: v.number(),
    volume: nullableNumber,
    theirTraffic: nullableNumber,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rival = (await myRivals(ctx, site)).find((entry) => entry.hold._id === args.rivalId);
    if (!rival) throw appError("NOT_FOUND", "That website is not one beside this one.");
    const place = site.place;
    // Both sides from their compact copies, matched in memory: the total is
    // every search both rank for at the latest check, not a page's worth of
    // the competitor's list with the misses dropped (§5.2).
    const [theirs, ours] = await Promise.all([
      readKeywordCopy(ctx, rival.website._id, place),
      readKeywordCopy(ctx, site.website._id, place),
    ]);
    if (!theirs || !ours) return preparingPage(args.rows);
    const yours = new Map(ours.rows
      .filter((row) => keywordStanding(row, ours.latestCheckDay) === "current")
      .map((row) => [row.keyword, row.position as number]));
    const shared = theirs.rows.flatMap((row) => {
      if (keywordStanding(row, theirs.latestCheckDay) !== "current") return [];
      const yourPosition = yours.get(row.keyword);
      const theirPosition = row.position as number;
      if (yourPosition === undefined) return [];
      if (args.lead === "THEM" && !(theirPosition < yourPosition)) return [];
      if (args.lead === "YOU" && !(yourPosition < theirPosition)) return [];
      return [{ id: row.id, keyword: row.keyword, theirPosition, yourPosition, volume: row.volume, theirTraffic: row.traffic }];
    }).sort(listOrder(SHARED_SORTS, args.sort ?? "theirVisits", args.direction, (row) => row.keyword));
    const shown = pageOfList(shared, args.page, args.rows);
    // Read in full by id, to be sure each row on screen is still there.
    const rows = await Promise.all(shown.rows.map(async ({ id, ...row }) => ((await ctx.db.get(id)) ? { _id: id, ...row } : null)));
    return { ...shown, rows: rows.filter((row) => row !== null) };
  },
});
