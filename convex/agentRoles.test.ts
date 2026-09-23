import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/**
 * An agent's role, as the Settings page saves it.
 *
 * The role replaces finding an agent by name. What must hold: one agent per
 * role, a built-in role never moves, and General clears a role.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function setup(t: ReturnType<typeof harness>) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
    name: "Super", email: "su@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now(),
  }));
  const agent = (name: string, systemKey?: string) => t.run(async (ctx) => await ctx.db.insert("agents", {
    name, modelId: "model-test", thinkingMode: false, isActive: true, createdAt: Date.now(), updatedAt: Date.now(),
    ...(systemKey ? { systemKey } : {}),
  }));
  return { admin: t.withIdentity({ subject: userId }), agent };
}

const keyOf = (t: ReturnType<typeof harness>, id: string) =>
  t.run(async (ctx) => (await ctx.db.get(id as never) as { systemKey?: string } | null)?.systemKey ?? "NONE");

describe("agent roles", () => {
  test("a role is given, listed, and cleared back to a general agent", async () => {
    const t = harness();
    const { admin, agent } = await setup(t);
    const collector = await agent("Anything at all");

    await admin.mutation(api.agents.updateAgent, { id: collector, role: "DATAFORSEO_COLLECTOR" });
    expect(await keyOf(t, collector)).toBe("DATAFORSEO_COLLECTOR");
    expect(await admin.query(api.agentRoles.listAgentRoleHolders, {}))
      .toEqual([{ systemKey: "DATAFORSEO_COLLECTOR", agentId: collector, name: "Anything at all" }]);

    await admin.mutation(api.agents.updateAgent, { id: collector, role: "NONE" });
    expect(await keyOf(t, collector)).toBe("NONE");
  });

  test("a role held by one agent cannot be given to another", async () => {
    const t = harness();
    const { admin, agent } = await setup(t);
    await agent("SEO Planner", "DATAFORSEO_PLANNER");
    const second = await agent("Second");

    await expect(admin.mutation(api.agents.updateAgent, { id: second, role: "DATAFORSEO_PLANNER" }))
      .rejects.toThrow(/SEO Planner already has this role/);
  });

  test("a built-in role never moves", async () => {
    const t = harness();
    const { admin, agent } = await setup(t);
    const distiller = await agent("The Distiller", "WIKI_DISTILLER");

    await expect(admin.mutation(api.agents.updateAgent, { id: distiller, role: "NONE" }))
      .rejects.toThrow(/built in/);
    expect(await keyOf(t, distiller)).toBe("WIKI_DISTILLER");
  });

  test("a role chosen when the agent is created is saved with it", async () => {
    const t = harness();
    const { admin } = await setup(t);
    const ownerId = await t.run(async (ctx) => (await ctx.db.query("users").first())!._id);

    const created = await admin.mutation(api.agents.createAgent, {
      name: "Queue Planner",
      description: "Reads each company's cadence and fills the DataForSEO queue.",
      ownerId,
      role: "DATAFORSEO_PLANNER",
    });
    expect(await keyOf(t, created)).toBe("DATAFORSEO_PLANNER");
  });
});
