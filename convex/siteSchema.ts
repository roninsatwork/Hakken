import { defineTable } from "convex/server";
import { v } from "convex/values";
import { aiEngineValidator } from "./seoAiEngines";
import {
  bandCountsValidator,
  engineDayValidator,
  kdBandValidator,
  pageTypeValidator,
  rankBandValidator,
  rankIntentValidator,
  keywordFeatureValidator,
  rankStatusValidator,
  runReportFields,
} from "./utils/siteShapes";

/** A number that may be unknown: DataForSEO leaves out what it does not have. */
const maybeNumber = v.optional(v.number());

/** Which list a backlink came from: one per linking website, or every broken one. */
const linkPassValidator = v.union(v.literal("ONE_PER_DOMAIN"), v.literal("BROKEN"), v.literal("ALL"));

/** Whether a link, linking website, anchor or server is still there, new, or gone. */
const linkStatusValidator = v.union(v.literal("LIVE"), v.literal("NEW"), v.literal("LOST"));

/**
 * The tables behind the client's Sites screens.
 *
 * See docs/plans/active/user-sites-plan.md, "Speed". Every Sites table is
 * searched, filtered, sorted and paged on the server, so what it reads has to
 * be shaped for that before anybody asks: the **latest** ranking of each
 * keyword and page rather than two years of rows to pick it out of, and a
 * **summary per day** that a chart can read instead of counting.
 *
 * Nothing here is bought. Every row is worked out from what DataForSEO sent
 * and the parser already filed (`seoKeywordPositions`, `seoWebsiteMetrics`,
 * `aiAnswers`, `aiCitations`), so all of it can be rebuilt from those at any
 * time, and the test-data reset and the website purge clear it with them.
 *
 * The website-level tables name no company: a host's rankings are the same
 * whoever watches it, which is the whole reason it is collected once. Only the
 * content gap is per hold, because it depends on which rivals a company chose.
 */
