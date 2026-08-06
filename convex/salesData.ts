import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { normalizeKey } from "./salesDataImportService";
import type { Id } from "./_generated/dataModel";
import {
  requireTenant,
  tenantMutation,
  tenantQuery,
  type TenantMutationCtx,
  type TenantQueryCtx,
} from "./tenantFunctions";
import { isModuleEnabled } from "./utils/companyModules";
import { SALES_DATA_MODULE_KEY } from "./utils/salesDataModule";
import { getActiveCompanyId } from "./authz";

/**
 * Reading and writing the imported workbook.
 *
 * Two things shape this file.
 *
 * The first is that the section is optional. Every entry point re-checks the
 * module flag rather than trusting that the navigation hid the link, because
 * the navigation is a rendering decision and this is an authorisation one.
 *
 * The second is how a replace is done. The obvious implementation — delete the
 * old rows, then insert the new ones — leaves the workspace staring at an
 * empty table for as long as the import takes, and at a permanently empty one
 * if the file turns out to be malformed halfway through. Instead every row is
 * tagged with the import that produced it, the new rows are written alongside
 * the old, and only once the whole file is in does the previous import's data
 * go. A failed import therefore changes nothing.
 */

const MODULE_DISABLED_MESSAGE = "Sales Data is not enabled for this workspace.";

/**
 * The caller's company, once confirmed to have the module.
 *
 * A super admin who is not impersonating has no active company and so has no
 * data to look at; that reads as a refusal rather than as a listing of every
 * workspace's figures.
 */
export async function requireSalesDataCompany(
  ctx: TenantQueryCtx | TenantMutationCtx
): Promise<Id<"companies">> {
  const companyId = requireTenant(ctx, MODULE_DISABLED_MESSAGE);
  const company = await ctx.db.get(companyId);

  if (!isModuleEnabled(company, SALES_DATA_MODULE_KEY)) {
    throw new Error(MODULE_DISABLED_MESSAGE);
  }

  return companyId;
}

/**
 * The import whose rows are currently on screen, if there is one.
 *
 * At most one import is ever completed and not yet superseded, so this reads
 * backwards from the newest and stops at the first match — past the failed and
 * still-running attempts sitting above it, however many of those there are.
 */
export async function getCurrentImport(
  // Only the reader is needed, and widening it to that is what lets the agent's
  // internal functions reuse this. They are handed a company by the tool
  // context rather than resolving one from a signed-in person, so they never
  // hold a tenant context.
  ctx: Pick<TenantQueryCtx, "db"> | Pick<TenantMutationCtx, "db">,
  companyId: Id<"companies">
) {
  return await ctx.db
    .query("salesDataImports")
    .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
    .order("desc")
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "COMPLETED"),
        q.eq(q.field("supersededAt"), undefined)
      )
    )
    .first();
}

// === Queries ===========================================================

/**
 * Everything the section needs to render its shell: whether the caller may be
 * here at all, what the workspace is called, and what the current data is.
 *
 * One query rather than three because the layout has to decide whether to
 * redirect before it can show anything, and three round trips would mean three
 * chances to flash the wrong thing.
 */
export const getSectionOverview = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = ctx.companyId;
    if (!companyId) {
      return { enabled: false as const, companyName: null, currentImport: null };
    }

    const company = await ctx.db.get(companyId);
    if (!isModuleEnabled(company, SALES_DATA_MODULE_KEY)) {
      return { enabled: false as const, companyName: null, currentImport: null };
    }

    const currentImport = await getCurrentImport(ctx, companyId);

    return {
      enabled: true as const,
      companyName: company?.name ?? null,
      currentImport: currentImport
        ? {
            _id: currentImport._id,
            fileName: currentImport.fileName,
            periodLabels: currentImport.periodLabels ?? [],
            salesRowCount: currentImport.salesRowCount ?? 0,
            categoryRowCount: currentImport.categoryRowCount ?? 0,
            areasOfInterestRowCount: currentImport.areasOfInterestRowCount ?? 0,
            frequencyRowCount: currentImport.frequencyRowCount ?? 0,
            completedAt: currentImport.completedAt ?? null,
          }
        : null,
    };
  },
});

