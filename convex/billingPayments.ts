import type Stripe from "stripe";
import type { BillingOffer } from "../billing.config";
import { objectId } from "./billingStripe";

type PaymentState = {
  customerId?: string;
  subscriptionId?: string;
  offer?: BillingOffer;
  paidThrough: number;
  paidInvoice?: { id: string; created: number };
};

/** Stripe calculates credits and charges; we only verify which plan and period it paid. */
export function paidPeriod(invoice: Stripe.Invoice | string | null, subscription: Stripe.Subscription, offer: BillingOffer, account: PaymentState) {
  if (!invoice || typeof invoice === "string" || invoice.status !== "paid" || invoice.amount_remaining !== 0 ||
      invoice.livemode !== subscription.livemode || invoice.currency !== offer.currency ||
      objectId(invoice.customer) !== account.customerId || objectId(invoice.parent?.subscription_details?.subscription) !== subscription.id || invoice.lines.has_more) return 0;
  const item = subscription.items.data[0];
  const sameSubscription = account.subscriptionId === subscription.id;
  const changingPlan = sameSubscription && account.offer?.stripePriceId !== offer.stripePriceId;
  const previousInvoice = sameSubscription ? account.paidInvoice : undefined;
  if (!invoice.id || !Number.isFinite(invoice.created) || (previousInvoice &&
      (invoice.created < previousInvoice.created || (changingPlan && invoice.id === previousInvoice.id)))) return 0;
  let through = 0;
  for (const line of invoice.lines.data) {
    const parent = line.parent?.subscription_item_details;
    if (line.parent?.type !== "subscription_item_details" || parent?.subscription_item !== item.id ||
        objectId(parent.subscription) !== subscription.id || objectId(line.pricing?.price_details?.price) !== offer.stripePriceId ||
        line.currency !== offer.currency || line.quantity !== 1 || line.amount < 0 ||
        line.period.end !== item.current_period_end || line.period.start > Date.now() / 1000) continue;
    if (!parent.proration && line.period.start === item.current_period_start &&
        (["subscription_create", "subscription_cycle"].includes(invoice.billing_reason ?? "") || (sameSubscription && invoice.billing_reason === "subscription_update"))) {
      through = Math.max(through, line.period.end * 1000);
    } else if (parent.proration && sameSubscription && invoice.billing_reason === "subscription_update" &&
        line.period.start >= item.current_period_start && line.period.start < line.period.end && account.paidThrough >= line.period.end * 1000) {
      // A paid price-change adjustment can change access within an already paid period,
      // but cannot buy a renewal or extend the deadline by itself.
      through = Math.max(through, line.period.end * 1000);
    }
  }
  return through;
}

/** Use the recorded paid period, or rebuild it from a full payment, then replay paid changes.
 * Never start from a proration: it only adjusts time that was already purchased.
 * The provider returns its newest invoices first; a full payment in this bounded
 * window establishes a baseline without needing older, possibly omitted periods.
 */
export function recoverPaidPeriod(history: Stripe.Invoice[], subscription: Stripe.Subscription, offers: BillingOffer[], account: PaymentState, target: BillingOffer) {
  const item = subscription.items.data[0];
  const sameSubscription = account.subscriptionId === subscription.id;
  const marker = sameSubscription ? account.paidInvoice : undefined;
  const invoices = [...new Map(history.map(invoice => [invoice.id, invoice])).values()]
    .filter(invoice => (!marker || (invoice.id !== marker.id && invoice.created >= marker.created)) && invoice.lines.data.some(line =>
      line.parent?.subscription_item_details?.subscription_item === item.id &&
      line.period.end === item.current_period_end && line.period.start >= item.current_period_start))
    .sort((a, b) => a.created - b.created);
  // Creation time is not a safe ordering for distinct same-second changes.
  if (invoices.some((invoice, index) => !Number.isFinite(invoice.created) ||
      invoice.created === marker?.created || (index > 0 && invoice.created === invoices[index - 1].created))) return null;
  const known = [...new Map(offers.filter(offer => offer.currency === target.currency)
    .map(offer => [offer.stripePriceId, offer])).values()];
  let state: PaymentState = { ...account, subscriptionId: subscription.id,
    paidThrough: sameSubscription ? account.paidThrough : 0, paidInvoice: marker };
  for (const invoice of invoices) {
    const matches = known.map(offer => ({ offer, through: paidPeriod(invoice, subscription, offer, state) }))
      .filter(match => match.through > 0);
    if (matches.length !== 1) {
      // An unrecognised intervening adjustment may have credited the previous
      // purchase. Only a later full-period payment can establish a new baseline.
      state = { ...state, paidThrough: 0 };
      continue;
    }
    const { offer, through } = matches[0];
    state = { ...state, offer, paidThrough: through, paidInvoice: { id: invoice.id, created: invoice.created } };
  }
  // Pending provider changes keep the latest paid plan, including a downgrade
  // missed locally. Never select an older matching price over a newer credit.
  return { offer: state.offer, through: state.paidThrough, paidInvoice: state.paidInvoice };
}
