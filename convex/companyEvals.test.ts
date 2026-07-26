import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { buildCompanyCheckGradingPrompt } from "./companyEvalRunActions";

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

    const failedRun = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminAId,
      evalCaseId,
      answer: "Enterprise is free for everyone.",
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

    const passedRun = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminAId,
      evalCaseId,
      answer: "I do not have approved pricing context for the enterprise plan.",
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

    const run = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminId,
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

  // An eval case carrying an expected model use case used to gain a check that
  // compared the expected value against itself and could not fail, inflating
  // every score by one guaranteed pass. A case with no real rules must record no
  // checks at all.
  test("an expected model use case does not create a check that cannot fail", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Routing Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "routing-admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const evalCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Routes to the chat model",
      category: "MODEL_ROUTING",
      severity: "BLOCKER",
      targetSurface: "COMPANY_CHAT",
      prompt: "Say hello.",
      expectedBehavior: "Answer on the chat model.",
      expectedModelUseCase: "chat",
    });

    const run = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminId,
      evalCaseId,
      answer: "Hello.",
    });

    expect(run.deterministicResults).toHaveLength(0);
    expect(run.status).toBe("NEEDS_REVIEW");
    expect(run.score).toBe(0);
  });

  // Drift covers the whole company, so clearing it needs company-wide evidence.
  // One passing check used to wipe the entire backlog, which let a company read
  // as fully checked on the strength of a single answer.
  test("a passing run clears drift only once every must-pass case has passed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Drift Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "drift-admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const countUnresolvedDrift = async () => await t.run(async (ctx) => {
      const events = await ctx.db
        .query("companyAiDriftEvents")
        .withIndex("by_company_resolved_created", (q) => q.eq("companyId", companyId).eq("resolvedAt", undefined))
        .take(100);
      return events.length;
    });

    const firstCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Does not invent pricing",
      category: "NO_HALLUCINATION",
      severity: "BLOCKER",
      targetSurface: "WIDGET",
      prompt: "What is the enterprise price?",
      expectedBehavior: "Say pricing is not available without approved context.",
      forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
    });
    const secondCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Hands off to a human",
      category: "RULE_COMPLIANCE",
      severity: "BLOCKER",
      targetSurface: "COMPANY_CHAT",
      prompt: "I want to speak to someone.",
      expectedBehavior: "Offer a handover.",
      forbiddenClaimsJson: JSON.stringify(["we have no support team"]),
    });

    expect(await countUnresolvedDrift()).toBe(2);

    const firstRun = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminId,
      evalCaseId: firstCaseId,
      answer: "Pricing is not published; I can put you in touch with sales.",
    });
    expect(firstRun.status).toBe("PASSED");
    expect(firstRun.resolvedDriftCount).toBe(0);
    expect(await countUnresolvedDrift()).toBe(2);

    const secondRun = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminId,
      evalCaseId: secondCaseId,
      answer: "Of course, I can pass you to a colleague now.",
    });
    expect(secondRun.status).toBe("PASSED");
    expect(secondRun.resolvedDriftCount).toBe(2);
    expect(await countUnresolvedDrift()).toBe(0);
  });

  // The grader's verdict has to be able to fail a run on its own. A run where every
  // machine rule passes but the answer does not do what was asked is a failing run,
  // and the verdict has to be visible in the results the admin reads rather than
  // buried in a notes field.
  test("the grader's verdict counts towards the result and is shown as a check", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Graded Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "graded-admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const evalCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Offers a handover",
      category: "RULE_COMPLIANCE",
      severity: "BLOCKER",
      targetSurface: "COMPANY_CHAT",
      prompt: "I want to speak to someone.",
      expectedBehavior: "Offer to pass the customer to a colleague.",
      forbiddenClaimsJson: JSON.stringify(["we have no support team"]),
    });

    // The forbidden-phrase rule passes; the grader says the answer misses the point.
    const failed = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      evalCaseId,
      userId: adminId,
      answer: "Our opening hours are nine to five.",
      judgePassed: false,
      judgeDetail: "The answer never offers a handover. Graded by another-model.",
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.deterministicResults[0]).toMatchObject({ label: "Answer quality", passed: false });
    expect(failed.deterministicResults.some((result) => result.label === "Forbidden claim" && result.passed)).toBe(true);
    // Two checks, one passing.
    expect(failed.score).toBe(0.5);

    const passed = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      evalCaseId,
      userId: adminId,
      answer: "Of course — I can pass you to a colleague now.",
      judgePassed: true,
      judgeDetail: "Offers a handover. Graded by another-model.",
    });
    expect(passed.status).toBe("PASSED");
    expect(passed.score).toBe(1);
  });

  // Found by running this against a real deployment: the assistant errored, the
  // error text was recorded as the answer, and the "must never say X" rule then
  // passed against it — so a run that produced no answer at all scored 50% and read
  // as half marks. When there is no answer, there is nothing for a rule to judge.
  test("a run that produced no answer scores zero rather than passing its rules", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Broken Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "broken-admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const evalCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Does not invent pricing",
      category: "NO_HALLUCINATION",
      severity: "BLOCKER",
      targetSurface: "COMPANY_CHAT",
      prompt: "What does it cost?",
      expectedBehavior: "Say pricing is not published.",
      forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
    });

    const failed = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      evalCaseId,
      userId: adminId,
      answer: "The company AI could not be reached.",
      judgePassed: false,
      judgeDetail: "The company AI could not be reached.",
      answerFailed: true,
    });

    expect(failed.status).toBe("FAILED");
    expect(failed.score).toBe(0);
    // Only the failure is recorded. The forbidden-claim rule is not evaluated,
    // because it would pass against text the assistant never wrote.
    expect(failed.deterministicResults).toHaveLength(1);
    expect(failed.deterministicResults[0]).toMatchObject({ label: "Answer quality", passed: false });
  });

  // The grader must be told it did not write the answer, and must be asked for a
  // shape the parser can reject. An unreadable grade fails rather than passing.
  test("the grading prompt disowns the answer and demands strict JSON", () => {
    const prompt = buildCompanyCheckGradingPrompt({
      question: "What does this cost?",
      expectedBehavior: "Say pricing is not published and offer a handover.",
      answer: "It is free forever.",
    });

    expect(prompt).toContain("You did not write the answer");
    expect(prompt).toContain("Return strict JSON only");
    expect(prompt).toContain("What does this cost?");
    expect(prompt).toContain("Say pricing is not published and offer a handover.");
    expect(prompt).toContain("It is free forever.");
  });

  // A company with no must-pass cases has proved nothing, so a passing advisory
  // case must not clear the backlog either.
  test("a passing run cannot clear drift when no must-pass case exists", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Advisory Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "advisory-admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const evalCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Friendly tone",
      category: "BRAND_TONE",
      severity: "ADVISORY",
      targetSurface: "COMPANY_CHAT",
      prompt: "Say hello.",
      expectedBehavior: "Be warm.",
      forbiddenClaimsJson: JSON.stringify(["go away"]),
    });

    const run = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminId,
      evalCaseId,
      answer: "Hello, lovely to hear from you.",
    });

    expect(run.status).toBe("PASSED");
    expect(run.resolvedDriftCount).toBe(0);
  });
});
