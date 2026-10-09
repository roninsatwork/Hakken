import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { readReviews } from "./localReviews";
import { partIsOn } from "./collectionParts";
import { resolvePlatformName } from "./settingsService";
import { REPLIER, REPLIES_A_TURN } from "./utils/reviewReplier";

/**
 * Replies drafted for a company's reviews still waiting (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, step 2; drawn on "What customers
 * say"): which to draft, and keeping them — each the company's own, read
 * through its hold. The drafting is `reviewReplyActions.ts`.
 */

/** A website's drafts read at once: its reviews still waiting, far past a busy month. */
const DRAFTS_READ = 500;

/** Idempotent: the replier's agent, created once and kept in step, never overwriting its switch. */
export const ensureReplierInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const platformName = resolvePlatformName((await ctx.db.query("systemSettings").first())?.platformName);
    const definition = {
      name: REPLIER.nameFor(platformName),
      description: REPLIER.description,
      systemPrompt: REPLIER.systemPrompt,
      standingObjective: REPLIER.standingObjective,
    };
    const existing = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", REPLIER.systemKey)).first();
    if (!existing) {
      await ctx.db.insert("agents", {
        ...definition,
        systemKey: REPLIER.systemKey,
        modelId: "chat (resolved at run time)",
        thinkingMode: false,
        isActive: true,
        isGlobal: true,
        createdAt: now,
        updatedAt: now,
      });
      return null;
    }
    if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    return null;
  },
});

/**
 * The reviews to draft a reply for: on each website calling the listing its
 * own whose company has Reviews on, the newest still waiting with words and
 * no draft yet — a few a turn. Only while the replier's agent is switched on.
 */
export const repliesToDraft = internalQuery({
  args: { listingId: v.id("listings") },
  returns: v.array(v.object({
    companyWebsiteId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    business: v.string(),
    reviews: v.array(v.object({ id: v.string(), stars: v.number(), text: v.string(), name: v.union(v.string(), v.null()), day: v.string() })),
  })),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", REPLIER.systemKey)).first();
    if (!listing || agent?.isActive === false) return [];
    const waiting = (await readReviews(ctx, args.listingId)).filter((review) => review.text && !review.replyDay);
    const links = (await ctx.db.query("holdListings").withIndex("by_listing", (q) => q.eq("listingId", args.listingId)).take(50))
      .filter((link) => link.role === "OWN");
    const jobs = [];
    for (const link of links) {
      if (!(await partIsOn(ctx, link.companyId, "reviews"))) continue;
      const drafted = new Set((await ctx.db.query("reviewReplyDrafts").withIndex("by_hold", (q) => q.eq("companyWebsiteId", link.companyWebsiteId)).take(DRAFTS_READ))
        .map((draft) => draft.reviewId));
      const reviews = waiting.filter((review) => !drafted.has(review.id)).slice(0, REPLIES_A_TURN);
      if (reviews.length === 0) continue;
      jobs.push({
        companyWebsiteId: link.companyWebsiteId,
        companyId: link.companyId,
        business: listing.name,
        reviews: reviews.map((review) => ({ id: review.id, stars: review.stars, text: review.text!, name: review.name ?? null, day: review.day })),
      });
    }
    return jobs;
  },
});

/** A drafted reply kept for its company, replacing any earlier draft for the same review. */
export const writeReplyDraft = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), listingId: v.id("listings"), reviewId: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await ctx.db
      .query("reviewReplyDrafts")
      .withIndex("by_hold_review", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("reviewId", args.reviewId))
      .first();
    const fields = { companyWebsiteId: args.companyWebsiteId, listingId: args.listingId as Id<"listings">, reviewId: args.reviewId, text: args.text, draftedAt: Date.now() };
    if (held) await ctx.db.replace(held._id, fields);
    else await ctx.db.insert("reviewReplyDrafts", fields);
    return null;
  },
});
