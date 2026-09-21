import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import {
  SEO_BATCH_SIZE,
  SEO_MAX_ATTEMPTS,
  seoBackoffMs,
} from "./seoCollectionPolicy";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * The transactional half of the queue: claiming, releasing and settling.
 *
 * Everything here is a mutation because everything here is a decision about
 * money. A worker reads a batch and marks it claimed **in one transaction**,
 * so two chains can never hold the same row; a row that has been sent carries
 * a task id and is never sent again, because DataForSEO charged when it was
 * set and a second send is a second invoice line for data already bought.
 *
 * The sending itself lives in `seoCollectionActions.ts`, which is where the
 * network is. This file never calls out.
 */

/** A claimed row, with only what the sender needs. */
const claimedPull = v.object({
  pullId: v.id("seoDataPulls"),
  operationId: v.string(),
  mode: v.union(v.literal("QUEUED"), v.literal("LIVE")),
  taskArgsJson: v.string(),
  tag: v.string(),
  attempts: v.number(),
  cycleId: v.optional(v.id("seoCollectionCycles")),
});

/**
 * Take the next batch of work, or nothing.
 *
 * One operation per batch, because one DataForSEO request goes to one endpoint.
 * The first due row decides which operation this batch is for; the rest of the
 * batch is whatever else is due for that same operation.
 *
 * Claim and mark are one transaction on purpose. Several chains are awake at
 * once, and a read-then-patch pair would hand the same row to two of them —
 * which here is not a duplicated log line but a duplicated charge.
 */
