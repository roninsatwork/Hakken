import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * News (docs/plans/active/knowledge-news-and-digest-plan.md, phase 3, D4):
 * what every signed-in user reads under News, the same for every company
 * (A14), managed in Admin → Content. Items are collected from the sources by
 * the News Collector agent (phase 5) and go live at once (A4); Google updates
 * are entered by hand (D6) and appear in News as items of their own.
 *
 * Everything people or the collector write here is English; the Translator
 * writes every other language (`contentTranslation.ts`, revised 2026-10-01).
 */

/** Where a source is read from. Anthony's own X bookmarks are a connection, not a source (phase 6). */
export const NEWS_SOURCE_KINDS = ["WEBSITE", "YOUTUBE", "X_ACCOUNT"] as const;
export type NewsSourceKind = (typeof NEWS_SOURCE_KINDS)[number];
export const newsSourceKindValidator = v.union(v.literal("WEBSITE"), v.literal("YOUTUBE"), v.literal("X_ACCOUNT"));

/** What a News item is, and the side menu's kinds (`utils/learnLists.ts`, where a screen reads them). */
export { NEWS_ITEM_KINDS, type NewsItemKind } from "./utils/learnLists";
export const newsItemKindValidator = v.union(v.literal("GOOGLE_UPDATE"), v.literal("WEBSITE"), v.literal("YOUTUBE"), v.literal("X"));

/** Who a "Who to follow" entry is followed on. */
export const FOLLOW_KINDS = ["X", "YOUTUBE", "WEBSITE", "LINKEDIN"] as const;
export type FollowKind = (typeof FOLLOW_KINDS)[number];
export const followKindValidator = v.union(v.literal("X"), v.literal("YOUTUBE"), v.literal("WEBSITE"), v.literal("LINKEDIN"));

export const newsTables = {
  /** A website, YouTube channel or X account the News Collector reads while it is on. */
  newsSources: defineTable({
    kind: newsSourceKindValidator,
    name: v.string(),
    /** The page or feed address for a website or channel; the handle, without "@", for an X account. */
    address: v.string(),
    isOn: v.boolean(),
    /** When the collector last read it, and when it last found something new: Admin's list says both. */
    lastCheckedAt: v.optional(v.number()),
    lastItemAt: v.optional(v.number()),
    /** An X account's own id, found from its handle once (phase 6). */
    externalId: v.optional(v.string()),
    /** The newest X post already read, so a run reads — and pays for — only what is newer. */
    sinceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_on", ["isOn"]),

  /**
   * Anthony's X account, connected once on the News sources screen so the
   * News Collector can read his bookmarks (phase 6, D11): X gives bookmarks
   * only to a personal sign-in. One row. Its access is kept encrypted here,
   * renewed as it runs out, and never shown on any screen.
   */
  xConnections: defineTable({
    status: v.union(v.literal("CONNECTING"), v.literal("CONNECTED"), v.literal("BROKEN")),
    /** A sign-in under way: its single-use state, when it began, who began it, and its PKCE verifier. */
    pendingState: v.optional(v.string()),
    pendingAt: v.optional(v.number()),
    pendingBy: v.optional(v.id("users")),
    verifierCiphertext: v.optional(v.string()),
    /** The signed-in handle, "@…", and its X id. */
    account: v.optional(v.string()),
    xUserId: v.optional(v.string()),
    accessTokenCiphertext: v.optional(v.string()),
    refreshTokenCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    /** The newest bookmark already read: a run imports only those after it. */
    lastBookmarkId: v.optional(v.string()),
    lastReadAt: v.optional(v.number()),
    /** Why it stopped working, or why the last sign-in did not connect, in plain words. */
    problem: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_pending_state", ["pendingState"]),

  /**
   * A Google update, entered by hand (D6): in News, and as a marker on every
   * Sites chart that runs over dates (phase 10). Days are calendar days,
   * "YYYY-MM-DD", as Google announces them.
   */
  googleUpdates: defineTable({
    titleEn: v.string(),
    descriptionEn: v.string(),
    startedOn: v.string(),
    /** Absent while it is still rolling out. */
    finishedOn: v.optional(v.string()),
    /**
     * The longest Google said it may take, in days — its "up to two weeks" —
     * so a rollout's line knows where it should end (revised again,
     * 2026-10-01, R8). Absent on an update entered before it: 14.
     */
    expectedDays: v.optional(v.number()),
    /** "What it means for you", in plain words; optional, translated with the rest. */
    meaningEn: v.optional(v.string()),
    url: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_started", ["startedOn"]),

  /**
   * One thing in the News feed, newest first: collected from a source, or a
   * Google update's own item, kept in step with it. Written in English; a
   * reader sees their language's translation once the Translator has it.
   */
  newsItems: defineTable({
    kind: newsItemKindValidator,
    sourceId: v.optional(v.id("newsSources")),
    googleUpdateId: v.optional(v.id("googleUpdates")),
    /** The source's name as it was when collected, so a renamed or deleted source still reads. */
    sourceName: v.string(),
    titleEn: v.string(),
    summaryEn: v.string(),
    /** "What this means for you", in plain words. */
    meaningEn: v.string(),
    url: v.string(),
    publishedAt: v.number(),
    /** What makes it the same item again — its address, or a post's id — so nothing is collected twice. */
    externalKey: v.string(),
    /**
     * Pinned in Admin → Content → News as the front page's lead story, until
     * this moment (seven days from pinning, R7). One item at a time.
     */
    leadUntil: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_published", ["publishedAt"])
    .index("by_lead_until", ["leadUntil"])
    .index("by_kind_published", ["kind", "publishedAt"])
    .index("by_external", ["externalKey"])
    .index("by_google_update", ["googleUpdateId"]),

  /**
   * Items taken down in Admin → Content → News, by what made them the same
   * item, so the News Collector never brings one back.
   */
  newsTakenDown: defineTable({
    externalKey: v.string(),
    takenDownAt: v.number(),
  }).index("by_external", ["externalKey"]),

  /** "Who to follow": people and channels Anthony recommends, shown on the News page. Nobody watches these. */
  newsFollows: defineTable({
    kind: followKindValidator,
    name: v.string(),
    url: v.string(),
    whyEn: v.string(),
    /** Its place in the list, lowest first. */
    order: v.number(),
    /** The key of a topic in the shared list (`topics`, insights-helpful-content-plan.md, IH14, IH20); optional. */
    topic: v.optional(v.string()),
    /** When it was made one of "Our picks" (IH13, IH14): at most four, shown in the order picked; absent when not. */
    pickedAt: v.optional(v.number()),
    /** The name in lower case, so the list reads A to Z through an index (IH21). */
    nameKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_topic", ["topic"])
    .index("by_picked", ["pickedAt"])
    // Readers' and Admin's lists, A to Z, under Where and Topic, on the server (IH13, IH21).
    .index("by_name", ["nameKey"])
    .index("by_kind_name", ["kind", "nameKey"])
    .index("by_topic_name", ["topic", "nameKey"])
    .index("by_kind_topic_name", ["kind", "topic", "nameKey"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["kind", "topic"] }),
};
