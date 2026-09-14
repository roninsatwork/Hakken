import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalisePhoneNumber } from "./telephonyService";
import { normaliseEmail } from "./wikiRewriteService";

/** The existing account-keyed matching rules, owned by the Sales Data CRM. */
export async function salesCustomerForPhone(
  ctx: QueryCtx, companyId: Id<"companies">, phone: string | undefined | null,
): Promise<string | null> {
  const caller = normalisePhoneNumber(phone ?? "");
  if (!caller) return null;
  const customers = await ctx.db.query("salesDataCustomers")
    .withIndex("by_company_account", q => q.eq("companyId", companyId)).take(2000);
  const match = customers.find(customer =>
    (customer.phone && normalisePhoneNumber(customer.phone) === caller)
    || (customer.mobile && normalisePhoneNumber(customer.mobile) === caller));
  return match?.accountNameKey ?? null;
}

export async function salesCustomerForEmail(
  ctx: QueryCtx, companyId: Id<"companies">, email: string | undefined | null,
): Promise<string | null> {
  const sender = normaliseEmail(email);
  if (!sender) return null;
  const customers = await ctx.db.query("salesDataCustomers")
    .withIndex("by_company_account", q => q.eq("companyId", companyId)).take(2000);
  const match = customers.find(customer =>
    normaliseEmail(customer.email) === sender || normaliseEmail(customer.accountsEmail) === sender);
  return match?.accountNameKey ?? null;
}
