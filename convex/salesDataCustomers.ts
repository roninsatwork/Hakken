import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantMutation, tenantQuery, type TenantQueryCtx } from "./tenantFunctions";
import {
  distinctValues,
  emptyPage,
  getCurrentImport,
  matchesFilter,
  matchesSearch,
  paginatePage,
  paginateSafely,
  preferredAccountCode,
  requireSalesDataCompany,
  searchTerms,
} from "./salesData";

/**
 * The customer side of the workspace section.
 *
 * A customer is an account in the imported workbook. Two sources make one
 * record on screen: `salesDataAccounts`, derived from the import and replaced
 * with it, and `salesDataCustomers`, typed in by staff and never touched by an
 * import. They are joined on the normalised account name, which is the only
 * field clean across every row of the source — see the schema note on
 * `codeTally` for why the account code is not.
 *
 * The queries live here rather than in `salesData.ts` to keep that file to the
 * import and the four worksheet tables; the shared predicates and the paginator
 * are imported from it so both sides narrow a table the same way.
 */

const customerFilterArgs = {
  search: v.optional(v.string()),
  customerType: v.optional(v.string()),
  groupName: v.optional(v.string()),
};

/** The typed-in details, as the list and the profile want them. */
type CustomerDetails = Doc<"salesDataCustomers"> | undefined;

/**
 * Every typed-in detail row for the workspace, by account key.
 *
 * Read in one go rather than per account because search spans both sources: a
 * predicate that has to answer "does this customer's postcode match" cannot go
 * back to the database mid-scan. It is bounded by the number of customers
 * somebody has filled something in for — 39 accounts in the file seen — and is
 * classified in the scale plan on that basis.
 */
async function loadDetails(
  ctx: TenantQueryCtx,
  companyId: Id<"companies">
): Promise<Map<string, Doc<"salesDataCustomers">>> {
  const rows = await ctx.db
    .query("salesDataCustomers")
    .withIndex("by_company_account", (q) => q.eq("companyId", companyId))
    .collect();

  return new Map(rows.map((row) => [row.accountNameKey, row]));
}

/** What both the list and the profile show for one customer. */
function toCustomer(account: Doc<"salesDataAccounts">, details: CustomerDetails) {
  return {
    accountNameKey: account.accountNameKey,
    accountName: account.accountName,
    accountCode: preferredAccountCode(account.codeTally),
    groupName: account.groupName,
    customerType: account.customerType,
    customerTypeKey: account.customerTypeKey,
    totalRevenue: account.totalRevenue,
    productCount: account.productCount,
    town: details?.town ?? null,
    postcode: details?.postcode ?? null,
    phone: details?.phone ?? null,
    email: details?.email ?? null,
    contactName: details?.contactName ?? null,
    bedrooms: details?.bedrooms ?? null,
    pupils: details?.pupils ?? null,
    /** Whether anybody has filled anything in yet. Drives the "needs details" hint. */
    hasDetails: details !== undefined,
  };
}

/**
 * The customer list: every account in the current import, in chain order then
 * account name, narrowed by the search box and the two dropdowns.
 *
 * Search covers both sources — the name, code and chain from the workbook, and
 * the town, postcode, phone, email and contact somebody typed in — because a
 * person looking for "the place in Eastbourne" has no reason to care which side
 * of the join the answer sits on.
 */
export const listCustomers = tenantQuery({
  args: { paginationOpts: paginationOptsValidator, ...customerFilterArgs },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return emptyPage(args.paginationOpts);

    const terms = searchTerms(args.search);
    const details = await loadDetails(ctx, companyId);

    const page = await paginateSafely(
      (opts) =>
        paginatePage(
          () =>
            ctx.db
              .query("salesDataAccounts")
              .withIndex("by_company_import_group_name", (q) =>
                q.eq("companyId", companyId).eq("importId", currentImport._id)
              ),
          (account: Doc<"salesDataAccounts">) => {
            const typed = details.get(account.accountNameKey);
            return (
              matchesFilter(args.customerType, account.customerType) &&
              matchesFilter(args.groupName, account.groupName) &&
              matchesSearch(
                [
                  account.accountName,
                  preferredAccountCode(account.codeTally),
                  account.groupName,
                  account.customerType,
                  typed?.town,
                  typed?.postcode,
                  typed?.phone,
                  typed?.mobile,
                  typed?.email,
                  typed?.accountsEmail,
                  typed?.contactName,
                ],
                terms
              )
            );
          },
          terms.length > 0 || Boolean(args.customerType || args.groupName),
          opts
        ),
      args.paginationOpts
    );

    return {
      ...page,
      page: page.page.map((account) => toCustomer(account, details.get(account.accountNameKey))),
    };
  },
});

/** The values behind the customer list's two dropdowns. */
export const listCustomerFilterOptions = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return { customerTypes: [], groupNames: [] };

    const accounts = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import", (q) =>
        q.eq("companyId", companyId).eq("importId", currentImport._id)
      )
      .collect();

    return {
      customerTypes: distinctValues(accounts, (account) => account.customerType),
      groupNames: distinctValues(accounts, (account) => account.groupName),
    };
  },
});

