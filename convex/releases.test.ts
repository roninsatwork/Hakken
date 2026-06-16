import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
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

    const releaseId = await client.mutation(api.releases.createReleaseCandidate, {
      agentId: readyAgentId,
      title: "Ready Candidate v1",
    });
    await expect(client.mutation(api.releases.approveReleaseCandidate, { releaseId })).resolves.toBe(releaseId);
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
    });

    await expect(client.mutation(api.releases.rollbackRelease, { releaseId })).resolves.toBe(releaseId);
    const rolledBackAgent = await t.run(async (ctx) => await ctx.db.get(readyAgentId));
    expect(rolledBackAgent?.isActive).toBe(false);
    const rolledBackReleases = await client.query(api.releases.getRecentReleases, {});
    expect(rolledBackReleases[0]).toMatchObject({
      _id: releaseId,
      status: "ROLLED_BACK",
    });
  });
});
