import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { DECISION_AGENT_SYSTEM_KEY } from "./decisionRuns";

function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function seedCompany(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now() }),
  );
}

describe("decision modes", () => {
  test("registry default, then the global row, then the company row", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    const key = "mailbox.message-kind";

    expect(await t.query(internal.decisionRuns.resolveModesInternal, { decisionKeys: [key], companyId }))
      .toEqual({ [key]: "OFF" });

    await t.run(async (ctx) => {
      await ctx.db.insert("decisionSettings", { scope: "global", decisionKey: key, mode: "ACT", updatedAt: 1 });
    });
    expect(await t.query(internal.decisionRuns.resolveModesInternal, { decisionKeys: [key], companyId }))
      .toEqual({ [key]: "ACT" });

    await t.run(async (ctx) => {
      await ctx.db.insert("decisionSettings", { scope: "company", companyId, decisionKey: key, mode: "ASK_A_PERSON", updatedAt: 2 });
    });
    expect(await t.query(internal.decisionRuns.resolveModesInternal, { decisionKeys: [key], companyId }))
      .toEqual({ [key]: "ASK_A_PERSON" });
    // Another company still follows the global row.
    expect(await t.query(internal.decisionRuns.resolveModesInternal, { decisionKeys: [key] }))
      .toEqual({ [key]: "ACT" });
  });

  test("an unregistered key is refused, not defaulted", async () => {
    const t = setup();
    await expect(
      t.query(internal.decisionRuns.resolveModesInternal, { decisionKeys: ["nowhere.nothing"] }),
    ).rejects.toThrow(/Unknown decision/);
  });
});

describe("recording runs", () => {
  test("a TypeSafe request writes one cost row, a run per Decision with its share, and audits only what acted", async () => {
    const t = setup();
    const companyId = await seedCompany(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", {
        modelId: "typesafe:jev-latest",
        providerKey: "typesafe",
        providerModelId: "jev-latest",
        displayName: "Jev Latest",
        isEnabled: true,
        isDefault: false,
        // £2 per million in, £4 per million out.
        standardInputCostBelow200k: 2,
        standardInputCostAbove200k: 2,
        outputResponseCost: 4,
        lastSyncedAt: 1,
      });
    });

    const result = await t.mutation(internal.decisionRuns.recordRunsInternal, {
      companyId,
      subjectKind: "email",
      subjectId: "gmail-123",
      usage: { modelId: "typesafe:jev-latest", providerKey: "typesafe", providerModelId: "jev-latest", inputTokens: 500_000, outputTokens: 250_000 },
      runs: [
        {
          decisionKey: "mailbox.message-kind",
          answer: "spam",
          probabilities: JSON.stringify({ spam: 0.9, customer: 0.1 }),
          certainty: "SURE",
          mode: "ACT",
          outcome: "ACTED",
          source: "TYPESAFE",
          action: "skipped the email as spam",
        },
        {
          decisionKey: "mailbox.urgent",
          answer: "no",
          probabilities: JSON.stringify({ yes: 0.1, no: 0.9 }),
          certainty: "SURE",
          mode: "ACT",
          outcome: "RECORDED",
          source: "TYPESAFE",
        },
      ],
    });

    // 0.5M × £2 + 0.25M × £4 = £2.00, split evenly across the two runs.
    expect(result.costUsd).toBeCloseTo(2);
    expect(result.runIds).toHaveLength(2);

    await t.run(async (ctx) => {
      const runs = await ctx.db.query("decisionRuns").collect();
      expect(runs.map((run) => run.costUsd)).toEqual([1, 1]);
      expect(runs.every((run) => run.companyId === companyId && run.subjectKind === "email" && run.subjectId === "gmail-123")).toBe(true);

      const transactions = await ctx.db.query("agentTransactions").collect();
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        actionContext: "decision:mailbox.message-kind,mailbox.urgent",
        providerKey: "typesafe",
        inputTokens: 500_000,
        outputTokens: 250_000,
        costUsd: 2,
        status: "SUCCESS",
      });
      const agent = await ctx.db.get(transactions[0].agentId);
      expect(agent?.systemKey).toBe(DECISION_AGENT_SYSTEM_KEY);

      const audits = await ctx.db.query("auditLogs").collect();
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actionType: "DECISION_ACTED", entityType: "decisions", entityId: "mailbox.message-kind", companyId });
      expect(JSON.parse(audits[0].metadata ?? "{}")).toEqual({
        decision: "Is this email from a customer?",
        answer: "spam",
        certainty: "sure",
        did: "skipped the email as spam",
      });
    });
  });

  test("a rule-answered request writes runs at no cost and no ledger row", async () => {
    const t = setup();
    await t.mutation(internal.decisionRuns.recordRunsInternal, {
      subjectKind: "email",
      subjectId: "gmail-456",
      runs: [
        { decisionKey: "mailbox.message-kind", answer: "customer", mode: "OFF", outcome: "RECORDED", source: "RULES", fallbackReason: "MODE_OFF" },
      ],
    });
    await t.run(async (ctx) => {
      const runs = await ctx.db.query("decisionRuns").collect();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ source: "RULES", fallbackReason: "MODE_OFF", costUsd: 0 });
      expect(runs[0]).not.toHaveProperty("certainty");
      expect(runs[0]).not.toHaveProperty("probabilities");
      expect(await ctx.db.query("agentTransactions").collect()).toHaveLength(0);
      expect(await ctx.db.query("auditLogs").collect()).toHaveLength(0);
    });
  });

  test("the Decision Maker is seeded once", async () => {
    const t = setup();
    const first = await t.mutation(internal.decisionRuns.ensureDecisionAgentInternal, {});
    const second = await t.mutation(internal.decisionRuns.ensureDecisionAgentInternal, {});
    expect(first).toBe(second);
    await t.run(async (ctx) => {
      const agents = await ctx.db.query("agents").collect();
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({ systemKey: DECISION_AGENT_SYSTEM_KEY, isGlobal: true, isActive: true });
    });
  });
});
