import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { listingSourceValidator } from "./localSchema";
import { listingsById, localSetup, rivalsOf } from "./localReads";
import { readReviews, type StoredReview } from "./localReviews";
import type { Site } from "./websiteSiteRows";
import { REPLIER } from "./utils/reviewReplier";

/**
 * Discovery → Reviews (docs/plans/active/discovery-local-reputation-ai-plan.md,
 * step 2, D4, D18; drawn as "Reviews · Your reviews", "Reviews · Against
 * rivals" and "More · What customers say"): a company's own reviews in full,
 * its rivals' by their figures, and what its customers praise and complain
 * about — every figure worked out here from the packed reviews (rule 4).
 */

type Reader = { db: QueryCtx["db"] };
const DAY_MS = 86_400_000;
const officeOptionValidator = v.object({ listingId: v.id("listings"), name: v.string(), town: v.union(v.string(), v.null()) });
const dayBefore = (days: number, now = Date.now()) => new Date(now - days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS));

/** The company's own listings in a page's scope: one office's Google profile, or every own listing. */
async function ownListings(ctx: Reader, site: Site, officeId: Id<"listings"> | undefined) {
  const setup = await localSetup(ctx, site);
  const office = officeId ? setup.offices.find((entry) => entry._id === officeId) ?? null : null;
  if (office) return { setup, office, listings: [office] };
  const links = setup.hold ? await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", setup.hold!._id)).take(200) : [];
  const elsewhere = await listingsById(ctx, links.filter((link) => link.role === "OWN").map((link) => link.listingId));
  const listings = [...setup.offices, ...[...elsewhere.values()].filter((listing) => listing.source !== "GOOGLE")];
  return { setup, office: null, listings };
}

/** The average of how many days the owner took to reply, over the reviews answered since `since`. */
/**
 * A business's reviews in three figures, as Reviews against rivals counts
 * them: new in the last 30 days, the share of the last year's answered, and
 * the days a reply takes on average — and One business beside it.
 */
export function reviewFiguresOf(reviews: readonly StoredReview[], now = Date.now()) {
  const recent = reviews.filter((review) => review.day >= dayBefore(365, now));
  return {
    newIn30: reviews.length > 0 ? reviews.filter((review) => review.day >= dayBefore(30, now)).length : null,
    answered: recent.length > 0 ? recent.filter((review) => review.replyDay).length / recent.length : null,
    daysToAnswer: daysToAnswer(reviews, dayBefore(365, now)),
  };
}

function daysToAnswer(reviews: readonly StoredReview[], since: string): number | null {
  // A reply dated only "a year ago" says it was answered, never how fast.
  const waits = reviews.filter((review) => review.replyDay && !review.replyRough && review.day >= since).map((review) => daysBetween(review.day, review.replyDay!));
  return waits.length > 0 ? waits.reduce((sum, wait) => sum + wait, 0) / waits.length : null;
}

const reviewRowValidator = v.object({
  listingId: v.id("listings"),
  id: v.string(),
  day: v.string(),
  stars: v.number(),
  text: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
  guide: v.boolean(),
  replyDay: v.union(v.string(), v.null()),
  /** Answered, on a day known only to the month or year. */
  replyRough: v.boolean(),
});

