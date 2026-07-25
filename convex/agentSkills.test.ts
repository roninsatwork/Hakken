import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

describe("agent skills", () => {
  test("SKILL.md preview handles frontmatter, dependencies, connectors, examples, and duplicate warnings", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const now = Date.now();
      await ctx.db.insert("aiTools", {
        name: "Invoice Reader",
        description: "Reads invoice source documents.",
        handlerMapping: "finance.invoice.read",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        isActive: true,
        createdAt: now,
        createdBy: adminId,
      });
      await ctx.db.insert("aiTools", {
        name: "Slack Notify",
        description: "Sends governed Slack notifications.",
        handlerMapping: "slack.notify",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        isActive: true,
        createdAt: now,
        createdBy: adminId,
      });
      await ctx.db.insert("agentSkills", {
        name: "Invoice Ops",
        description: "Existing duplicate skill.",
        category: "FINANCE",
        status: "ACTIVE",
        riskLevel: "HIGH",
        instruction: "Existing instruction.",
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
      });
      return adminId;
    });
    const client = t.withIdentity({ subject: adminId });

    const preview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
      filename: "invoice-skill.md",
      markdown: [
        "---",
        "name: \"Invoice Ops\"",
        "category: finance",
        "risk_level: high",
        "---",
        "# Invoice Ops",
        "",
        "Extract invoice facts, reconcile totals, and prepare operator-ready exception notes.",
        "",
        "## Workflow",
        "",
        "Read the invoice source, identify supplier, due date, tax, and total amount.",
        "Before any external write or notification, pause for human approval and show the exact action.",
        "",
        "## Dependencies",
        "",
        "- `finance.invoice.read`",
        "",
        "## Connectors",
        "",
        "- `slack.notify`",
        "",
        "## Examples",
        "",
        "- Given a two-line invoice, return supplier, due date, net amount, tax, and total.",
      ].join("\n"),
    });

    expect(preview).toMatchObject({
      sourceFilename: "invoice-skill.md",
      name: "Invoice Ops",
      description: "Extract invoice facts, reconcile totals, and prepare operator-ready exception notes.",
      category: "FINANCE",
      riskLevel: "HIGH",
      requiredToolMappingsJson: "[\"finance.invoice.read\"]",
      recommendedToolMappingsJson: "[\"slack.notify\"]",
      validation: {
        errors: [],
      },
    });
    expect(preview.instruction).toContain("Workflow");
    expect(preview.instruction).toContain("pause for human approval");
    expect(JSON.parse(preview.suggestedEvalFixturesJson)).toHaveLength(1);
    expect(preview.validation.warnings).toContain("A skill named \"Invoice Ops\" already exists.");
    expect(preview.validation.warnings).not.toContain("High-risk language was detected without explicit approval guidance.");
    expect(preview.validation.warnings.some((warning) => warning.includes("Some tool hints do not match active Sonae tool mappings"))).toBe(false);
  });

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

    const markdownPreview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
      filename: "SKILL.md",
      markdown: [
        "---",
        "name: Browser QA",
        "description: Verify browser workflows before shipping.",
        "category: qa",
        "riskLevel: medium",
        "---",
        "# Browser QA",
        "",
        "## Instructions",
        "",
        "Use browser checks to verify local UI behavior and report visible regressions.",
        "",
        "## Required tools",
        "",
        "- `browser.open`",
      ].join("\n"),
    });
    expect(markdownPreview).toMatchObject({
      sourceFilename: "SKILL.md",
      name: "Browser QA",
      description: "Verify browser workflows before shipping.",
      category: "QA",
      riskLevel: "MEDIUM",
      instruction: "Instructions\nUse browser checks to verify local UI behavior and report visible regressions.",
      requiredToolMappingsJson: "[\"browser.open\"]",
      validation: {
        errors: [],
      },
    });
    expect(markdownPreview.validation.warnings).toContain("No examples or eval fixtures were found.");

    const riskyMarkdownPreview = await client.mutation(api.agentSkills.previewSkillMarkdownImport, {
      filename: "risky.SKILL.md",
      markdown: [
        "# Client Dispatch",
        "",
        "Dispatch client messages and delete old ACME records using the api key from the tenant note.",
        "",
        "## Required tools",
        "",
        "- `client.dispatch.send`",
      ].join("\n"),
    });
    expect(riskyMarkdownPreview).toMatchObject({
      name: "Client Dispatch",
      riskLevel: "HIGH",
      requiredToolMappingsJson: "[\"client.dispatch.send\"]",
    });
    expect(riskyMarkdownPreview.validation.warnings).toContain("High-risk language was detected without explicit approval guidance.");
    expect(riskyMarkdownPreview.validation.warnings).toContain("The source may contain tenant-specific or sensitive facts.");
    expect(riskyMarkdownPreview.validation.warnings).toContain("Some tool hints do not match active Sonae tool mappings: client.dispatch.send.");
    expect(riskyMarkdownPreview.validation.suggestions).toContain("Add approval handoff language for side-effecting actions.");

    const markdownImport = await client.mutation(api.agentSkills.importSkillMarkdown, {
      sourceFilename: markdownPreview.sourceFilename,
      sourceHash: markdownPreview.sourceHash,
      name: markdownPreview.name,
      description: markdownPreview.description,
      category: markdownPreview.category,
      riskLevel: markdownPreview.riskLevel,
      instruction: markdownPreview.instruction,
      requiredToolMappingsJson: markdownPreview.requiredToolMappingsJson,
      recommendedToolMappingsJson: markdownPreview.recommendedToolMappingsJson,
      suggestedEvalFixturesJson: markdownPreview.suggestedEvalFixturesJson,
    });
    const markdownImportState = await t.run(async (ctx) => {
      const importedSkill = await ctx.db.get(markdownImport.skillId);
      const importedVersion = await ctx.db.get(markdownImport.skillVersionId);
      const auditLog = await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("entityId"), markdownImport.skillId))
        .first();
      return { importedSkill, importedVersion, auditLog };
    });
    expect(markdownImportState.importedSkill).toMatchObject({
      name: "Browser QA",
      status: "DRAFT",
      category: "QA",
      riskLevel: "MEDIUM",
      requiredToolMappingsJson: "[\"browser.open\"]",
    });
    expect(markdownImportState.importedVersion).toMatchObject({
      skillId: markdownImport.skillId,
      versionNumber: 1,
    });
    expect(markdownImportState.auditLog).toMatchObject({
      actionType: "IMPORT_AGENT_SKILL_MARKDOWN",
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
    })).rejects.toThrow("Activation blocked: run a model-graded eval before activating this agent.");

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
    })).rejects.toThrow("Activation blocked: run a model-graded eval before activating this agent.");

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

    // Activation now needs evidence a model was actually called and its answer
    // graded — configuration checks alone are no longer sufficient.
    await t.run(async (ctx) => {
      const now = Date.now() + 30;
      const gradedRunId = await ctx.db.insert("agentRuns", {
        agentId,
        triggerType: "MANUAL",
        objective: "Smoke eval: skill coverage",
        status: "SUCCESS",
        startedAt: now,
        completedAt: now + 1,
        updatedAt: now + 1,
        finalOutput: "Model-graded smoke eval passed.",
      });
      // Carries the same skill evidence as the fixture, so this run counts as
      // the skill's current coverage rather than displacing it with one that
      // has none.
      const skillFixture = await ctx.db.get(skillFixtureId);
      await ctx.db.insert("agentRunSteps", {
        runId: gradedRunId,
        agentId,
        stepIndex: 1,
        kind: "OBSERVE",
        status: "SUCCESS",
        input: "skill coverage",
        output: JSON.stringify({
          status: "PASSED",
          gradingMode: "MODEL_GRADED",
          fixtureId: skillFixtureId,
          fixtureType: skillFixture?.type ?? "HAPPY_PATH",
          sourceEvidenceJson: skillFixture?.sourceEvidenceJson,
        }),
        startedAt: now,
        completedAt: now,
      });
    });

    await expect(client.mutation(api.agents.updateAgent, {
      id: agentId,
      isActive: true,
    })).resolves.toBe(agentId);
  });
});
