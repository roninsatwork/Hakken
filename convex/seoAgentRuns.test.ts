import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The two DataForSEO agents, as Run starts them.
 *
 * What must hold: Run on an agent holding a DataForSEO role starts that role's
 * fixed job and never the model loop, and a Planner with nobody collecting
 * says so rather than inventing work.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const DAILY = JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "09:00", timezone: "UTC" });

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

  test.each(["DATAFORSEO_PLANNER", "DATAFORSEO_COLLECTOR"])("its schedule starts the %s's job too, not a model", async (role) => {
    // A schedule woke the Collector through the model path at 09:00 on
    // 2026-09-24; it asked a model that was not there and collected nothing,
    // while the Run button did the job. (That one was a company's collection
    // row, which since 2026-09-25 wakes nothing: each agent has its own.)
    const t = harness();
    const { agentId } = await setup(t, role);
    await t.run(async (ctx) => {
      const creator = (await ctx.db.query("users").first())!._id;
      await ctx.db.insert("schedules", {
        name: "Once a day", agentId, intervalStr: "daily", isActive: true,
        nextRunAt: Date.now() - 1000, createdAt: Date.now() - 2000, createdBy: creator,
      });
    });

    await t.mutation(internal.workflowEngine.scheduleDispatcher, {});

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

  test("every company collecting is found, however many other schedules come before its own", async () => {
    // Only the first 500 schedules of every kind were read, so a company whose
    // collection schedule lay past them was never planned (reliability plan 3.1).
    const t = harness();
    const { agentId } = await setup(t, "DATAFORSEO_PLANNER");
    await t.run(async (ctx) => {
      for (let n = 0; n < 520; n += 1) {
        await ctx.db.insert("schedules", {
          name: `Agent schedule ${n}`, agentId, intervalStr: "daily", isActive: true, nextRunAt: Date.now() + 1_000, createdAt: Date.now(),
        });
      }
      for (let n = 0; n < 150; n += 1) {
        const companyId = await ctx.db.insert("companies", { name: `Company ${n}`, createdAt: Date.now() });
        await ctx.db.insert("schedules", {
          name: `SEO data — Company ${n}`, companyId, intervalStr: "weekly", isActive: n % 5 !== 0, nextRunAt: Date.now(), createdAt: Date.now(),
        });
      }
    });

    const found: string[] = [];
    for (let cursor: string | null = null; ;) {
      const page: { companies: Array<{ name: string }>; cursor: string; isDone: boolean } =
        await t.query(internal.seoAgentRuns.listCollectingCompanies, { cursor });
      found.push(...page.companies.map((company) => company.name));
      if (page.isDone) break;
      cursor = page.cursor;
    }
    // One in five is switched off.
    expect(found).toHaveLength(120);
    expect(new Set(found).size).toBe(120);
    expect(found).toContain("Company 149");
  });

  /** A company collecting daily with one website of its own, and a Planner run. */
  async function collectingCompany(t: ReturnType<typeof harness>, agentId: Id<"agents">, name: string) {
    return await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
      await ctx.db.insert("schedules", {
        name: `SEO data — ${name}`, companyId, intervalStr: DAILY, isActive: true, createdAt: Date.now(),
      });
      const websiteId = await ctx.db.insert("websites", {
        host: `${name.toLowerCase().replace(/\W+/g, "")}.com`, displayHost: name, firstSeenAt: Date.now(),
      });
      await ctx.db.insert("companyWebsites", { companyId, websiteId, createdAt: Date.now() });
      const runId = await ctx.db.insert("agentRuns", {
        agentId, triggerType: "MANUAL", objective: "plan", status: "RUNNING", startedAt: Date.now(), updatedAt: Date.now(),
      });
      return { companyId, websiteId, runId };
    });
  }

  /** The company's website collected just now, so its daily cadence is not due again until tomorrow. */
  const collectedJustNow = (t: ReturnType<typeof harness>, companyId: Id<"companies">, websiteId: Id<"websites">) =>
    t.run(async (ctx) => {
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId, trigger: "SCHEDULE", status: "DONE", plannedCount: 1, reusedCount: 0, sentCount: 1,
        readyCount: 1, failedCount: 0, totalCostUsd: 0.01, startedAt: Date.now(),
      });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "backlinks_summary", family: "Backlinks", mode: "LIVE", taskArgsJson: "{}", status: "READY",
        cycleId, websiteId, tag: "t-collected", costUsd: 0.01, sandbox: false, submittedAt: Date.now(),
        completedAt: Date.now(), dueAt: Date.now(),
      });
      await ctx.db.insert("seoCycleLines", {
        cycleId, companyId, websiteId, operationId: "backlinks_summary", pullId, reused: false, createdAt: Date.now(),
      });
    });

  test("the Planner's mode decides whether a company's cadence is respected", async () => {
    const t = harness();
    const { agentId } = await setup(t, "DATAFORSEO_PLANNER");
    const { companyId, websiteId, runId } = await collectingCompany(t, agentId, "Ronins Agency");
    const open = async (mode: "TEST" | "LIVE") => {
      const opened = await t.mutation(internal.seoAgentRuns.openCompanyCycle, { companyId, runId, mode });
      if (!opened.cycleId) return opened.notDue ? "NOT_DUE" : opened.message;
      const cycle = await t.run(async (ctx) => await ctx.db.get(opened.cycleId!));
      await t.run(async (ctx) => await ctx.db.patch(opened.cycleId!, { status: "DONE" }));
      return cycle?.trigger;
    };

    // Never collected: Test adds everything, and Live finds it due.
    expect(await open("TEST")).toBe("MANUAL");
    expect(await open("LIVE")).toBe("SCHEDULE");
    // Collected just now: Test still adds everything; Live opens nothing at all,
    // rather than a collection with nothing in it.
    await collectedJustNow(t, companyId, websiteId);
    expect(await open("TEST")).toBe("MANUAL");
    expect(await open("LIVE")).toBe("NOT_DUE");
    // Unset reads as Test.
    expect(await t.query(internal.seoAgentRuns.readPlannerMode, { runId })).toBe("TEST");
  });

  test("a Live Planner run leaves a company with nothing due alone, and names it", async () => {
    // Once a company's own row stopped waking anything, the Planner runs on its
    // own schedule and meets every company collecting on every run. One not
    // yet due must not get an empty collection each time.
    const t = harness();
    const { agentId } = await setup(t, "DATAFORSEO_PLANNER");
    await t.run(async (ctx) => await ctx.db.patch(agentId, { plannerMode: "LIVE" }));
    const { companyId, websiteId, runId } = await collectingCompany(t, agentId, "Korda");
    await collectedJustNow(t, companyId, websiteId);
    const cyclesBefore = (await t.run(async (ctx) => await ctx.db.query("seoCollectionCycles").collect())).length;

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_PLANNER", runId });

    expect(await t.run(async (ctx) => await ctx.db.query("seoCollectionCycles").collect())).toHaveLength(cyclesBefore);
    expect(await t.run(async (ctx) => await ctx.db.get(runId))).toMatchObject({
      status: "SUCCESS",
      finalOutput: "Live mode. Not due yet: Korda. Nothing was added to the queue.",
    });
  });
});

