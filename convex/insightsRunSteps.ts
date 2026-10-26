import { appError } from "./utils/appError";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { insightsStepArgs } from "./insightsAsk";
import { savedFindingValidator, type SavedFinding } from "./insightsTeam";
import { appendRunStep } from "./agentRunStepWriter";
import { lastMoved, writeRunLine } from "./roleRuns";
import { cancelQuietly } from "./seoCollectorRun";
import { weekSummaryValidator } from "./utils/insightSummary";
import { serviceValidator } from "./utils/insightStrategy";
import { bookStep, noteStepMemory, runWatched, stepKey } from "./collectionSteps";
import { historyStateValidator } from "./utils/insightHistoryRun";
import { insightRunStageValidator, insightStageResultValidator } from "./utils/insightRunStages";
import { insightStagesOf } from "./insightsRunState";

/**
 * A website's weekly Insights run in four steps, each handing on to the
 * next (insights-one-voice-plan.md phase 0; AGENTS.md: "work that stops at a
 * time limit hands itself on"): gather (`insightsRun.runWebsite`), each
 * cannibalisation search's page picked by the decision model
 * (`insightCompetingJudge.pickWebsite`, handing on to itself until every
 * search is asked), read and decide (`insightsRun.decideWebsite`), and what
 * follows the save (`insightsRunAfter.afterWeek`). Each is booked with a watch set past the
 * ten minutes Convex gives an action: a step that neither handed on nor
 * finished was stopped, and the watch finishes the run saying so, rather
 * than leaving it "going" as the run cut off on 12 October 2026 was.
 */

export const INSIGHTS_STEPS = ["GATHER", "HISTORY", "PICK", "GROUPS", "DECIDE", "AFTER"] as const;
export type InsightsStep = (typeof INSIGHTS_STEPS)[number];
const stepValidator = v.union(...INSIGHTS_STEPS.map((step) => v.literal(step)));

/** Past the longest an action lives. */
export const INSIGHTS_STEP_WATCH_MS = 11 * 60 * 1000;
/** A run that moved this recently is still going — a later step started late — and its watch leaves it alone. */
const STILL_MOVING_MS = 60 * 1000;

/** What each step is doing, for the run's timeline when the watch finds it stopped. */
const STEP_WORDS: Record<InsightsStep, string> = {
  GATHER: "checking the money pages and asking Google for the history",
  HISTORY: "saving the source history in pieces",
  PICK: "picking each search's page",
  GROUPS: "reviewing the groups of competing pages",
  DECIDE: "reading the sources and deciding the week",
  AFTER: "writing the reports, drafts and page reviews after the week was saved",
};

const countsValidator = v.object({ facts: v.number(), candidates: v.number(), written: v.number(), published: v.number(), sentBack: v.number() });

/** Book a step's watch, the run marked as moving: for the first step, which starts itself. */
export const bookInsightsWatch = internalMutation({
  args: { ...insightsStepArgs, step: stepValidator },
  returns: v.id("_scheduled_functions"),
  handler: async (ctx, args): Promise<Id<"_scheduled_functions">> => {
    await ctx.db.patch(args.runId, { updatedAt: Date.now() });
    // Typed by hand: inferred, it would read the generated api, which reads this module (as `seoCollectorRun.ts` does).
    const watchId: Id<"_scheduled_functions"> = await ctx.scheduler.runAfter(INSIGHTS_STEP_WATCH_MS, internal.insightsRunSteps.watchInsightsStep, args);
    return watchId;
  },
});

/**
 * Hand on to the next step: the step's own watch cancelled, the next one's
 * booked, and the next step started at once with what it needs — the pages
 * the money-page checks saw change, for deciding; the week and what it came
 * to, for after the save.
 */
