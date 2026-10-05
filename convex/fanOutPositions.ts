import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { holdFirstCheck, holdSearch } from "./holdLists";
import { readPeriod } from "./searchConsolePeriodReads";
import { positionOf } from "./utils/searchConsolePacks";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";

/**
 * Where a company's website stands for a fan-out search, from what is already
 * held — nothing bought (docs/plans/active/fan-out-angles-plan.md, FA5): a
 * check of the search itself when the company tracks it or gave it its first
 * check (fan-out-opt-in-plan.md), else the ranked list, else Search Console's
 * own average once connected. Only the company's own searches are looked up
 * among the checks — another company's tracking of the same words is not
 * this one's to read.
 *
 * Its own module so the angles' rebuild (`fanOutAngles.ts`) and a question's
 * fan-out queries screen (`promptFanOut.ts`) read a position the same way.
 */

type Reader = { db: QueryCtx["db"] };

type Wording = Doc<"fanOutAngles">["wordings"][number];
export type Position = NonNullable<Doc<"fanOutAngles">["position"]>;

/** The order the sources are trusted in: our own check of the search, the ranked list, then Google's average. */
const SOURCE_ORDER: Record<Position["from"], number> = { CHECKED: 0, RANKED: 1, SEARCH_CONSOLE: 2 };

export type Lookups = {
  hold: Doc<"companyWebsites">;
  place: number;
  /** Search Console's newest day, when the site is connected and has figures. */
  consoleTo: string | null;
  /** Days of Search Console averaged for a position. */
  consoleDays: number;
  /** Google's average position for each search, from Search Console's ready-made list; empty when not connected. */
  consolePositions: Map<string, number>;
};

/** The ready-made keyword list each "Days of Search Console averaged" setting reads. */
const CONSOLE_PERIOD: Record<number, "7" | "14" | "28"> = { 7: "7", 14: "14", 28: "28" };

/**
 * Search Console's position for a search reads its ready-made list
 * (search-console-plan.md §14.3, item 4), once for the website: the list of
 * the days the setting names — 7, 14 or 28, each kept ready since the drift
 * fixes of 2026-10-03 (§15, decision 4), where 14 and 28 had read the 30
 * days. A website whose 14 or 28 days are not built yet reads its 30 days
 * until its next run.
 */
export async function positionLookups(ctx: Reader, hold: Doc<"companyWebsites">, consoleDays: number): Promise<Lookups> {
  const connection = await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id))
    .first();
  const consoleTo = connection?.status === "CONNECTED" && !connection.clearing && connection.newestDay ? connection.newestDay : null;
  const consolePositions = new Map<string, number>();
  if (consoleTo) {
    const own = CONSOLE_PERIOD[consoleDays];
    const list = (own ? await readPeriod(ctx, hold._id, "web", "query", own, "NOW") : null) ?? await readPeriod(ctx, hold._id, "web", "query", "30", "NOW");
    for (const row of list?.rows ?? []) {
      const position = positionOf(row);
      if (position !== null) consolePositions.set(row.key, position);
    }
  }
  return { hold, place: hold.locationCode ?? DEFAULT_LOCATION_CODE, consoleTo, consoleDays, consolePositions };
}

/**
 * Where the website came in the newest Google check of one of the company's
 * own searches — tracked, or given its first check — or null before one. A
 * check that did not find it in the top 100 is a value of null.
 */
export async function ownCheck(
  ctx: Reader,
  hold: Doc<"companyWebsites">,
  query: string,
): Promise<{ value: number | null; day: string } | null> {
  if (!(await holdSearch(ctx, hold._id, query)) && !(await holdFirstCheck(ctx, hold._id, query))) return null;
  const stats = await ctx.db
    .query("websiteSearchStats")
    .withIndex("by_key", (q) =>
      q.eq("websiteId", hold.websiteId).eq("keyword", query).eq("locationCode", hold.locationCode ?? DEFAULT_LOCATION_CODE))
    .unique();
  return stats ? { value: stats.lastPosition ?? null, day: stats.lastCheckedDay } : null;
}

/** Where one search stands, from the most trusted source that knows it. */
export async function wordingPosition(ctx: Reader, lookups: Lookups, wording: Pick<Wording, "query">): Promise<Position | null> {
  // The company's own search, checked on Google: exact, and dated.
  const checked = await ownCheck(ctx, lookups.hold, wording.query);
  if (checked) return { value: checked.value, from: "CHECKED", day: checked.day, query: wording.query };

  const ranked = await ctx.db
    .query("siteKeywordRanks")
    .withIndex("by_site_keyword", (q) =>
      q.eq("websiteId", lookups.hold.websiteId).eq("locationCode", lookups.place).eq("keyword", wording.query))
    .unique();
  if (ranked && ranked.status !== "LOST" && ranked.position !== undefined) {
    return { value: ranked.position, from: "RANKED", day: ranked.day, query: wording.query };
  }

  const consolePosition = lookups.consoleTo ? lookups.consolePositions.get(wording.query) : undefined;
  if (lookups.consoleTo && consolePosition !== undefined) {
    return { value: Math.round(consolePosition * 10) / 10, from: "SEARCH_CONSOLE", day: lookups.consoleTo, query: wording.query };
  }
  return null;
}

/**
 * An angle's position: the best place any wording holds, a found place
 * before a check that found nothing, and between equal places the more
 * trusted source.
 */
export async function bestPosition(ctx: Reader, lookups: Lookups, wordings: Wording[]): Promise<Position | null> {
  let best: Position | null = null;
  for (const wording of wordings) {
    const position = await wordingPosition(ctx, lookups, wording);
    if (!position) continue;
    if (!best) {
      best = position;
      continue;
    }
    if (position.value === null) continue;
    if (best.value === null || position.value < best.value
      || (position.value === best.value && SOURCE_ORDER[position.from] < SOURCE_ORDER[best.from])) {
      best = position;
    }
  }
  return best;
}
