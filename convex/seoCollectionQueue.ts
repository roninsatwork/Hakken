import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  SEO_BATCH_SIZE,
  SEO_MAX_ATTEMPTS,
  SEO_MOVES_DELAY_MS,
  seoBackoffMs,
} from "./seoCollectionPolicy";
import type { Doc, Id } from "./_generated/dataModel";
import { requestRunReport, scheduleLateRunReports } from "./seoRunReports";
import { recordOperationCost } from "./websiteTrackingStats";
import { appendRunStep } from "./agentRunStepWriter";
import { storePullAnswer } from "./seoPullAnswers";
import type { MutationCtx, QueryCtx } from "./_generated/server";

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
  args: {
    workerId: v.string(),
    /** The Collector's run, whose spend limit this batch must fit inside. */
    runId: v.optional(v.id("agentRuns")),
  },
  returns: v.object({
    pulls: v.array(claimedPull),
    /** When the next row comes due, if the queue is not empty but not ready. */
    nextDueAt: v.union(v.number(), v.null()),
    /** The run has spent its limit; what is left waits for the next run. */
    capped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    // The Collector's spend limit, checked before every batch against what its
    // run has already spent. Nothing is marked on the queue when it is reached:
    // the rows stay waiting, and the next run of the Collector takes them.
    if (args.runId && await runHasSpentItsLimit(ctx, args.runId)) {
      return { pulls: [], nextDueAt: null, capped: true };
    }

    const waitingNow = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_status_due", (q) => q.eq("status", "PENDING").lte("dueAt", now))
      .order("asc")
      .take(SEO_BATCH_SIZE * 2);

    // A call waits for the Collector's next run. Collection switched off in
    // the meantime — for the company, or for this website on the company —
    // means nobody wants it any more, and it is dropped rather than bought.
    const due: typeof waitingNow = [];
    let dropped = 0;
    for (const row of waitingNow) {
      if (await stillWanted(ctx, row)) {
        due.push(row);
        continue;
      }
      await ctx.db.patch(row._id, { status: "FAILED", error: SWITCHED_OFF, completedAt: now });
      await countSettled(ctx, row, "FAILED", 0, "SEND");
      dropped += 1;
    }
    // Everything this look found was dropped: say so, and look again straight away.
    if (due.length === 0 && dropped > 0) return { pulls: [], nextDueAt: now, capped: false };

    if (due.length === 0) {
      const waiting = await ctx.db
        .query("seoDataPulls")
        .withIndex("by_status_due", (q) => q.eq("status", "PENDING"))
        .order("asc")
        .first();
      return { pulls: [], nextDueAt: waiting?.dueAt ?? null, capped: false };
    }

    const operationId = due[0].operationId;
    // A live endpoint takes one task per request and refuses the rest with
    // "You can set only one task at a time" — the first live run on 2026-09-23
    // lost three pulls that way. Only a queued endpoint takes a batch.
    const batchSize = due[0].mode === "LIVE" ? 1 : SEO_BATCH_SIZE;
    // Never a batch that spends past what is left of the run's limit — a
    // hundred site crawls is about $15 — judged on what this call has cost.
    const affordable = args.runId ? await affordableRows(ctx, args.runId, operationId, batchSize) : batchSize;
    const batch = due.filter((row) => row.operationId === operationId).slice(0, affordable);

    const claimed: Array<typeof claimedPull.type> = [];
    for (const row of batch) {
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

    return { pulls: claimed, nextDueAt: null, capped: false };
  },
});

/** Why a waiting call was not bought, on its row. */
const SWITCHED_OFF = "Not bought: data collection was switched off for this company or website before it was sent.";

/**
 * Whether anyone still collecting wants this call (Anthony, 2026-09-24:
 * "respect the switch"). A call is wanted by the company that planned it and
 * by every company whose collection shares it; it is still wanted while any
 * of them has collection switched on — for the company, and for this website
 * on that company. A call nobody's company asked for is left alone.
 */
