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
import { extraFieldForType } from "./salesDataCustomerFields";
import { supersedeResearchForFields } from "./salesDataResearch";
import { RESEARCHABLE_FIELDS, type ResearchField } from "./salesDataResearchService";

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
  /**
   * Narrow to customers still missing something worth researching.
   *
   * The list already knew `hasDetails`; this is what makes it actionable — it
   * is the set the sweep will actually run against, so somebody can see who is
   * about to be researched before pressing the button.
   */
  missingDetailsOnly: v.optional(v.boolean()),
  /**
   * Which kind of record to list.
   *
   * Defaults to customers. Anthony, 2026-08-01: *"we need a filter for customer
   * or prospect on the customer table too."* The list is used every day to look
   * up an account somebody is dealing with, and thirty-nine rows becoming three
   * hundred overnight would break that job to serve a different one — so
   * prospects are one click away rather than mixed in by default.
   */
  record: v.optional(
    v.union(v.literal("CUSTOMERS"), v.literal("PROSPECTS"), v.literal("ALL"))
  ),
};

/**
 * Where a page of the combined list is reading from.
 *
 * Convex allows one paginated query per call, so `ALL` cannot fold two tables
 * together inside a single page. It reads one source at a time instead and the
 * cursor carries which: accounts until they run out, then prospects from the
 * start. One `.paginate()` per invocation, and the guard still passes.
 */
type ListStage = { source: "ACCOUNTS" | "PROSPECTS"; cursor: string | null };

function decodeListStage(cursor: string | null, record: "CUSTOMERS" | "PROSPECTS" | "ALL"): ListStage {
  const first: ListStage["source"] = record === "PROSPECTS" ? "PROSPECTS" : "ACCOUNTS";
  if (!cursor) return { source: first, cursor: null };

  try {
    const parsed = JSON.parse(cursor) as { s?: unknown; c?: unknown };
    if (parsed.s === "PROSPECTS" || parsed.s === "ACCOUNTS") {
      return {
        source: parsed.s,
        cursor: typeof parsed.c === "string" ? parsed.c : null,
      };
    }
  } catch {
    // A cursor from before this shape existed, or a mangled one. Starting over
    // is the same recovery `paginateSafely` makes for an invalid cursor.
  }
  return { source: first, cursor: null };
}

function encodeListStage(stage: ListStage) {
  return JSON.stringify({ s: stage.source, c: stage.cursor });
}

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

/**
 * Which details the agent has already searched for and found unpublished.
 *
 * Read in one go, like the typed-in details and for the same reason: the filter
 * runs as a predicate on an ordered scan and cannot go back to the database
 * mid-scan. Bounded by customers times fields — a few hundred rows on the file
 * seen — and classified in the scale plan on that basis.
 */
async function loadExhaustedFields(
  ctx: TenantQueryCtx,
  companyId: Id<"companies">
): Promise<Map<string, Set<string>>> {
  const rows = await ctx.db
    .query("salesDataCustomerResearch")
    .withIndex("by_company_status_found", (q) =>
      q.eq("companyId", companyId).eq("status", "NOT_FOUND")
    )
    .collect();

  const exhausted = new Map<string, Set<string>>();
  for (const row of rows) {
    const fields = exhausted.get(row.subjectKey) ?? new Set<string>();
    fields.add(row.field);
    exhausted.set(row.subjectKey, fields);
  }
  return exhausted;
}

/**
 * Is there anything left worth researching on this customer?
 *
 * The same question the sweep asks, deliberately — the filter exists so
 * somebody can see who is about to be researched before pressing the button,
 * and a filter that disagreed with the button would be worse than none.
 *
 * That is why a detail already searched for and found unpublished does not
 * count as missing. Country is almost never printed on a British contact page;
 * counting it would leave every customer permanently "incomplete" and the
 * filter would select all thirty-nine for ever.
 */
function hasMissingDetails(
  // Only the type key is read, so a prospect answers this question as well as a
  // customer does. It has to: a prospect is exactly the kind of record somebody
  // filters for, being the half of the list with nothing filled in yet.
  subject: { customerTypeKey: string },
  details: CustomerDetails,
  exhausted: Set<string> | undefined
): boolean {
  const extraField = extraFieldForType(subject.customerTypeKey);

  return (Object.keys(RESEARCHABLE_FIELDS) as ResearchField[]).some((field) => {
    if ((field === "bedrooms" || field === "pupils") && extraField !== field) return false;
    if (exhausted?.has(field)) return false;
    const value = details?.[field];
    if (typeof value === "number") return !Number.isFinite(value);
    return typeof value !== "string" || value.trim().length === 0;
  });
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
    /** What this row is. Present on every row, so no row is ever ambiguous. */
    record: "CUSTOMER" as const,
  };
}

/**
 * A prospect, in the same shape as a customer.
 *
 * Same shape deliberately: the list renders one kind of row, and a screen that
 * had to branch per row is a screen that will eventually show a prospect a
 * customer's six-month spend. There is no spend — it is a business the
 * workspace does not sell to — so the figures are zero and the row says which
 * kind it is.
 */
