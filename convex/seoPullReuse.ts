import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * A pull with this key that can still be used, re-opening one that was refused.
 *
 * Reuse must never hand back a failure as if it were an answer: a cycle that
 * found yesterday-style FAILED rows by key and pointed its lines at them would
 * be blocked from retrying for the rest of the day. So a failed pull is
 * re-opened in place — **but only when nothing was bought**: no task id, or a
 * live call that cost nothing (a supplier's refusal carries one, 2026-09-29).
 * Asking again is free. A submitted task was paid for, and re-posting it is
 * buying the same data twice, so that one is left alone and the sweep fetches
 * its result instead.
 */
export async function reusableByKey(
  ctx: MutationCtx,
  idempotencyKey: string,
): Promise<Doc<"seoDataPulls"> | null> {
  // A sandbox answer is made up, so it is never served to a live run — the
  // switch can be flipped mid-day, and the key carries only the date.
  const existing = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .filter((q) => q.neq(q.field("sandbox"), true))
    .first();
  if (!existing) return null;
  if (existing.status !== "FAILED") return existing;
  if (existing.taskId && !(existing.mode === "LIVE" && existing.costUsd === 0)) return existing;

  await ctx.db.patch(existing._id, {
    status: "PENDING",
    attempts: 0,
    error: undefined,
    dueAt: Date.now(),
    sentAt: undefined,
    // The refusal's completion time would otherwise outlive the refusal and
    // show as "when" on the screen for the retry.
    completedAt: undefined,
    claimedBy: undefined,
    claimedAt: undefined,
    taskId: undefined, retryUntil: undefined,
  });
  return { ...existing, status: "PENDING", error: undefined, completedAt: undefined, taskId: undefined, retryUntil: undefined };
}
