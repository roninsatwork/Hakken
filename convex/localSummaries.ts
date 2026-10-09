import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readFanOutLimits } from "./fanOutLimits";
import { localWatchList, officesForSearch } from "./localPlanning";
import { holdSearches } from "./holdLists";
import { SEO_KEYWORD_CHECKS_PER_WEBSITE } from "./seoCollectionPolicy";
import { readListingActivity } from "./localListings";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * The numbers beside Local's pages in a website's menu (`localSummaries`), and
 * the rivals matched to a company's tracked competitors (plan D7).
 *
 * Worked out after a filing that changes them, never on a timer (plan rule
 * 13) — and at most once in `REBUILD_AFTER_MS` for a website: a run files
 * hundreds of map checks, and a rebuild after each would read the same
 * records hundreds of times. The first filing marks the website and books
 * one rebuild; the rest find it booked.
 */

const REBUILD_AFTER_MS = 10 * 60 * 1000;
/** Websites whose numbers one filing marks: far past the companies watching one business. */
const WATCHERS_READ = 50;
/** Days a rival's post counts on the menu. */
const POST_DAYS = 30;

type Reader = { db: QueryCtx["db"] };

/** The websites that link any of these listings, as an office or a rival. */
async function holdsWatching(ctx: Reader, listingIds: readonly Id<"listings">[]): Promise<Set<Id<"companyWebsites">>> {
  const holds = new Set<Id<"companyWebsites">>();
  for (const listingId of listingIds) {
    const links = await ctx.db.query("holdListings").withIndex("by_listing", (q) => q.eq("listingId", listingId)).take(WATCHERS_READ);
    for (const link of links) holds.add(link.companyWebsiteId);
  }
  return holds;
}

/** Book a rebuild of the numbers of every website watching these listings, unless one is booked. */
export async function noteLocalChange(ctx: MutationCtx, listingIds: readonly Id<"listings">[]): Promise<void> {
  for (const holdId of await holdsWatching(ctx, listingIds)) {
    const summary = await ctx.db.query("localSummaries").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).unique();
    if (summary?.rebuildAt !== undefined) continue;
    const rebuildAt = Date.now() + REBUILD_AFTER_MS;
    if (summary) await ctx.db.patch(summary._id, { rebuildAt });
    else await ctx.db.insert("localSummaries", { companyWebsiteId: holdId, ownListings: 0, mapSearches: 0, marketBusinesses: 0, rivalPosts: 0, rebuildAt, updatedAt: Date.now() });
    await ctx.scheduler.runAt(rebuildAt, internal.localSummaries.rebuildLocalSummary, { holdId });
  }
}

/**
 * A website's Local numbers as they stand: its own listings, and its first
 * office's searches on Maps and local market — what Map rankings and Local
 * market open on — and its rivals' posts in thirty days.
 */
export async function localNumbers(ctx: Reader, hold: Doc<"companyWebsites">) {
  const links = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(200);
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const { offices, rivals } = await localWatchList(ctx, hold, limits);
  const first = offices[0];
  // The searches the first office is checked for, as the planner chooses them: its Map rankings' rows.
  const searches = first
    ? (await holdSearches(ctx, hold._id, Math.min(SEO_KEYWORD_CHECKS_PER_WEBSITE, limits.trackedPerSite), { activeOnly: true }))
      .filter((search) => officesForSearch(search.keyword, offices.filter((office) => office.point)).some((office) => office._id === first._id)).length
    : 0;
  const market = first?.point && first.categoryIds?.[0]
    ? await ctx.db
      .query("localMarketParts")
      .withIndex("by_market", (q) => q.eq("category", first.categoryIds![0]).eq("point", first.point!).eq("km", limits.localMarketKm))
      .unique()
    : null;
  const since = new Date(Date.now() - POST_DAYS * 86_400_000).toISOString().slice(0, 10);
  let rivalPosts = 0;
  for (const rival of rivals) {
    rivalPosts += (await readListingActivity(ctx, rival._id)).filter((line) => ["POST", "OFFER", "EVENT"].includes(line.kind) && line.day >= since).length;
  }
  return {
    ownListings: links.filter((link) => link.role === "OWN").length,
    mapSearches: searches,
    marketBusinesses: market?.total ?? 0,
    rivalPosts,
  };
}

export const rebuildLocalSummary = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await writeLocalSummary(ctx, args.holdId);
    return null;
  },
});

/** Work a website's numbers out now and keep them, writing nothing when nothing changed. */
export async function writeLocalSummary(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<void> {
  const hold = await ctx.db.get(holdId);
  const summary = await ctx.db.query("localSummaries").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).unique();
  if (!hold || isTrackedHold(hold)) {
    if (summary) await ctx.db.delete(summary._id);
    return;
  }
  const numbers = await localNumbers(ctx, hold);
  if (!summary) {
    await ctx.db.insert("localSummaries", { companyWebsiteId: holdId, ...numbers, updatedAt: Date.now() });
    return;
  }
  const same = summary.rebuildAt === undefined
    && summary.ownListings === numbers.ownListings && summary.mapSearches === numbers.mapSearches
    && summary.marketBusinesses === numbers.marketBusinesses && summary.rivalPosts === numbers.rivalPosts;
  if (!same) await ctx.db.patch(summary._id, { ...numbers, rebuildAt: undefined, updatedAt: Date.now() });
}

/**
 * Rivals matched to a company's tracked competitors (plan D7): a business in
 * an office's map check or local market whose website is one the company
 * watches as a competitor of this website is linked as a rival against that
 * office, unless it is linked already or the office has its limit of rivals.
 */
export async function matchRivals(
  ctx: MutationCtx,
  point: string,
  businesses: ReadonlyArray<{ listingId: Id<"listings">; websiteHost?: string }>,
): Promise<void> {
  const withWebsite = businesses.filter((business) => business.websiteHost);
  if (withWebsite.length === 0) return;
  const offices = await ctx.db.query("listings").withIndex("by_point", (q) => q.eq("point", point)).take(10);
  for (const office of offices) {
    const links = await ctx.db.query("holdListings").withIndex("by_listing", (q) => q.eq("listingId", office._id)).take(WATCHERS_READ);
    for (const officeLink of links.filter((link) => link.role === "OWN")) {
      const hold = await ctx.db.get(officeLink.companyWebsiteId);
      if (!hold || isTrackedHold(hold)) continue;
      const competitors = await ctx.db
        .query("companyWebsites")
        .withIndex("by_company_against", (q) => q.eq("companyId", hold.companyId).eq("againstWebsiteId", hold.websiteId))
        .take(100);
      const hosts = new Set<string>();
      for (const competitor of competitors) {
        const website = await ctx.db.get(competitor.websiteId);
        if (website) hosts.add(website.host.replace(/^www\./, ""));
      }
      const matched = withWebsite.filter((business) => hosts.has(business.websiteHost!) && business.listingId !== office._id);
      if (matched.length === 0) continue;
      const { localRivalsPerOffice } = await readFanOutLimits(ctx, hold.companyId, hold._id);
      const held = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(200);
      let against = held.filter((link) => link.role === "RIVAL" && (link.againstListingId === office._id || !link.againstListingId)).length;
      for (const business of matched) {
        if (against >= localRivalsPerOffice) break;
        if (held.some((link) => link.listingId === business.listingId)) continue;
        await ctx.db.insert("holdListings", {
          companyWebsiteId: hold._id,
          companyId: hold.companyId,
          listingId: business.listingId,
          role: "RIVAL",
          againstListingId: office._id,
          addedFrom: "MATCHED",
          createdAt: Date.now(),
        });
        against += 1;
      }
    }
  }
}
