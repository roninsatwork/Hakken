import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Keyword research (docs/plans/active/keyword-research-plan.md).
 *
 * Two kinds of table. **Bought data is shared**: a keyword in a country is
 * bought once and reused by any company until it is older than the reading
 * company's "Days a lookup is kept" — like Websites' own buying, where one
 * answer serves everyone watching. **What a company looked up, and its lists,
 * are its own**: read and written only through its own company, never by
 * keyword, the same rule as the tracked lists
 * (docs/plans/active/private-tracking-lists-plan.md).
 *
 * Keywords are held as `normaliseKeyword` makes them (trimmed, one space,
 * lower case), so one phrase is one row however it was typed; a lookup keeps
 * the words as typed for the screen.
 */

/** The kinds of keyword idea a lookup buys (board 5): terms match, questions, and what the top pages also rank for. */
export const researchIdeaKindValidator = v.union(v.literal("TERMS"), v.literal("QUESTIONS"), v.literal("ALSO_RANK"));

/** Where one part of a lookup is. A part never asked for has no state at all. */
export const researchPartStateValidator = v.union(v.literal("WAITING"), v.literal("READY"), v.literal("FAILED"));

const monthValidator = v.object({
  /** "2026-09". */
  month: v.string(),
  volume: v.number(),
});

const ideaRowValidator = v.object({
  keyword: v.string(),
  volume: v.union(v.number(), v.null()),
  difficulty: v.union(v.number(), v.null()),
  intent: v.union(v.string(), v.null()),
  cpc: v.union(v.number(), v.null()),
});

const serpResultValidator = v.object({
  /** Its place among the ordinary results, 1 at the top. */
  position: v.number(),
  url: v.string(),
  /** The host, without "www.". */
  domain: v.string(),
  title: v.string(),
});

const serpPageValidator = v.object({
  url: v.string(),
  /** The page's strength, 0 to 100 (DataForSEO's rank of 0 to 1,000, divided by ten). */
  strength: v.union(v.number(), v.null()),
  linkingSites: v.union(v.number(), v.null()),
  /** Estimated visits a month. */
  visits: v.union(v.number(), v.null()),
  /** How many searches the page ranks for. */
  keywords: v.union(v.number(), v.null()),
  topKeyword: v.union(v.string(), v.null()),
});

