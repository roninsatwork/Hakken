import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Reading what Keyword research has bought (docs/plans/active/keyword-
 * research-plan.md): the newest of each, and whether it is still fresh
 * enough to reuse rather than buy again.
 *
 * **Fresh** is within the reading company's "Days a lookup is kept" (a
 * limit, 30 days to start: Anthony, 2026-10-04), and real: sample figures
 * from DataForSEO's sandbox never stand in for real ones. The Keyword
 * research agent always buys real figures — it has no Test mode (Anthony,
 * 2026-10-04: "who asked for test mode"); only the platform's own switch,
 * `DATAFORSEO_SANDBOX=1`, points every DataForSEO call at the sandbox.
 */

type Reader = { db: QueryCtx["db"] };

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The agent that buys lookups, found by its role, never its name. */
export async function researchAgent(ctx: Reader): Promise<Doc<"agents"> | null> {
  return await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "KEYWORD_RESEARCH")).first();
}

/** Whether the whole platform asks DataForSEO's free sandbox (`DATAFORSEO_SANDBOX=1`, as `readDataForSeoCredentials` reads it). */
export function platformSandbox(): boolean {
  return process.env.DATAFORSEO_SANDBOX === "1";
}

/** What counts as fresh for a company: bought within its days, and not sample figures unless the platform itself is on the sandbox. */
export type Freshness = { since: number; sandbox: boolean };

export function freshnessOf(reuseDays: number, now = Date.now()): Freshness {
  return { since: now - reuseDays * DAY_MS, sandbox: platformSandbox() };
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
