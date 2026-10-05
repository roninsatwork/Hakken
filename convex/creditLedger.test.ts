import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { creditAssistantReply, creditCycleFinished, creditCycleLine, creditCycleLineDropped, creditPullSettled, creditResearchRun } from "./creditHooks";
import { chargeCreditsNow, creditBalance, ensurePlanBatch } from "./creditLedger";
import { creditUnitsOfRequest, creditsForUnits, creditKindOfFamily } from "./creditKinds";

/**
 * The credit ledger, step 1 of docs/plans/active/usage-credits-plan.md:
 * every charge recorded with its real cost, nothing refused.
 */

const modules = import.meta.glob("./**/*.*s");
type Ctx = MutationCtx;
const asCtx = (ctx: unknown) => ctx as Ctx;

async function seedCompany(ctx: Ctx, name: string) {
  return await ctx.db.insert("companies", { name, createdAt: Date.now() });
}

async function seedCycle(ctx: Ctx, companyId: Id<"companies">): Promise<Doc<"seoCollectionCycles">> {
  const id = await ctx.db.insert("seoCollectionCycles", {
    companyId,
    trigger: "SCHEDULE",
    status: "SENDING",
    plannedCount: 0,
    reusedCount: 0,
    sentCount: 0,
    readyCount: 0,
    failedCount: 0,
    totalCostUsd: 0,
    startedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

async function seedPull(ctx: Ctx, args: {
  operationId: string;
  family: string;
  taskArgs: Record<string, unknown>;
  companyId?: Id<"companies">;
  cycleId?: Id<"seoCollectionCycles">;
  status?: Doc<"seoDataPulls">["status"];
  costUsd?: number;
  agentRunId?: Id<"agentRuns">;
}): Promise<Doc<"seoDataPulls">> {
  const id = await ctx.db.insert("seoDataPulls", {
    operationId: args.operationId,
    family: args.family,
    mode: "QUEUED",
    taskArgsJson: JSON.stringify(args.taskArgs),
    status: args.status ?? "PENDING",
    tag: `tag-${Math.random()}`,
    costUsd: args.costUsd ?? 0,
    sandbox: false,
    submittedAt: Date.now(),
    ...(args.companyId ? { companyId: args.companyId } : {}),
    ...(args.cycleId ? { cycleId: args.cycleId } : {}),
    ...(args.agentRunId ? { agentRunId: args.agentRunId } : {}),
  });
  return (await ctx.db.get(id))!;
}

/** A plan line, as `seoCollection.ts` writes one, and its charge. */
async function planLine(ctx: Ctx, cycle: Doc<"seoCollectionCycles">, websiteId: Id<"websites">, pull: Doc<"seoDataPulls">, reused: boolean) {
  const lineId = await ctx.db.insert("seoCycleLines", {
    cycleId: cycle._id, companyId: cycle.companyId, websiteId, operationId: pull.operationId, pullId: pull._id, reused, createdAt: Date.now(),
  });
  await creditCycleLine(ctx, cycle, websiteId, pull, reused);
  return (await ctx.db.get(lineId))!;
}

async function statement(ctx: Ctx, companyId: Id<"companies">) {
  return await ctx.db.query("creditCharges").withIndex("by_company_at", (q) => q.eq("companyId", companyId)).collect();
}

describe("credit kinds", () => {
  test("every family the collection buys has a kind, and units are counted as the price line counts them", () => {
    expect(["SERP", "DataForSEO Labs", "Keywords Data"].map(creditKindOfFamily)).toEqual(["rankings", "rankings", "rankings"]);
    expect(creditKindOfFamily("AI Optimization")).toBe("aiAnswers");
    expect(creditKindOfFamily("On-Page")).toBe("siteAudit");
    expect(creditKindOfFamily("Backlinks")).toBe("backlinks");
    expect(creditUnitsOfRequest("rankings", JSON.stringify({ limit: 1000 }))).toBe(1000);
    expect(creditUnitsOfRequest("rankings", JSON.stringify({ keywords: ["a", "b", "c"] }))).toBe(3);
    expect(creditUnitsOfRequest("siteAudit", JSON.stringify({ max_crawl_pages: 1240 }))).toBe(1240);
    expect(creditUnitsOfRequest("aiAnswers", JSON.stringify({ limit: 50 }))).toBe(1);
    expect(creditUnitsOfRequest("backlinks", "not json")).toBe(1);
  });

  test("credits round up once per run, and nothing is never charged", () => {
    expect(creditsForUnits({ credits: 4, per: 1000 }, 1)).toBe(1);
    expect(creditsForUnits({ credits: 4, per: 1000 }, 1000)).toBe(4);
    expect(creditsForUnits({ credits: 4, per: 1000 }, 1001)).toBe(5);
    expect(creditsForUnits({ credits: 1, per: 50 }, 1240)).toBe(25);
    expect(creditsForUnits({ credits: 4, per: 1000 }, 0)).toBe(0);
  });
});

describe("a collection's charges", () => {
  test("one charge per website and kind, at the full price whether bought or shared; failures come off", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const rival = await seedCompany(ctx, "Rival");
      const websiteId = await ctx.db.insert("websites", { host: "example.com", displayHost: "example.com", firstSeenAt: Date.now() });
      const acmeRun = await seedCycle(ctx, acme);
      const rivalRun = await seedCycle(ctx, rival);

      // Acme buys two keyword checks; the ranked keywords list was bought by Rival last week.
      const check = await seedPull(ctx, { operationId: "serp_google_organic", family: "SERP", taskArgs: { keyword: "a" }, companyId: acme, cycleId: acmeRun._id });
      const failing = await seedPull(ctx, { operationId: "serp_google_organic", family: "SERP", taskArgs: { keyword: "b" }, companyId: acme, cycleId: acmeRun._id });
      const list = await seedPull(ctx, { operationId: "domain_ranked_keywords", family: "DataForSEO Labs", taskArgs: { limit: 1000 }, companyId: rival, status: "READY", costUsd: 0.12 });
      await planLine(ctx, acmeRun, websiteId, check, false);
      await planLine(ctx, acmeRun, websiteId, failing, false);
      await planLine(ctx, acmeRun, websiteId, list, true);
      // Rival's run is served by Acme's check while it is still on its way.
      await planLine(ctx, rivalRun, websiteId, check, true);

      await creditPullSettled(ctx, check, "READY", 0.002);
      await creditPullSettled(ctx, failing, "FAILED", 0);
      await creditCycleFinished(ctx, acmeRun._id);
      await creditCycleFinished(ctx, rivalRun._id);

      const acmeLines = await statement(ctx, acme);
      expect(acmeLines.map((line) => line.entry)).toEqual(["grant", "charge"]);
      const acmeCharge = acmeLines[1];
      expect(acmeCharge).toMatchObject({
        kind: "rankings", state: "charged", how: "scheduled", websiteId,
        units: 1001, lines: 3, failedUnits: 1, creditsOut: 5, owed: 0, balanceAfter: 995,
        realCostUsd: 0.002, reusedValueUsd: 0.12,
      });
      expect(acmeLines[0]).toMatchObject({ entry: "grant", creditsIn: 1000, source: "plan" });

      const [, rivalCharge] = await statement(ctx, rival);
      expect(rivalCharge).toMatchObject({ units: 1, creditsOut: 1, realCostUsd: 0, reusedValueUsd: 0.002, balanceAfter: 999 });

      const rollups = await ctx.db.query("creditMonthRollups").withIndex("by_company_month", (q) => q.eq("companyId", acme)).collect();
      expect(rollups).toEqual([expect.objectContaining({ kind: "rankings", websiteKey: websiteId, credits: 5, runs: 1, realCostUsd: 0.002 })]);
      const days = await ctx.db.query("creditDayTotals").withIndex("by_company_day", (q) => q.eq("companyId", acme)).collect();
      expect(days).toEqual([expect.objectContaining({ credits: 5, byHand: 0 })]);
    });
  });

  test("a line dropped when a run is closed by hand is never charged, and a run with nothing left is void", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const websiteId = await ctx.db.insert("websites", { host: "example.com", displayHost: "example.com", firstSeenAt: Date.now() });
      const run = await seedCycle(ctx, acme);
      const crawl = await seedPull(ctx, { operationId: "site_crawl", family: "On-Page", taskArgs: { max_crawl_pages: 500 }, companyId: acme, cycleId: run._id });
      const line = await planLine(ctx, run, websiteId, crawl, false);
      await creditCycleLineDropped(ctx, line, crawl._id);
      await creditCycleFinished(ctx, run._id);

      const lines = await statement(ctx, acme);
      expect(lines).toEqual([expect.objectContaining({ entry: "charge", state: "void", units: 0, creditsOut: 0 })]);
    });
  });
});