export const keywordResearchTables = {
  /** A keyword in a country: its overview and its last 24 months (board 2). */
  researchKeywords: defineTable({
    keyword: v.string(),
    locationCode: v.number(),
    boughtAt: v.number(),
    /** Bought from DataForSEO's free sandbox: real shapes, sample figures. Never shown as real. */
    sandbox: v.boolean(),
    searchVolume: v.union(v.number(), v.null()),
    cpc: v.union(v.number(), v.null()),
    /** LOW, MEDIUM or HIGH: competition for adverts. */
    competitionLevel: v.union(v.string(), v.null()),
    /** 0 to 100: how hard it is to reach Google's top ten. */
    difficulty: v.union(v.number(), v.null()),
    /** commercial, informational, navigational or transactional, as DataForSEO judged it. */
    intent: v.union(v.string(), v.null()),
    /** Up to 24 months, oldest first. */
    monthly: v.array(monthValidator),
    /** The kinds of result Google's page shows besides the ordinary ones: ai_overview, local_pack, people_also_ask… */
    serpKinds: v.array(v.string()),
    resultsCount: v.union(v.number(), v.null()),
    /** The linking websites the top ten's pages have, on average. */
    topTenLinkingSites: v.union(v.number(), v.null()),
    /** The top ten's domains' strength, 0 to 100, on average: what "within reach" is measured against, like for like with the website's own. */
    topTenDomainStrength: v.optional(v.union(v.number(), v.null())),
  }).index("by_keyword_place", ["keyword", "locationCode", "boughtAt"]),

  /** Google's top 100 for a keyword in a country, and once Google's results are opened, its top ten pages in full (board 3). */
  researchSerps: defineTable({
    keyword: v.string(),
    locationCode: v.number(),
    boughtAt: v.number(),
    sandbox: v.boolean(),
    results: v.array(serpResultValidator),
    /** The top ten's figures: visits and keywords with the lookup; strength, linking websites and top keyword once Google's results are opened. */
    pages: v.optional(v.array(serpPageValidator)),
    /** When the strength, linking websites and top keyword were bought: absent until Google's results are opened. */
    detailsBoughtAt: v.optional(v.number()),
  }).index("by_keyword_place", ["keyword", "locationCode", "boughtAt"]),

  /** One kind of idea for a keyword in a country, the most searched first (board 5). */
  researchIdeas: defineTable({
    keyword: v.string(),
    locationCode: v.number(),
    kind: researchIdeaKindValidator,
    boughtAt: v.number(),
    sandbox: v.boolean(),
    /** How many were asked for: a reader wanting more than this buys again. */
    limit: v.number(),
    /** How many DataForSEO holds in all, beyond those bought. */
    total: v.union(v.number(), v.null()),
    rows: v.array(ideaRowValidator),
  }).index("by_keyword_place_kind", ["keyword", "locationCode", "kind", "boughtAt"]),

  /**
   * What the AI says about a keyword in a country (board 4): the question a
   * person would ask behind it, the four assistants' answers — who each names,
   * in order, and the pages it cites — and the searches Google ran to write
   * its AI Overview.
   */
  researchAnswers: defineTable({
    keyword: v.string(),
    locationCode: v.number(),
    boughtAt: v.number(),
    sandbox: v.boolean(),
    question: v.string(),
    engines: v.array(v.object({
      engine: v.string(),
      answered: v.boolean(),
      /** The answer's text, cut to keep the row small. */
      answer: v.string(),
      /** The businesses it names that a company has named on Hakken, in the order it names them. */
      named: v.array(v.object({ websiteId: v.id("websites"), host: v.string() })),
      cited: v.array(v.object({ url: v.string(), host: v.string() })),
    })),
    overviewSearches: v.array(v.object({ query: v.string(), times: v.number() })),
  }).index("by_keyword_place", ["keyword", "locationCode", "boughtAt"]),

  /** A keyword a company looked up (boards 1 and 2): its own, with each part's state. */
  keywordLookups: defineTable({
    companyId: v.id("companies"),
    keyword: v.string(),
    /** As typed. */
    text: v.string(),
    locationCode: v.number(),
    /** The website it is measured against, or none. */
    companyWebsiteId: v.optional(v.id("companyWebsites")),
    /** Who looked it up: cleared if the person is erased, the lookup kept for the company. */
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    /** Last looked up or opened: Past lookups' order. */
    openedAt: v.number(),
    overview: researchPartStateValidator,
    /** Google's results opened: the top ten's strength, linking websites and top keyword. */
    results: v.optional(researchPartStateValidator),
    ideas: v.optional(researchPartStateValidator),
    /** What the AI says opened: the question, four answers and the AI Overview's searches. */
    answers: v.optional(researchPartStateValidator),
    /** Searches by country: each other country picked, looked up for its overview alone (about 1 cent each). */
    countries: v.optional(v.array(v.object({ locationCode: v.number(), state: researchPartStateValidator }))),
    /** What the company has spent on this keyword, in USD: its share of each call bought for it. */
    spentUsd: v.optional(v.number()),
    /** Why the last part asked for failed, in words for the screen. */
    problem: v.optional(v.string()),
  })
    .index("by_company_opened", ["companyId", "openedAt"])
    .index("by_company_keyword_place", ["companyId", "keyword", "locationCode"]),

  /**
   * One part of one lookup a run was started to buy: the run reads its jobs
   * to know what to buy, and settles only them — so two parts opened close
   * together are two jobs, each settled by its own run, and a later run
   * never settles an earlier one's part.
   */
  researchJobs: defineTable({
    runId: v.id("agentRuns"),
    lookupId: v.id("keywordLookups"),
    companyId: v.id("companies"),
    part: v.union(v.literal("OVERVIEW"), v.literal("RESULTS"), v.literal("IDEAS"), v.literal("ANSWERS"), v.literal("COUNTRY")),
    keyword: v.string(),
    /** The lookup's country, or for a COUNTRY job the one picked. */
    locationCode: v.number(),
    /** Look up again or Ask again: bought afresh, whatever is held. */
    again: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_lookup_part", ["lookupId", "part", "createdAt"]),

  /** A company's research list (board 7). */
  researchLists: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    companyWebsiteId: v.optional(v.id("companyWebsites")),
    /** Who made it: cleared if the person is erased, the list kept for the company. */
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_company_updated", ["companyId", "updatedAt"]),

  researchListKeywords: defineTable({
    listId: v.id("researchLists"),
    companyId: v.id("companies"),
    keyword: v.string(),
    text: v.string(),
    locationCode: v.number(),
    addedBy: v.optional(v.id("users")),
    addedAt: v.number(),
  })
    .index("by_list_added", ["listId", "addedAt"])
    .index("by_list_keyword", ["listId", "keyword", "locationCode"]),
};
