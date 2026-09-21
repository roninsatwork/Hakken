import { defineTable } from "convex/server";
import { v } from "convex/values";

export const billingOfferShape = v.object({
  key: v.string(), planId: v.id("plans"), stripePriceId: v.string(),
  amountMinor: v.number(), currency: v.union(v.literal("gbp"), v.literal("eur"), v.literal("usd")),
});
export const billingPaidInvoiceShape = v.object({ id: v.string(), created: v.number() });
export const billingConfigShape = v.object({
  schemaVersion: v.literal(1), enabled: v.boolean(), provider: v.literal("stripe"),
  mode: v.union(v.literal("test"), v.literal("live")), appOrigin: v.string(),
  portalConfigurationId: v.string(), recoveryPortalConfigurationId: v.string(),
  graceDays: v.union(v.number(), v.null()), quotaWindow: v.literal("calendar-month"),
  offers: v.array(v.object({ ...billingOfferShape.fields, planId: v.string() })),
});

export const billingTables = {
  billingSettings: defineTable({
    key: v.literal("stripe"), config: billingConfigShape, revision: v.number(),
    updatedAt: v.number(), updatedBy: v.optional(v.id("users")),
  }).index("by_key", ["key"]).index("by_updated_by", ["updatedBy"]),
  billingHealth: defineTable({
    key: v.literal("stripe"), lastWebhookAt: v.number(),
  }).index("by_key", ["key"]),
  billingAccounts: defineTable({
    companyId: v.id("companies"),
    customerId: v.optional(v.string()),
    mode: v.union(v.literal("test"), v.literal("live")),
    status: v.string(),
    subscriptionId: v.optional(v.string()),
    offer: v.optional(billingOfferShape),
    attemptId: v.optional(v.id("billingCheckouts")),
    paidThrough: v.number(),
    paidInvoice: v.optional(billingPaidInvoiceShape),
    accessExpiresAt: v.optional(v.number()),
    accessCheckedAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    syncedAt: v.optional(v.number()),
    reconciledAt: v.optional(v.number()),
    // Serialises provider reads and writes; a stale worker cannot commit over a newer one.
    revision: v.number(),
    leaseUntil: v.number(),
    auditActorId: v.optional(v.id("users")),
    auditSource: v.optional(v.string()),
    auditProviderEventId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_company", ["companyId"]).index("by_customer", ["customerId"])
    .index("by_plan", ["offer.planId"]).index("by_synced", ["syncedAt"])
    .index("by_mode_status", ["mode", "status"])
    .index("by_audit_actor", ["auditActorId"])
    .index("by_price_plan", ["offer.stripePriceId", "offer.planId"]),
  billingCheckouts: defineTable({
    accountId: v.id("billingAccounts"),
    offer: billingOfferShape,
    returnUrl: v.string(),
    sessionId: v.optional(v.string()),
    url: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_account", ["accountId"]).index("by_plan", ["offer.planId"])
    .index("by_price_plan", ["offer.stripePriceId", "offer.planId"]),
};
