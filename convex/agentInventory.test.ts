import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The Agents screen's list, narrowed and paged on the server, and its counts
 * (agents-and-clarity-plan.md, Part 5, AG1–AG5): what an agent does and when
 * it runs from its role and its schedule, its status now, each group counting
 * what the others leave, and the exact total.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function seed(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "root@hakken.test", role: "SUPER_ADMIN" });
    const agent = async (name: string, extra: Record<string, unknown> = {}) => await ctx.db.insert("agents", {
      name, modelId: "m", thinkingMode: false, isActive: true, temperature: 1, humanApprovalRequired: false, createdAt: 1, updatedAt: 1, ...extra,
    });
    const collector = await agent("Search Console: Collector Agent", { systemKey: "SEARCH_CONSOLE_COLLECTOR" });
    await agent("Insights: Editor", { systemKey: "INSIGHTS_EDITOR" });
    const watcher = await agent("The Hakken Watcher Agent", { systemKey: "HAKKEN_WATCHER" });
    await agent("Something new", { systemKey: "A_ROLE_NOT_MAPPED_YET" });
    const nightly = await agent("Nightly report");
    await agent("Ad hoc helper");
    await agent("Old draft", { isActive: false });
    await agent("A company's own", { isGlobal: false });
    for (const [name, agentId] of [["Search Console", collector], ["Nightly", nightly]] as const) {
      await ctx.db.insert("schedules", { name, agentId, intervalStr: "daily", isActive: true, createdAt: 1 });
    }
    await ctx.db.insert("agentRuns", { agentId: watcher, triggerType: "SCHEDULE", objective: "check alerts", status: "RUNNING", startedAt: 1, updatedAt: 1 });
    return userId;
  });
}

describe("the Agents screen's list and counts", () => {
  test("each filter narrows the list on the server, and the counts follow the other choices", async () => {
    const t = harness();
    const asRoot = t.withIdentity({ subject: await seed(t) });
    const names = async (filters: Record<string, string> = {}) => (await asRoot.query(api.agents.getPaginatedAgents, { paginationOpts: { numItems: 15, cursor: null }, ...filters })).page.map((agent) => agent.name).sort();

    expect(await names()).toHaveLength(7);
    expect(await names({ what: "collect" })).toEqual(["Search Console: Collector Agent"]);
    expect(await names({ what: "own" })).toEqual(["Ad hoc helper", "Nightly report", "Old draft"]);
    expect(await names({ what: "platform" })).toEqual(["Something new"]);
    // A person's agent with a row on the Schedules page runs on a schedule; one without, when asked — with roles the map doesn't know yet.
    expect(await names({ when: "schedule" })).toEqual(["Nightly report", "Search Console: Collector Agent", "The Hakken Watcher Agent"]);
    expect(await names({ when: "asked" })).toEqual(["Ad hoc helper", "Old draft", "Something new"]);
    expect(await names({ when: "team" })).toEqual(["Insights: Editor"]);
    expect(await names({ status: "working" })).toEqual(["The Hakken Watcher Agent"]);
    expect(await names({ status: "draft" })).toEqual(["Old draft"]);
    expect(await names({ what: "own", when: "schedule" })).toEqual(["Nightly report"]);

    const counts = await asRoot.query(api.agents.getAgentFilterCounts, { what: "own" });
    expect(counts).toMatchObject({ total: 3, capped: false });
    // What it does counts every kind; When it runs and Status count within the agents a person made.
    expect(counts.what).toMatchObject({ all: 7, collect: 1, insights: 1, tasks: 1, platform: 1, own: 3 });
    expect(counts.when).toMatchObject({ all: 3, schedule: 1, asked: 2 });
    expect(counts.status).toMatchObject({ all: 3, active: 2, draft: 1 });
    const all = await asRoot.query(api.agents.getAgentFilterCounts, {});
    expect(all.status).toMatchObject({ all: 7, active: 6, working: 1, draft: 1 });
  });
});
