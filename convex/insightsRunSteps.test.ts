import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { aboutMs, useFixedDay, whileMovingClock } from "@/src/test/realTime";
import { finishScheduled } from "@/src/test/finishScheduled";
import { ASK_LIMIT_MS, within } from "./insightsAsk";
import { stepKey, STEP_WATCH_MS } from "./collectionSteps";
import { INSIGHTS_STEP_WATCH_MS } from "./insightsRunSteps";

/**
 * A website's weekly Insights run in four steps (insightsRunSteps.ts,
 * insights-one-voice-plan.md phase 0): each step's watch finishes a run the
 * platform stopped, saying where, and leaves a moving one alone; the step
 * after the save reads the saved week back; and a model that says nothing is
 * given up in time.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  useFixedDay("2026-10-12");
});

afterEach(() => {
  vi.useRealTimers();
});

async function seeded(t: ReturnType<typeof harness>, status: "RUNNING" | "SUCCESS" = "RUNNING", movedAgo = 11 * 60 * 1000) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const agentId = await ctx.db.insert("agents", {
      name: "Insights: Head of Strategy", modelId: "model-test", thinkingMode: false, isActive: true,
      systemKey: "INSIGHTS_HEAD_OF_STRATEGY", createdAt: now, updatedAt: now,
    });
    const runId = await ctx.db.insert("agentRuns", {
      agentId, companyId, triggerType: "EVENT", objective: "read ronins.co.uk", status, startedAt: now - movedAgo, updatedAt: now - movedAgo,
    });
    const workflowExecutionId = await ctx.db.insert("workflowExecutions", { agentId, agentRunId: runId, triggerType: "EVENT", status: "RUNNING", startedAt: now - movedAgo });
    return { runId, workflowExecutionId, holdId, companyId, host: "ronins.co.uk" };
  });
}

const runOf = async (t: ReturnType<typeof harness>, runId: Id<"agentRuns">) => await t.run(async (ctx) => await ctx.db.get(runId));

describe("a website's week in steps", () => {
  test("a step the platform stopped before the save fails the run, saying where; after the save, the week stands", async () => {
    const t = harness();
    const run = await seeded(t);
    await t.mutation(internal.insightsRunSteps.watchInsightsStep, { ...run, step: "DECIDE" });
    await finishScheduled(t);
    expect(await runOf(t, run.runId)).toMatchObject({
      status: "FAILED",
      finalOutput: "ronins.co.uk: the platform stopped the run at ten minutes while reading the sources and deciding the week, so this week wasn't saved. The next run starts afresh.",
    });

    const after = await seeded(t);
    await t.mutation(internal.insightsRunSteps.watchInsightsStep, { ...after, step: "AFTER" });
    await finishScheduled(t);
    expect(await runOf(t, after.runId)).toMatchObject({ status: "FAILED" });
    expect((await runOf(t, after.runId))?.finalOutput).toMatch(/^ronins\.co\.uk: the week was saved/);
  });

  test("a run still moving, or already finished, is left alone", async () => {
    const t = harness();
    const moving = await seeded(t, "RUNNING", 10 * 1000);
    await t.mutation(internal.insightsRunSteps.watchInsightsStep, { ...moving, step: "GATHER" });
    expect(await runOf(t, moving.runId)).toMatchObject({ status: "RUNNING" });
    const finished = await seeded(t, "SUCCESS");
    await t.mutation(internal.insightsRunSteps.watchInsightsStep, { ...finished, step: "GATHER" });
    expect(await runOf(t, finished.runId)).toMatchObject({ status: "SUCCESS" });
  });

  test("handing on cancels the step's watch and books the next step with its own", async () => {
    const t = harness();
    const run = await seeded(t, "RUNNING", 0);
    const first = await t.mutation(internal.insightsRunSteps.bookInsightsWatch, { ...run, step: "GATHER" });
    await t.mutation(internal.insightsRunSteps.handOnInsights, { ...run, step: "AFTER", cancelWatchId: first, week: "2026-10-12", today: "2026-10-12", counts: { facts: 1, candidates: 0, written: 0, published: 0, sentBack: 0 } });
    const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.find((job) => job._id === first)?.state.kind).toBe("canceled");
    const pending = jobs.filter((job) => job.state.kind === "pending").map((job) => [job.name, job.scheduledTime - Date.now()]);
    expect(pending).toEqual(expect.arrayContaining([
      ["insightsRunSteps:watchInsightsStep", aboutMs(INSIGHTS_STEP_WATCH_MS)],
      ["insightsRunAfter:afterWeek", aboutMs(0)],
    ]));
  });

  test("gathering hands on to picking each search's page; with the decision switched off, that hands straight on to deciding", async () => {
    const t = harness();
    const run = await seeded(t, "RUNNING", 0);
    const first = await t.mutation(internal.insightsRunSteps.bookInsightsWatch, { ...run, step: "GATHER" });
    await t.mutation(internal.insightsRunSteps.handOnInsights, { ...run, step: "PICK", cancelWatchId: first, pagesChanged: [] });
    const pending = async () => (await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).filter((job) => job.state.kind === "pending");
    const picking = (await pending()).find((job) => job.name === "insightCompetingJudge:pickWebsite")!;
    expect(picking).toBeDefined();
    const watch = (await pending()).find((job) => job.name === "insightsRunSteps:watchInsightsStep")!;
    await t.action(internal.insightCompetingJudge.pickWebsite, { ...run, watchId: watch._id, pagesChanged: [] });
    expect((await pending()).map((job) => job.name)).toEqual(expect.arrayContaining(["insightCompetingSteps:prepareGroups"]));
  });

  test("each search's pick is kept, the last replaced", async () => {
    const t = harness();
    const { holdId } = await seeded(t);
    await t.mutation(internal.insightCompetingJudge.savePicks, { holdId, picks: [{ search: "app developers", offered: "a", page: "/app-developers-london/", certainty: "SURE", pickedAt: 1 }] });
    await t.mutation(internal.insightCompetingJudge.savePicks, { holdId, picks: [{ search: "app developers", offered: "b", page: null, pickedAt: 2 }] });
    expect(await t.query(internal.insightCompetingJudge.picksFor, { holdId, searches: ["app developers", "app makers"] })).toEqual([{ search: "app developers", offered: "b", page: null, pickedAt: 2 }]);
  });

  test("the step after the save reads the run's own week back, its published findings in order", async () => {
    const t = harness();
    const run = await seeded(t, "RUNNING", 0);
    const finding = (rank: number, status: "PUBLISHED" | "SENT_BACK", runId = run.runId) => ({
      companyId: run.companyId, companyWebsiteId: run.holdId, week: "2026-10-12", runId, createdAt: 1,
      specialist: "search" as const, pattern: "COMPETING_PAGES", status, rank, headline: `Finding ${rank}`, story: "s", ruledOut: [], action: "a", howWeKnow: "h",
      sure: "MEDIUM" as const, sources: ["searchConsole"], facts: [], comparisons: [], checkOn: "2026-12-07",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("insightWeeks", { companyId: run.companyId, companyWebsiteId: run.holdId, week: "2026-10-12", runId: run.runId, verdict: "Steady.", sources: [], problems: [], published: 2, sentBack: 1, costUsd: 0.3, createdAt: 1 });
      for (const row of [finding(2, "PUBLISHED"), finding(1, "PUBLISHED"), finding(3, "SENT_BACK")]) await ctx.db.insert("insightFindings", row);
    });
    const saved = await t.query(internal.insightsRunSteps.savedWeek, { holdId: run.holdId, week: "2026-10-12", runId: run.runId });
    expect(saved?.verdict).toBe("Steady.");
    expect(saved?.findings.map((entry) => entry.headline)).toEqual(["Finding 1", "Finding 2"]);
    expect(saved?.findings[0]).not.toHaveProperty("companyWebsiteId");
  });
});

describe("a model that says nothing", () => {
  test("is given up at its limit, three minutes, and the step goes on", async () => {
    expect(ASK_LIMIT_MS).toBe(180_000);
    await expect(whileMovingClock(within(new Promise(() => {}), ASK_LIMIT_MS))).rejects.toThrow("The model gave no answer within 180 seconds, so it was given up.");
    await expect(within(Promise.resolve("answered"), 10)).resolves.toBe("answered");
  });
});


describe("watched whole-section runs", () => {
  test("a duplicate start reuses the active run and its saved place survives the platform stopping a step", async () => {
    const t = harness();
    const parent = await seeded(t, "RUNNING", 0);
    const input = { parentRunId: parent.runId, holdId: parent.holdId, companyId: parent.companyId, host: parent.host, delayMs: 0 };
    const runId = (await t.mutation(internal.insightsTeam.startWebsiteRun, input))!;
    expect(await t.mutation(internal.insightsTeam.startWebsiteRun, input)).toBe(runId);
    const key = stepKey("INSIGHTS", parent.holdId);
    const chain = () => t.run(async (ctx) => (await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", key)).unique())!);
    const first = await chain();
    expect(first.args).toMatchObject({ runId, stage: "GATHER", booking: 1 });
    await t.mutation(internal.collectionSteps.stepStarted, { key, booking: 1 });
    const history = { pieces: [{ kind: "GA_PAGES", month: "2026-09", newestDay: "2026-10-11" }], at: 0, records: 7, asks: 10, problems: [], waits: 0, attempt: 0 };
    await t.mutation(internal.collectionSteps.notePlace, { key, booking: 1, place: "HISTORY:0", args: { ...first.args, stage: "HISTORY", history } });
    await t.run(async (ctx) => await ctx.scheduler.cancel(first.stepJobId!));
    vi.setSystemTime(Date.now() + STEP_WATCH_MS + 1_000);
    await t.mutation(internal.collectionSteps.watchChains, {});
    expect(await chain()).toMatchObject({ booking: 2, args: { stage: "HISTORY", history } });
    expect((await t.mutation(internal.collectionSteps.stepStarted, { key, booking: 1 })).go).toBe(false);
    await t.mutation(internal.insightsRunSteps.watchInsightsStep, { ...parent, runId, step: "HISTORY" });
    expect((await runOf(t, runId))?.status).toBe("QUEUED");
  });

  test("completion exposes failed and pending stages until that same run completes them; another company cannot mark them", async () => {
    const t = harness(), run = await seeded(t, "RUNNING", 0);
    await t.mutation(internal.insightsRunSteps.recordStage, { runId: run.runId, companyId: run.companyId, stage: "History", detail: "Quota refused", failed: true });
    let states = await t.query(internal.insightsRunSteps.stageResults, { runId: run.runId });
    expect(states.find((row) => row.stage === "History")?.status).toBe("FAILED");
    expect(states.find((row) => row.stage === "Page reviews")?.status).toBe("PENDING");
    await t.mutation(internal.insightsRunSteps.recordStage, { runId: run.runId, companyId: run.companyId, stage: "History", detail: "Saved all pieces", failed: false });
    states = await t.query(internal.insightsRunSteps.stageResults, { runId: run.runId });
    expect(states.find((row) => row.stage === "History")?.status).toBe("SUCCESS");
    const otherId = await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Other", createdAt: 1 }));
    await expect(t.mutation(internal.insightsRunSteps.recordStage, { runId: run.runId, companyId: otherId, stage: "History", detail: "Wrong company", failed: false })).rejects.toThrow("another company");
  });
});
