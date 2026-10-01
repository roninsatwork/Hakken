import { v } from "convex/values";

import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { outboxMessageTypeValidator, type OutboxMessageType } from "./outboxSchema";

/**
 * The outbox's queue (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 7): adding a row, and the Email Sender's claim, post, sent and failed
 * — the DataForSEO queue's claim-before-send (`seoCollectionQueue.ts`), so a
 * row is never sent twice. The Sender's job is `emailSenderRun.ts`; the
 * templates, by message type, are `outboxTemplates.ts`; Admin → Content →
 * Outbox lists the rows (`outboxAdmin.ts`).
 */

/** Rows claimed at a time; a bigger send takes more batches. */
export const OUTBOX_BATCH = 50;

/** Tries per email, then failed. */
export const OUTBOX_TRIES = 3;

/** A claim older than this has died with its run: returned, or failed if it may have gone. */
export const OUTBOX_CLAIM_MS = 10 * 60 * 1000;

/** How long a failed send waits before its next try. */
const RETRY_AFTER_MS = 15 * 60 * 1000;

export const MAY_HAVE_GONE =
  "Its send was interrupted after it started, so it may have gone. It is not sent again, so nobody gets it twice.";

/**
 * Queue one email — nothing is sent here. Queuing the same email twice (the
 * same idempotency key) does nothing the second time, so a retried Digest run
 * cannot queue a reader twice.
 */
export async function queueOutboxMessage(
  ctx: MutationCtx,
  message: {
    messageType: OutboxMessageType;
    userId: Id<"users">;
    email: string;
    language: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    queuedByRunId?: Id<"agentRuns">;
    dueAt?: number;
  },
): Promise<Id<"outboxMessages"> | null> {
  const held = await ctx.db.query("outboxMessages").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", message.idempotencyKey)).first();
  if (held) return null;
  const now = Date.now();
  return await ctx.db.insert("outboxMessages", {
    messageType: message.messageType,
    userId: message.userId,
    email: message.email,
    language: message.language,
    payloadJson: JSON.stringify(message.payload),
    status: "WAITING",
    dueAt: message.dueAt ?? now,
    attempts: 0,
    idempotencyKey: message.idempotencyKey,
    ...(message.queuedByRunId ? { queuedByRunId: message.queuedByRunId } : {}),
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Return the claims of Sender runs that died: one never posted goes back to
 * waiting; one posted may have gone, so it is failed rather than sent twice.
 */
export const reclaimOutbox = internalMutation({
  args: {},
  returns: v.object({ returned: v.number(), failed: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("outboxMessages")
      .withIndex("by_status_due", (q) => q.eq("status", "CLAIMED"))
      .take(OUTBOX_BATCH * 4);
    let returned = 0;
    let failed = 0;
    for (const row of stale) {
      if (row.claimedAt !== undefined && now - row.claimedAt < OUTBOX_CLAIM_MS) continue;
      if (row.postedAt !== undefined) {
        await ctx.db.patch(row._id, { status: "FAILED", error: MAY_HAVE_GONE, updatedAt: now });
        failed += 1;
      } else {
        await ctx.db.patch(row._id, { status: "WAITING", claimedBy: undefined, claimedAt: undefined, updatedAt: now });
        returned += 1;
      }
    }
    return { returned, failed };
  },
});

const claimedRow = v.object({
  _id: v.id("outboxMessages"),
  messageType: outboxMessageTypeValidator,
  userId: v.id("users"),
  email: v.string(),
  language: v.string(),
  payloadJson: v.string(),
  idempotencyKey: v.string(),
  attempts: v.number(),
});

/** A batch of waiting rows that are due, now held by this run. */
export const claimOutboxBatch = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.array(claimedRow),
  handler: async (ctx, args) => {
    const now = Date.now();
    const due = await ctx.db
      .query("outboxMessages")
      .withIndex("by_status_due", (q) => q.eq("status", "WAITING").lte("dueAt", now))
      .order("asc")
      .take(OUTBOX_BATCH);
    for (const row of due) {
      await ctx.db.patch(row._id, { status: "CLAIMED", claimedBy: args.runId, claimedAt: now, updatedAt: now });
    }
    return due.map((row) => ({
      _id: row._id,
      messageType: row.messageType,
      userId: row.userId,
      email: row.email,
      language: row.language,
      payloadJson: row.payloadJson,
      idempotencyKey: row.idempotencyKey,
      attempts: row.attempts,
    }));
  },
});

/** Just before the send: from here a dead claim may have gone. False when the row is no longer this run's. */
export const markOutboxPosting = internalMutation({
  args: { messageId: v.id("outboxMessages"), runId: v.id("agentRuns") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageId);
    if (!row || row.status !== "CLAIMED" || row.claimedBy !== args.runId) return false;
    const now = Date.now();
    await ctx.db.patch(args.messageId, { postedAt: now, attempts: row.attempts + 1, updatedAt: now });
    return true;
  },
});

/** How a send ended: sent, failed (tried again later, until its tries are spent), or skipped. */
export const settleOutboxMessage = internalMutation({
  args: {
    messageId: v.id("outboxMessages"),
    runId: v.id("agentRuns"),
    outcome: v.union(v.literal("SENT"), v.literal("FAILED"), v.literal("SKIPPED")),
    resendId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.union(v.literal("SENT"), v.literal("WAITING"), v.literal("FAILED"), v.literal("SKIPPED")),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageId);
    if (!row) return "SKIPPED";
    const now = Date.now();
    if (args.outcome === "SENT") {
      await ctx.db.patch(args.messageId, {
        status: "SENT", sentAt: now, sentByRunId: args.runId, ...(args.resendId ? { resendId: args.resendId } : {}),
        error: undefined, updatedAt: now,
      });
      return "SENT";
    }
    if (args.outcome === "SKIPPED") {
      await ctx.db.patch(args.messageId, { status: "SKIPPED", error: args.error, sentByRunId: args.runId, updatedAt: now });
      return "SKIPPED";
    }
    // Failed before it could have gone: tried again, later, while tries are left.
    if (row.attempts < OUTBOX_TRIES) {
      await ctx.db.patch(args.messageId, {
        status: "WAITING", claimedBy: undefined, claimedAt: undefined, postedAt: undefined,
        dueAt: now + RETRY_AFTER_MS, error: args.error, updatedAt: now,
      });
      return "WAITING";
    }
    await ctx.db.patch(args.messageId, { status: "FAILED", error: args.error, sentByRunId: args.runId, updatedAt: now });
    return "FAILED";
  },
});

/** Give back what a run claimed and did not reach, to wait for the next run. */
export const releaseOutboxClaims = internalMutation({
  args: { messageIds: v.array(v.id("outboxMessages")), runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const messageId of args.messageIds) {
      const row = await ctx.db.get(messageId);
      if (!row || row.status !== "CLAIMED" || row.claimedBy !== args.runId || row.postedAt !== undefined) continue;
      await ctx.db.patch(messageId, { status: "WAITING", claimedBy: undefined, claimedAt: undefined, updatedAt: now });
    }
    return null;
  },
});

/** How many are waiting, counted to a ceiling — enough to say how big the job is. */
export const countWaitingOutbox = internalQuery({
  args: {},
  returns: v.object({ count: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const ceiling = 1_000;
    const rows = await ctx.db.query("outboxMessages").withIndex("by_status_due", (q) => q.eq("status", "WAITING")).take(ceiling + 1);
    return { count: Math.min(rows.length, ceiling), more: rows.length > ceiling };
  },
});
