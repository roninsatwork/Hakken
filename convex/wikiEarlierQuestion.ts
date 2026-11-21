import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * The asker's previous question in a conversation, so the wiki's page chooser reads a follow-up ("what did he do for
 * them?") with what "them" meant (Sonae `187a0aac`; wiki-sonae-catch-up-plan-2026-11-21.md, 1.3). Sonae's chat passes it
 * in; Hakken's questions reach the chooser from several places (the Assistant, voice, agents), so the chooser reads it here
 * from the conversation it already knows. The question being answered may already be saved, so it's passed over.
 */
export const earlierQuestionInternal = internalQuery({
  args: { threadId: v.id("threads"), question: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(8);
    const asked = args.question.trim();
    const earlier = latest.find((message) => message.role === "user" && message.content.trim() && message.content.trim() !== asked);
    return earlier ? earlier.content.trim().slice(0, 400) : null;
  },
});
