import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation } from "./_generated/server";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import * as platformShapes from "./utils/platformShapes";
import { appError } from "./utils/appError";

/**
 * The platform telling one person that something happened.
 *
 * Before this, the only way Sonae could reach anybody was email, so a task
 * assigned, an approval waiting or a run that failed had nowhere to land
 * inside the product.
 *
 * A notification belongs to exactly one person. Read state is theirs alone —
 * there is no shared "seen" flag anywhere here, because marking your own copy
 * read must never clear a colleague's. Only `notifyUserInternal` writes, and
 * it is called by the thing that actually happened, so a notification cannot
 * claim an event that never occurred.
 *
 * In-app only. Email already exists and has its own plan.
 */

/**
 * The badge counts up to here and then says "more".
 *
 * An exact count of a thousand unread items costs a thousand-row read to tell
 * somebody what "lots" already tells them.
 */
export const UNREAD_COUNT_LIMIT = 50;

export const listMine = tenantQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: platformShapes.notificationPageShape,
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const countMineUnread = tenantQuery({
  args: {},
  returns: platformShapes.unreadCountShape,
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", ctx.userId).eq("readAt", undefined))
      .take(UNREAD_COUNT_LIMIT + 1);

    return {
      count: Math.min(unread.length, UNREAD_COUNT_LIMIT),
      atLimit: unread.length > UNREAD_COUNT_LIMIT,
    };
  },
});

export const markRead = tenantMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    // Checked against the row's own owner, not the tenant: two colleagues in
    // one workspace still have separate inboxes.
    if (!notification || notification.userId !== ctx.userId) {
      throw appError("NOT_FOUND", "That notification could not be found.");
    }
    if (notification.readAt) return;

    await ctx.db.patch(args.notificationId, { readAt: Date.now() });
  },
});

export const markAllMineRead = tenantMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", ctx.userId).eq("readAt", undefined))
      .take(200);

    const readAt = Date.now();
    for (const notification of unread) {
      await ctx.db.patch(notification._id, { readAt });
    }

    return unread.length;
  },
});

/** The only writer. Called by the thing that happened. */
export const notifyUserInternal = internalMutation({
  args: {
    userId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    kind: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (!title) throw appError("INVALID_INPUT", "A notification needs a title.");

    return await ctx.db.insert("notifications", {
      userId: args.userId,
      companyId: args.companyId,
      kind: args.kind,
      title,
      body: args.body?.trim() || undefined,
      href: args.href,
      createdAt: Date.now(),
    });
  },
});
