import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  DataForSeoBackoff,
  getDataForSeo,
  postDataForSeoTasks,
  readDataForSeoBatch,
  readDataForSeoCredentials,
  type DataForSeoCredentials,
} from "./dataForSeoRest";
import { findSeoOperation, seoResultPath } from "./dataForSeoRegistry";
import { SEO_WORKER_WIDTH } from "./seoCollectionPolicy";
import { getErrorMessage } from "./utils/lang";

/**
 * The workers: the only place in the pipeline that spends money.
 *
 * A small pool of self-scheduling chains. Each one claims a batch, sends it,
 * records what it cost and chains itself; an empty queue starts nothing, which
 * is why this pipeline needs no per-minute cron. The same shape as the
 * knowledge base's own drain chains, for the same reasons.
 *
 * Three rules hold the money side together.
 *
 * **Claim before sending.** The claim is a transaction in
 * `seoCollectionQueue.ts`; by the time this file sees a row, nobody else can
 * have it. DataForSEO charges at submission, so two workers holding one row is
 * two invoice lines.
 *
 * **Never re-post a task we have an id for.** A submitted task was paid for.
 * If its result is missing, fetch it — collecting is free.
 *
 * **A rate limit is not a failure.** DataForSEO refusing a batch means nothing
 * was accepted and nothing was charged, so the rows go back to the queue with
 * a later due time rather than burning their attempts.
 */

export const startSeoWorkers = internalAction({
  args: { cycleId: v.optional(v.id("seoCollectionCycles")) },
  returns: v.null(),
  handler: async (ctx) => {
    for (let chain = 0; chain < SEO_WORKER_WIDTH; chain += 1) {
      // Staggered like the knowledge queue's chains, so they claim different
      // batches rather than colliding on the first one and retrying.
      await ctx.scheduler.runAfter(chain * 250, internal.seoCollectionActions.processSeoQueue, {
        workerId: `seo-worker-${chain}-${Date.now()}`,
      });
    }
    return null;
  },
});

export const processSeoQueue = internalAction({
  args: { workerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internal.seoCollectionQueue.claimSeoBatch, {
      workerId: args.workerId,
    });

    if (claim.pulls.length === 0) {
      // Nothing due. If something is waiting, wake for it; if the queue is
      // empty, stop entirely rather than spinning.
      if (claim.nextDueAt) {
        const wait = Math.max(claim.nextDueAt - Date.now(), 1000);
        await ctx.scheduler.runAfter(wait, internal.seoCollectionActions.processSeoQueue, {
          workerId: args.workerId,
        });
      }
      return null;
    }

    const operation = findSeoOperation(claim.pulls[0].operationId);
    if (!operation) {
      await ctx.runMutation(internal.seoCollectionQueue.releaseSeoBatch, {
        pullIds: claim.pulls.map((pull) => pull.pullId),
        attempt: 0,
        reason: `No registered operation called '${claim.pulls[0].operationId}'.`,
      });
      return null;
    }

    let credentials: DataForSeoCredentials;
    try {
      credentials = readDataForSeoCredentials();
    } catch (error) {
      await ctx.runMutation(internal.seoCollectionQueue.releaseSeoBatch, {
        pullIds: claim.pulls.map((pull) => pull.pullId),
        attempt: 0,
        reason: getErrorMessage(error),
      });
      return null;
    }

    const pingbackUrl = seoPingbackUrl();
    const tasks = claim.pulls.map((pull) => ({
      ...JSON.parse(pull.taskArgsJson) as Record<string, unknown>,
      // Our own pull id, echoed back in the task's data. It is how a result
      // finds its row, and it is what the pingback is checked against.
      tag: pull.tag,
      ...(operation.mode === "QUEUED" && pingbackUrl
        ? { pingback_url: pingbackUrl }
        : {}),
    }));

    try {
      const envelope = await postDataForSeoTasks(operation.path, tasks, credentials);
      const outcomes = readDataForSeoBatch(envelope);

      for (const pull of claim.pulls) {
        const outcome = outcomes.get(pull.tag);
        if (!outcome) {
          // DataForSEO answered, but said nothing about this task. Treat it as
          // unsent rather than assume: an unmatched task may or may not have
          // been charged, and the sweep will find it either way.
          await ctx.runMutation(internal.seoCollectionQueue.releaseSeoBatch, {
            pullIds: [pull.pullId],
            attempt: pull.attempts,
            reason: "DataForSEO's reply did not mention this task.",
          });
          continue;
        }

        const isLive = operation.mode === "LIVE";
        const raw = isLive && outcome.result !== undefined
          ? packRaw(outcome.result)
          : null;

        await ctx.runMutation(internal.seoCollectionQueue.settleSeoSend, {
          pullId: pull.pullId,
          ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
          costUsd: credentials.sandbox ? 0 : outcome.costUsd,
          sandbox: credentials.sandbox,
          ...(outcome.error ? { error: outcome.error } : {}),
          ...(raw?.json ? { resultJson: raw.json } : {}),
          ...(raw?.truncated ? { rawTruncated: true } : {}),
          ready: isLive && !outcome.error,
        });

        if (raw?.json && !outcome.error) {
          await ctx.scheduler.runAfter(0, internal.seoCollectionParse.parseSeoResult, {
            pullId: pull.pullId,
          });
        }
      }
    } catch (error) {
      const backoff = error instanceof DataForSeoBackoff;
      await ctx.runMutation(internal.seoCollectionQueue.releaseSeoBatch, {
        pullIds: claim.pulls.map((pull) => pull.pullId),
        attempt: claim.pulls[0].attempts,
        reason: backoff
          ? `DataForSEO replied ${error.status}; the batch was not accepted.`
          : getErrorMessage(error),
      });
    }

    await ctx.scheduler.runAfter(0, internal.seoCollectionActions.processSeoQueue, {
      workerId: args.workerId,
    });
    return null;
  },
});

