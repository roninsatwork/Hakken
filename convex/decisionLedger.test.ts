import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useMiddayUtc } from "@/src/test/realTime";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { moveDecisionCalls } from "./decisionLedger";

/**
 * A Decision's call is counted from its own row, not from a second cost row
 * (core-data-normalisation-plan.md §7.1): the nightly totals, today's figures
 * and the Decision Maker's page each count it once, as the cost row was.
 */

beforeEach(() => useMiddayUtc());
afterEach(() => vi.useRealTimers());

function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

const JEV = {
  modelId: "typesafe:jev-latest",
  providerKey: "typesafe",
  providerModelId: "jev-latest",
  displayName: "Jev Latest",
  isEnabled: true,
  isDefault: false,
  // $2 a million in, $4 out.
  standardInputCostBelow200k: 2,
  standardInputCostAbove200k: 2,
  outputResponseCost: 4,
  lastSyncedAt: 1,
};

const usage = (inputTokens: number, outputTokens: number) => ({
  modelId: JEV.modelId, providerKey: JEV.providerKey, providerModelId: JEV.providerModelId, inputTokens, outputTokens,
});

const intent = (answer: string, subjectId: string) => ({
  decisionKey: "seo.keyword-intent", subjectId, answer, mode: "ACT" as const, outcome: "RECORDED" as const, source: "TYPESAFE" as const,
});

async function seed(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) => {
    await ctx.db.insert("aiModels", JEV);
    const companyId = await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", { email: "root@example.com", role: "SUPER_ADMIN" });
    return { companyId, superAdminId };
  });
}

/** Two requests: one judging one search, one judging two — three Decisions, two calls. */
async function decide(t: ReturnType<typeof setup>, companyId: Awaited<ReturnType<typeof seed>>["companyId"]) {
  await t.mutation(internal.decisionRuns.recordRunsInternal, {
    companyId, subjectKind: "seo-keywords", subjectId: "pull-1",
    usage: usage(1_000_000, 0), runs: [intent("buying", "door handles")],
  });
  await t.mutation(internal.decisionRuns.recordRunsInternal, {
    companyId, subjectKind: "seo-keywords", subjectId: "pull-1",
    usage: usage(0, 500_000), runs: [intent("researching", "what is a lever handle"), intent("branded", "morehandles")],
  });
}

