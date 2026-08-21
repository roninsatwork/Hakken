import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
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
