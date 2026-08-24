import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { MCP_TOOL_HANDLER } from "./mcpToolPolicy";

/**
 * Importing a server's tools into the library, and taking them away again.
 *
 * The proof that matters here is ownership: a tool that arrived from a company's
 * server must carry that company, because that field is what the runtime reads
 * when it decides whether a shared agent may be offered it.
 */

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const companyAId = await t.run(async (ctx) =>
    await ctx.db.insert("companies", {
      name: "Acme", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS],
    }));
  const companyBId = await t.run(async (ctx) =>
    await ctx.db.insert("companies", {
      name: "Northwind", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS],
    }));

  const adminA = t.withIdentity({
    subject: await t.run(async (ctx) =>
      await ctx.db.insert("users", { email: "a@test.com", role: "ADMIN", companyId: companyAId })),
  });
  const adminB = t.withIdentity({
    subject: await t.run(async (ctx) =>
      await ctx.db.insert("users", { email: "b@test.com", role: "ADMIN", companyId: companyBId })),
  });

  const serverId = await adminA.mutation(api.mcpServers.createServer, {
    name: "Finance", url: "https://finance.example.com/mcp", authMode: "NONE",
  });

  return { t, adminA, adminB, companyAId, companyBId, serverId };
}

/** Stand in for a completed discovery, without the network. */
async function seedDiscovered(
  t: Awaited<ReturnType<typeof setup>>["t"],
  serverId: Id<"mcpServers">,
  companyId: Id<"companies">,
  names: string[],
) {
  await t.run(async (ctx) => {
    for (const name of names) {
      await ctx.db.insert("mcpServerTools", {
        serverId,
        companyId,
        name,
        description: `Does ${name}.`,
        inputSchemaJson: JSON.stringify({ type: "object", properties: {} }),
        discoveredAt: Date.now(),
      });
    }
  });
}

describe("importing a server's tools", () => {
  test("every imported tool carries the company that owns the server", async () => {
    // This field is the boundary. If it is ever absent, the tool is global and
    // every company's agents can reach one company's system.
    const { t, adminA, companyAId, serverId } = await setup();
    await seedDiscovered(t, serverId, companyAId, ["get_invoice", "list_invoices"]);

    const result = await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });
    expect(result.created).toBe(2);

    const tools = await t.run(async (ctx) => await ctx.db.query("aiTools").collect());
    expect(tools).toHaveLength(2);
    for (const tool of tools) {
      expect(tool.companyId).toBe(companyAId);
      expect(tool.mcpServerId).toBe(serverId);
    }
  });

  test("imported tools arrive switched off and always needing approval", async () => {
    const { t, adminA, companyAId, serverId } = await setup();
    await seedDiscovered(t, serverId, companyAId, ["delete_everything"]);

    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });

    const [tool] = await t.run(async (ctx) => await ctx.db.query("aiTools").collect());
    expect(tool.isActive).toBe(false);
    expect(tool.sideEffectLevel).toBe("EXTERNAL");
    expect(tool.confirmationRequired).toBe(true);
  });

  test("imported tools route through the one registered handler", async () => {
    // Every tool from every server shares this entry. It was briefly one per
    // tool, back when the routing key was also the name a model saw; phase 4
    // separated them and routing went back to a single deliberate addition.
    const { t, adminA, companyAId, serverId } = await setup();
    await seedDiscovered(t, serverId, companyAId, ["get_invoice"]);

    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });

    const [tool] = await t.run(async (ctx) => await ctx.db.query("aiTools").collect());
    expect(tool.handlerMapping).toBe(MCP_TOOL_HANDLER);
    // What the server itself calls it, kept so the prefix never has to be
    // reversed at the moment of use.
    expect(tool.mcpToolName).toBe("get_invoice");

    const { isExecutableToolMapping } = await import("./aiToolExecutionService");
    expect(isExecutableToolMapping(MCP_TOOL_HANDLER)).toBe(true);
  });

  test("tools share one routing key but are named apart for the model", async () => {
    // Phase 3 briefly gave each tool its own routing key, because the routing
    // key *was* the model-facing name. Phase 4 separated them, so routing goes
    // back to one entry and the distinct names live in their own field.
    const { t, adminA, companyAId, serverId } = await setup();
    await seedDiscovered(t, serverId, companyAId, ["get_invoice", "list_invoices"]);
    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });

    const tools = await t.run(async (ctx) => await ctx.db.query("aiTools").collect());
    expect(new Set(tools.map((tool) => tool.handlerMapping)).size).toBe(1);
    expect(new Set(tools.map((tool) => tool.modelName)).size).toBe(2);
  });

  test("names are prefixed by the server, so two servers cannot collide", async () => {
    const { t, adminA, companyAId, serverId } = await setup();
    await seedDiscovered(t, serverId, companyAId, ["search"]);
    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });

    const otherId = await adminA.mutation(api.mcpServers.createServer, {
      name: "Warehouse", url: "https://warehouse.example.com/mcp", authMode: "NONE",
    });
    await seedDiscovered(t, otherId, companyAId, ["search"]);
    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId: otherId });

    const names = (await t.run(async (ctx) => await ctx.db.query("aiTools").collect()))
      .map((tool) => tool.name).sort();
    expect(names).toEqual(["finance_search", "warehouse_search"]);
  });

  test("re-importing replaces, so a withdrawn tool disappears", async () => {
    const { t, adminA, companyAId, serverId } = await setup();
    await seedDiscovered(t, serverId, companyAId, ["get_invoice"]);
    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });

    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("mcpServerTools").collect()) await ctx.db.delete(row._id);
    });
    await seedDiscovered(t, serverId, companyAId, ["something_else"]);
    const result = await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });

    expect(result.removed).toBe(1);
    const names = (await t.run(async (ctx) => await ctx.db.query("aiTools").collect()))
      .map((tool) => tool.name);
    expect(names).toEqual(["finance_something_else"]);
  });

  test("one company cannot import against another's server", async () => {
    const { t, adminB, companyAId, serverId } = await setup();
    await seedDiscovered(t, serverId, companyAId, ["get_invoice"]);

    await expect(adminB.mutation(api.mcpToolPromotion.importServerTools, { serverId }))
      .rejects.toThrowError(/does not exist/);
  });
});

