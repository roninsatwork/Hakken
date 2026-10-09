import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { prepareDecisions, runDecisions } from "./decisionActions";
import { readReviews, writeReviews } from "./localReviews";

/**
 * What customers say, read from a company's own reviews (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, step 2): each new review read once
 * by the Decision Maker against the words Google picks out of the listing's
 * reviews (`listings.profile.topics`) — one request a review and topic, a few
 * at once — and what it praises and complains about kept on the review
 * (`listingReviewParts.topics`), never asked again. One request a review with
 * a question a topic gave every topic the same answer (2026-10-09): the topic
 * is in each request's own state instead.
 *
 * Off asks nothing and records nothing (`discovery.review-topic` ships off, as
 * every Decision does): the reviews wait, unread, until an admin switches it
 * on. A review is read once its answers come back; one the model could not
 * answer waits for the next filing.
 */

export const REVIEW_TOPIC_DECISION = "discovery.review-topic";

/** Reviews read in one turn, then the next turn is booked: at most 96 requests, a minute's work. */
const REVIEWS_A_TURN = 8;
/** Requests at once: each its own, as the SEO judges ask (`seoJudgments.ts`, 2026-09-23). */
const AT_ONCE = 12;
/** Topics a review is read against: the ones Google sees most. */
const TOPICS_READ = 12;

export const reviewsToRead = internalQuery({
  args: { listingId: v.id("listings"), limit: v.number() },
  returns: v.union(v.null(), v.object({
    companyId: v.id("companies"),
    business: v.string(),
    topics: v.array(v.string()),
    reviews: v.array(v.object({ id: v.string(), stars: v.number(), text: v.string() })),
    more: v.boolean(),
  })),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing) return null;
    const own = (await ctx.db.query("holdListings").withIndex("by_listing", (q) => q.eq("listingId", args.listingId)).take(50))
      .find((link) => link.role === "OWN");
    if (!own) return null;
    const unread = (await readReviews(ctx, args.listingId)).filter((review) => review.text && review.topics === undefined);
    return {
      companyId: own.companyId,
      business: listing.name,
      topics: (listing.profile?.topics ?? []).slice(0, TOPICS_READ).map((entry) => entry.topic),
      reviews: unread.slice(0, args.limit).map((review) => ({ id: review.id, stars: review.stars, text: review.text! })),
      more: unread.length > args.limit,
    };
  },
});

/** What was read in each review, kept on it. */
export const writeReviewTopics = internalMutation({
  args: { listingId: v.id("listings"), read: v.array(v.object({ id: v.string(), topics: v.string() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const marks = new Map(args.read.map((entry) => [entry.id, entry.topics]));
    const reviews = await readReviews(ctx, args.listingId);
    await writeReviews(ctx, args.listingId, reviews.map((review) => (marks.has(review.id) ? { ...review, topics: marks.get(review.id)! } : review)));
    return null;
  },
});

/**
 * Forget what was read in a listing's reviews and read them again — after the
 * reading itself changes, as it did on 2026-10-09. Run by hand:
 *
 *   npx convex run reviewJudging:readAgain '{"listingId":"…"}'
 */
export const readAgain = internalMutation({
  args: { listingId: v.id("listings") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const reviews = await readReviews(ctx, args.listingId);
    const forgotten = reviews.filter((review) => review.topics !== undefined).length;
    await writeReviews(ctx, args.listingId, reviews.map(({ topics: _topics, ...review }) => review));
    await ctx.scheduler.runAfter(0, internal.reviewJudging.readNewReviews, { listingId: args.listingId });
    return forgotten;
  },
});

export const readNewReviews = internalAction({
  args: { listingId: v.id("listings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.reviewJudging.reviewsToRead, { listingId: args.listingId, limit: REVIEWS_A_TURN });
    if (!job || job.reviews.length === 0) return null;
    const modes: Record<string, string> = await ctx.runQuery(internal.decisionRuns.resolveModesInternal, {
      decisionKeys: [REVIEW_TOPIC_DECISION],
      companyId: job.companyId,
    });
    if (!modes[REVIEW_TOPIC_DECISION] || modes[REVIEW_TOPIC_DECISION] === "OFF") return null;

    // A listing Google picks no words out of has nothing to read its reviews against.
    if (job.topics.length === 0) {
      await ctx.runMutation(internal.reviewJudging.writeReviewTopics, { listingId: args.listingId, read: job.reviews.map((review) => ({ id: review.id, topics: "" })) });
      return null;
    }
    const prepared = await prepareDecisions(ctx, { keys: [REVIEW_TOPIC_DECISION], companyId: job.companyId });
    const asks = job.reviews.flatMap((review) => job.topics.map((topic) => ({ review, topic })));
    const marks = new Map<string, { fromModel: boolean; answered: number; marks: string[] }>();
    for (let at = 0; at < asks.length; at += AT_ONCE) {
      const answers = await Promise.all(asks.slice(at, at + AT_ONCE).map(async ({ review, topic }) => {
        const results = await runDecisions(ctx, {
          companyId: job.companyId as Id<"companies">,
          subject: { kind: "listingReview", id: review.id.slice(0, 200) },
          state: {
            business: { name: job.business },
            review: { stars: review.stars, text: review.text },
            topic,
          },
          requests: [{ key: REVIEW_TOPIC_DECISION, fallback: () => ({ kind: "pick-one" as const, choice: "not_mentioned" }) }],
          prepared,
        });
        const result = results[REVIEW_TOPIC_DECISION];
        const mark = !result || result.verdict !== "ACT" || result.answer.kind !== "pick-one" ? null
          : result.answer.choice === "praises" ? `${topic}+` : result.answer.choice === "complains" ? `${topic}-` : null;
        return { id: review.id, fromModel: Boolean(result && result.source !== "RULES"), mark };
      }));
      for (const answer of answers) {
        const held = marks.get(answer.id) ?? { fromModel: true, answered: 0, marks: [] };
        held.fromModel &&= answer.fromModel;
        held.answered += 1;
        if (answer.mark) held.marks.push(answer.mark);
        marks.set(answer.id, held);
      }
      // No model answered a whole round: the reviews wait for the next filing, unread.
      if (!answers.some((answer) => answer.fromModel)) break;
    }
    // A review is read once every one of its topics had the model's answer.
    const read = [...marks.entries()]
      .filter(([, held]) => held.fromModel && held.answered === job.topics.length)
      .map(([id, held]) => ({ id, topics: held.marks.join("|") }));
    const answeredByModel = read.length > 0;
    if (read.length > 0) await ctx.runMutation(internal.reviewJudging.writeReviewTopics, { listingId: args.listingId, read });
    if (answeredByModel && job.more) await ctx.scheduler.runAfter(0, internal.reviewJudging.readNewReviews, { listingId: args.listingId });
    return null;
  },
});
