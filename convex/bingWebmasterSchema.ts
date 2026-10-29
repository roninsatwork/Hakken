import { defineTable } from "convex/server";
import { calendarPeriodValidator } from "./utils/calendarPeriods";
import { v } from "convex/values";
import { storedNumbersValidator } from "./searchConsoleSchema";

/**
 * Bing Webmaster Tools for a company's own websites
 * (docs/plans/active/bing-webmaster-plan.md §3, §4). Every table names the
 * owned hold it belongs to and is read through it, as Search Console's are
 * (`websiteTenancyGuard.test.ts`).
 *
 * Stored as Search Console and Analytics are (BW2): each page named by the
 * website's one page numbering (`holdPageAddresses`, `holdPageRefs.ts`), each
 * keyword once in the website's Bing book and named by its place, every
 * number column packed (`packNumbers`), the screens' periods ready-made.
 */

export const bingStatusValidator = v.union(
  v.literal("CONNECTING"),
  v.literal("CHOOSING"),
  v.literal("CONNECTED"),
  v.literal("NEEDS_RECONNECT"),
  v.literal("DISCONNECTED"),
);

/**
 * Why a connection, or its collection, stopped: Bing took the access back,
 * the account lost the site, keys that cannot be read, the deployment not
 * set up, Bing busy, or a website no longer the company's own.
 */
export const bingProblemValidator = v.union(
  v.literal("REVOKED"),
  v.literal("NO_ACCESS"),
  v.literal("UNREADABLE"),
  v.literal("NOT_CONFIGURED"),
  v.literal("BING_BUSY"),
  v.literal("NOT_OWNED"),
);

/** Why a sign-in did not connect, for the Connection page. */
export const bingAttemptValidator = v.union(
  v.literal("DECLINED"),
  v.literal("NO_SITE"),
  v.literal("UNVERIFIED"),
  v.literal("FAILED"),
);

/** The two weekly lists Bing gives: keywords and pages. */
export const bingListValidator = v.union(v.literal("query"), v.literal("page"));

/** The ready-made periods: the last week, 30 and 90 days, six months and a year, each ending on Bing's newest week. */
/** A ready-made period: the Dates menu's periods, the retired ones still accepted while their rows go (sees-header-and-rolling-dates-plan.md). */
export const bingPeriodValidator = calendarPeriodValidator;

/** How Bing read the website on one day (`GetCrawlStats`). */
export const bingCrawlValidator = v.object({
  crawled: v.number(),
  errors: v.number(),
  inIndex: v.number(),
  inLinks: v.number(),
  blockedByRobots: v.number(),
  malware: v.number(),
  code2xx: v.number(),
  code301: v.number(),
  code302: v.number(),
  code4xx: v.number(),
  code5xx: v.number(),
  otherCodes: v.number(),
  dnsFailures: v.number(),
  timeouts: v.number(),
});

