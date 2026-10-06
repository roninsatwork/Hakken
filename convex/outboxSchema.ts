import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The outbox (docs/plans/active/knowledge-news-and-digest-plan.md, "The
 * outbox and message types", D8–D9): one row per email. Whatever wants an
 * email sent adds a row and sends nothing; the Email Sender agent claims rows,
 * renders each with the template its message type names, in the reader's
 * language, sends it through Resend and records the receipt. The claim before
 * the send is the DataForSEO queue's (`seoDataPulls`), so a row is never sent
 * twice however often something retries.
 */

/** What kind of email a row is: the Sender picks its template by it. Every later email type is one more. */
export const OUTBOX_MESSAGE_TYPES = ["WEEKLY_NEWS_DIGEST", "COLLECTION_NEEDS_YOU"] as const;
export type OutboxMessageType = (typeof OUTBOX_MESSAGE_TYPES)[number];
export const outboxMessageTypeValidator = v.union(v.literal("WEEKLY_NEWS_DIGEST"), v.literal("COLLECTION_NEEDS_YOU"));

export const OUTBOX_STATUSES = ["WAITING", "CLAIMED", "SENT", "FAILED", "SKIPPED"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];
export const outboxStatusValidator = v.union(
  v.literal("WAITING"),
  v.literal("CLAIMED"),
  v.literal("SENT"),
  v.literal("FAILED"),
  v.literal("SKIPPED"),
);

export const outboxTables = {
  outboxMessages: defineTable({
    messageType: outboxMessageTypeValidator,
    /** Who it is for; the address and language as they were when queued. */
    userId: v.id("users"),
    email: v.string(),
    language: v.string(),
    /** What the template needs, as JSON: for the digest, its issue and the reader's name — the issue is stored once. */
    payloadJson: v.string(),
    status: outboxStatusValidator,
    /** Not sent before this. */
    dueAt: v.number(),
    /** The Sender run that holds it, and since when. */
    claimedBy: v.optional(v.id("agentRuns")),
    claimedAt: v.optional(v.number()),
    /** Set just before the send: a claim that dies after this may have gone, so it is never sent again. */
    postedAt: v.optional(v.number()),
    attempts: v.number(),
    /** Type, period and person — also sent to Resend — so no one gets the same email twice. */
    idempotencyKey: v.string(),
    queuedByRunId: v.optional(v.id("agentRuns")),
    sentByRunId: v.optional(v.id("agentRuns")),
    resendId: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    /** Why it failed or was skipped, in plain words. */
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_due", ["status", "dueAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_created", ["createdAt"])
    .index("by_user", ["userId", "createdAt"]),

  /**
   * One week's Weekly News Digest, written once by the Weekly Digest agent
   * (phase 9) and read by every reader's email: its opening in English — the
   * Translator writes every other language — and the News items it carries,
   * in the order they appear. A test issue goes only to super admins.
   */
  weeklyDigestIssues: defineTable({
    /** The ISO week it covers: "2026-W40". */
    weekKey: v.string(),
    introEn: v.string(),
    itemIds: v.array(v.id("newsItems")),
    /** The Helpful content articles added that week (insights-helpful-content-plan.md, IH19); absent on issues written before. */
    helpfulIds: v.optional(v.array(v.id("libraryArticles"))),
    mode: v.union(v.literal("TEST"), v.literal("LIVE")),
    writtenByRunId: v.optional(v.id("agentRuns")),
    createdAt: v.number(),
  }).index("by_week", ["weekKey", "createdAt"]),

  /**
   * Each user's email choices (phase 8): the Weekly News Digest until they
   * turn it off (A5), in the language they last used the app in (A16).
   * Made the first time it is needed; no row reads as subscribed, in English.
   */
  readerPreferences: defineTable({
    userId: v.id("users"),
    newsDigest: v.boolean(),
    language: v.optional(v.string()),
    languageAt: v.optional(v.number()),
    /** Unguessable: the unsubscribe link carries it, never the user's id. */
    unsubscribeToken: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["unsubscribeToken"]),

  /** Addresses that bounced or complained, from Resend's webhook: never sent to again. */
  emailSuppressions: defineTable({
    /** Lower-cased. */
    email: v.string(),
    reason: v.union(v.literal("BOUNCED"), v.literal("COMPLAINED")),
    resendEmailId: v.optional(v.string()),
    at: v.number(),
  }).index("by_email", ["email"]),
};
