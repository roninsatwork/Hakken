"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { REBUILD_WAIT_MS } from "./siteSummaries";
import { SITEMAP_PAGES_PER_WRITE, sitemapReadKey } from "./sitemaps";
import { sitemapFetcher } from "./utils/sitemapFetch";
import { readSitemap } from "./utils/sitemapReading";

/**
 * Read one website's sitemap now, and keep what it lists
 * (docs/plans/active/page-groups-plan.md). Asked for at the end of each
 * collection (`readCycleSitemaps`), and can be run on its own for one website
 * from the dashboard's function runner.
 *
 * Free: the sitemap is the website's own public file. The reading stops at
 * the largest `sitemapPagesRead` of the companies whose own website it is,
 * and says so. One reading of a website at a time, as the site rebuilds take
 * their turn. A reading that reached nothing at all — the website did not
 * answer — leaves the last reading in place rather than wiping it; one that
 * found no sitemap where the website did answer is kept, and Your pages says
 * so.
 */
type SitemapPage = { page: string; file: string; lastmod?: string };

/** Whether a new reading lists exactly the pages a held reading does, in the same order. */
async function listsHeldPages(ctx: ActionCtx, websiteId: Id<"websites">, heldReadAt: number, pages: readonly SitemapPage[]): Promise<boolean> {
  let at = 0;
  for (let cursor: string | null = null; ;) {
    const held: { rows: SitemapPage[]; cursor: string; isDone: boolean } =
      await ctx.runQuery(internal.sitemaps.heldSitemapPages, { websiteId, readAt: heldReadAt, cursor });
    for (const row of held.rows) {
      const page = pages[at];
      if (!page || page.page !== row.page || page.file !== row.file || (page.lastmod ?? null) !== (row.lastmod ?? null)) return false;
      at += 1;
    }
    if (held.isDone) return at === pages.length;
    cursor = held.cursor;
  }
}

export const readWebsiteSitemap = internalAction({
  args: { websiteId: v.id("websites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = sitemapReadKey(args.websiteId);
    if (!(await ctx.runMutation(internal.siteSummaries.beginRebuild, { key }))) {
      await ctx.scheduler.runAfter(REBUILD_WAIT_MS, internal.sitemapRead.readWebsiteSitemap, args);
      return null;
    }
    try {
      const target = await ctx.runQuery(internal.sitemaps.sitemapTarget, { websiteId: args.websiteId });
      if (!target) return null;
      const reading = await readSitemap({ host: target.host, limit: target.limit, fetchText: sitemapFetcher(target.host) });
      if (reading.problem === "UNREACHABLE" && target.readAt !== null) return null;

      const readAt = Date.now();
      const day = new Date(readAt).toISOString().slice(0, 10);
      // The same pages as the reading held — most days — are kept, not
      // written again and the old ones removed (dataforseo-cost-plan.md, A3).
      const kept = target.pagesReadAt !== null && await listsHeldPages(ctx, args.websiteId, target.pagesReadAt, reading.pages)
        ? target.pagesReadAt
        : null;
      if (kept === null) {
        for (let start = 0; start < reading.pages.length; start += SITEMAP_PAGES_PER_WRITE) {
          await ctx.runMutation(internal.sitemaps.writeSitemapPages, {
            websiteId: args.websiteId,
            readAt,
            day,
            rows: reading.pages.slice(start, start + SITEMAP_PAGES_PER_WRITE),
          });
        }
      }
      await ctx.runMutation(internal.sitemaps.switchSitemap, {
        websiteId: args.websiteId,
        readAt,
        day,
        source: reading.source,
        files: reading.files,
        pages: reading.pages.length,
        cut: reading.cut,
        ...(reading.problem ? { problem: reading.problem } : {}),
        ...(kept !== null ? { pagesReadAt: kept } : {}),
      });
      // Any other reading's pages go: the last one's, or one that died before it switched.
      while ((await ctx.runMutation(internal.sitemaps.dropOldSitemapPages, { websiteId: args.websiteId, keepReadAt: kept ?? readAt })) > 0) {
        // Each pass removes a batch of the last reading's pages; the next takes the rest.
      }
      // Every owner's Your pages, from the new reading.
      await ctx.runMutation(internal.holdPages.requestWebsiteRebuilds, { websiteId: args.websiteId });
    } finally {
      await ctx.runMutation(internal.siteSummaries.endRebuild, { key });
    }
    return null;
  },
});
