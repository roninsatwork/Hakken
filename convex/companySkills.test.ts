import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Company Skills", () => {
  test("adds active central skills to company availability", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId, globalSkillId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Import Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin-import@example.com",
        role: "ADMIN",
        companyId,
      });
      const globalSkillId = await ctx.db.insert("agentSkills", {
        name: "Research Briefing",
        description: "Turn broad questions into sourced briefings.",
        category: "RESEARCH",
        status: "ACTIVE",
        riskLevel: "MEDIUM",
        instruction: "Separate facts, judgments, and open questions.",
        requiredToolMappingsJson: JSON.stringify(["knowledge.search"]),
        createdBy: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { adminId, companyId, globalSkillId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const importable = await adminClient.query(api.companySkills.getImportableGlobalSkills, { companyId });
    expect(importable.map((skill) => skill._id)).toContain(globalSkillId);

    const imported = await adminClient.mutation(api.companySkills.importGlobalSkill, {
      companyId,
      skillId: globalSkillId,
    });
    const importedState = await t.run(async (ctx) => {
      const skill = await ctx.db.get(imported.skillId);
      const auditLog = await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("entityId"), imported.skillId))
        .first();
      return { skill, auditLog };
    });

    expect(importedState.skill).toMatchObject({
      companyId,
      sourceAgentSkillId: globalSkillId,
      name: "Research Briefing",
      category: "RESEARCH",
      status: "ACTIVE",
      riskLevel: "MEDIUM",
      instruction: "Separate facts, judgments, and open questions.",
      requiredToolsJson: "[\"knowledge.search\"]",
      versionLabel: "Central skill",
    });
    expect(importedState.auditLog).toMatchObject({
      actionType: "ADD_CENTRAL_SKILL_TO_COMPANY",
      entityType: "companySkills",
      companyId,
    });

    const importableAfterAdd = await adminClient.query(api.companySkills.getImportableGlobalSkills, { companyId });
    expect(importableAfterAdd.map((skill) => skill._id)).not.toContain(globalSkillId);

    const duplicateAdd = await adminClient.mutation(api.companySkills.importGlobalSkill, {
      companyId,
      skillId: globalSkillId,
    });
    expect(duplicateAdd.skillId).toBe(imported.skillId);
  });

  test("binds, summarizes, updates policy, previews, and archives central company skills", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, companyAId, companyBId, globalSkillId } = await t.run(async (ctx) => {
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
        description: "Drafts proposal sections from approved company context.",
        category: "SALES_ENABLEMENT",
        status: "ACTIVE",
        riskLevel: "HIGH",
        instruction: "Draft proposal content only from approved knowledge and approved company memory.",
        requiredToolMappingsJson: JSON.stringify(["crm.proposals.read"]),
        createdBy: adminAId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { adminAId, adminBId, companyAId, companyBId, globalSkillId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    const addedSkill = await adminAClient.mutation(api.companySkills.importGlobalSkill, {
      companyId: companyAId,
      skillId: globalSkillId,
    });
    const skillId = addedSkill.skillId;

    await expect(
      adminBClient.query(api.companySkills.getSkillsForCompany, {
        companyId: companyAId,
        status: "ACTIVE",
        paginationOpts,
      })
    ).rejects.toThrow("Unauthorized");

    const initialPage = await adminAClient.query(api.companySkills.getSkillsForCompany, {
      companyId: companyAId,
      status: "ACTIVE",
      paginationOpts,
    });
    expect(initialPage.page.map((skill) => skill._id)).toEqual([skillId]);
    expect(initialPage.page[0]).toMatchObject({
      category: "SALES_ENABLEMENT",
      riskLevel: "HIGH",
      status: "ACTIVE",
    });

    await adminAClient.mutation(api.companySkills.setBinding, {
      skillId,
      surfaceType: "COMPANY_CHAT",
      isEnabled: true,
    });

    const warningSummary = await adminAClient.query(api.companySkills.getSummary, { companyId: companyAId });
    expect(warningSummary).toMatchObject({
      activeSkills: 1,
      enabledBindings: 1,
      boundActiveSkills: 1,
      highRiskSkills: 1,
      missingToolRequirementSkills: 0,
      highRiskMissingApproval: 1,
      readySkills: 0,
    });

    await adminAClient.mutation(api.companySkills.updateSkill, {
      skillId,
      approvalPolicyJson: JSON.stringify({ mode: "approval_required", before: ["send"] }),
    });

    const readySummary = await adminAClient.query(api.companySkills.getSummary, { companyId: companyAId });
    expect(readySummary).toMatchObject({
      missingToolRequirementSkills: 0,
      highRiskMissingApproval: 0,
      readySkills: 1,
    });

    const preview = await adminAClient.query(api.companySkills.getRuntimePreviewForCompany, {
      companyId: companyAId,
      limit: 3,
    });
    expect(preview).toEqual([
      expect.objectContaining({
        skillId,
        name: "Proposal drafting",
        category: "SALES_ENABLEMENT",
        riskLevel: "HIGH",
        requiredTools: ["crm.proposals.read"],
      }),
    ]);

    const bindings = await adminAClient.query(api.companySkills.getBindingsForSkill, { skillId });
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      surfaceType: "COMPANY_CHAT",
      isEnabled: true,
    });

    const archived = await adminAClient.mutation(api.companySkills.archiveSkill, { skillId });
    expect(archived.disabledBindings).toBe(1);
    const archivedBindings = await adminAClient.query(api.companySkills.getBindingsForSkill, { skillId });
    expect(archivedBindings[0]?.isEnabled).toBe(false);
    const archivedSummary = await adminAClient.query(api.companySkills.getSummary, { companyId: companyAId });
    expect(archivedSummary.activeSkills).toBe(0);

    const auditLogs = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").withIndex("by_company", (q) => q.eq("companyId", companyAId)).order("asc").collect()
    );
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "ADD_CENTRAL_SKILL_TO_COMPANY",
      "CREATE_COMPANY_SKILL_BINDING",
      "UPDATE_COMPANY_SKILL",
      "ARCHIVE_COMPANY_SKILL",
    ]);
    expect(companyBId).not.toBe(companyAId);
  });

  test("rejects direct company skill creation and validates company policy JSON", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId, globalSkillId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Validation Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const globalSkillId = await ctx.db.insert("agentSkills", {
        name: "Policy skill",
        category: "GENERAL",
        status: "ACTIVE",
        riskLevel: "MEDIUM",
        instruction: "Use tools carefully.",
        createdBy: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { adminId, companyId, globalSkillId };
    });

    const adminClient = t.withIdentity({ subject: adminId });

    await expect(
      adminClient.mutation(api.companySkills.createSkill, {
        companyId,
        name: "Bad tools",
        category: "GENERAL",
        status: "ACTIVE",
        riskLevel: "MEDIUM",
        instruction: "Use tools carefully.",
        requiredToolsJson: JSON.stringify({ tool: "crm.read" }),
      })
    ).rejects.toThrow("Company skills must be added from the central Skill Center.");

    const addedSkill = await adminClient.mutation(api.companySkills.importGlobalSkill, {
      companyId,
      skillId: globalSkillId,
    });
    await expect(
      adminClient.mutation(api.companySkills.updateSkill, {
        skillId: addedSkill.skillId,
        approvalPolicyJson: "{bad",
      })
    ).rejects.toThrow("Approval policy must be valid JSON.");
  });
});