export const claimSeoBatch = internalMutation({
  args: { workerId: v.string() },
  returns: v.object({
    pulls: v.array(claimedPull),
    /** When the next row comes due, if the queue is not empty but not ready. */
    nextDueAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const due = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_status_due", (q) => q.eq("status", "PENDING").lte("dueAt", now))
      .order("asc")
      .take(SEO_BATCH_SIZE * 2);

    if (due.length === 0) {
      const waiting = await ctx.db
        .query("seoDataPulls")
        .withIndex("by_status_due", (q) => q.eq("status", "PENDING"))
        .order("asc")
        .first();
      return { pulls: [], nextDueAt: waiting?.dueAt ?? null };
    }

    const operationId = due[0].operationId;
    const batch = due.filter((row) => row.operationId === operationId).slice(0, SEO_BATCH_SIZE);

    // Checked before every batch rather than once when the cycle opened. A
    // cycle runs for hours after the agent run that started it has ended, and a
    // cap that was only read at the start would let the rest of those hours
    // spend freely.
    const affordable = await withinSpendCap(ctx, batch);
    if (affordable.length === 0) {
      await markCyclesCapped(ctx, batch, affordable.length === 0 ? "SPEND" : null);
      return { pulls: [], nextDueAt: null };
    }

    const claimed: Array<typeof claimedPull.type> = [];
    for (const row of affordable) {
      await ctx.db.patch(row._id, {
        status: "CLAIMED",
        claimedBy: args.workerId,
        claimedAt: now,
      });
      claimed.push({
        pullId: row._id,
        operationId: row.operationId,
        mode: row.mode,
        taskArgsJson: row.taskArgsJson,
        tag: row.tag,
        attempts: row.attempts ?? 0,
        ...(row.cycleId ? { cycleId: row.cycleId } : {}),
      });
    }

    return { pulls: claimed, nextDueAt: null };
  },
});

/**
 * How much of this batch the agent's budget will still cover.
 *
 * The cap belongs to the agent, never to a company or a website — Hakken
 * absorbs DataForSEO spend and no customer ever sees it, so the only budget
 * that means anything is the operator's own. An agent with no cap set is not
 * capped; that is the platform's existing convention for `maxCostGBP`.
 *
 * The comparison is deliberately crude while the currency question is open:
 * costs are stored in USD exactly as DataForSEO reports them, and converting
 * them on the way in would make the ledger uncheckable against an invoice.
 */
async function withinSpendCap(
  ctx: MutationCtx,
  batch: Doc<"seoDataPulls">[],
): Promise<Doc<"seoDataPulls">[]> {
  const cycleId = batch[0]?.cycleId;
  if (!cycleId) return batch;

  const cycle = await ctx.db.get(cycleId);
  if (!cycle?.agentRunId) return batch;

  const run = await ctx.db.get(cycle.agentRunId);
  if (!run) return batch;

  const agent = await ctx.db.get(run.agentId);
  const cap = agent?.maxCostGBP;
  if (typeof cap !== "number" || cap <= 0) return batch;

  return cycle.totalCostUsd >= cap ? [] : batch;
}

async function markCyclesCapped(
  ctx: MutationCtx,
  batch: Doc<"seoDataPulls">[],
  reason: "SPEND" | null,
) {
  if (!reason) return;
  const cycleIds = new Set(batch.map((row) => row.cycleId).filter(Boolean));
  for (const cycleId of cycleIds) {
    const cycle = await ctx.db.get(cycleId as Id<"seoCollectionCycles">);
    if (!cycle || cycle.status === "CAPPED_SPEND") continue;
    await ctx.db.patch(cycle._id, {
      status: "CAPPED_SPEND",
      cappedReason: "The collecting agent's spend cap was reached; the rest of this cycle was left unsent.",
    });
  }
}

/**
 * Put a batch back because DataForSEO said "not now".
 *
 * A rate limit is not a failure of the request — nothing was accepted and
 * nothing was charged — so the rows return to `PENDING` with a later due time.
 * Attempts still count, because a queue that retried forever would hide a
 * genuine outage behind an infinite backoff.
 */
export const releaseSeoBatch = internalMutation({
  args: {
    pullIds: v.array(v.id("seoDataPulls")),
    attempt: v.number(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const pullId of args.pullIds) {
      const row = await ctx.db.get(pullId);
      if (!row || row.status !== "CLAIMED") continue;

      const attempts = (row.attempts ?? 0) + 1;
      if (attempts >= SEO_MAX_ATTEMPTS) {
        await ctx.db.patch(pullId, {
          status: "FAILED",
          attempts,
          error: args.reason,
          completedAt: now,
          claimedBy: undefined,
          claimedAt: undefined,
        });
        await countSettled(ctx, row, "FAILED", 0);
        continue;
      }

      await ctx.db.patch(pullId, {
        status: "PENDING",
        attempts,
        dueAt: now + seoBackoffMs(args.attempt),
        claimedBy: undefined,
        claimedAt: undefined,
      });
    }
    return null;
  },
});

/**
 * Record what a send did, one row at a time.
 *
 * A queued task becomes `SUBMITTED` and waits for its pingback; a live one is
 * `READY` already. Either way the cost is written now, because it was charged
 * now — including for a task DataForSEO refused, which still costs money.
 */
export const settleSeoSend = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    taskId: v.optional(v.string()),
    costUsd: v.number(),
    sandbox: v.boolean(),
    error: v.optional(v.string()),
    resultJson: v.optional(v.string()),
    rawTruncated: v.optional(v.boolean()),
    ready: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pullId);
    if (!row) return null;

    const now = Date.now();
    const status = args.error ? "FAILED" : args.ready ? "READY" : "SUBMITTED";

    await ctx.db.patch(args.pullId, {
      status,
      ...(args.taskId ? { taskId: args.taskId } : {}),
      costUsd: args.costUsd,
      sandbox: args.sandbox,
      ...(args.error ? { error: args.error } : {}),
      ...(args.resultJson ? { resultJson: args.resultJson } : {}),
      ...(args.rawTruncated ? { rawTruncated: true } : {}),
      sentAt: now,
      claimedBy: undefined,
      claimedAt: undefined,
      ...(status === "SUBMITTED" ? {} : { completedAt: now }),
    });

    await countSettled(ctx, row, status, args.costUsd);
    return null;
  },
});

/**
 * Move a cycle's counters and the day's rollup.
 *
 * The rollup is written here, at the moment of the transition, because a
 * dashboard that summed the pull table would work perfectly until the table
 * had millions of rows in it. Same rule the governance and inventory screens
 * already follow.
 */
