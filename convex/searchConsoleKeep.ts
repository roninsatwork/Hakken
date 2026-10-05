import { v } from "convex/values";

import { internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import type { Row } from "./utils/searchConsolePacks";

/**
 * Which searches a website keeps line by line (docs/plans/active/
 * finish-off-plan.md, store less round two, D — agreed 2026-10-05: "we need
 * Almost there and Pages competing; Missed demand we don't need"): a search
 * is kept if it got a click, the company tracks it, it ranks in the top 20,
 * or two or more of the website's pages were shown for it. The rest — shown
 * below the top 20, on one page, never clicked — are dropped as they are
 * collected: about one line in nine of morehandles.co.uk's.
 *
 * Judged on the last 90 days already kept (the ready-made 90 days' searches)
 * and on each day as it comes in, newest first, so a search that qualifies on
 * a later day keeps its earlier lines in the same collection. The website's
 * and each page's own totals are Google's, so stay exact.
 */

/** A search ranking at this position or better is kept: all of Almost there (4 to 20). */
export const KEEP_POSITION = 20;
/** A search shown with this many of the website's pages is kept: all of Pages competing. */
export const KEEP_PAGES = 2;

/** Whether a search's figures keep it. */
export function keepsSearch(figures: { clicks: number; impressions: number; positionSum: number; pages: number }): boolean {
  const position = figures.impressions > 0 ? figures.positionSum / figures.impressions : Infinity;
  return figures.clicks > 0 || position <= KEEP_POSITION || figures.pages >= KEEP_PAGES;
}

/** Tracked searches read for the keep rule. */
const TRACKED_READ = 500;

/** One part of a kind of result's 90 days of searches, for all countries or one: the searches it keeps. */
export const keptSearchesPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), country: v.optional(v.string()), searchType: searchTypeValidator, cursor: v.union(v.string(), v.null()) },
  returns: v.object({ keys: v.array(v.string()), held: v.boolean(), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q
        .eq("companyWebsiteId", args.holdId).eq("country", args.country).eq("searchType", args.searchType).eq("list", "query").eq("period", "90").eq("which", "NOW"))
      .paginate({ cursor: args.cursor, numItems: 1 });
    const part = page.page[0];
    const keys = part
      ? part.keys.filter((_, index) => keepsSearch({
        clicks: part.clicks[index],
        impressions: part.impressions[index],
        positionSum: part.positionSums[index],
        pages: part.counts?.[index] ?? 1,
      }))
      : [];
    return { keys, held: part !== undefined, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** The searches the company tracks on the website, kept whatever their figures. */
export const trackedSearches = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => (await ctx.db
    .query("searchConsoleTracked")
    .withIndex("by_hold_kind_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", "query"))
    .take(TRACKED_READ)).map((row) => row.key),
});

/**
 * The searches a kind of result keeps for all countries or one, from its 90
 * days kept and what the company tracks — and whether those 90 days are
 * built at all: before they are, nothing is judged on them (collecting judges
 * each day; the tidy leaves the website alone).
 */
export async function keptSearchesOf(
  ctx: ActionCtx,
  holdId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
): Promise<Set<string> & { judged?: boolean }> {
  const keep: Set<string> & { judged?: boolean } = new Set<string>(await ctx.runQuery(internal.searchConsoleKeep.trackedSearches, { holdId }));
  keep.judged = false;
  for (let cursor: string | null = null; ;) {
    const part: { keys: string[]; held: boolean; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.searchConsoleKeep.keptSearchesPart, {
      holdId, ...(country === undefined ? {} : { country }), searchType, cursor,
    });
    if (part.held) keep.judged = true;
    for (const key of part.keys) keep.add(key);
    if (part.isDone) return keep;
    cursor = part.continueCursor;
  }
}

/**
 * One day's search-and-page lines, the searches kept: each search judged on
 * the day's own figures too, and added to `keep` when it qualifies, so the
 * older days collected after it keep its lines.
 */
export function keptLines(rows: readonly Row[], keep: Set<string>): Row[] {
  const day = new Map<string, { clicks: number; impressions: number; positionSum: number; pages: number }>();
  for (const row of rows) {
    const figures = day.get(row.key) ?? { clicks: 0, impressions: 0, positionSum: 0, pages: 0 };
    figures.clicks += row.clicks;
    figures.impressions += row.impressions;
    figures.positionSum += row.positionSum;
    figures.pages += 1;
    day.set(row.key, figures);
  }
  for (const [key, figures] of day) if (keepsSearch(figures)) keep.add(key);
  return rows.filter((row) => keep.has(row.key));
}
