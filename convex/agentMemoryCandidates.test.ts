import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Agent Memory Candidates", () => {
  test("admins can generate, approve, reject, and auto-apply scoped memory candidates", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, agentId, successRunId, failedRunId } = await t.run(async (ctx) => {
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
        name: "Memory Candidate Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const successRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Summarize pipeline risk",
        status: "SUCCESS",
        finalOutput: "Pipeline risk summary completed.",
        startedAt: 100,
        completedAt: 130,
        updatedAt: 130,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: successRunId,
        agentId,
        companyId: companyAId,
        userId: adminAId,
        rating: "POSITIVE",
        labels: ["GOOD_ANSWER"],
        comment: "Good structure.",
        createdAt: 140,
        updatedAt: 140,
      });

      const failedRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "WORKFLOW",
        objective: "Prepare escalation summary",
        status: "FAILED",
        error: "Missing context",
        startedAt: 200,
        completedAt: 240,
        updatedAt: 240,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: failedRunId,
        agentId,
        companyId: companyAId,
        userId: adminAId,
        rating: "NEGATIVE",
        labels: ["MISSED_CONTEXT"],
        comment: "The escalation summary must include owner, blocker, and next action.",
        createdAt: 245,
        updatedAt: 245,
      });
      await ctx.db.insert("agentRunReflections", {
        runId: failedRunId,
        agentId,
        companyId: companyAId,
        createdBy: adminAId,
        category: "MISSING_CONTEXT",
        sourceStatus: "FAILED",
        objectiveSummary: "Prepare escalation summary",
        rootCause: "The agent lacked the approved escalation summary format.",
        missingContext: "Escalation summary format",
        proposedMemory: "Escalation summaries should include owner, blocker, and next action.",
        proposedEvalFixture: "Create an eval for escalation summaries.",
        confidence: 0.8,
        evidenceJson: "{}",
        status: "GENERATED",
        createdAt: 250,
        updatedAt: 250,
      });

      return { adminAId, adminBId, agentId, successRunId, failedRunId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await expect(
      adminBClient.mutation(api.agentMemoryCandidates.generateForRun, {
        runId: successRunId,
      })
    ).rejects.toThrow("Unauthorized");

    const successResult = await adminAClient.mutation(api.agentMemoryCandidates.generateForRun, {
      runId: successRunId,
      autoApplyLowRisk: true,
    });
    expect(successResult.createdIds).toHaveLength(1);
    expect(successResult.appliedIds).toHaveLength(1);

    const failedResult = await adminAClient.mutation(api.agentMemoryCandidates.generateForRun, {
      runId: failedRunId,
      autoApplyLowRisk: false,
    });
    expect(failedResult.createdIds).toHaveLength(2);
    expect(failedResult.appliedIds).toHaveLength(0);

    const duplicateResult = await adminAClient.mutation(api.agentMemoryCandidates.generateForRun, {
      runId: failedRunId,
      autoApplyLowRisk: false,
    });
    expect(duplicateResult.createdIds).toHaveLength(0);

    const suggestionId = await t.run(async (ctx) => {
      return await ctx.db.insert("agentImprovementSuggestions", {
        agentId,
        companyId: (await ctx.db.get(failedRunId))?.companyId,
        sourceRunId: failedRunId,
        createdBy: adminAId,
        type: "PROMPT_CHANGE",
        title: "Add escalation summary guidance",
        description: "Teach the agent to include owner, blocker, and next action in escalation summaries.",
        proposedPatchJson: JSON.stringify({ appendSystemPrompt: "Escalation summaries require owner, blocker, and next action." }),
        riskLevel: "HIGH",
        status: "PROPOSED",
        createdAt: 260,
        updatedAt: 260,
      });
    });

    const reviewInbox = await adminAClient.query(api.agentMemoryCandidates.getReviewInboxForAgent, { agentId });
    expect(reviewInbox.totals).toMatchObject({
      open: 4,
      memoryCandidates: 2,
      improvementSuggestions: 1,
      reflections: 1,
      highRisk: 1,
    });
    expect(reviewInbox.memoryCandidates.map((candidate) => candidate.candidateId).sort()).toEqual(
      failedResult.createdIds.map((id) => id).sort()
    );
    expect(reviewInbox.memoryCandidates[0]?.sourceRun).toMatchObject({
      runId: failedRunId,
      status: "FAILED",
      objective: "Prepare escalation summary",
    });
    expect(reviewInbox.improvementSuggestions).toEqual([
      expect.objectContaining({
        suggestionId,
        type: "PROMPT_CHANGE",
        riskLevel: "HIGH",
        sourceRun: expect.objectContaining({ runId: failedRunId }),
        patchPreview: [
          expect.objectContaining({
            operation: "APPEND",
            target: "Agent system prompt",
            after: "Escalation summaries require owner, blocker, and next action.",
          }),
        ],
      }),
    ]);
    expect(reviewInbox.reflections).toEqual([
      expect.objectContaining({
        category: "MISSING_CONTEXT",
        riskLevel: "LOW",
        proposedEvalFixture: "Create an eval for escalation summaries.",
      }),
    ]);
    const highRiskInbox = await adminAClient.query(api.agentMemoryCandidates.getReviewInboxForAgent, {
      agentId,
      mode: "HIGH_RISK",
    });
    expect(highRiskInbox.totals).toMatchObject({
      open: 1,
      memoryCandidates: 0,
      improvementSuggestions: 1,
      reflections: 0,
      highRisk: 1,
    });

    const otherTenantInbox = await adminBClient.query(api.agentMemoryCandidates.getReviewInboxForAgent, { agentId });
    expect(otherTenantInbox.totals.open).toBe(0);

    const failedCandidates = await adminAClient.query(api.agentMemoryCandidates.getForRun, {
      runId: failedRunId,
      paginationOpts,
    });
    expect(failedCandidates.page).toHaveLength(2);
    expect(failedCandidates.page.map((candidate) => candidate.status)).toEqual(["PROPOSED", "PROPOSED"]);
    expect(failedCandidates.page.map((candidate) => candidate.kind).sort()).toEqual(["FACT", "FACT"]);

    const recentProposed = await adminAClient.query(api.agentMemoryCandidates.getRecentForAgent, { agentId });
    expect(recentProposed.map((candidate) => candidate._id).sort()).toEqual(
      failedResult.createdIds.map((id) => id).sort()
    );

    await expect(adminBClient.query(api.agentMemoryCandidates.getForRun, { runId: failedRunId, paginationOpts })).rejects.toThrow(
      "Unauthorized"
    );

    await adminAClient.mutation(api.agentMemoryCandidates.decideCandidate, {
      candidateId: failedResult.createdIds[0],
      decision: "APPROVED",
    });
    await adminAClient.mutation(api.agentMemoryCandidates.decideCandidate, {
      candidateId: failedResult.createdIds[1],
      decision: "REJECTED",
      rejectionReason: "Too vague",
    });
    const reviewedInbox = await adminAClient.query(api.agentMemoryCandidates.getReviewInboxForAgent, {
      agentId,
      mode: "REVIEWED",
    });
    expect(reviewedInbox.totals).toMatchObject({
      open: 3,
      memoryCandidates: 3,
      improvementSuggestions: 0,
      reflections: 0,
      highRisk: 0,
    });
    expect(reviewedInbox.memoryCandidates.map((candidate) => candidate.status).sort()).toEqual(["APPLIED", "APPLIED", "REJECTED"]);
    expect(reviewedInbox.memoryCandidates.every((candidate) => candidate.reviewedAt)).toBe(true);
    expect(reviewedInbox.memoryCandidates.every((candidate) => candidate.reviewer?.email === "admin-a@example.com")).toBe(true);

    const state = await t.run(async (ctx) => ({
      successCandidate: await ctx.db.get(successResult.createdIds[0]),
      approvedCandidate: await ctx.db.get(failedResult.createdIds[0]),
      rejectedCandidate: await ctx.db.get(failedResult.createdIds[1]),
      memories: await ctx.db.query("agentMemories").collect(),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(state.successCandidate).toMatchObject({
      status: "APPLIED",
      kind: "SUMMARY",
      riskLevel: "LOW",
      reviewedBy: adminAId,
    });
    expect(state.approvedCandidate).toMatchObject({
      status: "APPLIED",
      reviewedBy: adminAId,
    });
    expect(state.rejectedCandidate).toMatchObject({
      status: "REJECTED",
      reviewedBy: adminAId,
      rejectionReason: "Too vague",
    });
    expect(state.memories).toHaveLength(2);
    expect(state.memories.map((memory) => memory.sourceRunId).sort()).toEqual([failedRunId, successRunId].sort());
    expect(state.auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_AGENT_MEMORY_CANDIDATE",
      "APPLY_AGENT_MEMORY_CANDIDATE",
      "CREATE_AGENT_MEMORY_CANDIDATE",
      "CREATE_AGENT_MEMORY_CANDIDATE",
      "APPLY_AGENT_MEMORY_CANDIDATE",
      "REJECT_AGENT_MEMORY_CANDIDATE",
    ]);
  });
});
