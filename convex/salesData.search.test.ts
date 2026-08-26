import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Search and filtering on the four data tables.
 *
 * The queries are covered rather than the matching helpers, because the part
 * worth proving is not that a substring check works — it is that the predicate
 * reaches the paginator, that the filters combine rather than replace one
 * another, and that a filter still finds rows whose source text is spelled
 * inconsistently. None of that is visible from a unit test of the helper.
 */

const page = { numItems: 25, cursor: null };

type SeedRow = {
  accountName: string;
  groupName: string;
  customerType: string;
  productDescription?: string;
  productCode?: string;
  productCategory?: string;
  sourceRow?: number;
};

async function seed(t: ReturnType<typeof convexTest>, rows: SeedRow[]) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Comax",
      enabledModules: ["salesData"],
      createdAt: Date.now(),
    });
    const userId = await ctx.db.insert("users", {
      email: "buyer@test.com",
      role: "ADMIN",
      companyId,
    });
    const importId = await ctx.db.insert("salesDataImports", {
      companyId,
      fileName: "sample.xlsx",
      status: "COMPLETED" as const,
      sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
      periodLabels: ["2026-01"],
      salesRowCount: rows.length,
      importedBy: userId,
      startedAt: Date.now(),
      completedAt: Date.now(),
    });

    for (const [index, row] of rows.entries()) {
      const category = row.productCategory ?? "CHEMICALS";
      await ctx.db.insert("salesDataRows", {
        companyId,
        importId,
        sourceRow: row.sourceRow ?? index + 2,
        parentAccount: "PARENT",
        groupName: row.groupName,
        accountName: row.accountName,
        customerType: row.customerType,
        productCode: row.productCode ?? `P${index}`,
        uniqueId: `U${index}`,
        productDescription: row.productDescription ?? "A PRODUCT",
        productCategory: category,
        productType: "CLEANER",
        customerTypeKey: row.customerType.trim().toUpperCase(),
        productCategoryKey: category.trim().toUpperCase(),
        productTypeKey: "CLEANER",
        period1: 10,
        totalRevenue: 10,
      });
    }

    return { companyId, userId, importId };
  });
}

const SAMPLE: SeedRow[] = [
  {
    accountName: "Brackley Supplies",
    groupName: "NORTH",
    customerType: "CARE HOMES",
    productDescription: "WALL BRACKET 200mm",
    productCode: "BRK-200",
  },
  {
    accountName: "Dover Hotels",
    groupName: "SOUTH",
    customerType: "HOTELS",
    productDescription: "HAND SOAP 5L",
    productCode: "SOAP-5",
  },
  {
    accountName: "Northgate Care",
    groupName: "NORTH",
    customerType: "CARE HOMES",
    productDescription: "BLEACH 2L",
    productCode: "BLE-2",
  },
];

async function signedIn(rows: SeedRow[] = SAMPLE) {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const { userId } = await seed(t, rows);
  return t.withIdentity({ subject: userId });
}

describe("sales table search", () => {
  test("matches any text column, ignoring case", async () => {
    const client = await signedIn();

    const byAccount = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      search: "brackley",
    });
    expect(byAccount.page.map((row) => row.accountName)).toEqual(["Brackley Supplies"]);

    const byDescription = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      search: "soap",
    });
    expect(byDescription.page.map((row) => row.accountName)).toEqual(["Dover Hotels"]);
  });

  /**
   * The reason this is substring rather than the whole-word matching a Convex
   * search index does: people search product codes by fragment.
   */
  test("matches a fragment of a product code", async () => {
    const client = await signedIn();

    const result = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      search: "brk-2",
    });

    expect(result.page.map((row) => row.productCode)).toEqual(["BRK-200"]);
  });

  test("requires every term, and lets them span columns", async () => {
    const client = await signedIn();

    // "care" is the customer type, "bleach" the description — different columns.
    const both = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      search: "care bleach",
    });
    expect(both.page.map((row) => row.accountName)).toEqual(["Northgate Care"]);

    const unmatchable = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      search: "care parsnips",
    });
    expect(unmatchable.page).toEqual([]);
  });

  test("finds a row by its source row number", async () => {
    const client = await signedIn();

    const result = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      search: "4",
    });

    expect(result.page.map((row) => row.sourceRow)).toEqual([4]);
  });

  test("no search returns everything, in file order", async () => {
    const client = await signedIn();

    const result = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
    });

    expect(result.page.map((row) => row.sourceRow)).toEqual([2, 3, 4]);
  });
});

