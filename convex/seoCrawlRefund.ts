import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { creditCostRefunded } from "./creditHooks";
import { tallyWebsiteSpend } from "./seoCollectionLimits";

/**
 * A crawl's refund, recorded (finish-off-plan.md, item 5).
 *
 * DataForSEO charges a site crawl up front for every page it may read —
 * `max_crawl_pages`, a thousand, $1.50 with JavaScript at $0.0015 a page —
 * and once the crawl is finished gives back the pages it did not crawl: "If
 * you specified more pages than a website contains, the difference will be
 * automatically refunded to your account after a task is completed" (their
 * help centre). Our records kept the $1.50, so 14 crawls on 5 October read
 * $21 when they really cost about $5.21.
 *
 * When a finished crawl's summary is recorded, its cost comes down to the
 * pages crawled at the price a page was charged — what was charged over the
 * pages it might read — and the reduction is carried through everything that
 * holds that cost: the request, its collection's total, the day's rollups
 * (platform and company, on the day it was refunded), the website's spend in
 * that collection, the running price of a crawl, the Collector run that sent
 * it, and the credit charge's real cost. Once only: the request keeps what
 * was refunded (`refundedUsd`).
 */

/** What a finished crawl was refunded: what it was charged, less its pages crawled at the price a page was charged. */
export function crawlRefundUsd(pull: Pick<Doc<"seoDataPulls">, "operationId" | "taskArgsJson" | "costUsd" | "rowsReturned" | "status">): number {
  if (pull.operationId !== "site_crawl" || pull.status !== "READY" || pull.rowsReturned === undefined || !(pull.costUsd > 0)) return 0;
  let asked: unknown;
  try {
    asked = (JSON.parse(pull.taskArgsJson) as Record<string, unknown>).max_crawl_pages;
  } catch {
    return 0;
  }
  if (typeof asked !== "number" || !(asked > 0) || pull.rowsReturned >= asked) return 0;
  const kept = Math.max(0, pull.rowsReturned) * (pull.costUsd / asked);
  return Math.round((pull.costUsd - kept) * 1e6) / 1e6;
}

/** The day's cost in a rollup, moved by a refund. */
async function rollupCostDown(ctx: MutationCtx, scopeKey: string, day: string, refund: number): Promise<void> {
  const row = await ctx.db
    .query("seoDayRollups")
    .withIndex("by_scope_day", (q) => q.eq("scopeKey", scopeKey).eq("day", day))
    .unique();
  if (row) await ctx.db.patch(row._id, { costUsd: row.costUsd - refund, updatedAt: Date.now() });
  else await ctx.db.insert("seoDayRollups", { scopeKey, day, pulls: 0, reused: 0, sent: 0, ready: 0, failed: 0, costUsd: -refund, reusedValueUsd: 0, updatedAt: Date.now() });
}

/** The Collector run that sent it: its cost down, and a cost record of the refund beside the call's own. */
async function runCostDown(ctx: MutationCtx, runId: Id<"agentRuns">, pull: Doc<"seoDataPulls">, refund: number): Promise<void> {
  const run = await ctx.db.get(runId);
  if (!run) return;
  const now = Date.now();
  await ctx.db.patch(runId, { costUsd: Math.max(0, (run.costUsd ?? 0) - refund), updatedAt: now });
  await ctx.db.insert("agentTransactions", {
    agentId: run.agentId,
    ...(pull.companyId ? { companyId: pull.companyId } : {}),
    actionContext: `dataforseo:${pull.operationId}:refund`,
    modelUsed: pull.operationId,
    providerKey: "dataforseo",
    inputTokens: 0,
    outputTokens: 0,
    costUsd: -refund,
    status: "SUCCESS",
    createdAt: now,
  });
}

/**
 * Record a finished crawl's refund, if it has one and it is not recorded yet.
 * Returns what was refunded, in US dollars.
 */
export async function recordCrawlRefund(ctx: MutationCtx, pullId: Id<"seoDataPulls">): Promise<number> {
  const pull = await ctx.db.get(pullId);
  if (!pull || pull.refundedUsd !== undefined) return 0;
  const refund = crawlRefundUsd(pull);
  if (refund <= 0) return 0;
  await ctx.db.patch(pullId, { costUsd: pull.costUsd - refund, refundedUsd: refund });

  if (pull.cycleId) {
    const cycle = await ctx.db.get(pull.cycleId);
    if (cycle) await ctx.db.patch(cycle._id, { totalCostUsd: Math.max(0, cycle.totalCostUsd - refund) });
  }
  // Refunded when the crawl finished: that day's money, as the rollups count days (UTC).
  const day = new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10);
  await rollupCostDown(ctx, "platform", day, refund);
  if (pull.companyId) await rollupCostDown(ctx, `company:${pull.companyId}`, day, refund);
  await tallyWebsiteSpend(ctx, pull, -refund);

  const price = await ctx.db.query("seoOperationCosts").withIndex("by_operation", (q) => q.eq("operationId", pull.operationId)).unique();
  if (price) await ctx.db.patch(price._id, { totalUsd: Math.max(0, price.totalUsd - refund), lastUsd: pull.costUsd - refund, updatedAt: Date.now() });

  if (pull.sentByRunId) await runCostDown(ctx, pull.sentByRunId, pull, refund);
  await creditCostRefunded(ctx, pull, refund);
  return refund;
}