describe("disconnecting a server", () => {
  test("takes its tools and every binding with it", async () => {
    // An agent left holding a binding to a tool whose server is gone fails
    // mid-task, rather than at the moment somebody could have noticed.
    const { t, adminA, companyAId, serverId } = await setup();
    await seedDiscovered(t, serverId, companyAId, ["get_invoice"]);
    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });

    const [tool] = await t.run(async (ctx) => await ctx.db.query("aiTools").collect());
    const agentId = await t.run(async (ctx) => await ctx.db.insert("agents", {
      name: "Shared Agent", avatar: "a.png", systemPrompt: "Be concise.",
      modelId: "test-model", thinkingMode: false, isActive: true,
      createdAt: Date.now(), updatedAt: Date.now(),
    }));
    await t.run(async (ctx) =>
      await ctx.db.insert("agentTools", { agentId, toolId: tool._id, assignedAt: Date.now() }));

    await adminA.mutation(api.mcpServers.deleteServer, { id: serverId });

    expect(await t.run(async (ctx) => await ctx.db.query("aiTools").collect())).toHaveLength(0);
    expect(await t.run(async (ctx) => await ctx.db.query("agentTools").collect())).toHaveLength(0);
    expect(await t.run(async (ctx) => await ctx.db.query("mcpServerTools").collect())).toHaveLength(0);
  });

  test("leaves another server's tools alone", async () => {
    const { t, adminA, companyAId, serverId } = await setup();
    await seedDiscovered(t, serverId, companyAId, ["get_invoice"]);
    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });

    const otherId = await adminA.mutation(api.mcpServers.createServer, {
      name: "Warehouse", url: "https://warehouse.example.com/mcp", authMode: "NONE",
    });
    await seedDiscovered(t, otherId, companyAId, ["stock_level"]);
    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId: otherId });

    await adminA.mutation(api.mcpServers.deleteServer, { id: serverId });

    const names = (await t.run(async (ctx) => await ctx.db.query("aiTools").collect()))
      .map((tool) => tool.name);
    expect(names).toEqual(["warehouse_stock_level"]);
  });

  test("leaves tools that were never from a server alone", async () => {
    // Every pre-existing tool is global and belongs to nobody. Disconnecting a
    // server must not touch the platform's own library.
    const { t, adminA, companyAId, serverId } = await setup();
    await t.run(async (ctx) => await ctx.db.insert("aiTools", {
      name: "search_knowledge", description: "Search knowledge.",
      handlerMapping: "knowledge.search",
      modelName: "search_knowledge", requiredRole: "ADMIN",
      isActive: true, createdAt: Date.now(),
    }));
    await seedDiscovered(t, serverId, companyAId, ["get_invoice"]);
    await adminA.mutation(api.mcpToolPromotion.importServerTools, { serverId });

    await adminA.mutation(api.mcpServers.deleteServer, { id: serverId });

    const names = (await t.run(async (ctx) => await ctx.db.query("aiTools").collect()))
      .map((tool) => tool.name);
    expect(names).toEqual(["search_knowledge"]);
  });
});
