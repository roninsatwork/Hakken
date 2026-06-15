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
});
