import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { syncListAiLines } from "./siteListAiDays";
import { aiLinesKey, dayFiguresKey } from "./siteRankings";
import { REBUILD_WAIT_MS } from "./siteSummaries";
import { stableStringify } from "./utils/lang";
import type { BandCounts } from "./utils/siteShapes";

/**
 * A site's day figures and its company lists' AI lines, copied from what was
 * filed into the day rows (`siteDaySummaries`, `siteListAiDays`): the part of
 * every site rebuild (`siteSummaries.rebuildSite`) that reads the website's
 * own figures and its questions' answers rather than its keywords — and, on
 * their own, the parts an AI answer and a site-wide figure change
 * (docs/plans/active/dataforseo-cost-plan.md, A2). Kept apart from
 * `siteSummaries.ts`, which reached the module ceiling (2026-10-05).
 */

/** Days of metrics and answers copied into the day summaries on an ordinary rebuild. */
const SYNC_DAYS = 14;

/** Metrics rows read for one window of days. */
const METRICS_PER_WINDOW = 2_000;

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The windows of days a rebuild copies the website's figures and answers
 * into, a month each: from `firstDay` on a backfill, else the last fortnight.
 */
export function syncWindows(
  site: { websiteId: Id<"websites">; locationCode: number },
  firstDay: string | null,
): Array<{ websiteId: Id<"websites">; locationCode: number; fromDay: string; toDay: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const windows: Array<{ websiteId: Id<"websites">; locationCode: number; fromDay: string; toDay: string }> = [];
  for (let from = firstDay ?? shiftDay(today, -SYNC_DAYS); from <= today; from = shiftDay(from, 31)) {
    windows.push({ websiteId: site.websiteId, locationCode: site.locationCode, fromDay: from, toDay: shiftDay(from, 30) });
  }
  return windows;
}

/**
 * Only the AI lines of the company lists about a website, from one place, for
 * the last fortnight: the part of a site rebuild an AI answer changes
 * (`requestAiLinesEverywhere`; dataforseo-cost-plan.md, A2). One at a time
 * per site and place, as the rebuilds take their turn.
 */
export const syncSiteAiLines = internalAction({
  args: { websiteId: v.id("websites"), locationCode: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const key = aiLinesKey(args.websiteId, args.locationCode);
    if (!(await ctx.runMutation(internal.siteSummaries.beginRebuild, { key }))) {
      await ctx.scheduler.runAfter(REBUILD_WAIT_MS, internal.siteDayFigures.syncSiteAiLines, args);
      return null;
    }
    let done = false;
    try {
      for (const window of syncWindows(args, null)) await syncListAiLines(ctx, window);
      done = true;
    } finally {
      await ctx.runMutation(internal.siteSummaries.endRebuild, { key, done });
    }
    return null;
  },
});

/**
 * Only a website's day figures, from one place, for the last fortnight: the
 * part of a site rebuild a site-wide figure changes, a backlinks summary
 * (`requestDayFiguresEverywhere`; dataforseo-cost-plan.md, A2). The request
 * is released as it runs, so a figure filed after it asks again.
 */
export const syncSiteDays = internalMutation({
  args: { websiteId: v.id("websites"), locationCode: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("siteSummaryRequests")
      .withIndex("by_key", (q) => q.eq("key", dayFiguresKey(args.websiteId, args.locationCode)))
      .unique();
    if (row) await ctx.db.patch(row._id, { pending: false, builtFrom: Date.now() });
    for (const window of syncWindows(args, null)) await syncDayFigures(ctx, window);
    return null;
  },
});