describe("batches", () => {
  test("plan credits are used before a top-up, and what none can cover is owed", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const now = Date.now();
      const acme = await seedCompany(ctx, "Acme");
      await ctx.db.insert("creditSettings", { key: "platform", planCredits: 10, creditCoversUsd: 0.05, updatedAt: now });
      await ensurePlanBatch(ctx, acme, now);
      const topUp = await ctx.db.insert("creditBatches", {
        companyId: acme, source: "topup", granted: 20, left: 20, startsAt: now, endsAt: now + 365 * 86_400_000, state: "open", createdAt: now,
      });

      // Keyword research at 5 a keyword: three keywords is 15 credits.
      await chargeCreditsNow(ctx, { companyId: acme, kind: "keywordResearch", runKey: "research:one", how: "byHand" }, 3, {}, now);
      const [first] = (await statement(ctx, acme)).filter((line) => line.entry === "charge");
      expect(first.paidFrom.map((part) => part.credits)).toEqual([10, 5]);
      expect(first.paidFrom[1].batchId).toBe(topUp);
      expect(first.balanceAfter).toBe(15);

      await chargeCreditsNow(ctx, { companyId: acme, kind: "keywordResearch", runKey: "research:two", how: "byHand" }, 4, {}, now);
      const second = (await statement(ctx, acme)).filter((line) => line.entry === "charge")[1];
      expect(second).toMatchObject({ creditsOut: 20, owed: 5, balanceAfter: -5 });
      expect(await creditBalance(ctx, acme)).toBe(-5);
    });
  });

  test("a month's plan credits end with it, written off as their own line, and the next month's are granted", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const october = Date.UTC(2026, 9, 20, 9);
      await chargeCreditsNow(ctx, { companyId: acme, kind: "assistant", runKey: "message:one", how: "byHand" }, 1, {}, october);

      const november = Date.UTC(2026, 10, 1, 0, 5);
      await ensurePlanBatch(ctx, acme, november);
      const lines = await statement(ctx, acme);
      expect(lines.map((line) => [line.entry, line.creditsIn, line.creditsOut, line.at])).toEqual([
        ["grant", 1000, 0, Date.UTC(2026, 9, 1)],
        ["charge", 0, 1, october],
        ["ended", 0, 999, Date.UTC(2026, 10, 1)],
        ["grant", 1000, 0, Date.UTC(2026, 10, 1)],
      ]);
      expect(await creditBalance(ctx, acme)).toBe(1000);
    });
  });

  test("a request that fails after it was charged gives its credits back", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const pull = await seedPull(ctx, { operationId: "serp_google_organic", family: "SERP", taskArgs: { keyword: "a" }, companyId: acme });
      await creditPullSettled(ctx, pull, "SUBMITTED", 0.01);
      expect(await creditBalance(ctx, acme)).toBe(999);
      await creditPullSettled(ctx, pull, "FAILED", 0);
      const lines = await statement(ctx, acme);
      expect(lines.map((line) => line.entry)).toEqual(["grant", "charge", "refund"]);
      expect(lines[2]).toMatchObject({ creditsIn: 1, refundOf: lines[1]._id, balanceAfter: 1000 });
      expect(lines[1].realCostUsd).toBe(0.01);
    });
  });
});

