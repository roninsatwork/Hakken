import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { RUN_STALLED } from "./seoCollectionSweep";

/**
 * The hourly sweep's watch on answers that never came.
 *
 * What must hold: a request sent and unanswered for twelve hours is given up —
 * marked failed and never bought again, because it was paid for — and one
 * still inside twelve hours is waited for. Twelve since 2026-09-25 (Anthony);
 * it was a day, and one late site crawl held Korda's collection open for it.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const HOUR_MS = 60 * 60 * 1000;

describe("an answer that never comes", () => {
  // Held still, so nothing the sweep schedules runs behind the test.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("is given up after twelve hours, never bought again, and waited for until then", async () => {
    const t = harness();
    const sent = (hoursAgo: number) => t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "site_crawl", family: "OnPage", mode: "QUEUED", taskArgsJson: "{}", status: "SUBMITTED",
      tag: `t-${hoursAgo}`, costUsd: 0.1, sandbox: false,
      submittedAt: Date.now() - hoursAgo * HOUR_MS, sentAt: Date.now() - hoursAgo * HOUR_MS,
    }));
    const late = await sent(13);
    const waiting = await sent(11);

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    expect(await t.run(async (ctx) => await ctx.db.get(late))).toMatchObject({
      status: "FAILED",
      error: "DataForSEO never returned a result for this task.",
    });
    expect(await t.run(async (ctx) => await ctx.db.get(waiting))).toMatchObject({ status: "SUBMITTED" });
    // Given up, not re-posted: nothing was sent again.
    const pulls = await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect());
    expect(pulls).toHaveLength(2);
  });
});

/**
 * The sweep working through what it finds (reliability plan 3.3): one page an
 * hour fetched at most 200 answers, purged 8 stored answers and could delete
 * more rows in one go than a transaction may. Now each duty takes pages until
 * it is done, each inside the limits.
 */
