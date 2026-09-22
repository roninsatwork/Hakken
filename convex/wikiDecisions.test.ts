import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * The wiki's Decisions (decisions-typesafe-plan.md, Phases E and F.2–F.4):
 * a staff round files its Decision runs under its agent run, the run page
 * and the agent overview can read them, and the real-question Decision
 * corrects the Unanswered list only when it is sure the rule was wrong.
 */
function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function seedCompanyAndAdmins(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", { email: "owner@ronins.co.uk", role: "SUPER_ADMIN" });
    const adminId = await ctx.db.insert("users", { email: "admin@comax.test", role: "ADMIN", companyId });
    return { companyId, superAdminId, adminId };
  });
}

/** A chosen model for the Decisions job and a mode, as the mailbox tests seed them. */
async function switchOn(t: ReturnType<typeof setup>, decisionKey: string, mode: "ASK_A_PERSON" | "ACT") {
  vi.stubEnv("TYPESAFE_API_KEY", "typesafe-test-key");
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("aiProviders", { providerKey: "typesafe", displayName: "TypeSafe", isEnabled: true, authMode: "environment", status: "healthy", createdAt: now, updatedAt: now });
    await ctx.db.insert("aiModels", { modelId: "typesafe:jev-latest", providerKey: "typesafe", providerModelId: "jev-latest", displayName: "Jev Latest", isEnabled: true, isDefault: false, capabilities: ["decision"], supportedUseCases: ["decision"], lastSyncedAt: now });
    await ctx.db.insert("aiModelDefaults", { scope: "global", useCase: "decision", providerKey: "typesafe", modelId: "typesafe:jev-latest", updatedAt: now });
    await ctx.db.insert("decisionSettings", { scope: "global", decisionKey, mode, updatedAt: now });
  });
}

function stubTypesafeYesNo(noul: number) {
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { questions: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(body.questions).map((key) => [key, { type: "noul", noul }]));
    return Response.json({ model: "jev-latest", answers, usage: { input_tokens: 30, output_tokens: 5 } });
  }));
}

describe("a staff round files its Decision runs under its agent run", () => {
  test("recordStaffRunInternal adopts the round's runs by time and key, and the run page reads them", async () => {
    const t = setup();
    const { companyId, superAdminId, adminId } = await seedCompanyAndAdmins(t);
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    const startedAt = Date.now() - 60_000;
    await t.run(async (ctx) => {
      const base = { companyId, subjectKind: "wikiPage", answer: "no", mode: "ACT" as const, outcome: "ACTED" as const, source: "TYPESAFE" as const, costUsd: 0.01 };
      // This round's freshness run, and a mailbox run from the same window that is not the Checker's.
      await ctx.db.insert("decisionRuns", { ...base, decisionKey: "wiki.claim-supported", subjectId: "POLICY:refunds", certainty: "SURE", createdAt: startedAt + 1000 });
      await ctx.db.insert("decisionRuns", { ...base, decisionKey: "mailbox.urgent", subjectId: "gmail-1", createdAt: startedAt + 1000 });
      // An older freshness run from a previous round.
      await ctx.db.insert("decisionRuns", { ...base, decisionKey: "wiki.claim-supported", subjectId: "POLICY:old", createdAt: startedAt - 60_000 });
    });

    await t.mutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_FRESHNESS_CHECKER",
      companyId,
      trigger: "SCHEDULE",
      objective: "Re-check aging pages against their kept source documents.",
      summary: "Verified 0 pages; raised 1 freshness questions.",
      startedAt,
    });

    const { runId, filed } = await t.run(async (ctx) => {
      const run = (await ctx.db.query("agentRuns").collect())[0];
      const rows = await ctx.db.query("decisionRuns").collect();
      return { runId: run._id, filed: rows.filter((row) => row.agentRunId === run._id).map((row) => `${row.decisionKey}:${row.subjectId}`) };
    });
    expect(filed).toEqual(["wiki.claim-supported:POLICY:refunds"]);

    const forRun = await t.withIdentity({ subject: adminId }).query(api.decisions.listForRun, { runId });
    expect(forRun).toHaveLength(1);
    expect(forRun[0]).toMatchObject({ decisionKey: "wiki.claim-supported", copyKey: "wikiClaimSupported", certainty: "SURE", subjectId: "POLICY:refunds" });

    const agentId = await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect())[0].agentId);
    const summary = await t.withIdentity({ subject: superAdminId }).query(api.decisions.summaryForAgent, { agentId, lookbackDays: 7 });
    expect(summary).toMatchObject({ ran: 1, acted: 1, handed: 0, onRules: 0, isPartial: false });
    expect(summary.costUsd).toBeCloseTo(0.01);

    // Agents are shared; their runs are not. Another company's admin sees
    // none of this company's totals (review, 2026-09-18).
    const outsiderId = await t.run(async (ctx) => {
      const otherCompanyId = await ctx.db.insert("companies", { name: "Elsewhere", createdAt: Date.now() });
      return await ctx.db.insert("users", { email: "admin@elsewhere.test", role: "ADMIN", companyId: otherCompanyId });
    });
    const outsiderView = await t.withIdentity({ subject: outsiderId }).query(api.decisions.summaryForAgent, { agentId, lookbackDays: 7 });
    expect(outsiderView).toMatchObject({ ran: 0, costUsd: 0 });
    const ownView = await t.withIdentity({ subject: adminId }).query(api.decisions.summaryForAgent, { agentId, lookbackDays: 7 });
    expect(ownView).toMatchObject({ ran: 1 });
  });
});

describe("the real-question Decision corrects the Unanswered list", () => {
  beforeEach(() => {
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", "x");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("switched off, the greeting rule alone decides and nothing is corrected", async () => {
    const t = setup();
    const { companyId } = await seedCompanyAndAdmins(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("wikiPages", {
        companyId, kind: "POLICY", subjectKey: "refunds", title: "Refunds", content: "How refunds work.",
        links: [], pinnedCorrections: [], rewriteCount: 1, lastRewriteSource: "DOCUMENT:doc-1",
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, { companyId, question: "thanks", pageKeys: [] });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, { companyId, question: "What are your delivery charges to Scotland?", pageKeys: [] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.run(async (ctx) => await ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows.map((row) => row.question)).toEqual(["What are your delivery charges to Scotland?"]);
    const runs = await t.run(async (ctx) => await ctx.db.query("decisionRuns").collect());
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.decisionKey === "wiki.real-question" && run.source === "RULES")).toBe(true);
  });

  test("acting and sure, it logs a real question the rule dropped and dismisses a non-question the rule logged", async () => {
    const t = setup();
    const { companyId } = await seedCompanyAndAdmins(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("wikiPages", {
        companyId, kind: "POLICY", subjectKey: "refunds", title: "Refunds", content: "How refunds work.",
        links: [], pinnedCorrections: [], rewriteCount: 1, lastRewriteSource: "DOCUMENT:doc-1",
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    await switchOn(t, "wiki.real-question", "ACT");

    // "prices?" is too short for the rule, but a real question; the model is sure.
    stubTypesafeYesNo(0.96);
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, { companyId, question: "prices?", pageKeys: [] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    let rows = await t.run(async (ctx) => await ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows.map((row) => [row.question, row.status])).toEqual([["prices?", "OPEN"]]);

    // Long enough for the rule, but not a question; the model is sure.
    stubTypesafeYesNo(0.03);
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, { companyId, question: "testing testing one two three hello there", pageKeys: [] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    rows = await t.run(async (ctx) => await ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows.find((row) => row.question.startsWith("testing"))?.status).toBe("DISMISSED");
  });
});
