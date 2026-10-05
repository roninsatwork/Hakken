import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readFanOutLimits } from "./fanOutLimits";
import { claimSchedule } from "./siteRankings";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * A website's sitemap, kept (docs/plans/active/page-groups-plan.md): the
 * newest reading (`siteSitemaps`) and the pages it listed
 * (`siteSitemapPages`), by website — a sitemap is public, so one reading
 * serves every company whose own website it is, like the crawl.
 *
 * Read at each collection: when a company's collection finishes, each of its
 * own websites is read (`readCycleSitemaps`), once however many companies'
 * collections end that day (`SITEMAP_FRESH_MS`). The reading itself is a Node
 * action (`sitemapRead.ts`); this keeps what it found and asks for every
 * owner's Your pages to be rebuilt.
 *
 * **Written beside, switched in one step.** A new reading's pages go in under
 * its own stamp, the website's reading is pointed at that stamp in one
 * mutation, and only then are the last reading's pages removed — so the
 * rebuild never reads half of one and half of the other.
 */

/** Sitemap pages written per mutation. */
export const SITEMAP_PAGES_PER_WRITE = 500;

/** An older reading's pages removed per mutation. */
const SITEMAP_PAGES_CLEARED = 500;

/** A website's holds read to find its owners: more companies than this holding one website is not a real case. */
const OWNERS_READ = 200;

/**
 * A website read this recently is not read again by another collection: two
 * companies whose own website it is, collecting the same day, read it once.
 * An on-demand reading (`readWebsiteSitemap`) always reads.
 */
export const SITEMAP_FRESH_MS = 6 * 60 * 60 * 1000;

/** The key a website's reading is asked for and takes its turn under. */
export const sitemapReadKey = (websiteId: Id<"websites">) => `sitemap:${websiteId}`;

type Reader = { db: QueryCtx["db"] };

/** The companies whose own website this is: its owned holds, never a competitor's. */
export async function ownedHoldsOf(ctx: Reader, websiteId: Id<"websites">): Promise<Doc<"companyWebsites">[]> {
  const holds = await ctx.db
    .query("companyWebsites")
    .withIndex("by_website", (q) => q.eq("websiteId", websiteId))
    .take(OWNERS_READ);
  return holds.filter((hold) => !isTrackedHold(hold));
}

/** A website's newest sitemap reading, or null before the first. */
export async function sitemapReadingOf(ctx: Reader, websiteId: Id<"websites">): Promise<Doc<"siteSitemaps"> | null> {
  return await ctx.db.query("siteSitemaps").withIndex("by_website", (q) => q.eq("websiteId", websiteId)).first();
}

/** The stamp a reading's pages carry: its own, or the reading before's when it found the same pages and kept them. */
export function pagesStampOf(reading: Pick<Doc<"siteSitemaps">, "readAt" | "pagesReadAt">): number {
  return reading.pagesReadAt ?? reading.readAt;
}

/**
 * What a reading needs: the website's host, and how many pages to read — the
 * largest `sitemapPagesRead` of the companies whose own website it is, since
 * the reading is shared; each company's Your pages holds to its own
 * (`holdPages.ts`) — and when it was last read, if it was. Null when nobody
 * owns it any more, or it is gone.
 */
export const sitemapTarget = internalQuery({
  args: { websiteId: v.id("websites") },
  returns: v.union(v.null(), v.object({
    host: v.string(),
    limit: v.number(),
    readAt: v.union(v.number(), v.null()),
    /** The stamp the held reading's pages carry (`pagesStampOf`), or null before the first. */
    pagesReadAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.websiteId);
    if (!website) return null;
    const owners = await ownedHoldsOf(ctx, args.websiteId);
    if (owners.length === 0) return null;
    let limit = 0;
    for (const hold of owners) limit = Math.max(limit, (await readFanOutLimits(ctx, hold.companyId, hold._id)).sitemapPagesRead);
    const reading = await sitemapReadingOf(ctx, args.websiteId);
    return { host: website.host, limit, readAt: reading?.readAt ?? null, pagesReadAt: reading ? pagesStampOf(reading) : null };
  },
});

/** Ask for a website's sitemap to be read, once, unless it was read in the last `SITEMAP_FRESH_MS`. */
export async function requestSitemapRead(ctx: MutationCtx, websiteId: Id<"websites">): Promise<boolean> {
  const reading = await sitemapReadingOf(ctx, websiteId);
  if (reading && Date.now() - reading.readAt < SITEMAP_FRESH_MS) return false;
  if (!(await claimSchedule(ctx, sitemapReadKey(websiteId)))) return false;
  await ctx.scheduler.runAfter(0, internal.sitemapRead.readWebsiteSitemap, { websiteId });
  return true;
}

/**
 * A company's collection has finished (`finishSeoCycle`): read the sitemap of
 * each of its own websites still being collected. A competitor's sitemap is
 * not read — Your pages is for a company's own websites.
 */
export const readCycleSitemaps = internalMutation({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", cycle.companyId))
      .take(OWNERS_READ);
    const websites = new Set<Id<"websites">>();
    for (const hold of holds) {
      if (isTrackedHold(hold) || hold.collectionEnabled === false) continue;
      websites.add(hold.websiteId);
    }
    for (const websiteId of websites) await requestSitemapRead(ctx, websiteId);
    return null;
  },
});

