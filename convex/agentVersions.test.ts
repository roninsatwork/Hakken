import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Agent Versions", () => {
  test("agent snapshots are reused, increment after config changes, and stamp runs and fixtures", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, agentId, companyAId } = await t.run(async (ctx) => {
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
        name: "Versioned Agent",
        modelId: "model-test",
        modelSelectionMode: "override",
        thinkingMode: false,
        systemPrompt: "Use concise answers.",
        isActive: true,
        temperature: 0.2,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const toolId = await ctx.db.insert("aiTools", {
        name: "Knowledge Search",
        description: "Search knowledge.",
        handlerMapping: "knowledge.search",
        modelName: "search_knowledge",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        isActive: true,
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: adminAId,
      });
      await ctx.db.insert("agentTools", {
        agentId,
        toolId,
        assignedAt: Date.now(),
      });
      await ctx.db.insert("agentMemories", {
        agentId,
        companyId: companyAId,
        kind: "SUMMARY",
        content: "Use approved tenant context.",
        normalizedContent: "use approved tenant context.",
        importance: 0.7,
        isActive: true,
        createdAt: 100,
        updatedAt: 100,
        createdBy: adminAId,
      });

      return { adminAId, adminBId, agentId, companyAId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    const firstVersionId = await adminAClient.mutation(api.agentVersions.createSnapshot, { agentId });
    const reusedVersionId = await adminAClient.mutation(api.agentVersions.createSnapshot, { agentId });
    expect(reusedVersionId).toBe(firstVersionId);

    await expect(
      adminBClient.mutation(api.agentVersions.createSnapshot, { agentId, companyId: companyAId })
    ).rejects.toThrow("Unauthorized");

    await t.run(async (ctx) => {
      const agent = await ctx.db.get(agentId);
      if (!agent) throw new Error("Agent missing");
      await ctx.db.patch(agentId, {
        systemPrompt: `${agent.systemPrompt}\nInclude next action.`,
        updatedAt: Date.now(),
      });
    });

    const secondVersionId = await adminAClient.mutation(api.agentVersions.createSnapshot, { agentId });
    expect(secondVersionId).not.toBe(firstVersionId);

    const runId = await t.mutation(internal.agentRuns.createRunInternal, {
      agentId,
      companyId: companyAId,
      userId: adminAId,
      triggerType: "MANUAL",
      objective: "Versioned objective",
      status: "SUCCESS",
    });
    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run?.agentVersionId).toBe(secondVersionId);

    const fixtureId = await adminAClient.mutation(api.agentEvalFixtures.createFromRun, { runId });
    const fixture = await t.run(async (ctx) => await ctx.db.get(fixtureId));
    expect(fixture?.agentVersionId).toBe(secondVersionId);

    const versions = await adminAClient.query(api.agentVersions.getForAgent, { agentId, paginationOpts });
    expect(versions.page.map((version) => version.versionNumber)).toEqual([2, 1]);
    expect(versions.page[0]).toMatchObject({
      _id: secondVersionId,
      agentId,
      companyId: companyAId,
    });

    const detail = await adminAClient.query(api.agentVersions.getVersionDetail, { versionId: secondVersionId });
    expect(detail?.stats).toMatchObject({
      runs: 1,
      fixtures: 1,
      successRate: 1,
      costUsd: 0,
    });
    expect(detail?.version.snapshotJson).toContain("Include next action");

    await expect(adminBClient.query(api.agentVersions.getVersionDetail, { versionId: secondVersionId })).rejects.toThrow(
      "Unauthorized"
    );
  });
});

