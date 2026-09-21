import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * The claim, and the rules that keep one question to one invoice line.
 *
 * DataForSEO charges when a task is posted. Everything here exists because of
 * that one fact: two workers must never hold the same row, a row that has been
 * sent must never be sent again, and a rate limit must not be mistaken for a
 * failure and burn a row's attempts.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function seedPull(
  t: Harness,
  overrides: Partial<{
    operationId: string;
    status: "PENDING" | "CLAIMED" | "SUBMITTED" | "READY" | "FAILED";
    dueAt: number;
    attempts: number;
    taskId: string;
    cycleId: Id<"seoCollectionCycles">;
    companyId: Id<"companies">;
  }> = {},
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("seoDataPulls", {
      operationId: overrides.operationId ?? "backlinks_summary",
      family: "Backlinks",
      mode: "LIVE",
      taskArgsJson: JSON.stringify({ target: "a.com" }),
      status: overrides.status ?? "PENDING",
      tag: `tag-${Math.random()}`,
      dueAt: overrides.dueAt ?? Date.now() - 1000,
      attempts: overrides.attempts ?? 0,
      costUsd: 0,
      sandbox: false,
      submittedAt: Date.now(),
      ...(overrides.taskId ? { taskId: overrides.taskId } : {}),
      ...(overrides.cycleId ? { cycleId: overrides.cycleId } : {}),
      ...(overrides.companyId ? { companyId: overrides.companyId } : {}),
    }));
}

const pull = (t: Harness, id: Id<"seoDataPulls">) => t.run(async (ctx) => await ctx.db.get(id));

describe("claiming", () => {
  test("two workers never hold the same row", async () => {
    const t = harness();
    await seedPull(t);
    await seedPull(t);

    const first = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "one" });
    const second = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "two" });

    // The claim and the mark are one transaction, so the second worker finds
    // the queue already empty. A read-then-patch pair here would not duplicate
    // a log line, it would duplicate a charge.
    expect(first.pulls).toHaveLength(2);
    expect(second.pulls).toHaveLength(0);
  });

  test("a batch is all one operation, because one request is one endpoint", async () => {
    const t = harness();
    await seedPull(t, { operationId: "backlinks_summary", dueAt: Date.now() - 5000 });
    await seedPull(t, { operationId: "domain_ranked_keywords", dueAt: Date.now() - 4000 });
    await seedPull(t, { operationId: "backlinks_summary", dueAt: Date.now() - 3000 });

    const claim = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "one" });

    const operations = new Set(claim.pulls.map((row) => row.operationId));
    expect(operations.size).toBe(1);
  });

  test("a row not yet due is left, and its time is reported", async () => {
    const t = harness();
    const soon = Date.now() + 60_000;
    await seedPull(t, { dueAt: soon });

    const claim = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "one" });

    // The worker sleeps until then rather than spinning, and an empty queue
    // reports nothing at all so the chain can stop completely.
    expect(claim.pulls).toHaveLength(0);
    expect(claim.nextDueAt).toBe(soon);
  });

  test("an empty queue starts nothing", async () => {
    const t = harness();

    const claim = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "one" });

    expect(claim.pulls).toHaveLength(0);
    expect(claim.nextDueAt).toBeNull();
  });

  test("the agent's spend cap stops the next batch and says so", async () => {
    const t = harness();
    const company = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() }));
    const agent = await t.run(async (ctx) =>
      await ctx.db.insert("agents", {
        name: "DataForSEO Agent",
        modelId: "claude-sonnet-5",
        thinkingMode: false,
        isActive: true,
        maxCostGBP: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never));
    const run = await t.run(async (ctx) =>
      await ctx.db.insert("agentRuns", {
        agentId: agent,
        triggerType: "SCHEDULE",
        objective: "collect",
        status: "RUNNING",
        startedAt: Date.now(),
        updatedAt: Date.now(),
      } as never));
    const cycleId = await t.run(async (ctx) =>
      await ctx.db.insert("seoCollectionCycles", {
        companyId: company,
        agentRunId: run,
        trigger: "SCHEDULE",
        status: "SENDING",
        plannedCount: 10,
        reusedCount: 0,
        sentCount: 5,
        readyCount: 5,
        failedCount: 0,
        // Already past the agent's cap.
        totalCostUsd: 9,
        startedAt: Date.now(),
      }));
    await seedPull(t, { cycleId, companyId: company });

    const claim = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "one" });

    // Checked before every batch, not once when the cycle opened: a cycle runs
    // for hours after the run that started it has ended.
    expect(claim.pulls).toHaveLength(0);
    const cycle = await t.run(async (ctx) => await ctx.db.get(cycleId));
    expect(cycle?.status).toBe("CAPPED_SPEND");
    // The rows are left pending, not thrown away, so raising the cap resumes.
    expect((await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect()))[0].status)
      .toBe("PENDING");
  });
});

