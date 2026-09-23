import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendNextBatch } from "./seoCollectionActions";
import { SEO_COLLECTOR_RUN_MS } from "./seoCollectionPolicy";
import { openSeoCycle } from "./seoTools";
import { appendRunStep } from "./agentRunStepWriter";
import type { Id } from "./_generated/dataModel";

/**
 * What the two DataForSEO agents do when they are told to run.
 *
 * Anthony, 2026-09-23: collection works only through the agents. An agent has
 * no idea of time — a schedule or the Run button tells it to run, and it does
 * its job once. Neither calls a model: the work is fixed, like the wiki staff's.
 *
 * - **Planner** (`DATAFORSEO_PLANNER`) fills the queue, and spends nothing.
 *   Its Mode, on its Settings, decides what: **Test** adds everything for
 *   every company collecting data, whatever is due — Anthony: "while we are
 *   testing yes add everything to the queue" — and **Live** adds only what is
 *   due by each company's cadence. Unset reads as Test.
 * - **Collector** (`DATAFORSEO_COLLECTOR`) empties the queue: sends each call
 *   and records its cost and a log line on its own run, until the queue is
 *   empty, its agent's spend limit is reached, or the run's time is up.
 *
 * The role is read off the agent (`systemKey`), never its name. Every run
 * writes its steps — what it observed, each company planned or each call made,
 * and its summary — so its Observability timeline shows everything it did.
 */

/** How long the Planner waits for a company's work list to be written. */
const PLAN_WAIT_MS = 60_000;
const POLL_MS = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const runSeoRoleNow = internalAction({
  args: {
    role: v.union(v.literal("DATAFORSEO_PLANNER"), v.literal("DATAFORSEO_COLLECTOR")),
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.seoAgentRuns.markRunStarted, { runId: args.runId });
    try {
      const summary = args.role === "DATAFORSEO_PLANNER"
        ? await plan(ctx, args.runId)
        : await collect(ctx, args.runId);
      await ctx.runMutation(internal.seoAgentRuns.finishSeoRun, { ...args, status: "SUCCESS", summary });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.seoAgentRuns.finishSeoRun, {
        ...args,
        status: "FAILED",
        summary: message.replace(/\s+/g, " ").trim().slice(0, 400) || "No detail given.",
      });
    }
    return null;
  },
});

async function plan(ctx: ActionCtx, runId: Id<"agentRuns">): Promise<string> {
  const companies = await ctx.runQuery(internal.seoAgentRuns.listCollectingCompanies, {});
  if (companies.length === 0) return "No company is collecting data, so nothing was added to the queue.";
  const mode = await ctx.runQuery(internal.seoAgentRuns.readPlannerMode, { runId });
  await ctx.runMutation(internal.seoAgentRuns.recordObservation, {
    runId,
    text: `${companies.length} ${companies.length === 1 ? "company is" : "companies are"} collecting data: `
      + `${companies.map((company) => company.name).join(", ")}. Mode: ${mode === "LIVE" ? "Live" : "Test"}.`,
  });

  let queued = 0;
  let reused = 0;
  for (const company of companies) {
    const opened = await ctx.runMutation(internal.seoAgentRuns.openCompanyCycle, {
      companyId: company.companyId,
      runId,
      mode,
    });
    if (!opened.cycleId || !opened.ok) {
      await ctx.runMutation(internal.seoAgentRuns.logRunLine, {
        runId,
        companyId: company.companyId,
        heading: `Planned ${company.name}`,
        detail: opened.message,
        failed: false,
      });
      continue;
    }

    // The work list is written in the background, a page of websites at a
    // time. Waiting for it lets the log say what was actually queued.
    const started = Date.now();
    let counts = await ctx.runQuery(internal.seoAgentRuns.readCycleCounts, { cycleId: opened.cycleId });
    while (counts?.status === "EXPANDING" && Date.now() - started < PLAN_WAIT_MS) {
      await sleep(POLL_MS);
      counts = await ctx.runQuery(internal.seoAgentRuns.readCycleCounts, { cycleId: opened.cycleId });
    }
    queued += counts?.plannedCount ?? 0;
    reused += counts?.reusedCount ?? 0;
    await ctx.runMutation(internal.seoAgentRuns.logRunLine, {
      runId,
      companyId: company.companyId,
      heading: `Planned ${company.name}`,
      detail: counts?.status === "EXPANDING"
        ? "Still writing the work list; it finishes in the background."
        : `${counts?.plannedCount ?? 0} added to the queue, ${counts?.reusedCount ?? 0} served from data already held.`,
      failed: false,
    });
  }
  return `${mode === "LIVE" ? "Live" : "Test"} mode. `
    + `Added ${queued} ${queued === 1 ? "request" : "requests"} to the queue for ${companies.length} `
    + `${companies.length === 1 ? "company" : "companies"}; ${reused} served from data already held. `
    + "The DataForSEO Collector sends them on its next run.";
}

