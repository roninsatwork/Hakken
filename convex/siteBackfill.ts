import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { citedPageOf, fileKeywordRank, recountCitedPages } from "./siteRankings";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { linesOfWebsitePage } from "./positionHistory";
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

/** Searches' months replayed per mutation: a month is up to 31 points. */
const REPLAY_PAGE = 50;

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

/**
 * Replay one page of a site's rankings, each search's oldest first, into its
 * latest rows. Only what its keyword lists filed: a check of a search is one
 * company's tracking, and never goes on the website's list (`seoKeywordChecks.ts`).
 * A point keeps no volume; the latest row keeps the one it has.
 */
export const replayRankings = internalMutation({
  args: { websiteId: v.id("websites"), locationCode: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ filed: v.number(), cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const result = await linesOfWebsitePage(ctx, { websiteId: args.websiteId, locationCode: args.locationCode }, {
      cursor: args.cursor, numItems: REPLAY_PAGE,
    });
    let filed = 0;
    const host = (await ctx.db.get(args.websiteId))?.host ?? "";
    for (const line of result.page) {
      for (const point of line.points) {
        if (point.position === null || point.kind !== "LIST") continue;
        await fileKeywordRank(ctx, {
          websiteId: args.websiteId,
          locationCode: args.locationCode,
          keyword: line.keyword,
          day: point.day,
          position: point.position,
          ...(point.pagePosition !== null ? { pagePosition: point.pagePosition } : {}),
          ...(point.url ? { url: point.url } : {}),
          host,
        });
        filed += 1;
      }
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