/** The import history, newest first. Small by nature — one row per upload. */
export const listImports = tenantQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

    const imports = await ctx.db
      .query("salesDataImports")
      .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(limit);

    // An import whose author was erased keeps the import and loses the name.
    const importedByNames = new Map<Id<"users">, string>();
    for (const record of imports) {
      if (!record.importedBy || importedByNames.has(record.importedBy)) continue;
      const user = await ctx.db.get(record.importedBy);
      importedByNames.set(record.importedBy, user?.name ?? user?.email ?? "");
    }

    return imports.map((record) => ({
      _id: record._id,
      fileName: record.fileName,
      status: record.status,
      periodLabels: record.periodLabels ?? [],
      salesRowCount: record.salesRowCount ?? 0,
      categoryRowCount: record.categoryRowCount ?? 0,
      areasOfInterestRowCount: record.areasOfInterestRowCount ?? 0,
      frequencyRowCount: record.frequencyRowCount ?? 0,
      error: record.error ?? null,
      supersededAt: record.supersededAt ?? null,
      startedAt: record.startedAt,
      completedAt: record.completedAt ?? null,
      importedByName: (record.importedBy ? importedByNames.get(record.importedBy) : "") ?? "",
    }));
  },
});

/**
 * Paginate, and survive a cursor that no longer belongs to this query.
 *
 * A Convex cursor is tied to the exact query that produced it. The browser
 * holds cursors in component state, so any change on this side — a different
 * sort index, a fresh import, a redeploy — leaves the page holding one the
 * server will reject. Left alone that throws `InvalidCursor` and takes the
 * whole screen down, which is what happened when the sales table moved from
 * revenue order to file order.
 *
 * Falling back to the first page is the right recovery: the caller asked for
 * data and there is data to give, just not from where they last were.
 */
export async function paginateSafely<T>(
  run: (opts: { numItems: number; cursor: string | null }) => Promise<T>,
  paginationOpts: { numItems: number; cursor: string | null }
): Promise<T> {
  try {
    return await run(paginationOpts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("InvalidCursor")) throw error;
    return await run({ ...paginationOpts, cursor: null });
  }
}

/**
 * Search and filter arguments, shared by the four table queries.
 *
 * `search` is free text typed into the box above a table. The filters are the
 * sales table's three dropdowns; the other three tables take search only,
 * because they have two or three columns and nothing worth narrowing.
 */
const tableQueryArgs = {
  paginationOpts: paginationOptsValidator,
  search: v.optional(v.string()),
};

const salesFilterArgs = {
  customerType: v.optional(v.string()),
  accountName: v.optional(v.string()),
  groupName: v.optional(v.string()),
};

/** The categories and areas-of-interest worksheets both narrow by who buys. */
const customerTypeFilterArgs = {
  customerType: v.optional(v.string()),
};

const frequencyFilterArgs = {
  productCategory: v.optional(v.string()),
  productType: v.optional(v.string()),
  frequency: v.optional(v.string()),
};

/**
 * How the search boxes match.
 *
 * Every whitespace-separated term has to appear somewhere in the row, as a
 * substring, ignoring case — so `brack 200` finds a 200mm wall bracket whether
 * the two words sit in one column or two. Substring rather than the whole-word
 * matching a Convex search index does, because these columns hold product
 * codes and account names that people search by fragment: `BRK-2` should find
 * `BRK-200`, and a search index would not.
 *
 * The term count is capped because each one is another pass over every
 * candidate row, and nobody narrows a table with twelve words.
 */
const SEARCH_TERM_LIMIT = 8;

export function searchTerms(search: string | undefined): string[] {
  if (!search) return [];
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, SEARCH_TERM_LIMIT);
}

