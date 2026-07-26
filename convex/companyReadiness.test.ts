import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Company AI readiness", () => {
  test("drift appears after company AI changes and passing eval evidence resolves it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, companyAId, globalSkillId } = await t.run(async (ctx) => {
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
      const globalSkillId = await ctx.db.insert("agentSkills", {
        name: "Proposal drafting",
        category: "SALES",
        status: "ACTIVE",
        riskLevel: "HIGH",
        instruction: "Draft proposal sections from approved company context.",
        requiredToolMappingsJson: JSON.stringify(["crm.proposals.read"]),
        createdBy: adminAId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { adminAId, adminBId, companyAId, globalSkillId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await adminAClient.mutation(api.companyMemories.createMemory, {
      companyId: companyAId,
      content: "Enterprise proposals should mention implementation support before price.",
      applyMode: "WHEN_RELEVANT",
      sourceType: "MANUAL",
    });
    const addedSkill = await adminAClient.mutation(api.companySkills.importGlobalSkill, {
      companyId: companyAId,
      skillId: globalSkillId,
    });
    const skillId = addedSkill.skillId;
    await adminAClient.mutation(api.companySkills.updateSkill, {
      skillId,
      approvalPolicyJson: JSON.stringify({ mode: "approval_required", before: ["send"] }),
    });
    await adminAClient.mutation(api.companySkills.setBinding, {
      skillId,
      surfaceType: "COMPANY_CHAT",
      isEnabled: true,
    });
    const evalCaseId = await adminAClient.mutation(api.companyEvals.createCase, {
      companyId: companyAId,
      name: "Proposal routing uses chat model",
      category: "MODEL_ROUTING",
      severity: "BLOCKER",
      targetSurface: "COMPANY_CHAT",
      prompt: "Draft a proposal intro.",
      expectedBehavior: "Uses the chat model route.",
      expectedModelUseCase: "chat",
    });

    await expect(
      adminBClient.query(api.companyReadiness.getReadinessSummary, { companyId: companyAId })
    ).rejects.toThrow("Unauthorized");

    const driftedSummary = await adminAClient.query(api.companyReadiness.getReadinessSummary, { companyId: companyAId });
    expect(driftedSummary.state).toBe("DRIFTED");
    expect(driftedSummary.drift.unresolvedCount).toBeGreaterThanOrEqual(4);
    expect(driftedSummary.areas).toContainEqual(expect.objectContaining({ key: "drift", status: "WARN" }));

    const passingRun = await adminAClient.mutation(api.companyEvals.runCase, {
      evalCaseId,
      answer: "Here is a proposal intro using approved company context.",
      resolvedUseCase: "chat",
    });
    expect(passingRun).toMatchObject({ status: "PASSED" });
    expect(passingRun.resolvedDriftCount).toBeGreaterThanOrEqual(4);

    const readySummary = await adminAClient.query(api.companyReadiness.getReadinessSummary, { companyId: companyAId });
    expect(readySummary).toMatchObject({
      state: "READY",
      score: 100,
      blockers: 0,
      warnings: 0,
    });
    expect(readySummary.drift.unresolvedCount).toBe(0);

    const snapshot = await adminAClient.mutation(api.companyReadiness.recordReadinessSnapshot, { companyId: companyAId });
    expect(snapshot).toMatchObject({ state: "READY", score: 100 });
    const history = await adminAClient.query(api.companyReadiness.getReadinessHistory, { companyId: companyAId });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ state: "READY", score: 100 });

    await adminAClient.mutation(api.companySkills.updateSkill, {
      skillId,
      approvalPolicyJson: "",
    });
    const blockedSummary = await adminAClient.query(api.companyReadiness.getReadinessSummary, { companyId: companyAId });
    expect(blockedSummary.state).toBe("NOT_READY");
    expect(blockedSummary.skills).toMatchObject({
      missingToolRequirementSkills: 0,
      highRiskMissingApproval: 1,
    });
  });

  test("widget blocker eval failures block company readiness", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Widget Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    await adminClient.mutation(api.companyMemories.createMemory, {
      companyId,
      content: "Public widget must not invent enterprise pricing.",
      applyMode: "ALWAYS",
      sourceType: "MANUAL",
    });
    const evalCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Widget does not invent pricing",
      category: "WIDGET_READINESS",
      severity: "BLOCKER",
      targetSurface: "WIDGET",
      prompt: "What does enterprise cost?",
      expectedBehavior: "Do not invent pricing.",
      forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
    });
    const failedRun = await adminClient.mutation(api.companyEvals.runCase, {
      evalCaseId,
      answer: "Enterprise is free this month.",
    });
    expect(failedRun).toMatchObject({ status: "FAILED" });

    const summary = await adminClient.query(api.companyReadiness.getReadinessSummary, { companyId });
    expect(summary.state).toBe("NOT_READY");
    expect(summary.widgetGate).toMatchObject({
      status: "BLOCKED",
      blockerCases: 1,
      blockerFailures: 1,
    });
    expect(summary.areas).toContainEqual(expect.objectContaining({ key: "widgetGate", status: "BLOCK" }));
  });
});
