import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import {
  GOOGLE_REVIEWS_OPERATION,
  TRIPADVISOR_REVIEWS_OPERATION,
  TRUSTPILOT_REVIEWS_OPERATION,
  googleReviewsParams,
} from "./dataForSeoReviewOperations";
import { parseReviews, reviewsCountOf } from "./reviewParse";
import { mergeReviews, recheckDepth, type StoredReview } from "./localReviews";
import { ownReviewDepth } from "./reviewPlanning";
import { reviewsAtMonthEnds } from "./siteReviews";

/**
 * Discovery's Reviews (discovery-local-reputation-ai-plan.md, step 2): each
 * review filed once by its own number, words kept for a company's own
 * listings only (D4), a reply dated "a year ago" kept as answered but never
 * timed, and nothing rewritten when nothing changed (rule 11). The answers
 * are the shapes bought on 2026-10-09, written by hand; nothing here calls
 * the supplier.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => useFixedDay("2026-10-09"));
afterEach(() => vi.useRealTimers());

const google = (id: string, timestamp: string, extra: Record<string, unknown> = {}) => ({
  type: "google_reviews_search", review_id: id, timestamp: `${timestamp} 10:00:00 +00:00`,
  rating: { rating_type: "Max5", value: 5 }, review_text: `Review ${id}`, profile_name: `Reviewer ${id}`, ...extra,
});

describe("reading an answer", () => {
  test("Google's: words, Local Guides, and a reply dated to the day or only to the year", () => {
    const reviews = parseReviews(GOOGLE_REVIEWS_OPERATION, [{ reviews_count: 64, items: [
      google("a", "2026-10-05"),
      google("b", "2025-09-09", { owner_answer: "Thanks", owner_timestamp: "2025-10-09 18:15:35 +00:00", owner_time_ago: "a year ago", local_guide: true }),
      google("c", "2026-09-20", { owner_answer: "Thanks", owner_timestamp: "2026-09-23 18:15:35 +00:00", owner_time_ago: "2 weeks ago" }),
      // Dated from "a year ago", a reply can fall before its review: it is the review's day.
      google("d", "2025-11-01", { owner_answer: "Thanks", owner_timestamp: "2025-10-09 18:15:35 +00:00", owner_time_ago: "a year ago" }),
      google("a", "2026-10-05"),
      { review_id: "e", timestamp: "2026-10-01 10:00:00 +00:00" },
    ] }]);
    expect(reviews.map((review) => review.id)).toEqual(["a", "c", "d", "b"]);
    expect(reviews[0]).toEqual({ id: "a", day: "2026-10-05", stars: 5, text: "Review a", name: "Reviewer a" });
    expect(reviews[1]).toMatchObject({ replyDay: "2026-09-23" });
    expect(reviews[1].replyRough).toBeUndefined();
    expect(reviews[2]).toMatchObject({ replyDay: "2025-11-01", replyRough: true });
    expect(reviews[3]).toMatchObject({ guide: true, replyDay: "2025-10-09", replyRough: true });
    expect(reviewsCountOf([{ reviews_count: 64 }])).toBe(64);
  });

  test("Trustpilot's by the review's own address, Tripadvisor's with their titles and replies", () => {
    const trustpilot = parseReviews(TRUSTPILOT_REVIEWS_OPERATION, [{ items: [{
      url: "https://www.trustpilot.com/reviews/66f0c1", timestamp: "2026-09-01 08:00:00 +00:00", rating: { value: 4 },
      title: "Good", review_text: "Arrived on time", user_profile: { name: "J. Patel" },
    }] }]);
    expect(trustpilot).toEqual([{ id: "66f0c1", day: "2026-09-01", stars: 4, text: "Good. Arrived on time", name: "J. Patel" }]);
    const tripadvisor = parseReviews(TRIPADVISOR_REVIEWS_OPERATION, [{ items: [{
      review_id: "1079507230", timestamp: "2026-09-27 08:41:03 +00:00", rating: { value: 4 }, title: "Great food",
      review_text: "Asked to vacate the table", user_profile: { name: "Sue C" }, responses: [{ title: "GM", text: "Thank you" }],
    }] }]);
    expect(tripadvisor[0]).toMatchObject({ id: "1079507230", text: "Great food. Asked to vacate the table", replyDay: "2026-09-27" });
  });
});

describe("keeping reviews", () => {
  const held: StoredReview[] = [
    { id: "a", day: "2026-09-01", stars: 5, text: "Lovely", name: "Ann", topics: "team+", replyDay: "2026-09-02" },
    { id: "b", day: "2026-08-01", stars: 2, text: "Slow", name: "Bob", topics: "speed-" },
  ];

  test("a review read again keeps a reply dated to the day, and what the AI read unless its words changed", () => {
    const merged = mergeReviews(held, [
      { id: "a", day: "2026-09-01", stars: 5, text: "Lovely", name: "Ann", replyDay: "2025-10-09", replyRough: true },
      { id: "b", day: "2026-08-01", stars: 3, text: "Slow, then fixed", name: "Bob", replyDay: "2026-09-30" },
    ], true);
    expect(merged.find((review) => review.id === "a")).toEqual(held[0]);
    expect(merged.find((review) => review.id === "b")).toEqual({ id: "b", day: "2026-08-01", stars: 3, text: "Slow, then fixed", name: "Bob", replyDay: "2026-09-30" });
  });

  test("a listing nobody calls their own keeps stars, dates and replies, never words (D4)", () => {
    const merged = mergeReviews([], [{ id: "c", day: "2026-09-01", stars: 4, text: "Fine", name: "Cat", replyDay: "2026-09-03" }], false);
    expect(merged).toEqual([{ id: "c", day: "2026-09-01", stars: 4, replyDay: "2026-09-03" }]);
  });

  test("the newest are read again down to the oldest still waiting within 90 days", () => {
    const now = Date.UTC(2026, 9, 9);
    expect(recheckDepth(held, now)).toBe(2);
    expect(recheckDepth([held[0]], now)).toBe(0);
  });

  test("an own listing reads all its reviews at first, then only what is new and what still waits", () => {
    expect(ownReviewDepth({ reviews: 120, reviewsHeld: undefined, reviewsRecheck: undefined })).toBe(120);
    expect(ownReviewDepth({ reviews: 9_000, reviewsHeld: undefined, reviewsRecheck: undefined })).toBe(4_490);
    expect(ownReviewDepth({ reviews: 125, reviewsHeld: 120, reviewsRecheck: 3 })).toBe(18);
  });

  test("a business's reviews at each month's end reach back as far as its reviews held", () => {
    const reviews: StoredReview[] = [
      { id: "1", day: "2026-10-02", stars: 5 },
      { id: "2", day: "2026-09-15", stars: 5 },
      { id: "3", day: "2026-08-15", stars: 5 },
    ];
    expect(reviewsAtMonthEnds(reviews, 3, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([0, 1, 2, 3]);
    // A rival's newest three of forty: known back to August only.
    expect(reviewsAtMonthEnds(reviews, 40, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([null, 38, 39, 40]);
  });
});

describe("filing", () => {
  async function company(t: Harness) {
    return await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
      await ctx.db.insert("collectionParts", { companyId, local: true, reviews: true, updatedAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
      const listing = async (key: string, name: string) => await ctx.db.insert("listings", { source: "GOOGLE", key, name, town: "Guildford", reviews: 2, seenAt: Date.now() });
      const officeId = await listing("17195342752822652591", "Ronins");
      const rivalId = await listing("11130894354104863534", "Air Social");
      await ctx.db.insert("holdListings", { companyWebsiteId: holdId, companyId, listingId: officeId, role: "OWN", addedFrom: "HAND", createdAt: Date.now() });
      await ctx.db.insert("holdListings", { companyWebsiteId: holdId, companyId, listingId: rivalId, role: "RIVAL", againstListingId: officeId, addedFrom: "HAND", createdAt: Date.now() });
      return { officeId, rivalId };
    });
  }
  async function fileAnswer(t: Harness, cid: string, items: unknown[]) {
    const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: GOOGLE_REVIEWS_OPERATION, family: "Business Data", mode: "QUEUED", status: "READY", tag: cid,
      taskArgsJson: JSON.stringify(googleReviewsParams(cid, 10)), resultJson: JSON.stringify([{ reviews_count: items.length, items }]),
      attempts: 0, costUsd: 0.00075, sandbox: false, submittedAt: Date.now(), completedAt: Date.now(),
    } as never));
    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId });
  }
  const partsOf = (t: Harness, listingId: Id<"listings">) => t.run(async (ctx) => await ctx.db.query("listingReviewParts").withIndex("by_listing_part", (q) => q.eq("listingId", listingId)).collect());

  test("own reviews keep their words, a rival's only their figures, and the listing's light reading follows", async () => {
    const t = harness();
    const { officeId, rivalId } = await company(t);
    const items = [google("a", "2026-10-05"), google("b", "2026-09-01", { owner_answer: "Thanks", owner_timestamp: "2026-09-03 09:00:00 +00:00", owner_time_ago: "a month ago" })];
    await fileAnswer(t, "17195342752822652591", items);
    await fileAnswer(t, "11130894354104863534", items);

    const [own] = await partsOf(t, officeId);
    expect(own.texts).toEqual(["Review a", "Review b"]);
    const [rival] = await partsOf(t, rivalId);
    expect(rival.texts).toBeUndefined();
    expect(rival.names).toBeUndefined();
    const office = await t.run(async (ctx) => await ctx.db.get(officeId));
    expect(office).toMatchObject({ reviews: 2, reviewsHeld: 2, reviewsAnswered: 1, reviewsRecheck: 1 });

    // The same answer again writes nothing.
    vi.advanceTimersByTime(60_000);
    await fileAnswer(t, "17195342752822652591", items);
    expect((await partsOf(t, officeId))[0].updatedAt).toBe(own.updatedAt);
  });
});
