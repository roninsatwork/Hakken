import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * The two DataForSEO agents, as Run starts them.
 *
 * What must hold: Run on an agent holding a DataForSEO role starts that role's
 * fixed job and never the model loop, and a Planner with nobody collecting
 * says so rather than inventing work.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function setup(t: ReturnType<typeof harness>, systemKey: string) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
    name: "Super", email: "su@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now(),
  }));
  const agentId = await t.run(async (ctx) => await ctx.db.insert("agents", {
    name: "Anything", modelId: "model-test", thinkingMode: false, isActive: true, systemKey,
    createdAt: Date.now(), updatedAt: Date.now(),
  }));
  return { admin: t.withIdentity({ subject: userId }), agentId };
}

const scheduledNames = (t: ReturnType<typeof harness>) =>
  t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name));

describe("running a DataForSEO agent", () => {
  test.each(["DATAFORSEO_PLANNER", "DATAFORSEO_COLLECTOR"])("Run on the %s starts its job, not a model", async (role) => {
    const t = harness();
    const { admin, agentId } = await setup(t, role);

    await admin.mutation(api.scheduler.manualRunSchedule, { agentId });

    const names = await scheduledNames(t);
    expect(names.some((name) => name.includes("runSeoRoleNow"))).toBe(true);
    expect(names.some((name) => name.includes("runTriggeredAgentObjective"))).toBe(false);
  });

  test("a Planner with no company collecting says so, and adds nothing", async () => {
    const t = harness();
    const { agentId } = await setup(t, "DATAFORSEO_PLANNER");
    const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId, triggerType: "MANUAL", objective: "plan", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
    }));

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_PLANNER", runId });

    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run).toMatchObject({ status: "SUCCESS" });
    expect(run?.finalOutput).toMatch(/No company is collecting data/);
    expect(await t.run(async (ctx) => await ctx.db.query("seoCollectionCycles").collect())).toHaveLength(0);
    // Its Observability timeline shows what it did.
    const steps = await t.run(async (ctx) => await ctx.db.query("agentRunSteps").collect());
    expect(steps.map((step) => step.kind)).toEqual(["FINAL"]);
  });

  test("the Planner's mode decides whether a company's cadence is respected", async () => {
    const t = harness();
    const { agentId } = await setup(t, "DATAFORSEO_PLANNER");
    const companyId = await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() }));
    const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId, triggerType: "MANUAL", objective: "plan", status: "RUNNING", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    const open = async (mode: "TEST" | "LIVE") => {
      const opened = await t.mutation(internal.seoAgentRuns.openCompanyCycle, { companyId, runId, mode });
      const cycle = await t.run(async (ctx) => await ctx.db.get(opened.cycleId!));
      await t.run(async (ctx) => await ctx.db.patch(opened.cycleId!, { status: "DONE" }));
      return cycle?.trigger;
    };

    // Test adds everything; Live leaves a website its cadence says is not due.
    expect(await open("TEST")).toBe("MANUAL");
    expect(await open("LIVE")).toBe("SCHEDULE");
    // Unset reads as Test.
    expect(await t.query(internal.seoAgentRuns.readPlannerMode, { runId })).toBe("TEST");
  });
});