export function matchesSearch(fields: Array<string | number | undefined>, terms: string[]) {
  if (terms.length === 0) return true;

  const haystack = fields
    .filter((field) => field !== undefined)
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

/**
 * A dropdown selection matches on the same normalised key the import uses, not
 * on the raw text. The source spells the same customer type more than one way,
 * and a filter that misses the rows spelled differently is worse than no
 * filter — it reads as "these are all of them".
 */
export function matchesFilter(selected: string | undefined, value: string) {
  if (!selected) return true;
  return normalizeKey(value) === normalizeKey(selected);
}

/** A query that can be paginated or walked row by row. */
type ScannableQuery<T> = AsyncIterable<T> & {
  paginate: (opts: { numItems: number; cursor: string | null }) => Promise<{
    page: T[];
    isDone: boolean;
    continueCursor: string;
  }>;
};

/**
 * A ceiling on how far one page will scan for matches.
 *
 * A search that matches nothing otherwise walks the entire import before
 * admitting it. The cap is well above the size of a real file, so it is a
 * backstop rather than a limit anyone meets: reaching it returns what was
 * found so far with more to come, and Next carries on from there.
 */
const MAX_SCAN_PER_PAGE = 16384;

/**
 * How a narrowed page is positioned: by how many matches precede it.
 *
 * A Convex cursor cannot be used once a predicate is involved. `filter` from
 * convex-helpers reads a page and then filters it, so `numItems` counts rows
 * *scanned* rather than rows kept, and a search matching one row in fifty
 * gives pages of nought and one. Reading repeatedly until the page fills is
 * the obvious repair and is not allowed: Convex permits one paginated query
 * per function, and rejects the second `.paginate()` at runtime.
 *
 * So a narrowed page counts instead. The cursor is the number of matching rows
 * already shown, and the scan walks from the start of the import each time,
 * skipping that many matches. Scanning the file per page is affordable at a
 * few thousand rows — the predicate has to see every row anyway — and it is
 * the count, not a position, that survives the row underneath it changing.
 */
function parseMatchOffset(cursor: string | null): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  // Anything else is a Convex cursor left over from the unnarrowed query, and
  // the honest reading of "I do not know where this is" is the first page.
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

async function paginateFiltered<T>(
  buildQuery: () => ScannableQuery<T>,
  matches: (doc: T) => boolean,
  paginationOpts: { numItems: number; cursor: string | null }
) {
  const offset = parseMatchOffset(paginationOpts.cursor);
  const page: T[] = [];
  let matched = 0;
  let scanned = 0;
  let hasMore = false;

  for await (const doc of buildQuery()) {
    scanned++;
    if (!matches(doc)) {
      if (scanned >= MAX_SCAN_PER_PAGE) {
        hasMore = true;
        break;
      }
      continue;
    }

    matched++;
    if (matched <= offset) continue;

    // One row past the page is read rather than assumed: it is the difference
    // between a Next button that is there because there is more, and one that
    // is there because nobody checked.
    if (page.length === paginationOpts.numItems) {
      hasMore = true;
      break;
    }
    page.push(doc);
  }

  return {
    page,
    isDone: !hasMore,
    continueCursor: String(offset + page.length),
  };
}

/**
 * One page of a table, narrowed or not.
 *
 * With nothing typed and nothing selected this is the plain Convex paginated
 * query it has always been — real cursors, no scan. The counting scan above is
 * only reached once there is a predicate to apply, so the ordinary case does
 * not pay for the search box being on the screen.
 */
export async function paginatePage<T>(
  buildQuery: () => ScannableQuery<T>,
  matches: (doc: T) => boolean,
  isNarrowed: boolean,
  paginationOpts: { numItems: number; cursor: string | null }
) {
  if (!isNarrowed) return await buildQuery().paginate(paginationOpts);
  return await paginateFiltered(buildQuery, matches, paginationOpts);
}

/**
 * The sales table, in the order the spreadsheet has it.
 *
 * Paginated in the database, not in the browser: 4,500 rows of sixteen columns
 * is several megabytes, and the whole point of the screen is that it stays
 * quick as the file grows.
 *
 * Search and the filters run as a predicate inside the paginator rather than
 * through the `search_product` index. The plan called this out as the decision
 * to make first: Convex cannot combine a full-text search with an ordered
 * range scan, so using the index would mean giving up file order the moment
 * someone types — and file order is the reason this table can be read against
 * the spreadsheet at all. Filtering the ordered scan keeps the order and costs
 * bandwidth instead: rows that fail the predicate are read and discarded, so a
 * search that matches nothing walks the whole import. At a few thousand rows
 * that is the cheaper side of the trade; at ten times the size it would not be,
 * and the answer then is a stored search field, not a search index.
 */
export const listSalesRows = tenantQuery({
  args: { ...tableQueryArgs, ...salesFilterArgs },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return emptyPage(args.paginationOpts);

    const terms = searchTerms(args.search);

    // File order, ascending. Sorting by value put the biggest spenders first,
    // which meant nothing on screen could be matched against the spreadsheet.
    return await paginateSafely(
      (opts) =>
        paginatePage(
          () =>
            ctx.db
              .query("salesDataRows")
              .withIndex("by_company_import_row", (q) =>
                q.eq("companyId", companyId).eq("importId", currentImport._id)
              ),
          (row) =>
            matchesFilter(args.customerType, row.customerType) &&
            matchesFilter(args.accountName, row.accountName) &&
            matchesFilter(args.groupName, row.groupName) &&
            matchesSearch(
              [
                row.sourceRow,
                row.parentAccount,
                row.groupName,
                row.accountName,
                row.customerType,
                row.productCode,
                row.uniqueId,
                row.productDescription,
                row.productCategory,
                row.productType,
              ],
              terms
            ),
          terms.length > 0 ||
            Boolean(args.customerType || args.accountName || args.groupName),
          opts
        ),
      args.paginationOpts
    );
  },
});