async function stillWanted(ctx: MutationCtx, pull: Doc<"seoDataPulls">): Promise<boolean> {
  const companies = new Set<Id<"companies">>();
  if (pull.companyId) companies.add(pull.companyId);
  const lines = await ctx.db.query("seoCycleLines").withIndex("by_pull", (q) => q.eq("pullId", pull._id)).take(LINES_READ_FOR_SWITCH);
  for (const line of lines) companies.add(line.companyId);
  if (companies.size === 0) return true;

  for (const companyId of companies) {
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_company_agent", (q) => q.eq("companyId", companyId))
      .first();
    if (!schedule?.isActive) continue;
    if (pull.websiteId) {
      const websiteId = pull.websiteId;
      const hold = await ctx.db
        .query("companyWebsites")
        .withIndex("by_company_website", (q) => q.eq("companyId", companyId).eq("websiteId", websiteId))
        .first();
      if (hold?.collectionEnabled === false) continue;
    }
    return true;
  }
  return false;
}

/** Companies sharing one call read to decide whether it is still wanted. */
const LINES_READ_FOR_SWITCH = 50;

/**
 * Whether the Collector's run has spent its agent's limit.
 *
 * The limit belongs to the agent that spends — the Collector — and is counted
 * per run, from the run's own cost. An agent with no limit set is not capped;
 * that is the platform's existing convention for `maxCostUsd`. One batch can
 * carry a run a little past the line, because the check comes before a batch
 * and a live batch is one call.
 */
/**
 * How many requests of this call the run can still afford, from what the call
 * has cost on average. At least one while any limit is left, so a run always
 * moves; a call never priced yet goes as the batch it is.
 */
async function affordableRows(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  operationId: string,
  wanted: number,
): Promise<number> {
  const run = await ctx.db.get(runId);
  const agent = run ? await ctx.db.get(run.agentId) : null;
  const cap = agent?.maxCostUsd;
  if (typeof cap !== "number" || cap <= 0) return wanted;
  const price = await ctx.db
    .query("seoOperationCosts")
    .withIndex("by_operation", (q) => q.eq("operationId", operationId))
    .unique();
  if (!price || price.charged <= 0 || price.totalUsd <= 0) return wanted;
  const left = cap - (run?.costUsd ?? 0);
  // A hair of tolerance: $1.00 less $0.90 is $0.0999… in floating point.
  return Math.max(1, Math.min(wanted, Math.floor(left / (price.totalUsd / price.charged) + 1e-9)));
}

async function runHasSpentItsLimit(ctx: MutationCtx, runId: Id<"agentRuns">): Promise<boolean> {
  const run = await ctx.db.get(runId);
  if (!run) return false;
  const agent = await ctx.db.get(run.agentId);
  const cap = agent?.maxCostUsd;
  if (typeof cap !== "number" || cap <= 0) return false;
  return (run.costUsd ?? 0) >= cap;
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
    /**
     * False when DataForSEO said "not now" — a rate limit, "unavailable", or a
     * refused account. Nothing was taken, and counting a try then meant a few
     * minutes of outage failed the whole queue (2026-09-25).
     */
    countAttempt: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const counting = args.countAttempt !== false;
    for (const pullId of args.pullIds) {
      const row = await ctx.db.get(pullId);
      if (!row || row.status !== "CLAIMED") continue;

      const attempts = (row.attempts ?? 0) + (counting ? 1 : 0);
      if (counting && attempts >= SEO_MAX_ATTEMPTS) {
        await ctx.db.patch(pullId, {
          status: "FAILED",
          attempts,
          error: args.reason,
          completedAt: now,
          claimedBy: undefined,
          claimedAt: undefined,
          postedAt: undefined,
        });
        await countSettled(ctx, row, "FAILED", 0, "SEND");
        continue;
      }

      await ctx.db.patch(pullId, {
        status: "PENDING",
        attempts,
        dueAt: now + seoBackoffMs(args.attempt),
        claimedBy: undefined,
        claimedAt: undefined,
        postedAt: undefined,
      });
    }
    return null;
  },
});

/**
 * Mark a claimed batch as being sent, just before it goes. From here on
 * DataForSEO may have it, so it is never put back in the queue: the hourly
 * check returns only claims that never reached this point, and one that did
 * but was never recorded is failed rather than bought again.
 */
export const markSeoPosting = internalMutation({
  args: { pullIds: v.array(v.id("seoDataPulls")), workerId: v.string() },
  returns: v.array(v.id("seoDataPulls")),
  handler: async (ctx, args) => {
    const now = Date.now();
    const marked: Id<"seoDataPulls">[] = [];
    for (const pullId of args.pullIds) {
      const row = await ctx.db.get(pullId);
      if (!row || row.status !== "CLAIMED" || row.claimedBy !== args.workerId) continue;
      await ctx.db.patch(pullId, { postedAt: now });
      marked.push(pullId);
    }
    return marked;
  },
});

