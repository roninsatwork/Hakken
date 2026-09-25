import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { WIKI_STAFF } from "./wikiStaff";
import { isWikiStaffKey } from "./wikiStaffRunActions";

/**
 * Pressing Run on a wiki agent must do that agent's actual job. The Run
 * button used to hand the staff to the generic agent loop, which produced a
 * model reply about the work and filed nothing (Anthony, 2026-08-20: "the
 * local agents still fail to run"). These tests hold the repaired wiring:
 * a sweep key really starts its sweep, an event-driven agent says so
 * plainly, and every outcome — including a crash — lands on the run record
 * instead of leaving it RUNNING for ever.
 */

// The Distiller's sweep is replaced with one that crashes, so the failure
// path can be proven without inventing a broken deployment.
vi.mock("./wikiDistillActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./wikiDistillActions")>();
  const { internalAction } = await import("./_generated/server");
  return {
    ...actual,
    distilSweep: internalAction(async () => {
      throw new Error("The reading   round\n fell over  mid-sweep");
    }),
  };
});

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));

type Tester = ReturnType<typeof makeTest>;

/** A run row the way the Run button leaves it: RUNNING, waiting for an outcome. */
async function seedRun(t: Tester) {
  await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
  return await t.run(async (ctx) => {
    const agent = (await ctx.db.query("agents").collect()).find(
      (candidate) => candidate.systemKey === "WIKI_REVIEWER"
    )!;
    const now = Date.now();
    const runId = await ctx.db.insert("agentRuns", {
      agentId: agent._id,
      triggerType: "MANUAL",
      objective: "Run the round.",
      status: "RUNNING",
      startedAt: now,
      updatedAt: now,
    });
    return runId;
  });
}

describe("knowing the staff", () => {
  test("staff keys are recognised; everything else goes to the ordinary agent loop", () => {
    expect(isWikiStaffKey("WIKI_DISTILLER")).toBe(true);
    expect(isWikiStaffKey("WIKI_REVIEWER")).toBe(true);
    expect(isWikiStaffKey("WIKI_EXAMINER")).toBe(true);
    expect(isWikiStaffKey("RESEARCHER")).toBe(false);
    expect(isWikiStaffKey("")).toBe(false);
    expect(isWikiStaffKey(undefined)).toBe(false);
    expect(isWikiStaffKey(null)).toBe(false);
  });
});

describe("pressing Run on a staff agent", () => {
  test("a sweep key really starts its round and reports what it covered", async () => {
    const t = makeTest();
    const runId = await seedRun(t);
    await t.action(internal.wikiStaffRunActions.runStaffNow, {
      systemKey: "WIKI_EXAMINER",
      runId,
    });
    const run = await t.run(async (ctx) => ctx.db.get(runId));
    // The real examGrowthSweep ran: an empty platform is zero wikis, said so.
    expect(run?.status).toBe("SUCCESS");
    expect(run?.finalOutput).toBe("Started the exam round across 0 wikis.");
    expect(run?.completedAt).toBeGreaterThan(0);
  });

  test("an event-driven agent's Run says so instead of pretending to work", async () => {
    const t = makeTest();
    const runId = await seedRun(t);
    const workflowExecutionId = await t.run(async (ctx) =>
      ctx.db.insert("workflowExecutions", {
        status: "RUNNING",
        triggerType: "MANUAL",
        startedAt: Date.now(),
      })
    );
    await t.action(internal.wikiStaffRunActions.runStaffNow, {
      systemKey: "WIKI_REVIEWER",
      runId,
      workflowExecutionId,
    });
    const { run, execution } = await t.run(async (ctx) => ({
      run: await ctx.db.get(runId),
      execution: await ctx.db.get(workflowExecutionId),
    }));
    expect(run?.status).toBe("SUCCESS");
    expect(run?.finalOutput).toContain("Nothing to run on demand");
    expect(run?.finalOutput).toContain("at ingest");
    // The workflow wrapper closes with the run, so nothing shows RUNNING for ever.
    expect(execution?.status).toBe("SUCCESS");
    expect(execution?.completedAt).toBeGreaterThan(0);
  });

  test("a key with no round fails the run plainly instead of leaving it RUNNING", async () => {
    const t = makeTest();
    const runId = await seedRun(t);
    await t.action(internal.wikiStaffRunActions.runStaffNow, {
      systemKey: "WIKI_JANITOR",
      runId,
    });
    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("FAILED");
    expect(run?.finalOutput).toBe("No round is defined for WIKI_JANITOR.");
    expect(run?.error).toBe("No round is defined for WIKI_JANITOR.");
  });

  test("a round that crashes lands as a FAILED run with a readable one-line message", async () => {
    const t = makeTest();
    const runId = await seedRun(t);
    await t.action(internal.wikiStaffRunActions.runStaffNow, {
      systemKey: "WIKI_DISTILLER",
      runId,
    });
    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("FAILED");
    // The message survives, but its newlines and doubled spaces do not.
    expect(run?.finalOutput).toContain("fell over mid-sweep");
    expect(run?.finalOutput).not.toMatch(/\s{2}/);
    expect(run?.error).toBe(run?.finalOutput);
  });
});

describe("starting a staff agent, from the button or the clock", () => {
  // Held still, so a round is seen being started without a sweep running over
  // the test deployment behind it.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A staff agent as seeded, and a super admin to start it. */
  async function staffAgent(t: Tester, systemKey: string) {
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    return await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Super", email: "su@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now(),
      });
      const agent = (await ctx.db.query("agents").collect()).find((candidate) => candidate.systemKey === systemKey)!;
      return { userId, agentId: agent._id };
    });
  }

  const scheduledJobs = (t: Tester) =>
    t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());

  test("Run on a staff agent starts its round, not a model", async () => {
    const t = makeTest();
    const { userId, agentId } = await staffAgent(t, "WIKI_TIDIER");

    await t.withIdentity({ subject: userId }).mutation(api.scheduler.manualRunSchedule, { agentId });

    const jobs = await scheduledJobs(t);
    expect(jobs.find((job) => job.name.includes("runStaffNow"))?.args[0]).toMatchObject({ systemKey: "WIKI_TIDIER" });
    expect(jobs.some((job) => job.name.includes("runTriggeredAgentObjective"))).toBe(false);
  });

  test.each(WIKI_STAFF.map((member) => member.systemKey))("a schedule starts the %s's round too, not a model", async (systemKey) => {
    // Found on 2026-09-25, before any staff agent had a schedule: the Run
    // button did the round, and a schedule would have asked a model to write
    // about it and changed nothing — the gap the Collector's schedule fell
    // into on 2026-09-24.
    const t = makeTest();
    const { userId, agentId } = await staffAgent(t, systemKey);
    await t.run(async (ctx) => {
      await ctx.db.insert("schedules", {
        name: "Nightly wiki round", agentId, intervalStr: "daily", isActive: true,
        nextRunAt: Date.now() - 1000, createdAt: Date.now() - 2000, createdBy: userId,
      });
    });

    await t.mutation(internal.workflowEngine.scheduleDispatcher, {});

    const jobs = await scheduledJobs(t);
    const round = jobs.find((job) => job.name.includes("runStaffNow"));
    expect(jobs.some((job) => job.name.includes("runTriggeredAgentObjective"))).toBe(false);
    // The schedule's run is on the record, and the round is the one to close it.
    const run = await t.run(async (ctx) => await ctx.db.query("agentRuns").first());
    expect(run).toMatchObject({ agentId, triggerType: "SCHEDULE", status: "QUEUED" });
    expect(round?.args[0]).toMatchObject({ systemKey, runId: run?._id });
  });
});
