import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Reading what Keyword research has bought (docs/plans/active/keyword-
 * research-plan.md): the newest of each, and whether it is still fresh
 * enough to reuse rather than buy again.
 *
 * **Fresh** is within the reading company's "Days a lookup is kept" (a
 * limit, 30 days to start: Anthony, 2026-10-04), and bought the way the
 * agent buys now: sample figures from DataForSEO's sandbox never stand in for
 * real ones once the agent is Live, and real ones serve a Test lookup too.
 */

type Reader = { db: QueryCtx["db"] };

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The agent that buys lookups, found by its role, never its name. */
export async function researchAgent(ctx: Reader): Promise<Doc<"agents"> | null> {
  return await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "KEYWORD_RESEARCH")).first();
}

/** Whether the agent buys from the free sandbox: its Mode is Test until it is switched to Live. */
export function buysFromSandbox(agent: Pick<Doc<"agents">, "plannerMode"> | null): boolean {
  return agent?.plannerMode !== "LIVE";
}

/** What counts as fresh for a company: bought within its days, and not sample figures once the agent is Live. */
export type Freshness = { since: number; sandbox: boolean };

export function freshnessOf(reuseDays: number, sandbox: boolean, now = Date.now()): Freshness {
  return { since: now - reuseDays * DAY_MS, sandbox };
}

const usable = (row: { sandbox: boolean } | null, fresh: Freshness) => Boolean(row) && (fresh.sandbox || !row!.sandbox);

/** The newest overview of a keyword in a country, whatever its age. */
export async function newestKeyword(ctx: Reader, keyword: string, locationCode: number): Promise<Doc<"researchKeywords"> | null> {
  return await ctx.db
    .query("researchKeywords")
    .withIndex("by_keyword_place", (q) => q.eq("keyword", keyword).eq("locationCode", locationCode))
    .order("desc")
    .first();
}

export async function newestSerp(ctx: Reader, keyword: string, locationCode: number): Promise<Doc<"researchSerps"> | null> {
  return await ctx.db
    .query("researchSerps")
    .withIndex("by_keyword_place", (q) => q.eq("keyword", keyword).eq("locationCode", locationCode))
    .order("desc")
    .first();
}

/** Whether a keyword's overview needs buying for this company now. */
export async function overviewIsFresh(ctx: Reader, keyword: string, locationCode: number, fresh: Freshness): Promise<boolean> {
  const row = await newestKeyword(ctx, keyword, locationCode);
  return usable(row, fresh) && row!.boughtAt >= fresh.since;
}

export async function serpIsFresh(ctx: Reader, keyword: string, locationCode: number, fresh: Freshness): Promise<boolean> {
  const row = await newestSerp(ctx, keyword, locationCode);
  return usable(row, fresh) && row!.boughtAt >= fresh.since;
}