/**
 * Collect a finished task.
 *
 * Always ours to call, never DataForSEO's to push. Their callback cannot carry
 * an auth header, so a posted result would arrive unauthenticated and a forged
 * one could poison the record. Fetching costs nothing — the charge was taken
 * when the task was set — so there is no reason to accept a result we did not
 * ask for.
 */
export const fetchSeoResult = internalAction({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pull = await ctx.runQuery(internal.seoCollectionQueue.getPullForFetch, {
      pullId: args.pullId,
    });
    if (!pull?.taskId) return null;

    const operation = findSeoOperation(pull.operationId);
    const path = operation ? seoResultPath(operation, pull.taskId) : null;
    if (!path) return null;

    try {
      const credentials = readDataForSeoCredentials();
      const envelope = await getDataForSeo(path, credentials);
      const task = envelope.tasks?.[0];

      if (!task || (task.status_code !== undefined && task.status_code >= 40000)) {
        await ctx.runMutation(internal.seoCollectionQueue.settleSeoResult, {
          pullId: args.pullId,
          error: task?.status_message ?? "DataForSEO had no result for this task.",
        });
        return null;
      }

      const raw = packRaw(task.result ?? null);
      await ctx.runMutation(internal.seoCollectionQueue.settleSeoResult, {
        pullId: args.pullId,
        ...(raw.json ? { resultJson: raw.json } : {}),
        ...(raw.truncated ? { rawTruncated: true } : {}),
        // Collecting is free, so this does not move the cost. What the task
        // cost was recorded when it was set, which is when it was charged.
        costUsd: 0,
      });
      await ctx.scheduler.runAfter(0, internal.seoCollectionParse.parseSeoResult, {
        pullId: args.pullId,
      });
    } catch (error) {
      if (error instanceof DataForSeoBackoff) return null;
      await ctx.runMutation(internal.seoCollectionQueue.settleSeoResult, {
        pullId: args.pullId,
        error: getErrorMessage(error),
      });
    }
    return null;
  },
});

/**
 * The raw response, if it is small enough to be worth keeping.
 *
 * Kept so a parser bug can be fixed and re-run rather than re-bought, and
 * cleared by the sweep after its retention window. A response over the ceiling
 * is dropped and flagged: a document has a hard size limit, and a write that
 * fails is worse than a payload we cannot re-read.
 */
function packRaw(result: unknown): { json: string | null; truncated: boolean } {
  const json = JSON.stringify(result ?? null);
  if (json.length > MAX_RAW_CHARS) return { json: null, truncated: true };
  return { json, truncated: false };
}

/**
 * Comfortably inside Convex's document ceiling with the rest of the row, and
 * large enough for every response the registry's four operations return at
 * their default limits.
 */
const MAX_RAW_CHARS = 512_000;

/**
 * Where DataForSEO should ping when a task is ready.
 *
 * Absent means we simply do not ask for a ping, and the hourly sweep collects
 * results instead. That is a slower pipeline, not a broken one, which is the
 * right failure for a deployment that has not published its URL yet.
 */
function seoPingbackUrl(): string | null {
  const site = process.env.CONVEX_SITE_URL;
  if (!site) return null;
  // `$id` is DataForSEO's own placeholder; they substitute the task id.
  return `${site}/api/seo/pingback?id=$id&tag=$tag`;
}