/**
 * The values behind the sales table's three dropdowns.
 *
 * Built from the rows rather than stored on the import, so they cannot drift
 * out of step with what the table actually holds. That means a scan of the
 * current import per subscription — which Convex caches until the rows change,
 * and the rows change once per import.
 *
 * Options are deduplicated on the normalised key and shown with the first
 * spelling seen, matching how `matchesFilter` compares them: two spellings of
 * one customer type are one entry in the list, and picking it finds the rows
 * under both.
 */
export const listSalesFilterOptions = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) {
      return { customerTypes: [], accountNames: [], groupNames: [] };
    }

    const rows = await ctx.db
      .query("salesDataRows")
      .withIndex("by_company_import", (q) =>
        q.eq("companyId", companyId).eq("importId", currentImport._id)
      )
      .collect();

    return {
      customerTypes: distinctValues(rows, (row) => row.customerType),
      accountNames: distinctValues(rows, (row) => row.accountName),
      groupNames: distinctValues(rows, (row) => row.groupName),
    };
  },
});

/**
 * The distinct values of one column, ready for a dropdown.
 *
 * Deduplicated on the normalised key and shown with the first spelling seen,
 * matching how `matchesFilter` compares: two spellings of one value are one
 * entry, and picking it finds the rows under both.
 */
export function distinctValues<T>(rows: T[], select: (row: T) => string): string[] {
  const seen = new Map<string, string>();

  for (const row of rows) {
    const trimmed = select(row).trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (!seen.has(key)) seen.set(key, trimmed);
  }

  return [...seen.values()].sort((a, b) => a.localeCompare(b, "en-GB"));
}

/**
 * The values behind the dropdowns on the other three worksheets.
 *
 * One query rather than three, taking the tab being looked at, because only the
 * visible tab's options are ever needed and a query per table would scan tables
 * nobody is looking at. The shape returned is the same either way, so the
 * screen reads whichever lists apply to its tab.
 */
