import { v } from "convex/values";
import { softQuery } from "./tenantFunctions";
import { billingCompany, billingConfig, companyBillingAccount, hasPaidAccess } from "./billingPolicy";

export const getStatus = softQuery({
  reason: "Billing is optional; signed-out callers and non-billing roles have no financial screen to show.",
  args: {}, empty: null,
  returns: v.union(v.null(), v.object({
    enabled: v.boolean(), managed: v.boolean(), canCheckout: v.boolean(), hasCustomer: v.boolean(),
    status: v.string(), accessAllowed: v.boolean(), paidThrough: v.number(), cancelAtPeriodEnd: v.boolean(),
    planName: v.string(),
    offers: v.array(v.object({ key: v.string(), name: v.string(), amountMinor: v.number(), currency: v.string() })),
  })),
  handler: async (ctx) => {
    if (!["ADMIN", "SUPER_ADMIN"].includes(ctx.user.role ?? "") || !ctx.user.companyId || ctx.user.impersonatingCompanyId) return null;
    const companyId = billingCompany(ctx.user);
    const company = await ctx.db.get(companyId);
    if (!company) return null;
    const config = (await billingConfig(ctx));
    const account = await companyBillingAccount(ctx, companyId);
    const planId = account?.offer?.planId ?? company.planId;
    const currentPlan = planId ? await ctx.db.get(planId) : null;
    const offers = [];
    if (config.enabled) for (const offer of config.offers) {
      const id = ctx.db.normalizeId("plans", offer.planId);
      const plan = id ? await ctx.db.get(id) : null;
      if (plan?.isActive) offers.push({ key: offer.key, name: plan.name, amountMinor: offer.amountMinor, currency: offer.currency });
    }
    return {
      enabled: config.enabled, managed: !!account, planName: currentPlan?.name ?? "",
      canCheckout: config.enabled && (!account ? !company.planId : ["pending", "canceled", "incomplete_expired"].includes(account.status)),
      hasCustomer: !!account?.customerId, status: account?.status ?? "manual",
      accessAllowed: account ? hasPaidAccess(account, config.graceDays ?? 0) : true,
      paidThrough: account?.paidThrough ?? 0, cancelAtPeriodEnd: account?.cancelAtPeriodEnd ?? false, offers,
    };
  },
});
