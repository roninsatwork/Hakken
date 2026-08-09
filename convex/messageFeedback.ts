/**
 * End-user ratings on assistant chat messages (self-improvement plan, Phase 3).
 *
 * This is the chat path's outcome signal: dashboard and widget answers have
 * no agent run, so until this existed the people actually using the
 * assistant had no way to teach it anything. A rating never changes an
 * answer by itself — it feeds the company memory sweep (which proposes, for
 * review) and the memory feedback counters (which reorder, within the
 * ranking cap). Comment text is untrusted user content: stored, shown to
 * admins as text, never placed in a prompt.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { getSelfImprovementConfig } from "./selfImprovementConfig";

const COMMENT_LIMIT = 500;
/**
 * Ratings counted per user per day. Past the cap a rating is still accepted —
 * the reader is not punished — but stops feeding the learning loops, so one
 * account cannot flood the signal (deliberately or through a stuck key).
 */
export const MESSAGE_FEEDBACK_DAILY_CAP = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const THREAD_FEEDBACK_LIMIT = 200;

const ratingValidator = v.union(v.literal("POSITIVE"), v.literal("NEGATIVE"));
const labelValidator = v.union(
  v.literal("GREAT_ANSWER"),
  v.literal("INCORRECT"),
  v.literal("MISSED_CONTEXT"),
  v.literal("UNHELPFUL")
);

type FeedbackLabel = "GREAT_ANSWER" | "INCORRECT" | "MISSED_CONTEXT" | "UNHELPFUL";

function normalizeComment(comment?: string) {
  const trimmed = comment?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, COMMENT_LIMIT);
}

/** The memory ids behind the rated answer, from the message's evidence trail. */
function parseMemoryEvidenceIds(value: string | undefined): Id<"companyMemories">[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { memories?: unknown };
    if (!Array.isArray(parsed?.memories)) return [];
    return parsed.memories
      .map((memory) => (memory as { memoryId?: unknown })?.memoryId)
      .filter((memoryId): memoryId is Id<"companyMemories"> => typeof memoryId === "string");
  } catch {
    return [];
  }
}

/**
 * Move the feedback counters on every memory the rated answer leaned on.
 * `previous` is the rating being replaced, so a changed mind moves the count
 * across rather than stacking both sides.
 */
async function adjustMemoryFeedbackCounters(
  ctx: Pick<MutationCtx, "db">,
  args: {
    message: Doc<"messages">;
    next?: "POSITIVE" | "NEGATIVE";
    previous?: "POSITIVE" | "NEGATIVE";
  },
) {
  if (args.next === args.previous) return;
  const memoryIds = parseMemoryEvidenceIds(args.message.companyMemoryEvidenceJson);
  if (memoryIds.length === 0) return;
  const now = Date.now();

  for (const memoryId of memoryIds) {
    const memory = await ctx.db.get(memoryId);
    if (!memory) continue;
    let positive = memory.positiveFeedbackCount ?? 0;
    let negative = memory.negativeFeedbackCount ?? 0;
    if (args.previous === "POSITIVE") positive = Math.max(0, positive - 1);
    if (args.previous === "NEGATIVE") negative = Math.max(0, negative - 1);
    if (args.next === "POSITIVE") positive += 1;
    if (args.next === "NEGATIVE") negative += 1;
    await ctx.db.patch(memoryId, {
      positiveFeedbackCount: positive,
      negativeFeedbackCount: negative,
      lastFeedbackAt: now,
    });
  }
}

export const upsertForMessage = tenantMutation({
  args: {
    messageId: v.id("messages"),
    rating: ratingValidator,
    labels: v.optional(v.array(labelValidator)),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    // The switch stops collection, not just the buttons — a stale client
    // that still shows them must not keep writing.
    const config = await getSelfImprovementConfig(ctx.db);
    if (!config.endUserFeedback) throw new Error("Feedback is switched off");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.role !== "assistant") throw new Error("Only assistant messages can be rated");

    const thread = await ctx.db.get(message.threadId);
    if (!thread) throw new Error("Thread not found");
    // Ownership, not role: you rate the answers you were given. Admins have
    // the observability screens for everything else.
    if (thread.userId !== userId) throw new Error("Unauthorized");
    if (user.role !== "SUPER_ADMIN" && message.companyId && message.companyId !== ctx.companyId) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    const labels = Array.from(new Set<FeedbackLabel>(args.labels ?? []));
    const comment = normalizeComment(args.comment);

    const existing = await ctx.db
      .query("messageFeedback")
      .withIndex("by_message_user", (q) => q.eq("messageId", args.messageId).eq("userId", userId))
      .unique();

    if (existing) {
      // A changed mind reuses the row's original cap decision: flipping a
      // rating is not a new day's worth of signal.
      if (existing.countsTowardLearning) {
        await adjustMemoryFeedbackCounters(ctx, {
          message,
          previous: existing.rating,
          next: args.rating,
        });
      }
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        labels,
        comment,
        updatedAt: now,
      });
      return existing._id;
    }

    const countedToday = (await ctx.db
      .query("messageFeedback")
      .withIndex("by_user_created", (q) => q.eq("userId", userId).gte("createdAt", now - DAY_MS))
      .take(MESSAGE_FEEDBACK_DAILY_CAP + 1))
      .filter((row) => row.countsTowardLearning)
      .length;
    const countsTowardLearning = countedToday < MESSAGE_FEEDBACK_DAILY_CAP;

    if (countsTowardLearning) {
      await adjustMemoryFeedbackCounters(ctx, { message, next: args.rating });
    }

    return await ctx.db.insert("messageFeedback", {
      messageId: args.messageId,
      threadId: message.threadId,
      companyId: message.companyId ?? thread.companyId,
      userId,
      rating: args.rating,
      labels,
      comment,
      countsTowardLearning,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Everything the chat surface needs to draw the rating controls in one
 * subscription: whether the switch is on at all, and the caller's own
 * ratings in this thread. Scoped hard to the thread owner — the same rule
 * as writing.
 */
export const getMineForThread = tenantQuery({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const config = await getSelfImprovementConfig(ctx.db);
    if (!config.endUserFeedback) return { enabled: false, ratings: [] };

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) return { enabled: true, ratings: [] };

    const rows = await ctx.db
      .query("messageFeedback")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(THREAD_FEEDBACK_LIMIT);

    return {
      enabled: true,
      ratings: rows
        .filter((row) => row.userId === userId)
        .map((row) => ({
          messageId: row.messageId,
          rating: row.rating,
          labels: row.labels,
        })),
    };
  },
});
