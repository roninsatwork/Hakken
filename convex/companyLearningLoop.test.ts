import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Company learning loop", () => {
  test("turns company chat evidence into memory candidates and eval cases", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, companyAId, threadId, assistantMessageId } = await t.run(async (ctx) => {
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
      const threadId = await ctx.db.insert("threads", {
        companyId: companyAId,
        title: "Pricing question",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "Does enterprise include onboarding?",
        createdAt: Date.now(),
        companyId: companyAId,
      });
      const assistantMessageId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Enterprise includes onboarding support, but pricing needs a sales conversation.",
        createdAt: Date.now(),
        companyId: companyAId,
      });

      return { adminAId, adminBId, companyAId, threadId, assistantMessageId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await expect(
      adminBClient.mutation(api.companyLearningLoop.createMemoryCandidateFromChat, {
        companyId: companyAId,
        threadId,
        messageId: assistantMessageId,
        content: "Enterprise includes onboarding support.",
        applyMode: "WHEN_RELEVANT",
      })
    ).rejects.toThrow("Unauthorized");

    const candidateId = await adminAClient.mutation(api.companyLearningLoop.createMemoryCandidateFromChat, {
      companyId: companyAId,
      threadId,
      messageId: assistantMessageId,
      title: "Enterprise onboarding",
      content: "Enterprise includes onboarding support.",
      applyMode: "WHEN_RELEVANT",
      reason: "Repeated useful answer from company chat.",
      confidence: 0.82,
    });
    const evalCaseId = await adminAClient.mutation(api.companyLearningLoop.createEvalCaseFromChat, {
      companyId: companyAId,
      threadId,
      messageId: assistantMessageId,
      name: "Enterprise onboarding answer stays bounded",
      severity: "WARNING",
      targetSurface: "COMPANY_CHAT",
      prompt: "Does enterprise include onboarding?",
      expectedBehavior: "Answer may mention onboarding support but must not invent pricing.",
      forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
    });

    const state = await t.run(async (ctx) => ({
      candidate: await ctx.db.get(candidateId),
      evalCase: await ctx.db.get(evalCaseId),
      auditLogs: await ctx.db.query("auditLogs").withIndex("by_company", (q) => q.eq("companyId", companyAId)).order("asc").collect(),
      driftEvents: await ctx.db.query("companyAiDriftEvents").withIndex("by_company_created", (q) => q.eq("companyId", companyAId)).order("asc").collect(),
    }));

    expect(state.candidate).toMatchObject({
      status: "PROPOSED",
      sourceType: "CHAT",
      sourceIdsJson: JSON.stringify({ source: "company_chat", threadId, messageId: assistantMessageId }),
    });
    expect(state.evalCase).toMatchObject({
      status: "ACTIVE",
      severity: "WARNING",
      targetSurface: "COMPANY_CHAT",
      forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
    });
    // The chat provenance used to be asserted through `fixtureContextJson`, which is
    // retired: it existed only so the deleted batch runner could hand a case's own
    // declarations back to itself as evidence. The audit log below is where the
    // provenance actually lives.
    expect(state.auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_COMPANY_MEMORY_CANDIDATE_FROM_CHAT",
      "CREATE_COMPANY_EVAL_CASE_FROM_CHAT",
    ]);
    expect(state.driftEvents).toHaveLength(1);
    expect(state.driftEvents[0]).toMatchObject({
      sourceType: "EVAL",
      sourceId: evalCaseId,
      reason: "Company eval case was created from chat evidence.",
    });
  });

  test("rejects chat evidence from another company or malformed eval checks", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyAId, companyBId, threadBId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const threadBId = await ctx.db.insert("threads", {
        companyId: companyBId,
        title: "Other tenant",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { adminId, companyAId, companyBId, threadBId };
    });

    const adminClient = t.withIdentity({ subject: adminId });

    await expect(
      adminClient.mutation(api.companyLearningLoop.createMemoryCandidateFromChat, {
        companyId: companyAId,
        threadId: threadBId,
        content: "Do not cross tenants.",
        applyMode: "WHEN_RELEVANT",
      })
    ).rejects.toThrow("Thread not found for this company.");

    await expect(
      adminClient.mutation(api.companyLearningLoop.createEvalCaseFromChat, {
        companyId: companyAId,
        threadId: threadBId,
        name: "Bad",
        severity: "WARNING",
        targetSurface: "COMPANY_CHAT",
        prompt: "Prompt",
        expectedBehavior: "Expected",
        forbiddenClaimsJson: JSON.stringify({ bad: "shape" }),
      })
    ).rejects.toThrow("Thread not found for this company.");

    const threadAId = await t.run(async (ctx) =>
      ctx.db.insert("threads", {
        companyId: companyAId,
        title: "Own tenant",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await expect(
      adminClient.mutation(api.companyLearningLoop.createEvalCaseFromChat, {
        companyId: companyAId,
        threadId: threadAId,
        name: "Bad JSON",
        severity: "WARNING",
        targetSurface: "COMPANY_CHAT",
        prompt: "Prompt",
        expectedBehavior: "Expected",
        forbiddenClaimsJson: JSON.stringify({ bad: "shape" }),
      })
    ).rejects.toThrow("Forbidden claims must be a JSON array of strings.");

    expect(companyBId).not.toBe(companyAId);
  });

  test("derives tenant-scoped learning suggestions from readiness evidence", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, companyAId } = await t.run(async (ctx) => {
      const now = Date.now();
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
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
      await ctx.db.insert("companyMemoryCandidates", {
        companyId: companyAId,
        title: "Enterprise onboarding",
        content: "Enterprise includes onboarding support.",
        normalizedContent: "enterprise includes onboarding support.",
        category: "OTHER",
        applyMode: "WHEN_RELEVANT",
        sourceType: "CHAT",
        confidence: 0.85,
        status: "PROPOSED",
        createdBy: adminAId,
        createdAt: now,
        updatedAt: now,
      });
      const skillId = await ctx.db.insert("companySkills", {
        companyId: companyAId,
        name: "Quote builder",
        category: "SALES",
        status: "ACTIVE",
        riskLevel: "HIGH",
        instruction: "Build a quote from approved price-book rules.",
        createdBy: adminAId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("companySkillBindings", {
        companyId: companyAId,
        skillId,
        surfaceType: "COMPANY_CHAT",
        isEnabled: true,
        assignedBy: adminAId,
        assignedAt: now,
        updatedAt: now,
      });
      const evalCaseId = await ctx.db.insert("companyEvalCases", {
        companyId: companyAId,
        name: "Do not invent onboarding pricing",
        severity: "BLOCKER",
        targetSurface: "COMPANY_CHAT",
        prompt: "Does enterprise onboarding cost extra?",
        expectedBehavior: "Stay bounded to known onboarding support facts.",
        forbiddenClaimsJson: JSON.stringify(["free onboarding"]),
        status: "ACTIVE",
        createdBy: adminAId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("companyEvalRuns", {
        companyId: companyAId,
        evalCaseId,
        status: "FAILED",
        score: 0,
        answer: "Enterprise includes free onboarding.",
        deterministicResultsJson: JSON.stringify([{ key: "forbidden", passed: false }]),
        startedAt: now,
        completedAt: now,
        createdBy: adminAId,
      });
      await ctx.db.insert("companyAiDriftEvents", {
        companyId: companyAId,
        sourceType: "MEMORY",
        reason: "Company memory candidate was created from chat evidence.",
        createdBy: adminAId,
        createdAt: now,
      });

      return { adminAId, adminBId, companyAId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });
    const suggestions = await adminAClient.query(api.companyLearningLoop.getSuggestionsForCompany, {
      companyId: companyAId,
    });

    expect(suggestions.map((suggestion) => suggestion.type)).toEqual(expect.arrayContaining([
      "FIX_BLOCKER_EVALS",
      "FIX_SKILL_REQUIREMENTS",
      "RUN_EVALS_FOR_DRIFT",
      "REVIEW_MEMORY_CANDIDATES",
    ]));
    expect(suggestions[0]).toMatchObject({
      priority: "BLOCKER",
      target: "EVALS",
    });
    expect(suggestions).toContainEqual(expect.objectContaining({
      type: "FIX_SKILL_REQUIREMENTS",
      priority: "BLOCKER",
      target: "SKILLS",
    }));

    await expect(
      adminBClient.query(api.companyLearningLoop.getSuggestionsForCompany, {
        companyId: companyAId,
      })
    ).rejects.toThrow("Unauthorized");
  });
});