describe("sales table filters", () => {
  test("filters by customer type, account and group", async () => {
    const client = await signedIn();

    const byType = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      customerType: "CARE HOMES",
    });
    expect(byType.page.map((row) => row.accountName)).toEqual([
      "Brackley Supplies",
      "Northgate Care",
    ]);

    const byAccount = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      accountName: "Dover Hotels",
    });
    expect(byAccount.page.map((row) => row.accountName)).toEqual(["Dover Hotels"]);

    const byGroup = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      groupName: "SOUTH",
    });
    expect(byGroup.page.map((row) => row.accountName)).toEqual(["Dover Hotels"]);
  });

  test("filters narrow each other rather than replacing", async () => {
    const client = await signedIn();

    const combined = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      customerType: "CARE HOMES",
      groupName: "NORTH",
    });
    expect(combined.page.map((row) => row.accountName)).toEqual([
      "Brackley Supplies",
      "Northgate Care",
    ]);

    // Both filters are applied: a pairing that no row satisfies returns none,
    // even though each value on its own matches rows.
    const contradictory = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      customerType: "HOTELS",
      groupName: "NORTH",
    });
    expect(contradictory.page).toEqual([]);
  });

  test("search applies on top of the filters", async () => {
    const client = await signedIn();

    const result = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      customerType: "CARE HOMES",
      search: "bleach",
    });

    expect(result.page.map((row) => row.accountName)).toEqual(["Northgate Care"]);
  });

  /**
   * The source spells the same value more than one way — trailing spaces, `&`
   * against `AND`, mixed case. A filter that matched raw text would quietly
   * return half the rows and read as though it had returned all of them.
   */
  test("a filter matches rows whose source text is spelled differently", async () => {
    const client = await signedIn([
      { accountName: "A", groupName: "G", customerType: "DISPENSERS & BRACKETS" },
      { accountName: "B", groupName: "G", customerType: "dispensers and brackets " },
      { accountName: "C", groupName: "G", customerType: "HOTELS" },
    ]);

    const result = await client.query(api.salesData.listSalesRows, {
      paginationOpts: page,
      customerType: "DISPENSERS AND BRACKETS",
    });

    expect(result.page.map((row) => row.accountName)).toEqual(["A", "B"]);
  });

  test("paginates the filtered rows, not the whole table", async () => {
    const rows: SeedRow[] = Array.from({ length: 30 }, (_, index) => ({
      accountName: `Account ${index}`,
      groupName: index % 2 === 0 ? "NORTH" : "SOUTH",
      customerType: "CARE HOMES",
    }));
    const client = await signedIn(rows);

    const first = await client.query(api.salesData.listSalesRows, {
      paginationOpts: { numItems: 10, cursor: null },
      groupName: "NORTH",
    });
    expect(first.page).toHaveLength(10);
    expect(first.page.every((row) => row.groupName === "NORTH")).toBe(true);

    const second = await client.query(api.salesData.listSalesRows, {
      paginationOpts: { numItems: 10, cursor: first.continueCursor },
      groupName: "NORTH",
    });
    // 15 rows are in NORTH, so the second page is the remaining five.
    expect(second.page).toHaveLength(5);
    expect(second.isDone).toBe(true);
  });
});

/**
 * Convex allows one paginated query per function and rejects the second
 * `.paginate()` at runtime — which `convex-test` does not enforce, so a
 * narrowed page that called it in a loop passed every test here and failed
 * the moment it reached a real deployment. What keeps that from coming back
 * is that a narrowed page is positioned by counting matches instead, so these
 * assert the cursor is a count, and that a stale opaque cursor is survivable.
 */