/** The start of the reason a send is failed when we cannot know DataForSEO took it. */
export const SEND_UNCERTAIN = "DataForSEO may have taken this request";

/**
 * Fail requests whose send we cannot know the outcome of — a timeout, a
 * dropped connection, a gateway error, a task missing from the reply. They
 * may have been charged, so they are never sent again: if DataForSEO did take
 * one, its pingback finds it by its tag and its answer is still filed
 * (`markSeoPinged`); if not, the next collection asks afresh.
 */
export const failUncertainSends = internalMutation({
  args: {
    pullIds: v.array(v.id("seoDataPulls")),
    reason: v.string(),
    runId: v.optional(v.id("agentRuns")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const pullId of args.pullIds) {
      const row = await ctx.db.get(pullId);
      if (!row || row.status !== "CLAIMED") continue;
      await failUncertainSend(ctx, row, args.reason, args.runId);
    }
    return null;
  },
});

export async function failUncertainSend(
  ctx: MutationCtx,
  row: Doc<"seoDataPulls">,
  reason: string,
  runId?: Id<"agentRuns">,
): Promise<void> {
  const error = `${SEND_UNCERTAIN} (${reason}). It is not sent again, so it is never paid for twice.`;
  await ctx.db.patch(row._id, {
    status: "FAILED",
    error,
    completedAt: Date.now(),
    claimedBy: undefined,
    claimedAt: undefined,
  });
  await countSettled(ctx, row, "FAILED", 0, "SEND");
  if (runId) await recordCollectorCall(ctx, runId, row, "FAILED", 0, error);
}

/**
 * An answer as the action kept it (`keepAnswer` in `seoCollectionActions.ts`):
 * its parts, each no larger than a document may be; whether it was too large
 * to keep at all; and how many rows were left off the end of a list.
 */
const keptAnswer = {
  resultParts: v.optional(v.array(v.string())),
  rawTruncated: v.optional(v.boolean()),
  rowsLeftOff: v.optional(v.number()),
};

/** What the request says of its answer's keeping: nothing, unless something was lost. */
function keptMarks(args: { rawTruncated?: boolean; rowsLeftOff?: number }) {
  return {
    ...(args.rawTruncated ? { rawTruncated: true } : {}),
    ...(args.rowsLeftOff ? { rowsLeftOff: args.rowsLeftOff } : {}),
  };
}

/**
 * Record what a send did, one row at a time.
 *
 * A queued task becomes `SUBMITTED` and waits for its pingback; a live one is
 * `READY` already. Either way the cost is written now, because it was charged
 * now — including for a task DataForSEO refused, which still costs money.
 */
const sendResult = v.object({
  pullId: v.id("seoDataPulls"),
  taskId: v.optional(v.string()),
  costUsd: v.number(),
  error: v.optional(v.string()),
  ...keptAnswer,
  /** A live call answered in the same breath: the result is here. */
  ready: v.boolean(),
});

export const settleSeoSend = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    /** The Collector's run, which this call's cost and log line belong to. */
    runId: v.optional(v.id("agentRuns")),
    taskId: v.optional(v.string()),
    costUsd: v.number(),
    sandbox: v.boolean(),
    error: v.optional(v.string()),
    ...keptAnswer,
    ready: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { runId, sandbox, ...result } = args;
    await settleSend(ctx, result, sandbox, runId);
    return null;
  },
});

/**
 * Record a whole batch's outcomes at once, right after the send. One
 * transaction for the batch rather than one per request: recording them one
 * by one inside the send's own error handling meant a single failed record
 * put the rest of an accepted batch back in the queue, to be bought again
 * (2026-09-25). The Collector retries this until it lands; it is safe to
 * repeat, because a request already recorded is skipped.
 */
export const settleSeoSendBatch = internalMutation({
  args: {
    runId: v.optional(v.id("agentRuns")),
    sandbox: v.boolean(),
    results: v.array(sendResult),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const result of args.results) await settleSend(ctx, result, args.sandbox, args.runId);
    return null;
  },
});

