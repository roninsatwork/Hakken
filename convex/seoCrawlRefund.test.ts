import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { storedAnswer } from "@/src/test/storedAnswer";
import { creditCycleLine } from "./creditHooks";
import { crawlRefundUsd, recordCrawlRefund } from "./seoCrawlRefund";

/**
 * A crawl's refund, recorded (finish-off-plan.md, item 5): DataForSEO takes
 * $1.50 for a thousand pages up front and gives back the pages it did not
 * crawl; the cost recorded comes down to what was crawled, everywhere it is
 * held.
 */

const modules = import.meta.glob("./**/*.*s");
const asCtx = (ctx: unknown) => ctx as MutationCtx;

beforeEach(() => {
  vi.useFakeTimers();
  // Midday: the send and the refund fall on one day, as the rollups count days.
  const now = new Date();
  vi.setSystemTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a crawl's refund", () => {
  test("is what was charged less the pages crawled at the price a page was charged", () => {
    const crawl = { operationId: "site_crawl", status: "READY" as const, taskArgsJson: JSON.stringify({ target: "a.com", max_crawl_pages: 1000 }), costUsd: 1.5 };
    expect(crawlRefundUsd({ ...crawl, rowsReturned: 7 })).toBeCloseTo(1.4895, 6);
    expect(crawlRefundUsd({ ...crawl, rowsReturned: 1000 })).toBe(0);
    expect(crawlRefundUsd({ ...crawl, rowsReturned: undefined })).toBe(0);
    expect(crawlRefundUsd({ ...crawl, rowsReturned: 7, costUsd: 0 })).toBe(0);
    expect(crawlRefundUsd({ ...crawl, rowsReturned: 7, operationId: "backlinks_list" })).toBe(0);
  });

  test("comes off the request, its collection, the day, the website's spend, a crawl's price, the Collector run and the credit charge", async () => {
    const t = convexTest(schema, modules);
    const { pullId, cycleId, runId, companyId, websiteId } = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const now = Date.now();
      const companyId = await ctx.db.insert("companies", { name: "Period House Group", createdAt: now });
      const websiteId = await ctx.db.insert("websites", { host: "corston.com", displayHost: "corston.com", firstSeenAt: now });
      const agentId = await ctx.db.insert("agents", {
        name: "Collector", modelId: "model-test", thinkingMode: false, isActive: true, systemKey: "DATAFORSEO_COLLECTOR", createdAt: now, updatedAt: now,
      });
      const runId = await ctx.db.insert("agentRuns", { agentId, triggerType: "MANUAL", objective: "collect", status: "RUNNING", startedAt: now, updatedAt: now });
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId, trigger: "SCHEDULE", status: "SENDING", plannedCount: 1, reusedCount: 0, sentCount: 0, readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: now,
      });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "site_crawl", family: "On-Page", mode: "QUEUED", target: "corston.com", websiteId, companyId, cycleId,
        taskArgsJson: JSON.stringify({ target: "corston.com", max_crawl_pages: 1000, enable_javascript: true }),
        status: "CLAIMED", tag: "crawl-tag", costUsd: 0, sandbox: false, submittedAt: now, claimedAt: now, claimedBy: "worker",
      });
      const lineId = await ctx.db.insert("seoCycleLines", { cycleId, companyId, websiteId, operationId: "site_crawl", pullId, reused: false, createdAt: now });
      const cycle = (await ctx.db.get(cycleId))!;
      await creditCycleLine(ctx, cycle, websiteId, pullId, false, lineId);
      return { pullId, cycleId, runId, companyId, websiteId };
    });

    // Charged $1.50 when it is set; its summary comes back finished, having crawled seven pages.
    await t.mutation(internal.seoCollectionQueue.settleSeoSend, { pullId, runId, taskId: "task-crawl", costUsd: 1.5, sandbox: false, ready: false });
    const summary = [{ crawl_progress: "finished", crawl_status: { max_crawl_pages: 1000, pages_crawled: 7 } }];
    await t.mutation(internal.seoCollectionQueue.settleSeoResult, { pullId, resultFile: await storedAnswer(t, JSON.stringify(summary)), rowsReturned: 7, costUsd: 0 });

    const kept = 7 * 0.0015;
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const pull = (await ctx.db.get(pullId))!;
      expect(pull.costUsd).toBeCloseTo(kept, 6);
      expect(pull.refundedUsd).toBeCloseTo(1.5 - kept, 6);
      expect((await ctx.db.get(cycleId))?.totalCostUsd).toBeCloseTo(kept, 6);
      const day = new Date().toISOString().slice(0, 10);
      for (const scopeKey of ["platform", `company:${companyId}`]) {
        const rollup = await ctx.db.query("seoDayRollups").withIndex("by_scope_day", (q) => q.eq("scopeKey", scopeKey).eq("day", day)).unique();
        expect(rollup?.costUsd).toBeCloseTo(kept, 6);
      }
      const spend = await ctx.db.query("seoCycleSpend").withIndex("by_cycle_website", (q) => q.eq("cycleId", cycleId).eq("websiteId", websiteId)).unique();
      expect(spend?.spentUsd).toBeCloseTo(kept, 6);
      const price = await ctx.db.query("seoOperationCosts").withIndex("by_operation", (q) => q.eq("operationId", "site_crawl")).unique();
      expect(price?.totalUsd).toBeCloseTo(kept, 6);
      expect((await ctx.db.get(runId))?.costUsd).toBeCloseTo(kept, 6);
      const transactions = await ctx.db.query("agentTransactions").collect();
      expect(transactions.map((row) => row.costUsd)).toEqual([1.5, -(1.5 - kept)].map((value) => expect.closeTo(value, 6)));

      // The collection is done; its site audit charged one credit for seven pages, at what the crawl really cost.
      const [charge] = await ctx.db.query("creditCharges").withIndex("by_company_at", (q) => q.eq("companyId", companyId)).collect().then((rows) => rows.filter((row) => row.entry === "charge"));
      expect(charge).toMatchObject({ kind: "siteAudit", state: "charged", units: 7, creditsOut: 1 });
      expect(charge.realCostUsd).toBeCloseTo(kept, 6);
      const month = await ctx.db.query("creditMonthRollups").withIndex("by_company_month", (q) => q.eq("companyId", companyId)).first();
      expect(month?.realCostUsd).toBeCloseTo(kept, 6);
      const platform = await ctx.db.query("creditPlatformMonths").first();
      expect(platform?.realCostUsd).toBeCloseTo(kept, 6);

      // Once only.
      expect(await recordCrawlRefund(ctx, pullId)).toBe(0);
      expect((await ctx.db.get(pullId))?.costUsd).toBeCloseTo(kept, 6);
    });
  });
});
