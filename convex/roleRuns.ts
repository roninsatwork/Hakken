import { v } from "convex/values";

import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { appendRunStep } from "./agentRunStepWriter";
import { calculateModelCostUsd } from "./aiCostService";
import { appErrorMessage } from "./utils/appError";
import { startAgentRun } from "./agentRunStartService";
import { ASSIGNABLE_AGENT_ROLES, type AssignableAgentRole } from "./utils/agentRoles";

/**
 * The life of a run that does its role's fixed job rather than thinking with
 * a model: the DataForSEO Planner and Collector, the News Collector,
 * Weekly Digest and Email Sender, and the Search Console Collector
 * (`utils/agentRoles.ts`). Each such run starts,
 * says what it found and what it did as steps on its Observability timeline,
 * records what any model call cost on the run itself — so the agent's own
 * spend limit can stop it — and finishes with a summary. One of each runs at
 * a time, and one that dies without saying so is closed.
 *
 * Shared so the six cannot drift: these were the DataForSEO agents' own
 * (`seoAgentRuns.ts`) until the News agents needed the same (docs/plans/
 * active/knowledge-news-and-digest-plan.md, phase 4).
 */

export const markRunStarted = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { status: "RUNNING", updatedAt: Date.now() });
    return null;
  },
});

export const readRunCost = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.number(),
  handler: async (ctx, args) => (await ctx.db.get(args.runId))?.costUsd ?? 0,
});

/** What a run found before it started — its first step. */
export const recordObservation = internalMutation({
  args: { runId: v.id("agentRuns"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    await appendRunStep(ctx, { runId: args.runId, agentId: run.agentId, kind: "OBSERVE", status: "SUCCESS", output: args.text });
    return null;
  },
});

/** One thing a run did, as a step and a log line. */
export const logRunLine = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    companyId: v.optional(v.id("companies")),
    heading: v.string(),
    detail: v.string(),
    failed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const stepId = await appendRunStep(ctx, {
      runId: args.runId,
      agentId: run.agentId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      kind: "PLAN",
      status: args.failed ? "FAILED" : "SUCCESS",
      input: args.heading,
      output: args.detail,
    });
    await ctx.db.insert("agentLogs", {
      agentId: run.agentId,
      runId: args.runId,
      stepId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      interactionType: args.heading,
      promptContent: "",
      responseContent: args.detail,
      outcome: args.failed ? "FAILED" : "SUCCESS",
      createdAt: Date.now(),
    });
    return null;
  },
});

/** What went wrong, as one readable line for a failed run's summary. */
export function failureSummary(error: unknown): string {
  return appErrorMessage(error, String(error)).replace(/\s+/g, " ").trim().slice(0, 400) || "No detail given.";
}

/** The run's summary, as its last step, on the run, and on its workflow execution. */
export const finishRoleRun = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run) {
      await appendRunStep(ctx, {
        runId: args.runId,
        agentId: run.agentId,
        kind: "FINAL",
        status: args.status,
        output: args.summary,
        ...(args.status === "FAILED" ? { error: args.summary } : {}),
      });
    }
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status: args.status,
      finalOutput: args.summary,
      ...(args.status === "FAILED" ? { error: args.summary } : {}),
      completedAt: now,
      updatedAt: now,
    });
    if (args.workflowExecutionId) {
      await ctx.db.patch(args.workflowExecutionId, { status: args.status, completedAt: now });
    }
    return null;
  },
});

// ── One at a time ──────────────────────────────────────────────────────────

/** An agent's newest runs, read to see whether one is still going. */
const RECENT_RUNS = 5;

/** A run that started this long ago and still says it is going has died: an action is stopped at ten minutes. */
export const ROLE_RUN_LIVE_MS = 15 * 60 * 1000;

function isGoing(run: Doc<"agentRuns">, now: number, liveMs: number): boolean {
  return (run.status === "QUEUED" || run.status === "RUNNING") && now - run.startedAt < liveMs;
}

/**
 * The run of the same agent that goes before this one, if any: the earliest
 * started of the live ones carries on and a later one stops. Two starting
 * together are settled the same way on both sides, so one always goes.
 */
export async function runAhead(
  ctx: { db: MutationCtx["db"] },
  run: Doc<"agentRuns">,
  liveMs: number = ROLE_RUN_LIVE_MS,
): Promise<Doc<"agentRuns"> | null> {
  const now = Date.now();
  const recent = await ctx.db
    .query("agentRuns")
    .withIndex("by_agent_started", (q) => q.eq("agentId", run.agentId))
    .order("desc")
    .take(RECENT_RUNS);
  return recent.find((other) =>
    other._id !== run._id
    && isGoing(other, now, liveMs)
    && (other.startedAt < run.startedAt || (other.startedAt === run.startedAt && other._id < run._id))) ?? null;
}

/**
 * Whether this run may do its job. Only one run of an agent does at a time,
 * so nothing is read, written or sent twice and its spend limit stays one
 * limit; a later one stops at once, saying so.
 */
