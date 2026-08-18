import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";

/**
 * The governance rollups, end to end: the backfill builds history, the cron's
 * rebuild keeps the recent window and the estate fresh, and the two screens
 * read the buckets without changing what they say.
 *
 * The agreement tests are the ones that matter. The screens' figures are
 * checked against hand-counts of the seeded rows — not against the rollup's
 * own output — so a fold that drifts from the truth fails here even though it
 * agrees perfectly with itself. Wrong-but-fast is the one failure this design
 * must not have.
 */

beforeEach(() => {
  vi.useFakeTimers();
  // Fixed mid-day UTC so day arithmetic cannot straddle a midnight.
  vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type TestConvex = ReturnType<typeof makeTest>;

const DAY = 24 * 60 * 60 * 1000;

async function seedEstate(t: TestConvex) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", {
      name: "Withheld & Co",
      createdAt: now,
      enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS],
    });
    const otherCompanyId = await ctx.db.insert("companies", {
      name: "Someone Else Ltd",
      createdAt: now,
      enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS],
    });
    const adminId = await ctx.db.insert("users", {
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
      companyId,
      createdAt: now,
    });
    const superId = await ctx.db.insert("users", {
      name: "Platform",
      email: "platform@example.com",
      role: "SUPER_ADMIN",
      createdAt: now,
    });
    // Rated LOW but later observed reaching outside the platform — the
    // conformance finding the dashboard must surface.
    const lowAgentId = await ctx.db.insert("agents", {
      name: "Front desk",
      modelId: "model-test",
      thinkingMode: false,
      isActive: true,
      riskLevel: "LOW",
      createdAt: now,
      updatedAt: now,
    });
    const globalAgentId = await ctx.db.insert("agents", {
      name: "The Linker",
      modelId: "model-test",
      thinkingMode: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    return { companyId, otherCompanyId, adminId, superId, lowAgentId, globalAgentId };
  });
}

type Seeded = Awaited<ReturnType<typeof seedEstate>>;

/**
 * The activity that the hand-counts below describe. Change one, change both —
 * that is the point of writing the expectations as literals.
 */
async function seedActivity(t: TestConvex, seeded: Seeded) {
  const now = Date.now();
  await t.run(async (ctx) => {
    const run = async (over: {
      companyId?: Id<"companies">;
      agentId: Id<"agents">;
      startedAt: number;
      status: string;
    }) =>
      await ctx.db.insert("agentRuns", {
        agentId: over.agentId,
        ...(over.companyId ? { companyId: over.companyId } : {}),
        triggerType: "CHAT",
        objective: "Do the thing",
        status: over.status as never,
        startedAt: over.startedAt,
        updatedAt: over.startedAt,
      });

    // Today, in the company's scope: two finished, one failed.
    await run({ companyId: seeded.companyId, agentId: seeded.lowAgentId, startedAt: now - 1000, status: "SUCCESS" });
    await run({ companyId: seeded.companyId, agentId: seeded.lowAgentId, startedAt: now - 2000, status: "SUCCESS" });
    await run({ companyId: seeded.companyId, agentId: seeded.lowAgentId, startedAt: now - 3000, status: "FAILED" });

    // Today, companyless: one finished, which every scope must see.
    await run({ agentId: seeded.globalAgentId, startedAt: now - 4000, status: "SUCCESS" });

    // Today, the other company: invisible to the workspace view.
    await run({ companyId: seeded.otherCompanyId, agentId: seeded.globalAgentId, startedAt: now - 5000, status: "SUCCESS" });

    // Five days ago, the company again: one run that waited for a person.
    const waitedRunId = await run({
      companyId: seeded.companyId,
      agentId: seeded.lowAgentId,
      startedAt: now - 5 * DAY,
      status: "SUCCESS",
    });
    await ctx.db.insert("agentRunApprovals", {
      runId: waitedRunId,
      agentId: seeded.lowAgentId,
      companyId: seeded.companyId,
      status: "APPROVED",
      message: "Send the letter?",
      requestedAt: now - 5 * DAY + 1000,
      reviewedAt: now - 5 * DAY + 2000,
    });

    // Forty days ago: history the 30-day window must not count.
    await run({ companyId: seeded.companyId, agentId: seeded.lowAgentId, startedAt: now - 40 * DAY, status: "SUCCESS" });

    // Today's actions: three reads and one external call by the LOW-rated
    // agent — the external one is the conformance finding.
    const call = async (level: string, agentId: Id<"agents">, startedAt: number) => {
      const runId = await run({ companyId: seeded.companyId, agentId, startedAt, status: "SUCCESS" });
      await ctx.db.insert("agentToolCalls", {
        runId,
        agentId,
        companyId: seeded.companyId,
        normalizedToolName: "tool",
        handlerMapping: "tool.handler",
        argumentsJson: "{}",
        redactedArgumentsJson: "{}",
        status: "SUCCESS",
        requiredRole: "ADMIN",
        sideEffectLevel: level as never,
        confirmationRequired: false,
        startedAt,
      });
    };
    await call("READ", seeded.lowAgentId, now - 6000);
    await call("READ", seeded.lowAgentId, now - 7000);
    await call("READ", seeded.lowAgentId, now - 8000);
    await call("EXTERNAL", seeded.lowAgentId, now - 9000);
  });
}

