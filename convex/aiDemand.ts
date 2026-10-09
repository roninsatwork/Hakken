import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { PlannedCheck } from "./fanOutFirstCheckSteps";
import { holdSearches } from "./holdLists";
import { readFanOutLimits } from "./fanOutLimits";
import { partIsOn } from "./collectionParts";
import { normaliseKeyword } from "./seoJudgments";
import type { PullForParse } from "./seoCollectionParse";
import { SEARCHES_PER_AI_DEMAND_REQUEST } from "./dataForSeoAiDemandOperations";
import { SEO_KEYWORD_CHECKS_PER_WEBSITE } from "./seoCollectionPolicy";
import { isTrackedHold } from "./utils/websitePairing";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { getErrorMessage } from "./utils/lang";
import { packColumn } from "./utils/packedColumns";

/**
 * AI demand (docs/plans/active/discovery-local-reputation-ai-plan.md, step 3):
 * how often a website's searches are asked of AI tools a month — its tracked
 * searches and its biggest keywords — bought monthly while the company has
 * "AI demand" on (D16), once per search and place for everyone
 * (`aiSearchVolumes`), and written only when the figures moved (rule 11).
 */

/** The website's biggest keywords measured beside its tracked searches (said to Anthony, 2026-10-09). */
export const AI_DEMAND_KEYWORDS = 100;
/** A figure is bought again after this long: it is a monthly figure. */
const MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

type Reader = { db: QueryCtx["db"] };

/** Where each measured search comes from: the website's tracked searches (by hand or from the AI's searches), or its keywords. */
export type DemandFrom = "SEARCH" | "FAN_OUT" | "KEYWORD";

/** The searches AI demand measures for a website, and where each came from: its tracked searches first, then its biggest keywords. */
export async function demandSearches(ctx: Reader, hold: Doc<"companyWebsites">): Promise<Array<{ keyword: string; from: DemandFrom }>> {
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  const tracked = await holdSearches(ctx, hold._id, Math.min(SEO_KEYWORD_CHECKS_PER_WEBSITE, limits.trackedPerSite), { activeOnly: true });
  const searches = new Map<string, DemandFrom>();
  for (const search of tracked) searches.set(normaliseKeyword(search.keyword), search.addedFrom === "AI_SEARCH" ? "FAN_OUT" : "SEARCH");
  const biggest = await ctx.db
    .query("siteKeywordRanks")
    .withIndex("by_site_volume", (q) => q.eq("websiteId", hold.websiteId).eq("locationCode", locationCode))
    .order("desc")
    .take(AI_DEMAND_KEYWORDS);
  for (const rank of biggest) if (!searches.has(rank.keyword)) searches.set(rank.keyword, "KEYWORD");
  return [...searches.entries()].map(([keyword, from]) => ({ keyword, from }));
}

export async function aiVolumeOf(ctx: Reader, keyword: string, locationCode: number): Promise<Doc<"aiSearchVolumes"> | null> {
  return await ctx.db.query("aiSearchVolumes").withIndex("by_keyword_place", (q) => q.eq("keyword", keyword).eq("locationCode", locationCode)).unique();
}

/** The website's searches whose figure is a month old or never bought, a request a thousand. */
export async function aiDemandSteps(
  ctx: MutationCtx,
  cycle: Pick<Doc<"seoCollectionCycles">, "companyId" | "startedAt">,
  hold: Doc<"companyWebsites">,
  plan: (params: Record<string, unknown>, sendIndex: number) => Promise<PlannedCheck>,
) {
  if (isTrackedHold(hold) || !(await partIsOn(ctx, cycle.companyId, "aiDemand"))) return [];
  const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  const stale = cycle.startedAt - MAX_AGE_DAYS * DAY_MS;
  const due: string[] = [];
  for (const { keyword } of await demandSearches(ctx, hold)) {
    const held = await aiVolumeOf(ctx, keyword, locationCode);
    if (!held || held.updatedAt < stale) due.push(keyword);
  }
  const batches: string[][] = [];
  for (let at = 0; at < due.length; at += SEARCHES_PER_AI_DEMAND_REQUEST) batches.push(due.slice(at, at + SEARCHES_PER_AI_DEMAND_REQUEST).sort());
  return batches.map((keywords) => async (sendIndex: number, room: number) => {
    if (room < 1) return { planned: 0, reused: 0, capped: true };
    const outcome = await plan({ keywords, location_code: locationCode, language_code: "en" }, sendIndex);
    return outcome.reused ? { planned: 0, reused: 1 } : { planned: 1, reused: 0 };
  });
}

const demandRow = v.object({ keyword: v.string(), volume: v.union(v.number(), v.null()), months: v.array(v.number()), month: v.union(v.string(), v.null()) });
type DemandRow = typeof demandRow.type;

const numberOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** One answer: each search's AI asks a month, and its last twelve months oldest first. */
export function parseAiDemand(result: unknown): DemandRow[] {
  const first = Array.isArray(result) ? result[0] : result;
  const items = first && typeof first === "object" && Array.isArray((first as Record<string, unknown>).items) ? (first as { items: unknown[] }).items : [];
  return items.flatMap((item): DemandRow[] => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const keyword = typeof record?.keyword === "string" ? normaliseKeyword(record.keyword) : "";
    if (!record || !keyword) return [];
    const months = (Array.isArray(record.ai_monthly_searches) ? record.ai_monthly_searches : [])
      .flatMap((month) => {
        const entry = month && typeof month === "object" ? (month as Record<string, unknown>) : null;
        const year = numberOrNull(entry?.year);
        const number = numberOrNull(entry?.month);
        return year !== null && number !== null ? [{ order: year * 12 + number, label: `${year}-${String(number).padStart(2, "0")}`, volume: numberOrNull(entry?.ai_search_volume) ?? 0 }] : [];
      })
      .sort((left, right) => left.order - right.order)
      .slice(-12);
    return [{ keyword, volume: numberOrNull(record.ai_search_volume), months: months.map((month) => month.volume), month: months.at(-1)?.label ?? null }];
  });
}

/** Keep each search's figures, rewriting a row only when they moved (rule 11); its age is refreshed either way. */
export const writeAiDemand = internalMutation({
  args: { locationCode: v.number(), rows: v.array(demandRow) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.rows) {
      const held = await aiVolumeOf(ctx, row.keyword, args.locationCode);
      const figures = { keyword: row.keyword, locationCode: args.locationCode, volume: row.volume, months: packColumn(row.months), month: row.month, updatedAt: now };
      if (!held) await ctx.db.insert("aiSearchVolumes", figures);
      else if (held.volume !== figures.volume || held.month !== figures.month || JSON.stringify(held.months) !== JSON.stringify(figures.months)) await ctx.db.replace(held._id, figures);
      // A month's figure unchanged is still a figure checked: its age moves on, or it is bought again tomorrow.
      else if (now - held.updatedAt > DAY_MS) await ctx.db.patch(held._id, { updatedAt: now });
    }
    return null;
  },
});

/** File an AI demand purchase (`seoCollectionParse.ts` hands it here). Failures are recorded on the pull. */
export async function fileAiDemandPull(ctx: ActionCtx, pullId: Id<"seoDataPulls">, pull: Pick<PullForParse, "resultJson" | "taskArgsJson">): Promise<null> {
  try {
    const sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
    const locationCode = typeof sent.location_code === "number" ? sent.location_code : DEFAULT_LOCATION_CODE;
    await ctx.runMutation(internal.aiDemand.writeAiDemand, { locationCode, rows: parseAiDemand(JSON.parse(pull.resultJson ?? "[]")) });
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}