async function settleSend(
  ctx: MutationCtx,
  args: typeof sendResult.type,
  sandbox: boolean,
  runId: Id<"agentRuns"> | undefined,
): Promise<void> {
  const row = await ctx.db.get(args.pullId);
  // Already recorded — a retried record after the first one landed.
  if (!row || (row.status !== "CLAIMED" && row.status !== "PENDING")) return;

  const now = Date.now();
  const status = args.error ? "FAILED" : args.ready ? "READY" : "SUBMITTED";

  await ctx.db.patch(args.pullId, {
    status,
    ...(args.taskId ? { taskId: args.taskId } : {}),
    costUsd: args.costUsd,
    sandbox,
    ...(args.error ? { error: args.error } : {}),
    ...keptMarks(args),
    sentAt: now,
    claimedBy: undefined,
    claimedAt: undefined,
    ...(status === "SUBMITTED" ? {} : { completedAt: now }),
  });
  // Kept apart from the request, so reading requests never reads answers.
  if (args.resultParts) await storePullAnswer(ctx, args.pullId, args.resultParts);

  await countSettled(ctx, row, status, args.costUsd, "SEND");
  // What this operation really costs, for the per-row prices on the Tracking
  // screen. The sandbox charges nothing and says nothing about the price.
  if (!sandbox) await recordOperationCost(ctx, row.operationId, args.costUsd);
  if (runId) await recordCollectorCall(ctx, runId, row, status, args.costUsd, args.error);
  // Filed from here, in the same transaction that records the answer: filed
  // once, and never lost to a crash between recording and scheduling.
  if (status === "READY" && args.resultParts) await scheduleFiling(ctx, row);
}

/**
 * File an answer that has just been recorded. Only from the transaction that
 * recorded it, so an answer is filed exactly once however many times it is
 * fetched; a crawl's page-by-page detail — free for thirty days — is fetched
 * alongside.
 */
async function scheduleFiling(ctx: MutationCtx, row: Doc<"seoDataPulls">): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.seoCollectionParse.parseSeoResult, { pullId: row._id });
  if (row.operationId === "site_crawl") {
    await ctx.scheduler.runAfter(0, internal.siteCrawlDetail.fetchCrawlDetail, { pullId: row._id });
  }
}

/**
 * One DataForSEO call, on the Collector's run: its cost, a cost record and a
 * log line, so the agent's Observability shows what it spent and on what —
 * the reason collection runs through an agent at all.
 */
async function recordCollectorCall(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  row: Doc<"seoDataPulls">,
  status: "READY" | "SUBMITTED" | "FAILED",
  costUsd: number,
  error: string | undefined,
) {
  const run = await ctx.db.get(runId);
  if (!run) return;
  const now = Date.now();
  if (costUsd > 0) {
    await ctx.db.patch(runId, { costUsd: (run.costUsd ?? 0) + costUsd, updatedAt: now });
    await ctx.db.insert("agentTransactions", {
      agentId: run.agentId,
      ...(row.companyId ? { companyId: row.companyId } : {}),
      actionContext: `dataforseo:${row.operationId}`,
      modelUsed: row.operationId,
      providerKey: "dataforseo",
      inputTokens: 0,
      outputTokens: 0,
      costUsd,
      status: status === "FAILED" ? "FAILED" : "SUCCESS",
      createdAt: now,
    });
  }
  const said = status === "FAILED"
    ? `Failed: ${error ?? "no reason given"}`
    : status === "SUBMITTED"
      ? `Accepted, $${costUsd.toFixed(4)}. The answer arrives later.`
      : `Answered, $${costUsd.toFixed(4)}.`;
  const stepId = await appendRunStep(ctx, {
    runId,
    agentId: run.agentId,
    ...(row.companyId ? { companyId: row.companyId } : {}),
    kind: "TOOL_CALL",
    status: status === "FAILED" ? "FAILED" : "SUCCESS",
    input: describeCall(row),
    output: said,
    costUsd,
    providerKey: "dataforseo",
    ...(row.claimedAt ? { startedAt: row.claimedAt } : {}),
    ...(status === "FAILED" && error ? { error } : {}),
  });
  await ctx.db.insert("agentLogs", {
    agentId: run.agentId,
    runId,
    stepId,
    ...(row.companyId ? { companyId: row.companyId } : {}),
    interactionType: `DataForSEO: ${row.operationId}`,
    promptContent: row.taskArgsJson.slice(0, 2_000),
    responseContent: said,
    outcome: status === "FAILED" ? "FAILED" : "SUCCESS",
    createdAt: now,
  });
}

