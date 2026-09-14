import { v, type Infer } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { superAdminAction } from "./tenantFunctions";
import { requireBillingOperator } from "./billingAdmin";
import { billingOfferShape } from "./billingSchema";

const cursorArgs = { cursor: v.union(v.string(), v.null()) };
const pageFields = { isDone: v.boolean(), continueCursor: v.string() };
export const accountsPage = internalQuery({
  args: cursorArgs,
  returns: v.object({ ...pageFields, page: v.array(v.object({
    companyId: v.id("companies"), exists: v.boolean(), mode: v.string(), status: v.string(),
    paidThrough: v.number(), cancelAtPeriodEnd: v.boolean(), syncedAt: v.number(),
    subscriptionId: v.union(v.string(), v.null()), offer: v.union(billingOfferShape, v.null()),
  })) }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("billingAccounts").paginate({ cursor: args.cursor, numItems: 250 });
    return { isDone: page.isDone, continueCursor: page.continueCursor, page: await Promise.all(page.page.map(async a => ({
      companyId: a.companyId, exists: !!await ctx.db.get(a.companyId), mode: a.mode, status: a.status,
      paidThrough: a.paidThrough, cancelAtPeriodEnd: a.cancelAtPeriodEnd, syncedAt: a.reconciledAt ?? 0,
      subscriptionId: a.subscriptionId ?? null, offer: a.offer ?? null,
    }))) };
  },
});
export const usersPage = internalQuery({
  args: cursorArgs,
  returns: v.object({ ...pageFields, page: v.array(v.object({ companyId: v.union(v.id("companies"), v.null()), eligible: v.boolean() })) }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("users").paginate({ cursor: args.cursor, numItems: 500 });
    return { isDone: page.isDone, continueCursor: page.continueCursor, page: page.page.map(u => ({
      companyId: u.companyId ?? null, eligible: !u.isAnonymous && ["USER", "ADMIN"].includes(u.role ?? "USER"),
    })) };
  },
});
export const companiesPage = internalQuery({
  args: cursorArgs, returns: v.object({ ...pageFields, count: v.number() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("companies").paginate({ cursor: args.cursor, numItems: 500 });
    return { count: page.page.length, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const overviewShape = v.object({
  startedAt: v.number(), completedAt: v.number(), mode: v.string(), totalCompanies: v.number(),
  paidCompanies: v.number(), paidUsers: v.number(), totalUsers: v.number(), billingAccounts: v.number(),
  paymentIssues: v.number(), pending: v.number(), canceled: v.number(), cancelling: v.number(), staleAccounts: v.number(),
  monthlyValue: v.array(v.object({ currency: v.string(), amountMinor: v.number() })),
});

/** Walk every page on the server. Never present a capped sample as a platform total.
 * This is an explicitly dated report: separate paginated reads are not a transactional snapshot.
 */
export const overview = superAdminAction({
  args: {}, returns: overviewShape,
  handler: async (ctx): Promise<Infer<typeof overviewShape>> => {
    requireBillingOperator(ctx.user);
    const { config } = await ctx.runQuery(internal.billingConfiguration.read, {});
    const startedAt = Date.now();
    const paid = new Set<string>();
    const amounts = new Map<string, number>();
    let billingAccounts = 0, paymentIssues = 0, pending = 0, canceled = 0, cancelling = 0, staleAccounts = 0;
    let cursor: string | null = null;
    do {
      const page: FunctionReturnType<typeof internal.billingMetrics.accountsPage> = await ctx.runQuery(internal.billingMetrics.accountsPage, { cursor });
      for (const a of page.page) {
        if (!a.exists || a.mode !== config.mode) continue;
        billingAccounts++;
        if (a.syncedAt < startedAt - 30 * 60_000) staleAccounts++;
        if (["past_due", "unpaid", "unsupported", "paused"].includes(a.status) || (a.status === "active" && a.paidThrough <= startedAt)) paymentIssues++;
        if (["pending", "incomplete", "trialing"].includes(a.status)) pending++;
        if (["canceled", "incomplete_expired"].includes(a.status)) canceled++;
        if (a.cancelAtPeriodEnd && !["canceled", "incomplete_expired"].includes(a.status)) cancelling++;
        if (a.subscriptionId && a.offer && ["active", "past_due"].includes(a.status) && a.paidThrough > startedAt) {
          paid.add(a.companyId);
          amounts.set(a.offer.currency, (amounts.get(a.offer.currency) ?? 0) + a.offer.amountMinor);
        }
      }
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);
    let paidUsers = 0, totalUsers = 0, totalCompanies = 0;
    do {
      const page: FunctionReturnType<typeof internal.billingMetrics.usersPage> = await ctx.runQuery(internal.billingMetrics.usersPage, { cursor });
      for (const u of page.page) if (u.companyId && u.eligible) { totalUsers++; if (paid.has(u.companyId)) paidUsers++; }
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);
    do {
      const page: FunctionReturnType<typeof internal.billingMetrics.companiesPage> = await ctx.runQuery(internal.billingMetrics.companiesPage, { cursor });
      totalCompanies += page.count;
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);
    return { startedAt, completedAt: Date.now(), mode: config.mode, totalCompanies, paidCompanies: paid.size, paidUsers, totalUsers,
      billingAccounts, paymentIssues, pending, canceled, cancelling, staleAccounts,
      monthlyValue: [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amountMinor]) => ({ currency, amountMinor })),
    };
  },
});
