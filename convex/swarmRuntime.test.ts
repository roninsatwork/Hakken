import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { digestWidgetAccessToken } from "./chatService";
import schema from "./schema";

const WIDGET_ACCESS_TOKEN = "widget-session-token";

describe("Swarm runtime logs", () => {
  test("thread owners and token-bearing widget sessions can read ordered swarm logs", async () => {
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
        widgetAccessTokenHash: await digestWidgetAccessToken(WIDGET_ACCESS_TOKEN),
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
    expect(await ownerClient.query(api.swarmRuntime.getSwarmLogs, { threadId: deletedThreadId })).toEqual([]);

    // Swarm logs carry agent reasoning and tool-dispatch traces, so an
    // anonymous widget thread id alone must not unlock them. Only a caller
    // holding the widget session token may read them.
    expect(
      await t.query(api.swarmRuntime.getSwarmLogs, { threadId: widgetThreadId }),
    ).toEqual([]);
    expect(
      await t.query(api.swarmRuntime.getSwarmLogs, {
        threadId: widgetThreadId,
        widgetAccessToken: "wrong-token",
      }),
    ).toEqual([]);
    expect(
      await t.query(api.swarmRuntime.getSwarmLogs, {
        threadId: widgetThreadId,
        widgetAccessToken: WIDGET_ACCESS_TOKEN,
      }),
    ).toHaveLength(1);

    await t.mutation(internal.swarmRuntime.clearSwarmLogs, { threadId: ownedThreadId });
    expect(await ownerClient.query(api.swarmRuntime.getSwarmLogs, { threadId: ownedThreadId })).toEqual([]);

    const companyContext = await t.query(internal.swarmRuntime.getCompanyContextForThread, { threadId: ownedThreadId });
    expect(companyContext).toMatchObject({ name: "Company", companyId });

    // Log rows carry the owning thread's tenant so they can be scoped and
    // purged by company without joining back through threads.
    const stampedTenants = await t.run(async (ctx) =>
      (await ctx.db.query("swarmLogs").collect()).map((log) => log.companyId),
    );
    expect(stampedTenants.length).toBeGreaterThan(0);
    expect(stampedTenants.every((tenant) => tenant === companyId)).toBe(true);
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
