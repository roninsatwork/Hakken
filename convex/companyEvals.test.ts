import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Company Evals", () => {
  test("creates, lists, runs, summarizes, and archives tenant-scoped eval cases", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, companyAId, companyBId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@example.com",
        role: "ADMIN",
        companyId: companyBId,
      });

      return { adminAId, adminBId, companyAId, companyBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    const evalCaseId = await adminAClient.mutation(api.companyEvals.createCase, {
      companyId: companyAId,
      name: "Widget does not invent pricing",
      category: "NO_HALLUCINATION",
      severity: "BLOCKER",
      targetSurface: "WIDGET",
      prompt: "What is the price for the enterprise plan?",
      expectedBehavior: "The answer should say it does not know unless pricing is in approved context.",
      forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
      expectedModelUseCase: "chat",
    });

    await expect(
      adminBClient.query(api.companyEvals.getCasesForCompany, {
        companyId: companyAId,
        paginationOpts,
      })
    ).rejects.toThrow("Unauthorized");

    const page = await adminAClient.query(api.companyEvals.getCasesForCompany, {
      companyId: companyAId,
      status: "ACTIVE",
      paginationOpts,
    });
    expect(page.page.map((evalCase) => evalCase._id)).toEqual([evalCaseId]);

    const failedRun = await adminAClient.mutation(api.companyEvals.runCase, {
      evalCaseId,
      answer: "Enterprise is free for everyone.",
      resolvedUseCase: "report",
      resolvedModelId: "wrong-model",
    });
    expect(failedRun).toMatchObject({
      status: "FAILED",
      score: 0,
    });

    const failedSummary = await adminAClient.query(api.companyEvals.getSummary, { companyId: companyAId });
    expect(failedSummary).toMatchObject({
      totalCases: 1,
      blockerCases: 1,
      latestRuns: 1,
      failedRuns: 1,
      blockerFailures: 1,
      blockerNotRun: 0,
    });

    const passedRun = await adminAClient.mutation(api.companyEvals.runCase, {
      evalCaseId,
      answer: "I do not have approved pricing context for the enterprise plan.",
      resolvedUseCase: "chat",
      resolvedModelId: "safe-chat-model",
    });
    expect(passedRun).toMatchObject({
      status: "PASSED",
      score: 1,
    });

    const runs = await adminAClient.query(api.companyEvals.getRunsForCase, { evalCaseId });
    expect(runs.map((run) => run.status)).toEqual(["PASSED", "FAILED"]);

    const passedSummary = await adminAClient.query(api.companyEvals.getSummary, { companyId: companyAId });
    expect(passedSummary).toMatchObject({
      passedRuns: 1,
      failedRuns: 0,
      blockerFailures: 0,
      passRate: 1,
    });

    await adminAClient.mutation(api.companyEvals.archiveCase, { evalCaseId });
    const archivedSummary = await adminAClient.query(api.companyEvals.getSummary, { companyId: companyAId });
    expect(archivedSummary.totalCases).toBe(0);

    const auditLogs = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").withIndex("by_company", (q) => q.eq("companyId", companyAId)).order("asc").collect()
    );
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_COMPANY_EVAL_CASE",
      "RUN_COMPANY_EVAL_CASE",
      "RUN_COMPANY_EVAL_CASE",
      "ARCHIVE_COMPANY_EVAL_CASE",
    ]);
    expect(companyBId).not.toBe(companyAId);
  });

  test("deterministic run checks source, memory, skill, and forbidden claim evidence", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Evidence Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const evalCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Uses required context",
      category: "MEMORY_USAGE",
      severity: "WARNING",
      targetSurface: "COMPANY_CHAT",
      prompt: "Summarize the escalation policy.",
      expectedBehavior: "Use the required evidence.",
      requiredSourcesJson: JSON.stringify(["source-1"]),
      requiredMemoriesJson: JSON.stringify(["memory-1"]),
      requiredSkillsJson: JSON.stringify(["skill-1"]),
      forbiddenClaimsJson: JSON.stringify(["call the old hotline"]),
    });

    const run = await adminClient.mutation(api.companyEvals.runCase, {
      evalCaseId,
      answer: "Use the current escalation policy.",
      evidenceJson: JSON.stringify({
        sourceIds: ["source-1"],
        memoryIds: ["memory-1"],
        skillIds: ["skill-1"],
      }),
    });

    expect(run.status).toBe("PASSED");
    expect(run.deterministicResults).toHaveLength(4);
    expect(run.deterministicResults.every((result) => result.passed)).toBe(true);

    await expect(
      adminClient.mutation(api.companyEvals.createCase, {
        companyId,
        name: "Bad JSON",
        category: "MEMORY_USAGE",
        severity: "WARNING",
        targetSurface: "COMPANY_CHAT",
        prompt: "Prompt",
        expectedBehavior: "Expected",
        requiredSourcesJson: JSON.stringify({ source: "source-1" }),
      })
    ).rejects.toThrow("Required sources must be a JSON array of strings.");
  });

  test("runs active eval cases in batches and skips already passing cases", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Batch Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "batch-admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const passingCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Does not invent pricing",
      category: "NO_HALLUCINATION",
      severity: "BLOCKER",
      targetSurface: "WIDGET",
      prompt: "What is the enterprise price?",
      expectedBehavior: "Say pricing is not available without approved context.",
      forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
    });
    const failingCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Requires source evidence",
      category: "KNOWLEDGE_RETRIEVAL",
      severity: "WARNING",
      targetSurface: "COMPANY_CHAT",
      prompt: "Summarize the source policy.",
      expectedBehavior: "Use the required source.",
      requiredSourcesJson: JSON.stringify(["source-missing"]),
    });
    const reviewCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Needs judge",
      category: "BRAND_TONE",
      severity: "ADVISORY",
      targetSurface: "COMPANY_CHAT",
      prompt: "Write a friendly answer.",
      expectedBehavior: "Tone needs human review.",
    });

    const allBatch = await adminClient.mutation(api.companyEvals.runBatch, {
      companyId,
      mode: "ALL",
    });
    expect(allBatch).toMatchObject({
      selected: 3,
      passed: 1,
      failed: 1,
      needsReview: 1,
    });

    const latestRuns = await adminClient.query(api.companyEvals.getLatestRunsForCompany, { companyId });
    expect(latestRuns).toHaveLength(3);
    expect(latestRuns.find((run) => run.evalCaseId === passingCaseId)?.status).toBe("PASSED");
    expect(latestRuns.find((run) => run.evalCaseId === failingCaseId)?.status).toBe("FAILED");
    expect(latestRuns.find((run) => run.evalCaseId === reviewCaseId)?.status).toBe("NEEDS_REVIEW");

    const rerunBatch = await adminClient.mutation(api.companyEvals.runBatch, {
      companyId,
      mode: "FAILED_OR_NOT_RUN",
    });
    expect(rerunBatch).toMatchObject({
      selected: 2,
      passed: 0,
      failed: 1,
      needsReview: 1,
    });

    const summary = await adminClient.query(api.companyEvals.getSummary, { companyId });
    expect(summary).toMatchObject({
      totalCases: 3,
      latestRuns: 3,
      passedRuns: 1,
      failedRuns: 1,
      needsReviewRuns: 1,
      notRunCases: 0,
      failedOrNotRunCases: 2,
    });
  });
});
