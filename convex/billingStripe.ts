import Stripe from "stripe";
import type { BillingConfig, BillingOffer } from "../billing.config";
import { appError } from "./utils/appError";

export const STRIPE_API_VERSION = "2026-05-27.dahlia";
export function stripeClient(config: BillingConfig) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !new RegExp(`^(sk|rk)_${config.mode}_`).test(key) || !process.env.STRIPE_WEBHOOK_SECRET) {
    throw appError("NOT_CONFIGURED", "Stripe credentials are missing or use the wrong mode.");
  }
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION, httpClient: Stripe.createFetchHttpClient(), timeout: 10_000, maxNetworkRetries: 1 });
}

export function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

export function matchesOffer(price: Stripe.Price, offer: BillingOffer) {
  return price.id === offer.stripePriceId && price.currency === offer.currency && price.unit_amount === offer.amountMinor &&
    price.type === "recurring" && price.recurring?.interval === "month" && price.recurring.interval_count === 1 &&
    price.recurring.usage_type === "licensed" && price.billing_scheme === "per_unit" && !price.transform_quantity;
}

export async function validatePrice(stripe: Stripe, offer: BillingOffer, config: BillingConfig) {
  const price = await stripe.prices.retrieve(offer.stripePriceId, { expand: ["product"] });
  if (price.livemode !== (config.mode === "live") || !price.active || !matchesOffer(price, offer) ||
      typeof price.product === "string" || price.product.deleted || !price.product.active) {
    throw appError("NOT_CONFIGURED", "The Stripe price does not match this monthly subscription offer.");
  }
  return price;
}

export async function validatePortal(stripe: Stripe, offers: BillingOffer[], config: BillingConfig) {
  const portal = await stripe.billingPortal.configurations.retrieve(config.portalConfigurationId);
  if (!portal.active || portal.livemode !== (config.mode === "live") || !portal.features.payment_method_update.enabled ||
      !portal.features.invoice_history.enabled ||
      !portal.features.subscription_cancel.enabled || portal.features.subscription_cancel.mode !== "at_period_end") {
    throw appError("NOT_CONFIGURED", "Configure the Stripe portal for payment recovery, invoice history and cancellation at period end.");
  }
  const update = portal.features.subscription_update;
  const products = update.products ?? [];
  const prices = products.flatMap(product => product.prices);
  if (!update.enabled || update.default_allowed_updates.length !== 1 || update.default_allowed_updates[0] !== "price" ||
      update.proration_behavior !== "always_invoice" || (update.billing_cycle_anchor && update.billing_cycle_anchor !== "unchanged") ||
      products.length === 0 || products.length > 10 || new Set(products.map(p => p.product)).size !== products.length ||
      products.some(p => p.adjustable_quantity?.enabled) || offers.length !== config.offers.length ||
      prices.length !== offers.length || new Set(prices).size !== prices.length ||
      offers.some(offer => !prices.includes(offer.stripePriceId))) {
    throw appError("NOT_CONFIGURED", "Configure Stripe portal plan changes for the active configured prices only, quantity one, immediate proration invoicing and unchanged billing dates.");
  }
  // Stripe owns the amounts charged. Validate the catalog before sending a customer there.
  await Promise.all(offers.map(async offer => {
    const price = await validatePrice(stripe, offer, config);
    if (!products.some(product => product.product === objectId(price.product) && product.prices.includes(price.id))) {
      throw appError("NOT_CONFIGURED", "The Stripe portal product does not match its configured price.");
    }
  }));
  return portal.id;
}

/** Financial recovery must not depend on whether a plan can still be sold. */
export async function validateRecoveryPortal(stripe: Stripe, config: BillingConfig) {
  const portal = await stripe.billingPortal.configurations.retrieve(config.recoveryPortalConfigurationId);
  if (!portal.active || portal.livemode !== (config.mode === "live") ||
      !portal.features.payment_method_update.enabled || !portal.features.invoice_history.enabled ||
      !portal.features.subscription_cancel.enabled || portal.features.subscription_cancel.mode !== "at_period_end" ||
      portal.features.subscription_update.enabled) {
    throw appError("NOT_CONFIGURED", "Configure the recovery portal for payment methods, invoice history and cancellation at period end, with plan changes disabled.");
  }
  return portal.id;
}
