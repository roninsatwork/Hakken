import type Stripe from "stripe";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { matchesOffer, objectId } from "./billingStripe";
import { paidPeriod, recoverPaidPeriod } from "./billingPayments";
import { appError } from "./utils/appError";

type StoredOffer = NonNullable<Doc<"billingAccounts">["offer"]>;

export const terminalSubscription = (status: string) => status === "canceled" || status === "incomplete_expired";

/** Always read current Stripe state under the company's lease. Event order is never an access policy. */
export async function reconcileAccount(ctx: Pick<ActionCtx, "runQuery" | "runMutation">, stripe: Stripe, account: Doc<"billingAccounts">) {
  if (!account.customerId) return { status: account.status, mayCheckout: !account.subscriptionId };
  const all = await stripe.subscriptions.list({ customer: account.customerId, status: "all", limit: 100 });
  if (all.has_more) throw appError("CONFLICT", "The Stripe subscription history needs operator review.");
  const current = all.data.filter(s => !terminalSubscription(s.status));
  const owned = all.data.filter(s => s.metadata.hakkenBillingAccount === account._id);
  const selected = current.length === 1 ? current[0] : owned.find(s => s.id === account.subscriptionId) ?? owned[0];
  const lease = { accountId: account._id, revision: account.revision };
  if (current.length > 1 || (selected && selected.metadata.hakkenBillingAccount !== account._id)) {
    await ctx.runMutation(internal.billingState.applyProjection, { ...lease, status: "unsupported", paidThrough: 0, cancelAtPeriodEnd: false });
    return { status: "unsupported", mayCheckout: false };
  }
  if (!selected) return { status: account.status, mayCheckout: !account.subscriptionId };
  const subscription = await stripe.subscriptions.retrieve(selected.id, { expand: ["latest_invoice"] });
  const previous = account.subscriptionId === subscription.id ? account.offer : undefined;
  const item = subscription.items.data[0];
  let checkoutOffer: StoredOffer | undefined;
  if (account.attemptId && subscription.metadata.hakkenCheckoutAttempt === account.attemptId &&
      (!previous || account.paidThrough < (item?.current_period_end ?? 0) * 1000)) {
    const attempt = await ctx.runQuery(internal.billingState.getAttempt, { id: account.attemptId });
    if (attempt?.accountId === account._id) checkoutOffer = attempt.offer;
  }
  const anchor = previous ?? checkoutOffer;
  let offer = anchor;
  let offers: StoredOffer[] | undefined;
  if (anchor && item && !matchesOffer(item.price, anchor)) {
    offers = await ctx.runQuery(internal.billingState.getOffers, {});
    offer = offers.find(candidate => candidate.currency === anchor.currency && matchesOffer(item.price, candidate));
  }
  const supported = offer && subscription.livemode === (account.mode === "live") && objectId(subscription.customer) === account.customerId &&
    subscription.metadata.hakkenBillingAccount === account._id && subscription.items.data.length === 1 && !subscription.items.has_more &&
    item.quantity === 1 && matchesOffer(item.price, offer) && subscription.collection_method === "charge_automatically" && !subscription.trial_end && !subscription.pause_collection;
  let paidThrough = supported && previous ? account.paidThrough : 0;
  let paidInvoice: Doc<"billingAccounts">["paidInvoice"];
  if (supported && offer) {
    const invoice = subscription.latest_invoice;
    const confirmedThrough = paidPeriod(invoice, subscription, offer, account);
    if (confirmedThrough && invoice && typeof invoice !== "string") {
      paidThrough = Math.max(paidThrough, confirmedThrough);
      paidInvoice = { id: invoice.id, created: invoice.created };
    } else {
      const history = await stripe.invoices.list({ customer: account.customerId, subscription: subscription.id, status: "paid", limit: 10 });
      offers ??= await ctx.runQuery(internal.billingState.getOffers, {});
      const knownOffers = [...offers, ...(anchor ? [anchor] : []), ...(checkoutOffer ? [checkoutOffer] : [])];
      const recovered = recoverPaidPeriod(history.data, subscription, knownOffers, { ...account, offer: anchor }, offer);
      offer = knownOffers.find(candidate => candidate.stripePriceId === recovered?.offer?.stripePriceId) ?? anchor;
      paidThrough = recovered?.through ?? 0;
      paidInvoice = recovered?.paidInvoice;
    }
  }
  const status = supported ? subscription.status : "unsupported";
  await ctx.runMutation(internal.billingState.applyProjection, {
    ...lease, status, subscriptionId: subscription.id, ...(offer ? { offer } : {}), paidThrough,
    ...(paidInvoice ? { paidInvoice } : {}),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
  return { status, mayCheckout: supported && terminalSubscription(subscription.status) };
}