export const takeRoleTurn = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { ok: false, message: "This run no longer exists." };
    const ahead = await runAhead(ctx, run);
    if (!ahead) return { ok: true, message: "" };
    const at = new Date(ahead.startedAt).toISOString().slice(11, 16);
    return {
      ok: false,
      message: `Another run, started at ${at} UTC, is still going. This one stopped without doing anything, so nothing is done twice.`,
    };
  },
});

/**
 * Start a role's agent on a run of its own — one agent starting another, as
 * the Weekly Digest starts the Email Sender — unless one of its runs is
 * already going, which does the work too. Through the one dispatcher
 * (`agentRunStartService.ts`), so the run is the role's job and shows in its
 * agent's Runs and Observability like any other.
 */
export async function startRoleRun(
  ctx: MutationCtx,
  role: AssignableAgentRole,
  args: { objective: string; title: string },
): Promise<"STARTED" | "ALREADY_GOING" | "NO_AGENT" | "AGENT_OFF"> {
  const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", role)).first();
  if (!agent) return "NO_AGENT";
  if (agent.isActive === false) return "AGENT_OFF";
  const now = Date.now();
  const recent = await ctx.db.query("agentRuns").withIndex("by_agent_started", (q) => q.eq("agentId", agent._id)).order("desc").take(RECENT_RUNS);
  if (recent.some((run) => isGoing(run, now, ROLE_RUN_LIVE_MS))) return "ALREADY_GOING";
  const runId = await ctx.db.insert("agentRuns", {
    agentId: agent._id,
    triggerType: "EVENT",
    objective: args.objective,
    title: args.title,
    status: "QUEUED",
    startedAt: now,
    updatedAt: now,
  });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", {
    agentId: agent._id,
    agentRunId: runId,
    triggerType: "EVENT",
    status: "RUNNING",
    startedAt: now,
  });
  await startAgentRun(ctx, { agent, runId, workflowExecutionId, objective: args.objective, triggerType: "MANUAL" });
  return "STARTED";
}

// ── What a model call cost ─────────────────────────────────────────────────

/**
 * A model call made by a role's run, priced and added to the run's own cost —
 * so the agent's spend limit stops the run — with a cost record every cost
 * screen reads, a step on its timeline and a log line. The wiki staff record
 * theirs in the ledger only (`wikiStaff.recordStaffModelCallInternal`), so
 * their per-run limit cannot bite; a News agent's must.
 *
 * Says whether the run has now reached its agent's spend limit, so the run
 * stops before its next call.
 */
export const recordRunModelCall = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    companyId: v.optional(v.id("companies")),
    /** What the call was for, in a few words: "Summarising a YouTube video". */
    actionContext: v.string(),
    modelId: v.string(),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    promptContent: v.string(),
    responseContent: v.string(),
    failed: v.optional(v.boolean()),
  },
  returns: v.object({ costUsd: v.number(), runCostUsd: v.number(), limitReached: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { costUsd: 0, runCostUsd: 0, limitReached: true };
    const rates = await ctx.db
      .query("aiModels")
      .withIndex("by_model_id", (q) => q.eq("modelId", args.modelId))
      .first();
    const costUsd = calculateModelCostUsd({ inputTokens: args.inputTokens, outputTokens: args.outputTokens, rates });
    const runCostUsd = (run.costUsd ?? 0) + costUsd;
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      costUsd: runCostUsd,
      inputTokens: (run.inputTokens ?? 0) + args.inputTokens,
      outputTokens: (run.outputTokens ?? 0) + args.outputTokens,
      updatedAt: now,
    });
    const outcome = args.failed ? "FAILED" : "SUCCESS";
    await ctx.db.insert("agentTransactions", {
      agentId: run.agentId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      actionContext: args.actionContext,
      modelUsed: args.modelId,
      ...(args.providerKey ? { providerKey: args.providerKey } : {}),
      ...(args.providerModelId ? { providerModelId: args.providerModelId } : {}),
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd,
      status: outcome,
      createdAt: now,
    });
    const stepId = await appendRunStep(ctx, {
      runId: args.runId,
      agentId: run.agentId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      kind: "MODEL",
      status: outcome,
      input: args.actionContext,
      output: args.responseContent,
      costUsd,
      ...(args.providerKey ? { providerKey: args.providerKey } : {}),
    });
    await ctx.db.insert("agentLogs", {
      agentId: run.agentId,
      runId: args.runId,
      stepId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      interactionType: args.actionContext,
      promptContent: args.promptContent.slice(0, 8_000),
      responseContent: args.responseContent.slice(0, 8_000),
      outcome,
      createdAt: now,
    });
    const agent = await ctx.db.get(run.agentId);
    const cap = agent?.maxCostUsd;
    const limitReached = typeof cap === "number" && cap > 0 && runCostUsd >= cap;
    return { costUsd, runCostUsd, limitReached };
  },
});

