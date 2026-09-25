import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { citedPageOf, fileKeywordRank, recountCitedPages } from "./siteRankings";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";

/**
 * Fill the Sites tables from what is already stored.
 *
 * The tables fill themselves as results are filed (`siteRankings.ts`), so this
 * is for what was filed before they existed, and for a rebuild from scratch.
 * It reads the parser's own tables — every ranking and every AI citation ever
 * filed — and replays them oldest first, so each keyword's latest row ends up
 * with the right previous position. Nothing is bought.
 *
 *   npx convex run siteBackfill:backfillSites
 */

/** Rankings replayed per mutation. */
const REPLAY_PAGE = 500;

/** Citations read a step: each distinct page and question is a recount job, and a step schedules a thousand at most. */
const CITATION_PAGE = 500;

export const backfillSites = internalAction({
  args: {},
  returns: v.object({ sites: v.number(), rankings: v.number(), citedPages: v.number() }),
  handler: async (ctx): Promise<{ sites: number; rankings: number; citedPages: number }> => {
    const sites: Array<{ websiteId: Id<"websites">; locationCode: number }> =
      await ctx.runQuery(internal.siteBackfill.watchedSites, {});

    let rankings = 0;
    for (const site of sites) {
      let cursor: string | null = null;
      for (;;) {
        const result: { filed: number; cursor: string; isDone: boolean } = await ctx.runMutation(
          internal.siteBackfill.replayRankings,
          { websiteId: site.websiteId, locationCode: site.locationCode, cursor },
        );
        rankings += result.filed;
        if (result.isDone) break;
        cursor = result.cursor;
      }
      await ctx.runAction(internal.siteSummaries.rebuildSite, {
        websiteId: site.websiteId,
        locationCode: site.locationCode,
        fullSync: true,
      });
    }

    let citedPages = 0;
    let cursor: string | null = null;
    for (;;) {
      const result: { recounted: number; cursor: string; isDone: boolean } = await ctx.runMutation(
        internal.siteBackfill.recountCitations,
        { cursor },
      );
      citedPages += result.recounted;
      if (result.isDone) break;
      cursor = result.cursor;
    }

    return { sites: sites.length, rankings, citedPages };
  },
});

/** Every website someone watches, with the place it is read from. */
export const watchedSites = internalQuery({
  args: {},
  returns: v.array(v.object({ websiteId: v.id("websites"), locationCode: v.number() })),
  handler: async (ctx) => {
    const holds = await ctx.db.query("companyWebsites").take(5_000);
    const seen = new Map<string, { websiteId: Id<"websites">; locationCode: number }>();
    for (const hold of holds) {
      const pair = isTrackedHold(hold) ? await pairedOwnedHold(ctx, hold) : null;
      const locationCode = (pair ?? hold).locationCode ?? DEFAULT_LOCATION_CODE;
      seen.set(`${hold.websiteId}:${locationCode}`, { websiteId: hold.websiteId, locationCode });
    }
    return [...seen.values()];
  },
});

/** Replay one page of a site's rankings, oldest first, into its latest rows. */
export const replayRankings = internalMutation({
  args: { websiteId: v.id("websites"), locationCode: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ filed: v.number(), cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_website_place_day", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode))
      .paginate({ cursor: args.cursor, numItems: REPLAY_PAGE });
    let filed = 0;
    for (const row of result.page) {
      if (row.position === undefined) continue;
      await fileKeywordRank(ctx, {
        websiteId: row.websiteId,
        locationCode: args.locationCode,
        keyword: row.keyword,
        day: row.day,
        position: row.position,
        ...(row.url ? { url: row.url } : {}),
        ...(row.searchVolume !== undefined ? { volume: row.searchVolume } : {}),
      });
      filed += 1;
    }
    return { filed, cursor: result.continueCursor, isDone: result.isDone };
  },
});

/** Recount the pages cited in one page of AI citations. */
export const recountCitations = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ recounted: v.number(), cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("aiCitations").paginate({ cursor: args.cursor, numItems: CITATION_PAGE });
    const cited = result.page.flatMap((row) => citedPageOf(row) ?? []);
    await recountCitedPages(ctx, cited);
    return { recounted: new Set(cited.map((row) => `${row.websiteId} ${row.url}`)).size, cursor: result.continueCursor, isDone: result.isDone };
  },
});