export const bingWebmasterTables = {
  /** One a website: its Bing sign-in's state, the site chosen, and how far its figures go. */
  bingConnections: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    websiteId: v.id("websites"),
    status: bingStatusValidator,
    /** Switched off on the website's Schedules page (docs/plans/active/website-schedules-plan.md, WS4): kept connected with everything held, and not collected until switched on again. */
    switchedOff: v.optional(v.boolean()),
    /** A sign-in under way: its single-use state, when and by whom it started. */
    pendingState: v.optional(v.string()),
    pendingAt: v.optional(v.number()),
    pendingBy: v.optional(v.id("users")),
    /** The verified sites of the account that are this website, while the admin chooses. */
    choices: v.optional(v.array(v.string())),
    /** The site in Bing Webmaster Tools the figures are read from ("https://www.example.com/"). */
    site: v.optional(v.string()),
    /** The site the figures held came from: another site clears them. */
    dataSite: v.optional(v.string()),
    clearing: v.optional(v.boolean()),
    connectedBy: v.optional(v.id("users")),
    connectedAt: v.optional(v.number()),
    disconnectedAt: v.optional(v.number()),
    /** The newest and oldest day of the site's totals held. */
    newestDay: v.optional(v.string()),
    oldestDay: v.optional(v.string()),
    /** The newest and oldest of Bing's weeks of keywords and pages held. */
    newestWeek: v.optional(v.string()),
    oldestWeek: v.optional(v.string()),
    /** When the ready-made periods were last built, and the money pages last asked of Bing. */
    periodsAt: v.optional(v.number()),
    pagesCheckedAt: v.optional(v.number()),
    lastCollectedAt: v.optional(v.number()),
    /** The collection under way, so two never run at once. */
    collecting: v.optional(v.object({ runId: v.id("agentRuns"), at: v.number() })),
    problem: v.optional(bingProblemValidator),
    problemAt: v.optional(v.number()),
    attempt: v.optional(v.object({ outcome: bingAttemptValidator, at: v.number() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
    .index("by_pending_state", ["pendingState"])
    .index("by_status", ["status"]),

  /** The connection's keys, as ciphertext only (`connectorTokenCrypto`): read by `bingWebmasterConnect.ts` alone. */
  bingTokens: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    bingConnectionId: v.id("bingConnections"),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_connection", ["bingConnectionId"])
    .index("by_hold", ["companyWebsiteId"]),

  /**
   * One day of the whole website on Bing: its clicks and impressions
   * (`GetRankAndTrafficStats`) and how Bing read it (`GetCrawlStats`). One
   * small row a day, kept as Search Console's day totals are: the charts and
   * the Executive summary's months read them.
   */
  bingDays: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    day: v.string(),
    clicks: v.optional(v.number()),
    impressions: v.optional(v.number()),
    crawl: v.optional(bingCrawlValidator),
    fetchedAt: v.number(),
  }).index("by_hold_day", ["companyWebsiteId", "day"]),

  /**
   * One of Bing's weeks of keywords or pages, as Bing gives it
   * (`GetQueryStats`, `GetPageStats`), in parts of 2,000 rows, busiest first.
   * `keys` are places in the website's Bing book for keywords, page numbers
   * for pages, packed; the positions are kept as position × impressions so
   * weeks add up. Kept 13 months, then dropped.
   */
  bingWeeks: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    list: bingListValidator,
    week: v.string(),
    part: v.number(),
    keys: v.string(),
    clicks: storedNumbersValidator,
    impressions: storedNumbersValidator,
    positionSums: storedNumbersValidator,
    /** A fingerprint of the week as Bing gave it: an unchanged week is not written again. */
    hash: v.string(),
    fetchedAt: v.number(),
  })
    .index("by_hold_list_week_part", ["companyWebsiteId", "list", "week", "part"])
    // A list's weeks by their first part: which weeks are held, and their fingerprints, without reading every part.
    .index("by_hold_list_part_week", ["companyWebsiteId", "list", "part", "week"]),

  /**
   * Each keyword Bing showed the website for, once: a keyword's place is its
   * chunk × 4,000 plus its place in the chunk, and weeks and periods name it
   * by that. Words are only added, so a place never changes.
   */
  bingKeywordBooks: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    chunk: v.number(),
    keywords: v.array(v.string()),
  }).index("by_hold_chunk", ["companyWebsiteId", "chunk"]),

  /**
   * The ready-made lists the screens read, built when Bing's new week lands:
   * keywords or pages for a period ending on the newest week (`NOW`) and the
   * period before it (`BEFORE`), with Google's figures for the same keyword
   * or page beside them, from Search Console's ready-made period of the same
   * length (BW10). A build is written whole under one `builtAt`, then the
   * older one dropped.
   */
  bingPeriods: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    list: bingListValidator,
    period: bingPeriodValidator,
    which: v.union(v.literal("NOW"), v.literal("BEFORE")),
    part: v.number(),
    from: v.string(),
    to: v.string(),
    keys: v.string(),
    clicks: storedNumbersValidator,
    impressions: storedNumbersValidator,
    positionSums: storedNumbersValidator,
    /** Google's clicks, impressions and position × impressions for each row, -1 where Google has none. */
    googleClicks: v.optional(storedNumbersValidator),
    googleImpressions: v.optional(storedNumbersValidator),
    googlePositionSums: v.optional(storedNumbersValidator),
    /**
     * Each row's place in the list's A to Z order, worked out at the build:
     * a screen sorts and settles ties by it, and names only the rows it shows
     * (§4.5) — reading every keyword's words was most of what a list read.
     */
    nameRanks: v.optional(storedNumbersValidator),
    builtAt: v.number(),
  })
    .index("by_hold_list_period_which_part", ["companyWebsiteId", "list", "period", "which", "part"])
    // An older build's parts, found to be dropped once a new build is whole.
    .index("by_hold_built", ["companyWebsiteId", "builtAt"]),

  /** One money page on Bing (BW8, §4.1): whether it is in Bing's index and when Bing last read it, asked each week. */
  bingPageChecks: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    page: v.string(),
    inIndex: v.boolean(),
    lastRead: v.union(v.string(), v.null()),
    status: v.union(v.number(), v.null()),
    checkedAt: v.number(),
  }).index("by_hold_page", ["companyWebsiteId", "page"]),

  /**
   * What a keyword's or a page's own screen asked Bing when it opened (its
   * pages, or its keywords), held until the next collection so paging and
   * sorting never ask again.
   */
  bingLive: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    ask: v.string(),
    rows: v.array(v.object({ key: v.string(), clicks: v.number(), impressions: v.number(), position: v.union(v.number(), v.null()) })),
    askedAt: v.number(),
  }).index("by_hold_ask", ["companyWebsiteId", "ask"]),
};