export const listTableFilterOptions = tenantQuery({
  args: {
    table: v.union(v.literal("categories"), v.literal("interest"), v.literal("frequency")),
  },
  handler: async (ctx, args) => {
    const empty = {
      customerTypes: [] as string[],
      productCategories: [] as string[],
      productTypes: [] as string[],
      frequencies: [] as string[],
    };

    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return empty;

    if (args.table === "categories") {
      const rows = await ctx.db
        .query("salesDataCategoryLinks")
        .withIndex("by_company_import", (q) =>
          q.eq("companyId", companyId).eq("importId", currentImport._id)
        )
        .collect();
      return { ...empty, customerTypes: distinctValues(rows, (row) => row.customerType) };
    }

    if (args.table === "interest") {
      const rows = await ctx.db
        .query("salesDataAreasOfInterest")
        .withIndex("by_company_import", (q) =>
          q.eq("companyId", companyId).eq("importId", currentImport._id)
        )
        .collect();
      return { ...empty, customerTypes: distinctValues(rows, (row) => row.customerType) };
    }

    const rows = await ctx.db
      .query("salesDataFrequencies")
      .withIndex("by_company_import", (q) =>
        q.eq("companyId", companyId).eq("importId", currentImport._id)
      )
      .collect();

    return {
      ...empty,
      productCategories: distinctValues(rows, (row) => row.productCategory),
      productTypes: distinctValues(rows, (row) => row.productType),
      frequencies: distinctValues(rows, (row) => row.frequency),
    };
  },
});

export const listCategoryLinks = tenantQuery({
  args: { ...tableQueryArgs, ...customerTypeFilterArgs },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return emptyPage(args.paginationOpts);

    const terms = searchTerms(args.search);

    return await paginateSafely(
      (opts) =>
        paginatePage(
          () =>
            ctx.db
              .query("salesDataCategoryLinks")
              .withIndex("by_company_import", (q) =>
                q.eq("companyId", companyId).eq("importId", currentImport._id)
              ),
          (row) =>
            matchesFilter(args.customerType, row.customerType) &&
            matchesSearch([row.customerType, row.category], terms),
          terms.length > 0 || Boolean(args.customerType),
          opts
        ),
      args.paginationOpts
    );
  },
});

export const listAreasOfInterest = tenantQuery({
  args: { ...tableQueryArgs, ...customerTypeFilterArgs },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return emptyPage(args.paginationOpts);

    const terms = searchTerms(args.search);

    return await paginateSafely(
      (opts) =>
        paginatePage(
          () =>
            ctx.db
              .query("salesDataAreasOfInterest")
              .withIndex("by_company_import", (q) =>
                q.eq("companyId", companyId).eq("importId", currentImport._id)
              ),
          (row) =>
            matchesFilter(args.customerType, row.customerType) &&
            matchesSearch([row.customerType, row.productType], terms),
          terms.length > 0 || Boolean(args.customerType),
          opts
        ),
      args.paginationOpts
    );
  },
});

/**
 * The frequency table, narrowable by category, product type and how often the
 * type sells. The three combine, so Bathroom *and* Sporadic narrows to rows
 * matching both.
 *
 * `frequency` is compared on the normalised key like the others even though it
 * has no stored key column, because `matchesFilter` normalises both sides as it
 * compares. That keeps `Regular` and `regular ` one option rather than two, and
 * needs no change to what the importer writes — so it works on imports that are
 * already in the database.
 */
export const listFrequencies = tenantQuery({
  args: { ...tableQueryArgs, ...frequencyFilterArgs },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) return emptyPage(args.paginationOpts);

    const terms = searchTerms(args.search);

    return await paginateSafely(
      (opts) =>
        paginatePage(
          () =>
            ctx.db
              .query("salesDataFrequencies")
              .withIndex("by_company_import", (q) =>
                q.eq("companyId", companyId).eq("importId", currentImport._id)
              ),
          (row) =>
            matchesFilter(args.productCategory, row.productCategory) &&
            matchesFilter(args.productType, row.productType) &&
            matchesFilter(args.frequency, row.frequency) &&
            matchesSearch([row.productCategory, row.productType, row.frequency], terms),
          terms.length > 0 ||
            Boolean(args.productCategory || args.productType || args.frequency),
          opts
        ),
      args.paginationOpts
    );
  },
});

/** A workspace with no completed import yet still needs a well-formed page. */
export function emptyPage(paginationOpts: { cursor: string | null }) {
  return {
    page: [],
    isDone: true,
    continueCursor: paginationOpts.cursor ?? "",
  };
}

