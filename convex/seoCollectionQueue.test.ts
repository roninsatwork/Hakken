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
    mode: "LIVE" | "QUEUED";
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
      mode: overrides.mode ?? "LIVE",
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
    await seedPull(t, { operationId: "serp_google_organic", mode: "QUEUED" });
    await seedPull(t, { operationId: "serp_google_organic", mode: "QUEUED" });

    const first = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "one" });
    const second = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "two" });

    // The claim and the mark are one transaction, so the second worker finds
    // the queue already empty. A read-then-patch pair here would not duplicate
    // a log line, it would duplicate a charge.
    expect(first.pulls).toHaveLength(2);
    expect(second.pulls).toHaveLength(0);
  });

  test("a live endpoint is sent one task per request, because it refuses the rest", async () => {
    const t = harness();
    await seedPull(t);
    await seedPull(t);

    // DataForSEO answered a batch of two live tasks with "You can set only one
    // task at a time" on 2026-09-23, and the second was lost.
    const first = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "one" });
    const second = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "two" });
    expect(first.pulls).toHaveLength(1);
    expect(second.pulls).toHaveLength(1);
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
        // Not a real model id: nothing here calls a model, and a literal one
        // would be a runtime model choice hidden in a fixture.
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        maxCostUsd: 5,
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

describe("closing a cycle", () => {
  test("a run whose last pull settles is done at once, not in an hour", async () => {
    const t = harness();
    const company = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() }));
    const cycleId = await t.run(async (ctx) =>
      await ctx.db.insert("seoCollectionCycles", {
        companyId: company,
        trigger: "MANUAL",
        status: "SENDING",
        plannedCount: 1,
        reusedCount: 0,
        sentCount: 0,
        readyCount: 0,
        failedCount: 0,
        totalCostUsd: 0,
        startedAt: Date.now(),
      }));
    const pullId = await seedPull(t, { cycleId, companyId: company });

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
      pullId,
      costUsd: 0,
      sandbox: true,
      ready: true,
    });

    // The hourly sweep closes cycles too, but it used to be the only thing
    // that did — so a finished run read "Sending" on screen for up to an hour.
    const cycle = await t.run(async (ctx) => await ctx.db.get(cycleId));
    expect(cycle?.status).toBe("DONE");
    expect(cycle?.finishedAt).toBeTruthy();
  });

  test("a run still waiting on an answer says so rather than 'sending'", async () => {
    const t = harness();
    const company = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() }));
    const cycleId = await t.run(async (ctx) =>
      await ctx.db.insert("seoCollectionCycles", {
        companyId: company,
        trigger: "MANUAL",
        status: "SENDING",
        plannedCount: 2,
        reusedCount: 0,
        sentCount: 0,
        readyCount: 0,
        failedCount: 0,
        totalCostUsd: 0,
        startedAt: Date.now(),
      }));
    const first = await seedPull(t, { cycleId, companyId: company });
    await seedPull(t, { cycleId, companyId: company, status: "SUBMITTED", taskId: "t" });

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
      pullId: first,
      costUsd: 0,
      sandbox: true,
      ready: true,
    });

    // Everything this cycle had to send has gone; what is left is waiting on
    // DataForSEO, which is a different thing and reads differently.
    expect((await t.run(async (ctx) => await ctx.db.get(cycleId)))?.status).toBe("COLLECTING");
  });

  test("a capped cycle keeps the more specific thing it already said", async () => {
    const t = harness();
    const company = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() }));
    const cycleId = await t.run(async (ctx) =>
      await ctx.db.insert("seoCollectionCycles", {
        companyId: company,
        trigger: "SCHEDULE",
        status: "CAPPED_PLAN",
        plannedCount: 1,
        reusedCount: 0,
        sentCount: 0,
        readyCount: 0,
        failedCount: 0,
        totalCostUsd: 0,
        startedAt: Date.now(),
      }));
    const pullId = await seedPull(t, { cycleId, companyId: company });

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
      pullId,
      costUsd: 0,
      sandbox: true,
      ready: true,
    });

    // "Done" would hide why it stopped, which is the one thing somebody
    // looking at a capped run needs to know.
    expect((await t.run(async (ctx) => await ctx.db.get(cycleId)))?.status).toBe("CAPPED_PLAN");
  });
});

