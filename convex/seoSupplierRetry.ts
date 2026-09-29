import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { countSettled, recordCollectorCall } from "./seoCollectionQueue";
import { SEO_SUPPLIER_RETRY_WAITS_MS } from "./seoCollectionPolicy";

/**
 * Ask again, later in this Collector run, requests DataForSEO's own supplier
 * refused and charged nothing for — Google, over its limit for DataForSEO,
 * refused all ten of Ronins' questions to its engine on 2026-09-29, and each
 * was failed at once (Anthony: "don't we retry but slower").
 *
 * Each goes back to `PENDING`, due after the next of
 * `SEO_SUPPLIER_RETRY_WAITS_MS`, and the rest of the queue carries on
 * meanwhile. `retryUntil` is the run's end: the Collector waits for what
 * comes due before it, and a retry it can no longer wait for is failed now,
 * as one refused after the last wait is — the next night's run asks again.
 * Never later: that run plans its own request, and the two would both be
 * bought.
 */
export const retrySupplierRefusals = internalMutation({
  args: {
    pullIds: v.array(v.id("seoDataPulls")),
    reason: v.string(),
    retryUntil: v.number(),
    runId: v.optional(v.id("agentRuns")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const pullId of args.pullIds) {
      const row = await ctx.db.get(pullId);
      if (!row || row.status !== "CLAIMED") continue;

      const tries = (row.attempts ?? 0) + 1;
      const wait: number | undefined = SEO_SUPPLIER_RETRY_WAITS_MS[tries - 1];
      if (wait === undefined || now + wait > args.retryUntil) {
        const error = `${args.reason} Asked ${tries} ${tries === 1 ? "time" : "times"} in this run; the next run asks again.`;
        await ctx.db.patch(pullId, {
          status: "FAILED",
          attempts: tries,
          error,
          completedAt: now,
          retryUntil: undefined,
          claimedBy: undefined,
          claimedAt: undefined,
          postedAt: undefined,
        });
        await countSettled(ctx, row, "FAILED", 0, "SEND");
        if (args.runId) await recordCollectorCall(ctx, args.runId, row, "FAILED", 0, error);
        continue;
      }

      await ctx.db.patch(pullId, {
        status: "PENDING",
        attempts: tries,
        dueAt: now + wait,
        retryUntil: args.retryUntil,
        claimedBy: undefined,
        claimedAt: undefined,
        postedAt: undefined,
      });
    }
    return null;
  },
});