// === Upload ============================================================

export const generateUploadUrl = tenantMutation({
  args: {},
  handler: async (ctx) => {
    await requireSalesDataCompany(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// === Internal writes, driven by the import action ======================

/**
 * Confirm the caller may import, and open an import record.
 *
 * The check lives here rather than in the action because an action cannot read
 * the database, and the module flag is in the database. The action passes the
 * caller through and this decides.
 */
export const startImportInternal = internalMutation({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    fileName: v.string(),
    sheetMapping: v.object({
      sales: v.number(),
      categories: v.number(),
      areasOfInterest: v.number(),
      frequency: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!isModuleEnabled(company, SALES_DATA_MODULE_KEY)) {
      throw new Error(MODULE_DISABLED_MESSAGE);
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Unauthorized");
    if (user.role !== "SUPER_ADMIN" && user.companyId !== args.companyId) {
      throw new Error("Unauthorized");
    }

    return await ctx.db.insert("salesDataImports", {
      companyId: args.companyId,
      fileName: args.fileName,
      status: "RUNNING",
      sheetMapping: args.sheetMapping,
      importedBy: args.userId,
      startedAt: Date.now(),
    });
  },
});

const salesRowValidator = v.object({
  sourceRow: v.number(),
  parentAccount: v.string(),
  groupName: v.string(),
  accountName: v.string(),
  customerType: v.string(),
  productCode: v.string(),
  uniqueId: v.string(),
  productDescription: v.string(),
  productCategory: v.string(),
  productType: v.string(),
  customerTypeKey: v.string(),
  productCategoryKey: v.string(),
  productTypeKey: v.string(),
  period1: v.optional(v.number()),
  period2: v.optional(v.number()),
  period3: v.optional(v.number()),
  period4: v.optional(v.number()),
  period5: v.optional(v.number()),
  period6: v.optional(v.number()),
  quantity: v.optional(v.number()),
  totalRevenue: v.number(),
});

export const insertSalesRowsInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    rows: v.array(salesRowValidator),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("salesDataRows", {
        companyId: args.companyId,
        importId: args.importId,
        // Derived here rather than asked of the caller: it must agree with the
        // key the customer directory folds on, and one place computing it is
        // how that stays true.
        accountNameKey: normalizeKey(row.accountName),
        ...row,
      });
    }

    await recordAccounts(ctx, args.companyId, args.importId, args.rows);

    return args.rows.length;
  },
});

/**
 * Keep the customer directory in step with the rows just written.
 *
 * The batch is folded down first so an account appearing on two hundred rows
 * costs one read and one write here rather than two hundred of each — the
 * directory is 39 rows against 4,568, and the difference is what keeps the
 * import inside Convex's per-transaction limits.
 */
export async function recordAccounts(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  importId: Id<"salesDataImports">,
  rows: Array<{
    accountName: string;
    parentAccount: string;
    groupName: string;
    customerType: string;
    customerTypeKey: string;
    totalRevenue: number;
  }>
) {
  const batch = new Map<
    string,
    {
      accountName: string;
      groupName: string;
      customerType: string;
      customerTypeKey: string;
      codeTally: Record<string, number>;
      totalRevenue: number;
      productCount: number;
    }
  >();

  for (const row of rows) {
    const accountNameKey = normalizeKey(row.accountName);
    if (!accountNameKey) continue;

    const entry = batch.get(accountNameKey) ?? {
      accountName: row.accountName.trim(),
      groupName: row.groupName.trim(),
      customerType: row.customerType.trim(),
      customerTypeKey: row.customerTypeKey,
      codeTally: {},
      totalRevenue: 0,
      productCount: 0,
    };

    const code = row.parentAccount.trim();
    if (code) entry.codeTally[code] = (entry.codeTally[code] ?? 0) + 1;
    entry.totalRevenue += row.totalRevenue;
    entry.productCount += 1;

    batch.set(accountNameKey, entry);
  }

  for (const [accountNameKey, entry] of batch) {
    const existing = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_account", (q) =>
        q.eq("companyId", companyId).eq("importId", importId).eq("accountNameKey", accountNameKey)
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("salesDataAccounts", {
        companyId,
        importId,
        accountNameKey,
        accountName: entry.accountName,
        codeTally: entry.codeTally,
        groupName: entry.groupName,
        groupNameKey: normalizeKey(entry.groupName),
        customerType: entry.customerType,
        customerTypeKey: entry.customerTypeKey,
        totalRevenue: entry.totalRevenue,
        productCount: entry.productCount,
      });
      continue;
    }

    const codeTally = { ...existing.codeTally };
    for (const [code, count] of Object.entries(entry.codeTally)) {
      codeTally[code] = (codeTally[code] ?? 0) + count;
    }

    await ctx.db.patch(existing._id, {
      codeTally,
      totalRevenue: existing.totalRevenue + entry.totalRevenue,
      productCount: existing.productCount + entry.productCount,
    });
  }

  await promoteProspects(ctx, companyId, [...batch.keys()]);
}