export const handOnInsights = internalMutation({
  args: {
    ...insightsStepArgs,
    step: v.union(v.literal("HISTORY"), v.literal("PICK"), v.literal("GROUPS"), v.literal("DECIDE"), v.literal("AFTER")),
    cancelWatchId: v.id("_scheduled_functions"),
    /** The picking step's turn, when it hands on to itself. */
    round: v.optional(v.number()),
    history: v.optional(historyStateValidator),
    delayMs: v.optional(v.number()), memoryMb: v.optional(v.number()),
    afterPart: v.optional(v.number()), afterAttempt: v.optional(v.number()),
    decideAttempt: v.optional(v.number()),
    ownerRemaining: v.optional(v.number()), ownerStalls: v.optional(v.number()),
    competingAttempt: v.optional(v.number()), competingAt: v.optional(v.number()), competingSignature: v.optional(v.string()), competingProblems: v.optional(v.array(v.string())),
    pagesChanged: v.optional(v.array(v.object({ kind: v.string(), page: v.string() }))),
    week: v.optional(v.string()),
    today: v.optional(v.string()),
    counts: v.optional(countsValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { step, cancelWatchId, pagesChanged, week, today, counts, round, history, delayMs, memoryMb, afterPart, afterAttempt, decideAttempt, ownerRemaining, ownerStalls, competingAttempt, competingAt, competingSignature, competingProblems, ...run } = args;
    await cancelQuietly(ctx, cancelWatchId);
    const current = await ctx.db.get(run.runId);
    if (!current || (current.status !== "RUNNING" && current.status !== "QUEUED")) return null;
    const chain = await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", stepKey("INSIGHTS", run.holdId))).unique();
    if (chain) {
      if (chain.closedAt !== undefined || chain.runId !== run.runId || (run.chainBooking !== undefined && chain.booking !== run.chainBooking)) return null;
      await noteStepMemory(ctx, chain, memoryMb, Date.now());
      const progress = { round, history, week, today, counts, afterPart, afterAttempt, decideAttempt, ownerRemaining, ownerStalls, competingAttempt, competingAt, competingSignature, competingProblems };
      const savedProgress = Object.fromEntries(Object.entries(progress).filter(([, value]) => value !== undefined));
      await bookStep(ctx, {
        key: chain.key, chain: "INSIGHTS", runId: run.runId, delayMs,
        args: { ...run, stage: step, pagesChanged: pagesChanged ?? [], ...savedProgress },
        place: `${step}:${history?.at ?? competingAt ?? afterPart ?? decideAttempt ?? round ?? 0}`,
      });
      return null;
    }
    await ctx.db.patch(run.runId, { updatedAt: Date.now() });
    const watchId: Id<"_scheduled_functions"> = await ctx.scheduler.runAfter(INSIGHTS_STEP_WATCH_MS, internal.insightsRunSteps.watchInsightsStep, { ...run, step });
    if (step === "HISTORY") {
      if (!history) throw appError("INVALID_INPUT", "The history step needs its saved position.");
      await ctx.scheduler.runAfter(delayMs ?? 0, internal.insightHistorySteps.fillForRun, { ...run, watchId, pagesChanged: pagesChanged ?? [], history });
    } else if (step === "PICK") {
      await ctx.scheduler.runAfter(0, internal.insightCompetingJudge.pickWebsite, { ...run, watchId, pagesChanged: pagesChanged ?? [], ...(round ? { round } : {}), ...(ownerRemaining === undefined ? {} : { ownerRemaining }), ...(ownerStalls === undefined ? {} : { ownerStalls }) });
    } else if (step === "GROUPS") {
      await ctx.scheduler.runAfter(delayMs ?? 0, internal.insightCompetingSteps.prepareGroups, { ...run, watchId, pagesChanged: pagesChanged ?? [], ...(competingAttempt === undefined ? {} : { competingAttempt }), ...(competingAt === undefined ? {} : { competingAt }), ...(competingSignature === undefined ? {} : { competingSignature }), ...(competingProblems === undefined ? {} : { competingProblems }) });
    } else if (step === "DECIDE") {
      await ctx.scheduler.runAfter(0, internal.insightsRun.decideWebsite, { ...run, watchId, pagesChanged: pagesChanged ?? [], ...(decideAttempt === undefined ? {} : { decideAttempt }) });
    } else {
      await ctx.scheduler.runAfter(0, internal.insightsRunAfter.afterWeek, {
        ...run, watchId, week: week ?? "", today: today ?? "",
        ...(afterPart === undefined ? {} : { afterPart }), ...(afterAttempt === undefined ? {} : { afterAttempt }),
        counts: counts ?? { facts: 0, candidates: 0, written: 0, published: 0, sentBack: 0 },
      });
    }
    return null;
  },
});

export const cancelInsightsWatch = internalMutation({
  args: { watchId: v.id("_scheduled_functions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await cancelQuietly(ctx, args.watchId);
    return null;
  },
});

/**
 * A step's watch: the step neither handed on nor finished, though no action
 * lives this long — the platform stopped it. The run is finished saying
 * where: a run stopped before its week was saved failed; one stopped after
 * succeeded, its week saved, with what it didn't finish said. A run finished
 * meanwhile, or still moving, is left alone.
 */
export const watchInsightsStep = internalMutation({
  args: { ...insightsStepArgs, step: stepValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || (run.status !== "RUNNING" && run.status !== "QUEUED")) return null;
    if (await runWatched(ctx, args.runId)) return null;
    if (Date.now() - lastMoved(run) < STILL_MOVING_MS) return null;
    const saved = args.step === "AFTER";
    const summary = saved
      ? `${args.host}: the week was saved, but the platform stopped the run at ten minutes while ${STEP_WORDS.AFTER}, so some may be missing this week.`
      : `${args.host}: the platform stopped the run at ten minutes while ${STEP_WORDS[args.step]}, so this week wasn't saved. The next run starts afresh.`;
    await appendRunStep(ctx, { runId: args.runId, agentId: run.agentId, kind: "OBSERVE", status: "FAILED", output: summary });
    await ctx.scheduler.runAfter(0, internal.roleRuns.finishRoleRun, {
      runId: args.runId, workflowExecutionId: args.workflowExecutionId, status: "FAILED", summary,
    });
    return null;
  },
});

/** Full successful answers, rather than truncated log previews, reused only inside their own company's run. */
export const modelAnswer = internalQuery({
  args: { runId: v.id("agentRuns"), companyId: v.id("companies"), requestKey: v.string() },
  returns: v.object({ answer: v.union(v.string(), v.null()), failures: v.number() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.companyId !== args.companyId) throw appError("UPSTREAM_FAILURE", "This model answer belongs to another company or run.");
    if (run.status !== "RUNNING" && run.status !== "QUEUED") throw appError("CONFLICT", "This Insights run has stopped; no model is asked again.");
    const rows = await ctx.db.query("agentLogs").withIndex("by_run_request", (q) => q.eq("runId", args.runId).eq("requestKey", args.requestKey)).order("desc").take(3);
    return { answer: rows.find((row) => row.outcome === "SUCCESS" && row.companyId === args.companyId)?.completeResponse ?? null, failures: rows.filter((row) => row.outcome === "FAILED").length };
  },
});

export const runEnded = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    return !run || (run.status !== "RUNNING" && run.status !== "QUEUED");
  },
});