export const yourReviews = tenantQuery({
  args: { siteId: v.id("companyWebsites"), officeId: v.optional(v.id("listings")) },
  returns: v.object({
    offices: v.array(officeOptionValidator),
    listings: v.array(v.object({ listingId: v.id("listings"), source: listingSourceValidator, town: v.union(v.string(), v.null()), rating: v.union(v.number(), v.null()) })),
    figures: v.object({
      googleRating: v.union(v.number(), v.null()),
      otherRatings: v.array(v.object({ source: listingSourceValidator, rating: v.number() })),
      newIn30: v.number(),
      newBefore: v.number(),
      waiting: v.number(),
      oldestWaitingDays: v.union(v.number(), v.null()),
      daysToAnswer: v.union(v.number(), v.null()),
    }),
    months: v.array(v.object({ month: v.string(), reviews: v.number(), stars: v.union(v.number(), v.null()) })),
    rows: v.array(reviewRowValidator),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { setup, listings } = await ownListings(ctx, site, args.officeId);
    const rows: Array<StoredReview & { listingId: Id<"listings"> }> = [];
    for (const listing of listings) for (const review of await readReviews(ctx, listing._id)) rows.push({ ...review, listingId: listing._id });
    rows.sort((left, right) => right.day.localeCompare(left.day));

    const now = Date.now();
    const google = listings.filter((listing) => listing.source === "GOOGLE" && listing.rating !== undefined && (listing.reviews ?? 0) > 0);
    const googleRating = google.length > 0
      ? google.reduce((sum, listing) => sum + listing.rating! * (listing.reviews ?? 0), 0) / google.reduce((sum, listing) => sum + (listing.reviews ?? 0), 0)
      : null;
    const waiting = rows.filter((row) => !row.replyDay);
    const months = Array.from({ length: 12 }, (_, at) => {
      const date = new Date(now);
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - (11 - at));
      return date.toISOString().slice(0, 7);
    });
    return {
      offices: setup.offices.map((office) => ({ listingId: office._id, name: office.name, town: office.town ?? null })),
      listings: listings.map((listing) => ({ listingId: listing._id, source: listing.source, town: listing.town ?? null, rating: listing.rating ?? null })),
      figures: {
        googleRating,
        otherRatings: listings.filter((listing) => listing.source !== "GOOGLE" && listing.rating !== undefined).map((listing) => ({ source: listing.source, rating: listing.rating! })),
        newIn30: rows.filter((row) => row.day >= dayBefore(30, now)).length,
        newBefore: rows.filter((row) => row.day >= dayBefore(60, now) && row.day < dayBefore(30, now)).length,
        waiting: waiting.length,
        oldestWaitingDays: waiting.length > 0 ? daysBetween(waiting[waiting.length - 1].day, dayBefore(0, now)) : null,
        daysToAnswer: daysToAnswer(rows, dayBefore(90, now)),
      },
      months: months.map((month) => {
        const of = rows.filter((row) => row.day.startsWith(month));
        return { month, reviews: of.length, stars: of.length > 0 ? of.reduce((sum, row) => sum + row.stars, 0) / of.length : null };
      }),
      rows: rows.map((row) => ({
        listingId: row.listingId, id: row.id, day: row.day, stars: row.stars,
        text: row.text ?? null, name: row.name ?? null, guide: row.guide === true, replyDay: row.replyDay ?? null, replyRough: row.replyRough === true,
      })),
    };
  },
});

const businessRowValidator = v.object({
  listingId: v.id("listings"),
  name: v.string(),
  source: listingSourceValidator,
  you: v.boolean(),
  rating: v.union(v.number(), v.null()),
  reviews: v.union(v.number(), v.null()),
  newIn30: v.union(v.number(), v.null()),
  answered: v.union(v.number(), v.null()),
  daysToAnswer: v.union(v.number(), v.null()),
});

