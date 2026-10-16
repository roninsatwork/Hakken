import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { autoWorkOf } from "./autoClassifyStart";
import { readClassificationTypes } from "./classificationTypes";
import { describeHoldForJudging } from "./holdProfiles";
import { ruleInputs } from "./pageClassifications";
import { closeRoleRun, writeRunLine } from "./roleRuns";
import { DESCRIPTION_LENGTH, GROUP_LABELS, answersOf, autoBucketOf, recordOf, type AutoAnswer } from "./utils/autoClassify";
import { DESCRIPTIONS_PER_STEP, PAGES_PER_STEP } from "./utils/autoClassifyAgent";
import { classifierFor, normalisePage } from "./utils/pageClassification";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";

/**
 * The reads and writes of an Auto Classify run's steps
 * (docs/plans/active/auto-classify-plan.md, AC5, AC6): what a step works on,
 * its answers kept, a group's description saved, and the run's end. The step
 * itself, which asks the model, is `autoClassifyRun.ts`.
 */

type ClassificationId = Id<"pageClassifications">;

/** A group's busiest pages shown to the description writer. */
const PAGES_FOR_DESCRIBING = 20;

const bandValidator = v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"));

/** A run's answers read at once to add up their cost: more than any run asks. */
const ANSWERS_ADDED_UP = 10_500;

/**
 * The Jev answers filed under a run since a time, added to the run's own cost
 * and tokens (auto-classify-plan.md, AC10): so Agents and the run observatory,
 * which add up runs, show what an Auto Classify run cost. The platform's cost
 * ledger keeps each answer under the Decision Maker, as for every Decision;
 * runs are not in that ledger, so nothing is counted twice.
 */
async function chargeAnswers(ctx: MutationCtx, runId: Id<"agentRuns">, since: number, most: number): Promise<void> {
  const run = await ctx.db.get(runId);
  if (!run) return;
  const rows = (await ctx.db.query("decisionRuns").withIndex("by_agent_run", (q) => q.eq("agentRunId", runId)).order("desc").take(most))
    .filter((row) => row.createdAt >= since);
  if (rows.length === 0) return;
  const sum = (pick: (row: (typeof rows)[number]) => number | undefined) => rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
  await ctx.db.patch(runId, {
    costUsd: (run.costUsd ?? 0) + sum((row) => row.costUsd),
    inputTokens: (run.inputTokens ?? 0) + sum((row) => row.inputTokens),
    outputTokens: (run.outputTokens ?? 0) + sum((row) => row.outputTokens),
    updatedAt: Date.now(),
  });
}

/** A run's answers since a time added to its cost, all of them with `since` 0: for a run that finished before its answers were added up. */
export const chargeAnswersToRun = internalMutation({
  args: { runId: v.id("agentRuns"), since: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await chargeAnswers(ctx, args.runId, args.since, ANSWERS_ADDED_UP);
    return null;
  },
});

/**
 * What the next step works on, or null when this run is no longer the
 * website's (a newer one took over, or the website went): the groups offered
 * with their labels, the next pages to ask with the search that brings each
 * the most visits, and the groups still to describe.
 */
export const stepWork = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const [hold, state, run] = await Promise.all([
      ctx.db.get(args.companyWebsiteId),
      ctx.db.query("autoClassifyRuns").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first(),
      ctx.db.get(args.runId),
    ]);
    if (!hold || !state || !run || state.agentRunId !== args.runId) return null;
    const [work, website, business, types] = await Promise.all([
      autoWorkOf(ctx, hold),
      ctx.db.get(hold.websiteId),
      describeHoldForJudging(ctx, hold._id),
      readClassificationTypes(ctx),
    ]);
    const typeName = (key: string) => types.find((type) => type.key === key)?.nameEn ?? key;
    const host = website?.displayHost ?? website?.host ?? "";
    const place = hold.locationCode ?? DEFAULT_LOCATION_CODE;

    const pages = [];
    for (const row of work.toAsk.slice(0, PAGES_PER_STEP)) {
      const ranks = website
        ? await ctx.db.query("sitePageRanks").withIndex("by_site_page", (q) => q.eq("websiteId", website._id).eq("locationCode", place).eq("page", row.page)).first()
        : null;
      pages.push({ page: row.page, topSearch: ranks?.topKeyword ?? null });
    }

    // The busiest pages each group to describe has now, by every rule but Auto Classify's own guesses about it.
    const inputs = ruleInputs(work.setup);
    const classify = classifierFor(inputs.lines, inputs.picks, inputs.autos);
    const undescribed = work.undescribed.slice(0, DESCRIPTIONS_PER_STEP).map((group) => ({
      id: group._id,
      name: group.name,
      type: typeName(group.type),
      lines: work.setup.lines.filter((line) => line.classificationId === group._id).map((line) => `${line.kind.toLowerCase().replace("_", " ")} ${line.value}`),
      pages: work.held.pages
        .filter((row) => {
          const result = classify(row.page, row.sitemapFile ?? null);
          return result.classificationId === group._id && result.how !== "BY_AUTO";
        })
        .slice(0, PAGES_FOR_DESCRIBING)
        .map((row) => row.page),
    }));

    return {
      status: state.status,
      queued: run.status === "QUEUED",
      companyId: hold.companyId,
      host,
      business: { address: host, ...(business ?? { names: [], searches: [] }) },
      groups: work.groups.map((group, index) => ({
        label: GROUP_LABELS[index],
        id: group._id,
        name: group.name,
        type: typeName(group.type),
        description: group.description ?? "",
      })),
      stamp: work.stamp,
      pages,
      remaining: work.toAsk.length,
      undescribed,
      done: state.done,
      total: state.total,
      placed: state.placed,
    };
  },
});

