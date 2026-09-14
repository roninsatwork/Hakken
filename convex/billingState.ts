import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { billingCompany, companyBillingAccount, requireBillingConfig, hasPaidAccess, paidAccessDeadline } from "./billingPolicy";
import { internal } from "./_generated/api";
import { billingOfferShape, billingPaidInvoiceShape } from "./billingSchema";
import { rowShape } from "./utils/rowShape";
import { appError } from "./utils/appError";
import { adjustGlobalInventoryCompanyPlan } from "./utils/inventoryRollupService";

export const leaseArgs = { accountId: v.id("billingAccounts"), revision: v.number() };
export async function leasedAccount(ctx: MutationCtx, args: { accountId: Id<"billingAccounts">; revision: number }) {
  const account = await ctx.db.get(args.accountId);
  if (!account || account.revision !== args.revision || account.leaseUntil <= Date.now()) {
    throw appError("CONFLICT", "Billing changed while this request was running. Please retry.");
  }
  return account;
}

export const acquire = internalMutation({
  args: { userId: v.optional(v.id("users")), accountId: v.optional(v.id("billingAccounts")), enroll: v.optional(v.boolean()), offerKey: v.optional(v.string()) },
  returns: v.union(v.null(), rowShape.billingAccounts),
  handler: async (ctx, args) => {
    const config = (await requireBillingConfig(ctx));
    let account = args.accountId ? await ctx.db.get(args.accountId) : null;
    if (args.userId) {
      const user = await ctx.db.get(args.userId);
      if (!user) throw appError("UNAUTHENTICATED", "Sign in to manage billing.");
      const companyId = billingCompany(user);
      const company = await ctx.db.get(companyId);
      if (!company) throw appError("NOT_FOUND", "Company not found.");
      account = await companyBillingAccount(ctx, companyId);
      if (args.enroll) {
        const offer = config.offers.find(o => o.key === args.offerKey);
        const planId = offer ? ctx.db.normalizeId("plans", offer.planId) : null;
        if (!planId || !(await ctx.db.get(planId))?.isActive) throw appError("INVALID_INPUT", "This subscription offer is not available.");
      }
      if (!account && args.enroll) {
        if (company.planId) throw appError("CONFLICT", "This company has an operator-managed plan. Ask your operator about migrating it to Stripe.");
        const id = await ctx.db.insert("billingAccounts", {
          companyId, mode: config.mode, status: "pending", paidThrough: 0,
          cancelAtPeriodEnd: false, revision: 0, leaseUntil: 0, syncedAt: 0, createdAt: Date.now(),
        });
        account = await ctx.db.get(id);
      }
    }
    if (!account) return null;
    if (account.mode !== config.mode) throw appError("NOT_CONFIGURED", "This billing account belongs to a different Stripe mode.");
    if (account.leaseUntil > Date.now()) throw appError("CONFLICT", "Another billing request is running. Please retry shortly.");
    const update = { revision: account.revision + 1, leaseUntil: Date.now() + 90_000 };
    await ctx.db.patch(account._id, update);
    return { ...account, ...update };
  },
});

export const release = internalMutation({
  args: leaseArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (account?.revision === args.revision) await ctx.db.patch(account._id, { leaseUntil: 0, syncedAt: Date.now() });
    return null;
  },
});

export const bindCustomer = internalMutation({
  args: { ...leaseArgs, customerId: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const account = await leasedAccount(ctx, args);
    const other = await ctx.db.query("billingAccounts").withIndex("by_customer", q => q.eq("customerId", args.customerId)).unique();
    if ((account.customerId && account.customerId !== args.customerId) || (other && other._id !== account._id)) {
      throw appError("CONFLICT", "Stripe customer is already bound to a different billing account.");
    }
    await ctx.db.patch(account._id, { customerId: args.customerId });
    return null;
  },
});

export const findCustomer = internalQuery({
  args: { customerId: v.string() }, returns: v.union(v.null(), v.id("billingAccounts")),
  handler: async (ctx, args) => (await ctx.db.query("billingAccounts").withIndex("by_customer", q => q.eq("customerId", args.customerId)).unique())?._id ?? null,
});

export const getAttempt = internalQuery({
  args: { id: v.id("billingCheckouts") }, returns: v.union(v.null(), rowShape.billingCheckouts),
  handler: (ctx, args) => ctx.db.get(args.id),
});