/** Stage outcomes use the existing run log, its tenant boundary and retention. Latest retry wins. */
export const recordStage = internalMutation({
  args: { runId: v.id("agentRuns"), companyId: v.id("companies"), stage: insightRunStageValidator, detail: v.string(), failed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.companyId !== args.companyId) throw appError("UPSTREAM_FAILURE", "This stage belongs to another company or run.");
    if (run.status !== "RUNNING" && run.status !== "QUEUED") return null;
    await writeRunLine(ctx, { runId: args.runId, companyId: args.companyId, heading: args.stage, detail: args.detail, failed: args.failed, requestKey: `Insights stage:${args.stage}` });
    return null;
  },
});

export const stageResults = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.array(insightStageResultValidator),
  handler: async (ctx, args) => await insightStagesOf(ctx, args.runId),
});

/** A finding as saved, with its id, as the reports name it. */
export type WrittenFinding = SavedFinding & { findingId: Id<"insightFindings"> | null };

/**
 * The week a run saved, for the step after the save: its verdict, its
 * summary and its published findings in their order, each as it was written.
 * Null when the run saved no week.
 */
export const savedWeek = internalQuery({
  args: { holdId: v.id("companyWebsites"), week: v.string(), runId: v.id("agentRuns") },
  returns: v.union(v.null(), v.object({
    verdict: v.string(),
    summary: v.union(weekSummaryValidator, v.null()),
    findings: v.array(v.object({ ...savedFindingValidator.fields, findingId: v.union(v.id("insightFindings"), v.null()) })),
  })),
  handler: async (ctx, args) => {
    const week = (await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("week", args.week)).take(10))
      .find((row) => row.runId === args.runId);
    if (!week) return null;
    const rows = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("week", args.week)).take(200);
    const fields = Object.keys(savedFindingValidator.fields) as Array<keyof SavedFinding>;
    const findings = rows
      .filter((row) => row.runId === args.runId && row.status === "PUBLISHED")
      .sort((a, b) => a.rank - b.rank)
      .map((row) => ({ ...Object.fromEntries(fields.filter((field) => row[field] !== undefined).map((field) => [field, row[field]])) as SavedFinding, findingId: row._id }));
    return { verdict: week.verdict, summary: week.summary ?? null, findings };
  },
});

/** The services' calls kept with the newest week before this one: last week's Head of Strategy's, to keep where nothing changed. */
export const lastServices = internalQuery({
  args: { holdId: v.id("companyWebsites"), before: v.string() },
  returns: v.array(serviceValidator),
  handler: async (ctx, args) => {
    const week = await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).lt("week", args.before)).order("desc").first();
    return week?.summary?.services ?? [];
  },
});

