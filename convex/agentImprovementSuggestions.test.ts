import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Agent Improvement Suggestions", () => {
  test("admins can generate, apply, and reject scoped config suggestions", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, agentId, runId } = await t.run(async (ctx) => {
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
      const agentId = await ctx.db.insert("agents", {
        name: "Suggestion Agent",
        modelId: "model-test",
        thinkingMode: false,
        systemPrompt: "Initial prompt.",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "WORKFLOW",
        objective: "Update company overview",
        status: "FAILED",
        error: "Tool argument validation failed",
        startedAt: 100,
        completedAt: 140,
        updatedAt: 140,
      });
      const reflectionId = await ctx.db.insert("agentRunReflections", {
        runId,
        agentId,
        companyId: companyAId,
        createdBy: adminAId,
        category: "BAD_TOOL_ARGUMENTS",
        sourceStatus: "FAILED",
        objectiveSummary: "Update company overview",
        rootCause: "Tool arguments were invalid.",
        proposedPromptChange: "Before updating overview fields, verify the payload matches the tool schema.",
        proposedToolChange: "Add examples for the overview update tool schema.",
        proposedEvalFixture: "Expect valid overview update arguments.",
        confidence: 0.85,
        evidenceJson: "{}",
        status: "GENERATED",
        createdAt: 130,
        updatedAt: 130,
      });
      await ctx.db.insert("agentEvalFixtures", {
        agentId,
        companyId: companyAId,
        sourceRunId: runId,
        sourceReflectionId: reflectionId,
        createdBy: adminAId,
        type: "BAD_TOOL_ARGS",
        objective: "Update company overview",
        expectedToolPlanJson: "[]",
        expectedFinalOutputRubric: "Expected behavior should produce schema-valid tool arguments.",
        sourceEvidenceJson: "{}",
        tags: ["bad_tool_args"],
        status: "ACTIVE",
        createdAt: 150,
        updatedAt: 150,
      });

      return { adminAId, adminBId, agentId, runId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await expect(adminBClient.mutation(api.agentImprovementSuggestions.generateForRun, { runId })).rejects.toThrow(
      "Unauthorized"
    );

    const generated = await adminAClient.mutation(api.agentImprovementSuggestions.generateForRun, { runId });
    expect(generated.createdIds).toHaveLength(2);
    const duplicate = await adminAClient.mutation(api.agentImprovementSuggestions.generateForRun, { runId });
    expect(duplicate.createdIds).toHaveLength(0);

    const suggestions = await adminAClient.query(api.agentImprovementSuggestions.getRecentForAgent, { agentId });
    expect(suggestions.map((suggestion) => suggestion.type).sort()).toEqual(["PROMPT_CHANGE", "TOOL_SCHEMA_CHANGE"]);

    const promptSuggestion = suggestions.find((suggestion) => suggestion.type === "PROMPT_CHANGE");
    const toolSuggestion = suggestions.find((suggestion) => suggestion.type === "TOOL_SCHEMA_CHANGE");
    if (!promptSuggestion || !toolSuggestion) throw new Error("Expected suggestions missing");

    const applied = await adminAClient.mutation(api.agentImprovementSuggestions.decideSuggestion, {
      suggestionId: promptSuggestion._id,
      decision: "APPROVED",
      apply: true,
    });
    expect(applied.appliedAgentVersionId).toBeTruthy();

    await adminAClient.mutation(api.agentImprovementSuggestions.decideSuggestion, {
      suggestionId: toolSuggestion._id,
      decision: "REJECTED",
      rejectionReason: "Tool schema change needs product review",
    });

    const state = await t.run(async (ctx) => ({
      agent: await ctx.db.get(agentId),
      promptSuggestion: await ctx.db.get(promptSuggestion._id),
      toolSuggestion: await ctx.db.get(toolSuggestion._id),
      versions: await ctx.db.query("agentVersions").collect(),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(state.agent?.systemPrompt).toContain("Approved learning note");
    expect(state.agent?.systemPrompt).toContain("verify the payload matches the tool schema");
    expect(state.promptSuggestion).toMatchObject({
      status: "APPLIED",
      reviewedBy: adminAId,
      appliedAgentVersionId: applied.appliedAgentVersionId,
    });
    expect(state.toolSuggestion).toMatchObject({
      status: "REJECTED",
      reviewedBy: adminAId,
      rejectionReason: "Tool schema change needs product review",
    });
    const reviewedInbox = await adminAClient.query(api.agentMemoryCandidates.getReviewInboxForAgent, {
      agentId,
      mode: "REVIEWED",
    });
    expect(reviewedInbox.improvementSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suggestionId: promptSuggestion._id,
          status: "APPLIED",
          appliedEffect: "Prompt guidance appended and version snapshot updated.",
          appliedAgentVersionId: applied.appliedAgentVersionId,
          patchPreview: [
            expect.objectContaining({
              operation: "APPEND",
              target: "Agent system prompt",
              note: "Applied to the agent and captured in a version snapshot.",
            }),
          ],
        }),
        expect.objectContaining({
          suggestionId: toolSuggestion._id,
          status: "REJECTED",
          patchPreview: expect.arrayContaining([
            expect.objectContaining({
              operation: "REVIEW",
              target: "AI rule",
            }),
          ]),
        }),
      ])
    );
    expect(state.versions).toHaveLength(1);
    expect(state.auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_AGENT_IMPROVEMENT_SUGGESTION",
      "CREATE_AGENT_IMPROVEMENT_SUGGESTION",
      "APPLY_AGENT_IMPROVEMENT_SUGGESTION",
      "REJECT_AGENT_IMPROVEMENT_SUGGESTION",
    ]);
  });

  test("failed skill smoke evals create and apply shared skill instruction suggestions", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "super-admin@example.com",
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
      name: "Shared Skill Learning Agent",
      description: "Tests skill-scoped improvement suggestions.",
    });
    const skillId = await client.mutation(api.agentSkills.createSkill, {
      name: "Escalation Tool Skill",
      category: "TEST",
      status: "ACTIVE",
      riskLevel: "HIGH",
      instruction: "Escalate material events with the approved workflow.",
      suggestedEvalFixturesJson: JSON.stringify([{
        type: "TOOL_PLAN",
        objective: "Escalate a material event through the required escalation tool.",
        expectedFinalOutputRubric: "The agent should call the escalation workflow tool before reporting success.",
        expectedToolMappings: ["missing.escalation.workflow"],
        tags: ["skill", "tool-plan"],
      }]),
    });
    const binding = await client.mutation(api.agentSkills.bindSkillToAgent, {
      agentId,
      skillId,
      seedEvalFixtures: true,
    });
    const sourceSkillVersionId = binding.skillVersionId;
    expect(binding.seededEvalFixtureIds).toHaveLength(1);

    const failedSmokeEval = await client.mutation(api.agentEvalFixtures.runSmokeEval, {
      agentId,
      fixtureId: binding.seededEvalFixtureIds[0],
    });
    expect(failedSmokeEval).toMatchObject({
      status: "FAILED",
      missingToolMappings: ["missing.escalation.workflow"],
    });

    await client.mutation(api.agentRunReflections.createForRun, {
      runId: failedSmokeEval.runId,
    });
    const generated = await client.mutation(api.agentImprovementSuggestions.generateForRun, {
      runId: failedSmokeEval.runId,
    });
    expect(generated.createdIds.length).toBeGreaterThanOrEqual(1);

    const suggestions = await client.query(api.agentImprovementSuggestions.getRecentForAgent, { agentId });
    const skillSuggestion = suggestions.find((suggestion) => suggestion.type === "SKILL_INSTRUCTION_CHANGE");
    expect(skillSuggestion).toBeDefined();
    if (!skillSuggestion) throw new Error("Expected skill improvement suggestion");
    expect(skillSuggestion).toMatchObject({
      sourceSkillId: skillId,
      sourceSkillVersionId,
      sourceEvalFixtureId: binding.seededEvalFixtureIds[0],
      riskLevel: "HIGH",
    });
    expect(JSON.parse(skillSuggestion.proposedPatchJson)).toMatchObject({
      sourceSkillId: skillId,
      sourceSkillVersionId,
    });

    const applied = await client.mutation(api.agentImprovementSuggestions.decideSuggestion, {
      suggestionId: skillSuggestion._id,
      decision: "APPROVED",
      apply: true,
    });
    expect(applied.appliedAgentVersionId).toBeNull();
    expect(applied.appliedSkillVersionId).toBeTruthy();
    expect(applied.appliedSkillVersionId).not.toBe(sourceSkillVersionId);

    const state = await t.run(async (ctx) => {
      const skill = await ctx.db.get(skillId);
      const updatedSuggestion = await ctx.db.get(skillSuggestion._id);
      const updatedBinding = await ctx.db
        .query("agentSkillBindings")
        .withIndex("by_agent_skill", (q) => q.eq("agentId", agentId).eq("skillId", skillId))
        .first();
      const skillVersions = await ctx.db
        .query("agentSkillVersions")
        .withIndex("by_skill_created", (q) => q.eq("skillId", skillId))
        .collect();
      const fixtures = await ctx.db
        .query("agentEvalFixtures")
        .withIndex("by_agent_status_created", (q) => q.eq("agentId", agentId).eq("status", "ACTIVE"))
        .collect();
      return { skill, updatedSuggestion, updatedBinding, skillVersions, fixtures };
    });

    expect(state.skill?.instruction).toContain("Approved learning note");
    expect(state.updatedSuggestion).toMatchObject({
      status: "APPLIED",
      appliedSkillVersionId: applied.appliedSkillVersionId,
    });
    expect(state.updatedSuggestion).not.toHaveProperty("appliedAgentVersionId");
    expect(state.updatedBinding?.skillVersionId).toBe(sourceSkillVersionId);
    expect(state.skillVersions).toHaveLength(2);
    const updatedSkillFixture = state.fixtures.find((fixture) => fixture._id === binding.seededEvalFixtureIds[0]);
    expect(JSON.parse(updatedSkillFixture?.sourceEvidenceJson || "{}")).toMatchObject({
      source: "agent_skill",
      skillId,
      skillVersionId: sourceSkillVersionId,
    });
  });

  test("failed runtime runs can attribute improvement suggestions to active skills", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "runtime-skill-admin@example.com",
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
      name: "Runtime Skill Attribution Agent",
      description: "Tests skill attribution for normal failed runs.",
    });
    const escalationSkillId = await client.mutation(api.agentSkills.createSkill, {
      name: "Client Escalation",
      category: "ESCALATION",
      status: "ACTIVE",
      riskLevel: "HIGH",
      instruction: "Escalate client risk events with the escalation workflow and clear approval context.",
      requiredToolMappingsJson: JSON.stringify(["client.escalation.workflow"]),
    });
    const approvalSkillId = await client.mutation(api.agentSkills.createSkill, {
      name: "Sensitive Concession Approval",
      category: "APPROVAL",
      status: "ACTIVE",
      riskLevel: "HIGH",
      instruction: "Require explicit approval before proposing discounts, concessions, or contract changes.",
      requiredToolMappingsJson: JSON.stringify(["contracts.discount.approve"]),
    });
    const escalationBinding = await client.mutation(api.agentSkills.bindSkillToAgent, {
      agentId,
      skillId: escalationSkillId,
      seedEvalFixtures: false,
    });
    const approvalBinding = await client.mutation(api.agentSkills.bindSkillToAgent, {
      agentId,
      skillId: approvalSkillId,
      seedEvalFixtures: false,
    });

    const runId = await t.run(async (ctx) => {
      const now = Date.now();
      const failedRunId = await ctx.db.insert("agentRuns", {
        agentId,
        userId: adminId,
        triggerType: "MANUAL",
        objective: "Approve a sensitive client concession.",
        status: "FAILED",
        error: "The approval was rejected because the discount exceeded policy.",
        startedAt: now,
        completedAt: now + 50,
        updatedAt: now + 50,
      });
      await ctx.db.insert("agentRunSteps", {
        runId: failedRunId,
        agentId,
        stepIndex: 1,
        kind: "OBSERVE",
        status: "SUCCESS",
        input: "Runtime skills",
        output: JSON.stringify({
          skills: [{
            skillId: escalationSkillId,
            skillVersionId: escalationBinding.skillVersionId,
            name: "Client Escalation",
            category: "ESCALATION",
            riskLevel: "HIGH",
            requiredToolMappings: ["client.escalation.workflow"],
          }, {
            skillId: approvalSkillId,
            skillVersionId: approvalBinding.skillVersionId,
            name: "Sensitive Concession Approval",
            category: "APPROVAL",
            riskLevel: "HIGH",
            requiredToolMappings: ["contracts.discount.approve"],
          }],
        }),
        startedAt: now,
        completedAt: now,
      });
      const toolCallId = await ctx.db.insert("agentToolCalls", {
        runId: failedRunId,
        agentId,
        normalizedToolName: "approve_discount",
        handlerMapping: "contracts.discount.approve",
        argumentsJson: JSON.stringify({ discountPercent: 35 }),
        status: "APPROVAL_REQUIRED",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        startedAt: now + 10,
      });
      await ctx.db.insert("agentRunApprovals", {
        runId: failedRunId,
        toolCallId,
        agentId,
        status: "REJECTED",
        message: "Approve 35% discount concession?",
        previewJson: JSON.stringify({ discountPercent: 35, policyLimit: 20 }),
        requestedAt: now + 11,
        reviewedAt: now + 30,
        decisionReason: "Discount concession exceeds approved threshold.",
      });
      return failedRunId;
    });

    await client.mutation(api.agentRunFeedback.upsertForRun, {
      runId,
      rating: "NEGATIVE",
      labels: ["NEEDS_APPROVAL_POLICY_CHANGE"],
      comment: "This needs tighter approval handling for sensitive concessions.",
    });
    await client.mutation(api.agentRunReflections.createForRun, { runId });

    const generated = await client.mutation(api.agentImprovementSuggestions.generateForRun, { runId });
    expect(generated.createdIds.length).toBeGreaterThanOrEqual(1);

    const suggestions = await client.query(api.agentImprovementSuggestions.getRecentForAgent, { agentId });
    const skillSuggestion = suggestions.find((suggestion) => suggestion.type === "SKILL_INSTRUCTION_CHANGE");
    expect(skillSuggestion).toBeDefined();
    if (!skillSuggestion) throw new Error("Expected runtime skill improvement suggestion");
    expect(skillSuggestion).toMatchObject({
      sourceSkillId: approvalSkillId,
      sourceSkillVersionId: approvalBinding.skillVersionId,
      riskLevel: "HIGH",
    });
    const proposedPatch = JSON.parse(skillSuggestion.proposedPatchJson);
    expect(proposedPatch).toMatchObject({
      sourceSkillId: approvalSkillId,
      sourceSkillVersionId: approvalBinding.skillVersionId,
      evidenceSource: "runtime_trace",
    });
    expect(proposedPatch.attributionReason).toContain("approval tool overlap");
  });
});
