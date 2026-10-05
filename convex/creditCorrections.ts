import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { DEFAULT_PLAN_CREDITS, FIRST_PLAN_CREDITS, creditMonthOf } from "./creditKinds";
import { raisePlanBatch } from "./creditLedger";

/**
 * One-off corrections to the credit record, each run by hand once on a
 * deployment after the change it belongs to is deployed
 * (docs/plans/active/finish-off-plan.md). Each is paged: a page per
 * transaction, the next page booked by the one before, so none reads a whole
 * table at once — and each can be run again without doing its work twice.
 */

/** Batches raised in one transaction. */
const RAISE_PAGE = 100;

/**
 * A platform setting saved before 10,000 became the default holds the first
 * placeholder, 1,000 — `saveCreditPrices` wrote it beside "what a credit
 * covers" — and would keep every company at 1,000. Raised to the new default,
 * audited with no person behind it.
 */
async function raiseStoredPlaceholder(ctx: MutationCtx, now: number): Promise<boolean> {
  const settings = await ctx.db.query("creditSettings").withIndex("by_key", (q) => q.eq("key", "platform")).first();
  if (!settings || settings.planCredits !== FIRST_PLAN_CREDITS) return false;
  await ctx.db.patch(settings._id, { planCredits: DEFAULT_PLAN_CREDITS, updatedAt: now });
  await ctx.db.insert("auditLogs", {
    actionType: "CREDIT_PRICES_CHANGED",
    entityType: "creditPrices",
    timestamp: now,
    metadata: JSON.stringify({
      changes: [{ field: "planCredits", from: FIRST_PLAN_CREDITS, to: DEFAULT_PLAN_CREDITS }],
      why: "10,000 credits a month, for now (finish-off-plan.md, item 3a)",
    }),
  });
  return true;
}

/**
 * 10,000 credits a month, for now (finish-off-plan.md, item 3a): this month's
 * plan batches, already granted at 1,000, raised to what each company's plan
 * gives now — its plan's own number, else the platform's. Each raise is a
 * grant line of its own on the company's statement ("October's plan credits
 * raised, from 1,000"), so every balance after it still adds up. Run once,
 * with no arguments: `npx convex run creditCorrections:raisePlanCredits`.
 * A second run finds nothing to raise.
 */
export const raisePlanCredits = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ settingRaised: v.boolean(), raised: v.number(), credits: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const settingRaised = args.cursor ? false : await raiseStoredPlaceholder(ctx, now);
    // Every open plan batch of this month ends at the same UK midnight; a top-up's ends a year on.
    const { endsAt } = creditMonthOf(now);
    const page = await ctx.db
      .query("creditBatches")
      .withIndex("by_state_ends", (q) => q.eq("state", "open").eq("endsAt", endsAt))
      .paginate({ cursor: args.cursor ?? null, numItems: RAISE_PAGE });
    let raised = 0;
    let credits = 0;
    for (const batch of page.page) {
      const extra = await raisePlanBatch(ctx, batch, now);
      if (extra > 0) {
        raised += 1;
        credits += extra;
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.creditCorrections.raisePlanCredits, { cursor: page.continueCursor });
    return { settingRaised, raised, credits, done: page.isDone };
  },
});