describe("releasing", () => {
  test("a rate limit returns the row with a later due time", async () => {
    const t = harness();
    const pullId = await seedPull(t);
    await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "one" });

    const before = Date.now();
    await t.mutation(internal.seoCollectionQueue.releaseSeoBatch, {
      pullIds: [pullId],
      attempt: 0,
      reason: "DataForSEO replied 429; the batch was not accepted.",
    });

    const row = await pull(t, pullId);
    expect(row?.status).toBe("PENDING");
    expect(row?.attempts).toBe(1);
    expect(row?.dueAt ?? 0).toBeGreaterThan(before);
    // The claim is given up, or the sweep would later "reclaim" a live row.
    expect(row?.claimedBy).toBeUndefined();
  });

  test("a row gives up after its third attempt", async () => {
    const t = harness();
    const pullId = await seedPull(t, { attempts: 2 });
    await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "one" });

    await t.mutation(internal.seoCollectionQueue.releaseSeoBatch, {
      pullIds: [pullId],
      attempt: 2,
      reason: "DataForSEO could not be reached.",
    });

    // A queue that retried forever would hide an outage behind a backoff.
    expect((await pull(t, pullId))?.status).toBe("FAILED");
  });
});

describe("settling a send", () => {
  test("a queued task waits for its result and records what it already cost", async () => {
    const t = harness();
    const pullId = await seedPull(t);

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
      pullId,
      taskId: "task-1",
      costUsd: 0.0012,
      sandbox: false,
      ready: false,
    });

    const row = await pull(t, pullId);
    // Charged at submission, so the cost is known now even though the answer
    // is not. A ledger that waited for the result would under-report the bill.
    expect(row?.status).toBe("SUBMITTED");
    expect(row?.costUsd).toBe(0.0012);
    expect(row?.completedAt).toBeUndefined();
  });

  test("a refused task still records its cost", async () => {
    const t = harness();
    const pullId = await seedPull(t);

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
      pullId,
      costUsd: 0.0012,
      sandbox: false,
      error: "Invalid Field: 'target'",
      ready: false,
    });

    // DataForSEO charges for setting a task, not for liking the answer.
    const row = await pull(t, pullId);
    expect(row?.status).toBe("FAILED");
    expect(row?.costUsd).toBe(0.0012);
  });

  test("the day's rollup moves, so no screen ever sums the pull table", async () => {
    const t = harness();
    const company = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() }));
    const pullId = await seedPull(t, { companyId: company });

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
      pullId,
      taskId: "task-1",
      costUsd: 0.5,
      sandbox: false,
      ready: false,
    });

    const rollups = await t.run(async (ctx) => await ctx.db.query("seoDayRollups").collect());
    const scopes = rollups.map((row) => row.scopeKey);
    expect(scopes).toContain("platform");
    expect(scopes).toContain(`company:${company}`);
    expect(rollups.every((row) => row.costUsd === 0.5)).toBe(true);
  });
});

describe("the pingback's own mutation", () => {
  test("an id we never sent does nothing at all", async () => {
    const t = harness();

    const result = await t.mutation(internal.seoCollectionQueue.markSeoPinged, {
      taskId: "not-ours",
    });

    // The cheap miss is the security property: a flood of invented ids must
    // not become a flood of our own outbound requests.
    expect(result).toBeNull();
  });

  test("a task that already came back is not fetched again", async () => {
    const t = harness();
    await seedPull(t, { status: "READY", taskId: "task-1" });

    expect(await t.mutation(internal.seoCollectionQueue.markSeoPinged, { taskId: "task-1" }))
      .toBeNull();
  });

  test("a live submitted task is marked and handed on", async () => {
    const t = harness();
    const pullId = await seedPull(t, { status: "SUBMITTED", taskId: "task-1" });

    const result = await t.mutation(internal.seoCollectionQueue.markSeoPinged, {
      taskId: "task-1",
    });

    expect(result).toBe(pullId);
    expect((await pull(t, pullId))?.pingedAt).toBeTruthy();
  });
});

describe("settling a result", () => {
  test("the second arrival is ignored, so nothing is counted twice", async () => {
    const t = harness();
    const company = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() }));
    const pullId = await seedPull(t, { status: "SUBMITTED", taskId: "t", companyId: company });

    await t.mutation(internal.seoCollectionQueue.settleSeoResult, { pullId, costUsd: 0 });
    await t.mutation(internal.seoCollectionQueue.settleSeoResult, { pullId, costUsd: 0 });

    // The pingback and the hourly sweep can both reach one task. The rollup
    // must not learn about it twice.
    const rollups = await t.run(async (ctx) => await ctx.db.query("seoDayRollups").collect());
    expect(rollups.find((row) => row.scopeKey === "platform")?.ready).toBe(1);
  });
});