describe("Collect now", () => {
  // Held still, so what Collect now starts is seen being started without the
  // work list being written or anything being sent to DataForSEO.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A company collecting data, both DataForSEO agents, and a super admin at the button. */
  async function collecting(t: ReturnType<typeof harness>, { switchedOn = true, collectorOn = true } = {}) {
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Super", email: "su@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now(),
      });
      const agent = (name: string, systemKey: string, isActive: boolean) => ctx.db.insert("agents", {
        name, modelId: "model-test", thinkingMode: false, isActive, systemKey, createdAt: Date.now(), updatedAt: Date.now(),
      });
      const plannerId = await agent("Queue Planner", "DATAFORSEO_PLANNER", true);
      const collectorId = await agent("Agent Collector", "DATAFORSEO_COLLECTOR", collectorOn);
      const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
      await ctx.db.insert("schedules", {
        name: "SEO data — Korda", companyId, intervalStr: "monthly",
        isActive: switchedOn, createdAt: Date.now(), createdBy: userId,
      });
      return { userId, plannerId, collectorId, companyId };
    });
    return { ...ids, admin: t.withIdentity({ subject: ids.userId }) };
  }

  /** One request in a collection, in the state given. */
  const request = (t: ReturnType<typeof harness>, cycleId: Id<"seoCollectionCycles">, status: "PENDING" | "SUBMITTED") =>
    t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "site_crawl", family: "OnPage", mode: "QUEUED", taskArgsJson: "{}", status, cycleId,
      tag: `t-${Math.random()}`, costUsd: 0, sandbox: false, submittedAt: Date.now(), dueAt: Date.now(),
    }));

  const jobs = (t: ReturnType<typeof harness>) =>
    t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
  const runsOf = (t: ReturnType<typeof harness>, agentId: string) =>
    t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).filter((run) => run.agentId === agentId));

  test("queues everything for the company, then starts the Collector once the work list is written", async () => {
    const t = harness();
    const { admin, companyId, plannerId, collectorId } = await collecting(t);

    const { outcome, cycleId } = await admin.mutation(api.seoAgentRuns.collectNow, { companyId });

    expect(outcome).toBe("QUEUED");
    const cycle = await t.run(async (ctx) => await ctx.db.get(cycleId));
    // MANUAL: every website, whatever its cadence says is due. A Planner run opened it.
    expect(cycle).toMatchObject({ companyId, trigger: "MANUAL", status: "EXPANDING" });
    const [plannerRun] = await runsOf(t, plannerId);
    expect(plannerRun).toMatchObject({ _id: cycle?.agentRunId, triggerType: "MANUAL", title: "Collect now — Korda" });
    // Nothing is sent before the work list exists.
    expect(await runsOf(t, collectorId)).toHaveLength(0);

    await t.run(async (ctx) => await ctx.db.patch(cycleId, { status: "SENDING", plannedCount: 12, reusedCount: 3 }));
    const finish = (await jobs(t)).find((job) => job.name.includes("finishCollectNow"));
    await t.action(internal.seoAgentRuns.finishCollectNow, finish!.args[0]);

    expect(await t.run(async (ctx) => await ctx.db.get(plannerRun._id))).toMatchObject({
      status: "SUCCESS",
      finalOutput: "Collect now for Korda: 12 added to the queue, 3 served from data already held. Started the DataForSEO Collector to send it.",
    });
    const [collectorRun] = await runsOf(t, collectorId);
    expect(collectorRun).toMatchObject({ triggerType: "MANUAL", title: "Collect now — Korda", status: "QUEUED" });
    // Started the way its Run button and its schedule start it: its job, not a model.
    const sends = (await jobs(t)).filter((job) => job.name.includes("runSeoRoleNow"));
    expect(sends.map((job) => job.args[0])).toEqual([expect.objectContaining({ role: "DATAFORSEO_COLLECTOR", runId: collectorRun._id })]);
    expect((await jobs(t)).some((job) => job.name.includes("runTriggeredAgentObjective"))).toBe(false);
  });

  test("is refused while the company's collection is switched off, and queues nothing", async () => {
    const t = harness();
    const { admin, companyId } = await collecting(t, { switchedOn: false });

    await expect(admin.mutation(api.seoAgentRuns.collectNow, { companyId })).rejects.toThrow(/switched off for Korda/);
    expect(await t.run(async (ctx) => await ctx.db.query("seoCollectionCycles").collect())).toHaveLength(0);
  });

  test("names an agent that is switched off", async () => {
    const t = harness();
    const { admin, companyId } = await collecting(t, { collectorOn: false });

    await expect(admin.mutation(api.seoAgentRuns.collectNow, { companyId })).rejects.toThrow(/Agent Collector is switched off/);
    expect(await t.run(async (ctx) => await ctx.db.query("seoCollectionCycles").collect())).toHaveLength(0);
  });

  test("never queues twice: a collection with requests still to send is sent, by one Collector at a time", async () => {
    const t = harness();
    const { admin, companyId, collectorId } = await collecting(t);
    const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "SCHEDULE", status: "SENDING", plannedCount: 40, reusedCount: 0, sentCount: 10,
      readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
    }));
    await request(t, cycleId, "PENDING");

    expect(await admin.mutation(api.seoAgentRuns.collectNow, { companyId })).toEqual({ outcome: "SENDING", cycleId });
    expect(await admin.mutation(api.seoAgentRuns.collectNow, { companyId })).toEqual({ outcome: "ALREADY_SENDING", cycleId });

    expect(await t.run(async (ctx) => await ctx.db.query("seoCollectionCycles").collect())).toHaveLength(1);
    expect(await runsOf(t, collectorId)).toHaveLength(1);
  });

  test("a collection that has sent everything and only waits for answers does not hold up a fresh one", async () => {
    // Korda, 2026-09-25: one site crawl still unanswered from the day before
    // kept its collection open, and Collect now would have queued nothing.
    const t = harness();
    const { admin, companyId } = await collecting(t);
    const waiting = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "MANUAL", status: "COLLECTING", plannedCount: 147, reusedCount: 33, sentCount: 160,
      readyCount: 148, failedCount: 0, totalCostUsd: 7.85, startedAt: Date.now() - 60_000,
    }));
    await request(t, waiting, "SUBMITTED");

    const { outcome, cycleId } = await admin.mutation(api.seoAgentRuns.collectNow, { companyId });

    expect(outcome).toBe("QUEUED");
    expect(cycleId).not.toBe(waiting);
    // The old one keeps waiting for its answer.
    expect(await t.run(async (ctx) => await ctx.db.get(waiting))).toMatchObject({ status: "COLLECTING" });
  });

  test("pressed while the work list is still being written, it sends the list once it is", async () => {
    const t = harness();
    const { admin, companyId, collectorId } = await collecting(t);
    const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "MANUAL", status: "EXPANDING", plannedCount: 0, reusedCount: 0, sentCount: 0,
      readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
    }));

    expect(await admin.mutation(api.seoAgentRuns.collectNow, { companyId })).toEqual({ outcome: "BEING_QUEUED", cycleId });
    expect(await runsOf(t, collectorId)).toHaveLength(0);

    await t.run(async (ctx) => await ctx.db.patch(cycleId, { status: "SENDING", plannedCount: 8 }));
    const wait = (await jobs(t)).find((job) => job.name.includes("sendWhenWritten"));
    await t.action(internal.seoAgentRuns.sendWhenWritten, wait!.args[0]);

    expect(await runsOf(t, collectorId)).toHaveLength(1);
  });
});
