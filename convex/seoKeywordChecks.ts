import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Filing one checked search against every site it answers for.
 *
 * A keyword check is a Google results page for one search from one place,
 * bought once for everyone who tracks that search there. So it is not filed
 * against the website that asked, the way a site operation is. It is filed
 * against **every known site on the page**, at its position, and against every
 * host that tracks the search but was not on the page, as checked and not
 * found.
 *
 * Those two facts are different and both are kept. "Not in the results" is
 * what makes a verdict like *never ranked* possible; a search that was never
 * checked has no row at all. Charting the missing week at position 100 would
 * be inventing a ranking nobody had.
 *
 * Its own module because it is its own kind of write: `seoCollectionParse.ts`
 * files what came back about one website, and this files what came back about
 * a search.
 */

/**
 * Rows one check writes: the sites on the page plus the hosts tracking it.
 * A results page is at most a hundred organic rows, so this is the assertion
 * rather than the working limit.
 */
const MAX_ROWS_PER_CHECK = 400;

/** Hosts tracking one phrase that a single check will answer for. */
const MAX_TRACKERS = 300;

/**
 * Rows for one site, one search and one day, across every place it is watched
 * from. Several places are normal; more than this means something upstream is
 * writing duplicates.
 */
const SAME_DAY_LIMIT = 25;

/** Absent reads as the registry default: every row from before places were passed. */
export function positionPlace(row: { locationCode?: number }): number {
  return row.locationCode ?? DEFAULT_LOCATION_CODE;
}

/**
 * Remove an earlier row for the same site, search, day and place.
 *
 * The same search measured twice on one day from one place is one fact, so
 * the later measurement replaces the earlier. From another place it is a
 * different fact and is left alone — which is why this filters by place
 * rather than clearing the day.
 */
export async function replaceSameDayPosition(
  ctx: MutationCtx,
  key: { websiteId: Id<"websites">; keyword: string; day: string; locationCode?: number },
): Promise<void> {
  const place = positionPlace(key);
  const sameDay = await ctx.db
    .query("seoKeywordPositions")
    .withIndex("by_website_keyword_day", (q) =>
      q.eq("websiteId", key.websiteId).eq("keyword", key.keyword).eq("day", key.day))
    .take(SAME_DAY_LIMIT);
  for (const row of sameDay) {
    if (positionPlace(row) === place) await ctx.db.delete(row._id);
  }
}

export const writeKeywordCheck = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    /** Normalised, as the host lists store it. */
    keyword: v.string(),
    locationCode: v.optional(v.number()),
    day: v.string(),
    found: v.array(v.object({
      websiteId: v.id("websites"),
      position: v.number(),
      url: v.optional(v.string()),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    // A re-parse replaces what the last parse of this pull wrote, so a
    // corrected parser can be run over stored pages without anyone auditing
    // the result afterwards.
    const prior = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(MAX_ROWS_PER_CHECK);
    for (const row of prior) await ctx.db.delete(row._id);
    await ctx.db.patch(args.pullId, { error: undefined });

    const rows = new Map<Id<"websites">, { position?: number; url?: string }>();
    for (const entry of args.found) {
      const held = rows.get(entry.websiteId);
      // Two domains can be one website — a bare host and its www form — so
      // the better of their places is the site's.
      if (held?.position !== undefined && held.position <= entry.position) continue;
      rows.set(entry.websiteId, { position: entry.position, ...(entry.url ? { url: entry.url } : {}) });
    }

    const trackers = await ctx.db
      .query("websiteKeywords")
      .withIndex("by_keyword", (q) => q.eq("keyword", args.keyword))
      .take(MAX_TRACKERS);
    for (const tracker of trackers) {
      if (tracker.isActive && !rows.has(tracker.websiteId)) rows.set(tracker.websiteId, {});
    }

    for (const [websiteId, entry] of [...rows.entries()].slice(0, MAX_ROWS_PER_CHECK)) {
      await replaceSameDayPosition(ctx, {
        websiteId,
        keyword: args.keyword,
        day: args.day,
        ...(args.locationCode !== undefined ? { locationCode: args.locationCode } : {}),
      });
      await ctx.db.insert("seoKeywordPositions", {
        websiteId,
        keyword: args.keyword,
        day: args.day,
        ...(entry.position !== undefined ? { position: entry.position } : {}),
        ...(entry.url ? { url: entry.url } : {}),
        // Always written, so a watcher's view can be read through the place
        // index. Unset means the registry default was sent.
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        pullId: args.pullId,
        createdAt: now,
      });
    }
    return null;
  },
});