async function backfillAndRebuild(t: TestConvex) {
  await t.mutation(internal.dataMigrations.run, { name: "2026-08-18-governance-day-rollups-backfill" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.mutation(internal.governanceRollups.rebuildGovernanceRollups, {});
}

const asUser = (t: TestConvex, userId: Id<"users">) => t.withIdentity({ subject: userId });

describe("the activity screen reads buckets and agrees with a hand-count", () => {
  test("platform scope, thirty days", async () => {
    const t = makeTest();
    const seeded = await seedEstate(t);
    await seedActivity(t, seeded);
    await backfillAndRebuild(t);

    const activity = await asUser(t, seeded.superId).query(api.governanceActivity.getGovernanceActivity, { days: 30 });

    // Hand-count of the seeds: 3 company runs today + 4 runs carrying tool
    // calls + 1 companyless + 1 other-company + 1 five days ago = 10.
    // The 40-day-old run is outside the window.
    expect(activity.runs.total).toBe(10);
    expect(activity.runs.unfinished).toBe(1);
    expect(activity.actions).toMatchObject({ read: 3, external: 1, total: 4, readShare: 75 });
    expect(activity.timeline).toHaveLength(30);

    const today = activity.timeline.at(-1)!;
    expect(today).toMatchObject({ finished: 8, unfinished: 1, waited: 0 });
    const fiveDaysAgo = activity.timeline.at(-6)!;
    expect(fiveDaysAgo).toMatchObject({ finished: 1, waited: 1 });

    // Nothing is capped any more, so the floor-not-total line never shows.
    expect(activity.truncated).toBe(false);

    expect(activity.oversight).toMatchObject({ decided: 1, approved: 1, waiting: 0 });
    expect(activity.busiest[0]).toMatchObject({ id: seeded.lowAgentId, runs: 8 });
  });

  test("workspace scope sees its own rows and the companyless ones, nobody else's", async () => {
    const t = makeTest();
    const seeded = await seedEstate(t);
    await seedActivity(t, seeded);
    await backfillAndRebuild(t);

    const activity = await asUser(t, seeded.adminId).query(api.governanceActivity.getGovernanceActivity, { days: 30 });

    // The hand-count again, minus the other company's run: 10 - 1 = 9.
    expect(activity.runs.total).toBe(9);
    const today = activity.timeline.at(-1)!;
    expect(today.finished).toBe(7);
  });

  test("a ninety-day window reaches the history the backfill built", async () => {
    const t = makeTest();
    const seeded = await seedEstate(t);
    await seedActivity(t, seeded);
    await backfillAndRebuild(t);

    const activity = await asUser(t, seeded.superId).query(api.governanceActivity.getGovernanceActivity, { days: 90 });
    expect(activity.runs.total).toBe(11);
  });
});

describe("the dashboard reads the estate snapshot", () => {
  test("systems, risk mix and the conformance finding, with approvals still live", async () => {
    const t = makeTest();
    const seeded = await seedEstate(t);
    await seedActivity(t, seeded);
    await backfillAndRebuild(t);

    const dashboard = await asUser(t, seeded.superId).query(api.governanceDashboard.getGovernanceDashboard, {});

    expect(dashboard.scope).toBe("PLATFORM");
    expect(dashboard.systems).toBe(2);
    expect(dashboard.riskMix).toMatchObject({ low: 1, unrated: 1 });
    // The LOW-rated agent was seen reaching outside the platform.
    expect(dashboard.conformance).toHaveLength(1);
    expect(dashboard.conformance[0]).toMatchObject({ agentName: "Front desk", suggested: "HIGH" });
    expect(dashboard.checks.find((check) => check.key === "conformance")).toMatchObject({
      state: "NEEDS_ATTENTION",
      count: 1,
    });
    // No pending approvals seeded, so the live half reports a settled queue.
    expect(dashboard.checks.find((check) => check.key === "waitingApprovals")).toMatchObject({ count: 0 });
  });

  test("a workspace admin gets their own estate, not the platform's", async () => {
    const t = makeTest();
    const seeded = await seedEstate(t);
    await seedActivity(t, seeded);
    await backfillAndRebuild(t);

    const dashboard = await asUser(t, seeded.adminId).query(api.governanceDashboard.getGovernanceDashboard, {});

    expect(dashboard.scope).toBe("WORKSPACE");
    // Both agents are companyless in the register sense (no companyId on the
    // agents), so the workspace sees them through the everybody-scope rule.
    expect(dashboard.systems).toBe(2);
  });
});

describe("the machinery is safe to re-run", () => {
  test("running the backfill twice converges instead of double-counting", async () => {
    const t = makeTest();
    const seeded = await seedEstate(t);
    await seedActivity(t, seeded);
    await backfillAndRebuild(t);

    const before = await asUser(t, seeded.superId).query(api.governanceActivity.getGovernanceActivity, { days: 90 });

    // A forced second pass over every day.
    await t.mutation(internal.dataMigrations.run, {
      name: "2026-08-18-governance-day-rollups-backfill",
      force: true,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(internal.governanceRollups.rebuildGovernanceRollups, {});

    const after = await asUser(t, seeded.superId).query(api.governanceActivity.getGovernanceActivity, { days: 90 });
    expect(after).toEqual(before);
  });

  test("the rebuild zeroes a scope that goes quiet rather than letting deleted runs live on", async () => {
    const t = makeTest();
    const seeded = await seedEstate(t);
    await seedActivity(t, seeded);
    await backfillAndRebuild(t);

    await t.run(async (ctx) => {
      const runs = await ctx.db.query("agentRuns").collect();
      for (const run of runs) await ctx.db.delete(run._id);
      const calls = await ctx.db.query("agentToolCalls").collect();
      for (const call of calls) await ctx.db.delete(call._id);
    });
    await t.mutation(internal.governanceRollups.rebuildGovernanceRollups, {});

    const activity = await asUser(t, seeded.superId).query(api.governanceActivity.getGovernanceActivity, { days: 1 });
    expect(activity.runs.total).toBe(0);
    expect(activity.timeline.at(-1)).toMatchObject({ finished: 0, waited: 0, unfinished: 0 });
  });
});
