import { v } from "convex/values";

import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  DataForSeoAccountError,
  DataForSeoBackoff,
  DataForSeoUncertain,
  dataForSeoCodeKind,
  getDataForSeo,
  LIVE_REQUEST_TIMEOUT_MS,
  postDataForSeoTasks,
  readDataForSeoBatch,
  readDataForSeoCredentials,
  type DataForSeoCredentials,
  type DataForSeoEnvelope,
} from "./dataForSeoRest";
import { findSeoOperation, seoResultPath } from "./dataForSeoRegistry";
import { rowsLeftOffIn, slimSeoResult } from "./dataForSeoSlim";
import { isCrawlUnfinished } from "./dataForSeoCrawlOperations";
import { splitAnswer } from "./seoPullAnswers";
import { getErrorMessage } from "./utils/lang";
import type { Id } from "./_generated/dataModel";

/**
 * The sending: the only place in the pipeline that spends money, and it runs
 * only inside the DataForSEO Collector agent's run (convex/seoAgentRuns.ts).
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
 *
 * **What DataForSEO may have taken is never sent again** (2026-09-25). A batch
 * is marked as being sent just before it goes; after that, a timeout, a
 * dropped connection or a gateway error fails it rather than re-queueing it,
 * and its outcomes are recorded in one transaction that is retried until it
 * lands. Before, one failed record — or a slow live answer — put an accepted
 * batch back in the queue to be bought again.
 */

/** What one call of `sendNextBatch` did, so the Collector knows whether to go on. */
export type SendOutcome =
  | { kind: "SENT"; count: number }
  | { kind: "EMPTY"; nextDueAt: number | null }
  | { kind: "CAPPED" }
  /** DataForSEO said "not now" — a rate limit or "unavailable". Nothing was taken or counted. */
  | { kind: "REFUSED"; reason: string }
  /** DataForSEO refused the account, or it is not set up. Nothing was taken; nothing will be until a person fixes it. */
  | { kind: "ACCOUNT"; reason: string };

/** Tries at recording a batch's outcomes. It is safe to repeat, and DataForSEO already has the batch. */
const RECORD_TRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claim the next batch and send it — one step of the Collector's run.
 *
 * This was a pool of self-scheduling worker chains, started the moment work
 * was queued, so data was bought with no agent run behind it and none of it
 * reached an agent's logs or costs. Anthony, 2026-09-23: collection works
 * only through the agents. The Collector now calls this in a loop, and every
 * call it sends is settled against the Collector's run.
 */