async function collect(ctx: ActionCtx, runId: Id<"agentRuns">): Promise<string> {
  const started = Date.now();
  const workerId = `collector-${runId}`;
  const waiting = await ctx.runQuery(internal.seoAgentRuns.countWaiting, {});
  await ctx.runMutation(internal.seoAgentRuns.recordObservation, {
    runId,
    text: `Queue: ${waiting.count}${waiting.more ? "+" : ""} waiting to be sent.`,
  });
  let sent = 0;
  let stoppedBecause = "the queue is empty";

  for (;;) {
    if (Date.now() - started > SEO_COLLECTOR_RUN_MS) {
      stoppedBecause = "this run's time was up; the rest waits for the next run";
      break;
    }
    const outcome = await sendNextBatch(ctx, { workerId, runId });
    if (outcome.kind === "CAPPED") {
      stoppedBecause = "the spend limit was reached; the rest waits for the next run";
      break;
    }
    if (outcome.kind === "SENT") {
      sent += outcome.count;
      continue;
    }
    // Nothing due this moment. Work is spaced out as it is queued, so wait
    // for the next row if it comes due while this run still has time.
    const wait = outcome.nextDueAt === null ? null : outcome.nextDueAt - Date.now();
    if (wait === null || Date.now() - started + wait > SEO_COLLECTOR_RUN_MS) break;
    await sleep(Math.max(wait, 250));
  }

  const spent = await ctx.runQuery(internal.seoAgentRuns.readRunCost, { runId });
  return `Sent ${sent} ${sent === 1 ? "request" : "requests"} to DataForSEO and spent $${spent.toFixed(2)}. `
    + `Stopped because ${stoppedBecause}.`;
}

/** Companies with data collection switched on — the switch on their Collection schedule screen. */
export const listCollectingCompanies = internalQuery({
  args: {},
  returns: v.array(v.object({ companyId: v.id("companies"), name: v.string() })),
  handler: async (ctx) => {
    const schedules = await ctx.db.query("schedules").take(500);
    const seen = new Set<string>();
    const companies: Array<{ companyId: Id<"companies">; name: string }> = [];
    for (const schedule of schedules) {
      if (!schedule.companyId || !schedule.isActive || seen.has(schedule.companyId)) continue;
      seen.add(schedule.companyId);
      const company = await ctx.db.get(schedule.companyId);
      if (company) companies.push({ companyId: company._id, name: company.name });
    }
    return companies;
  },
});

/** The Planner's Mode, from its agent. Unset reads as Test. */
export const readPlannerMode = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.union(v.literal("TEST"), v.literal("LIVE")),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const agent = run ? await ctx.db.get(run.agentId) : null;
    return agent?.plannerMode ?? "TEST";
  },
});

/** Open a company's collection for the Planner: everything in Test, what is due in Live. */
export const openCompanyCycle = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.id("agentRuns"),
    mode: v.union(v.literal("TEST"), v.literal("LIVE")),
  },
  returns: v.object({
    ok: v.boolean(),
    cycleId: v.union(v.id("seoCollectionCycles"), v.null()),
    message: v.string(),
  }),
  handler: async (ctx, args) =>
    // MANUAL collects every website whether or not its cadence says it is due;
    // SCHEDULE skips a website its company's cadence says is not due yet.
    await openSeoCycle(ctx, {
      companyId: args.companyId,
      agentRunId: args.runId,
      trigger: args.mode === "LIVE" ? "SCHEDULE" : "MANUAL",
    }),
});

export const readCycleCounts = internalQuery({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.union(v.null(), v.object({ status: v.string(), plannedCount: v.number(), reusedCount: v.number() })),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    return cycle ? { status: cycle.status, plannedCount: cycle.plannedCount, reusedCount: cycle.reusedCount } : null;
  },
});

export const readRunCost = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.number(),
  handler: async (ctx, args) => (await ctx.db.get(args.runId))?.costUsd ?? 0,
});

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

/** Requests waiting to be sent, counted to a ceiling — enough to say how big the job is. */
export const countWaiting = internalQuery({
  args: {},
  returns: v.object({ count: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const ceiling = 1_000;
    const rows = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_status_due", (q) => q.eq("status", "PENDING"))
      .take(ceiling + 1);
    return { count: Math.min(rows.length, ceiling), more: rows.length > ceiling };
  },
});

export const markRunStarted = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { status: "RUNNING", updatedAt: Date.now() });
    return null;
  },
});

export const finishSeoRun = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    role: v.string(),
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