/** Copy the website's figures for one window of days into the day rows of one place (`siteSummaries.syncDays`). */
export async function syncDayFigures(
  ctx: MutationCtx,
  args: { websiteId: Id<"websites">; locationCode: number; fromDay: string; toDay: string },
): Promise<void> {
  const perDay = new Map<string, Partial<Doc<"siteDaySummaries">>>();
  const touch = (day: string) => {
    const held = perDay.get(day) ?? {};
    perDay.set(day, held);
    return held;
  };

  const metrics = await ctx.db
    .query("seoWebsiteMetrics")
    .withIndex("by_website_day", (q) =>
      q.eq("websiteId", args.websiteId).gte("day", args.fromDay).lte("day", args.toDay))
    .take(METRICS_PER_WINDOW);
  for (const row of metrics) {
    if (!isThisPlace(row, args.locationCode)) continue;
    const figures = JSON.parse(row.metricsJson) as Record<string, number | null | undefined>;
    const into = touch(row.day);
    const copy = (from: string, to: keyof Doc<"siteDaySummaries">) => {
      const value = figures[from];
      if (typeof value === "number") (into as Record<string, unknown>)[to] = value;
    };
    if (row.operationId === "domain_ranked_keywords") {
      if (typeof figures.rankedKeywords === "number") into.rankedKeywordsTotal = figures.rankedKeywords;
      if (typeof figures.estimatedTraffic === "number") into.estimatedTraffic = Math.round(figures.estimatedTraffic);
      if (typeof figures.trafficValue === "number") into.trafficValue = Math.round(figures.trafficValue);
      copy("keywordsNew", "keywordsNew");
      copy("keywordsUp", "keywordsUp");
      copy("keywordsDown", "keywordsDown");
      copy("keywordsLost", "keywordsLost");
      copy("featuredSnippets", "featuredSnippets");
      copy("localPacks", "localPacks");
      copy("aiOverviewRefs", "aiOverviewRefs");
      if (typeof figures.paidKeywords === "number") into.paidKeywords = figures.paidKeywords;
      if (typeof figures.paidTraffic === "number") into.paidTraffic = Math.round(figures.paidTraffic);
      if (typeof figures.paidTrafficCost === "number") into.paidTrafficCost = Math.round(figures.paidTrafficCost);
      const allBands = bandsFrom(figures);
      if (allBands) into.allBands = allBands;
    } else if (row.operationId === KEYWORD_LIST_OPERATION_ID) {
      // The full list asks for the site's results-page features, so its
      // counts of them are the ones to show.
      copy("featuredSnippets", "featuredSnippets");
      copy("localPacks", "localPacks");
      copy("aiOverviewRefs", "aiOverviewRefs");
    } else if (row.operationId === "backlinks_summary") {
      copy("backlinks", "backlinks");
      copy("referringDomains", "referringDomains");
      copy("referringMainDomains", "referringMainDomains");
      copy("rank", "domainRank");
      copy("brokenBacklinks", "brokenBacklinks");
      copy("spamScore", "spamScore");
      copy("brokenPages", "brokenPages");
    } else if (row.operationId === "bulk_backlinks" && into.backlinks === undefined) {
      copy("backlinks", "backlinks");
    } else if (row.operationId === "bulk_referring_domains" && into.referringDomains === undefined) {
      copy("referringDomains", "referringDomains");
    } else if (row.operationId === "bulk_ranks" && into.domainRank === undefined) {
      copy("rank", "domainRank");
    }
  }

  // Only a figure that changed is written: a day whose figures stand as they
  // are is left alone (dataforseo-cost-plan.md, A3).
  const now = Date.now();
  for (const [day, fields] of perDay) {
    const row = await ctx.db
      .query("siteDaySummaries")
      .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode).eq("day", day))
      .unique();
    if (!row) {
      await ctx.db.insert("siteDaySummaries", { websiteId: args.websiteId, locationCode: args.locationCode, day, ...fields, updatedAt: now });
      continue;
    }
    const changed = Object.entries(fields).filter(([key, value]) => stableStringify((row as Record<string, unknown>)[key]) !== stableStringify(value));
    if (changed.length > 0) await ctx.db.patch(row._id, { ...Object.fromEntries(changed), updatedAt: now });
  }
}

/** Whether a metrics row speaks for this place: a site-wide figure, or an older row, speaks for every place. */
export function isThisPlace(row: Doc<"seoWebsiteMetrics">, locationCode: number): boolean {
  return row.locationCode === undefined || row.locationCode === locationCode;
}

/**
 * DataForSEO's own position bands for everything a site ranks for, grouped
 * into ours, from a ranked-keywords metrics row — or null for a row filed
 * before the bands were read out (Phase 2).
 */
function bandsFrom(figures: Record<string, number | null | undefined>): BandCounts | null {
  if (typeof figures.bandTop3 !== "number") return null;
  const count = (key: string) => (typeof figures[key] === "number" ? figures[key] as number : 0);
  return {
    p01_03: count("bandTop3"),
    p04_10: count("band4to10"),
    p11_20: count("band11to20"),
    p21_50: count("band21to50"),
    p51_up: count("band51up"),
  };
}
