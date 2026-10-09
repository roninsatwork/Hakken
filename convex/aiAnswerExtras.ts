import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { aiEngineValidator } from "./seoAiEngines";

/**
 * What an app showed beside one answer (`aiAppSchema.ts`): written once per
 * answer, replacing any earlier filing of the same purchase, and cleared with
 * the answer's wording after 90 days (`siteAnswers.deleteAnswerText`).
 */
export const writeAnswerExtras = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    prompt: v.string(),
    engine: aiEngineValidator,
    locationCode: v.number(),
    day: v.string(),
    businesses: v.array(v.object({
      name: v.string(),
      host: v.optional(v.string()),
      rating: v.optional(v.number()),
      reviews: v.optional(v.number()),
      address: v.optional(v.string()),
    })),
    read: v.array(v.string()),
    searches: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await ctx.db.query("aiAnswerExtras").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).first();
    if (held) await ctx.db.replace(held._id, args);
    else await ctx.db.insert("aiAnswerExtras", args);
    return null;
  },
});
