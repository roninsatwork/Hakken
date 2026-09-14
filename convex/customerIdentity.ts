import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
// template:remove:start salesData
import { salesCustomerForEmail, salesCustomerForPhone } from "./salesDataIdentity";
// template:remove:end

type CustomerLookup = (
  ctx: QueryCtx,
  companyId: Id<"companies">,
  value: string | undefined | null,
) => Promise<string | null>;

/** Optional CRM integration. The framework's doors also work without a CRM. */
const lookups: { email?: CustomerLookup; phone?: CustomerLookup } = {
  // template:remove:start salesData
  email: salesCustomerForEmail,
  phone: salesCustomerForPhone,
  // template:remove:end
};

export const customerKeyForEmail: CustomerLookup = async (ctx, companyId, email) =>
  await lookups.email?.(ctx, companyId, email) ?? null;

export const customerKeyForPhone: CustomerLookup = async (ctx, companyId, phone) =>
  await lookups.phone?.(ctx, companyId, phone) ?? null;
