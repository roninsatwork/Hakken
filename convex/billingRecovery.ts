import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { stripeClient, objectId } from "./billingStripe";
import { safeStripeUrl, requireBillingConfig } from "./billingPolicy";
import { appError } from "./utils/appError";

/** Deployment-operator recovery only. Match provider objects; never generate a fresh charge to resolve ambiguity. */
export const attachProviderObject = internalAction({
  args: { accountId: v.id("billingAccounts"), customerId: v.string(), sessionId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const account = await ctx.runMutation(internal.billingState.acquire, { accountId: args.accountId });
    if (!account) throw appError("NOT_FOUND", "Billing account not found.");
    const lease = { accountId: account._id, revision: account.revision };
    try {
      const stripe = stripeClient(await requireBillingConfig(ctx));
      const customer = await stripe.customers.retrieve(args.customerId);
      if (customer.deleted || customer.livemode !== (account.mode === "live") || customer.metadata.sonaeBillingAccount !== account._id) {
        throw appError("CONFLICT", "Stripe customer does not match the stored billing account.");
      }
      await ctx.runMutation(internal.billingState.bindCustomer, { ...lease, customerId: customer.id });
      if (args.sessionId) {
        const session = await stripe.checkout.sessions.retrieve(args.sessionId);
        if (!account.attemptId || objectId(session.customer) !== customer.id || session.client_reference_id !== account._id ||
            session.metadata?.sonaeCheckoutAttempt !== account.attemptId || session.metadata.sonaeBillingAccount !== account._id) {
          throw appError("CONFLICT", "Stripe checkout does not match the stored attempt.");
        }
        await ctx.runMutation(internal.billingState.saveSession, {
          ...lease, attemptId: account.attemptId, sessionId: session.id,
          url: session.status === "open" ? safeStripeUrl(session.url, "checkout.stripe.com") : "",
        });
      }
    } finally { await ctx.runMutation(internal.billingState.release, lease); }
    await ctx.runAction(internal.billingSync.reconcile, { accountId: account._id });
    return null;
  },
});
