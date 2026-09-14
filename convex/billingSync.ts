import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { billingConfig } from "./billingPolicy";
import { stripeClient } from "./billingStripe";
import { reconcileAccount } from "./billingReconciliation";
import { appError } from "./utils/appError";

export const reconcile = internalAction({
  args: { accountId: v.id("billingAccounts") }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const config = await billingConfig(ctx);
    if (!config.enabled) return null;
    const account = await ctx.runMutation(internal.billingState.acquire, args);
    if (!account) return null;
    try { await reconcileAccount(ctx, stripeClient(config), account); }
    catch { throw appError("UPSTREAM_FAILURE", "Stripe billing reconciliation failed; delivery can be retried."); }
    finally { await ctx.runMutation(internal.billingState.release, { accountId: account._id, revision: account.revision }); }
    return null;
  },
});

/** Indexed oldest-first batches repair missed notifications without an unbounded tenant scan. */
export const scheduleReconciliation = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const config = await billingConfig(ctx);
    if (!config.enabled) return null;
    const accounts = await ctx.db.query("billingAccounts").withIndex("by_synced", q => q.lt("syncedAt", Date.now() - 15 * 60_000)).take(25);
    for (const [index, account] of accounts.entries()) {
      await ctx.scheduler.runAfter(index * 1_000, internal.billingSync.reconcile, { accountId: account._id });
    }
    return null;
  },
});
