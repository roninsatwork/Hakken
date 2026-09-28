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

/**
 * What a row of figures is of: a search, a page, a country, a device, or a
 * kind of search appearance (a rich result, a video…), as Google names them.
 */
export const SEARCH_CONSOLE_DIMENSIONS = ["query", "page", "country", "device", "appearance"] as const;
export type SearchConsoleDimension = (typeof SEARCH_CONSOLE_DIMENSIONS)[number];
export const dimensionValidator = v.union(
  v.literal("query"),
  v.literal("page"),
  v.literal("country"),
  v.literal("device"),
  v.literal("appearance"),
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
   * A day's figures for one search, page, country or device (SC6: every one,
   * every day it was shown). Searches Google hides for privacy are in the
   * day's totals and never here.
   */
  searchConsoleRows: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: dimensionValidator,
    key: v.string(),
    day: v.string(),
    ...figures,
    fetchedAt: v.number(),
  })
    .index("by_hold_type_dimension_day", ["companyWebsiteId", "searchType", "dimension", "day"])
    .index("by_hold_type_dimension_key_day", ["companyWebsiteId", "searchType", "dimension", "key", "day"]),

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
