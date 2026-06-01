import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const toolInput = {
  name: "CRM Lookup",
  description: "Look up CRM data for an agent.",
  handlerMapping: "crm.lookup",
  requiredRole: "ADMIN" as const,
};

describe("AI Tools Authorization", () => {
  test("standard users cannot manage tools but super admins can", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, superAdminId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });

      return { userId, superAdminId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(userClient.mutation(api.aiTools.createTool, toolInput)).rejects.toThrow(
      "Unauthorized: Only Super Admins can register system execution hooks."
    );

    const toolId = await superAdminClient.mutation(api.aiTools.createTool, toolInput);
    const tool = await t.run(async (ctx) => await ctx.db.get(toolId));

    expect(tool?.name).toBe(toolInput.name);
    expect(tool?.createdBy).toBe(superAdminId);
  });

  test("authenticated users can read tools while anonymous clients receive an empty catalog", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, toolId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const toolId = await ctx.db.insert("aiTools", {
        ...toolInput,
        createdAt: Date.now(),
        createdBy: superAdminId,
      });

      return { userId, toolId };
    });

    const userClient = t.withIdentity({ subject: userId });

    await expect(t.query(api.aiTools.getToolById, { id: toolId })).rejects.toThrow("Unauthenticated request");
    expect(await t.query(api.aiTools.getTools, {})).toEqual([]);

    const tools = await userClient.query(api.aiTools.getTools, {});
    const tool = await userClient.query(api.aiTools.getToolById, { id: toolId });
    const internalTool = await t.run(async (ctx) => ctx.runQuery(internal.aiTools.getToolInternal, { id: toolId }));

    expect(tools.map((entry) => entry.name)).toEqual([toolInput.name]);
    expect(tool?.handlerMapping).toBe(toolInput.handlerMapping);
    expect(internalTool?.name).toBe(toolInput.name);
  });

  test("super admins can update tools and standard users cannot", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, superAdminId, toolId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const toolId = await ctx.db.insert("aiTools", {
        ...toolInput,
        createdAt: Date.now(),
        createdBy: superAdminId,
      });

      return { userId, superAdminId, toolId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      userClient.mutation(api.aiTools.updateTool, {
        id: toolId,
        name: "Blocked Update",
        description: "Should fail",
        handlerMapping: "blocked.update",
        requiredRole: "ADMIN",
      })
    ).rejects.toThrow("Unauthorized: System modification requires supreme permissions.");

    await expect(
      superAdminClient.mutation(api.aiTools.updateTool, {
        id: toolId,
        name: "Updated CRM Lookup",
        description: "Updated description.",
        handlerMapping: "crm.updatedLookup",
        requiredRole: "SUPER_ADMIN",
      })
    ).resolves.toBe(toolId);

    const tool = await t.run(async (ctx) => await ctx.db.get(toolId));

    expect(tool).toMatchObject({
      name: "Updated CRM Lookup",
      description: "Updated description.",
      handlerMapping: "crm.updatedLookup",
      requiredRole: "SUPER_ADMIN",
    });
  });

  test("super admins can bind, unbind, and delete tools while cleaning agent bindings", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, superAdminId, agentId, toolId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Workflow Agent",
        modelId: "safe-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const toolId = await ctx.db.insert("aiTools", {
        ...toolInput,
        createdAt: Date.now(),
        createdBy: superAdminId,
      });

      return { userId, superAdminId, agentId, toolId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      userClient.mutation(api.aiTools.toggleAgentTool, {
        agentId,
        toolId,
        action: "BIND",
      })
    ).rejects.toThrow("Unauthorized");

    await superAdminClient.mutation(api.aiTools.toggleAgentTool, {
      agentId,
      toolId,
      action: "BIND",
    });
    await superAdminClient.mutation(api.aiTools.toggleAgentTool, {
      agentId,
      toolId,
      action: "BIND",
    });

    const boundTools = await userClient.query(api.aiTools.getAgentTools, { agentId });
    const bindingsAfterDuplicateBind = await t.run(async (ctx) =>
      ctx.db.query("agentTools").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect()
    );

    expect(boundTools.map((tool) => tool.name)).toEqual([toolInput.name]);
    expect(bindingsAfterDuplicateBind).toHaveLength(1);

    await superAdminClient.mutation(api.aiTools.toggleAgentTool, {
      agentId,
      toolId,
      action: "UNBIND",
    });

    expect(await userClient.query(api.aiTools.getAgentTools, { agentId })).toEqual([]);

    await superAdminClient.mutation(api.aiTools.toggleAgentTool, {
      agentId,
      toolId,
      action: "BIND",
    });

    await expect(userClient.mutation(api.aiTools.deleteTool, { id: toolId })).rejects.toThrow(
      "Unauthorized: Sonae architectural deletion prevented."
    );
    await expect(superAdminClient.mutation(api.aiTools.deleteTool, { id: toolId })).resolves.toBe(true);

    const { deletedTool, remainingBindings } = await t.run(async (ctx) => ({
      deletedTool: await ctx.db.get(toolId),
      remainingBindings: await ctx.db.query("agentTools").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect(),
    }));

    expect(deletedTool).toBeNull();
    expect(remainingBindings).toEqual([]);
  });
});