/**
 * A step's answers kept, each in its page's record, and the run moved on:
 * how many are done, a line on its timeline and in its log. Refused (false)
 * when the run is no longer the website's.
 */
export const writeAnswers = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    runId: v.id("agentRuns"),
    stamp: v.string(),
    /** When the step began asking: its answers' cost is the run's from then. */
    since: v.number(),
    answers: v.array(v.object({ page: v.string(), classificationId: v.union(v.id("pageClassifications"), v.null()), band: bandValidator })),
    line: v.object({ heading: v.string(), detail: v.string() }),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("autoClassifyRuns").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first();
    if (!state || state.agentRunId !== args.runId || state.status !== "SORTING") return false;
    const now = Date.now();
    const byBucket = new Map<number, AutoAnswer<ClassificationId>[]>();
    for (const answer of args.answers) {
      const bucket = autoBucketOf(answer.page);
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), { page: answer.page, classificationId: answer.classificationId, band: answer.band, stamp: args.stamp }]);
    }
    for (const [bucket, fresh] of byBucket) {
      const record = await ctx.db
        .query("pageClassificationAuto")
        .withIndex("by_hold_bucket", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("bucket", bucket))
        .first();
      const replaced = new Set(fresh.map((answer) => normalisePage(answer.page)));
      const kept = record ? answersOf<ClassificationId>(record).filter((answer) => !replaced.has(normalisePage(answer.page))) : [];
      const written = recordOf([...kept, ...fresh]);
      if (record) await ctx.db.patch(record._id, { ...written, updatedAt: now });
      else await ctx.db.insert("pageClassificationAuto", { companyWebsiteId: args.companyWebsiteId, bucket, ...written, updatedAt: now });
    }
    const placed = args.answers.filter((answer) => answer.classificationId !== null && answer.band !== "NOT_SURE").length;
    await ctx.db.patch(state._id, { done: state.done + args.answers.length, placed: state.placed + placed, lastStepAt: now });
    await chargeAnswers(ctx, args.runId, args.since, PAGES_PER_STEP * 2);
    await writeRunLine(ctx, { runId: args.runId, companyId: state.companyId, heading: args.line.heading, detail: args.line.detail, failed: false });
    return true;
  },
});

/** Hakken's description for a group, kept only while it still has none: a person's words are never written over (AC8). */
export const saveDescription = internalMutation({
  args: { classificationId: v.id("pageClassifications"), description: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.classificationId);
    const description = args.description.trim().slice(0, DESCRIPTION_LENGTH);
    if (!group || group.description || !description) return false;
    await ctx.db.patch(group._id, { description, descriptionBy: "HAKKEN", updatedAt: Date.now() });
    return true;
  },
});

/** A line on the run's timeline and in its log, with the run kept moving. */
export const noteStep = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), runId: v.id("agentRuns"), heading: v.string(), detail: v.string(), failed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("autoClassifyRuns").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first();
    if (!state || state.agentRunId !== args.runId) return null;
    await ctx.db.patch(state._id, { lastStepAt: Date.now() });
    await writeRunLine(ctx, { runId: args.runId, companyId: state.companyId, heading: args.heading, detail: args.detail, failed: args.failed });
    return null;
  },
});

/**
 * The run's end: DONE when nothing is left, STOPPED when it could not go on
 * (switched off, the model not answering, the spend limit), with its summary
 * as the run's last step.
 */
export const finishSiteRun = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    outcome: v.union(v.literal("DONE"), v.literal("STOPPED")),
    failed: v.boolean(),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("autoClassifyRuns").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first();
    const now = Date.now();
    if (state && state.agentRunId === args.runId) {
      await ctx.db.patch(state._id, {
        status: args.outcome,
        finishedAt: now,
        lastStepAt: now,
        stopped: args.outcome === "STOPPED" ? args.summary : undefined,
      });
    }
    await closeRoleRun(ctx, {
      runId: args.runId,
      ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
      status: args.failed ? "FAILED" : "SUCCESS",
      summary: args.summary,
    });
    return null;
  },
});