/** The portal may sell only configured prices backed by an active product plan. */
export const getOffers = internalQuery({
  args: {}, returns: v.array(billingOfferShape),
  handler: async (ctx) => {
    const offers = [];
    for (const offer of (await requireBillingConfig(ctx)).offers) {
      const planId = ctx.db.normalizeId("plans", offer.planId);
      if (planId && (await ctx.db.get(planId))?.isActive) offers.push({ ...offer, planId });
    }
    return offers;
  },
});

export const createAttempt = internalMutation({
  args: { ...leaseArgs, offerKey: v.string(), expiredAttemptId: v.optional(v.id("billingCheckouts")) },
  returns: rowShape.billingCheckouts,
  handler: async (ctx, args) => {
    const account = await leasedAccount(ctx, args);
    const config = (await requireBillingConfig(ctx));
    const offer = config.offers.find(o => o.key === args.offerKey);
    const planId = offer ? ctx.db.normalizeId("plans", offer.planId) : null;
    const plan = planId ? await ctx.db.get(planId) : null;
    if (!offer || !planId || !plan?.isActive) throw appError("INVALID_INPUT", "This subscription offer is not available.");
    if (account.attemptId && account.attemptId !== args.expiredAttemptId) {
      const attempt = await ctx.db.get(account.attemptId);
      if (!attempt || attempt.offer.key !== args.offerKey) throw appError("CONFLICT", "Finish or let the current checkout expire before choosing another plan.");
      return attempt;
    }
    const now = Date.now();
    const id = await ctx.db.insert("billingCheckouts", {
      accountId: account._id, offer: { ...offer, planId }, returnUrl: config.appOrigin + "/app/settings/billing",
      expiresAt: Math.floor(now / 1000) * 1000 + 3_600_000, createdAt: now,
    });
    await ctx.db.patch(account._id, { attemptId: id });
    const attempt = await ctx.db.get(id);
    if (!attempt) throw appError("NOT_FOUND", "Checkout attempt not found.");
    return attempt;
  },
});

export const saveSession = internalMutation({
  args: { ...leaseArgs, attemptId: v.id("billingCheckouts"), sessionId: v.string(), url: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const account = await leasedAccount(ctx, args);
    if (account.attemptId !== args.attemptId) throw appError("CONFLICT", "Checkout attempt changed.");
    await ctx.db.patch(args.attemptId, { sessionId: args.sessionId, url: args.url });
    return null;
  },
});

export const applyProjection = internalMutation({
  args: {
    ...leaseArgs, status: v.string(), subscriptionId: v.optional(v.string()),
    offer: v.optional(billingOfferShape), paidThrough: v.number(), cancelAtPeriodEnd: v.boolean(),
    paidInvoice: v.optional(billingPaidInvoiceShape),
  }, returns: v.null(),
  handler: async (ctx, args) => {
    const account = await leasedAccount(ctx, args);
    const company = await ctx.db.get(account.companyId);
    if (!company) throw appError("NOT_FOUND", "Billing company no longer exists.");
    const { accountId: _accountId, revision: _revision, ...projection } = args;
    if (projection.offer) {
      const plan = await ctx.db.get(projection.offer.planId);
      if (!plan || (company.planId !== plan._id && !plan.isActive)) { projection.status = "unsupported"; projection.paidThrough = 0; }
      if (plan && hasPaidAccess(projection, (await requireBillingConfig(ctx)).graceDays ?? 0) && company.planId !== plan._id) {
        const previousPlan = company.planId ? await ctx.db.get(company.planId) : null;
        await ctx.db.patch(company._id, { planId: plan._id });
        await adjustGlobalInventoryCompanyPlan(ctx, { previousPlan, nextPlan: plan });
      }
    }
    const accessExpiresAt = paidAccessDeadline(projection, (await requireBillingConfig(ctx)).graceDays ?? 0);
    await ctx.db.patch(account._id, { ...projection, syncedAt: Date.now(), reconciledAt: Date.now(), accessExpiresAt });
    if (accessExpiresAt > Date.now() && accessExpiresAt !== account.accessExpiresAt) {
      await ctx.scheduler.runAt(accessExpiresAt, internal.billingState.expireAccess, { accountId: account._id, deadline: accessExpiresAt });
    }
    return null;
  },
});

/** Invalidate cached permission/status queries at expiry, even if no provider event arrives. */
export const expireAccess = internalMutation({
  args: { accountId: v.id("billingAccounts"), deadline: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (account?.accessExpiresAt === args.deadline && Date.now() >= args.deadline) {
      await ctx.db.patch(account._id, { accessCheckedAt: Date.now() });
    }
    return null;
  },
});
