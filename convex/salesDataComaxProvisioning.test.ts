import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const AGENT_NAMES = [
  "Comax - Company Research Agent",
  "Comax - Prospect Search Agent",
  "Comax - Market Discovery Agent",
  "Comax - Opportunity Report Agent",
];

async function seedComaxWorkspace(
  t: ReturnType<typeof makeTest>,
  options: { agentNames?: string[] } = {}
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const superAdminId = await ctx.db.insert("users", {
      email: "super@test.com",
      name: "Hakken Operator",
      role: "SUPER_ADMIN",
      createdAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Comax",
      enabledModules: ["salesData"],
      createdAt: now,
    });

    const agentIds: Record<string, Id<"agents">> = {};
    for (const name of options.agentNames ?? AGENT_NAMES) {
      agentIds[name] = await ctx.db.insert("agents", {
        name,
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        companyId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { superAdminId, companyId, agentIds };
  });
}

async function readBindings(t: ReturnType<typeof makeTest>, agentId: Id<"agents">) {
  return await t.run(async (ctx) => {
    const bindings = await ctx.db
      .query("agentTools")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();
    const mappings: string[] = [];
    for (const binding of bindings) {
      const tool = await ctx.db.get(binding.toolId);
      if (tool) mappings.push(tool.handlerMapping);
    }
    return mappings.sort();
  });
}

describe("comax agent provisioning", () => {
  test("a bare deployment ends with every Comax agent holding its own tools", async () => {
    const t = makeTest();
    const { superAdminId, agentIds } = await seedComaxWorkspace(t);

    const result = await t
      .withIdentity({ subject: superAdminId })
      .mutation(api.maintenanceScripts.run, { scriptId: "comax-agents-provision" });

    expect(result.success).toBe(true);

    expect(await readBindings(t, agentIds["Comax - Company Research Agent"])).toEqual([
      "salesCustomers.job.next",
      "salesCustomers.research.read",
      "salesCustomers.research.record",
      "web.scrape",
    ]);
    expect(await readBindings(t, agentIds["Comax - Prospect Search Agent"])).toEqual([
      "salesCustomers.job.next",
      "salesCustomers.prospects.read",
      "salesCustomers.prospects.record",
      "web.scrape",
    ]);
    expect(await readBindings(t, agentIds["Comax - Market Discovery Agent"])).toEqual([
      "marketDiscovery.groups.record",
      "marketDiscovery.groups.review",
      "marketDiscovery.job.next",
      "marketDiscovery.locations.read",
      "marketDiscovery.locations.record",
      "web.scrape",
    ]);
    // No web reader on the report agent: its figures come from our own records.
    expect(await readBindings(t, agentIds["Comax - Opportunity Report Agent"])).toEqual([
      "opportunityReport.findGroupGaps",
      "opportunityReport.matchProspects",
      "opportunityReport.saveSummary",
    ]);
  });

  test("the tenant connectors are installed against the agents' own workspace", async () => {
    const t = makeTest();
    const { superAdminId, companyId } = await seedComaxWorkspace(t);

    await t
      .withIdentity({ subject: superAdminId })
      .mutation(api.maintenanceScripts.run, { scriptId: "comax-agents-provision" });

    const connectors = await t.run(async (ctx) => await ctx.db.query("toolConnectors").collect());
    const byKey = new Map(connectors.map((connector) => [connector.key, connector]));

    for (const key of ["sales-customer-research", "sales-market-discovery", "sales-opportunity-report"]) {
      expect(byKey.get(key)?.companyId).toBe(companyId);
      expect(byKey.get(key)?.installStatus).toBe("INSTALLED");
    }
    // The web reader serves the whole platform, so it takes no workspace.
    expect(byKey.get("hakken-firecrawl")?.companyId).toBeUndefined();
  });

  test("running it twice changes nothing the second time", async () => {
    const t = makeTest();
    const { superAdminId, agentIds } = await seedComaxWorkspace(t);
    const client = t.withIdentity({ subject: superAdminId });

    await client.mutation(api.maintenanceScripts.run, { scriptId: "comax-agents-provision" });
    const afterFirst = await readBindings(t, agentIds["Comax - Prospect Search Agent"]);

    const second = await client.mutation(api.maintenanceScripts.run, {
      scriptId: "comax-agents-provision",
    });

    expect(await readBindings(t, agentIds["Comax - Prospect Search Agent"])).toEqual(afterFirst);
    expect(second.summary).toContain("0 tools switched on, 0 switched off");
  });

  test("a Comax tool on the wrong agent is taken away, and an unrelated tool is left alone", async () => {
    const t = makeTest();
    const { superAdminId, agentIds } = await seedComaxWorkspace(t);
    const client = t.withIdentity({ subject: superAdminId });

    await client.mutation(api.maintenanceScripts.run, { scriptId: "comax-agents-provision" });

    // The report agent is given a discovery tool it has no business holding,
    // and an HTTP tool somebody added on purpose.
    await t.run(async (ctx) => {
      const tools = await ctx.db.query("aiTools").collect();
      const discovery = tools.find((tool) => tool.handlerMapping === "marketDiscovery.groups.record");
      const httpToolId = await ctx.db.insert("aiTools", {
        name: "HTTP Request",
        description: "Calls the API you have set up.",
        handlerMapping: "http.request",
        modelName: "call_api",
        requiredRole: "ADMIN",
        isActive: true,
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: superAdminId,
      });
      for (const toolId of [discovery!._id, httpToolId]) {
        await ctx.db.insert("agentTools", {
          agentId: agentIds["Comax - Opportunity Report Agent"],
          toolId,
          assignedAt: Date.now(),
        });
      }
    });

    await client.mutation(api.maintenanceScripts.run, { scriptId: "comax-agents-provision" });

    expect(await readBindings(t, agentIds["Comax - Opportunity Report Agent"])).toEqual([
      "http.request",
      "opportunityReport.findGroupGaps",
      "opportunityReport.matchProspects",
      "opportunityReport.saveSummary",
    ]);
  });

  test("the approval gate is cleared so a run does not park itself", async () => {
    const t = makeTest();
    const { superAdminId, agentIds } = await seedComaxWorkspace(t);

    await t
      .withIdentity({ subject: superAdminId })
      .mutation(api.maintenanceScripts.run, { scriptId: "comax-agents-provision" });

    const agent = await t.run(
      async (ctx) => await ctx.db.get(agentIds["Comax - Market Discovery Agent"])
    );
    expect(agent?.autonomousToolExecution).toBe(true);
    expect(agent?.humanApprovalRequired).toBe(false);
  });

  test("a missing agent is named in the summary rather than failing the run", async () => {
    const t = makeTest();
    const { superAdminId } = await seedComaxWorkspace(t, {
      agentNames: ["Comax - Prospect Search Agent"],
    });

    const result = await t
      .withIdentity({ subject: superAdminId })
      .mutation(api.maintenanceScripts.run, { scriptId: "comax-agents-provision" });

    expect(result.success).toBe(true);
    expect(result.summary).toContain("1 of 4 Comax agents configured");
    expect(result.summary).toContain("Comax - Market Discovery Agent");
  });

  test("a deployment with no Comax agents fails with a plain reason", async () => {
    const t = makeTest();
    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      })
    );

    const result = await t
      .withIdentity({ subject: superAdminId })
      .mutation(api.maintenanceScripts.run, { scriptId: "comax-agents-provision" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No agent on this deployment has Comax in its name");
  });

  test("only a super admin can run it", async () => {
    const t = makeTest();
    const { companyId } = await seedComaxWorkspace(t);
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin@comax.test",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      })
    );

    await expect(
      t
        .withIdentity({ subject: adminId })
        .mutation(api.maintenanceScripts.run, { scriptId: "comax-agents-provision" })
    ).rejects.toThrow("Unauthorized");
  });
});