describe("what a company costs to serve", () => {
  test("a company served by somebody else's pull is credited, not called free", async () => {
    const t = harness();
    const payer = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Payer Ltd", createdAt: Date.now() }));
    const freeloader = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Reuser Ltd", createdAt: Date.now() }));
    const website = await t.run(async (ctx) =>
      await ctx.db.insert("websites", {
        host: "shared.com", displayHost: "shared.com", firstSeenAt: Date.now(),
      }));

    const pullId = await seedPull(t, { companyId: payer });

    // Both companies have a line against the one pull: the payer's own cycle
    // bought it, and the other's cycle reused it.
    await t.run(async (ctx) => {
      for (const [companyId, reused] of [[payer, false], [freeloader, true]] as const) {
        const cycleId = await ctx.db.insert("seoCollectionCycles", {
          companyId, trigger: "SCHEDULE", status: "SENDING",
          plannedCount: 1, reusedCount: 0, sentCount: 0, readyCount: 0, failedCount: 0,
          totalCostUsd: 0, startedAt: Date.now(),
        });
        await ctx.db.insert("seoCycleLines", {
          cycleId, companyId, websiteId: website,
          operationId: "backlinks_summary", pullId, reused, createdAt: Date.now(),
        });
      }
    });

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
      pullId, costUsd: 0.4, sandbox: false, ready: true,
    });

    const rollups = await t.run(async (ctx) => await ctx.db.query("seoDayRollups").collect());
    const paid = rollups.find((row) => row.scopeKey === `company:${payer}`);
    const free = rollups.find((row) => row.scopeKey === `company:${freeloader}`);

    // Money out belongs to whoever spent it.
    expect(paid?.costUsd).toBe(0.4);
    expect(paid?.reusedValueUsd).toBe(0);

    // And the other company is not free to serve. Reading it as free is how a
    // price gets set that breaks the day the paying customer leaves.
    expect(free?.costUsd).toBe(0);
    expect(free?.reusedValueUsd).toBe(0.4);
  });

  test("the payer is never also credited for its own pull", async () => {
    const t = harness();
    const company = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Only Client", createdAt: Date.now() }));
    const website = await t.run(async (ctx) =>
      await ctx.db.insert("websites", {
        host: "a.com", displayHost: "a.com", firstSeenAt: Date.now(),
      }));
    const pullId = await seedPull(t, { companyId: company });

    await t.run(async (ctx) => {
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId: company, trigger: "SCHEDULE", status: "SENDING",
        plannedCount: 1, reusedCount: 0, sentCount: 0, readyCount: 0, failedCount: 0,
        totalCostUsd: 0, startedAt: Date.now(),
      });
      // Two lines, one pull: the same company asked twice in one cycle.
      for (const reused of [false, true]) {
        await ctx.db.insert("seoCycleLines", {
          cycleId, companyId: company, websiteId: website,
          operationId: "backlinks_summary", pullId, reused, createdAt: Date.now(),
        });
      }
    });

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
      pullId, costUsd: 0.4, sandbox: false, ready: true,
    });

    // Standalone cost would otherwise read as double what was spent.
    const rollups = await t.run(async (ctx) => await ctx.db.query("seoDayRollups").collect());
    const own = rollups.find((row) => row.scopeKey === `company:${company}`);
    expect(own?.costUsd).toBe(0.4);
    expect(own?.reusedValueUsd).toBe(0);
  });

  test("nothing is credited for an answer that never arrived", async () => {
    const t = harness();
    const payer = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Payer Ltd", createdAt: Date.now() }));
    const other = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Reuser Ltd", createdAt: Date.now() }));
    const website = await t.run(async (ctx) =>
      await ctx.db.insert("websites", {
        host: "a.com", displayHost: "a.com", firstSeenAt: Date.now(),
      }));
    const pullId = await seedPull(t, { companyId: payer });

    await t.run(async (ctx) => {
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId: other, trigger: "SCHEDULE", status: "SENDING",
        plannedCount: 0, reusedCount: 1, sentCount: 0, readyCount: 0, failedCount: 0,
        totalCostUsd: 0, startedAt: Date.now(),
      });
      await ctx.db.insert("seoCycleLines", {
        cycleId, companyId: other, websiteId: website,
        operationId: "backlinks_summary", pullId, reused: true, createdAt: Date.now(),
      });
    });

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
      pullId, costUsd: 0.4, sandbox: false, error: "Invalid Field", ready: false,
    });

    // A failed pull still costs the payer, because DataForSEO charges on
    // submission. It is worth nothing to anybody else.
    const rollups = await t.run(async (ctx) => await ctx.db.query("seoDayRollups").collect());
    expect(rollups.find((row) => row.scopeKey === `company:${payer}`)?.costUsd).toBe(0.4);
    expect(rollups.find((row) => row.scopeKey === `company:${other}`)?.reusedValueUsd)
      .toBeUndefined();
  });
});