export const reviewsAgainstRivals = tenantQuery({
  args: { siteId: v.id("companyWebsites"), officeId: v.optional(v.id("listings")) },
  returns: v.object({
    offices: v.array(officeOptionValidator),
    office: v.union(v.null(), officeOptionValidator),
    rows: v.array(businessRowValidator),
    months: v.array(v.string()),
    /**
     * Each Google profile's reviews at the end of each month — its count now
     * less the reviews held dated after — as far back as the reviews held reach
     * (a rival's newest few): the chart's lines.
     */
    lines: v.array(v.object({ listingId: v.id("listings"), name: v.string(), you: v.boolean(), counts: v.array(v.union(v.number(), v.null())) })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const setup = await localSetup(ctx, site);
    const office = setup.offices.find((entry) => entry._id === args.officeId) ?? setup.offices[0] ?? null;
    const offices = setup.offices.map((entry) => ({ listingId: entry._id, name: entry.name, town: entry.town ?? null }));
    if (!office) return { offices, office: null, rows: [], months: [], lines: [] };
    const rivals = rivalsOf(office, setup.rivals, setup.rivalOffice);
    const links = setup.hold ? await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", setup.hold!._id)).take(200) : [];
    const elsewhere = [...(await listingsById(ctx, links.map((link) => link.listingId))).values()].filter((listing) => listing.source !== "GOOGLE");
    // A rival's pages elsewhere are joined to it by the website they name.
    const rivalHosts = new Set(rivals.map((rival) => rival.websiteHost).filter(Boolean));
    const ownLinks = new Set(links.filter((link) => link.role === "OWN").map((link) => link.listingId as string));
    const businesses: Array<{ listing: Doc<"listings">; you: boolean }> = [
      { listing: office, you: true },
      ...rivals.map((listing) => ({ listing, you: false })),
      ...elsewhere.filter((listing) => ownLinks.has(listing._id)).map((listing) => ({ listing, you: true })),
      ...elsewhere.filter((listing) => !ownLinks.has(listing._id) && rivalHosts.has(listing.websiteHost)).map((listing) => ({ listing, you: false })),
    ];
    const now = Date.now();
    const rows = [];
    const held = new Map<string, StoredReview[]>();
    for (const { listing, you } of businesses) {
      const reviews = await readReviews(ctx, listing._id);
      held.set(listing._id, reviews);
      rows.push({
        listingId: listing._id,
        name: listing.name,
        source: listing.source,
        you,
        rating: listing.rating ?? null,
        reviews: listing.reviews ?? null,
        ...reviewFiguresOf(reviews, now),
      });
    }
    const months = Array.from({ length: 12 }, (_, at) => {
      const date = new Date(now);
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - (11 - at));
      return date.toISOString().slice(0, 7);
    });
    const lines = businesses.filter((entry) => entry.listing.source === "GOOGLE").map(({ listing, you }) => ({
      listingId: listing._id,
      name: listing.name,
      you,
      counts: reviewsAtMonthEnds(held.get(listing._id) ?? [], listing.reviews ?? null, months),
    }));
    return { offices, office: { listingId: office._id, name: office.name, town: office.town ?? null }, rows, months, lines };
  },
});

/**
 * A listing's reviews at the end of each month: its count now less the reviews
 * held dated after the month — known only back to the oldest review held when
 * fewer are held than it has (a rival's newest few, `localRivalReviews`).
 */
export function reviewsAtMonthEnds(reviews: readonly StoredReview[], total: number | null, months: readonly string[]): Array<number | null> {
  if (total === null && reviews.length === 0) return months.map(() => null);
  const now = Math.max(total ?? 0, reviews.length);
  const oldest = reviews.reduce<string | null>((day, review) => (day === null || review.day < day ? review.day : day), null);
  const complete = reviews.length >= now;
  return months.map((month) => {
    const end = `${month}-31`;
    if (!complete && (oldest === null || oldest > end)) return null;
    return Math.max(0, now - reviews.filter((review) => review.day > end).length);
  });
}

/** A review's topics as the AI read them: "website design+|speed-" → praised and complained-about topics. */
function marksOf(topics: string | undefined): Array<{ topic: string; praise: boolean }> {
  if (!topics) return [];
  return topics.split("|").filter(Boolean).map((mark) => ({ topic: mark.slice(0, -1), praise: mark.endsWith("+") }));
}

export const whatCustomersSay = tenantQuery({
  args: { siteId: v.id("companyWebsites"), officeId: v.optional(v.id("listings")) },
  returns: v.object({
    offices: v.array(officeOptionValidator),
    read: v.number(),
    unread: v.number(),
    topics: v.array(v.object({
      topic: v.string(),
      praise: v.number(),
      complaints: v.number(),
      complaintsThisYear: v.number(),
      rivalsPraised: v.number(),
      topRival: v.union(v.null(), v.object({ name: v.string(), reviews: v.number() })),
    })),
    stars: v.array(v.object({ listingId: v.id("listings"), name: v.string(), you: v.boolean(), counts: v.array(v.number()), rating: v.union(v.number(), v.null()) })),
    waiting: v.number(),
    drafts: v.array(v.object({ listingId: v.id("listings"), reviewId: v.string(), source: listingSourceValidator, town: v.union(v.string(), v.null()), day: v.string(), stars: v.number(), name: v.union(v.string(), v.null()), text: v.string(), reply: v.string() })),
    /** What a drafted reply has cost, on average over the replier's last few: the card's cost line. */
    perReplyUsd: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { setup, office, listings } = await ownListings(ctx, site, args.officeId);
    const reviews: Array<StoredReview & { listing: Doc<"listings"> }> = [];
    for (const listing of listings) for (const review of await readReviews(ctx, listing._id)) reviews.push({ ...review, listing });
    const year = new Date().toISOString().slice(0, 4);
    const byTopic = new Map<string, { praise: number; complaints: number; complaintsThisYear: number }>();
    for (const review of reviews) {
      for (const mark of marksOf(review.topics)) {
        const held = byTopic.get(mark.topic) ?? { praise: 0, complaints: 0, complaintsThisYear: 0 };
        if (mark.praise) held.praise += 1;
        else {
          held.complaints += 1;
          if (review.day.startsWith(year)) held.complaintsThisYear += 1;
        }
        byTopic.set(mark.topic, held);
      }
    }
    // What rivals' reviews talk about, from Google's own topics on their profiles.
    const rivals = office ? rivalsOf(office, setup.rivals, setup.rivalOffice) : setup.rivals;
    const rivalTopics = new Map<string, { total: number; top: { name: string; reviews: number } | null }>();
    for (const rival of rivals) {
      for (const entry of rival.profile?.topics ?? []) {
        const held = rivalTopics.get(entry.topic) ?? { total: 0, top: null };
        held.total += entry.reviews;
        if (!held.top || entry.reviews > held.top.reviews) held.top = { name: rival.name, reviews: entry.reviews };
        rivalTopics.set(entry.topic, held);
      }
    }
    const ownTopics = new Set(listings.flatMap((listing) => (listing.profile?.topics ?? []).map((entry) => entry.topic)));
    const names = [...new Set([...byTopic.keys(), ...ownTopics])];
    const topics = names.map((topic) => ({
      topic,
      ...(byTopic.get(topic) ?? { praise: 0, complaints: 0, complaintsThisYear: 0 }),
      rivalsPraised: rivalTopics.get(topic)?.total ?? 0,
      topRival: rivalTopics.get(topic)?.top ?? null,
    }));
    const starsOf = (listing: Doc<"listings">, you: boolean) => ({
      listingId: listing._id, name: listing.name, you, counts: listing.profile?.starCounts ?? [], rating: listing.rating ?? null,
    });
    const googleOwn = listings.filter((listing) => listing.source === "GOOGLE");
    const drafts = setup.hold
      ? await ctx.db.query("reviewReplyDrafts").withIndex("by_hold", (q) => q.eq("companyWebsiteId", setup.hold!._id)).take(200)
      : [];
    const draftOf = new Map(drafts.map((draft) => [`${draft.listingId}|${draft.reviewId}`, draft.text]));
    const waiting = reviews.filter((review) => !review.replyDay).sort((left, right) => right.day.localeCompare(left.day));
    return {
      offices: setup.offices.map((entry) => ({ listingId: entry._id, name: entry.name, town: entry.town ?? null })),
      read: reviews.filter((review) => review.topics !== undefined).length,
      unread: reviews.filter((review) => review.text && review.topics === undefined).length,
      topics,
      stars: [...googleOwn.map((listing) => starsOf(listing, true)), ...rivals.map((listing) => starsOf(listing, false))],
      waiting: waiting.length,
      drafts: waiting.flatMap((review) => {
        const reply = draftOf.get(`${review.listing._id}|${review.id}`);
        return reply && review.text ? [{
          listingId: review.listing._id, reviewId: review.id, source: review.listing.source, town: review.listing.town ?? null,
          day: review.day, stars: review.stars, name: review.name ?? null, text: review.text, reply,
        }] : [];
      }).slice(0, 20),
      perReplyUsd: await perReplyUsd(ctx),
    };
  },
});

/** Drafted replies averaged for the cost line. */
const REPLIES_PRICED = 20;

/** The average cost of the replier's last few drafts, any company's: the price of a reply, not anyone's spend. */
async function perReplyUsd(ctx: Reader): Promise<number | null> {
  const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", REPLIER.systemKey)).first();
  if (!agent) return null;
  const calls = await ctx.db.query("agentTransactions").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).order("desc").take(REPLIES_PRICED);
  return calls.length > 0 ? calls.reduce((sum, call) => sum + call.costUsd, 0) / calls.length : null;
}

/** A topic's average stars across the reviews the AI read it in, for Business profile's "Their stars". */
export function starsByTopic(reviews: readonly StoredReview[]): Map<string, number> {
  const sums = new Map<string, { stars: number; count: number }>();
  for (const review of reviews) {
    for (const mark of marksOf(review.topics)) {
      const held = sums.get(mark.topic) ?? { stars: 0, count: 0 };
      held.stars += review.stars;
      held.count += 1;
      sums.set(mark.topic, held);
    }
  }
  return new Map([...sums.entries()].map(([topic, held]) => [topic, held.stars / held.count]));
}
