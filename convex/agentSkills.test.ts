import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

describe("agent skills", () => {
  test("starter skills seed idempotently, bind to agents, seed evals, and gate high-risk activation", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      });

      await ctx.db.insert("aiModels", {
        modelId: "default-agent-model",
        displayName: "Default Agent Model",
        isEnabled: true,
        isDefault: true,
        supportedUseCases: ["agent"],
        lastSyncedAt: Date.now(),
      });

      return userId;
    });

    const client = t.withIdentity({ subject: adminId });
    const agentId = await client.mutation(api.agents.createAgent, {
      name: "Skill Regression Agent",
      description: "Tests reusable skill behavior.",
    });
    await client.mutation(api.agents.updateAgent, {
      id: agentId,
      isActive: false,
      releaseGateMode: "NONE",
    });

    const firstSeed = await client.mutation(api.agentSkills.seedStarterSkills, {});
    expect(firstSeed).toMatchObject({
      createdCount: 6,
      skippedCount: 0,
    });

    const secondSeed = await client.mutation(api.agentSkills.seedStarterSkills, {});
    expect(secondSeed).toMatchObject({
      createdCount: 0,
      skippedCount: 6,
    });

    const activeSkills = await client.query(api.agentSkills.getActiveSkills, {});
    expect(activeSkills.map((skill) => skill.name).sort()).toEqual([
      "Approval Handoff",
      "Client Follow-up",
      "Data Enrichment",
      "Document Extraction",
      "Research Briefing",
      "Risk Monitoring",
    ]);

    const highRiskSkill = activeSkills.find((skill) => skill.name === "Risk Monitoring");
    expect(highRiskSkill).toBeDefined();
    if (!highRiskSkill) throw new Error("Expected Risk Monitoring starter skill");

    const bindingResult = await client.mutation(api.agentSkills.bindSkillToAgent, {
      agentId,
      skillId: highRiskSkill._id,
      seedEvalFixtures: true,
    });
    expect(bindingResult).toMatchObject({
      readiness: {
        missingRequiredToolMappings: [],
      },
    });
    expect(bindingResult.seededEvalFixtureIds).toHaveLength(2);

    await t.run(async (ctx) => {
      const now = Date.now();
      const sourceRunId = await ctx.db.insert("agentRuns", {
        agentId,
        userId: adminId,
        triggerType: "MANUAL",
        objective: "Review risk monitoring learning.",
        status: "FAILED",
        startedAt: now,
        completedAt: now + 10,
        updatedAt: now + 10,
        error: "Risk threshold was unclear.",
      });
      await ctx.db.insert("agentImprovementSuggestions", {
        agentId,
        sourceRunId,
        sourceSkillId: highRiskSkill._id,
        sourceSkillVersionId: bindingResult.skillVersionId,
        createdBy: adminId,
        type: "SKILL_INSTRUCTION_CHANGE",
        title: "Review shared skill guidance: Risk Monitoring",
        description: "Add clearer confidence thresholds before escalating material risk.",
        proposedPatchJson: JSON.stringify({ appendSkillInstruction: "Add confidence thresholds." }),
        riskLevel: "HIGH",
        status: "PROPOSED",
        createdAt: now + 20,
        updatedAt: now + 20,
      });
      await ctx.db.insert("agentImprovementSuggestions", {
        agentId,
        sourceRunId,
        sourceSkillId: highRiskSkill._id,
        sourceSkillVersionId: bindingResult.skillVersionId,
        createdBy: adminId,
        type: "SKILL_INSTRUCTION_CHANGE",
        title: "Applied risk monitoring guidance",
        description: "A previous risk-monitoring learning note was applied.",
        proposedPatchJson: JSON.stringify({ appendSkillInstruction: "Applied note." }),
        riskLevel: "MEDIUM",
        status: "APPLIED",
        createdAt: now + 30,
        updatedAt: now + 30,
      });
      await ctx.db.insert("agentMemoryCandidates", {
        agentId,
        sourceRunId,
        sourceSkillId: highRiskSkill._id,
        sourceSkillVersionId: bindingResult.skillVersionId,
        proposedBy: "SYSTEM_REFLECTION",
        kind: "FACT",
        content: "Risk updates should include source credibility.",
        normalizedContent: "risk updates should include source credibility.",
        confidence: 0.74,
        riskLevel: "MEDIUM",
        status: "PROPOSED",
        createdBy: adminId,
        createdAt: now + 40,
        updatedAt: now + 40,
      });
      await ctx.db.insert("agentMemoryCandidates", {
        agentId,
        sourceRunId,
        sourceSkillId: highRiskSkill._id,
        sourceSkillVersionId: bindingResult.skillVersionId,
        proposedBy: "SYSTEM_REFLECTION",
        kind: "SUMMARY",
        content: "Rejected vague risk-monitoring memory.",
        normalizedContent: "rejected vague risk-monitoring memory.",
        confidence: 0.4,
        riskLevel: "LOW",
        status: "REJECTED",
        createdBy: adminId,
        createdAt: now + 50,
        updatedAt: now + 50,
      });
    });

    const learningAnalytics = await client.query(api.agentSkills.getSkillLearningAnalytics, {
      skillId: highRiskSkill._id,
    });
    expect(learningAnalytics.totals).toMatchObject({
      suggestions: 2,
      openSuggestions: 1,
      appliedSuggestions: 1,
      rejectedSuggestions: 0,
      memoryCandidates: 2,
      openMemoryCandidates: 1,
      appliedMemoryCandidates: 0,
      rejectedMemoryCandidates: 1,
      highRiskOpenItems: 1,
    });
    expect(learningAnalytics.recentLearning[0]).toMatchObject({
      kind: "memory",
      status: "REJECTED",
      title: "summary memory candidate",
    });
    expect(learningAnalytics.recentLearning).toContainEqual(expect.objectContaining({
      kind: "suggestion",
      status: "PROPOSED",
      title: "Review shared skill guidance: Risk Monitoring",
    }));

    const cloneResult = await client.mutation(api.agentSkills.cloneSkill, {
      skillId: highRiskSkill._id,
      name: "Risk Monitoring Variant",
    });
    const cloneState = await t.run(async (ctx) => {
      const clonedSkill = await ctx.db.get(cloneResult.skillId);
      const clonedVersion = await ctx.db.get(cloneResult.skillVersionId);
      const clonedBindings = await ctx.db
        .query("agentSkillBindings")
        .withIndex("by_skill_enabled", (q) => q.eq("skillId", cloneResult.skillId))
        .collect();
      const auditLog = await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("entityId"), cloneResult.skillId))
        .first();
      return { clonedSkill, clonedVersion, clonedBindings, auditLog };
    });
    expect(cloneState.clonedSkill).toMatchObject({
      name: "Risk Monitoring Variant",
      description: highRiskSkill.description,
      category: highRiskSkill.category,
      status: "DRAFT",
      riskLevel: highRiskSkill.riskLevel,
      instruction: highRiskSkill.instruction,
      suggestedEvalFixturesJson: highRiskSkill.suggestedEvalFixturesJson,
    });
    expect(cloneState.clonedSkill?.requiredToolMappingsJson).toBe(highRiskSkill.requiredToolMappingsJson);
    expect(cloneState.clonedVersion).toMatchObject({
      skillId: cloneResult.skillId,
      versionNumber: 1,
    });
    expect(cloneState.clonedBindings).toHaveLength(0);
    expect(cloneState.auditLog).toMatchObject({
      actionType: "CLONE_AGENT_SKILL",
      entityType: "agentSkills",
    });

    const exportedBundle = await client.query(api.agentSkills.exportSkillBundle, {
      skillId: highRiskSkill._id,
    });
    expect(exportedBundle.filename).toBe("risk-monitoring-bundle.json");
    expect(exportedBundle.bundle).toMatchObject({
      format: "sonae.agentSkillBundle.v1",
      skill: {
        name: "Risk Monitoring",
        riskLevel: "HIGH",
        suggestedEvalFixtures: expect.any(Array),
      },
    });
    const importResult = await client.mutation(api.agentSkills.importSkillBundle, {
      bundleJson: exportedBundle.bundleJson,
      name: "Imported Risk Monitoring",
    });
    const importState = await t.run(async (ctx) => {
      const importedSkill = await ctx.db.get(importResult.skillId);
      const importedVersion = await ctx.db.get(importResult.skillVersionId);
      const importedBindings = await ctx.db
        .query("agentSkillBindings")
        .withIndex("by_skill_enabled", (q) => q.eq("skillId", importResult.skillId))
        .collect();
      const auditLog = await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("entityId"), importResult.skillId))
        .first();
      return { importedSkill, importedVersion, importedBindings, auditLog };
    });
    expect(importState.importedSkill).toMatchObject({
      name: "Imported Risk Monitoring",
      status: "DRAFT",
      riskLevel: highRiskSkill.riskLevel,
      instruction: highRiskSkill.instruction,
      suggestedEvalFixturesJson: highRiskSkill.suggestedEvalFixturesJson,
    });
    expect(importState.importedVersion).toMatchObject({
      skillId: importResult.skillId,
      versionNumber: 1,
    });
    expect(importState.importedBindings).toHaveLength(0);
    expect(importState.auditLog).toMatchObject({
      actionType: "IMPORT_AGENT_SKILL_BUNDLE",
      entityType: "agentSkills",
    });

    const boundSkills = await client.query(api.agentSkills.getForAgent, { agentId });
    expect(boundSkills).toHaveLength(1);
    expect(boundSkills[0]).toMatchObject({
      skill: {
        name: "Risk Monitoring",
        riskLevel: "HIGH",
      },
      evalCoverage: {
        activeFixtureCount: 2,
        latestRun: null,
        latestPassedRun: null,
      },
    });

    const initialReadiness = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(initialReadiness.skillReadiness).toMatchObject({
      enabledCount: 1,
      missingRequiredToolCount: 0,
      missingHighRiskEvalCount: 1,
    });
    expect(initialReadiness.skillReadiness.skills[0]).toMatchObject({
      name: "Risk Monitoring",
      riskLevel: "HIGH",
      activeEvalFixtureCount: 2,
      skillSmokePassed: false,
    });
    expect(initialReadiness.checks).toContainEqual(expect.objectContaining({
      key: "skills",
      status: "WARN",
    }));

    const manualFixture = await client.mutation(api.agentEvalFixtures.createManual, {
      agentId,
      type: "HAPPY_PATH",
      objective: "Answer a general readiness question.",
      expectedFinalOutputRubric: "The agent gives a direct and safe answer.",
      tags: ["general-readiness"],
    });
    await expect(client.mutation(api.agentEvalFixtures.runSmokeEval, {
      agentId,
      fixtureId: manualFixture.fixtureId,
    })).resolves.toMatchObject({ status: "SUCCESS" });

    await expect(client.mutation(api.agents.updateAgent, {
      id: agentId,
      isActive: true,
    })).rejects.toThrow("Activation blocked: enabled skills are missing required tools or high-risk skill smoke evals.");

    const skillFixtureId = await t.run(async (ctx) => {
      const fixtures = await ctx.db
        .query("agentEvalFixtures")
        .withIndex("by_agent_status_created", (q) => q.eq("agentId", agentId).eq("status", "ACTIVE"))
        .collect();
      const skillFixture = fixtures.find((fixture) => {
        try {
          const evidence = JSON.parse(fixture.sourceEvidenceJson) as {
            source?: string;
            skillId?: Id<"agentSkills">;
          };
          return evidence.source === "agent_skill" && evidence.skillId === highRiskSkill._id;
        } catch {
          return false;
        }
      });
      if (!skillFixture) throw new Error("Expected seeded skill fixture");
      return skillFixture._id;
    });

    const skillSmokeEval = await client.mutation(api.agentEvalFixtures.runSmokeEval, {
      agentId,
      fixtureId: skillFixtureId,
    });
    expect(skillSmokeEval).toMatchObject({
      status: "SUCCESS",
      fixtureId: skillFixtureId,
    });

    const readyState = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(readyState.skillReadiness).toMatchObject({
      enabledCount: 1,
      missingRequiredToolCount: 0,
      missingHighRiskEvalCount: 0,
    });
    expect(readyState.skillReadiness.skills[0]).toMatchObject({
      name: "Risk Monitoring",
      activeEvalFixtureCount: 2,
      skillSmokePassed: true,
      latestSkillSmokeEval: {
        runId: skillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: true,
      },
    });
    expect(readyState.checks).toContainEqual(expect.objectContaining({
      key: "skills",
      status: "PASS",
    }));

    await client.mutation(api.agentSkills.updateSkill, {
      skillId: highRiskSkill._id,
      instruction: `${highRiskSkill.instruction}\nAlways include an explicit confidence level when escalating risk.`,
    });

    const pinnedReadiness = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(pinnedReadiness.skillReadiness).toMatchObject({
      enabledCount: 1,
      missingRequiredToolCount: 0,
      missingHighRiskEvalCount: 0,
    });
    expect(pinnedReadiness.skillReadiness.skills[0]).toMatchObject({
      name: "Risk Monitoring",
      skillSmokePassed: true,
      latestSkillSmokeEval: {
        runId: skillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: true,
      },
    });

    const pinnedCoverage = await client.query(api.agentSkills.getForAgent, { agentId });
    expect(pinnedCoverage[0]).toMatchObject({
      hasAvailableUpdate: true,
      version: {
        versionNumber: 1,
      },
      latestVersion: {
        versionNumber: 2,
      },
    });
    const updateLagAnalytics = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(updateLagAnalytics.totals).toMatchObject({
      enabledBindings: 1,
      outdatedBindings: 1,
      validatedBindings: 0,
      needsSmokeBindings: 0,
    });
    expect(updateLagAnalytics.needsAttention).toContainEqual(expect.objectContaining({
      skillId: highRiskSkill._id,
      name: "Risk Monitoring",
      outdatedAgents: 1,
      needsSmokeAgents: 0,
    }));

    const skillBindings = await client.query(api.agentSkills.getBindingsForSkill, {
      skillId: highRiskSkill._id,
    });
    expect(skillBindings).toContainEqual(expect.objectContaining({
      binding: expect.objectContaining({ _id: pinnedCoverage[0].binding._id }),
      agent: expect.objectContaining({ _id: agentId, name: "Skill Regression Agent" }),
      hasAvailableUpdate: true,
      version: expect.objectContaining({ versionNumber: 1 }),
      latestVersion: expect.objectContaining({ versionNumber: 2 }),
      evalCoverage: expect.objectContaining({
        latestPassedRun: expect.objectContaining({
          runId: skillSmokeEval.runId,
          isCurrent: true,
        }),
      }),
    }));

    const upgradeResult = await client.mutation(api.agentSkills.upgradeSkillBindingsForSkill, {
      skillId: highRiskSkill._id,
      bindingIds: [pinnedCoverage[0].binding._id],
      seedEvalFixtures: true,
    });
    expect(upgradeResult.upgradedCount).toBe(1);
    expect(upgradeResult.skillVersionId).toBe(pinnedCoverage[0].latestVersion?._id);

    const staleReadiness = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(staleReadiness.skillReadiness).toMatchObject({
      enabledCount: 1,
      missingRequiredToolCount: 0,
      missingHighRiskEvalCount: 1,
    });
    expect(staleReadiness.skillReadiness.skills[0]).toMatchObject({
      name: "Risk Monitoring",
      activeEvalFixtureCount: 2,
      skillSmokePassed: false,
      latestSkillSmokeEval: {
        runId: skillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: false,
      },
    });
    expect(staleReadiness.checks).toContainEqual(expect.objectContaining({
      key: "skills",
      status: "WARN",
    }));

    const staleCoverage = await client.query(api.agentSkills.getForAgent, { agentId });
    expect(staleCoverage[0]).toMatchObject({
      hasAvailableUpdate: false,
      version: {
        versionNumber: 2,
      },
      latestVersion: {
        versionNumber: 2,
      },
    });
    expect(staleCoverage[0].evalCoverage).toMatchObject({
      activeFixtureCount: 2,
      latestRun: {
        runId: skillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: false,
      },
      latestPassedRun: null,
    });
    const staleAnalytics = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(staleAnalytics.totals).toMatchObject({
      enabledBindings: 1,
      outdatedBindings: 0,
      currentBindings: 1,
      validatedBindings: 0,
      needsSmokeBindings: 1,
      highRiskNeedsSmokeBindings: 1,
    });
    expect(staleAnalytics.needsAttention).toContainEqual(expect.objectContaining({
      skillId: highRiskSkill._id,
      name: "Risk Monitoring",
      outdatedAgents: 0,
      needsSmokeAgents: 1,
    }));
    const staleRollout = await client.query(api.agentSkills.getBindingsForSkill, {
      skillId: highRiskSkill._id,
    });
    expect(staleRollout).toContainEqual(expect.objectContaining({
      binding: expect.objectContaining({ _id: pinnedCoverage[0].binding._id }),
      hasAvailableUpdate: false,
      evalCoverage: expect.objectContaining({
        latestRun: expect.objectContaining({
          runId: skillSmokeEval.runId,
          isCurrent: false,
        }),
        latestPassedRun: null,
      }),
    }));

    await expect(client.mutation(api.agents.updateAgent, {
      id: agentId,
      isActive: true,
    })).rejects.toThrow("Activation blocked: enabled skills are missing required tools or high-risk skill smoke evals.");

    const refreshedSkillSmokeEval = await client.mutation(api.agentEvalFixtures.runSmokeEval, {
      agentId,
      fixtureId: skillFixtureId,
    });
    expect(refreshedSkillSmokeEval).toMatchObject({
      status: "SUCCESS",
      fixtureId: skillFixtureId,
    });

    const refreshedReadiness = await client.query(api.agents.getAgentReadiness, { id: agentId });
    expect(refreshedReadiness.skillReadiness).toMatchObject({
      missingHighRiskEvalCount: 0,
    });
    expect(refreshedReadiness.skillReadiness.skills[0]).toMatchObject({
      skillSmokePassed: true,
      latestSkillSmokeEval: {
        runId: refreshedSkillSmokeEval.runId,
        status: "SUCCESS",
        isCurrent: true,
      },
    });
    const validatedRollout = await client.query(api.agentSkills.getBindingsForSkill, {
      skillId: highRiskSkill._id,
    });
    expect(validatedRollout).toContainEqual(expect.objectContaining({
      binding: expect.objectContaining({ _id: pinnedCoverage[0].binding._id }),
      evalCoverage: expect.objectContaining({
        latestPassedRun: expect.objectContaining({
          runId: refreshedSkillSmokeEval.runId,
          isCurrent: true,
        }),
      }),
    }));
    const validatedAnalytics = await client.query(api.agentSkills.getSkillCatalogAnalytics, {});
    expect(validatedAnalytics.totals).toMatchObject({
      enabledBindings: 1,
      outdatedBindings: 0,
      currentBindings: 1,
      validatedBindings: 1,
      needsSmokeBindings: 0,
      highRiskNeedsSmokeBindings: 0,
    });

    await expect(client.mutation(api.agents.updateAgent, {
      id: agentId,
      isActive: true,
    })).resolves.toBe(agentId);
  });
});
