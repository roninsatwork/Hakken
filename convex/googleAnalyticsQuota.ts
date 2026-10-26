import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * What Google last said is left of a website's allowances, kept on its
 * connection (`quotaSeen`; ga-stored-figures-plan.md SF18; AGENTS.md,
 * "Respect Google's quotas"): each answer's count written as it comes, and
 * read by the next session to start from (`openSession`, `quotaStillSeen`),
 * so no first ask of a step, a fill or a resumed run is made blind.
 */

export const quotaFields = {
  tokensPerDay: v.union(v.number(), v.null()),
  tokensPerHour: v.union(v.number(), v.null()),
  tokensPerProjectPerHour: v.union(v.number(), v.null()),
  thresholdedPerHour: v.union(v.number(), v.null()),
};

/** What Google last said is left for the website, and when; null before any answer said. */
export const quotaSeenOf = internalQuery({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  returns: v.union(v.object({ at: v.number(), ...quotaFields }), v.null()),
  handler: async (ctx, args) => (await ctx.db.get(args.connectionId))?.quotaSeen ?? null,
});

/** Each answer's count of what is left, kept on the connection for the next session to start from. */
export const noteQuota = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), quota: v.object(quotaFields) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    await ctx.db.patch(connection._id, { quotaSeen: { at: Date.now(), ...args.quota } });
    return null;
  },
});
