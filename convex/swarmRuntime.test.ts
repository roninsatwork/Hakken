import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("Swarm runtime logs", () => {
  test("thread owners and anonymous widget threads can read ordered swarm logs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { ownerId, otherUserId, ownedThreadId, deletedThreadId, widgetThreadId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const ownerId = await ctx.db.insert("users", {
        email: "owner@example.com",
        role: "USER",
        companyId,
      });
      const otherUserId = await ctx.db.insert("users", {
        email: "other@example.com",
        role: "USER",
        companyId,
      });
      const widgetId = await ctx.db.insert("widgets", {
        name: "Widget",
        companyId,
        isActive: true,
        allowedDomains: [],
        createdBy: ownerId,
        createdAt: Date.now(),
      });
      const ownedThreadId = await ctx.db.insert("threads", {
        userId: ownerId,
        companyId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const widgetThreadId = await ctx.db.insert("threads", {
        widgetId,
        companyId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const deletedThreadId = await ctx.db.insert("threads", {
        userId: ownerId,
        companyId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.delete(deletedThreadId);

      return { ownerId, otherUserId, ownedThreadId, deletedThreadId, widgetThreadId, companyId };
    });

    const firstLogId = await t.mutation(internal.swarmRuntime.appendSwarmLog, {
      threadId: ownedThreadId,
      message: "Plan",
      status: "pending",
      order: 2,
      isHeading: true,
    });
    await t.mutation(internal.swarmRuntime.appendSwarmLog, {
      threadId: ownedThreadId,
      message: "Start",
      status: "running",
      order: 1,
    });
    await t.mutation(internal.swarmRuntime.appendSwarmLog, {
      threadId: widgetThreadId,
      message: "Widget log",
      status: "success",
      order: 1,
    });
    await t.mutation(internal.swarmRuntime.updateSwarmLogStatus, {
      logId: firstLogId,
      status: "success",
    });

    const ownerClient = t.withIdentity({ subject: ownerId });
    const otherClient = t.withIdentity({ subject: otherUserId });

    const ownerLogs = await ownerClient.query(api.swarmRuntime.getSwarmLogs, { threadId: ownedThreadId });
    expect(ownerLogs.map((log) => [log.message, log.status])).toEqual([
      ["Start", "running"],
      ["Plan", "success"],
    ]);
    expect(await otherClient.query(api.swarmRuntime.getSwarmLogs, { threadId: ownedThreadId })).toEqual([]);
    expect(await t.query(api.swarmRuntime.getSwarmLogs, { threadId: widgetThreadId })).toHaveLength(1);
    expect(await ownerClient.query(api.swarmRuntime.getSwarmLogs, { threadId: deletedThreadId })).toEqual([]);

    await t.mutation(internal.swarmRuntime.clearSwarmLogs, { threadId: ownedThreadId });
    expect(await ownerClient.query(api.swarmRuntime.getSwarmLogs, { threadId: ownedThreadId })).toEqual([]);

    const companyContext = await t.query(internal.swarmRuntime.getCompanyContextForThread, { threadId: ownedThreadId });
    expect(companyContext).toMatchObject({ name: "Company", companyId });
  });

  test("demo agent lookup returns configured agents in canonical order", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.run(async (ctx) => {
      for (const name of ["Executive Synthesis Agent", "Market Sourcing Agent"]) {
        await ctx.db.insert("agents", {
          name,
          modelId: "model-test",
          thinkingMode: false,
          isActive: true,
          temperature: 0.3,
          humanApprovalRequired: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    const demoAgents = await t.query(internal.swarmRuntime.getDemoAgents, {});
    expect(demoAgents.map((agent) => agent?.name)).toEqual(["Market Sourcing Agent", "Executive Synthesis Agent"]);
  });
});
