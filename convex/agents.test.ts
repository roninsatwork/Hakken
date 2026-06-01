import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { SYSTEM_FAILSAFE_MODEL_ID } from "./aiModelService";

describe("OWASP: Broken Access Control - Agents", () => {
  test("Standard USER cannot execute any Agent CRUD operations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.query(api.agents.list)
    ).rejects.toThrow("Unauthorized");

    await expect(
      maliciousClient.mutation(api.agents.createAgent, { name: "Rogue Agent" })
    ).rejects.toThrow("Unauthorized");

    // Pass a valid dummy ID to bypass schema strictness
    const dummyAgentId = await t.run(async (ctx) => {
      return await ctx.db.insert("agents", {
         name: "Dummy",
         modelId: "test-model",
         thinkingMode: false,
         isActive: true,
         temperature: 1.0,
         humanApprovalRequired: false,
         createdAt: Date.now(),
         updatedAt: Date.now(),
      });
    });

    await expect(
      maliciousClient.mutation(api.agents.deleteAgent, { id: dummyAgentId })
    ).rejects.toThrow("Unauthorized");
  });

  test("New agents use the platform failsafe when the configured default is disabled", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });

      await ctx.db.insert("aiModels", {
        modelId: "disabled-default",
        displayName: "Disabled Default",
        isEnabled: false,
        isDefault: true,
        lastSyncedAt: Date.now()
      });

      return userId;
    });

    const client = t.withIdentity({ subject: adminId });
    const agentId = await client.mutation(api.agents.createAgent, { name: "Fallback Agent" });

    const agent = await t.run(async (ctx) => await ctx.db.get(agentId));
    expect(agent?.modelId).toBe(SYSTEM_FAILSAFE_MODEL_ID);
  });

  test("SUPER_ADMIN can create, list, get, update, and delete global agents with audit logs and binding cleanup", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });

      await ctx.db.insert("aiModels", {
        modelId: "default-agent-model",
        displayName: "Default Agent Model",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: Date.now()
      });

      return adminId;
    });

    const client = t.withIdentity({ subject: adminId });
    const agentId = await client.mutation(api.agents.createAgent, {
      name: "Support Agent",
      description: "Handles support workflows.",
    });

    const [listedAgent] = await client.query(api.agents.list, {});
    const fetchedAgent = await client.query(api.agents.get, { id: agentId });

    expect(listedAgent._id).toBe(agentId);
    expect(fetchedAgent).toMatchObject({
      name: "Support Agent",
      description: "Handles support workflows.",
      modelId: "default-agent-model",
      isActive: true,
    });

    await expect(
      client.mutation(api.agents.updateAgent, {
        id: agentId,
        name: "Updated Support Agent",
        modelId: "new-agent-model",
        thinkingMode: true,
        temperature: 0.4,
        humanApprovalRequired: true,
      })
    ).resolves.toBe(agentId);

    const toolId = await t.run(async (ctx) => {
      const toolId = await ctx.db.insert("aiTools", {
        name: "CRM Lookup",
        description: "Lookup CRM records.",
        handlerMapping: "crm.lookup",
        requiredRole: "ADMIN",
        createdAt: Date.now(),
        createdBy: adminId,
      });
      await ctx.db.insert("agentTools", {
        agentId,
        toolId,
        assignedAt: Date.now(),
      });
      return toolId;
    });

    await expect(client.mutation(api.agents.deleteAgent, { id: agentId })).resolves.toBe(true);

    const { deletedAgent, remainingBindings, auditLogs } = await t.run(async (ctx) => ({
      deletedAgent: await ctx.db.get(agentId),
      remainingBindings: await ctx.db.query("agentTools").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect(),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(deletedAgent).toBeNull();
    expect(remainingBindings).toEqual([]);
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_AGENT",
      "UPDATE_AGENT",
      "DELETE_AGENT",
    ]);
    const auditMetadata = auditLogs.map((log) => JSON.parse(log.metadata || "{}"));
    expect(auditMetadata[0]).toEqual({ name: "Support Agent", scope: "global" });
    expect(auditMetadata[1].updatedFields.toSorted()).toEqual([
      "humanApprovalRequired",
      "modelId",
      "name",
      "temperature",
      "thinkingMode",
    ]);
    expect(auditMetadata[2]).toEqual({ name: "Updated Support Agent" });
  });

  test("SUPER_ADMIN can create inline workflow agents and promote them to global", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, workflowId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });
      await ctx.db.insert("aiModels", {
        modelId: "workflow-model",
        displayName: "Workflow Model",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: Date.now()
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Workflow",
        isActive: true,
        triggerType: "MANUAL",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: adminId,
      });

      return { adminId, workflowId };
    });

    const client = t.withIdentity({ subject: adminId });

    const inlineAgentId = await client.mutation(api.agents.createInlineAgent, { workflowId });
    const inlineAgent = await t.run(async (ctx) => ctx.runQuery(internal.agents.getAgentInternal, { id: inlineAgentId }));

    expect(inlineAgent).toMatchObject({
      name: "Sandbox Agent",
      isGlobal: false,
      workflowId,
      modelId: "workflow-model",
    });
    expect(await client.query(api.agents.list, {})).toEqual([]);

    await expect(client.mutation(api.agents.promoteToGlobal, { id: inlineAgentId })).resolves.toBe(true);

    const promotedAgent = await t.run(async (ctx) => ctx.runQuery(internal.agents.getAgentInternal, { id: inlineAgentId }));
    const activeAgents = await t.run(async (ctx) => ctx.runQuery(internal.agents.getForCompanyInternal, {}));
    const auditLogs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());

    expect(promotedAgent?.isGlobal).toBe(true);
    expect(promotedAgent?.workflowId).toBeUndefined();
    expect((await client.query(api.agents.list, {})).map((agent) => agent._id)).toEqual([inlineAgentId]);
    expect(activeAgents.map((agent) => agent._id)).toEqual([inlineAgentId]);
    expect(auditLogs.map((log) => log.actionType)).toEqual(["CREATE_AGENT", "UPDATE_AGENT"]);
    expect(auditLogs.map((log) => JSON.parse(log.metadata || "{}"))).toEqual([
      { scope: "inline_workflow", workflowId },
      { action: "promoted_to_global" },
    ]);
  });
});