export async function sendNextBatch(
  ctx: ActionCtx,
  args: { workerId: string; runId: Id<"agentRuns"> },
): Promise<SendOutcome> {
  const claim = await ctx.runMutation(internal.seoCollectionQueue.claimSeoBatch, {
    workerId: args.workerId,
    runId: args.runId,
  });

  if (claim.capped) return { kind: "CAPPED" };
  if (claim.pulls.length === 0) return { kind: "EMPTY", nextDueAt: claim.nextDueAt };
  const claimedIds = claim.pulls.map((pull) => pull.pullId);
  const release = async (pullIds: Id<"seoDataPulls">[], reason: string, countAttempt: boolean) => {
    if (pullIds.length === 0) return;
    await ctx.runMutation(internal.seoCollectionQueue.releaseSeoBatch, {
      pullIds,
      attempt: claim.pulls[0].attempts,
      reason,
      countAttempt,
    });
  };

  const operation = findSeoOperation(claim.pulls[0].operationId);
  if (!operation) {
    await release(claimedIds, `No registered operation called '${claim.pulls[0].operationId}'.`, true);
    return { kind: "SENT", count: 0 };
  }

  let credentials: DataForSeoCredentials;
  try {
    credentials = readDataForSeoCredentials();
  } catch (error) {
    // Checked before the run starts as well; taken back without a try.
    await release(claimedIds, getErrorMessage(error), false);
    return { kind: "ACCOUNT", reason: getErrorMessage(error) };
  }

  // Only what is still ours goes: marked as being sent, from here on it is
  // never put back in the queue.
  const marked = await ctx.runMutation(internal.seoCollectionQueue.markSeoPosting, {
    pullIds: claimedIds,
    workerId: args.workerId,
  });
  const sending = claim.pulls.filter((pull) => marked.includes(pull.pullId));
  if (sending.length === 0) return { kind: "SENT", count: 0 };
  const sendingIds = sending.map((pull) => pull.pullId);

  const pingbackUrl = seoPingbackUrl();
  const tasks = sending.map((pull) => ({
    ...JSON.parse(pull.taskArgsJson) as Record<string, unknown>,
    // Our own pull id, echoed back in the task's data. It is how a result
    // finds its row, and it is what the pingback is checked against.
    tag: pull.tag,
    ...(operation.mode === "QUEUED" && pingbackUrl
      ? { pingback_url: pingbackUrl }
      : {}),
  }));

  let envelope: DataForSeoEnvelope;
  try {
    envelope = await postDataForSeoTasks(
      operation.path,
      tasks,
      credentials,
      operation.mode === "LIVE" ? { timeoutMs: LIVE_REQUEST_TIMEOUT_MS } : {},
    );
  } catch (error) {
    if (error instanceof DataForSeoBackoff) {
      await release(sendingIds, error.message, false);
      return { kind: "REFUSED", reason: error.message };
    }
    if (error instanceof DataForSeoAccountError) {
      await release(sendingIds, error.message, false);
      return { kind: "ACCOUNT", reason: error.message };
    }
    if (error instanceof DataForSeoUncertain) {
      await ctx.runMutation(internal.seoCollectionQueue.failUncertainSends, {
        pullIds: sendingIds,
        reason: error.message,
        runId: args.runId,
      });
      return { kind: "SENT", count: 0 };
    }
    // A plain refusal of the whole request: nothing was taken, and it may be tried again.
    await release(sendingIds, getErrorMessage(error), true);
    return { kind: "SENT", count: 0 };
  }

  const outcomes = readDataForSeoBatch(envelope);
  const results: Array<{
    pullId: Id<"seoDataPulls">;
    taskId?: string;
    costUsd: number;
    error?: string;
    resultParts?: string[];
    rawTruncated?: boolean;
    rowsLeftOff?: number;
    ready: boolean;
  }> = [];
  const unmentioned: Id<"seoDataPulls">[] = [];
  const notTaken: Id<"seoDataPulls">[] = [];
  let accountReason: string | null = null;
  let refusedReason: string | null = null;

  for (const pull of sending) {
    const outcome = outcomes.get(pull.tag);
    if (!outcome) {
      unmentioned.push(pull.pullId);
      continue;
    }
    // A task refused for the account or the rate was not taken: back to the queue, no try counted.
    const kind = dataForSeoCodeKind(outcome.statusCode);
    if (kind === "ACCOUNT" || kind === "RATE_LIMITED") {
      notTaken.push(pull.pullId);
      if (kind === "ACCOUNT") accountReason ??= outcome.error ?? "the account was refused";
      else refusedReason ??= outcome.error ?? "the rate limit was reached";
      continue;
    }
    const isLive = operation.mode === "LIVE";
    const kept = isLive && outcome.result !== undefined ? keepAnswer(operation.id, outcome.result) : {};
    results.push({
      pullId: pull.pullId,
      ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
      costUsd: credentials.sandbox ? 0 : outcome.costUsd,
      ...(outcome.error ? { error: outcome.error } : {}),
      ...kept,
      ready: isLive && !outcome.error,
    });
  }

  // Recorded first, before anything else can fail: DataForSEO has these.
  if (results.length > 0) {
    await recordSends(ctx, { runId: args.runId, sandbox: credentials.sandbox, results });
  }
  if (unmentioned.length > 0) {
    // An answer that says nothing of a task may still have charged for it.
    await ctx.runMutation(internal.seoCollectionQueue.failUncertainSends, {
      pullIds: unmentioned,
      reason: "DataForSEO's reply did not mention it",
      runId: args.runId,
    });
  }
  await release(notTaken, accountReason ?? refusedReason ?? "not taken", false);

  if (accountReason) return { kind: "ACCOUNT", reason: accountReason };
  if (refusedReason && results.length === 0) return { kind: "REFUSED", reason: refusedReason };
  return { kind: "SENT", count: results.length };
}

/**
 * Record a sent batch's outcomes, retrying until it lands. Safe to repeat —
 * a request already recorded is skipped — and never given up for a release:
 * if it cannot be recorded at all, the requests stay marked as being sent, the
 * hourly check fails them rather than buying them again, and a pingback still
 * finds each one by its tag.
 */
