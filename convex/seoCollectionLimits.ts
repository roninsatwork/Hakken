import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ukDayStart } from "./creditKinds";

/**
 * What the Collector may spend (docs/plans/active/collection-progress-plan.md,
 * decisions 3 and 5), both set on its own Settings:
 *
 * - **A limit per website** — the agent's `maxCostUsd`, $3 by Anthony's word
 *   on 2026-10-05: what one website's requests in one collection may cost.
 *   A request that would take its website past it is not bought, says why on
 *   its row, and the rest of the collection carries on. It was the limit of
 *   one Collector run until a run became one continuous send, as long as the
 *   queue, which a limit per run would stop at every large collection.
 * - **A ceiling a day** — the agent's `maxDailyCostUsd`, $100: everything the
 *   Collector sends in a UK day. Reached, nothing more is sent that day; the
 *   requests stay waiting and go after midnight, or once it is raised.
 *
 * Each is judged on what a request is expected to cost — what its call has
 * cost on average — before it is sent. Unset or zero, a limit holds nothing
 * back, the platform's convention for `maxCostUsd`. A request outside a
 * collection (a fan-out query, a one-off pull) has no collection to count
 * against, so only the day's ceiling holds it.
 */

/** The Collector's runs read to add up what it has spent today. */
const RUNS_READ_FOR_TODAY = 200;

export type HeldBack = {
  /** The requests that may go, in the order given. */
  send: Doc<"seoDataPulls">[];
  /** Why nothing may go today, when the day's ceiling is reached. */
  capped: string | null;
};

/**
 * Hold back what a batch may not spend: the requests over their website's
 * limit are failed, saying why, and the batch is cut where the day's ceiling
 * would be passed. At least one request still goes while any of the day is
 * left, so a send always moves.
 */
export async function holdToLimits(
  ctx: MutationCtx,
  rows: Doc<"seoDataPulls">[],
  failRow: (row: Doc<"seoDataPulls">, error: string) => Promise<void>,
): Promise<HeldBack> {
  if (rows.length === 0) return { send: [], capped: null };
  const collector = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "DATAFORSEO_COLLECTOR")).first();
  const perWebsite = positive(collector?.maxCostUsd);
  const perDay = positive(collector?.maxDailyCostUsd);
  const price = await expectedPrice(ctx, rows[0].operationId);

  let dayLeft = Number.POSITIVE_INFINITY;
  if (perDay !== null && collector) {
    const spent = await spentToday(ctx, collector._id);
    if (spent >= perDay) return { send: [], capped: dayCappedReason(perDay, spent) };
    dayLeft = perDay - spent;
  }

  const reserved = new Map<string, number>();
  const send: Doc<"seoDataPulls">[] = [];
  for (const row of rows) {
    if (perWebsite !== null && row.cycleId && row.websiteId) {
      const key = `${row.cycleId}:${row.websiteId}`;
      const spent = reserved.get(key) ?? await websiteSpend(ctx, row.cycleId, row.websiteId);
      if (spent + price > perWebsite + 1e-9) {
        await failRow(row, websiteLimitReason(row, perWebsite, spent, price));
        continue;
      }
      reserved.set(key, spent + price);
    }
    if (send.length > 0 && price > dayLeft + 1e-9) break;
    dayLeft -= price;
    send.push(row);
  }
  return { send, capped: null };
}

/** The most the day's ceiling may be set to. */
const MOST_A_DAY_USD = 10_000;

/** The day's ceiling as saved: a cleared box (0) removes it; anything else is held to the most it may be. */
export function clampDailyCeiling(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(value, MOST_A_DAY_USD) : undefined;
}

/** Add what a request cost to its website's spend in its collection, as it is booked. */
export async function tallyWebsiteSpend(ctx: MutationCtx, row: Doc<"seoDataPulls">, costUsd: number): Promise<void> {
  // Below nothing is a refund given back after the charge — a crawl's pages not crawled (finish-off-plan.md, item 5).
  if (costUsd === 0 || !row.cycleId || !row.websiteId) return;
  const cycleId = row.cycleId;
  const websiteId = row.websiteId;
  const existing = await ctx.db
    .query("seoCycleSpend")
    .withIndex("by_cycle_website", (q) => q.eq("cycleId", cycleId).eq("websiteId", websiteId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, { spentUsd: Math.max(0, existing.spentUsd + costUsd) });
  else if (costUsd > 0) await ctx.db.insert("seoCycleSpend", { cycleId, websiteId, spentUsd: costUsd });
}

/** Whether the day's ceiling is reached, and why — for the hourly check, before it starts a send that could not go. */
export async function dayCeilingReached(ctx: { db: QueryCtx["db"] }): Promise<string | null> {
  const collector = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "DATAFORSEO_COLLECTOR")).first();
  const perDay = positive(collector?.maxDailyCostUsd);
  if (perDay === null || !collector) return null;
  const spent = await spentToday(ctx, collector._id);
  return spent >= perDay ? dayCappedReason(perDay, spent) : null;
}

/**
 * What the Collector has spent since UK midnight: its runs started today. A
 * run is one continuous send, so there are a handful a day; one that started
 * before midnight counts to the day it started.
 */
async function spentToday(ctx: { db: QueryCtx["db"] }, agentId: Id<"agents">): Promise<number> {
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_agent_started", (q) => q.eq("agentId", agentId).gte("startedAt", ukDayStart(Date.now())))
    .take(RUNS_READ_FOR_TODAY);
  return runs.reduce((total, run) => total + (run.costUsd ?? 0), 0);
}

async function websiteSpend(ctx: MutationCtx, cycleId: Id<"seoCollectionCycles">, websiteId: Id<"websites">): Promise<number> {
  const row = await ctx.db
    .query("seoCycleSpend")
    .withIndex("by_cycle_website", (q) => q.eq("cycleId", cycleId).eq("websiteId", websiteId))
    .unique();
  return row?.spentUsd ?? 0;
}

/** What one request of a call is expected to cost: its average so far, or nothing for a call never priced. */
async function expectedPrice(ctx: MutationCtx, operationId: string): Promise<number> {
  const cost = await ctx.db.query("seoOperationCosts").withIndex("by_operation", (q) => q.eq("operationId", operationId)).unique();
  return cost && cost.charged > 0 && cost.totalUsd > 0 ? cost.totalUsd / cost.charged : 0;
}

function positive(value: number | undefined): number | null {
  return typeof value === "number" && value > 0 ? value : null;
}

const usd = (value: number) => `$${value.toFixed(2)}`;

function websiteLimitReason(row: Doc<"seoDataPulls">, limit: number, spent: number, price: number): string {
  const site = row.target ?? "This website";
  return `Not bought: ${site} has cost ${usd(spent)} in this collection, and this request (about ${usd(price)}) `
    + `would take it past the ${usd(limit)} limit for one website. Raise it on the Collector's Settings to collect it next time.`;
}

function dayCappedReason(limit: number, spent: number): string {
  return `today's ${usd(limit)} limit for all collecting is reached (${usd(spent)} spent). `
    + "The rest waits and goes after midnight, or as soon as the limit is raised on the Collector's Settings";
}