describe("Decision calls on the cost ledger", () => {
  test("the shares of a call add up to it, and only the runs a model answered share it", async () => {
    const t = setup();
    const { companyId } = await seed(t);
    await t.mutation(internal.decisionRuns.recordRunsInternal, {
      companyId, subjectKind: "email", subjectId: "gmail-1",
      usage: usage(1_000_000, 0),
      runs: [
        { decisionKey: "mailbox.message-kind", answer: "customer", mode: "OFF", outcome: "RECORDED", source: "RULES", fallbackReason: "MODE_OFF" },
        { decisionKey: "mailbox.urgent", answer: "no", mode: "ACT", outcome: "RECORDED", source: "TYPESAFE" },
      ],
    });
    const runs = await t.run(async (ctx) => ctx.db.query("decisionRuns").collect());
    expect(runs.map((run) => [run.source, run.costUsd, run.model])).toEqual([
      ["RULES", 0, undefined],
      ["TYPESAFE", 2, "typesafe:jev-latest"],
    ]);
  });

  test("the nightly totals count each call once, charged to the Decision Maker", async () => {
    const t = setup();
    const { companyId } = await seed(t);
    vi.setSystemTime(Date.UTC(2026, 4, 2, 9));
    await decide(t, companyId);

    await t.action(internal.analyticsSnapshots.generateDailySnapshots, { targetDateStr: "2026-05-02" });
    const snapshots = await t.run(async (ctx) => ctx.db.query("analyticsDailySnapshots").collect());
    const global = snapshots.find((row) => row.type === "global")!;
    // $2 for the first call's million in, $2 for the second's half-million out.
    expect(global.metrics).toMatchObject({ totalMessages: 2, totalInputTokens: 1_000_000, totalOutputTokens: 500_000, costUsd: 4 });
    expect(global.leaderboards?.topAgents).toEqual([expect.objectContaining({ name: "The Decision Maker", interactions: 2, cost: 4 })]);
    expect(snapshots.find((row) => row.type === "company")?.metrics).toMatchObject({ totalMessages: 2, costUsd: 4 });
  });

  test("today's figures count each call once", async () => {
    const t = setup();
    const { companyId, superAdminId } = await seed(t);
    await decide(t, companyId);

    const today = await t.withIdentity({ subject: superAdminId }).query(api.analytics.getGlobalAnalytics, { timeframe: "today" });
    expect(today.aggregates).toMatchObject({ totalMessages: 2, totalInputTokens: 1_000_000, totalOutputTokens: 500_000, totalCostUsd: 4 });
    expect(today.topAgents.find((agent) => agent.name === "The Decision Maker")).toMatchObject({ interactions: 2, cost: 4 });

    const company = await t.withIdentity({ subject: superAdminId }).query(api.analytics.getCompanyMetrics, { companyId, timeframe: "today" });
    expect(company.aggregates).toMatchObject({ totalMessages: 2, totalCostUsd: 4 });
  });

  test("the Decision Maker's page lists its calls, each at its whole cost", async () => {
    const t = setup();
    const { companyId, superAdminId } = await seed(t);
    await decide(t, companyId);
    const agentId = await t.mutation(internal.decisionRuns.ensureDecisionAgentInternal, {});
    const client = t.withIdentity({ subject: superAdminId });

    const page = await client.query(api.agentTransactions.getForAgent, { agentId, paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.map((row) => [row.actionContext, row.inputTokens, row.outputTokens, row.costUsd])).toEqual([
      ["decision:seo.keyword-intent", 0, 500_000, 2],
      ["decision:seo.keyword-intent", 1_000_000, 0, 2],
    ]);
    expect(await client.query(api.agentTransactions.getStatsForAgent, { agentId })).toEqual({
      totalGenerations: 2, totalTokensIngested: 1_500_000, totalInputTokens: 1_000_000, totalOutputTokens: 500_000, totalOpexCost: 4,
    });
  });

  test("the one-off move puts each cost row's call on its first Decision, and leaves what it cannot match", async () => {
    const t = setup();
    const { companyId } = await seed(t);
    await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: "The Decision Maker", systemKey: "DECISION_MAKER", modelId: "decision", thinkingMode: false, isActive: true, isGlobal: true, createdAt: 1, updatedAt: 1,
      });
      const collector = await ctx.db.insert("agents", { name: "Collector", modelId: "m", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 });
      const at = 1_790_000_000_000;
      const cost = (createdAt: number, actionContext: string, inputTokens: number) => ({
        agentId, companyId, actionContext, modelUsed: JEV.modelId, providerKey: "typesafe", providerModelId: "jev-latest",
        inputTokens, outputTokens: 7, costUsd: 0.01, status: "SUCCESS" as const, createdAt,
      });
      const run = (createdAt: number, decisionKey: string, source: "TYPESAFE" | "RULES") => ({
        decisionKey, companyId, subjectKind: "seo-keywords", subjectId: "s", answer: "buying", mode: "ACT" as const,
        outcome: "RECORDED" as const, source, costUsd: 0.01, createdAt,
      });
      await ctx.db.insert("agentTransactions", cost(at, "decision:seo.keyword-intent", 100));
      await ctx.db.insert("decisionRuns", run(at, "seo.keyword-intent", "RULES"));
      await ctx.db.insert("decisionRuns", run(at, "seo.keyword-intent", "TYPESAFE"));
      await ctx.db.insert("decisionRuns", run(at, "seo.keyword-intent", "TYPESAFE"));
      // Its Decisions cleared: the cost row stays.
      await ctx.db.insert("agentTransactions", cost(at + 1, "decision:seo.page-type", 200));
      // Another agent's cost row is not the Decision Maker's.
      await ctx.db.insert("agentTransactions", { ...cost(at, "dataforseo:serp", 0), agentId: collector });
    });

    const result = await t.run(async (ctx) => moveDecisionCalls(ctx, null, 100));
    expect(result).toMatchObject({ isDone: true, processed: 2, updated: 1 });
    await t.run(async (ctx) => {
      const runs = await ctx.db.query("decisionRuns").collect();
      expect(runs.map((row) => [row.source, row.model, row.inputTokens, row.outputTokens])).toEqual([
        ["RULES", undefined, undefined, undefined],
        ["TYPESAFE", "typesafe:jev-latest", 100, 7],
        ["TYPESAFE", undefined, undefined, undefined],
      ]);
      const left = await ctx.db.query("agentTransactions").collect();
      expect(left.map((row) => row.actionContext).sort()).toEqual(["dataforseo:serp", "decision:seo.page-type"]);
    });
  });
});