describe("narrowed pagination does not lean on Convex cursors", () => {
  test("an unnarrowed page returns an opaque cursor, a narrowed one a count", async () => {
    const client = await signedIn();

    const plain = await client.query(api.salesData.listSalesRows, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(Number.isNaN(Number(plain.continueCursor))).toBe(true);

    const narrowed = await client.query(api.salesData.listSalesRows, {
      paginationOpts: { numItems: 2, cursor: null },
      customerType: "CARE HOMES",
    });
    expect(narrowed.continueCursor).toBe("2");
  });

  test("a cursor left over from the unnarrowed query falls back to the first page", async () => {
    const client = await signedIn();

    const plain = await client.query(api.salesData.listSalesRows, {
      paginationOpts: { numItems: 1, cursor: null },
    });

    // The client resets its position whenever the query changes, so this is
    // the belt to that braces — it must not throw, and it must not silently
    // resume from somewhere arbitrary.
    const narrowed = await client.query(api.salesData.listSalesRows, {
      paginationOpts: { numItems: 25, cursor: plain.continueCursor },
      customerType: "CARE HOMES",
    });

    expect(narrowed.page.map((row) => row.accountName)).toEqual([
      "Brackley Supplies",
      "Northgate Care",
    ]);
  });
});

describe("filter options", () => {
  test("lists the distinct values behind each dropdown, sorted", async () => {
    const client = await signedIn();

    const options = await client.query(api.salesData.listSalesFilterOptions, {});

    expect(options.customerTypes).toEqual(["CARE HOMES", "HOTELS"]);
    expect(options.accountNames).toEqual([
      "Brackley Supplies",
      "Dover Hotels",
      "Northgate Care",
    ]);
    expect(options.groupNames).toEqual(["NORTH", "SOUTH"]);
  });

  test("two spellings of one value are one option", async () => {
    const client = await signedIn([
      { accountName: "A", groupName: "G", customerType: "DISPENSERS & BRACKETS" },
      { accountName: "B", groupName: "G", customerType: "dispensers and brackets " },
    ]);

    const options = await client.query(api.salesData.listSalesFilterOptions, {});

    // Deduplicated on the same key the filter compares on, shown with the
    // first spelling seen — so picking it finds the rows under both.
    expect(options.customerTypes).toEqual(["DISPENSERS & BRACKETS"]);
  });

  test("a workspace with no import gets empty lists rather than an error", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Fresh",
        enabledModules: ["salesData"],
        createdAt: Date.now(),
      });
      return await ctx.db.insert("users", {
        email: "fresh@test.com",
        role: "ADMIN",
        companyId,
      });
    });

    const options = await t
      .withIdentity({ subject: userId })
      .query(api.salesData.listSalesFilterOptions, {});

    expect(options).toEqual({ customerTypes: [], accountNames: [], groupNames: [] });
  });
});

