import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { superAdminQuery } from "./tenantFunctions";
import { billingConfig, companyBillingAccount, hasPaidAccess } from "./billingPolicy";
import { billingConfigShape } from "./billingSchema";
import { appError } from "./utils/appError";

export function requireBillingOperator(user: Doc<"users">) {
  if (user.role !== "SUPER_ADMIN" || user.impersonatingCompanyId) {
    throw appError("UNAUTHORIZED", "Platform billing requires a super admin outside impersonation.");
  }
}

export const getSettings = superAdminQuery({
  args: {}, returns: v.object({
    config: billingConfigShape, revision: v.number(), secretKeyPresent: v.boolean(),
    secretKeyModeMatches: v.boolean(), webhookSecretPresent: v.boolean(), webhookUrl: v.string(),
    lastWebhookAt: v.union(v.number(), v.null()), hasAccounts: v.boolean(),
  }),
  handler: async ctx => {
    requireBillingOperator(ctx.user);
    const config = await billingConfig(ctx);
    const saved = await ctx.db.query("billingSettings").withIndex("by_key", q => q.eq("key", "stripe")).unique();
    const health = await ctx.db.query("billingHealth").withIndex("by_key", q => q.eq("key", "stripe")).unique();
    return {
      config, revision: saved?.revision ?? 0,
      secretKeyPresent: !!process.env.STRIPE_SECRET_KEY,
      secretKeyModeMatches: new RegExp(`^(sk|rk)_${config.mode}_`).test(process.env.STRIPE_SECRET_KEY ?? ""),
      webhookSecretPresent: !!process.env.STRIPE_WEBHOOK_SECRET,
      webhookUrl: process.env.CONVEX_SITE_URL ? process.env.CONVEX_SITE_URL + "/stripe/webhook" : "",
      lastWebhookAt: health?.lastWebhookAt ?? null, hasAccounts: !!await ctx.db.query("billingAccounts").first(),
    };
  },
});

export const getPlan = superAdminQuery({
  args: { planId: v.id("plans") }, returns: v.union(v.null(), v.object({ name: v.string(), active: v.boolean() })),
  handler: async (ctx, args) => {
    requireBillingOperator(ctx.user);
    const plan = await ctx.db.get(args.planId);
    return plan ? { name: plan.name, active: plan.isActive } : null;
  },
});

export const companyBillingShape = v.object({
  companyId: v.id("companies"), companyName: v.string(), status: v.string(),
  planName: v.string(), managed: v.boolean(), mode: v.union(v.literal("test"), v.literal("live")),
  paidThrough: v.number(), accessAllowed: v.boolean(), cancelAtPeriodEnd: v.boolean(),
  amountMinor: v.union(v.number(), v.null()), currency: v.union(v.string(), v.null()),
  syncedAt: v.union(v.number(), v.null()), stripeUrl: v.union(v.string(), v.null()),
});

async function companyView(ctx: Parameters<typeof companyBillingAccount>[0], company: Doc<"companies">) {
  const account = await companyBillingAccount(ctx, company._id);
  const config = await billingConfig(ctx);
  const planId = account?.offer?.planId ?? company.planId;
  const plan = planId ? await ctx.db.get(planId) : null;
  return {
    companyId: company._id, companyName: company.name, status: account?.status ?? "manual",
    planName: plan?.name ?? "", managed: !!account, mode: account?.mode ?? config.mode,
    paidThrough: account?.paidThrough ?? 0, accessAllowed: account ? hasPaidAccess(account, config.graceDays ?? 0) : true,
    cancelAtPeriodEnd: account?.cancelAtPeriodEnd ?? false, amountMinor: account?.offer?.amountMinor ?? null,
    currency: account?.offer?.currency ?? null, syncedAt: account?.reconciledAt ?? null,
    stripeUrl: account?.customerId && /^cus_[a-zA-Z0-9]+$/.test(account.customerId)
      ? `https://dashboard.stripe.com/${account.mode === "test" ? "test/" : ""}customers/${account.customerId}` : null,
  };
}

export const getCompany = superAdminQuery({
  args: { companyId: v.id("companies") }, returns: v.union(v.null(), companyBillingShape),
  handler: async (ctx, args) => {
    requireBillingOperator(ctx.user);
    const company = await ctx.db.get(args.companyId);
    return company ? companyView(ctx, company) : null;
  },
});

/** Company search is indexed and includes companies that have never subscribed. */
export const listCompanies = superAdminQuery({
  args: { paginationOpts: paginationOptsValidator, searchTerm: v.optional(v.string()), status: v.optional(v.string()) },
  returns: v.object({ page: v.array(companyBillingShape), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    requireBillingOperator(ctx.user);
    const paginationOpts = { ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 100) };
    const term = args.searchTerm?.trim();
    if (args.status) {
      if (term) throw appError("INVALID_INPUT", "Clear the status filter before searching company names.");
      const config = await billingConfig(ctx);
      const accounts = await ctx.db.query("billingAccounts").withIndex("by_mode_status", q => q.eq("mode", config.mode).eq("status", args.status!)).paginate(paginationOpts);
      const companies = await Promise.all(accounts.page.map(a => ctx.db.get(a.companyId)));
      return { isDone: accounts.isDone, continueCursor: accounts.continueCursor,
        page: await Promise.all(companies.filter((c): c is Doc<"companies"> => !!c).map(c => companyView(ctx, c))) };
    }
    const page = term
      ? await ctx.db.query("companies").withSearchIndex("search_name", q => q.search("name", term)).paginate(paginationOpts)
      : await ctx.db.query("companies").order("desc").paginate(paginationOpts);
    return { isDone: page.isDone, continueCursor: page.continueCursor, page: await Promise.all(page.page.map(company => companyView(ctx, company))) };
  },
});