async function countSettled(
  ctx: MutationCtx,
  row: Doc<"seoDataPulls">,
  status: "SUBMITTED" | "READY" | "FAILED",
  costUsd: number,
) {
  const day = new Date().toISOString().slice(0, 10);

  if (row.cycleId) {
    const cycle = await ctx.db.get(row.cycleId);
    if (cycle) {
      await ctx.db.patch(cycle._id, {
        sentCount: cycle.sentCount + (status === "SUBMITTED" || status === "READY" ? 1 : 0),
        readyCount: cycle.readyCount + (status === "READY" ? 1 : 0),
        failedCount: cycle.failedCount + (status === "FAILED" ? 1 : 0),
        totalCostUsd: cycle.totalCostUsd + costUsd,
      });
    }
  }

  await bumpRollup(ctx, "platform", day, status, costUsd);
  if (row.companyId) await bumpRollup(ctx, `company:${row.companyId}`, day, status, costUsd);
}

export async function bumpRollup(
  ctx: MutationCtx,
  scopeKey: string,
  day: string,
  status: "SUBMITTED" | "READY" | "FAILED",
  costUsd: number,
) {
  const existing = await ctx.db
    .query("seoDayRollups")
    .withIndex("by_scope_day", (q) => q.eq("scopeKey", scopeKey).eq("day", day))
    .unique();

  const delta = {
    pulls: 1,
    reused: 0,
    sent: status === "SUBMITTED" || status === "READY" ? 1 : 0,
    ready: status === "READY" ? 1 : 0,
    failed: status === "FAILED" ? 1 : 0,
    costUsd,
  };

  if (!existing) {
    await ctx.db.insert("seoDayRollups", { scopeKey, day, ...delta, updatedAt: Date.now() });
    return;
  }

  await ctx.db.patch(existing._id, {
    pulls: existing.pulls + delta.pulls,
    sent: existing.sent + delta.sent,
    ready: existing.ready + delta.ready,
    failed: existing.failed + delta.failed,
    costUsd: existing.costUsd + delta.costUsd,
    updatedAt: Date.now(),
  });
}

/**
 * What a fetch needs to know, and nothing more.
 *
 * Kept narrow on purpose: this is read on the path a public webhook can
 * trigger, and a handler that loaded the whole row would be a handler that
 * could be made to load whatever else ends up on it.
 */
export const getPullForFetch = internalQuery({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.union(v.null(), v.object({
    operationId: v.string(),
    taskId: v.union(v.string(), v.null()),
    status: v.string(),
  })),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pullId);
    if (!row) return null;
    return {
      operationId: row.operationId,
      taskId: row.taskId ?? null,
      status: row.status,
    };
  },
});

/**
 * File a collected result, or record that it never came.
 *
 * Separate from `settleSeoSend` because these are different moments with
 * different money attached: a send is charged and a collection is free. Sharing
 * one mutation between them would make it very easy to add a cost to the wrong
 * one.
 */
export const settleSeoResult = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    resultJson: v.optional(v.string()),
    rawTruncated: v.optional(v.boolean()),
    costUsd: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pullId);
    if (!row) return null;
    // A row already settled is left alone. The pingback and the hourly sweep
    // can both reach the same task, and the second one to arrive must not
    // double-count it in the cycle or the rollup.
    if (row.status === "READY" || row.status === "FAILED") return null;

    const now = Date.now();
    const status = args.error ? "FAILED" : "READY";

    await ctx.db.patch(args.pullId, {
      status,
      ...(args.resultJson ? { resultJson: args.resultJson } : {}),
      ...(args.rawTruncated ? { rawTruncated: true } : {}),
      ...(args.error ? { error: args.error } : {}),
      ...(args.costUsd ? { costUsd: row.costUsd + args.costUsd } : {}),
      completedAt: now,
    });

    await countSettled(ctx, row, status, args.costUsd ?? 0);
    return null;
  },
});

/**
 * Note that DataForSEO says a task is ready.
 *
 * All the pingback route is allowed to do. It carries no result and is trusted
 * with nothing beyond "go and look", because a callback on a public URL cannot
 * prove who sent it.
 */
export const markSeoPinged = internalMutation({
  args: { taskId: v.string() },
  returns: v.union(v.null(), v.id("seoDataPulls")),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();

    // An id we never sent, or a row that is already settled. Either way there
    // is nothing to do, and saying so cheaply is what stops a flood of forged
    // ids turning into a flood of our own outbound fetches.
    if (!row || row.status !== "SUBMITTED") return null;

    await ctx.db.patch(row._id, { pingedAt: Date.now() });
    return row._id;
  },
});