const pageRow = v.object({ page: v.string(), file: v.string(), lastmod: v.optional(v.string()) });

/** A held reading's pages read per batch when a new reading is compared with it: small rows. */
const SITEMAP_PAGES_READ = 2_000;

/** One batch of the pages a held reading lists, in the order read: to find whether a new reading lists the same. */
export const heldSitemapPages = internalQuery({
  args: { websiteId: v.id("websites"), readAt: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ rows: v.array(pageRow), cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("siteSitemapPages")
      .withIndex("by_website_read", (q) => q.eq("websiteId", args.websiteId).eq("readAt", args.readAt))
      .paginate({ cursor: args.cursor, numItems: SITEMAP_PAGES_READ });
    return {
      rows: result.page.map((row) => ({ page: row.page, file: row.file, ...(row.lastmod !== undefined ? { lastmod: row.lastmod } : {}) })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** One batch of a new reading's pages, under its stamp, beside the reading before. */
export const writeSitemapPages = internalMutation({
  args: { websiteId: v.id("websites"), readAt: v.number(), day: v.string(), rows: v.array(pageRow) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("siteSitemapPages", { websiteId: args.websiteId, readAt: args.readAt, day: args.day, ...row });
    }
    return null;
  },
});

/** Point the website at its new reading, in one step. */
export const switchSitemap = internalMutation({
  args: {
    websiteId: v.id("websites"),
    readAt: v.number(),
    day: v.string(),
    source: v.union(v.literal("ROBOTS"), v.literal("USUAL_ADDRESS"), v.literal("NONE")),
    files: v.array(v.object({ url: v.string(), pages: v.number(), problem: v.optional(v.string()) })),
    pages: v.number(),
    cut: v.boolean(),
    problem: v.optional(v.string()),
    /** The stamp of the pages it kept, when it found the reading before's again (`pagesStampOf`). */
    pagesReadAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("siteSitemaps").withIndex("by_website", (q) => q.eq("websiteId", args.websiteId)).take(5);
    const fields = {
      websiteId: args.websiteId,
      source: args.source,
      files: args.files,
      pages: args.pages,
      cut: args.cut,
      ...(args.problem ? { problem: args.problem } : {}),
      day: args.day,
      readAt: args.readAt,
      ...(args.pagesReadAt !== undefined ? { pagesReadAt: args.pagesReadAt } : {}),
    };
    if (existing[0]) await ctx.db.replace(existing[0]._id, fields);
    else await ctx.db.insert("siteSitemaps", fields);
    for (const extra of existing.slice(1)) await ctx.db.delete(extra._id);
    return null;
  },
});

/**
 * A batch of the pages of any reading but the one kept — the last reading's,
 * or a reading that died before it switched — answering how many went.
 */
export const dropOldSitemapPages = internalMutation({
  args: { websiteId: v.id("websites"), keepReadAt: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const before = await ctx.db
      .query("siteSitemapPages")
      .withIndex("by_website_read", (q) => q.eq("websiteId", args.websiteId).lt("readAt", args.keepReadAt))
      .take(SITEMAP_PAGES_CLEARED);
    const rows = before.length > 0
      ? before
      : await ctx.db
        .query("siteSitemapPages")
        .withIndex("by_website_read", (q) => q.eq("websiteId", args.websiteId).gt("readAt", args.keepReadAt))
        .take(SITEMAP_PAGES_CLEARED);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
