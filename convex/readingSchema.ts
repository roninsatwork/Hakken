import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Reading in Insights, counted (docs/plans/active/content-people-knowledge-
 * plan.md, phase 4; Q1–Q4 answered 2026-10-10). A **view** is a client
 * opening an article or story; a **read** is staying on it 30 seconds or
 * reaching its end; a **click** is opening the original or one of a person's
 * channels; **in answers** is Ask Hakken drawing on an article for an answer.
 * Super admins are never counted. Each event is kept 90 days; the daily
 * totals, written as each event lands, are kept for good, and Analytics reads
 * only those.
 */

export const readingKindValidator = v.union(v.literal("VIEW"), v.literal("READ"), v.literal("CLICK"), v.literal("ANSWER"));
export type ReadingKind = "VIEW" | "READ" | "CLICK" | "ANSWER";

/** What a total is of: everything, one item (an article or story), one person followed, one company, one user, an item at one company, a user's topic. */
export const readingScopeValidator = v.union(
  v.literal("ALL"),
  v.literal("ITEM"),
  v.literal("PERSON"),
  v.literal("COMPANY"),
  v.literal("USER"),
  v.literal("ITEM_COMPANY"),
  v.literal("USER_TOPIC"),
);
export type ReadingScope = "ALL" | "ITEM" | "PERSON" | "COMPANY" | "USER" | "ITEM_COMPANY" | "USER_TOPIC";

/** Who or what was last active: a user, a company, an item, a person followed, or a user on one item. */
export const readingActiveScopeValidator = v.union(v.literal("USER"), v.literal("COMPANY"), v.literal("ITEM"), v.literal("PERSON"), v.literal("ITEM_USER"));

export const readingTables = {
  /** Each view, read, click and use in an answer: kept 90 days (Q4, `purges/readingEvents`). */
  readingEvents: defineTable({
    at: v.number(),
    /** The UTC day, "YYYY-MM-DD". */
    day: v.string(),
    kind: readingKindValidator,
    userId: v.id("users"),
    companyId: v.id("companies"),
    /** "OURS:<id>", "WEB:<id>" or "STORY:<id>"; absent for a click on a person's channel. */
    itemKey: v.optional(v.string()),
    followId: v.optional(v.id("newsFollows")),
    topic: v.optional(v.string()),
  }).index("by_at", ["at"]),

  /**
   * A day's counts for one thing, and its running totals through that day, so
   * any period's total is two reads: the last row on or before its end, less
   * the last row before its start. A day with nothing has no row.
   */
  readingTotals: defineTable({
    scope: readingScopeValidator,
    /** "" for ALL; the item key, person, company or user id; "<item>|<company>"; "<user>|<topic>". */
    key: v.string(),
    day: v.string(),
    views: v.number(),
    reads: v.number(),
    clicks: v.number(),
    answers: v.number(),
    sumViews: v.number(),
    sumReads: v.number(),
    sumClicks: v.number(),
    sumAnswers: v.number(),
    /** ALL only: how many people, and from how many companies, read something that day. */
    readers: v.optional(v.number()),
    companies: v.optional(v.number()),
  }).index("by_scope_key_day", ["scope", "key", "day"]),

  /**
   * When each user, company, item and person was last read: who read in a
   * period is whoever was active since its start. An item's row keeps what
   * Analytics names it by, as it was when last read.
   */
  readingActive: defineTable({
    scope: readingActiveScopeValidator,
    /** The user, company, item key or person; "<item>|<user>" for ITEM_USER. */
    key: v.string(),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    itemKey: v.optional(v.string()),
    title: v.optional(v.string()),
    fromName: v.optional(v.string()),
    followId: v.optional(v.id("newsFollows")),
    topic: v.optional(v.string()),
    /** KNOWLEDGE for ours and the web's kept articles; NEWS for a story not kept. */
    where: v.optional(v.union(v.literal("KNOWLEDGE"), v.literal("NEWS"))),
    lastAt: v.number(),
    lastDay: v.string(),
  })
    .index("by_scope_key", ["scope", "key"])
    .index("by_scope_last", ["scope", "lastAt"])
    .index("by_company_scope_last", ["companyId", "scope", "lastAt"])
    .index("by_item_last", ["itemKey", "lastAt"]),
};
