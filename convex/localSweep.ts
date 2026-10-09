import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Clearing what Discovery's Local pages keep past its time
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, §5): a map check
 * after 90 days, as Google's results pages are; and a business nobody links
 * and nothing has named for 90 days, with its weeks, activity and map places.
 * A duty of the hourly collection sweep (`seoCollectionSweep.ts`), not a timer
 * of its own (plan rule 13).
 */

export const LOCAL_KEPT_DAYS = 90;
const DAY_MS = 86_400_000;
/** Map checks cleared a page: each twenty businesses and their reasons, a few kilobytes. */
const CHECKS_PAGE = 200;
/** Businesses looked at a page: each cleared with its few records. */
const LISTINGS_PAGE = 50;

/** One page of clearing; `more` when there may be more to clear. */
export async function purgeExpiredLocal(ctx: MutationCtx, now: number): Promise<{ more: boolean }> {
  const cutoff = now - LOCAL_KEPT_DAYS * DAY_MS;
  const checks = await ctx.db
    .query("mapChecks")
    .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
    .take(CHECKS_PAGE);
  for (const check of checks) await ctx.db.delete(check._id);

  const unseen = await ctx.db.query("listings").withIndex("by_seen", (q) => q.lt("seenAt", cutoff)).take(LISTINGS_PAGE);
  let partly = false;
  for (const listing of unseen) {
    if (await ctx.db.query("holdListings").withIndex("by_listing", (q) => q.eq("listingId", listing._id)).first()) {
      // Linked: kept, and marked seen so the next page moves on past it.
      await ctx.db.patch(listing._id, { seenAt: now });
      continue;
    }
    if (!(await clearListing(ctx, listing._id))) partly = true;
  }
  return { more: partly || checks.length === CHECKS_PAGE || unseen.length === LISTINGS_PAGE };
}

/** Places of a listing cleared a page: an office's searches, a record each. */
const PLACES_PAGE = 250;

/** A listing and its records; false when its places run past a page and the rest wait for the next. */
async function clearListing(ctx: MutationCtx, listingId: Id<"listings">): Promise<boolean> {
  const places = await ctx.db.query("mapPositionWeeks").withIndex("by_listing_keyword", (q) => q.eq("listingId", listingId)).take(PLACES_PAGE);
  for (const place of places) await ctx.db.delete(place._id);
  if (places.length === PLACES_PAGE) return false;
  const weeks = await ctx.db.query("listingWeeks").withIndex("by_listing", (q) => q.eq("listingId", listingId)).unique();
  if (weeks) await ctx.db.delete(weeks._id);
  const activity = await ctx.db.query("listingActivityParts").withIndex("by_listing", (q) => q.eq("listingId", listingId)).unique();
  if (activity) await ctx.db.delete(activity._id);
  const reviews = await ctx.db.query("listingReviewParts").withIndex("by_listing_part", (q) => q.eq("listingId", listingId)).take(20);
  for (const part of reviews) await ctx.db.delete(part._id);
  await ctx.db.delete(listingId);
  return true;
}

/** A website's own Local links, its last finds, its menu numbers and its drafted replies, when the website leaves the company. */
export async function purgeHoldLocal(ctx: { db: MutationCtx["db"] }, companyWebsiteId: Id<"companyWebsites">): Promise<void> {
  const links = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(500);
  for (const link of links) await ctx.db.delete(link._id);
  const finds = await ctx.db.query("listingFinds").withIndex("by_hold_source", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(10);
  for (const find of finds) await ctx.db.delete(find._id);
  const summary = await ctx.db.query("localSummaries").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).unique();
  if (summary) await ctx.db.delete(summary._id);
  const drafts = await ctx.db.query("reviewReplyDrafts").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(500);
  for (const draft of drafts) await ctx.db.delete(draft._id);
}