describe("lookups and questions", () => {
  test("a lookup is charged by the keyword, and its calls add what they cost", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const userId = await ctx.db.insert("users", { email: "priya@example.com", role: "ADMIN", companyId: acme });
      const agentId = await ctx.db.insert("agents", {
        name: "Keyword research", modelId: "test-model", thinkingMode: false, isActive: true, temperature: 1, humanApprovalRequired: false, createdAt: Date.now(), updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", { agentId, triggerType: "MANUAL", objective: "Look up", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now() });
      await creditResearchRun(ctx, { companyId: acme, userId, runId, keywords: ["web design leeds", "web design york", "web design leeds"] });
      const call = await seedPull(ctx, { operationId: "research_keyword_overview", family: "DataForSEO Labs", taskArgs: { keywords: ["web design leeds"] }, companyId: acme, agentRunId: runId });
      await creditPullSettled(ctx, call, "READY", 0.03);

      const [, charge] = await statement(ctx, acme);
      expect(charge).toMatchObject({
        kind: "keywordResearch", how: "byHand", userId, units: 2, creditsOut: 10, realCostUsd: 0.03,
        detail: "“web design leeds”, “web design york”",
      });
    });
  });

  test("an Ask Hakken reply is one question, charged with what it cost; an evaluation's is not", async () => {
    const t = convexTest(schema, modules);
    const { acme, threadId, evalThreadId } = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const userId = await ctx.db.insert("users", { email: "anthony@example.com", role: "ADMIN", companyId: acme });
      await ctx.db.insert("aiModels", {
        modelId: "test-model", displayName: "Test", isEnabled: true, isDefault: true, lastSyncedAt: Date.now(),
        standardInputCostBelow200k: 3, outputResponseCost: 15,
      });
      const threadId = await ctx.db.insert("threads", { userId, companyId: acme, createdAt: Date.now(), updatedAt: Date.now() });
      const evalThreadId = await ctx.db.insert("threads", { userId, companyId: acme, purpose: "EVAL", createdAt: Date.now(), updatedAt: Date.now() });
      return { acme, threadId, evalThreadId };
    });

    await t.mutation(internal.chat.saveAssistantMessage, { threadId, content: "Here is what changed.", inputTokens: 1_000_000, outputTokens: 100_000, modelUsed: "test-model" });
    await t.mutation(internal.chat.saveAssistantMessage, { threadId: evalThreadId, content: "Graded.", inputTokens: 10, outputTokens: 10, modelUsed: "test-model" });

    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const charges = (await statement(ctx, acme)).filter((line) => line.entry === "charge");
      expect(charges).toHaveLength(1);
      expect(charges[0]).toMatchObject({ kind: "assistant", units: 1, creditsOut: 1, realCostUsd: 4.5 });
      // A second save of the same reply is not a second question.
      await creditAssistantReply(ctx, await ctx.db.get(threadId), charges[0].messageId!, { inputTokens: 1, outputTokens: 1 });
      expect((await statement(ctx, acme)).filter((line) => line.entry === "charge")).toHaveLength(1);
    });
  });
});
