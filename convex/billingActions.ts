import { ConvexError, v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { adminAction } from "./tenantFunctions";
import { billingCompany, requireBillingConfig, safeStripeUrl } from "./billingPolicy";
import { stripeClient, validatePortal, validateRecoveryPortal } from "./billingStripe";
import { ensureCustomer, checkoutUrl } from "./billingCheckout";
import { reconcileAccount } from "./billingReconciliation";
import { appError } from "./utils/appError";

async function withAccount<T>(ctx: ActionCtx, userId: Id<"users">, enroll: boolean, work: (account: Doc<"billingAccounts">) => Promise<T>, offerKey?: string): Promise<T> {
  const account = await ctx.runMutation(internal.billingState.acquire, { userId, enroll, ...(offerKey ? { offerKey } : {}) });
  if (!account) throw appError("NOT_FOUND", "This company has no Stripe billing account.");
  try { return await work(account); }
  catch (error) {
    if (error instanceof ConvexError) throw error;
    // Stripe errors can contain request details. Keep credentials and provider internals off the wire.
    throw appError("UPSTREAM_FAILURE", "Stripe could not complete the request. Retry, or contact your operator if it persists.");
  } finally {
    await ctx.runMutation(internal.billingState.release, { accountId: account._id, revision: account.revision });
  }
}

export const createCheckout = adminAction({
  args: { offerKey: v.string() }, returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    billingCompany(ctx.user);
    const config = (await requireBillingConfig(ctx));
    const offer = config.offers.find(o => o.key === args.offerKey);
    if (!offer) throw appError("INVALID_INPUT", "This subscription offer is not available.");
    const stripe = stripeClient(config);
    try {
      await validatePortal(stripe, await ctx.runQuery(internal.billingState.getOffers, {}), config);
      await validateRecoveryPortal(stripe, config);
    }
    catch (error) {
      if (error instanceof ConvexError) throw error;
      throw appError("UPSTREAM_FAILURE", "Stripe configuration could not be verified. Please retry.");
    }
    return withAccount(ctx, ctx.userId, true, async initial => {
      const account = await ensureCustomer(ctx, stripe, initial);
      const state = await reconcileAccount(ctx, stripe, account);
      if (!state.mayCheckout) throw appError("CONFLICT", "A subscription already exists or needs review. Use the billing portal to manage it.");
      return checkoutUrl(ctx, stripe, account, args.offerKey);
    }, args.offerKey);
  },
});

export const createPortal = adminAction({
  args: {}, returns: v.string(),
  handler: async (ctx): Promise<string> => {
    billingCompany(ctx.user);
    const config = (await requireBillingConfig(ctx));
    const stripe = stripeClient(config);
    return withAccount(ctx, ctx.userId, false, async account => {
      if (!account.customerId) throw appError("CONFLICT", "Complete billing setup before opening the portal.");
      const offers = await ctx.runQuery(internal.billingState.getOffers, {});
      let configuration: string;
      try { configuration = await validatePortal(stripe, offers, config); }
      catch {
        // Use a separately validated configuration: never loosen the sale
        // catalog checks, or mutate a shared Stripe configuration on a visit.
        configuration = await validateRecoveryPortal(stripe, config);
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: account.customerId, configuration, return_url: config.appOrigin + "/app/settings/billing",
      });
      return safeStripeUrl(session.url, "billing.stripe.com");
    });
  },
});

export const refresh = adminAction({
  args: {}, returns: v.null(),
  handler: async (ctx): Promise<null> => {
    billingCompany(ctx.user);
    const config = await requireBillingConfig(ctx);
    const stripe = stripeClient(config);
    await withAccount(ctx, ctx.userId, false, account => reconcileAccount(ctx, stripe, account));
    return null;
  },
});
