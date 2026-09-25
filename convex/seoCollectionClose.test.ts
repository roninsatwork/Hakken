import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Closing a collection run by hand (Anthony, 2026-09-25: "is there a way to
 * manually close it").
 *
 * What must hold: nothing more is bought for a closed run — its unsent
 * requests come off the queue with their plan lines, its work list stops
 * being written, and a dead claim on it is dropped rather than put back in the
 * queue — while answers already paid for are left to be filed; and the run
 * says who closed it and how many requests came off.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

// Held still, so nothing a close schedules runs behind the test.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type CycleStatus = "EXPANDING" | "SENDING" | "COLLECTING" | "DONE";
type PullStatus = "PENDING" | "CLAIMED" | "SUBMITTED" | "READY";

async function setup(t: Harness, status: CycleStatus, extra: Record<string, unknown> = {}) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Anthony", email: "su@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now(),
    });
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: Date.now() });
    const cycleId = await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "MANUAL", status, plannedCount: 4, reusedCount: 0, sentCount: 2,
      readyCount: 1, failedCount: 0, totalCostUsd: 0.5, startedAt: Date.now(), ...extra,
    });
    return { userId, companyId, websiteId, cycleId };
  });
  return { ...ids, admin: t.withIdentity({ subject: ids.userId }) };
}

/** A request in the run, with its plan line. */
async function request(t: Harness, ids: { companyId: Id<"companies">; websiteId: Id<"websites">; cycleId: Id<"seoCollectionCycles"> }, status: PullStatus, extra: Record<string, unknown> = {}) {
  return await t.run(async (ctx) => {
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "domain_ranked_keywords", family: "DataForSEO Labs", mode: "QUEUED", taskArgsJson: "{}", status,
      cycleId: ids.cycleId, companyId: ids.companyId, websiteId: ids.websiteId,
      tag: `t-${Math.random()}`, costUsd: 0, sandbox: false, submittedAt: Date.now(), dueAt: Date.now(), ...extra,
    });
    await ctx.db.insert("seoCycleLines", {
      cycleId: ids.cycleId, companyId: ids.companyId, websiteId: ids.websiteId,
      operationId: "domain_ranked_keywords", pullId, reused: false, createdAt: Date.now(),
    });
    return pullId;
  });
}

const get = <T extends "seoDataPulls" | "seoCollectionCycles">(t: Harness, id: Id<T>) =>
  t.run(async (ctx) => await ctx.db.get(id));
const linesOf = (t: Harness, pullId: Id<"seoDataPulls">) =>
  t.run(async (ctx) => await ctx.db.query("seoCycleLines").withIndex("by_pull", (q) => q.eq("pullId", pullId)).collect());

describe("closing a collection run by hand", () => {
  test("takes unsent requests off the queue, leaves answers on their way, and says who closed it", async () => {
    const t = harness();
    const s = await setup(t, "SENDING");
    const unsent = [await request(t, s, "PENDING"), await request(t, s, "PENDING")];
    const onItsWay = await request(t, s, "SUBMITTED");
    const answered = await request(t, s, "READY");

    await s.admin.mutation(api.seoCollectionClose.closeCollectionRun, { cycleId: s.cycleId });

    for (const pullId of unsent) {
      expect(await get(t, pullId)).toBeNull();
      expect(await linesOf(t, pullId)).toEqual([]);
    }
    // Paid for: left to be filed when their answers come.
    expect(await get(t, onItsWay)).toMatchObject({ status: "SUBMITTED" });
    expect(await get(t, answered)).toMatchObject({ status: "READY" });
    expect(await get(t, s.cycleId)).toMatchObject({ status: "DONE", closedBy: s.userId, closedUnsent: 2 });
    expect((await get(t, s.cycleId))?.finishedAt).toEqual(expect.any(Number));
  });

  test("a request another company's run still needs is handed to that run, not deleted", async () => {
    const t = harness();
    const s = await setup(t, "SENDING");
    const shared = await request(t, s, "PENDING");
    // Another company's run needs the same answer, and points its own line at it.
    const other = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Nash", createdAt: Date.now() });
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId, trigger: "SCHEDULE", status: "SENDING", plannedCount: 1, reusedCount: 1, sentCount: 0,
        readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
      });
      await ctx.db.insert("seoCycleLines", {
        cycleId, companyId, websiteId: s.websiteId, operationId: "domain_ranked_keywords",
        pullId: shared, reused: true, createdAt: Date.now(),
      });
      return { cycleId };
    });

    await s.admin.mutation(api.seoCollectionClose.closeCollectionRun, { cycleId: s.cycleId });

    expect(await get(t, shared)).toMatchObject({ status: "PENDING", cycleId: other.cycleId });
    expect((await linesOf(t, shared)).map((line) => line.cycleId)).toEqual([other.cycleId]);
    // Nothing was taken off the queue: the request is still going to be sent.
    expect(await get(t, s.cycleId)).toMatchObject({ status: "DONE", closedUnsent: 0 });
  });

  test("refuses a run that is already closed", async () => {
    const t = harness();
    const s = await setup(t, "DONE");

    await expect(s.admin.mutation(api.seoCollectionClose.closeCollectionRun, { cycleId: s.cycleId }))
      .rejects.toThrow(/already closed/);
  });

  test("stops a work list still being written", async () => {
    const t = harness();
    const s = await setup(t, "EXPANDING");

    await s.admin.mutation(api.seoCollectionClose.closeCollectionRun, { cycleId: s.cycleId });
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: s.cycleId });

    expect(await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect())).toEqual([]);
    expect(await get(t, s.cycleId)).toMatchObject({ status: "DONE" });
  });

  test("a dead claim on a closed run is dropped, not put back in the queue for the next Collector", async () => {
    const t = harness();
    // Closed by hand, and the closer's data since erased: the name is gone,
    // what the close took off the queue is not.
    const closed = await setup(t, "DONE", { closedUnsent: 3 });
    const deadOnClosed = await request(t, closed, "CLAIMED", { claimedAt: Date.now() - 60 * 60 * 1000, claimedBy: "gone" });
    const open = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId: closed.companyId, trigger: "MANUAL", status: "SENDING", plannedCount: 1, reusedCount: 0, sentCount: 0,
      readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
    }));
    const deadOnOpen = await request(t, { ...closed, cycleId: open }, "CLAIMED", { claimedAt: Date.now() - 60 * 60 * 1000, claimedBy: "gone" });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    expect(await get(t, deadOnClosed)).toBeNull();
    expect(await linesOf(t, deadOnClosed)).toEqual([]);
    // An open run's dead claim was never sent, so it goes back in the queue as before.
    expect(await get(t, deadOnOpen)).toMatchObject({ status: "PENDING" });
  });
});
