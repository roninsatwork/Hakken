import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { cycleRunKey, type CreditKind } from "./creditKinds";
import { addToCreditRun, closeCreditRun, openCreditRun } from "./creditLedger";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * The one-off recount (finish-off-plan.md, item 3): charges made while every
 * list counted the rows it asked for, and every crawl the pages it might
 * read, counted again from what came back — each a "Counted again" line of
 * its own, once, however often it is run.
 */

const modules = import.meta.glob("./**/*.*s");
const asCtx = (ctx: unknown) => ctx as MutationCtx;

beforeEach(() => {
  vi.useFakeTimers();
  // Midday, so the month the charges are made in is the month they are counted again in.
  const now = new Date();
  vi.setSystemTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12));
});
afterEach(() => {
  vi.useRealTimers();
});

type Seeded = { acme: Id<"companies">; crawl: Id<"seoDataPulls">; page: Id<"seoDataPulls">; list: Id<"seoDataPulls"> };

/** Dev as it stood on 5 October: lines counted as asked, runs charged on that, answers kept. */
async function seedOldCollection(t: ReturnType<typeof convexTest>): Promise<Seeded> {
  return await t.run(async (raw) => {
    const ctx = asCtx(raw);
    const now = Date.now();
    const acme = await ctx.db.insert("companies", { name: "Acme", createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "example.com", displayHost: "example.com", firstSeenAt: now });
    const cycleId = await ctx.db.insert("seoCollectionCycles", {
      companyId: acme, trigger: "SCHEDULE", status: "DONE", plannedCount: 4, reusedCount: 0, sentCount: 4, readyCount: 3, failedCount: 1, totalCostUsd: 2, startedAt: now - 60_000,
    });
    const pull = async (operationId: string, family: string, taskArgs: Record<string, unknown>, status: Doc<"seoDataPulls">["status"], answer?: unknown, line = true) => {
      const id = await ctx.db.insert("seoDataPulls", {
        operationId, family, mode: "LIVE", websiteId, companyId: acme, cycleId, taskArgsJson: JSON.stringify(taskArgs), status,
        tag: `tag-${operationId}-${Math.random()}`, costUsd: 0.1, sandbox: false, submittedAt: now - 50_000, completedAt: now - 40_000,
      });
      if (answer !== undefined) await ctx.db.insert("seoPullAnswers", { pullId: id, resultJson: JSON.stringify(answer), storedAt: now });
      if (line) await ctx.db.insert("seoCycleLines", { cycleId, companyId: acme, websiteId, operationId, pullId: id, reused: false, createdAt: now - 50_000 });
      return id;
    };
    const rows = (count: number) => [{ items_count: count, items: Array.from({ length: count }, (_, index) => ({ domain_from: `site${index}.com` })) }];
    const list = await pull("backlinks_list", "Backlinks", { target: "example.com", limit: 1000 }, "READY", rows(340));
    // Its later page, queued by its answer with no line of its own: never counted before.
    const page = await pull("backlinks_list", "Backlinks", { target: "example.com", limit: 1000, offset: 340 }, "READY", rows(200), false);
    const crawl = await pull("site_crawl", "On-Page", { target: "example.com", max_crawl_pages: 1000 }, "READY", [{ crawl_progress: "finished", crawl_status: { max_crawl_pages: 1000, pages_crawled: 1 } }]);
    await pull("serp_google_organic", "SERP", { keyword: "web design" }, "READY", [{ items: [] }]);
    const failed = await pull("backlinks_broken", "Backlinks", { target: "example.com", limit: 1000 }, "FAILED");

    // Each run charged as the old count had it, before the failure came back.
    const charge = async (kind: CreditKind, units: number, realCostUsd: number) => {
      const run = await openCreditRun(ctx, { companyId: acme, kind, runKey: cycleRunKey(cycleId, websiteId, kind), how: "scheduled", websiteId, cycleId }, now - 30_000);
      await addToCreditRun(ctx, run, { units, lines: 1, realCostUsd });
      await closeCreditRun(ctx, run._id, now - 30_000);
    };
    await charge("backlinks", 2000, 0.3);
    await charge("siteAudit", 1000, 0.1);
    await charge("rankings", 1, 0.1);
    await ctx.db.patch(failed, { completedAt: now - 10_000 });
    return { acme, crawl, page, list };
  });
}

async function statementOf(t: ReturnType<typeof convexTest>, acme: Id<"companies">) {
  return await t.run(async (raw) => await asCtx(raw).db.query("creditCharges").withIndex("by_company_at", (q) => q.eq("companyId", acme)).collect());
}

describe("the recount of charges made before credits counted what came back", () => {
  test("each run is counted again from what came back, as a line of its own, once", async () => {
    const t = convexTest(schema, modules);
    const { acme, crawl, page, list } = await seedOldCollection(t);
    const before = await statementOf(t, acme);
    expect(before.filter((line) => line.entry === "charge").map((line) => [line.kind, line.creditsOut])).toEqual([["backlinks", 20], ["siteAudit", 20], ["rankings", 1]]);

    await t.mutation(internal.creditCorrections.recountCollectionCredits, { since: 0 });
    await finishScheduled(t);

    const after = await statementOf(t, acme);
    const recounts = after.filter((line) => line.entry === "recount");
    // Backlinks: 340 and 200 links came back, and the failed list nothing — 540 is 6 credits, not 20.
    // Site audit: one page crawled — 1 credit, not 20. Rankings: one check was always one.
    expect(recounts.map((line) => [line.kind, line.units, line.before, line.creditsIn, line.creditsOut, line.reason])).toEqual([
      ["backlinks", 540, 2000, 14, 0, "recounted"],
      ["siteAudit", 1, 1000, 19, 0, "recounted"],
    ]);
    expect(recounts.at(-1)?.balanceAfter).toBe(10_000 - 41 + 33);
    // The lines the first charges were made on stand as they were.
    expect(after.filter((line) => line.entry === "charge").map((line) => [line.units, line.creditsOut, line.creditsNow])).toEqual([[2000, 20, 6], [1000, 20, 1], [1, 1, undefined]]);

    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      expect((await ctx.db.get(list))?.rowsReturned).toBe(340);
      expect((await ctx.db.get(crawl))?.rowsReturned).toBe(1);
      // The crawl's refund, recorded too (item 5): one page of a thousand kept of its $0.10.
      expect((await ctx.db.get(crawl))?.refundedUsd).toBeCloseTo(0.0999, 6);
      const audit = (await ctx.db.query("creditCharges").collect()).find((row) => row.entry === "charge" && row.kind === "siteAudit");
      expect(audit?.realCostUsd).toBeCloseTo(0.0001, 6);
      expect((await ctx.db.get(page))?.creditUnits).toBe(200);
      const lines = await ctx.db.query("seoCycleLines").collect();
      expect(lines.map((line) => line.creditUnits).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 1, 1, 340]);
      // What every company's month says moved with it: 41 credits charged, 33 given back.
      const months = await ctx.db.query("creditPlatformMonths").collect();
      expect(months.reduce((sum, month) => sum + month.credits, 0)).toBe(8);
    });

    // Run again: nothing more to count.
    await t.mutation(internal.creditCorrections.recountCollectionCredits, { since: 0 });
    await finishScheduled(t);
    expect(await statementOf(t, acme)).toHaveLength(after.length);
  });
});