/**
 * Which extra figure a customer type is measured by.
 *
 * Care homes and hotels count bedrooms; schools count pupils. Written here
 * against the type rather than configured, because Anthony asked for exactly
 * these two and said a third should come back to a developer. A type matching
 * neither — and any type a later workbook introduces — simply shows no extra
 * field rather than guessing at one.
 *
 * Matched on the normalised key, so a workbook that respells a type keeps its
 * field.
 */
const EXTRA_FIELD_BY_TYPE: Record<string, "bedrooms" | "pupils"> = {
  "CARE HOMES": "bedrooms",
  HOTELS: "bedrooms",
  "EDUCATION - RESIDENTIAL": "pupils",
  "EDUCATION - NON RESIDENTIAL": "pupils",
};

export function extraFieldForType(customerTypeKey: string): "bedrooms" | "pupils" | null {
  return EXTRA_FIELD_BY_TYPE[customerTypeKey] ?? null;
}

/**
 * One customer: the imported side, the typed-in side, and which extra figure
 * their kind of business is measured by.
 *
 * Returns null rather than throwing when the account is not in the current
 * import — a link to a customer who has dropped out of a later workbook should
 * read as "not in this import", not as an error.
 */
export const getCustomer = tenantQuery({
  args: { accountNameKey: v.string() },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return null;

    const account = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_account", (q) =>
        q
          .eq("companyId", companyId)
          .eq("importId", currentImport._id)
          .eq("accountNameKey", args.accountNameKey)
      )
      .unique();

    if (!account) return null;

    const details = await ctx.db
      .query("salesDataCustomers")
      .withIndex("by_company_account", (q) =>
        q.eq("companyId", companyId).eq("accountNameKey", args.accountNameKey)
      )
      .unique();

    let updatedByName: string | null = null;
    if (details) {
      const user = await ctx.db.get(details.updatedBy);
      updatedByName = user?.name ?? user?.email ?? null;
    }

    return {
      ...toCustomer(account, details ?? undefined),
      extraField: extraFieldForType(account.customerTypeKey),
      addressLine1: details?.addressLine1 ?? null,
      addressLine2: details?.addressLine2 ?? null,
      country: details?.country ?? null,
      mobile: details?.mobile ?? null,
      accountsEmail: details?.accountsEmail ?? null,
      contactRole: details?.contactRole ?? null,
      notes: details?.notes ?? null,
      updatedAt: details?.updatedAt ?? null,
      updatedByName,
    };
  },
});

/** The other accounts in the same chain, for the profile's chain list. */
export const listChainMembers = tenantQuery({
  args: { accountNameKey: v.string() },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return [];

    const account = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_account", (q) =>
        q
          .eq("companyId", companyId)
          .eq("importId", currentImport._id)
          .eq("accountNameKey", args.accountNameKey)
      )
      .unique();

    if (!account) return [];

    // Bounded by one chain rather than the whole directory: the index leads on
    // the chain key, so this reads that chain's rows and stops.
    const siblings = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_group_name", (q) =>
        q
          .eq("companyId", companyId)
          .eq("importId", currentImport._id)
          .eq("groupNameKey", account.groupNameKey)
      )
      .take(CHAIN_LIMIT);

    return siblings
      .filter((sibling) => sibling.accountNameKey !== account.accountNameKey)
      .map((sibling) => ({
        accountNameKey: sibling.accountNameKey,
        accountName: sibling.accountName,
        totalRevenue: sibling.totalRevenue,
      }));
  },
});

/** A chain of more than this is a listing, not context — and gets truncated. */
const CHAIN_LIMIT = 50;

/**
 * Save what somebody typed about a customer.
 *
 * Upserts: the row is created the first time a detail is entered, so a
 * directory of empty records never exists. An empty string clears a field
 * rather than storing whitespace, and the account is checked against the
 * current import so a typo in the URL cannot invent a customer.
 */
export const saveCustomerDetails = tenantMutation({
  args: {
    accountNameKey: v.string(),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    town: v.optional(v.string()),
    postcode: v.optional(v.string()),
    country: v.optional(v.string()),
    phone: v.optional(v.string()),
    mobile: v.optional(v.string()),
    email: v.optional(v.string()),
    accountsEmail: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactRole: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    pupils: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const userId = ctx.userId;
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) throw new Error("There is no imported data to attach details to.");

    const account = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_account", (q) =>
        q
          .eq("companyId", companyId)
          .eq("importId", currentImport._id)
          .eq("accountNameKey", args.accountNameKey)
      )
      .unique();

    if (!account) throw new Error("That customer is not in the current import.");

    const { accountNameKey, bedrooms, pupils, ...text } = args;

    // The extra figure belongs to the customer type. Accepting a bedroom count
    // for a school would store a number nothing ever shows again.
    const extraField = extraFieldForType(account.customerTypeKey);

    // An empty box clears the field rather than storing whitespace, so a
    // cleared postcode reads as absent everywhere instead of as a blank string.
    const trimmed = (value: string | undefined) => value?.trim() || undefined;

    const fields = {
      addressLine1: trimmed(text.addressLine1),
      addressLine2: trimmed(text.addressLine2),
      town: trimmed(text.town),
      postcode: trimmed(text.postcode),
      country: trimmed(text.country),
      phone: trimmed(text.phone),
      mobile: trimmed(text.mobile),
      email: trimmed(text.email),
      accountsEmail: trimmed(text.accountsEmail),
      contactName: trimmed(text.contactName),
      contactRole: trimmed(text.contactRole),
      notes: trimmed(text.notes),
      bedrooms: extraField === "bedrooms" ? bedrooms : undefined,
      pupils: extraField === "pupils" ? pupils : undefined,
      updatedAt: Date.now(),
      updatedBy: userId,
    };

    const existing = await ctx.db
      .query("salesDataCustomers")
      .withIndex("by_company_account", (q) =>
        q.eq("companyId", companyId).eq("accountNameKey", accountNameKey)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("salesDataCustomers", {
      companyId,
      accountNameKey,
      ...fields,
    });
  },
});

