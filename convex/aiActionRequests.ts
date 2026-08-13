import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { assertWithinAiActionRateLimit } from "./aiActionRequestService";

const aiActionNameValidator = v.union(
  v.literal("transcribeAudio"),
  v.literal("synthesizeSpeech"),
  v.literal("realtimeVoiceSession"),
  v.literal("generateNodeConfig")
);

export const reserve = internalMutation({
  args: {
    actorId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    actionName: aiActionNameValidator,
    windowMs: v.number(),
    maxRequests: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const recentRequests = await ctx.db
      .query("aiActionRequests")
      .withIndex("by_actor_action_requested", (q) => q.eq("actorId", args.actorId).eq("actionName", args.actionName))
      .order("desc")
      .take(args.maxRequests);

    assertWithinAiActionRateLimit(recentRequests, {
      now,
      windowMs: args.windowMs,
      maxRequests: args.maxRequests,
    });

    await ctx.db.insert("aiActionRequests", {
      actorId: args.actorId,
      companyId: args.companyId,
      actionName: args.actionName,
      requestedAt: now,
    });
  },
});
