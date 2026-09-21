import source from "../hakken.billing.json";
import { parseBillingConfig, type BillingConfig } from "../billing.config";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { appError } from "./utils/appError";

type ConfigContext = Pick<QueryCtx, "db"> | Pick<ActionCtx, "runQuery">;
export async function billingConfig(ctx: ConfigContext): Promise<BillingConfig> {
  try {
    if (!("db" in ctx)) return (await ctx.runQuery(internal.billingConfiguration.read, {})).config;
    const saved = await ctx.db.query("billingSettings").withIndex("by_key", q => q.eq("key", "stripe")).unique();
    return parseBillingConfig(saved?.config ?? source);
  }
  catch { throw appError("NOT_CONFIGURED", "Billing configuration needs operator attention."); }
}

export async function requireBillingConfig(ctx: ConfigContext) {
  const config = await billingConfig(ctx);
  if (!config.enabled) throw appError("MODULE_DISABLED", "Self-service billing is not enabled.");
  return config;
}

export function billingCompany(user: Doc<"users">) {
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role ?? "") || !user.companyId || user.impersonatingCompanyId) {
    throw appError("UNAUTHORIZED", "Only a company administrator can manage its billing. Leave impersonation first.");
  }
  return user.companyId;
}

export async function companyBillingAccount(ctx: Pick<QueryCtx, "db">, companyId: Doc<"companies">["_id"]) {
  return ctx.db.query("billingAccounts").withIndex("by_company", q => q.eq("companyId", companyId)).unique();
}

type PaidAccess = Pick<Doc<"billingAccounts">, "status" | "paidThrough" | "accessExpiresAt">;
export function hasPaidAccess(account: PaidAccess, graceDays: number, now = Date.now()) {
  // Stored grace deadlines have a matching invalidation job. A settings edit
  // takes effect at reconciliation, which also schedules its new deadline.
  if (account.status === "past_due" && account.accessExpiresAt !== undefined) return account.accessExpiresAt > now;
  return paidAccessDeadline(account, graceDays) > now;
}

export function paidAccessDeadline(account: Pick<Doc<"billingAccounts">, "status" | "paidThrough">, graceDays: number) {
  if (account.status === "active") return account.paidThrough;
  if (account.status === "past_due" && account.paidThrough > 0) return account.paidThrough + graceDays * 86_400_000;
  return 0;
}

/** Once enrolled, disabling checkout must never turn a company back into unlimited free access. */
export async function billingBlocksPaidAccess(ctx: Pick<QueryCtx, "db">, companyId: Doc<"companies">["_id"]) {
  const account = await companyBillingAccount(ctx, companyId);
  if (!account) return false;
  return !hasPaidAccess(account, (await billingConfig(ctx)).graceDays ?? 0);
}

export function safeStripeUrl(value: string | null, host: "checkout.stripe.com" | "billing.stripe.com") {
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.hostname === host && !url.port && !url.username && !url.password) return value;
    } catch { /* The provider result is not a usable redirect. */ }
  }
  throw appError("UPSTREAM_FAILURE", "Stripe did not return a valid hosted billing link.");
}
