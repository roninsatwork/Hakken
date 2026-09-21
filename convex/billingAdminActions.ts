import { ConvexError, v } from "convex/values";
import type Stripe from "stripe";
import { parseBillingConfig, type BillingConfig } from "../billing.config";
import { internal } from "./_generated/api";
import { superAdminAction } from "./tenantFunctions";
import { requireBillingOperator } from "./billingAdmin";
import { stripeClient, validatePortal, validatePrice, validateRecoveryPortal } from "./billingStripe";
import { appError } from "./utils/appError";

async function providerRequest<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof ConvexError) throw error;
    throw appError("UPSTREAM_FAILURE", "Stripe could not verify this setup. Check the server credentials and retry.");
  }
}

/** New immutable portal profiles keep in-flight customer sessions isolated from operator edits. */
async function prepareConfig(config: BillingConfig, revision: number): Promise<BillingConfig> {
  if (!config.enabled) return parseBillingConfig(config);
  // Validate the origin, catalogue bounds and billing policy before making provider requests.
  parseBillingConfig({ ...config, portalConfigurationId: "bpc_pending", recoveryPortalConfigurationId: "bpc_recovery" });
  const stripe = stripeClient(config);
  const products = new Map<string, string[]>();
  for (const offer of config.offers) {
    const price = await validatePrice(stripe, offer, config);
    const product = typeof price.product === "string" ? price.product : price.product.id;
    products.set(product, [...(products.get(product) ?? []), price.id]);
  }
  if (products.size > 10) throw appError("INVALID_INPUT", "Stripe supports up to ten products in this portal catalogue.");
  const common = {
    payment_method_update: { enabled: true }, invoice_history: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" as const },
  };
  // The full payload is included in the key, so two competing editors cannot reuse a key with different parameters.
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(config)))))
    .map(n => n.toString(16).padStart(2, "0")).join("");
  const recovery = await stripe.billingPortal.configurations.create({
    name: "Company payment recovery", features: { ...common, subscription_update: { enabled: false } },
  }, { idempotencyKey: `hakken-recovery-${revision}-${digest}` });
  const portal = await stripe.billingPortal.configurations.create({
    name: "Company subscriptions", features: { ...common, subscription_update: {
      enabled: true, default_allowed_updates: ["price"], proration_behavior: "always_invoice", billing_cycle_anchor: "unchanged",
      products: [...products].map(([product, prices]) => ({ product, prices })),
    } },
  }, { idempotencyKey: `hakken-portal-${revision}-${digest}` });
  const ready = parseBillingConfig({ ...config, portalConfigurationId: portal.id, recoveryPortalConfigurationId: recovery.id });
  await validatePortal(stripe, ready.offers, ready);
  await validateRecoveryPortal(stripe, ready);
  return ready;
}

export const saveSettings = superAdminAction({
  args: { revision: v.number(), enabled: v.boolean(), mode: v.union(v.literal("test"), v.literal("live")), appOrigin: v.string(), graceDays: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireBillingOperator(ctx.user);
    const current = await ctx.runQuery(internal.billingConfiguration.read, {});
    if (current.revision !== args.revision) throw appError("CONFLICT", "Billing settings changed. Reload before saving.");
    const { revision, ...fields } = args;
    const config = await providerRequest(() => prepareConfig({ ...current.config, ...fields }, revision));
    await ctx.runMutation(internal.billingConfiguration.publish, { config, revision, userId: ctx.userId });
    return null;
  },
});

export const priceShape = v.object({ id: v.string(), name: v.string(), amountMinor: v.number(), currency: v.string() });
function supportedPrice(price: Stripe.Price, mode: string) {
  return price.active && price.livemode === (mode === "live") && price.type === "recurring" &&
    price.recurring?.interval === "month" && price.recurring.interval_count === 1 && price.recurring.usage_type === "licensed" &&
    price.billing_scheme === "per_unit" && !price.transform_quantity && Number.isSafeInteger(price.unit_amount) &&
    (price.unit_amount ?? 0) > 0 && ["gbp", "eur", "usd"].includes(price.currency) &&
    typeof price.product !== "string" && !price.product.deleted && price.product.active;
}

export const listPrices = superAdminAction({
  args: { cursor: v.optional(v.string()) }, returns: v.object({ prices: v.array(priceShape), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, args): Promise<{ prices: { id: string; name: string; amountMinor: number; currency: string }[]; cursor: string | null }> => {
    requireBillingOperator(ctx.user);
    const { config } = await ctx.runQuery(internal.billingConfiguration.read, {});
    return providerRequest(async () => {
      const page = await stripeClient(config).prices.list({ active: true, type: "recurring", limit: 25, expand: ["data.product"], ...(args.cursor ? { starting_after: args.cursor } : {}) });
      return {
        prices: page.data.filter(p => supportedPrice(p, config.mode)).map(p => ({
          id: p.id, name: typeof p.product !== "string" && !p.product.deleted ? p.product.name : p.id,
          amountMinor: p.unit_amount!, currency: p.currency,
        })), cursor: page.has_more ? page.data.at(-1)?.id ?? null : null,
      };
    });
  },
});

export const linkPrice = superAdminAction({
  args: { planId: v.id("plans"), priceId: v.union(v.string(), v.null()), revision: v.number() }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireBillingOperator(ctx.user);
    const current = await ctx.runQuery(internal.billingConfiguration.read, {});
    if (current.revision !== args.revision) throw appError("CONFLICT", "Billing settings changed. Reload before saving.");
    const config = await providerRequest(async () => {
      const offers = current.config.offers.filter(o => o.planId !== args.planId);
      if (args.priceId) {
        const price = await stripeClient(current.config).prices.retrieve(args.priceId, { expand: ["product"] });
        if (!supportedPrice(price, current.config.mode)) throw appError("INVALID_INPUT", "Choose an active fixed monthly price in GBP, EUR or USD.");
        const previous = current.config.offers.find(o => o.planId === args.planId && o.stripePriceId === price.id);
        offers.push({ key: previous?.key ?? `offer-${crypto.randomUUID().slice(0, 30)}`, planId: args.planId,
          stripePriceId: price.id, amountMinor: price.unit_amount!, currency: price.currency as "gbp" | "eur" | "usd" });
      }
      return prepareConfig({ ...current.config, offers }, current.revision);
    });
    await ctx.runMutation(internal.billingConfiguration.publish, { config, revision: args.revision, userId: ctx.userId });
    return null;
  },
});

export const checkConnection = superAdminAction({
  args: {}, returns: v.object({ connected: v.boolean(), portalReady: v.boolean(), recoveryReady: v.boolean() }),
  handler: async (ctx): Promise<{ connected: boolean; portalReady: boolean; recoveryReady: boolean }> => {
    requireBillingOperator(ctx.user);
    const { config } = await ctx.runQuery(internal.billingConfiguration.read, {});
    return providerRequest(async () => {
      const stripe = stripeClient(config);
      const balance = await stripe.balance.retrieve();
      if (balance.livemode !== (config.mode === "live")) throw appError("NOT_CONFIGURED", "Stripe is using a different mode.");
      let portalReady = false, recoveryReady = false;
      try {
        const offers = config.enabled ? await ctx.runQuery(internal.billingState.getOffers, {}) : config.offers;
        await validatePortal(stripe, offers, config); portalReady = true;
      } catch { /* Shown as incomplete setup. */ }
      try { await validateRecoveryPortal(stripe, config); recoveryReady = true; } catch { /* Shown as incomplete setup. */ }
      return { connected: true, portalReady, recoveryReady };
    });
  },
});