/**
 * A prospect that starts buying becomes a customer.
 *
 * Run on the same pass that writes the account directory. Whatever was
 * researched about the site carries straight onto the customer record, because
 * the details are keyed on the same normalised name either way — so nobody
 * re-types an address, and no duplicate row appears on the list.
 *
 * Idempotent like the rest of the import: a prospect already marked converted
 * is left alone, and a re-import of the same workbook changes nothing.
 */
async function promoteProspects(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  accountNameKeys: string[]
) {
  for (const accountNameKey of accountNameKeys) {
    const prospect = await ctx.db
      .query("salesDataProspects")
      .withIndex("by_company_prospect", (q) =>
        q.eq("companyId", companyId).eq("prospectKey", accountNameKey)
      )
      .unique();

    if (!prospect || prospect.status === "CONVERTED") continue;

    await ctx.db.patch(prospect._id, { status: "CONVERTED", decidedAt: Date.now() });
  }
}

/**
 * The account code to show: the one most rows agree on.
 *
 * See the `codeTally` note on the table — a single spelling cannot be trusted
 * while the workbook has rows carrying a stray value in the code column.
 */
export function preferredAccountCode(codeTally: Record<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [code, count] of Object.entries(codeTally)) {
    if (count > bestCount || (count === bestCount && code < best)) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

export const insertCategoryLinksInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    rows: v.array(
      v.object({
        customerType: v.string(),
        customerTypeKey: v.string(),
        category: v.string(),
        categoryKey: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("salesDataCategoryLinks", {
        companyId: args.companyId,
        importId: args.importId,
        ...row,
      });
    }
    return args.rows.length;
  },
});

export const insertAreasOfInterestInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    rows: v.array(
      v.object({
        customerType: v.string(),
        customerTypeKey: v.string(),
        productType: v.string(),
        productTypeKey: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("salesDataAreasOfInterest", {
        companyId: args.companyId,
        importId: args.importId,
        ...row,
      });
    }
    return args.rows.length;
  },
});

export const insertFrequenciesInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    importId: v.id("salesDataImports"),
    rows: v.array(
      v.object({
        productCategory: v.string(),
        productType: v.string(),
        frequency: v.string(),
        productCategoryKey: v.string(),
        productTypeKey: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("salesDataFrequencies", {
        companyId: args.companyId,
        importId: args.importId,
        ...row,
      });
    }
    return args.rows.length;
  },
});

/** How many rows one mutation deletes. Kept well inside Convex's write limit. */
const PURGE_BATCH_SIZE = 400;

/**
 * Drop one batch of rows belonging to any import other than the given one.
 *
 * Returns whether there is more to do, so the caller can keep going. Doing the
 * whole purge in a single mutation would exceed the per-transaction write
 * limit on a file this size, and doing it inside the insert path would put a
 * multi-second delete in front of the data appearing.
 */