/** Short names for what a call fetched, for the run's timeline. */
const CALL_NAMES: Record<string, string> = {
  serp_google_organic: "Google",
  keyword_search_volume: "search volumes",
  domain_ranked_keywords: "ranked keywords",
  domain_competitors: "competitors",
  backlinks_summary: "links",
  bulk_backlinks: "link counts",
  bulk_referring_domains: "linking sites",
  bulk_ranks: "strength scores",
};

/**
 * One call in words — what it fetched, and about what — as the timeline's
 * label: "Google · web design surrey", "ranked keywords · example.com". An AI
 * question is named by its engine, read off the operation id.
 */
function describeCall(row: Doc<"seoDataPulls">): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(row.taskArgsJson) as Record<string, unknown>;
  } catch {
    // An unreadable payload still names its operation.
  }
  const what = row.operationId.startsWith("ai_citation_")
    ? row.operationId.slice("ai_citation_".length)
    : CALL_NAMES[row.operationId] ?? row.operationId;
  const about = args.keyword ?? args.user_prompt ?? args.target
    ?? (Array.isArray(args.targets) ? `${args.targets.length} websites` : undefined);
  return about ? `${what} · ${String(about)}` : what;
}

/**
 * Move a cycle's counters and the day's rollup.
 *
 * The rollup is written here, at the moment of the transition, because a
 * dashboard that summed the pull table would work perfectly until the table
 * had millions of rows in it. Same rule the governance and inventory screens
 * already follow.
 */
/**
 * Credit every company that was served by a pull it did not buy.
 *
 * One host is fetched once for everyone watching it, so a company whose rival
 * happened to trigger a pull is served for nothing. That saving is real, but a
 * cost report that only counts money out would call such a company cheap to
 * serve — and pricing against that figure breaks the day the paying customer
 * leaves. So the value is recorded against everyone who received it, priced at
 * what it cost the one who paid.
 *
 * Bounded: a pull answering more companies than this is already an outlier, and
 * this runs inside the transaction that settles it.
 */
async function creditReusers(
  ctx: MutationCtx,
  row: Doc<"seoDataPulls">,
  day: string,
  costUsd: number,
) {
  if (costUsd <= 0) return;

  const lines = await ctx.db
    .query("seoCycleLines")
    .withIndex("by_pull", (q) => q.eq("pullId", row._id))
    .take(REUSE_CREDIT_LIMIT);

  const credited = new Set<string>();
  for (const line of lines) {
    // The company that paid is not also given it free, and a company with two
    // lines against one pull is credited once.
    if (line.companyId === row.companyId) continue;
    if (credited.has(line.companyId)) continue;
    credited.add(line.companyId);

    const scopeKey = `company:${line.companyId}`;
    const existing = await ctx.db
      .query("seoDayRollups")
      .withIndex("by_scope_day", (q) => q.eq("scopeKey", scopeKey).eq("day", day))
      .unique();

    if (!existing) {
      await ctx.db.insert("seoDayRollups", {
        scopeKey,
        day,
        pulls: 0,
        reused: 1,
        sent: 0,
        ready: 0,
        failed: 0,
        costUsd: 0,
        reusedValueUsd: costUsd,
        updatedAt: Date.now(),
      });
      continue;
    }

    await ctx.db.patch(existing._id, {
      reused: existing.reused + 1,
      reusedValueUsd: (existing.reusedValueUsd ?? 0) + costUsd,
      updatedAt: Date.now(),
    });
  }
}

/** A pull answering more companies than this in one cycle is an outlier. */
const REUSE_CREDIT_LIMIT = 100;

/**
 * When a count is taken: at the send, or when a queued task's answer comes.
 * A queued task is sent once and answered once; counting "sent" at both
 * counted every one of them twice (2026-09-25, 160 sent of 147 planned).
 */
type CountPhase = "SEND" | "RESULT";

export async function countSettled(
  ctx: MutationCtx,
  row: Doc<"seoDataPulls">,
  status: "SUBMITTED" | "READY" | "FAILED",
  costUsd: number,
  phase: CountPhase,
) {
  const day = new Date().toISOString().slice(0, 10);
  const sent = phase === "SEND" && (status === "SUBMITTED" || status === "READY") ? 1 : 0;

  if (row.cycleId) {
    const cycle = await ctx.db.get(row.cycleId);
    if (cycle) {
      await ctx.db.patch(cycle._id, {
        sentCount: cycle.sentCount + sent,
        readyCount: cycle.readyCount + (status === "READY" ? 1 : 0),
        failedCount: cycle.failedCount + (status === "FAILED" ? 1 : 0),
        totalCostUsd: cycle.totalCostUsd + costUsd,
      });
      await closeCycleIfSettled(ctx, cycle._id);
      // Its Collection runs report, worked out again a minute after the burst.
      await requestRunReport(ctx, cycle._id);
    }
  }

  await bumpRollup(ctx, "platform", day, status, costUsd, phase);
  if (row.companyId) await bumpRollup(ctx, `company:${row.companyId}`, day, status, costUsd, phase);

  // Only once the answer exists is it worth anything to anyone else.
  if (status === "READY") await creditReusers(ctx, row, day, costUsd);
}