/** The six period fields, in file order, as the row stores them. */
const PERIOD_FIELDS = ["period1", "period2", "period3", "period4", "period5", "period6"] as const;

function periodValue(row: Doc<"salesDataRows">, index: number): number | undefined {
  return row[PERIOD_FIELDS[index]];
}

/**
 * A customer's sales, split by month.
 *
 * Not an order history, and not called one: the workbook holds one aggregated
 * row per customer per product with six monthly figures, so what can honestly
 * be said is how much was bought in a month and of what. How many deliveries
 * made up that month is not in the file.
 *
 * A month with no value anywhere is left out rather than shown as zero. In this
 * source a blank cell means no sale, which is not the same as a sale of nothing,
 * and the two must stay distinguishable.
 */
export const listCustomerSalesByMonth = tenantQuery({
  args: { accountNameKey: v.string() },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return { months: [], total: 0, periodLabels: [] };

    const rows = await ctx.db
      .query("salesDataRows")
      .withIndex("by_company_import_account_name", (q) =>
        q
          .eq("companyId", companyId)
          .eq("importId", currentImport._id)
          .eq("accountNameKey", args.accountNameKey)
      )
      .take(CUSTOMER_ROW_LIMIT);

    const labels = currentImport.periodLabels ?? [];
    const totals = new Array<number>(PERIOD_FIELDS.length).fill(0);
    const touched = new Array<boolean>(PERIOD_FIELDS.length).fill(false);
    let total = 0;

    for (const row of rows) {
      for (let index = 0; index < PERIOD_FIELDS.length; index += 1) {
        const value = periodValue(row, index);
        if (value === undefined) continue;
        totals[index] += value;
        touched[index] = true;
      }
      total += row.totalRevenue;
    }

    const months = totals
      .map((amount, index) => ({
        periodIndex: index,
        label: labels[index] ?? `Period ${index + 1}`,
        total: amount,
        hasSales: touched[index],
      }))
      .filter((month) => month.hasSales)
      // Newest first: the most recent month is the one somebody rings about.
      .reverse()
      .map(({ hasSales: _hasSales, ...month }) => month);

    return { months, total, periodLabels: labels };
  },
});

/** The product lines behind one month for one customer. */
export const listCustomerSalesForMonth = tenantQuery({
  args: { accountNameKey: v.string(), periodIndex: v.number() },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return [];

    const index = Math.trunc(args.periodIndex);
    if (index < 0 || index >= PERIOD_FIELDS.length) return [];

    const rows = await ctx.db
      .query("salesDataRows")
      .withIndex("by_company_import_account_name", (q) =>
        q
          .eq("companyId", companyId)
          .eq("importId", currentImport._id)
          .eq("accountNameKey", args.accountNameKey)
      )
      .take(CUSTOMER_ROW_LIMIT);

    return rows
      .flatMap((row) => {
        const value = periodValue(row, index);
        if (value === undefined) return [];
        return [
          {
            rowId: row._id,
            productCode: row.productCode,
            productDescription: row.productDescription,
            productCategory: row.productCategory,
            productType: row.productType,
            value,
          },
        ];
      })
      // Biggest line first: on a customer's own page the large lines are the
      // point, unlike the sales table where file order is what matters.
      .sort((left, right) => right.value - left.value);
  },
});

/**
 * A ceiling on one customer's rows.
 *
 * The largest account in the file seen has 469; a thousand is well clear of
 * that while keeping the read bounded. A customer past it would show a
 * truncated history, which is why the screen reports the cap rather than
 * quietly showing less.
 */
const CUSTOMER_ROW_LIMIT = 1000;

/** How many customers the workspace has, for the heading. */
export const countCustomers = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return { total: 0, withDetails: 0 };

    const accounts = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import", (q) =>
        q.eq("companyId", companyId).eq("importId", currentImport._id)
      )
      .collect();

    const details = await loadDetails(ctx, companyId);
    const withDetails = accounts.filter((a) => details.has(a.accountNameKey)).length;

    return { total: accounts.length, withDetails };
  },
});
