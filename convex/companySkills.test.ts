import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Company Skills", () => {
  test("imports active global skills into company draft skills", async () => {
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
      name: "Research Briefing",
      category: "RESEARCH",
      status: "DRAFT",
      riskLevel: "MEDIUM",
      instruction: "Separate facts, judgments, and open questions.",
      requiredToolsJson: "[\"knowledge.search\"]",
      versionLabel: "Imported draft",
    });
    expect(importedState.auditLog).toMatchObject({
      actionType: "IMPORT_GLOBAL_SKILL_TO_COMPANY",
      entityType: "companySkills",
      companyId,
    });
  });

  test("creates, binds, summarizes, updates, previews, and archives company skills", async () => {
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

    const skillId = await adminAClient.mutation(api.companySkills.createSkill, {
      companyId: companyAId,
      name: "Proposal drafting",
      description: "Drafts proposal sections from approved company context.",
      category: "sales enablement",
      status: "ACTIVE",
      riskLevel: "HIGH",
      instruction: "Draft proposal content only from approved knowledge and approved company memory.",
      inputContractJson: JSON.stringify({ required: ["brief"] }),
      outputContractJson: JSON.stringify({ type: "proposal_section" }),
      versionLabel: "v1",
    });

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
      missingToolRequirementSkills: 1,
      highRiskMissingApproval: 1,
      readySkills: 0,
    });

    await adminAClient.mutation(api.companySkills.updateSkill, {
      skillId,
      requiredToolsJson: JSON.stringify(["crm.proposals.read"]),
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
      "CREATE_COMPANY_SKILL",
      "CREATE_COMPANY_SKILL_BINDING",
      "UPDATE_COMPANY_SKILL",
      "ARCHIVE_COMPANY_SKILL",
    ]);
    expect(companyBId).not.toBe(companyAId);
  });

  test("validates JSON contracts and required tools", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Validation Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
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
    ).rejects.toThrow("Required tools must be a JSON array of strings.");

    await expect(
      adminClient.mutation(api.companySkills.createSkill, {
        companyId,
        name: "Bad contract",
        category: "GENERAL",
        status: "ACTIVE",
        riskLevel: "MEDIUM",
        instruction: "Use tools carefully.",
        inputContractJson: "{bad",
      })
    ).rejects.toThrow("Input contract must be valid JSON.");
  });
});
