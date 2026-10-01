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

/** What a News item is, and the filter it answers to on the News page. */
export const NEWS_ITEM_KINDS = ["GOOGLE_UPDATE", "WEBSITE", "YOUTUBE", "X"] as const;
export type NewsItemKind = (typeof NEWS_ITEM_KINDS)[number];
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
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_on", ["isOn"]),

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
    createdAt: v.number(),
  })
    .index("by_published", ["publishedAt"])
    .index("by_kind_published", ["kind", "publishedAt"])
    .index("by_external", ["externalKey"])
    .index("by_google_update", ["googleUpdateId"])
    .index("by_source", ["sourceId"]),

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
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_order", ["order"]),
};