export const siteTables = {
  /**
   * The latest check of every search a website ranks for, from one place.
   *
   * One row per website, place and keyword, updated as each result is filed,
   * so "every keyword this site ranks for, best first" is one index range and
   * never a hunt for the newest of two years of rows. A search the site used to
   * rank for and no longer does stays, marked `LOST`, so the screen can say so.
   */
  siteKeywordRanks: defineTable({
    websiteId: v.id("websites"),
    locationCode: v.number(),
    /** Normalised, as `seoKeywordIntents` keys it. */
    keyword: v.string(),
    position: v.optional(v.number()),
    band: rankBandValidator,
    url: v.optional(v.string()),
    /** The ranking page's path, or "" when there is none. */
    page: v.string(),
    /** Monthly searches; 0 when unknown, which `volumeKnown` says. */
    volume: v.number(),
    volumeKnown: v.boolean(),
    intent: rankIntentValidator,
    status: rankStatusValidator,
    /** Places moved since the check before: positive is up. 0 when either side is missing. */
    change: v.number(),
    previousPosition: v.optional(v.number()),
    previousDay: v.optional(v.string()),
    previousPage: v.optional(v.string()),
    /** The day of the last check. */
    day: v.string(),
    firstSeenDay: v.string(),
    /** Keyword and page path, for the search box. */
    searchText: v.string(),
    // What a ranked-keywords pull says about the search (Phase 2): what a
    // click costs, how hard it is (0–100, and its band for the filter), how it
    // was searched month by month over the last year, oldest first, and what
    // else its results page shows.
    cpc: maybeNumber,
    difficulty: maybeNumber,
    kdBand: v.optional(kdBandValidator),
    trend: v.optional(v.array(v.number())),
    serpFeatures: v.optional(v.array(v.string())),
    // The visits DataForSEO estimates the site gets from it each month, and
    // what they would cost as ads; and the ranking page's page rank and
    // links (never its title — no page text is kept, see
    // `dataForSeoParsers.ts`). Dropped when the search is lost.
    traffic: maybeNumber,
    trafficValue: maybeNumber,
    pageRank: maybeNumber,
    pageReferringDomains: maybeNumber,
    pageBacklinks: maybeNumber,
    /**
     * What else DataForSEO says about the search and this ranking (2026-09-24,
     * "store whatever we can"): how competitive the search is for adverts
     * (0–1, and as LOW/MEDIUM/HIGH), what it reads the searcher as wanting,
     * how many results Google has for it, and — from the full list — where the
     * site was at DataForSEO's previous check and whether it is new, up or down.
     */
    competition: maybeNumber,
    competitionLevel: v.optional(v.string()),
    searchIntent: v.optional(v.string()),
    resultsCount: maybeNumber,
    previousPositionDfs: maybeNumber,
    movementDfs: v.optional(v.union(v.literal("NEW"), v.literal("UP"), v.literal("DOWN"), v.literal("SAME"))),
    updatedAt: v.number(),
  })
    .index("by_site_keyword", ["websiteId", "locationCode", "keyword"])
    .index("by_site_band_position", ["websiteId", "locationCode", "band", "position"])
    .index("by_site_intent_band_position", ["websiteId", "locationCode", "intent", "band", "position"])
    .index("by_site_status_band_position", ["websiteId", "locationCode", "status", "band", "position"])
    // Wins and losses, biggest move first.
    .index("by_site_status_change", ["websiteId", "locationCode", "status", "change"])
    .index("by_site_volume", ["websiteId", "locationCode", "volume"])
    .index("by_site_intent_volume", ["websiteId", "locationCode", "intent", "volume"])
    .index("by_site_page_band_position", ["websiteId", "locationCode", "page", "band", "position"])
    .index("by_site_kd_band_position", ["websiteId", "locationCode", "kdBand", "band", "position"])
    .index("by_site_traffic", ["websiteId", "locationCode", "traffic"])
    .index("by_site_cpc", ["websiteId", "locationCode", "cpc"])
    .index("by_keyword", ["keyword"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["websiteId", "locationCode", "band", "intent", "status", "kdBand"],
    }),

  /**
   * Each page a website ranks with, from one place: how many searches, its best
   * position, and the search that brings it the most. Rebuilt from
   * `siteKeywordRanks` after each filing (`siteSummaries.ts`), never added to.
   */
  sitePageRanks: defineTable({
    websiteId: v.id("websites"),
    locationCode: v.number(),
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
    searchText: v.string(),
    // Summed or carried from its keywords (Phase 2): estimated visits and
    // their value as ads, DataForSEO's page rank (0–1000) and the links to
    // the page, and what kind of page it is.
    traffic: maybeNumber,
    trafficValue: maybeNumber,
    pageRank: maybeNumber,
    referringDomains: maybeNumber,
    backlinks: maybeNumber,
    pageType: v.optional(pageTypeValidator),
    /** The rebuild that wrote this row; rows from an older one are removed after it. */
    rebuildId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_site_page", ["websiteId", "locationCode", "page"])
    .index("by_site_keywords", ["websiteId", "locationCode", "keywords"])
    .index("by_site_section_keywords", ["websiteId", "locationCode", "section", "keywords"])
    .index("by_site_traffic", ["websiteId", "locationCode", "traffic"])
    .index("by_site_type_keywords", ["websiteId", "locationCode", "pageType", "keywords"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["websiteId", "locationCode", "section", "pageType"],
    }),

  /** The site's folders, from its ranking pages. Rebuilt with `sitePageRanks`. */
  siteSections: defineTable({
    websiteId: v.id("websites"),
    locationCode: v.number(),
    section: v.string(),
    pages: v.number(),
    keywords: v.number(),
    top3: v.number(),
    volumeSum: v.number(),
    traffic: maybeNumber,
    /** The newest check of any page in it. */
    day: v.optional(v.string()),
    rebuildId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_site_section", ["websiteId", "locationCode", "section"])
    .index("by_site_keywords", ["websiteId", "locationCode", "keywords"]),

  /**
   * One row per website, place and day: everything a chart or a headline
   * number reads, so none of them counts anything on page load.
   *
   * Written in parts by whoever holds each part — the ranking rebuild, the
   * metrics filing, the AI answer filing — each patching its own fields.
   */
  siteDaySummaries: defineTable({
    websiteId: v.id("websites"),
    locationCode: v.number(),
    day: v.string(),
    // Rankings, as of the rebuild on this day.
    keywords: v.optional(v.number()),
    bands: v.optional(bandCountsValidator),
    pages: v.optional(v.number()),
    rankedUp: v.optional(v.number()),
    rankedDown: v.optional(v.number()),
    rankedNew: v.optional(v.number()),
    rankedLost: v.optional(v.number()),
    buying: v.optional(v.number()),
    researching: v.optional(v.number()),
    branded: v.optional(v.number()),
    // DataForSEO's own figures for the site, from `seoWebsiteMetrics`.
    rankedKeywordsTotal: v.optional(v.number()),
    estimatedTraffic: v.optional(v.number()),
    backlinks: v.optional(v.number()),
    referringDomains: v.optional(v.number()),
    referringMainDomains: v.optional(v.number()),
    domainRank: v.optional(v.number()),
    brokenBacklinks: v.optional(v.number()),
    // Phase 2, from the same rows: DataForSEO's own position bands and
    // new / up / down / lost counts across everything the site ranks for (not
    // only the keywords a capped pull returned), the traffic's value as ads,
    // and the link-quality figures.
    allBands: v.optional(bandCountsValidator),
    trafficValue: maybeNumber,
    keywordsNew: maybeNumber,
    keywordsUp: maybeNumber,
    keywordsDown: maybeNumber,
    keywordsLost: maybeNumber,
    spamScore: maybeNumber,
    brokenPages: maybeNumber,
    // Paid search, from the ranking history (Phase 4/5): how many searches the
    // site buys adverts on, the visits they bring and what they cost a month.
    paidKeywords: maybeNumber,
    paidTraffic: maybeNumber,
    paidTrafficCost: maybeNumber,
    // Across everything the site ranks for: searches showing it in a featured
    // snippet, a map pack, or among an AI Overview's references (Phase 5).
    featuredSnippets: maybeNumber,
    localPacks: maybeNumber,
    aiOverviewRefs: maybeNumber,
    // Pages the site crawl reached, and its technical score (Phase 5).
    crawledPages: maybeNumber,
    onPageScore: maybeNumber,
    // The site's own questions, answered on this day.
    ai: v.optional(v.array(engineDayValidator)),
    updatedAt: v.number(),
  }).index("by_site_day", ["websiteId", "locationCode", "day"]),

  /**
   * How often the AI answers to one question linked to a page of a website:
   * a row per page address, per question as sent, per engine and place.
   *
   * Per question because the answers are shared: two companies asking the
   * same question buy one answer, and a page cited in answers to another
   * company's question is not this company's to count (D17). The screens add
   * up the rows of the questions a site is measured on (`citedPagesOf` in
   * `siteFigures.ts`). Recounted from `aiCitations` per filing
   * (`recountCitedPages` in `siteRankings.ts`).
   */
  siteCitedPages: defineTable({
    websiteId: v.id("websites"),
    url: v.string(),
    page: v.string(),
    prompt: v.string(),
    engine: aiEngineValidator,
    locationCode: v.number(),
    times: v.number(),
    firstDay: v.string(),
    lastDay: v.string(),
    updatedAt: v.number(),
  })
    .index("by_site_url", ["websiteId", "url"])
    // A page's citations under every form of its address — with and without
    // "www", http or https — are one page on the screen.
    .index("by_site_page", ["websiteId", "page"])
    .index("by_site_question", ["websiteId", "prompt", "engine", "locationCode"]),

  /**
   * Searches a company's tracked rivals rank for and its own site does not.
   *
   * Per hold, because the rivals are the company's own choice. Rebuilt after
   * any of the sites involved is filed (`siteContentGap.ts`).
   */
  siteContentGaps: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    keyword: v.string(),
    volume: v.number(),
    volumeKnown: v.boolean(),
    intent: rankIntentValidator,
    rivalsRanking: v.number(),
    bestRivalPosition: v.number(),
    rivals: v.array(v.object({ websiteId: v.id("websites"), position: v.number() })),
    rebuildId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_hold_keyword", ["companyWebsiteId", "keyword"])
    .index("by_hold_volume", ["companyWebsiteId", "volume"])
    .index("by_hold_rivals_volume", ["companyWebsiteId", "rivalsRanking", "volume"])
    .index("by_hold_intent_volume", ["companyWebsiteId", "intent", "volume"])
    .index("by_keyword", ["keyword"])
    .searchIndex("search_keyword", {
      searchField: "keyword",
      filterFields: ["companyWebsiteId", "intent"],
    }),

  /**
   * Google's first page for a tracked search, as each check found it.
   *
   * Keyed on the search and the place, not on a website, like `aiAnswers`: one
   * check serves everyone who tracks the search, and each company reads it
   * only through a search on its own site's list. Domains and addresses only
   * for the results and features; the "People also ask" questions and related
   * searches are Google's own short prompts, kept for the Questions people ask
   * page. One row per search, place and day; a re-parse replaces its pull's.
   */
  siteSerpPages: defineTable({
    keyword: v.string(),
    locationCode: v.number(),
    day: v.string(),
    pullId: v.id("seoDataPulls"),
    resultCount: v.number(),
    results: v.array(v.object({ position: v.number(), domain: v.string(), url: v.optional(v.string()) })),
    features: v.array(v.string()),
    aiOverviewDomains: v.array(v.string()),
    localPackDomains: v.array(v.string()),
    featuredSnippetDomain: v.optional(v.string()),
    questions: v.array(v.string()),
    related: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_keyword_place_day", ["keyword", "locationCode", "day"])
    .index("by_pull", ["pullId"]),

  /**
   * What an AI engine said, word for word (D9, "Stored answers").
   *
   * Beside the answer rather than on it: `aiAnswers` is read many times over
   * to count who was named, and none of those reads should carry pages of
   * text. Keyed like the answer, by pull, question, engine, place and day.
   * The text is another model's writing: shown to people, and when an agent
   * reads it, passed as quoted material to analyse, never as instructions.
   * Its sources are kept as addresses only; a cited page's title is page text.
   */
  aiAnswerTexts: defineTable({
    pullId: v.id("seoDataPulls"),
    prompt: v.string(),
    engine: aiEngineValidator,
    locationCode: v.number(),
    day: v.string(),
    text: v.string(),
    sources: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_pull", ["pullId"])
    .index("by_question", ["prompt", "engine", "locationCode", "day"])
    .index("by_prompt_day", ["prompt", "day"])
    // "Find where they said …" on the Full answers page, within one question.
    .searchIndex("search_text", { searchField: "text", filterFields: ["prompt", "engine", "locationCode"] }),

  /**
   * What kind of page each ranking page is, once judged. Kept by website and
   * path so a page is judged once, whoever watches it and however often the
   * rankings are rebuilt. Only the Decision's answers are kept here; the
   * address rules are worked out again for free (`pageTypeByAddress`).
   */
  sitePageTypes: defineTable({
    websiteId: v.id("websites"),
    page: v.string(),
    pageType: pageTypeValidator,
    certainty: v.optional(v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"))),
    judgedAt: v.number(),
  }).index("by_site_page", ["websiteId", "page"]),

  /**
   * The links to a website, from its newest link lists (Phase 4): one link
   * per linking website (`backlinks_list`) and every broken link
   * (`backlinks_broken`), each list replacing the last of its pass.
   *
   * Keyed on the website, not on a company, like the rankings: the links are
   * the same whoever watches the site, and each company reads them only
   * through its own hold. Anchor text is kept for people to read, never for a
   * model (`dataForSeoLinkParsers.ts`).
   */
  siteBacklinks: defineTable({
    websiteId: v.id("websites"),
    pass: linkPassValidator,
    pullId: v.id("seoDataPulls"),
    /** The day the list was bought: the "last checked" column. */
    day: v.string(),
    domainFrom: v.string(),
    urlFrom: v.string(),
    urlTo: v.string(),
    pageTo: v.string(),
    anchor: v.optional(v.string()),
    dofollow: v.boolean(),
    status: linkStatusValidator,
    isBroken: v.boolean(),
    itemType: v.optional(v.string()),
    /** The linking website's rank, 0–1,000; 0 when DataForSEO gave none. */
    domainRank: v.number(),
    pageRank: maybeNumber,
    firstSeen: v.optional(v.string()),
    lastSeen: v.optional(v.string()),
    statusCode: maybeNumber,
    country: v.optional(v.string()),
    /**
     * More about the link (2026-09-24, "store whatever we can"): its rel
     * attributes (nofollow, ugc, sponsored …), where on the page it sits
     * (article, footer, nav …), what kind of site the linking one is, the
     * link's own spam score and rank, links on its page, whether it reaches
     * the site through a redirect, the linking page's language, and when it
     * was seen before its latest sighting.
     */
    attributes: v.optional(v.array(v.string())),
    location: v.optional(v.string()),
    platformTypes: v.optional(v.array(v.string())),
    spamScore: maybeNumber,
    linkRank: maybeNumber,
    linksOnPage: maybeNumber,
    indirect: v.optional(v.boolean()),
    language: v.optional(v.string()),
    previousSeen: v.optional(v.string()),
    /** Linking website, linking page, anchor and linked page, for the search box. */
    searchText: v.string(),
  })
    .index("by_site_pass_rank", ["websiteId", "pass", "domainRank"])
    .index("by_site_pass_first_seen", ["websiteId", "pass", "firstSeen"])
    .index("by_site_pass_status_rank", ["websiteId", "pass", "status", "domainRank"])
    .index("by_site_pass_follow_rank", ["websiteId", "pass", "dofollow", "domainRank"])
    .index("by_site_pass_day", ["websiteId", "pass", "day"])
    // A page's own screen: the strongest links to it.
    .index("by_site_pass_page_rank", ["websiteId", "pass", "pageTo", "domainRank"])
    // A linking website's own screen, and an anchor's: their links here.
    .index("by_site_pass_domain", ["websiteId", "pass", "domainFrom"])
    .index("by_site_pass_anchor", ["websiteId", "pass", "anchor"])
    .index("by_pull", ["pullId"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["websiteId", "pass", "status", "dofollow"] }),

  /** Every website linking to a website, from its newest list (Phase 4). */
  siteReferringDomains: defineTable({
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    domain: v.string(),
    rank: v.number(),
    backlinks: v.number(),
    firstSeen: v.optional(v.string()),
    lostDate: v.optional(v.string()),
    status: linkStatusValidator,
    spamScore: maybeNumber,
    brokenBacklinks: maybeNumber,
    referringPages: maybeNumber,
    nofollowPages: maybeNumber,
  })
    .index("by_site_rank", ["websiteId", "rank"])
    .index("by_site_backlinks", ["websiteId", "backlinks"])
    .index("by_site_first_seen", ["websiteId", "firstSeen"])
    .index("by_site_status_rank", ["websiteId", "status", "rank"])
    // A linking website's own screen.
    .index("by_site_domain", ["websiteId", "domain"])
    .index("by_pull", ["pullId"])
    .searchIndex("search_domain", { searchField: "domain", filterFields: ["websiteId", "status"] }),

  /** The words other websites link to a website with, from its newest list (Phase 4). */
  siteAnchors: defineTable({
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    /** Empty for a link with no words — an image. */
    anchor: v.string(),
    rank: v.number(),
    backlinks: v.number(),
    referringDomains: v.number(),
    firstSeen: v.optional(v.string()),
    lostDate: v.optional(v.string()),
    status: linkStatusValidator,
    spamScore: maybeNumber,
  })
    .index("by_site_backlinks", ["websiteId", "backlinks"])
    .index("by_site_domains", ["websiteId", "referringDomains"])
    .index("by_site_status_backlinks", ["websiteId", "status", "backlinks"])
    // An anchor's own screen.
    .index("by_site_anchor", ["websiteId", "anchor"])
    .index("by_pull", ["pullId"])
    .searchIndex("search_anchor", { searchField: "anchor", filterFields: ["websiteId", "status"] }),

  /** The servers a website's links come from, from its newest list (Phase 4). */
  siteReferringIps: defineTable({
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    ip: v.string(),
    /** The /24 network the address sits in: many linking sites on one is a link network. */
    subnet: v.string(),
    rank: v.number(),
    backlinks: v.number(),
    referringDomains: v.number(),
    firstSeen: v.optional(v.string()),
    lostDate: v.optional(v.string()),
    status: linkStatusValidator,
    spamScore: maybeNumber,
    searchText: v.string(),
  })
    .index("by_site_backlinks", ["websiteId", "backlinks"])
    .index("by_site_domains", ["websiteId", "referringDomains"])
    .index("by_site_subnet_backlinks", ["websiteId", "subnet", "backlinks"])
    .index("by_site_subnet_domains", ["websiteId", "subnet", "referringDomains"])
    .index("by_pull", ["pullId"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["websiteId", "status", "subnet"] }),

  /**
   * Each finished crawl of a website (Phase 5): pages reached, DataForSEO's
   * technical score, and the problems it found as counts of pages. One row per
   * crawl, so the Site audit can say what changed; a re-parse replaces its own.
   */
  siteCrawls: defineTable({
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    pagesCrawled: v.number(),
    maxPages: maybeNumber,
    onPageScore: maybeNumber,
    linksInternal: maybeNumber,
    linksExternal: maybeNumber,
    cms: v.optional(v.string()),
    server: v.optional(v.string()),
    crawlEnd: v.optional(v.string()),
    issues: v.array(v.object({ check: v.string(), pages: v.number() })),
    createdAt: v.number(),
  })
    .index("by_site_day", ["websiteId", "day"])
    .index("by_pull", ["pullId"]),

  /**
   * The searches a website buys Google adverts on, from its newest
   * ranked-keywords answer (Phase 5) — which returns adverts beside organic
   * results at no extra cost. Replaced whole by each newer answer; empty for a
   * site that does not advertise, which is most.
   */
  sitePaidKeywords: defineTable({
    websiteId: v.id("websites"),
    locationCode: v.number(),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    keyword: v.string(),
    position: maybeNumber,
    url: v.optional(v.string()),
    page: v.string(),
    volume: v.number(),
    cpc: maybeNumber,
    /** Visits a month DataForSEO estimates the advert brings, and what they cost. */
    traffic: v.number(),
    trafficCost: v.number(),
    searchText: v.string(),
  })
    .index("by_site_traffic", ["websiteId", "locationCode", "traffic"])
    .index("by_site_cost", ["websiteId", "locationCode", "trafficCost"])
    .index("by_site_volume", ["websiteId", "locationCode", "volume"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["websiteId", "locationCode"] }),

  /**
   * The networks a website's linking servers sit in, counted when its server
   * list is filed: many linking websites on one network is a link network.
   */
  siteReferringSubnets: defineTable({
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    subnet: v.string(),
    ips: v.number(),
    backlinks: v.number(),
    referringDomains: v.number(),
  })
    .index("by_site_domains", ["websiteId", "referringDomains"])
    .index("by_pull", ["pullId"]),

  /**
   * Links a website gained and lost each day, from DataForSEO's own count
   * (`backlinks_new_lost`). One row per website and day; a later answer about
   * the same day replaces the earlier.
   */
  siteLinkDays: defineTable({
    websiteId: v.id("websites"),
    day: v.string(),
    newBacklinks: v.number(),
    lostBacklinks: v.number(),
    newReferringDomains: v.number(),
    lostReferringDomains: v.number(),
    newMainDomains: v.number(),
    lostMainDomains: v.number(),
    updatedAt: v.number(),
  }).index("by_site_day", ["websiteId", "day"]),

  /**
   * Every page a site crawl reached, with the problems found on it — never its
   * words: the address, the answer it gave, the checks that failed and a few
   * figures (`siteCrawlDetail.ts`). Fetched free after each crawl; the newest
   * crawl's pages are kept, an older crawl's cleared.
   */
  siteCrawlPages: defineTable({
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    url: v.string(),
    page: v.string(),
    statusCode: maybeNumber,
    resourceType: v.optional(v.string()),
    problems: v.array(v.string()),
    score: maybeNumber,
    loadMs: maybeNumber,
    largestPaintMs: maybeNumber,
    sizeBytes: maybeNumber,
    words: maybeNumber,
    internalLinks: maybeNumber,
    externalLinks: maybeNumber,
    inboundLinks: maybeNumber,
    clickDepth: maybeNumber,
    redirectTo: v.optional(v.string()),
    canonical: v.optional(v.string()),
  })
    .index("by_pull", ["pullId"])
    .index("by_site", ["websiteId"])
    // A page's own screen: what the newest crawl found on it.
    .index("by_site_page", ["websiteId", "page"]),

  /** The broken links a site crawl found, page by page: where each is and where it points. */
  siteCrawlLinks: defineTable({
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    from: v.string(),
    fromPage: v.string(),
    to: v.string(),
    type: v.optional(v.string()),
    direction: v.optional(v.string()),
    statusCode: maybeNumber,
    dofollow: v.optional(v.boolean()),
  })
    .index("by_pull", ["pullId"])
    .index("by_site", ["websiteId"]),

  /**
   * Where a site appears in a results-page feature besides the organic places
   * — cited in an AI Overview, holding the answer box, in the map pack — for
   * each search in its full keyword list (`siteKeywordList.ts`). The newest
   * list's rows, dated by the week of that list.
   */
  siteKeywordFeatures: defineTable({
    websiteId: v.id("websites"),
    locationCode: v.number(),
    keyword: v.string(),
    feature: keywordFeatureValidator,
    position: maybeNumber,
    url: v.optional(v.string()),
    page: v.optional(v.string()),
    day: v.string(),
    pullId: v.id("seoDataPulls"),
    updatedAt: v.number(),
  })
    .index("by_site_feature_keyword", ["websiteId", "locationCode", "feature", "keyword"])
    .index("by_site_keyword", ["websiteId", "locationCode", "keyword"])
    .index("by_site_day", ["websiteId", "locationCode", "day"])
    .index("by_pull", ["pullId"]),

  /**
   * How much this company collects about each website it holds: how many of a
   * site's keywords, and how many of its backlinks, are kept. Set on the
   * company's Data collection screen; absent reads as the defaults
   * (`companyDataLimits.ts`). Anthony, 2026-09-24: "some may get 100, some may
   * get 1000 or 2000 … is 10,000 a good limit".
   */
  companyDataLimits: defineTable({
    companyId: v.id("companies"),
    keywordsPerSite: v.number(),
    backlinksPerSite: v.number(),
    updatedAt: v.number(),
  }).index("by_company", ["companyId"]),

  /**
   * A website's own data limits, where they differ from its company's
   * (Anthony, 2026-09-24: "we need to set a limit on the website not just the
   * company"). A field left absent follows the company; a website following
   * its company stores no row at all, so changing the company moves it.
   */
  websiteDataLimits: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    keywordsPerSite: v.optional(v.number()),
    backlinksPerSite: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
    .index("by_company", ["companyId"]),

  /**
   * How often the answers to one website's questions named another website,
   * per engine, per day, from one place: the competitor lines on a site's
   * charts (D17). A competitor asks nothing, so its AI figures are the owned
   * site's answers read for its name — and kept per asking website and place,
   * so one company's questions never count towards another's chart. Written
   * with the asker's day summaries (`syncDays` in `siteSummaries.ts`).
   */
  siteRivalAiDays: defineTable({
    askerWebsiteId: v.id("websites"),
    locationCode: v.number(),
    websiteId: v.id("websites"),
    day: v.string(),
    ai: v.array(engineDayValidator),
    updatedAt: v.number(),
  })
    .index("by_asker_site_day", ["askerWebsiteId", "locationCode", "websiteId", "day"])
    .index("by_asker_day", ["askerWebsiteId", "locationCode", "day"])
    .index("by_site", ["websiteId"]),

  /**
   * A rebuild asked for and not yet run. Several filings in a minute ask once,
   * so a SERP page naming ten known sites does not start ten rebuilds of each.
   */
  siteSummaryRequests: defineTable({
    /** `site:<websiteId>:<locationCode>` or `gap:<companyWebsiteId>`. */
    key: v.string(),
    pending: v.boolean(),
    requestedAt: v.number(),
  }).index("by_key", ["key"]),

  /**
   * What one collection run for a company cost, and where the money went
   * (`seoRunReports.ts`): worked out from its requests and the AI judgements
   * they led to, a minute after each is sent or answered, and kept here so the
   * Collection runs screens open at once. Anthony, 2026-09-24: "it's really
   * good intel and will help me a lot if I can view this kind of report".
   */
  seoRunReports: defineTable(runReportFields).index("by_cycle", ["cycleId"]),
};
