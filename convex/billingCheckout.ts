import type Stripe from "stripe";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { safeStripeUrl, requireBillingConfig } from "./billingPolicy";
import { objectId, validatePrice } from "./billingStripe";
import { appError } from "./utils/appError";

export async function ensureCustomer(ctx: Pick<ActionCtx, "runMutation">, stripe: Stripe, account: Doc<"billingAccounts">) {
  if (account.customerId) return account;
  // This step cannot charge: checkout is unreachable until the binding is durably saved.
  // A retry after Stripe prunes the key may leave an unused empty customer, never a second subscription.
  const customer = await stripe.customers.create({ metadata: { sonaeBillingAccount: account._id } }, { idempotencyKey: `sonae-customer-${account._id}` });
  if (customer.livemode !== (account.mode === "live")) throw appError("NOT_CONFIGURED", "Stripe customer uses the wrong mode.");
  await ctx.runMutation(internal.billingState.bindCustomer, { accountId: account._id, revision: account.revision, customerId: customer.id });
  return { ...account, customerId: customer.id };
}

async function sessionForAttempt(stripe: Stripe, account: Doc<"billingAccounts">, attempt: Doc<"billingCheckouts">) {
  if (attempt.sessionId) return stripe.checkout.sessions.retrieve(attempt.sessionId);
  if (Date.now() - attempt.createdAt > 23 * 3_600_000) {
    // The old request's immutable expiry is long past. Reconcile provider history before
    // replacing it; never reuse an expired idempotency key to submit a purchase.
    const sessions = await stripe.checkout.sessions.list({ customer: account.customerId, limit: 100 });
    if (sessions.has_more) throw appError("CONFLICT", "An unfinished checkout needs operator reconciliation before retrying.");
    const matches = sessions.data.filter(s => s.metadata?.sonaeCheckoutAttempt === attempt._id);
    if (matches.length > 1) throw appError("CONFLICT", "Multiple checkout sessions need operator reconciliation.");
    if (matches.length === 1) return matches[0];
    return null;
  }
  return stripe.checkout.sessions.create({
    customer: account.customerId, mode: "subscription", payment_method_types: ["card"],
    adaptive_pricing: { enabled: false }, allow_promotion_codes: false, automatic_tax: { enabled: false },
    line_items: [{ price: attempt.offer.stripePriceId, quantity: 1 }],
    client_reference_id: account._id, expires_at: attempt.expiresAt / 1000,
    success_url: attempt.returnUrl, cancel_url: attempt.returnUrl,
    metadata: { sonaeBillingAccount: account._id, sonaeCheckoutAttempt: attempt._id },
    subscription_data: { metadata: { sonaeBillingAccount: account._id, sonaeCheckoutAttempt: attempt._id } },
  }, { idempotencyKey: `sonae-checkout-${attempt._id}` });
}

export async function checkoutUrl(ctx: Pick<ActionCtx, "runQuery" | "runMutation">, stripe: Stripe, account: Doc<"billingAccounts">, offerKey: string) {
  const config = await requireBillingConfig(ctx);
  const lease = { accountId: account._id, revision: account.revision };
  let expiredAttemptId: Id<"billingCheckouts"> | undefined;
  if (account.attemptId) {
    const old = await ctx.runQuery(internal.billingState.getAttempt, { id: account.attemptId });
    if (!old || old.accountId !== account._id) throw appError("CONFLICT", "Checkout history needs operator review.");
    const session = await sessionForAttempt(stripe, account, old);
    if (session && (objectId(session.customer) !== account.customerId || session.client_reference_id !== account._id)) throw appError("CONFLICT", "Checkout customer binding does not match.");
    // A completed subscription can be replaced only after reconciliation proves it terminal.
    if (session?.status === "complete" && objectId(session.subscription) !== account.subscriptionId) {
      throw appError("CONFLICT", "Payment is awaiting reconciliation. Refresh billing before trying again.");
    }
    if (!session || session.status === "expired" || session.status === "complete") expiredAttemptId = old._id;
    else {
      if (old.offer.key !== offerKey) throw appError("CONFLICT", "Finish or let the current checkout expire before choosing another plan.");
      const current = config.offers.find(o => o.key === offerKey);
      if (!current || current.planId !== old.offer.planId || current.stripePriceId !== old.offer.stripePriceId || current.amountMinor !== old.offer.amountMinor || current.currency !== old.offer.currency) {
        throw appError("CONFLICT", "The offer changed while checkout was open. Let this checkout expire before starting another.");
      }
      await validatePrice(stripe, old.offer, config);
      const url = safeStripeUrl(session.url, "checkout.stripe.com");
      await ctx.runMutation(internal.billingState.saveSession, { ...lease, attemptId: old._id, sessionId: session.id, url });
      return url;
    }
  }
  const attempt = await ctx.runMutation(internal.billingState.createAttempt, { ...lease, offerKey, ...(expiredAttemptId ? { expiredAttemptId } : {}) });
  await validatePrice(stripe, attempt.offer, config);
  const session = await sessionForAttempt(stripe, account, attempt);
  if (!session || session.status !== "open" || objectId(session.customer) !== account.customerId || session.client_reference_id !== account._id) {
    throw appError("CONFLICT", "Checkout changed. Refresh billing before trying again.");
  }
  const url = safeStripeUrl(session.url, "checkout.stripe.com");
  await ctx.runMutation(internal.billingState.saveSession, { ...lease, attemptId: attempt._id, sessionId: session.id, url });
  return url;
}