describe("the sweep at scale", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const DAY_MS = 24 * HOUR_MS;

  test("every answer out for an hour is asked for in one check — not the oldest 200 — spaced out", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      for (let n = 0; n < 450; n += 1) {
        await ctx.db.insert("seoDataPulls", {
          operationId: "serp_google_organic", family: "SERP", mode: "QUEUED", taskArgsJson: "{}", status: "SUBMITTED",
          tag: `t-${n}`, taskId: `task-${n}`, costUsd: 0.002, sandbox: false,
          submittedAt: Date.now() - 2 * HOUR_MS + n, sentAt: Date.now() - 2 * HOUR_MS + n,
        });
      }
      // Out for ten minutes: its ping may still come.
      await ctx.db.insert("seoDataPulls", {
        operationId: "serp_google_organic", family: "SERP", mode: "QUEUED", taskArgsJson: "{}", status: "SUBMITTED",
        tag: "t-young", taskId: "task-young", costUsd: 0.002, sandbox: false,
        submittedAt: Date.now() - 10 * 60_000, sentAt: Date.now() - 10 * 60_000,
      });
    });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    const fetches = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.name.includes("fetchSeoResult")));
    expect(fetches).toHaveLength(450);
    const delays = fetches.map((job) => job.scheduledTime - job._creationTime).sort((left, right) => left - right);
    expect(delays[delays.length - 1]).toBeGreaterThan(40_000);
  });

  test("every stored answer past its thirty days is cleared in one check — not eight", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "site_crawl", family: "OnPage", mode: "QUEUED", taskArgsJson: "{}", status: "READY",
        tag: "t-old", costUsd: 0.1, sandbox: false, submittedAt: Date.now() - 40 * DAY_MS,
      });
      for (let n = 0; n < 60; n += 1) {
        await ctx.db.insert("seoPullAnswers", { pullId, resultJson: "{}", storedAt: Date.now() - 31 * DAY_MS - n });
      }
      await ctx.db.insert("seoPullAnswers", { pullId, resultJson: "{}", storedAt: Date.now() - DAY_MS });
    });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    expect(await t.run(async (ctx) => (await ctx.db.query("seoPullAnswers").collect()).length)).toBe(1);
  });

  test("old collections are retired however they ended, a large one over several pages, never one still collecting", async () => {
    const t = harness();
    const { done, failed, capped, busy, recent } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "korda.test", displayHost: "korda.test", firstSeenAt: Date.now() });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "site_crawl", family: "OnPage", mode: "QUEUED", taskArgsJson: "{}", status: "READY",
        tag: "t-pull", costUsd: 0.1, sandbox: false, submittedAt: Date.now() - 100 * DAY_MS,
      });
      const cycle = async (status: "DONE" | "FAILED" | "CAPPED_PLAN", daysAgo: number, lines: number) => {
        const cycleId = await ctx.db.insert("seoCollectionCycles", {
          companyId, trigger: "MANUAL", status, plannedCount: lines, reusedCount: 0, sentCount: lines,
          readyCount: lines, failedCount: 0, totalCostUsd: 0, startedAt: Date.now() - daysAgo * DAY_MS,
        });
        for (let n = 0; n < lines; n += 1) {
          await ctx.db.insert("seoCycleLines", {
            cycleId, companyId, websiteId, operationId: "site_crawl", pullId, reused: false, createdAt: Date.now(),
          });
        }
        return cycleId;
      };
      const ids = {
        done: await cycle("DONE", 120, 4_500),
        failed: await cycle("FAILED", 110, 3),
        capped: await cycle("CAPPED_PLAN", 100, 3),
        busy: await cycle("FAILED", 105, 1),
        recent: await cycle("DONE", 10, 2),
      };
      // A request of the failed run still out: it is not retired under it.
      await ctx.db.insert("seoDataPulls", {
        operationId: "site_crawl", family: "OnPage", mode: "QUEUED", taskArgsJson: "{}", status: "SUBMITTED",
        tag: "t-busy", costUsd: 0.1, sandbox: false, submittedAt: Date.now(), sentAt: Date.now(), cycleId: ids.busy,
      });
      await ctx.db.insert("seoRunReports", {
        cycleId: ids.done, companyId, builtAt: Date.now(), final: true, requests: 0, costUsd: 0, waiting: 0, answering: 0,
        filed: 0, failed: 0, aiJudgements: 0, aiCostUsd: 0, byOperation: [], bySite: [], byCollectorRun: [], ai: [],
      });
      return ids;
    });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    const left = await t.run(async (ctx) => ({
      cycles: (await ctx.db.query("seoCollectionCycles").collect()).map((cycle) => cycle._id),
      lines: (await ctx.db.query("seoCycleLines").collect()).map((line) => line.cycleId),
      reports: (await ctx.db.query("seoRunReports").collect()).length,
    }));
    expect(left.cycles.sort()).toEqual([busy, recent].sort());
    expect(left.lines.filter((cycleId) => cycleId === done || cycleId === failed || cycleId === capped)).toEqual([]);
    expect(left.reports).toBe(0);
  });
});

describe("a Planner or Collector run that died", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("is closed as failed, saying why, with its workflow execution; one still inside its time is left", async () => {
    const t = harness();
    const { dead, alive, finished, execution } = await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: "Collector", modelId: "none", thinkingMode: false, isActive: true, systemKey: "DATAFORSEO_COLLECTOR",
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      const run = (minutesAgo: number, status: "RUNNING" | "SUCCESS") => ctx.db.insert("agentRuns", {
        agentId, triggerType: "SCHEDULE", objective: "collect", status,
        startedAt: Date.now() - minutesAgo * 60_000, updatedAt: Date.now() - minutesAgo * 60_000,
      });
      const ids = { dead: await run(45, "RUNNING"), alive: await run(5, "RUNNING"), finished: await run(120, "SUCCESS") };
      const execution = await ctx.db.insert("workflowExecutions", {
        agentRunId: ids.dead, agentId, status: "RUNNING", triggerType: "SCHEDULE", startedAt: Date.now() - 45 * 60_000,
      });
      return { ...ids, execution };
    });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    const read = await t.run(async (ctx) => ({
      dead: await ctx.db.get(dead),
      alive: await ctx.db.get(alive),
      finished: await ctx.db.get(finished),
      execution: await ctx.db.get(execution),
      steps: await ctx.db.query("agentRunSteps").collect(),
    }));
    expect(read.dead).toMatchObject({ status: "FAILED", finalOutput: RUN_STALLED, error: RUN_STALLED });
    expect(read.execution).toMatchObject({ status: "FAILED" });
    expect(read.steps.map((step) => [step.runId, step.kind])).toEqual([[dead, "FINAL"]]);
    expect(read.alive).toMatchObject({ status: "RUNNING" });
    expect(read.finished).toMatchObject({ status: "SUCCESS" });
  });
});