function toProspectRow(prospect: Doc<"salesDataProspects">, details: CustomerDetails) {
  return {
    accountNameKey: prospect.prospectKey,
    accountName: prospect.siteName,
    accountCode: "",
    groupName: prospect.groupName,
    customerType: prospect.customerType,
    customerTypeKey: prospect.customerTypeKey,
    totalRevenue: 0,
    productCount: 0,
    town: prospect.town ?? details?.town ?? null,
    postcode: prospect.postcode ?? details?.postcode ?? null,
    phone: details?.phone ?? null,
    email: details?.email ?? null,
    contactName: details?.contactName ?? null,
    bedrooms: details?.bedrooms ?? null,
    pupils: details?.pupils ?? null,
    hasDetails: details !== undefined,
    record: "PROSPECT" as const,
  };
}

/**
 * The business behind a key, whether it is a customer or a prospect.
 *
 * Anthony, 2026-08-01: *"we have a set of fields in the CRM and i want each of
 * these for customers and prospects."* So there is one record shape and one
 * screen, and the only differences are the two things a prospect genuinely does
 * not have — an account in the workbook, and a buying history.
 *
 * Returns null when the key is neither, which is what lets the profile say
 * "not in this import" rather than rendering an empty form.
 */
export async function resolveSubject(
  ctx: TenantQueryCtx,
  companyId: Id<"companies">,
  importId: Id<"salesDataImports">,
  key: string
) {
  const account = await ctx.db
    .query("salesDataAccounts")
    .withIndex("by_company_import_account", (q) =>
      q.eq("companyId", companyId).eq("importId", importId).eq("accountNameKey", key)
    )
    .unique();

  if (account) {
    return {
      record: "CUSTOMER" as const,
      key: account.accountNameKey,
      name: account.accountName,
      accountCode: preferredAccountCode(account.codeTally),
      groupName: account.groupName,
      customerType: account.customerType,
      customerTypeKey: account.customerTypeKey,
      totalRevenue: account.totalRevenue,
      productCount: account.productCount,
      prospect: null,
    };
  }

  const prospect = await ctx.db
    .query("salesDataProspects")
    .withIndex("by_company_prospect", (q) => q.eq("companyId", companyId).eq("prospectKey", key))
    .unique();

  if (!prospect) return null;

  return {
    record: "PROSPECT" as const,
    key: prospect.prospectKey,
    name: prospect.siteName,
    accountCode: "",
    groupName: prospect.groupName,
    customerType: prospect.customerType,
    customerTypeKey: prospect.customerTypeKey,
    totalRevenue: 0,
    productCount: 0,
    prospect: {
      status: prospect.status,
      town: prospect.town ?? null,
      postcode: prospect.postcode ?? null,
      conflictNote: prospect.conflictNote ?? null,
      sourceUrl: prospect.sourceUrl ?? null,
      sourceName: prospect.sourceName ?? null,
      reasoning: prospect.reasoning ?? null,
      foundAt: prospect.foundAt,
    },
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
    const exhausted = args.missingDetailsOnly
      ? await loadExhaustedFields(ctx, companyId)
      : new Map<string, Set<string>>();

    const record = args.record ?? "CUSTOMERS";
    const stage = decodeListStage(args.paginationOpts.cursor, record);
    const isNarrowed =
      terms.length > 0
      || Boolean(args.customerType || args.groupName || args.missingDetailsOnly);

    // One `.paginate()` runs per invocation. This branch and the accounts scan
    // below are alternatives, never a sequence.
    if (stage.source === "PROSPECTS") {
      const prospectPage = await paginateSafely(
        (opts) =>
          paginatePage(
            () =>
              ctx.db
                .query("salesDataProspects")
                .withIndex("by_company_group", (q) => q.eq("companyId", companyId)),
            (prospect: Doc<"salesDataProspects">) => {
              // A prospect that started buying is a customer now, and appears in
              // the accounts half. Showing it here as well would double it.
              if (prospect.status !== "NEW") return false;
              const typed = details.get(prospect.prospectKey);
              return (
                matchesFilter(args.customerType, prospect.customerType) &&
                matchesFilter(args.groupName, prospect.groupName) &&
                (!args.missingDetailsOnly
                  || hasMissingDetails(prospect, typed, exhausted.get(prospect.prospectKey))) &&
                matchesSearch(
                  [
                    prospect.siteName,
                    prospect.groupName,
                    prospect.customerType,
                    prospect.town,
                    prospect.postcode,
                    typed?.phone,
                    typed?.email,
                    typed?.contactName,
                  ],
                  terms
                )
              );
            },
            // Always the filtered path, whatever the dropdowns say: converted
            // and dismissed prospects have to be dropped, and an unfiltered
            // scan would return them.
            true,
            opts
          ),
        { ...args.paginationOpts, cursor: stage.cursor }
      );

      return {
        ...prospectPage,
        continueCursor: encodeListStage({
          source: "PROSPECTS",
          cursor: prospectPage.continueCursor,
        }),
        page: prospectPage.page.map((prospect) =>
          toProspectRow(prospect, details.get(prospect.prospectKey))
        ),
      };
    }

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
              (!args.missingDetailsOnly
                || hasMissingDetails(account, typed, exhausted.get(account.accountNameKey))) &&
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
          isNarrowed,
          opts
        ),
      { ...args.paginationOpts, cursor: stage.cursor }
    );

    // The last page of accounts is not the end of an `ALL` listing — it is the
    // handover. Reporting done here would hide every prospect.
    if (record === "ALL" && page.isDone) {
      return {
        ...page,
        isDone: false,
        continueCursor: encodeListStage({ source: "PROSPECTS", cursor: null }),
        page: page.page.map((account) => toCustomer(account, details.get(account.accountNameKey))),
      };
    }

    return {
      ...page,
      continueCursor: encodeListStage({ source: "ACCOUNTS", cursor: page.continueCursor }),
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
 * Care homes and hotels count bedrooms; schools count pupils. Matched on the
 * normalised key, so a workbook that respells a type keeps its field.
 *
 * The rule moved to its own file once the research agent needed it too — this
 * file and that one cannot import each other — and is re-exported here so the
 * screens and tests that already read it from this module still do.
 */
export { extraFieldForType };

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

    const subject = await resolveSubject(ctx, companyId, currentImport._id, args.accountNameKey);
    if (!subject) return null;

    const details = await ctx.db
      .query("salesDataCustomers")
      .withIndex("by_company_account", (q) =>
        q.eq("companyId", companyId).eq("accountNameKey", subject.key)
      )
      .unique();

    let updatedByName: string | null = null;
    if (details) {
      const user = await ctx.db.get(details.updatedBy);
      updatedByName = user?.name ?? user?.email ?? null;
    }

    return {
      accountNameKey: subject.key,
      accountName: subject.name,
      accountCode: subject.accountCode,
      groupName: subject.groupName,
      customerType: subject.customerType,
      customerTypeKey: subject.customerTypeKey,
      totalRevenue: subject.totalRevenue,
      productCount: subject.productCount,
      record: subject.record,
      /** Where a prospect came from. Null for a customer, which came from the workbook. */
      prospect: subject.prospect,
      extraField: extraFieldForType(subject.customerTypeKey),
      // A prospect's town and postcode are known from the page that listed it,
      // so the form is not empty before anybody researches it.
      town: details?.town ?? subject.prospect?.town ?? null,
      postcode: details?.postcode ?? subject.prospect?.postcode ?? null,
      phone: details?.phone ?? null,
      email: details?.email ?? null,
      contactName: details?.contactName ?? null,
      bedrooms: details?.bedrooms ?? null,
      pupils: details?.pupils ?? null,
      hasDetails: details !== null,
      addressLine1: details?.addressLine1 ?? null,
      addressLine2: details?.addressLine2 ?? null,
      country: details?.country ?? null,
      mobile: details?.mobile ?? null,
      accountsEmail: details?.accountsEmail ?? null,
      website: details?.website ?? null,
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
    website: v.optional(v.string()),
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

    // A prospect has the same record as a customer and the same form, so the
    // save has to accept its key too — it simply has no account behind it.
    const subject = await resolveSubject(ctx, companyId, currentImport._id, args.accountNameKey);
    if (!subject) throw new Error("That customer is not in the current import.");

    const { accountNameKey, bedrooms, pupils, ...text } = args;

    // The extra figure belongs to the customer type. Accepting a bedroom count
    // for a school would store a number nothing ever shows again.
    const extraField = extraFieldForType(subject.customerTypeKey);

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
      website: trimmed(text.website),
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

    // A person's edit outranks anything the research agent found. Only the
    // fields whose value actually moved are superseded: the form re-submits
    // every box on every save, so comparing against what was there is what
    // stops one corrected phone number stripping the source marker off ten
    // other fields.
    const changedFields = (Object.keys(RESEARCHABLE_FIELDS) as ResearchField[]).filter((field) => {
      const next = fields[field];
      const previous = existing?.[field];
      return (next ?? undefined) !== (previous ?? undefined);
    });

    if (changedFields.length > 0) {
      await supersedeResearchForFields(ctx, {
        companyId,
        subjectKey: accountNameKey,
        fields: changedFields,
        actorId: userId,
        now: fields.updatedAt,
      });
    }

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
    if (!currentImport) return { total: 0, withDetails: 0, prospects: 0 };

    const accounts = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import", (q) =>
        q.eq("companyId", companyId).eq("importId", currentImport._id)
      )
      .collect();

    const details = await loadDetails(ctx, companyId);
    const withDetails = accounts.filter((a) => details.has(a.accountNameKey)).length;

    // Counted here so the gap is visible above the list without anybody
    // changing the filter to find out it exists.
    const prospects = await ctx.db
      .query("salesDataProspects")
      .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "NEW"))
      .collect();

    return { total: accounts.length, withDetails, prospects: prospects.length };
  },
});
