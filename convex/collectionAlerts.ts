import { v } from "convex/values";

import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { creditDayOf } from "./creditKinds";
import { ensureReaderPreferences } from "./readerPreferences";
import { queueOutboxMessage } from "./outbox";
import { startRoleRun } from "./roleRuns";

/**
 * Tell the super admins when collecting stops for something only a person can
 * fix (docs/plans/active/finish-off-plan.md, item 13): today's ceiling for all
 * collecting reached, or DataForSEO refusing the account. "Needs you" showed
 * only on Collection pipeline, so a stop at night went unseen until morning.
 *
 * Each super admin gets it in the bell and by email (the outbox, sent by the
 * Email Sender agent), at most once a UK day for each reason, however often
 * the hourly check finds the same stop.
 */

/** Super admins read to tell. */
const SUPER_ADMINS_READ = 50;

export type NeedsYouKind = "DAY_CEILING" | "ACCOUNT";

export async function alertCollectionNeedsYou(ctx: MutationCtx, kind: NeedsYouKind, reason: string): Promise<number> {
  const day = creditDayOf(Date.now());
  const admins = await ctx.db.query("users").withIndex("by_role_lastLogin", (q) => q.eq("role", "SUPER_ADMIN")).take(SUPER_ADMINS_READ);
  let queued = 0;
  for (const admin of admins) {
    const key = `COLLECTION_NEEDS_YOU:${kind}:${day}:${admin._id}`;
    const preferences = admin.email ? await ensureReaderPreferences(ctx, admin._id) : null;
    const rowId = admin.email
      ? await queueOutboxMessage(ctx, {
        messageType: "COLLECTION_NEEDS_YOU",
        userId: admin._id,
        email: admin.email,
        language: preferences?.language ?? "en",
        payload: { reason, kind },
        idempotencyKey: key,
      })
      : null;
    // The bell once a day for each reason too: the email's key says whether this one is new.
    const already = admin.email && !rowId;
    if (already) continue;
    await ctx.scheduler.runAfter(0, internal.notifications.notifyUserInternal, {
      userId: admin._id,
      kind: "COLLECTION_NEEDS_YOU",
      title: "Collecting stopped: it needs you",
      body: reason,
      href: "/admin/websites/collection",
    });
    if (rowId) queued += 1;
  }
  if (queued > 0) {
    await startRoleRun(ctx, "EMAIL_SENDER", { objective: "Send: collecting needs a person.", title: "Collecting needs you" });
  }
  return queued;
}

/** The Collector's run stopped for a person's fix: tell them. */
export const noteCollectorNeedsYou = internalMutation({
  args: { kind: v.union(v.literal("DAY_CEILING"), v.literal("ACCOUNT")), reason: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => await alertCollectionNeedsYou(ctx, args.kind, args.reason),
});