export const purgeSupersededRowsInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    keepImportId: v.id("salesDataImports"),
  },
  handler: async (ctx, args) => {
    let deleted = 0;

    const dropFrom = async (
      table:
        | "salesDataRows"
        | "salesDataCategoryLinks"
        | "salesDataAreasOfInterest"
        | "salesDataFrequencies"
        | "salesDataAccounts"
    ) => {
      if (deleted >= PURGE_BATCH_SIZE) return;

      const stale = await ctx.db
        .query(table)
        .withIndex("by_company_import", (q) => q.eq("companyId", args.companyId))
        .filter((q) => q.neq(q.field("importId"), args.keepImportId))
        .take(PURGE_BATCH_SIZE - deleted);

      for (const row of stale) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    };

    await dropFrom("salesDataRows");
    await dropFrom("salesDataCategoryLinks");
    await dropFrom("salesDataAreasOfInterest");
    await dropFrom("salesDataFrequencies");
    await dropFrom("salesDataAccounts");

    return { deleted, hasMore: deleted >= PURGE_BATCH_SIZE };
  },
});

export const completeImportInternal = internalMutation({
  args: {
    importId: v.id("salesDataImports"),
    periodLabels: v.array(v.string()),
    salesRowCount: v.number(),
    categoryRowCount: v.number(),
    areasOfInterestRowCount: v.number(),
    frequencyRowCount: v.number(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.importId);
    if (!record) throw new Error("Import not found");

    const now = Date.now();

    // Everything this workspace imported before is now history. Marking them
    // here, in the same transaction that completes the new one, means there is
    // never a moment when two imports both look current.
    const previous = await ctx.db
      .query("salesDataImports")
      .withIndex("by_company_started", (q) => q.eq("companyId", record.companyId))
      .order("desc")
      .take(100);

    for (const other of previous) {
      if (other._id === args.importId) continue;
      if (other.status !== "COMPLETED" || other.supersededAt) continue;
      await ctx.db.patch(other._id, { supersededAt: now });
    }

    await ctx.db.patch(args.importId, {
      status: "COMPLETED",
      periodLabels: args.periodLabels,
      salesRowCount: args.salesRowCount,
      categoryRowCount: args.categoryRowCount,
      areasOfInterestRowCount: args.areasOfInterestRowCount,
      frequencyRowCount: args.frequencyRowCount,
      completedAt: now,
    });
  },
});

/**
 * Record a failure and remove whatever the run had written.
 *
 * The rows are dropped rather than left behind because they are a partial file
 * — half a workbook is not a smaller dataset, it is a wrong one.
 */
export const failImportInternal = internalMutation({
  args: {
    importId: v.id("salesDataImports"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.importId);
    if (!record) return { hasMore: false };

    let deleted = 0;
    const dropFrom = async (
      table:
        | "salesDataRows"
        | "salesDataCategoryLinks"
        | "salesDataAreasOfInterest"
        | "salesDataFrequencies"
        | "salesDataAccounts"
    ) => {
      if (deleted >= PURGE_BATCH_SIZE) return;
      const written = await ctx.db
        .query(table)
        .withIndex("by_company_import", (q) =>
          q.eq("companyId", record.companyId).eq("importId", args.importId)
        )
        .take(PURGE_BATCH_SIZE - deleted);

      for (const row of written) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    };

    await dropFrom("salesDataRows");
    await dropFrom("salesDataCategoryLinks");
    await dropFrom("salesDataAreasOfInterest");
    await dropFrom("salesDataFrequencies");
    await dropFrom("salesDataAccounts");

    await ctx.db.patch(args.importId, {
      status: "FAILED",
      // Convex surfaces its own errors with a stack attached; the first line is
      // the part a person can act on.
      error: args.error.split("\n")[0].slice(0, 500),
      completedAt: Date.now(),
    });

    return { hasMore: deleted >= PURGE_BATCH_SIZE };
  },
});

/** The active company for a caller, read from an action. */
export const getImportContextInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const companyId = getActiveCompanyId(user);
    if (!companyId) return null;

    const company = await ctx.db.get(companyId);
    if (!isModuleEnabled(company, SALES_DATA_MODULE_KEY)) return null;

    return { companyId };
  },
});