/**
 * A paid call to a service other than a model — X's reads — on the run: its
 * cost added to the run, so the spend limit counts it, a cost record, a step
 * and a log line. Says whether the run has now reached its limit.
 */
export const recordRunServiceCall = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    providerKey: v.string(),
    /** What was done, in a few words: "Read 12 posts from @searchliaison". */
    actionContext: v.string(),
    costUsd: v.number(),
  },
  returns: v.object({ runCostUsd: v.number(), limitReached: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { runCostUsd: 0, limitReached: true };
    const now = Date.now();
    const runCostUsd = (run.costUsd ?? 0) + args.costUsd;
    if (args.costUsd > 0) {
      await ctx.db.patch(args.runId, { costUsd: runCostUsd, updatedAt: now });
      await ctx.db.insert("agentTransactions", {
        agentId: run.agentId,
        actionContext: args.actionContext,
        modelUsed: args.providerKey,
        providerKey: args.providerKey,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: args.costUsd,
        status: "SUCCESS",
        createdAt: now,
      });
    }
    const stepId = await appendRunStep(ctx, {
      runId: args.runId,
      agentId: run.agentId,
      kind: "TOOL_CALL",
      status: "SUCCESS",
      input: args.actionContext,
      output: args.costUsd > 0 ? `$${args.costUsd.toFixed(4)}` : "No price entered, so no cost recorded.",
      costUsd: args.costUsd,
      providerKey: args.providerKey,
    });
    await ctx.db.insert("agentLogs", {
      agentId: run.agentId,
      runId: args.runId,
      stepId,
      interactionType: args.actionContext,
      promptContent: "",
      responseContent: `$${args.costUsd.toFixed(4)}`,
      outcome: "SUCCESS",
      createdAt: now,
    });
    const agent = await ctx.db.get(run.agentId);
    const cap = agent?.maxCostUsd;
    return { runCostUsd, limitReached: typeof cap === "number" && cap > 0 && runCostUsd >= cap };
  },
});

/** Whether a run has spent its agent's limit, read before a call that costs. */
export const runSpendLeft = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.object({ spentUsd: v.number(), limitUsd: v.union(v.number(), v.null()), limitReached: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const agent = run ? await ctx.db.get(run.agentId) : null;
    const spentUsd = run?.costUsd ?? 0;
    const cap = agent?.maxCostUsd;
    const limitUsd = typeof cap === "number" && cap > 0 ? cap : null;
    return { spentUsd, limitUsd, limitReached: limitUsd !== null && spentUsd >= limitUsd };
  },
});

// ── A run that died ────────────────────────────────────────────────────────

/** Past this, a run still "running" has died: an action is stopped at ten minutes. */
const RUN_LIFE_MS = 20 * 60 * 1000;

/** A role's newest runs past that life, looked at each hour. */
const STALLED_RUNS_READ = 50;

export const RUN_STALLED =
  "This run stopped without finishing — the platform ended it, at its time limit or a restart — so it never said how it went.";

/**
 * Close a role's run that died without saying so. One stopped by the platform
 * — at an action's ten minutes, or by a restart — never reached its own
 * ending, and read "Running" for ever in its Observability timeline and on
 * the Scheduler (reliability plan 3.1). Closed as failed, saying why, with its
 * workflow execution. Every assignable role's agent, each hour, from the
 * collection sweep (`seoCollectionSweep.ts`).
 */
export async function closeStalledRoleRuns(ctx: MutationCtx, now: number): Promise<void> {
  for (const role of ASSIGNABLE_AGENT_ROLES) {
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", role)).first();
    if (!agent) continue;
    const old = await ctx.db
      .query("agentRuns")
      .withIndex("by_agent_started", (q) => q.eq("agentId", agent._id).lt("startedAt", now - RUN_LIFE_MS))
      .order("desc")
      .take(STALLED_RUNS_READ);
    for (const run of old) {
      if (run.status !== "QUEUED" && run.status !== "RUNNING") continue;
      await appendRunStep(ctx, {
        runId: run._id,
        agentId: agent._id,
        kind: "FINAL",
        status: "FAILED",
        output: RUN_STALLED,
        error: RUN_STALLED,
      });
      await ctx.db.patch(run._id, { status: "FAILED", finalOutput: RUN_STALLED, error: RUN_STALLED, completedAt: now, updatedAt: now });
      await failRunExecution(ctx, run, now);
    }
  }
}

/** A run's workflow execution, started with it, found by its start. */
async function failRunExecution(ctx: MutationCtx, run: Doc<"agentRuns">, now: number): Promise<void> {
  const executions = await ctx.db
    .query("workflowExecutions")
    .withIndex("by_startedAt", (q) => q.gte("startedAt", run.startedAt - 60_000).lte("startedAt", run.startedAt + 60_000))
    .take(50);
  for (const execution of executions) {
    if (execution.agentRunId === run._id && execution.status === "RUNNING") {
      await ctx.db.patch(execution._id, { status: "FAILED", completedAt: now });
    }
  }
}

