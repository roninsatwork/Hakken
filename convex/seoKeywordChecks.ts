import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { recomputeSearchStats } from "./websiteTrackingStats";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { fileSerpPage, serpSnapshotValidator } from "./siteSerp";
import { runDayOf } from "./seoRunDay";
import { pointAt, setPoint } from "./positionHistory";

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
 * A fan-out query's first check (docs/plans/active/fan-out-opt-in-plan.md)
 * counts as a host that asked: it is not tracked, but its website gets the
 * "checked, not found" row too, and the record of the check is marked done.
 * Without it the check would find nothing to say and be bought again.
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
      pagePosition: v.optional(v.number()),
      url: v.optional(v.string()),
    })),
    /** The page itself, for the Sites screens (`siteSerp.ts`). */
    serp: v.optional(serpSnapshotValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.serp) {
      await fileSerpPage(ctx, {
        pullId: args.pullId, keyword: args.keyword, locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        day: args.day, snapshot: args.serp,
      });
    }

    // A re-parse files each site's point again, replacing the day's, so a
    // corrected parser can be run over stored pages. Which purchase filed a
    // point is not kept (keep-less-history-plan.md, Decision 10): a site the
    // corrected parse no longer finds keeps the earlier point.
    await ctx.db.patch(args.pullId, { error: undefined });

    const rows = new Map<Id<"websites">, { position?: number; pagePosition?: number; url?: string }>();
    for (const entry of args.found) {
      const held = rows.get(entry.websiteId);
      // Two domains can be one website — a bare host and its www form — so
      // the better of their places is the site's.
      if (held?.position !== undefined && held.position <= entry.position) continue;
      rows.set(entry.websiteId, {
        position: entry.position,
        ...(entry.pagePosition !== undefined ? { pagePosition: entry.pagePosition } : {}),
        ...(entry.url ? { url: entry.url } : {}),
      });
    }

    // Every website any company tracks this for, once each: a site missing
    // from the page gets a row saying it was checked and not found. Read
    // across companies because the rows are facts about the website; each
    // company reads them only for the searches on its own list.
    const trackers = await ctx.db
      .query("websiteKeywords")
      .withIndex("by_keyword", (q) => q.eq("keyword", args.keyword))
      .take(MAX_TRACKERS);
    for (const tracker of trackers) {
      if (tracker.isActive && !rows.has(tracker.websiteId)) rows.set(tracker.websiteId, {});
    }
    // And every website this check is a fan-out query's first check for.
    const firsts = await ctx.db
      .query("fanOutFirstChecks")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(MAX_TRACKERS);
    for (const first of firsts) {
      if (!rows.has(first.websiteId)) rows.set(first.websiteId, {});
    }

    for (const [websiteId, entry] of [...rows.entries()].slice(0, MAX_ROWS_PER_CHECK)) {
      // Its point on the search's line from this place (keep-less-history-plan.md,
      // part 1), replacing the day's. Unset place means the registry default was sent.
      await setPoint(ctx, {
        websiteId, keyword: args.keyword, locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE, day: args.day,
      }, { ...entry, kind: "CHECK" });
      await recomputeSearchStats(ctx, {
        websiteId,
        keyword: args.keyword,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
      });
      // Nothing goes into a website's keyword list from here: a tracked search
      // is one company's own, and a row on the list of every site on the page
      // would show it to every company watching them. All keywords is what
      // DataForSEO says a site ranks for; a tracked search's positions are
      // read through the list that tracks it
      // (docs/plans/active/private-tracking-lists-plan.md, V5).
    }
    for (const first of firsts) await ctx.db.patch(first._id, { checkedDay: args.day });
    return null;
  },
});

/**
 * A first check that reused a Google check filed before its website asked —
 * another company's, the same day, from the same place. The website gets the
 * "checked, not found" row the filing would have given it, when the page did
 * not have it, and the check is marked done. A later re-filing of the check
 * writes the same row again, since the record now names it.
 */
export async function fileFirstCheckLate(
  ctx: MutationCtx,
  first: Doc<"fanOutFirstChecks">,
  pull: Doc<"seoDataPulls">,
): Promise<void> {
  const day = await runDayOf(ctx, pull);
  const point = { websiteId: first.websiteId, keyword: first.query, locationCode: first.locationCode, day };
  if (!(await pointAt(ctx, point))) {
    await setPoint(ctx, point, { kind: "CHECK" });
    await recomputeSearchStats(ctx, { websiteId: first.websiteId, keyword: first.query, locationCode: first.locationCode });
  }
  await ctx.db.patch(first._id, { checkedDay: day });
}