/**
 * Close a cycle the moment its last pull settles.
 *
 * The hourly sweep closes cycles too, and for a while that was the only thing
 * that did — which meant a run whose every line had come back still read
 * "Sending" on screen for up to an hour. A status that lags reality by an hour
 * is not a status, it is a guess, and the screen is the main way anyone will
 * ever look at this pipeline.
 *
 * One indexed read per settle, ending at the first row still in flight. The
 * sweep keeps its own copy of this duty, because a cycle whose last pull failed
 * in a way that never reached here still has to be closed by something.
 */
async function closeCycleIfSettled(ctx: MutationCtx, cycleId: Id<"seoCollectionCycles">) {
  const cycle = await ctx.db.get(cycleId);
  if (!cycle) return;
  // Only a cycle that is actually running. A capped or failed one has already
  // said something more specific about why it stopped.
  if (cycle.status !== "SENDING" && cycle.status !== "COLLECTING") return;

  // Unsent first, so a cycle with anything still to send stays "Sending".
  const inFlight = await cyclePullIn(ctx, cycleId, ["PENDING", "CLAIMED", "SUBMITTED"]);

  if (inFlight) {
    // Something is still out. Say so plainly rather than leaving the cycle
    // reading "Sending" while it is really waiting on an answer.
    if (cycle.status === "SENDING" && !inFlightIsUnsent(inFlight)) {
      await ctx.db.patch(cycleId, { status: "COLLECTING" });
    }
    return;
  }

  await finishSeoCycle(ctx, cycleId);
}

/**
 * Finish a collection: done, its report built from what arrived, and its
 * keyword moves drawn a few minutes on, once the last answers are parsed. The
 * one way a collection is finished — when its last answer settles, when the
 * hourly sweep finds nothing in flight, or when a person closes it by hand.
 */
export async function finishSeoCycle(
  ctx: MutationCtx,
  cycleId: Id<"seoCollectionCycles">,
  byHand?: { userId: Id<"users">; unsent: number },
): Promise<void> {
  await ctx.db.patch(cycleId, {
    status: "DONE",
    finishedAt: Date.now(),
    ...(byHand ? { closedBy: byHand.userId, closedUnsent: byHand.unsent } : {}),
  });
  // Within the minute — a run that sent nothing has no send to ask for one —
  // and again later, for the AI its last answers lead to.
  await requestRunReport(ctx, cycleId);
  await scheduleLateRunReports(ctx, cycleId);
  await ctx.scheduler.runAfter(SEO_MOVES_DELAY_MS, internal.websiteMoves.deriveCycleMoves, { cycleId });
}


/** A row still queued or claimed has not gone out yet; one submitted has. */
function inFlightIsUnsent(row: Doc<"seoDataPulls">) {
  return row.status === "PENDING" || row.status === "CLAIMED";
}

type InFlightStatus = "PENDING" | "CLAIMED" | "SUBMITTED";

/**
 * A collection's first request in one of these states, looked for in the
 * order given — or null. One indexed read per state, never the rest of the
 * collection: a scan for it read every stored answer, and a collection's
 * answers can come to more than a function may read.
 */
export async function cyclePullIn(
  ctx: { db: QueryCtx["db"] },
  cycleId: Id<"seoCollectionCycles">,
  statuses: InFlightStatus[],
): Promise<Doc<"seoDataPulls"> | null> {
  for (const status of statuses) {
    const row = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_cycle_status", (q) => q.eq("cycleId", cycleId).eq("status", status))
      .first();
    if (row) return row;
  }
  return null;
}

