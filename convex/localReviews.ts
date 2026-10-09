import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { listingSourceValidator } from "./localSchema";
import { findListing } from "./localListings";
import { noteLocalChange } from "./localSummaries";
import { parseReviews, reviewsCountOf, type ParsedReview } from "./reviewParse";
import { reviewListingAskedFor } from "./dataForSeoReviewOperations";
import type { PullForParse } from "./seoCollectionParse";
import { appError } from "./utils/appError";
import { getErrorMessage } from "./utils/lang";
import { packColumn, packDays, unpackColumn, unpackDays } from "./utils/packedColumns";

/**
 * A listing's reviews as packed records (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, rules 2 and 11; D4): a thousand a record, newest
 * first, each review once by its own number, rewritten only when something
 * about one changed — a new review, a reply, the AI's reading of it.
 */

/** Days a review waiting for a reply is read again, so the reply shows when it comes. */
const RECHECK_DAYS = 90;

/** How many of the newest reviews to read again: down to the oldest still waiting within `RECHECK_DAYS`. */
export function recheckDepth(reviews: readonly StoredReview[], now: number): number {
  const since = new Date(now - RECHECK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const newest = [...reviews].sort((left, right) => right.day.localeCompare(left.day));
  let depth = 0;
  newest.forEach((review, at) => {
    if (review.day >= since && !review.replyDay) depth = at + 1;
  });
  return depth;
}

/** Reviews a record holds. */
export const REVIEW_PART_ROWS = 1_000;
/** Records read for one listing: past the most Google gives (4,490) and a Trustpilot page's thousands. */
export const REVIEW_PARTS_READ = 12;

export type StoredReview = {
  id: string;
  day: string;
  stars: number;
  replyDay?: string;
  /** The reply's day is known only to the month or year: answered, but not how fast. */
  replyRough?: boolean;
  guide?: boolean;
  text?: string;
  name?: string;
  /** What the company's AI read in it: "website design+|speed-"; "" none; absent, not read yet. */
  topics?: string;
};

type Reader = { db: QueryCtx["db"] };

function rowsOf(part: Doc<"listingReviewParts">): StoredReview[] {
  const days = unpackDays(part.days);
  const stars = unpackColumn(part.stars);
  const replies = unpackDays(part.replyDays);
  const guides = unpackColumn(part.guides);
  const rough = part.replyRough ? unpackColumn(part.replyRough) : [];
  return part.ids.map((id, at) => ({
    id,
    day: days[at]!,
    stars: stars[at] ?? 0,
    ...(replies[at] ? { replyDay: replies[at] } : {}),
    ...(rough[at] === 1 ? { replyRough: true } : {}),
    ...(guides[at] === 1 ? { guide: true } : {}),
    ...(part.texts?.[at] ? { text: part.texts[at]! } : {}),
    ...(part.names?.[at] ? { name: part.names[at]! } : {}),
    ...(part.topics && part.topics[at] !== null && part.topics[at] !== undefined ? { topics: part.topics[at]! } : {}),
  }));
}

async function partsOf(ctx: Reader, listingId: Id<"listings">) {
  return await ctx.db.query("listingReviewParts").withIndex("by_listing_part", (q) => q.eq("listingId", listingId)).take(REVIEW_PARTS_READ);
}

/** A listing's reviews, newest first. */
export async function readReviews(ctx: Reader, listingId: Id<"listings">): Promise<StoredReview[]> {
  return (await partsOf(ctx, listingId)).sort((left, right) => left.part - right.part).flatMap(rowsOf);
}

const sameReview = (left: StoredReview | undefined, right: StoredReview) => JSON.stringify(left ?? null) === JSON.stringify(right);

/** A listing's reviews written back as records of a thousand, newest first, only the records that changed. */
export async function writeReviews(ctx: MutationCtx, listingId: Id<"listings">, reviews: readonly StoredReview[]): Promise<void> {
  const sorted = [...reviews].sort((left, right) => right.day.localeCompare(left.day) || left.id.localeCompare(right.id));
  const held = await partsOf(ctx, listingId);
  const byPart = new Map(held.map((part) => [part.part, part]));
  const words = sorted.some((review) => review.text !== undefined || review.name !== undefined);
  const parts = Math.ceil(sorted.length / REVIEW_PART_ROWS);
  for (let part = 0; part < parts; part += 1) {
    const rows = sorted.slice(part * REVIEW_PART_ROWS, (part + 1) * REVIEW_PART_ROWS);
    const existing = byPart.get(part);
    if (existing) {
      const before = rowsOf(existing);
      if (before.length === rows.length && rows.every((row, at) => sameReview(before[at], row))) continue;
    }
    const fields = {
      listingId,
      part,
      ids: rows.map((row) => row.id),
      days: packDays(rows.map((row) => row.day)),
      stars: packColumn(rows.map((row) => row.stars)),
      replyDays: packDays(rows.map((row) => row.replyDay)),
      guides: packColumn(rows.map((row) => (row.guide ? 1 : undefined))),
      ...(rows.some((row) => row.replyRough) ? { replyRough: packColumn(rows.map((row) => (row.replyRough ? 1 : undefined))) } : {}),
      ...(words ? { texts: rows.map((row) => row.text ?? null), names: rows.map((row) => row.name ?? null) } : {}),
      ...(rows.some((row) => row.topics !== undefined) ? { topics: rows.map((row) => row.topics ?? null) } : {}),
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.replace(existing._id, fields);
    else await ctx.db.insert("listingReviewParts", fields);
  }
  for (const part of held) if (part.part >= parts) await ctx.db.delete(part._id);
}

/** Whether any company calls this listing its own: only then are its reviews' words kept (D4). */
export async function isAnyonesOwn(ctx: Reader, listingId: Id<"listings">): Promise<boolean> {
  const links = await ctx.db.query("holdListings").withIndex("by_listing", (q) => q.eq("listingId", listingId)).take(50);
  return links.some((link) => link.role === "OWN");
}

/**
 * Merge one answer's reviews over the held ones: a review read again takes
 * its new stars and reply — but a reply once dated to the day keeps that day,
 * as a year later Google says only "a year ago" — keeps what the AI read in it
 * unless its words changed, and loses its words where nobody calls the
 * listing their own.
 */
export function mergeReviews(held: readonly StoredReview[], incoming: readonly ParsedReview[], keepWords: boolean): StoredReview[] {
  const byId = new Map(held.map((review) => [review.id, review]));
  for (const review of incoming) {
    const before = byId.get(review.id);
    const text = keepWords ? review.text : undefined;
    const sameWords = before?.text === text;
    const keepReply = before?.replyDay && (!review.replyDay || (!before.replyRough && review.replyRough));
    const reply = keepReply ? { day: before.replyDay, rough: before.replyRough } : { day: review.replyDay, rough: review.replyRough };
    byId.set(review.id, {
      id: review.id,
      day: review.day,
      stars: review.stars,
      ...(reply.day ? { replyDay: reply.day } : {}),
      ...(reply.day && reply.rough ? { replyRough: true } : {}),
      ...(review.guide ? { guide: true } : {}),
      ...(text ? { text } : {}),
      ...(keepWords && review.name ? { name: review.name } : {}),
      ...(sameWords && before?.topics !== undefined ? { topics: before.topics } : {}),
    });
  }
  return [...byId.values()].map((review) => {
    if (keepWords) return review;
    const { text: _text, name: _name, topics: _topics, ...figures } = review;
    return figures;
  });
}

const parsedReviewValidator = v.object({
  id: v.string(),
  day: v.string(),
  stars: v.number(),
  text: v.optional(v.string()),
  name: v.optional(v.string()),
  guide: v.optional(v.boolean()),
  replyDay: v.optional(v.string()),
  replyRough: v.optional(v.boolean()),
});

/** One answer's reviews filed for the listing they are of; its watchers' numbers marked, and an own listing's new reviews read by the AI. */
export const fileReviews = internalMutation({
  args: {
    listing: v.object({ source: listingSourceValidator, key: v.string() }),
    reviews: v.array(parsedReviewValidator),
    reviewsCount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await findListing(ctx, args.listing.source, args.listing.key);
    if (!listing) return null;
    const own = await isAnyonesOwn(ctx, listing._id);
    const held = await readReviews(ctx, listing._id);
    const merged = mergeReviews(held, args.reviews, own);
    await writeReviews(ctx, listing._id, merged);
    // The planner's light reading (`reviewPlanning.ts`), written only when it moved.
    const reading = {
      reviewsHeld: merged.length,
      reviewsRecheck: recheckDepth(merged, Date.now()),
      reviewsAnswered: merged.filter((review) => review.replyDay).length,
      ...(args.reviewsCount !== undefined ? { reviews: args.reviewsCount } : {}),
    };
    if (Object.entries(reading).some(([key, value]) => (listing as Record<string, unknown>)[key] !== value)) {
      await ctx.db.patch(listing._id, reading);
    }
    await dropAnsweredDrafts(ctx, listing._id, merged);
    await noteLocalChange(ctx, [listing._id]);
    if (own && merged.some((review) => review.text && review.topics === undefined)) {
      await ctx.scheduler.runAfter(0, internal.reviewJudging.readNewReviews, { listingId: listing._id });
    }
    if (own && merged.some((review) => review.text && !review.replyDay)) {
      await ctx.scheduler.runAfter(0, internal.reviewReplyActions.draftReplies, { listingId: listing._id });
    }
    return null;
  },
});

/** A drafted reply goes once its review is answered. */
async function dropAnsweredDrafts(ctx: MutationCtx, listingId: Id<"listings">, reviews: readonly StoredReview[]): Promise<void> {
  const answered = new Set(reviews.filter((review) => review.replyDay).map((review) => review.id));
  if (answered.size === 0) return;
  const links = await ctx.db.query("holdListings").withIndex("by_listing", (q) => q.eq("listingId", listingId)).take(50);
  for (const link of links.filter((entry) => entry.role === "OWN")) {
    const drafts = await ctx.db.query("reviewReplyDrafts").withIndex("by_hold", (q) => q.eq("companyWebsiteId", link.companyWebsiteId)).take(500);
    for (const draft of drafts) if (draft.listingId === listingId && answered.has(draft.reviewId)) await ctx.db.delete(draft._id);
  }
}

/** File one reviews purchase, from the parse step (`seoCollectionParse.ts`). Failures are recorded on the pull. */
export async function fileReviewPull(ctx: ActionCtx, pullId: Id<"seoDataPulls">, pull: PullForParse): Promise<null> {
  try {
    const sent: unknown = JSON.parse(pull.taskArgsJson ?? "{}");
    const listing = reviewListingAskedFor(pull.operationId, (sent && typeof sent === "object" ? sent : {}) as Record<string, unknown>);
    if (!listing) throw appError("INVALID_INPUT", "This purchase does not say which listing it was for.");
    const result: unknown = JSON.parse(pull.resultJson ?? "null");
    const reviewsCount = reviewsCountOf(result);
    await ctx.runMutation(internal.localReviews.fileReviews, {
      listing,
      reviews: parseReviews(pull.operationId, result),
      ...(reviewsCount !== undefined ? { reviewsCount } : {}),
    });
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}
