import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The tables behind Search Console for a company's own websites
 * (docs/plans/active/search-console-plan.md). Every row is one company's
 * alone: a connection belongs to its owned hold, and every figure it brings is
 * filed against that hold and read only through it — never by website, as the
 * shared DataForSEO figures are, since another company holding the same host
 * has no right to them.
 */

/** The kinds of result Search Console reports apart. */
export const SEARCH_TYPES = ["web", "image", "video", "news", "discover", "googleNews"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
export const searchTypeValidator = v.union(
  v.literal("web"),
  v.literal("image"),
  v.literal("video"),
  v.literal("news"),
  v.literal("discover"),
  v.literal("googleNews"),
);

export const connectionStatusValidator = v.union(
  /** Signing in at Google, never connected before. */
  v.literal("CONNECTING"),
  /** Signed in; the property that is this website is still to be chosen. */
  v.literal("CHOOSING"),
  v.literal("CONNECTED"),
  /** Google stopped letting the account read the property: connect again. */
  v.literal("NEEDS_RECONNECT"),
  /** Disconnected by an admin; what was collected stays. */
  v.literal("DISCONNECTED"),
);

/**
 * Why a connection stopped, as a code the screen words in the reader's
 * language: Google took the access back, the account lost the property, the
 * stored keys cannot be read, the deployment lost its Google app, Google was
 * busy or out of reach (tried again next time), or the site is no longer the
 * company's own.
 */
export const connectionProblemValidator = v.union(
  v.literal("REVOKED"),
  v.literal("NO_ACCESS"),
  v.literal("UNREADABLE"),
  v.literal("NOT_CONFIGURED"),
  v.literal("GOOGLE_BUSY"),
  v.literal("NOT_OWNED"),
);

/**
 * How the last sign-in ended when it did not connect: declined at Google,
 * Search Console access left unticked, no property for this site in the
 * account, a property the account is not verified for, or failed on the way.
 */
export const attemptOutcomeValidator = v.union(
  v.literal("DECLINED"),
  v.literal("MISSING_SCOPE"),
  v.literal("NO_PROPERTY"),
  v.literal("UNVERIFIED"),
  v.literal("FAILED"),
);

const figures = {
  clicks: v.number(),
  impressions: v.number(),
  /** Clicks over impressions, 0–1, as Google gives it. */
  ctr: v.number(),
  /** Google's average position: over every time the site was shown, not a ranking check. */
  position: v.number(),
};

/**
 * What a kept list is of (plan §14.3): each search with each page it brought
 * people to (`pair` — a search's own totals are added up from these, never
 * kept apart), each page, each country, each device, each kind of search
 * appearance. A page is kept apart from the pairs because Google folds the
 * rare searches it hides into a page's totals.
 */
export const SEARCH_CONSOLE_LISTS = ["pair", "page", "country", "device", "appearance"] as const;
export type SearchConsoleList = (typeof SEARCH_CONSOLE_LISTS)[number];
export const listValidator = v.union(
  v.literal("pair"),
  v.literal("page"),
  v.literal("country"),
  v.literal("device"),
  v.literal("appearance"),
);

/** How much time one kept list covers: a day for 90 days, then a week, then after 12 months a month. */
export const grainValidator = v.union(v.literal("DAY"), v.literal("WEEK"), v.literal("MONTH"));
export type SearchConsoleGrain = "DAY" | "WEEK" | "MONTH";

/** What a ready-made period's list is of: the kept lists, and each search added up from the pairs. */
export const periodListValidator = v.union(
  v.literal("query"),
  v.literal("pair"),
  v.literal("page"),
  v.literal("country"),
  v.literal("device"),
  v.literal("appearance"),
);
export type SearchConsolePeriodList = "query" | "pair" | "page" | "country" | "device" | "appearance";

/** The ready-made periods (plan §14.3, item 4): days, ending on Google's newest day held. */
export const SEARCH_CONSOLE_PERIODS = ["7", "30", "90", "365"] as const;
export type SearchConsolePeriod = (typeof SEARCH_CONSOLE_PERIODS)[number];
export const periodValidator = v.union(v.literal("7"), v.literal("30"), v.literal("90"), v.literal("365"));

/**
 * One list's rows, packed: one record for a whole day (or week, or month)
 * instead of one record per row, split into parts of 2,000 rows. Parallel
 * arrays, row `i` across them all. Position is kept as a sum weighted by
 * impressions (`position × impressions`), so an average over any days,
 * weeks or months is exactly Google's.
 */
const packedRows = {
  keys: v.array(v.string()),
  /** A pair's page, row for row with its search in `keys`. Only on `pair` lists. */
  pages: v.optional(v.array(v.string())),
  clicks: v.array(v.number()),
  impressions: v.array(v.number()),
  positionSums: v.array(v.number()),
};

export const searchConsoleTables = {
  searchConsoleConnections: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    websiteId: v.id("websites"),
    status: connectionStatusValidator,
    /** A sign-in under way: its single-use state, when it began and who began it. */
    pendingState: v.optional(v.string()),
    pendingAt: v.optional(v.number()),
    pendingBy: v.optional(v.id("users")),
    googleAccount: v.optional(v.string()),
    /** The account's properties that are this website, while one is chosen. */
    choices: v.optional(v.array(v.object({ property: v.string(), permission: v.string() }))),
    property: v.optional(v.string()),
    permission: v.optional(v.string()),
    /** The property the figures held came from: choosing another clears them. */
    dataProperty: v.optional(v.string()),
    /** Set while another property's figures are being cleared; nothing is collected meanwhile. */
    clearing: v.optional(v.boolean()),
    connectedBy: v.optional(v.id("users")),
    connectedAt: v.optional(v.number()),
    disconnectedAt: v.optional(v.number()),
    /** The newest and oldest days held, and when sixteen months were first all in. */
    newestDay: v.optional(v.string()),
    oldestDay: v.optional(v.string()),
    backfilledAt: v.optional(v.number()),
    /** When the history last took a step: one quiet for an hour has stopped, and the daily job resumes it. */
    historyAt: v.optional(v.number()),
    lastCollectedAt: v.optional(v.number()),
    /** What stopped the connection or its last collection; cleared when a collection goes right. */
    problem: v.optional(connectionProblemValidator),
    problemAt: v.optional(v.number()),
    /** The last sign-in that did not connect, and the account it was tried with. */
    attempt: v.optional(v.object({ outcome: attemptOutcomeValidator, account: v.optional(v.string()), at: v.number() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
    .index("by_pending_state", ["pendingState"])
    .index("by_status", ["status"])
    /** Whether anyone else still uses an account's grant, before it is revoked at Google. */
    .index("by_google_account", ["googleAccount"]),

  /**
   * A connection's Google tokens, as ciphertext only (`connectorTokenCrypto`).
   * Read by internal functions alone, as `connectorOAuthTokens` is.
   */
  searchConsoleTokens: defineTable({
    connectionId: v.id("searchConsoleConnections"),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_connection", ["connectionId"]),

  /** A day's totals, rare searches Google hides included. */
  searchConsoleDays: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    day: v.string(),
    ...figures,
    /**
     * The clicks of the searches Google names that day: the totals less the
     * ones it hides for privacy. Absent when the day's searches were not asked.
     */
    namedClicks: v.optional(v.number()),
    /** The collection that last wrote it: a day fetched again drops what that fetch did not return. */
    fetchedAt: v.number(),
  }).index("by_hold_type_day", ["companyWebsiteId", "searchType", "day"]),

  /**
   * What was collected, kept as the screens read it (plan §14.3): one record
   * per website, kind of result, list and day — a week once the day is past
   * 90 days, a month once the week is past 12 months — in parts of 2,000 rows.
   * `start` is the first day it covers.
   */
  searchConsoleLists: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    list: listValidator,
    grain: grainValidator,
    start: v.string(),
    part: v.number(),
    ...packedRows,
    fetchedAt: v.number(),
  }).index("by_hold_type_list_grain_start", ["companyWebsiteId", "searchType", "list", "grain", "start", "part"]),

  /**
   * The ready-made periods the screens read (plan §14.3, item 4): for the last
   * 7, 30 and 90 days and 12 months ending on the newest day held (`NOW`), and
   * the same span before it (`BEFORE`) where it is held, each list added up and
   * rebuilt after every collection. A search's list carries how many of the
   * website's pages it brought people to and the top one; a page's, how many
   * searches and the top one. `kinds` is a page's type or a search's intent
   * (Sites' own judgments), `volumes` a search's searches a month from Sites,
   * `estimates` a page's estimated visits from Sites — each where known.
   */
  searchConsolePeriods: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    list: periodListValidator,
    period: periodValidator,
    which: v.union(v.literal("NOW"), v.literal("BEFORE")),
    part: v.number(),
    from: v.string(),
    to: v.string(),
    ...packedRows,
    counts: v.optional(v.array(v.number())),
    tops: v.optional(v.array(v.string())),
    kinds: v.optional(v.array(v.string())),
    volumes: v.optional(v.array(v.number())),
    estimates: v.optional(v.array(v.number())),
    builtAt: v.number(),
  }).index("by_hold_type_list_period", ["companyWebsiteId", "searchType", "list", "period", "which", "part"]),

  /** When each search and each page was first and last shown, for New and lost (plan §14.3, item 6). Web results. */
  searchConsoleSeen: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    kind: v.union(v.literal("query"), v.literal("page")),
    key: v.string(),
    firstDay: v.string(),
    lastDay: v.string(),
  })
    .index("by_hold_kind_key", ["companyWebsiteId", "kind", "key"])
    .index("by_hold_kind_first", ["companyWebsiteId", "kind", "firstDay"])
    .index("by_hold_kind_last", ["companyWebsiteId", "kind", "lastDay"]),

  /**
   * The searches and pages a company tracks on its website's Search Console
   * (plan §13.2): its own, read and changed only through its hold, held to
   * the website's tracking limits.
   */
  searchConsoleTracked: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    kind: v.union(v.literal("query"), v.literal("page")),
    key: v.string(),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
  }).index("by_hold_kind_key", ["companyWebsiteId", "kind", "key"]),

  /** Each collection: the days asked for, the requests and rows, and what went wrong. */
  searchConsoleRuns: defineTable({
    connectionId: v.id("searchConsoleConnections"),
    companyWebsiteId: v.id("companyWebsites"),
    kind: v.union(v.literal("DAILY"), v.literal("HISTORY")),
    fromDay: v.string(),
    toDay: v.string(),
    requests: v.number(),
    rows: v.number(),
    /** Splits Google refused for a kind of result ("discover/query"): skipped, not failed. */
    refused: v.optional(v.array(v.string())),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_hold_started", ["companyWebsiteId", "startedAt"]),
};