async function recordSends(
  ctx: ActionCtx,
  args: { runId: Id<"agentRuns">; sandbox: boolean; results: Array<Record<string, unknown> & { pullId: Id<"seoDataPulls">; costUsd: number; ready: boolean }> },
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await ctx.runMutation(internal.seoCollectionQueue.settleSeoSendBatch, args as never);
      return;
    } catch (error) {
      if (attempt >= RECORD_TRIES) throw error;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
}

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

    // Each fetch that does not bring the answer says why, on the request.
    const waiting = async (said: string) => {
      await ctx.runMutation(internal.seoCollectionQueue.noteSeoFetch, { pullId: args.pullId, said });
      return null;
    };

    let envelope: DataForSeoEnvelope;
    try {
      envelope = await getDataForSeo(path, readDataForSeoCredentials());
    } catch (error) {
      // Not reached, not now, or the account refused: the answer is paid for
      // and waits. The hourly check asks again until `SEO_RESULT_TIMEOUT_MS`,
      // and only that gives up — a failed fetch never did (2026-09-25).
      return await waiting(`The fetch did not get through: ${getErrorMessage(error)}`);
    }
    const task = envelope.tasks?.[0];
    if (!task) return await waiting("DataForSEO's reply had no task in it.");

    // A crawl's summary can be asked for while the crawl is still running.
    // That is not the answer yet: leave the task to be asked again.
    if (isCrawlUnfinished(pull.operationId, task.result)) return await waiting("The crawl is still running.");

    // Still running (40601, 40602), refused for the moment, or a fault on
    // their side: asked again later. Only a definite task error fails it.
    const kind = dataForSeoCodeKind(task.status_code);
    const said = task.status_message ?? `status ${task.status_code ?? "unknown"}`;
    if (kind === "IN_PROGRESS") return await waiting(`DataForSEO is still working on it (${said}).`);
    if (kind === "RATE_LIMITED") return await waiting(`DataForSEO said not now: ${said}`);
    if (kind === "ACCOUNT") return await waiting(`DataForSEO refused the account: ${said}`);
    if (task.status_code !== undefined && task.status_code >= 50000) return await waiting(`A fault on DataForSEO's side: ${said}`);
    if (kind === "REFUSED") {
      await ctx.runMutation(internal.seoCollectionQueue.settleSeoResult, {
        pullId: args.pullId,
        error: task.status_message ?? `DataForSEO returned status ${task.status_code ?? "unknown"}.`,
      });
      return null;
    }

    // Recorded, and filed from inside the record — once, however many times
    // it is fetched. A record that fails leaves it waiting, never failed.
    await ctx.runMutation(internal.seoCollectionQueue.settleSeoResult, {
      pullId: args.pullId,
      ...keepAnswer(pull.operationId, task.result ?? null),
      // Collecting is free, so this does not move the cost. What the task
      // cost was recorded when it was set, which is when it was charged.
      costUsd: 0,
    });
    return null;
  },
});

/**
 * An answer as it is kept: trimmed to what the parsers read
 * (`dataForSeoSlim.ts`), then cut into parts no larger than a document may
 * be (`seoPullAnswers.ts`) — passed to the mutation that records it as those
 * parts, so no single value is ever larger than that. Kept so a parser bug can
 * be fixed and re-run rather than re-bought, and cleared by the sweep after
 * its retention window.
 *
 * Nothing is left off without saying so: rows left off the end of a list are
 * counted on the request (`rowsLeftOff`), and an answer too large to keep at
 * all is marked (`rawTruncated`) — before 2026-09-25 it was dropped, and a
 * paid answer filed nothing, without a word.
 */
function keepAnswer(
  operationId: string,
  result: unknown,
): { resultParts?: string[]; rawTruncated?: boolean; rowsLeftOff?: number } {
  const stored = slimSeoResult(operationId, result);
  const rowsLeftOff = rowsLeftOffIn(stored);
  const parts = splitAnswer(JSON.stringify(stored ?? null));
  return {
    ...(parts ? { resultParts: parts } : { rawTruncated: true }),
    ...(rowsLeftOff > 0 ? { rowsLeftOff } : {}),
  };
}

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