export async function bumpRollup(
  ctx: MutationCtx,
  scopeKey: string,
  day: string,
  status: "SUBMITTED" | "READY" | "FAILED",
  costUsd: number,
  phase: CountPhase,
) {
  const existing = await ctx.db
    .query("seoDayRollups")
    .withIndex("by_scope_day", (q) => q.eq("scopeKey", scopeKey).eq("day", day))
    .unique();

  const delta = {
    // A request is one pull, counted when it is sent — not again when it is answered.
    pulls: phase === "SEND" ? 1 : 0,
    reused: 0,
    sent: phase === "SEND" && (status === "SUBMITTED" || status === "READY") ? 1 : 0,
    ready: status === "READY" ? 1 : 0,
    failed: status === "FAILED" ? 1 : 0,
    costUsd,
  };

  if (!existing) {
    await ctx.db.insert("seoDayRollups", {
      scopeKey,
      day,
      ...delta,
      reusedValueUsd: 0,
      updatedAt: Date.now(),
    });
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
    ...keptAnswer,
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
      ...keptMarks(args),
      ...(args.error ? { error: args.error } : {}),
      ...(args.costUsd ? { costUsd: row.costUsd + args.costUsd } : {}),
      completedAt: now,
      // Answered, or given a definite answer: the waiting is over.
      lastFetch: undefined,
    });
    if (args.resultParts) await storePullAnswer(ctx, args.pullId, args.resultParts);

    await countSettled(ctx, row, status, args.costUsd ?? 0, "RESULT");
    if (status === "READY" && args.resultParts) await scheduleFiling(ctx, row);
    return null;
  },
});

/**
 * Note a fetch of an answer that did not bring it, and what came back — so a
 * request left waiting says why, rather than only "waiting" (reliability plan
 * V1). Only while it is still out: an answer settled since is left alone.
 */
export const noteSeoFetch = internalMutation({
  args: { pullId: v.id("seoDataPulls"), said: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pullId);
    if (row?.status !== "SUBMITTED") return null;
    await ctx.db.patch(args.pullId, { lastFetch: { at: Date.now(), said: args.said.slice(0, FETCH_NOTE_CHARS) } });
    return null;
  },
});

/** A fetch note is a sentence, not a payload. */
const FETCH_NOTE_CHARS = 300;

/**
 * Note that DataForSEO says a task is ready.
 *
 * All the pingback route is allowed to do. It carries no result and is trusted
 * with nothing beyond "go and look", because a callback on a public URL cannot
 * prove who sent it.
 */
export const markSeoPinged = internalMutation({
  args: { taskId: v.string(), tag: v.optional(v.string()) },
  returns: v.union(v.null(), v.id("seoDataPulls")),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();

    if (row?.status === "SUBMITTED") {
      await ctx.db.patch(row._id, { pingedAt: Date.now() });
      return row._id;
    }
    // Given up after twelve hours, and ready after all: paid for, so fetched.
    if (row?.status === "FAILED" && row.error === RESULT_GAVE_UP) {
      await revive(ctx, row, args.taskId);
      return row._id;
    }
    // A send we could not confirm, which DataForSEO did take: we never had its
    // task id, but its tag — our own, echoed back — finds it.
    if (!row && args.tag) {
      const sent = await ctx.db
        .query("seoDataPulls")
        .withIndex("by_tag", (q) => q.eq("tag", args.tag!))
        .first();
      if (sent?.status === "FAILED" && !sent.taskId && sent.error?.startsWith(SEND_UNCERTAIN)) {
        await revive(ctx, sent, args.taskId);
        return sent._id;
      }
    }
    // An id we never sent, or a row that is already settled. Either way there
    // is nothing to do, and saying so cheaply is what stops a flood of forged
    // ids turning into a flood of our own outbound fetches.
    return null;
  },
});

/** Why a request was given up: no answer within `SEO_RESULT_TIMEOUT_MS`. */
export const RESULT_GAVE_UP = "DataForSEO never returned a result for this task.";

/** A request failed too early, back to waiting for its answer, which is then fetched. */
async function revive(ctx: MutationCtx, row: Doc<"seoDataPulls">, taskId: string): Promise<void> {
  await ctx.db.patch(row._id, {
    status: "SUBMITTED",
    taskId,
    pingedAt: Date.now(),
    error: undefined,
    completedAt: undefined,
  });
  // It was counted failed; its answer will count it ready.
  const cycle = row.cycleId ? await ctx.db.get(row.cycleId) : null;
  if (cycle && cycle.failedCount > 0) await ctx.db.patch(cycle._id, { failedCount: cycle.failedCount - 1 });
}