describe("the other three tables", () => {
  async function seedSmallTables() {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Comax",
        enabledModules: ["salesData"],
        createdAt: Date.now(),
      });
      const user = await ctx.db.insert("users", {
        email: "buyer@test.com",
        role: "ADMIN",
        companyId,
      });
      const importId = await ctx.db.insert("salesDataImports", {
        companyId,
        fileName: "sample.xlsx",
        status: "COMPLETED" as const,
        sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
        importedBy: user,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });

      const common = { companyId, importId };
      await ctx.db.insert("salesDataCategoryLinks", {
        ...common,
        customerType: "CARE HOMES",
        customerTypeKey: "CARE HOMES",
        category: "CHEMICALS",
        categoryKey: "CHEMICALS",
      });
      await ctx.db.insert("salesDataCategoryLinks", {
        ...common,
        customerType: "HOTELS",
        customerTypeKey: "HOTELS",
        category: "PAPER",
        categoryKey: "PAPER",
      });
      await ctx.db.insert("salesDataAreasOfInterest", {
        ...common,
        customerType: "CARE HOMES",
        customerTypeKey: "CARE HOMES",
        productType: "CLEANER",
        productTypeKey: "CLEANER",
      });
      await ctx.db.insert("salesDataAreasOfInterest", {
        ...common,
        customerType: "HOTELS",
        customerTypeKey: "HOTELS",
        productType: "TOWEL",
        productTypeKey: "TOWEL",
      });
      await ctx.db.insert("salesDataFrequencies", {
        ...common,
        productCategory: "CHEMICALS",
        productType: "CLEANER",
        frequency: "Regular",
        productCategoryKey: "CHEMICALS",
        productTypeKey: "CLEANER",
      });
      await ctx.db.insert("salesDataFrequencies", {
        ...common,
        productCategory: "PAPER",
        productType: "TOWEL",
        frequency: "Sporadic",
        productCategoryKey: "PAPER",
        productTypeKey: "TOWEL",
      });

      return user as Id<"users">;
    });

    return t.withIdentity({ subject: userId });
  }

  test("categories search on either column", async () => {
    const client = await seedSmallTables();

    const result = await client.query(api.salesData.listCategoryLinks, {
      paginationOpts: page,
      search: "paper",
    });

    expect(result.page.map((row) => row.customerType)).toEqual(["HOTELS"]);
  });

  test("areas of interest search on either column", async () => {
    const client = await seedSmallTables();

    const result = await client.query(api.salesData.listAreasOfInterest, {
      paginationOpts: page,
      search: "towel",
    });

    expect(result.page.map((row) => row.customerType)).toEqual(["HOTELS"]);
  });

  test("frequency searches the frequency column too", async () => {
    const client = await seedSmallTables();

    const result = await client.query(api.salesData.listFrequencies, {
      paginationOpts: page,
      search: "sporadic",
    });

    expect(result.page.map((row) => row.productType)).toEqual(["TOWEL"]);

    const everything = await client.query(api.salesData.listFrequencies, {
      paginationOpts: page,
    });
    expect(everything.page).toHaveLength(2);
  });

  test("categories narrow by customer type", async () => {
    const client = await seedSmallTables();

    const result = await client.query(api.salesData.listCategoryLinks, {
      paginationOpts: page,
      customerType: "CARE HOMES",
    });

    expect(result.page.map((row) => row.category)).toEqual(["CHEMICALS"]);
  });

  test("areas of interest narrow by customer type", async () => {
    const client = await seedSmallTables();

    const result = await client.query(api.salesData.listAreasOfInterest, {
      paginationOpts: page,
      customerType: "HOTELS",
    });

    expect(result.page.map((row) => row.productType)).toEqual(["TOWEL"]);
  });

  test("search applies on top of a customer type filter", async () => {
    const client = await seedSmallTables();

    // The filter alone leaves one row, and a search that row fails empties it —
    // which is only true if both are applied rather than the later winning.
    const result = await client.query(api.salesData.listCategoryLinks, {
      paginationOpts: page,
      customerType: "CARE HOMES",
      search: "paper",
    });

    expect(result.page).toEqual([]);
  });

  test("the three frequency filters narrow each other", async () => {
    const client = await seedSmallTables();

    const byCategory = await client.query(api.salesData.listFrequencies, {
      paginationOpts: page,
      productCategory: "PAPER",
    });
    expect(byCategory.page.map((row) => row.productType)).toEqual(["TOWEL"]);

    const byType = await client.query(api.salesData.listFrequencies, {
      paginationOpts: page,
      productType: "CLEANER",
    });
    expect(byType.page.map((row) => row.productCategory)).toEqual(["CHEMICALS"]);

    const bySaleFrequency = await client.query(api.salesData.listFrequencies, {
      paginationOpts: page,
      frequency: "Sporadic",
    });
    expect(bySaleFrequency.page.map((row) => row.productType)).toEqual(["TOWEL"]);

    const combined = await client.query(api.salesData.listFrequencies, {
      paginationOpts: page,
      productCategory: "CHEMICALS",
      frequency: "Regular",
    });
    expect(combined.page.map((row) => row.productType)).toEqual(["CLEANER"]);

    // Each value matches a row on its own; together they match none, so both
    // are being applied.
    const contradictory = await client.query(api.salesData.listFrequencies, {
      paginationOpts: page,
      productCategory: "CHEMICALS",
      frequency: "Sporadic",
    });
    expect(contradictory.page).toEqual([]);
  });

  /**
   * `frequency` is the one filtered column with no stored key beside it, so
   * this is the proof that it is still compared normalised rather than raw.
   */
  test("the frequency filter ignores case, with no stored key to lean on", async () => {
    const client = await seedSmallTables();

    const result = await client.query(api.salesData.listFrequencies, {
      paginationOpts: page,
      frequency: "regular",
    });

    expect(result.page.map((row) => row.productType)).toEqual(["CLEANER"]);
  });

  test("each tab gets the options for its own columns and no others", async () => {
    const client = await seedSmallTables();

    const categories = await client.query(api.salesData.listTableFilterOptions, {
      table: "categories",
    });
    expect(categories.customerTypes).toEqual(["CARE HOMES", "HOTELS"]);
    expect(categories.productCategories).toEqual([]);

    const interest = await client.query(api.salesData.listTableFilterOptions, {
      table: "interest",
    });
    expect(interest.customerTypes).toEqual(["CARE HOMES", "HOTELS"]);

    const frequency = await client.query(api.salesData.listTableFilterOptions, {
      table: "frequency",
    });
    expect(frequency.productCategories).toEqual(["CHEMICALS", "PAPER"]);
    expect(frequency.productTypes).toEqual(["CLEANER", "TOWEL"]);
    expect(frequency.frequencies).toEqual(["Regular", "Sporadic"]);
    expect(frequency.customerTypes).toEqual([]);
  });
});

describe("the import history read with an import behind it", () => {
  /**
   * `listImports` was only ever called by a test asserting it refuses the wrong
   * workspace, so it always answered with an empty list — nothing to be wrong
   * about, and a declared shape nothing could check.
   */
  test("it names the file, its counts and who imported it", async () => {
    const client = await signedIn();

    const imports = await client.query(api.salesData.listImports, {});

    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      fileName: "sample.xlsx",
      status: "COMPLETED",
      periodLabels: ["2026-01"],
      importedByName: "buyer@test.com",
    });
  });
});
