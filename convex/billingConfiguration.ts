import { v } from "convex/values";
import source from "../hakken.billing.json";
import { parseBillingConfig } from "../billing.config";
import { internalMutation, internalQuery } from "./_generated/server";
import { billingConfigShape } from "./billingSchema";
import { appError } from "./utils/appError";

export const read = internalQuery({
  args: {}, returns: v.object({ config: billingConfigShape, revision: v.number() }),
  handler: async ctx => {
    const saved = await ctx.db.query("billingSettings").withIndex("by_key", q => q.eq("key", "stripe")).unique();
    return { config: parseBillingConfig(saved?.config ?? source), revision: saved?.revision ?? 0 };
  },
});

/** Only a validated server action can publish configuration. Stale editors cannot overwrite it. */
export const publish = internalMutation({
  args: { config: billingConfigShape, revision: v.number(), userId: v.id("users") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user?.role !== "SUPER_ADMIN" || user.impersonatingCompanyId) throw appError("UNAUTHORIZED", "Platform billing requires a super admin outside impersonation.");
    const saved = await ctx.db.query("billingSettings").withIndex("by_key", q => q.eq("key", "stripe")).unique();
    if ((saved?.revision ?? 0) !== args.revision) throw appError("CONFLICT", "Billing settings changed. Reload before saving.");
    const previous = parseBillingConfig(saved?.config ?? source);
    const config = parseBillingConfig(args.config);
    if (config.mode !== previous.mode && await ctx.db.query("billingAccounts").first()) {
      throw appError("CONFLICT", "This deployment already has billing accounts. Use a separate deployment for a different Stripe mode.");
    }
    // Existing subscribers must retain recovery and reconciliation when new sales are paused.
    if (!config.enabled && previous.enabled && await ctx.db.query("billingAccounts").first()) {
      throw appError("CONFLICT", "Existing subscribers need billing enabled. Retire plans to stop new sales while preserving customer billing.");
    }
    for (const offer of config.offers) {
      const planId = ctx.db.normalizeId("plans", offer.planId);
      if (!planId || !(await ctx.db.get(planId))?.isActive) throw appError("INVALID_INPUT", "Every offered price must be linked to an active plan.");
      const previousBinding = previous.offers.find(o => o.stripePriceId === offer.stripePriceId);
      // Bindings stored on abandoned checkouts matter too: a delayed paid invoice
      // must resolve to the plan that was actually purchased.
      const conflicts = await Promise.all([
        ctx.db.query("billingAccounts").withIndex("by_price_plan", q => q.eq("offer.stripePriceId", offer.stripePriceId).lt("offer.planId", planId)).first(),
        ctx.db.query("billingAccounts").withIndex("by_price_plan", q => q.eq("offer.stripePriceId", offer.stripePriceId).gt("offer.planId", planId)).first(),
        ctx.db.query("billingCheckouts").withIndex("by_price_plan", q => q.eq("offer.stripePriceId", offer.stripePriceId).lt("offer.planId", planId)).first(),
        ctx.db.query("billingCheckouts").withIndex("by_price_plan", q => q.eq("offer.stripePriceId", offer.stripePriceId).gt("offer.planId", planId)).first(),
      ]);
      if ((previousBinding && previousBinding.planId !== planId) || conflicts.some(Boolean)) {
        throw appError("CONFLICT", "This Stripe price belongs to a different product plan. Create a new Stripe price for the new plan.");
      }
    }
    const value = { key: "stripe" as const, config, revision: args.revision + 1, updatedAt: Date.now(), updatedBy: args.userId };
    if (saved) await ctx.db.patch(saved._id, value);
    else await ctx.db.insert("billingSettings", value);
    await ctx.db.insert("auditLogs", {
      actionType: "BILLING_CONFIGURATION_CHANGED", actorId: args.userId,
      entityType: "billingSettings", entityId: "stripe", timestamp: Date.now(),
      metadata: JSON.stringify({ revision: value.revision, before: previous, after: config }),
    });
    return null;
  },
});

export const recordWebhook = internalMutation({
  args: { eventId: v.string(), eventType: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const seen = await ctx.db.query("auditLogs").withIndex("by_action_entity_timestamp", q =>
      q.eq("actionType", "BILLING_WEBHOOK_RECEIVED").eq("entityId", args.eventId)).first();
    if (!seen) await ctx.db.insert("auditLogs", {
      actionType: "BILLING_WEBHOOK_RECEIVED", entityType: "stripeEvents", entityId: args.eventId,
      timestamp: Date.now(), metadata: JSON.stringify({ eventType: args.eventType }),
    });
    const row = await ctx.db.query("billingHealth").withIndex("by_key", q => q.eq("key", "stripe")).unique();
    if (row) await ctx.db.patch(row._id, { lastWebhookAt: Date.now() });
    else await ctx.db.insert("billingHealth", { key: "stripe", lastWebhookAt: Date.now() });
    return null;
  },
});
