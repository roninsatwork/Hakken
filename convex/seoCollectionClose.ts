import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { superAdminMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { finishSeoCycle } from "./seoCollectionQueue";

/**
 * Closing a collection run by hand, for a collection that will not finish on
 * its own (Anthony, 2026-09-25: "is there a way to manually close it"). Its
 * own module beside the queue (`seoCollectionQueue.ts`), whose finishing it
 * shares: a closed run is finished exactly as one that ran its course.
 */

/** Unsent requests taken off the queue per pass when a run is closed by hand. */
const CLOSE_PAGE = 200;

/**
 * Plan lines read per request as it is taken off the queue: one as a rule,
 * one per company for a shared request, one per host for a bulk one.
 */
const LINES_PER_REQUEST = 500;

/** Statuses a collection is still open in. */
const OPEN_CYCLE_STATUSES = new Set(["EXPANDING", "SENDING", "COLLECTING"]);

/**
 * Close a collection run by hand (Anthony, 2026-09-25: "is there a way to
 * manually close it"). Requests not yet sent come off the queue with their
 * plan lines — nothing was bought for them — so nothing more is bought for the
 * run; a work list still being written stops, since expansion only writes to
 * a run that is still expanding. Requests out with DataForSEO are left: their
 * answers were paid for and are filed when they come. Then the run is finished
 * like any other, saying who closed it and how many requests came off.
 */
export const closeCollectionRun = superAdminMutation({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) throw appError("NOT_FOUND", "That collection run no longer exists.");
    if (!OPEN_CYCLE_STATUSES.has(cycle.status)) throw appError("CONFLICT", "This collection run is already closed.");
    await takeOffQueueThenFinish(ctx, args.cycleId, ctx.userId, 0);
    return null;
  },
});

/** A close with more unsent requests than one pass takes, carried on. */
export const continueClosingRun = internalMutation({
  args: { cycleId: v.id("seoCollectionCycles"), userId: v.id("users"), removedSoFar: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle || !OPEN_CYCLE_STATUSES.has(cycle.status)) return null;
    await takeOffQueueThenFinish(ctx, args.cycleId, args.userId, args.removedSoFar);
    return null;
  },
});

/**
 * Take a request that was never sent off one run's queue, with that run's
 * plan lines — and only that run's. A request can be shared: another
 * company's run that needed the same answer points its own line at it rather
 * than buying it again (`reusableByKey` in `seoCollection.ts`). A request
 * another run still needs stays in the queue and moves to that run, so it is
 * still sent, and still counted where it is waited for; one nobody else needs
 * is deleted. Only for a request never sent: nothing was bought for it.
 */
export async function dropUnsentRequest(
  ctx: MutationCtx,
  pullId: Id<"seoDataPulls">,
  cycleId: Id<"seoCollectionCycles">,
): Promise<"DELETED" | "MOVED" | "KEPT"> {
  const lines = await ctx.db
    .query("seoCycleLines")
    .withIndex("by_pull", (q) => q.eq("pullId", pullId))
    .take(LINES_PER_REQUEST);
  let stillNeededBy: Id<"seoCollectionCycles"> | null = null;
  for (const line of lines) {
    if (line.cycleId === cycleId) await ctx.db.delete(line._id);
    else stillNeededBy ??= line.cycleId;
  }
  // More lines than were read may mean more runs than were read: keep it.
  if (!stillNeededBy && lines.length === LINES_PER_REQUEST) return "KEPT";
  if (stillNeededBy) {
    await ctx.db.patch(pullId, { cycleId: stillNeededBy });
    return "MOVED";
  }
  await ctx.db.delete(pullId);
  return "DELETED";
}

async function takeOffQueueThenFinish(
  ctx: MutationCtx,
  cycleId: Id<"seoCollectionCycles">,
  userId: Id<"users">,
  removedSoFar: number,
): Promise<void> {
  const unsent = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_cycle_status", (q) => q.eq("cycleId", cycleId).eq("status", "PENDING"))
    .take(CLOSE_PAGE);
  let removed = removedSoFar;
  for (const pull of unsent) {
    if ((await dropUnsentRequest(ctx, pull._id, cycleId)) === "DELETED") removed += 1;
  }
  if (unsent.length === CLOSE_PAGE) {
    await ctx.scheduler.runAfter(0, internal.seoCollectionClose.continueClosingRun, { cycleId, userId, removedSoFar: removed });
    return;
  }
  await finishSeoCycle(ctx, cycleId, { userId, unsent: removed });
}
