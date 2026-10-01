import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { RUN_STALLED } from "./roleRuns";
import schema from "./schema";

/**
 * The News agents' groundwork (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 4), and the run life every role's run shares.
 *
 * What must hold: Run or a schedule on an agent holding a News role starts
 * that role's job, never the DataForSEO job or the model loop; one run of an
 * agent at a time; a model call's cost lands on the run, so the agent's own
 * spend limit can stop it; and a run that died is closed, the News agents'
 * as the DataForSEO agents' are.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const NEWS_ROLES = ["NEWS_COLLECTOR", "WEEKLY_DIGEST", "EMAIL_SENDER"] as const;

async function setup(t: ReturnType<typeof harness>, systemKey: string, extra: { maxCostUsd?: number } = {}) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
    name: "Super", email: "su@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now(),
  }));
  const agentId = await t.run(async (ctx) => await ctx.db.insert("agents", {
    name: "Anything", modelId: "model-test", thinkingMode: false, isActive: true, systemKey,
    createdAt: Date.now(), updatedAt: Date.now(), ...extra,
  }));
  return { admin: t.withIdentity({ subject: userId }), agentId };
}

const startRun = (t: ReturnType<typeof harness>, agentId: Id<"agents">, startedAt = Date.now(), status: "QUEUED" | "RUNNING" = "QUEUED") =>
  t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "MANUAL", objective: "run", status, startedAt, updatedAt: startedAt,
  }));

const scheduledNames = (t: ReturnType<typeof harness>) =>
  t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name));

describe("running a News agent", () => {
  test.each(NEWS_ROLES)("Run on the %s starts its job, not the DataForSEO job or a model", async (role) => {
    const t = harness();
    const { admin, agentId } = await setup(t, role);

    await admin.mutation(api.scheduler.manualRunSchedule, { agentId });

    const names = await scheduledNames(t);
    expect(names.some((name) => name.includes("runNewsRoleNow"))).toBe(true);
    expect(names.some((name) => name.includes("runSeoRoleNow"))).toBe(false);
    expect(names.some((name) => name.includes("runTriggeredAgentObjective"))).toBe(false);
  });

  test.each(NEWS_ROLES)("its schedule starts the %s's job too", async (role) => {
    const t = harness();
    const { agentId } = await setup(t, role);
    await t.run(async (ctx) => {
      const creator = (await ctx.db.query("users").first())!._id;
      await ctx.db.insert("schedules", {
        name: "Every six hours", agentId, intervalStr: "daily", isActive: true,
        nextRunAt: Date.now() - 1000, createdAt: Date.now() - 2000, createdBy: creator,
      });
    });

    await t.mutation(internal.workflowEngine.scheduleDispatcher, {});

    const names = await scheduledNames(t);
    expect(names.some((name) => name.includes("runNewsRoleNow"))).toBe(true);
    expect(names.some((name) => name.includes("runTriggeredAgentObjective"))).toBe(false);
  });

  test("a run does its job and finishes with a summary on its timeline", async () => {
    const t = harness();
    const { agentId } = await setup(t, "NEWS_COLLECTOR");
    const runId = await startRun(t, agentId);

    await t.action(internal.newsAgentRunActions.runNewsRoleNow, { role: "NEWS_COLLECTOR", runId });

    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run).toMatchObject({ status: "SUCCESS" });
    expect(run?.completedAt).toBeTypeOf("number");
    const steps = await t.run(async (ctx) => await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", runId)).collect());
    expect(steps.at(-1)).toMatchObject({ kind: "FINAL", status: "SUCCESS", output: run?.finalOutput });
  });

  test("a second run while one is going stops at once, saying so", async () => {
    const t = harness();
    const { agentId } = await setup(t, "EMAIL_SENDER");
    await startRun(t, agentId, Date.now() - 60_000, "RUNNING");
    const later = await startRun(t, agentId);

    await t.action(internal.newsAgentRunActions.runNewsRoleNow, { role: "EMAIL_SENDER", runId: later });

    const run = await t.run(async (ctx) => await ctx.db.get(later));
    expect(run).toMatchObject({ status: "SUCCESS" });
    expect(run?.finalOutput).toMatch(/Another run, started at \d\d:\d\d UTC, is still going\. This one stopped without doing anything/);
  });

  test("a run that died long ago does not hold up the next", async () => {
    const t = harness();
    const { agentId } = await setup(t, "WEEKLY_DIGEST");
    await startRun(t, agentId, Date.now() - 60 * 60 * 1000, "RUNNING");
    const next = await startRun(t, agentId);

    expect(await t.mutation(internal.roleRuns.takeRoleTurn, { runId: next })).toEqual({ ok: true, message: "" });
  });
});

describe("a model call's cost", () => {
  async function priced(t: ReturnType<typeof harness>) {
    await t.run(async (ctx) => await ctx.db.insert("aiModels", {
      modelId: "model-test", displayName: "Test model", isEnabled: true, isDefault: false, lastSyncedAt: Date.now(),
      standardInputCostBelow200k: 1, outputResponseCost: 2,
    }));
  }

  const call = (runId: Id<"agentRuns">) => ({
    runId,
    actionContext: "Summarising a YouTube video",
    modelId: "model-test",
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    promptContent: "the video's words",
    responseContent: "A plain summary.",
  });

  test("lands on the run, in the cost ledger, on the timeline and in the logs", async () => {
    const t = harness();
    await priced(t);
    const { agentId } = await setup(t, "NEWS_COLLECTOR");
    const runId = await startRun(t, agentId, Date.now(), "RUNNING");

    const result = await t.mutation(internal.roleRuns.recordRunModelCall, call(runId));

    // $1 a million in, $2 a million out.
    expect(result).toEqual({ costUsd: 2, runCostUsd: 2, limitReached: false });
    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run).toMatchObject({ costUsd: 2, inputTokens: 1_000_000, outputTokens: 500_000 });
    const ledger = await t.run(async (ctx) => await ctx.db.query("agentTransactions").collect());
    expect(ledger).toMatchObject([{ agentId, actionContext: "Summarising a YouTube video", costUsd: 2, status: "SUCCESS" }]);
    const steps = await t.run(async (ctx) => await ctx.db.query("agentRunSteps").collect());
    expect(steps).toMatchObject([{ runId, kind: "MODEL", costUsd: 2, input: "Summarising a YouTube video" }]);
    const logs = await t.run(async (ctx) => await ctx.db.query("agentLogs").collect());
    expect(logs).toMatchObject([{ runId, interactionType: "Summarising a YouTube video", responseContent: "A plain summary." }]);
  });

  test("says when the run has reached its agent's spend limit", async () => {
    const t = harness();
    await priced(t);
    const { agentId } = await setup(t, "WEEKLY_DIGEST", { maxCostUsd: 3 });
    const runId = await startRun(t, agentId, Date.now(), "RUNNING");

    expect((await t.mutation(internal.roleRuns.recordRunModelCall, call(runId))).limitReached).toBe(false);
    expect(await t.query(internal.roleRuns.runSpendLeft, { runId })).toEqual({ spentUsd: 2, limitUsd: 3, limitReached: false });
    expect((await t.mutation(internal.roleRuns.recordRunModelCall, call(runId))).limitReached).toBe(true);
    expect(await t.query(internal.roleRuns.runSpendLeft, { runId })).toEqual({ spentUsd: 4, limitUsd: 3, limitReached: true });
  });
});

describe("a run that died", () => {
  test("is closed as failed, a News agent's as a DataForSEO agent's, and a finished one is left alone", async () => {
    const t = harness();
    const { agentId: newsAgent } = await setup(t, "NEWS_COLLECTOR");
    const { agentId: seoAgent } = await setup(t, "DATAFORSEO_COLLECTOR");
    const long = Date.now() - 2 * 60 * 60 * 1000;
    const deadNews = await startRun(t, newsAgent, long, "RUNNING");
    const deadSeo = await startRun(t, seoAgent, long, "RUNNING");
    const done = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId: newsAgent, triggerType: "MANUAL", objective: "run", status: "SUCCESS", startedAt: long, updatedAt: long, completedAt: long,
    }));
    const recent = await startRun(t, newsAgent, Date.now(), "RUNNING");

    await t.mutation(internal.seoCollectionSweep.sweepDuty, { duty: "stalledRuns" });

    const read = (id: Id<"agentRuns">) => t.run(async (ctx) => await ctx.db.get(id));
    expect(await read(deadNews)).toMatchObject({ status: "FAILED", finalOutput: RUN_STALLED, error: RUN_STALLED });
    expect(await read(deadSeo)).toMatchObject({ status: "FAILED", finalOutput: RUN_STALLED });
    expect(await read(done)).toMatchObject({ status: "SUCCESS" });
    expect(await read(recent)).toMatchObject({ status: "RUNNING" });
  });
});

describe("the News agents' templates", () => {
  test.each(["news-collector-agent", "weekly-digest-agent", "email-sender-agent"])("%s makes a switched-off draft with its instructions", async (templateId) => {
    const t = harness();
    const { admin } = await setup(t, "UNRELATED");
    await t.run(async (ctx) => await ctx.db.insert("aiModels", {
      modelId: "model-test", displayName: "Test model", isEnabled: true, isDefault: true, lastSyncedAt: Date.now(),
      supportedUseCases: ["agent"],
    }));

    const agentId = await admin.mutation(api.agents.createAgentFromTemplate, { templateId });

    const agent = await t.run(async (ctx) => await ctx.db.get(agentId));
    expect(agent).toMatchObject({ isActive: false, triggerType: "SCHEDULE" });
    expect(agent?.systemPrompt?.length).toBeGreaterThan(40);
    // Found by the role given on its Settings, never by the template's name.
    expect(agent?.systemKey).toBeUndefined();
  });
});
