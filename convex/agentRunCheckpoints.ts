import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getNextStepIndex, updateMemoryUsageOutcomeForRun } from "./agentRunStateService";
import { getThreadMessageDimensions } from "./chatService";
import {
  AGENT_RUN_STALL_MS,
  decideStalledRunAction,
  getStalledRunFailureMessage,
} from "./agentRunContinuationService";

/**
 * Durable working state for in-flight agent runs.
 *
 * The objective loop writes a checkpoint after every model turn. Two things read
 * it: a scheduled continuation picking the run back up in a fresh action, and
 * the sweeper below deciding whether a run marked RUNNING is actually alive.
 *
 * Nothing here is client-callable. A checkpoint holds the full model transcript,
 * including retrieved knowledge and tool results, and there is no reason for it
 * to leave the backend.
 */

/** How many stalled runs one sweeper tick will handle. */
const STALLED_RUN_SWEEP_LIMIT = 25;

export const getCheckpointInternal = internalQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentRunCheckpoints")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
  },
});

/**
 * Write the run's position, replacing any previous one.
 *
 * There is exactly one checkpoint per run: this is a save point, not a history.
 * `updatedAt` doubles as the liveness signal the sweeper reads, so it moves on
 * every write even when nothing else changed.
 */
export const saveCheckpointInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    threadId: v.optional(v.id("threads")),
    status: v.union(v.literal("ACTIVE"), v.literal("AWAITING_APPROVAL")),
    transcriptJson: v.string(),
    transcriptTrimmed: v.optional(v.boolean()),
    stepIndex: v.number(),
    loopIndex: v.number(),
    toolCallCount: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    streamMessageId: v.optional(v.id("messages")),
    stablePrefixTurns: v.optional(v.number()),
    promptCacheName: v.optional(v.string()),
    segmentCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("agentRunCheckpoints")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("agentRunCheckpoints", {
      ...args,
      resumeAttempts: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Drop the checkpoint once the run has finished.
 *
 * Working state, not audit trail — `agentRunSteps` is the record of what
 * happened. Leaving it behind would also keep offering the sweeper a run that
 * has already concluded.
 */
export const clearCheckpointInternal = internalMutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentRunCheckpoints")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/**
 * Revive a run that has been waiting on a human decision.
 *
 * The approval path parks the run with the tool result already appended to the
 * transcript, so continuing is just a matter of flipping the status back and
 * handing it to the scheduler.
 */
export const reactivateCheckpointInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    transcriptJson: v.string(),
    stepIndex: v.number(),
    toolCallCount: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentRunCheckpoints")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
    if (!existing) return false;

    await ctx.db.patch(existing._id, {
      status: "ACTIVE",
      transcriptJson: args.transcriptJson,
      stepIndex: args.stepIndex,
      toolCallCount: args.toolCallCount,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.agentRuntime.continueAgentObjective, {
      runId: args.runId,
    });
    return true;
  },
});

/**
 * Find runs that claim to be RUNNING but have stopped moving, and either revive
 * or bury them.
 *
 * A Convex action that is killed — by the execution ceiling, by a deploy, by an
 * out-of-memory — runs no catch block. Before this existed, such a run stayed
 * marked RUNNING for ever and its reply stayed marked as streaming, so the
 * reader watched a caret against an answer that was never coming.
 *
 * Written as a mutation, deliberately. Reading a stale checkpoint and claiming
 * it must be one atomic step; done in an action, two overlapping sweeps could
 * both revive the same run and execute its remaining tool calls twice.
 */
export const recoverStalledRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - AGENT_RUN_STALL_MS;

    const candidates = await ctx.db
      .query("agentRunCheckpoints")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "ACTIVE").lt("updatedAt", cutoff)
      )
      .take(STALLED_RUN_SWEEP_LIMIT);

    let resumed = 0;
    let failed = 0;
    let discarded = 0;

    for (const checkpoint of candidates) {
      const run = await ctx.db.get(checkpoint.runId);

      // The run finished, was cancelled, or was deleted while the checkpoint
      // lingered. Nothing to recover.
      if (!run || run.status !== "RUNNING") {
        await ctx.db.delete(checkpoint._id);
        discarded += 1;
        continue;
      }

      const decision = decideStalledRunAction({
        checkpointUpdatedAt: checkpoint.updatedAt,
        now,
        resumeAttempts: checkpoint.resumeAttempts,
        hasTranscript: checkpoint.transcriptJson.length > 0,
      });

      if (decision === "WAIT") continue;

      if (decision === "RESUME") {
        // Move `updatedAt` before scheduling: the continuation will not write
        // its own checkpoint until it completes a model turn, and without this
        // the next sweep would see the same stale timestamp and revive the run
        // a second time alongside the first.
        await ctx.db.patch(checkpoint._id, {
          resumeAttempts: checkpoint.resumeAttempts + 1,
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(0, internal.agentRuntime.continueAgentObjective, {
          runId: checkpoint.runId,
        });
        resumed += 1;
        continue;
      }

      await failRunFromCheckpoint(ctx, {
        checkpointId: checkpoint._id,
        runId: checkpoint.runId,
        agentId: checkpoint.agentId,
        companyId: checkpoint.companyId,
        threadId: checkpoint.threadId,
        streamMessageId: checkpoint.streamMessageId,
        inputTokens: checkpoint.inputTokens,
        outputTokens: checkpoint.outputTokens,
        now,
      });
      failed += 1;
    }

    return { examined: candidates.length, resumed, failed, discarded };
  },
});

/**
 * Conclude a run that cannot be recovered.
 *
 * Everything the runtime would have done on its way out has to happen here
 * instead, because the runtime is gone: record a terminal step, mark the run,
 * attribute the outcome to the memories it used, and — the part a reader
 * actually notices — close the half-written reply.
 */
async function failRunFromCheckpoint(
  ctx: Pick<MutationCtx, "db">,
  args: {
    checkpointId: Id<"agentRunCheckpoints">;
    runId: Id<"agentRuns">;
    agentId: Id<"agents">;
    companyId?: Id<"companies">;
    threadId?: Id<"threads">;
    streamMessageId?: Id<"messages">;
    inputTokens: number;
    outputTokens: number;
    now: number;
  },
) {
  const message = getStalledRunFailureMessage();

  await ctx.db.insert("agentRunSteps", {
    runId: args.runId,
    agentId: args.agentId,
    companyId: args.companyId,
    stepIndex: await getNextStepIndex(ctx, args.runId),
    kind: "FINAL",
    status: "FAILED",
    output: message,
    error: "Run stalled and exceeded the resume limit.",
    startedAt: args.now,
    completedAt: args.now,
  });

  await ctx.db.patch(args.runId, {
    status: "FAILED",
    error: "Run stalled and exceeded the resume limit.",
    finalOutput: message,
    completedAt: args.now,
    updatedAt: args.now,
  });
  await updateMemoryUsageOutcomeForRun(ctx, args.runId, "FAILED");

  if (args.streamMessageId) {
    const streamed = await ctx.db.get(args.streamMessageId);
    if (streamed) {
      await ctx.db.patch(args.streamMessageId, {
        content: message,
        isStreaming: false,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
      });
    }
  } else if (args.threadId) {
    // Nothing was streamed, so the thread's last message is still the user's
    // and every chat surface is showing a thinking indicator. Post the failure
    // so the conversation is not left hanging.
    const thread = await ctx.db.get(args.threadId);
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      content: message,
      createdAt: args.now,
      ...getThreadMessageDimensions(thread),
    });
  }

  await ctx.db.delete(args.checkpointId);
}
