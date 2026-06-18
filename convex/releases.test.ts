import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("release readiness overview", () => {
  test("requires super admin access", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
      });
    });

    await expect(
      t.withIdentity({ subject: userId }).query(api.releases.getReleaseReadinessOverview, {})
    ).rejects.toThrow("Unauthorized");
  });

  test("summarizes draft, ready, and live agent release states", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const superAdminId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "super@example.com",
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
    const client = t.withIdentity({ subject: superAdminId });

    const blockedDraftId = await client.mutation(api.agents.createAgent, {
      name: "Blocked Draft",
      description: "Missing release prerequisites.",
    });
    const readyAgentId = await client.mutation(api.agents.createAgent, {
      name: "Ready Candidate",
      description: "Prepared for release review.",
    });
    await client.mutation(api.agents.createAgent, {
      name: "Live Needs Attention",
      description: "Active but missing coverage.",
    });

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(blockedDraftId, {
        isActive: false,
      });
      const toolId = await ctx.db.insert("aiTools", {
        name: "Knowledge Search",
        description: "Searches approved knowledge.",
        handlerMapping: "knowledge.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        isActive: true,
        createdAt: now,
        createdBy: superAdminId,
      });
      await ctx.db.insert("agentTools", {
        agentId: readyAgentId,
        toolId,
        assignedAt: now,
      });
      const knowledgeDocumentId = await ctx.db.insert("knowledgeDocuments", {
        title: "Release Handbook",
        textContent: "Approved launch guidance.",
        agentId: readyAgentId,
        status: "ready",
        format: "text/plain",
        createdBy: superAdminId,
        createdAt: now,
      });
      await ctx.db.patch(readyAgentId, {
        isActive: false,
        knowledgeDocumentIds: [knowledgeDocumentId],
      });
      const setupRunId = await ctx.db.insert("agentRuns", {
        agentId: readyAgentId,
        triggerType: "MANUAL",
        objective: "Template setup: Ready Candidate",
        status: "SUCCESS",
        startedAt: now - 2,
        completedAt: now - 1,
        updatedAt: now - 1,
      });
      await ctx.db.insert("agentEvalFixtures", {
        agentId: readyAgentId,
        sourceRunId: setupRunId,
        createdBy: superAdminId,
        type: "HAPPY_PATH",
        objective: "Answer using the release handbook.",
        expectedToolPlanJson: JSON.stringify([{ handlerMapping: "knowledge.search" }]),
        expectedFinalOutputRubric: "Uses the release handbook.",
        sourceEvidenceJson: JSON.stringify({ source: "test" }),
        tags: ["release-gate", "smoke"],
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    });

    await client.mutation(api.agentEvalFixtures.runSmokeEval, { agentId: readyAgentId });

    const overview = await client.query(api.releases.getReleaseReadinessOverview, {});
    expect(overview.summary).toMatchObject({
      total: 3,
      DRAFT_BLOCKED: 1,
      READY_FOR_RELEASE: 1,
      LIVE_NEEDS_ATTENTION: 1,
      LIVE: 0,
    });
    expect(overview.agents.find((agent) => agent.name === "Ready Candidate")).toMatchObject({
      status: "READY_FOR_RELEASE",
      activeEvalFixtureCount: 1,
      successfulSmokeEvalRunCount: 1,
      nextAction: "Review release notes, owner, and activation window.",
    });
    expect(overview.agents.find((agent) => agent.name === "Blocked Draft")).toMatchObject({
      status: "DRAFT_BLOCKED",
      activationRisk: false,
    });

    const activationWindowStart = Date.now() - 60_000;
    const activationWindowEnd = Date.now() + 60_000;
    await expect(client.mutation(api.releases.createReleaseCandidate, {
      agentId: readyAgentId,
      title: "Invalid Window",
      activationWindowStart: activationWindowEnd,
      activationWindowEnd: activationWindowStart,
    })).rejects.toThrow("Activation window end must be after the start.");

    const releaseId = await client.mutation(api.releases.createReleaseCandidate, {
      agentId: readyAgentId,
      title: "Ready Candidate v1",
      ownerEmail: "release-owner@example.com",
      activationWindowStart,
      activationWindowEnd,
    });
    await expect(client.mutation(api.releases.approveReleaseCandidate, {
      releaseId,
      approvalComment: "Reviewed smoke eval, release gate, and rollback plan.",
    })).resolves.toBe(releaseId);
    await expect(client.mutation(api.releases.activateReleaseCandidate, { releaseId })).resolves.toBe(releaseId);
    const activeAgent = await t.run(async (ctx) => await ctx.db.get(readyAgentId));
    expect(activeAgent?.isActive).toBe(true);

    const recentReleases = await client.query(api.releases.getRecentReleases, {});
    expect(recentReleases[0]).toMatchObject({
      _id: releaseId,
      agentId: readyAgentId,
      agentName: "Ready Candidate",
      title: "Ready Candidate v1",
      status: "ACTIVATED",
      versionNumber: 1,
      ownerEmail: "release-owner@example.com",
      approvalComment: "Reviewed smoke eval, release gate, and rollback plan.",
      activationWindowStart,
      activationWindowEnd,
    });
    expect(recentReleases[0]?.evidenceSummary).toMatchObject({
      summary: "Release evidence was complete when this record was created or refreshed.",
      items: expect.arrayContaining([
        { label: "Smoke evals", value: "1 passed", status: "PASS" },
        { label: "Release gate", value: "1/1 critical passed", status: "PASS" },
      ]),
    });
    expect(recentReleases[0]?.nextAction).toMatchObject({
      tone: "REVIEW",
      label: "Monitor live release",
    });

    await expect(client.mutation(api.releases.rollbackRelease, {
      releaseId,
      rollbackReason: "Regression found in post-release run review.",
    })).resolves.toBe(releaseId);
    const rolledBackAgent = await t.run(async (ctx) => await ctx.db.get(readyAgentId));
    expect(rolledBackAgent?.isActive).toBe(false);
    const rolledBackReleases = await client.query(api.releases.getRecentReleases, {});
    expect(rolledBackReleases[0]).toMatchObject({
      _id: releaseId,
      status: "ROLLED_BACK",
      rollbackReason: "Regression found in post-release run review.",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(readyAgentId, {
        systemPrompt: "Use the release handbook and include a concise escalation summary.",
        updatedAt: Date.now(),
      });
    });
    const changedReleaseId = await client.mutation(api.releases.createReleaseCandidate, {
      agentId: readyAgentId,
      title: "Ready Candidate v2",
    });
    const comparedReleases = await client.query(api.releases.getRecentReleases, {});
    const changedRelease = comparedReleases.find((release) => release._id === changedReleaseId);
    expect(changedRelease?.snapshotComparison).toMatchObject({
      baselineReleaseId: releaseId,
      baselineTitle: "Ready Candidate v1",
      baselineVersionNumber: 1,
      currentVersionNumber: 2,
      changedAreas: ["Prompt and schemas"],
      details: [{
        area: "Prompt and schemas",
        before: "Prompt: Empty | Input: None | Output: None",
        after: "Prompt: Use the release handbook and include a concise escalation summary. | Input: None | Output: None",
      }],
    });
    await expect(client.mutation(api.releases.cancelReleaseCandidate, {
      releaseId: changedReleaseId,
      cancellationReason: "Superseded before activation.",
    })).resolves.toBe(changedReleaseId);
    const cancelledReleases = await client.query(api.releases.getRecentReleases, {});
    expect(cancelledReleases.find((release) => release._id === changedReleaseId)).toMatchObject({
      status: "CANCELLED",
      cancellationReason: "Superseded before activation.",
    });

    const scheduledActivationNow = Date.now();
    const restoreReleaseId = await client.mutation(api.releases.createReleaseCandidate, {
      agentId: readyAgentId,
      title: "Ready Candidate v3",
      activationWindowStart: scheduledActivationNow - 1,
      activationWindowEnd: scheduledActivationNow + 60_000,
    });
    await expect(client.mutation(api.releases.approveReleaseCandidate, {
      releaseId: restoreReleaseId,
      approvalComment: "Approve changed prompt for rollback restore coverage.",
    })).resolves.toBe(restoreReleaseId);
    await expect(t.mutation(internal.releases.activateDueReleaseCandidates, {
      now: scheduledActivationNow,
    })).resolves.toMatchObject({
      checked: 1,
      activated: 1,
      failed: 0,
    });
    const changedPromptAgent = await t.run(async (ctx) => await ctx.db.get(readyAgentId));
    expect(changedPromptAgent).toMatchObject({
      isActive: true,
      systemPrompt: "Use the release handbook and include a concise escalation summary.",
    });

    await expect(client.mutation(api.releases.rollbackRelease, {
      releaseId: restoreReleaseId,
      rollbackReason: "Restore the previous live prompt after review.",
    })).resolves.toBe(restoreReleaseId);
    const restoredAgent = await t.run(async (ctx) => await ctx.db.get(readyAgentId));
    expect(restoredAgent).toMatchObject({
      isActive: true,
      systemPrompt: "",
    });
    const restoredReleases = await client.query(api.releases.getRecentReleases, {});
    expect(restoredReleases.find((release) => release._id === restoreReleaseId)).toMatchObject({
      status: "ROLLED_BACK",
      rollbackReason: "Restore the previous live prompt after review.",
    });
  });
});
