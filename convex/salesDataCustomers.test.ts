import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The customer list.
 *
 * The part worth proving is the join: a customer is an account from the
 * workbook plus whatever somebody has typed in, and search has to reach both
 * sides. A test that only searched the imported name would pass while a search
 * for a postcode found nothing.
 */

const page = { numItems: 25, cursor: null };

type SeedAccount = {
  accountName: string;
  code: string;
  groupName: string;
  customerType: string;
  totalRevenue?: number;
};

const key = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ").replace(/&/g, "AND");

const ACCOUNTS: SeedAccount[] = [
  {
    accountName: "The Devonshire Hotel Ltd",
    code: "DEVONS",
    groupName: "Daish's Hotels",
    customerType: "HOTELS",
    totalRevenue: 449.33,
  },
  {
    accountName: "Barrowfield Hotel Ltd",
    code: "BARROW",
    groupName: "Daish's Hotels",
    customerType: "HOTELS",
    totalRevenue: 4207.21,
  },
  {
    accountName: "Priory School Catering",
    code: "PRSSC",
    groupName: "Bohunt Education Trust",
    customerType: "EDUCATION - NON RESIDENTIAL",
    totalRevenue: 3835.42,
  },
];

async function seed(accounts: SeedAccount[] = ACCOUNTS) {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const { userId, companyId } = await t.run(async (ctx) => {
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
      salesRowCount: accounts.length,
      importedBy: userId,
      startedAt: Date.now(),
      completedAt: Date.now(),
    });

    for (const account of accounts) {
      await ctx.db.insert("salesDataAccounts", {
        companyId,
        importId,
        accountNameKey: key(account.accountName),
        accountName: account.accountName,
        codeTally: { [account.code]: 10 },
        groupName: account.groupName,
        groupNameKey: key(account.groupName),
        customerType: account.customerType,
        customerTypeKey: key(account.customerType),
        totalRevenue: account.totalRevenue ?? 0,
        productCount: 1,
      });
    }

    return { userId, companyId };
  });

  return { t, client: t.withIdentity({ subject: userId }), userId, companyId };
}

async function addDetails(
  t: ReturnType<typeof convexTest>,
  companyId: Id<"companies">,
  userId: Id<"users">,
  accountName: string,
  details: Record<string, unknown>
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("salesDataCustomers", {
      companyId,
      accountNameKey: key(accountName),
      updatedAt: Date.now(),
      updatedBy: userId,
      ...details,
    });
  });
}

describe("customer list", () => {
  test("lists every account in the current import, chain first then name", async () => {
    const { client } = await seed();

    const result = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
    });

    expect(result.page.map((customer) => customer.accountName)).toEqual([
      "Priory School Catering",
      "Barrowfield Hotel Ltd",
      "The Devonshire Hotel Ltd",
    ]);
  });

  test("shows the account code most rows agree on", async () => {
    const { t, client } = await seed();

    await t.run(async (ctx) => {
      const account = await ctx.db.query("salesDataAccounts").first();
      if (!account) throw new Error("seed failed");
      // The shape the workbook produces: a real code on most rows, a stray
      // value on a few.
      await ctx.db.patch(account._id, { codeTally: { DEVONS: 142, "Product - C O L0": 4 } });
    });

    const result = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      search: "devonshire",
    });

    expect(result.page[0]?.accountCode).toBe("DEVONS");
  });

  test("a customer with nothing typed in is listed, and marked", async () => {
    const { client } = await seed();

    const result = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
    });

    expect(result.page.every((customer) => customer.hasDetails)).toBe(false);
    expect(result.page.every((customer) => customer.town === null)).toBe(true);
  });

  test("search reaches the imported side", async () => {
    const { client } = await seed();

    const byName = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      search: "barrowfield",
    });
    expect(byName.page.map((c) => c.accountName)).toEqual(["Barrowfield Hotel Ltd"]);

    const byCode = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      search: "prssc",
    });
    expect(byCode.page.map((c) => c.accountName)).toEqual(["Priory School Catering"]);
  });

  /**
   * The join is the point. Somebody looking for "the place in Eastbourne" has
   * no reason to know that the town was typed in and the name imported.
   */
  test("search reaches the typed-in side", async () => {
    const { t, client, companyId, userId } = await seed();
    await addDetails(t, companyId, userId, "The Devonshire Hotel Ltd", {
      town: "Eastbourne",
      postcode: "BN21 3DX",
      contactName: "Sarah Whitcombe",
    });

    const byTown = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      search: "eastbourne",
    });
    expect(byTown.page.map((c) => c.accountName)).toEqual(["The Devonshire Hotel Ltd"]);

    const byContact = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      search: "whitcombe",
    });
    expect(byContact.page.map((c) => c.accountName)).toEqual(["The Devonshire Hotel Ltd"]);

    expect(byTown.page[0]?.hasDetails).toBe(true);
    expect(byTown.page[0]?.town).toBe("Eastbourne");
  });

  test("a term from each side has to match the same customer", async () => {
    const { t, client, companyId, userId } = await seed();
    await addDetails(t, companyId, userId, "The Devonshire Hotel Ltd", { town: "Eastbourne" });

    const both = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      search: "devonshire eastbourne",
    });
    expect(both.page.map((c) => c.accountName)).toEqual(["The Devonshire Hotel Ltd"]);

    // Barrowfield is in the workbook and Eastbourne is on a different customer,
    // so together they match nobody.
    const crossed = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      search: "barrowfield eastbourne",
    });
    expect(crossed.page).toEqual([]);
  });

  test("the type and chain filters narrow, and combine", async () => {
    const { client } = await seed();

    const byType = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      customerType: "HOTELS",
    });
    expect(byType.page).toHaveLength(2);

    const byChain = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      groupName: "Bohunt Education Trust",
    });
    expect(byChain.page.map((c) => c.accountName)).toEqual(["Priory School Catering"]);

    const contradictory = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: page,
      customerType: "HOTELS",
      groupName: "Bohunt Education Trust",
    });
    expect(contradictory.page).toEqual([]);
  });

  test("paginates the narrowed set, not the whole directory", async () => {
    const accounts: SeedAccount[] = Array.from({ length: 30 }, (_, index) => ({
      accountName: `Account ${String(index).padStart(2, "0")}`,
      code: `A${index}`,
      groupName: index % 2 === 0 ? "Chain A" : "Chain B",
      customerType: "HOTELS",
    }));
    const { client } = await seed(accounts);

    const first = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: { numItems: 10, cursor: null },
      groupName: "Chain A",
    });
    expect(first.page).toHaveLength(10);

    const second = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: { numItems: 10, cursor: first.continueCursor },
      groupName: "Chain A",
    });
    expect(second.page).toHaveLength(5);
    expect(second.isDone).toBe(true);
  });

  test("the dropdowns list the distinct types and chains", async () => {
    const { client } = await seed();

    const options = await client.query(api.salesDataCustomers.listCustomerFilterOptions, {});

    expect(options.customerTypes).toEqual(["EDUCATION - NON RESIDENTIAL", "HOTELS"]);
    expect(options.groupNames).toEqual(["Bohunt Education Trust", "Daish's Hotels"]);
  });

  test("counts customers and how many have details", async () => {
    const { t, client, companyId, userId } = await seed();

    expect(await client.query(api.salesDataCustomers.countCustomers, {})).toEqual({
      total: 3,
      withDetails: 0,
    });

    await addDetails(t, companyId, userId, "Barrowfield Hotel Ltd", { phone: "01323 410222" });

    expect(await client.query(api.salesDataCustomers.countCustomers, {})).toEqual({
      total: 3,
      withDetails: 1,
    });
  });

  test("a workspace without the module is refused", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Plain",
        createdAt: Date.now(),
      });
      return await ctx.db.insert("users", { email: "plain@test.com", role: "ADMIN", companyId });
    });

    await expect(
      t
        .withIdentity({ subject: userId })
        .query(api.salesDataCustomers.listCustomers, { paginationOpts: page })
    ).rejects.toThrow("Sales Data is not enabled");
  });
});

describe("customer profile", () => {
  test("returns the imported side joined to the typed-in side", async () => {
    const { t, client, companyId, userId } = await seed();
    await addDetails(t, companyId, userId, "The Devonshire Hotel Ltd", {
      town: "Eastbourne",
      bedrooms: 96,
    });

    const customer = await client.query(api.salesDataCustomers.getCustomer, {
      accountNameKey: key("The Devonshire Hotel Ltd"),
    });

    expect(customer?.accountName).toBe("The Devonshire Hotel Ltd");
    expect(customer?.accountCode).toBe("DEVONS");
    expect(customer?.groupName).toBe("Daish's Hotels");
    expect(customer?.town).toBe("Eastbourne");
    expect(customer?.bedrooms).toBe(96);
  });

  test("a customer not in the current import reads as missing rather than failing", async () => {
    const { client } = await seed();

    const customer = await client.query(api.salesDataCustomers.getCustomer, {
      accountNameKey: "NOBODY",
    });

    expect(customer).toBeNull();
  });

  test("hotels and care homes count bedrooms, schools count pupils", async () => {
    const { client } = await seed();

    const hotel = await client.query(api.salesDataCustomers.getCustomer, {
      accountNameKey: key("The Devonshire Hotel Ltd"),
    });
    expect(hotel?.extraField).toBe("bedrooms");

    const school = await client.query(api.salesDataCustomers.getCustomer, {
      accountNameKey: key("Priory School Catering"),
    });
    expect(school?.extraField).toBe("pupils");
  });

  test("a type with no rule gets no extra field", async () => {
    const { client } = await seed([
      { accountName: "Some Factory", code: "FACT", groupName: "None", customerType: "INDUSTRIAL" },
    ]);

    const customer = await client.query(api.salesDataCustomers.getCustomer, {
      accountNameKey: key("Some Factory"),
    });

    expect(customer?.extraField).toBeNull();
  });

  test("saving creates the record, and saving again updates it", async () => {
    const { client } = await seed();
    const accountNameKey = key("The Devonshire Hotel Ltd");

    await client.mutation(api.salesDataCustomers.saveCustomerDetails, {
      accountNameKey,
      town: "Eastbourne",
      phone: "01323 410222",
      bedrooms: 96,
    });

    let customer = await client.query(api.salesDataCustomers.getCustomer, { accountNameKey });
    expect(customer?.town).toBe("Eastbourne");
    expect(customer?.bedrooms).toBe(96);
    expect(customer?.hasDetails).toBe(true);

    await client.mutation(api.salesDataCustomers.saveCustomerDetails, {
      accountNameKey,
      town: "Bexhill",
      bedrooms: 100,
    });

    customer = await client.query(api.salesDataCustomers.getCustomer, { accountNameKey });
    expect(customer?.town).toBe("Bexhill");
    expect(customer?.bedrooms).toBe(100);
    // The phone was not resent, so it is cleared rather than silently kept —
    // the form always sends the whole record.
    expect(customer?.phone).toBeNull();
  });

  test("an empty box clears the field rather than storing a blank", async () => {
    const { client } = await seed();
    const accountNameKey = key("The Devonshire Hotel Ltd");

    await client.mutation(api.salesDataCustomers.saveCustomerDetails, {
      accountNameKey,
      town: "Eastbourne",
    });
    await client.mutation(api.salesDataCustomers.saveCustomerDetails, {
      accountNameKey,
      town: "   ",
    });

    const customer = await client.query(api.salesDataCustomers.getCustomer, { accountNameKey });
    expect(customer?.town).toBeNull();
  });

  /**
   * The figure belongs to the type. A bedroom count sent for a school would be
   * stored and never shown again, so the server drops it rather than trusting
   * that the form offered the right box.
   */
  test("the wrong extra figure for the type is refused", async () => {
    const { client } = await seed();
    const accountNameKey = key("Priory School Catering");

    await client.mutation(api.salesDataCustomers.saveCustomerDetails, {
      accountNameKey,
      bedrooms: 400,
      pupils: 900,
    });

    const customer = await client.query(api.salesDataCustomers.getCustomer, { accountNameKey });
    expect(customer?.pupils).toBe(900);
    expect(customer?.bedrooms).toBeNull();
  });

  test("details cannot be attached to a customer outside the import", async () => {
    const { client } = await seed();

    await expect(
      client.mutation(api.salesDataCustomers.saveCustomerDetails, {
        accountNameKey: "MADE UP",
        town: "Nowhere",
      })
    ).rejects.toThrow("not in the current import");
  });

  test("the chain lists the other accounts, not this one", async () => {
    const { client } = await seed();

    const chain = await client.query(api.salesDataCustomers.listChainMembers, {
      accountNameKey: key("The Devonshire Hotel Ltd"),
    });

    expect(chain.map((sibling) => sibling.accountName)).toEqual(["Barrowfield Hotel Ltd"]);
  });

  test("a customer alone in its chain has no siblings", async () => {
    const { client } = await seed();

    const chain = await client.query(api.salesDataCustomers.listChainMembers, {
      accountNameKey: key("Priory School Catering"),
    });

    expect(chain).toEqual([]);
  });
});

describe("sales by month", () => {
  async function seedWithSales() {
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
        periodLabels: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        salesRowCount: 2,
        importedBy: user,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });

      await ctx.db.insert("salesDataAccounts", {
        companyId,
        importId,
        accountNameKey: key("The Devonshire Hotel Ltd"),
        accountName: "The Devonshire Hotel Ltd",
        codeTally: { DEVONS: 2 },
        groupName: "Daish's Hotels",
        groupNameKey: key("Daish's Hotels"),
        customerType: "HOTELS",
        customerTypeKey: "HOTELS",
        totalRevenue: 300,
        productCount: 2,
      });

      const base = {
        companyId,
        importId,
        parentAccount: "DEVONS",
        groupName: "Daish's Hotels",
        accountName: "The Devonshire Hotel Ltd",
        accountNameKey: key("The Devonshire Hotel Ltd"),
        customerType: "HOTELS",
        customerTypeKey: "HOTELS",
        productCategoryKey: "PAPER HYGIENE",
        productTypeKey: "HAND TOWELS",
        productCategory: "PAPER HYGIENE",
        productType: "HAND TOWELS",
      };

      // January and March only. February is blank, which in this source means
      // no sale rather than a sale of nothing.
      await ctx.db.insert("salesDataRows", {
        ...base,
        sourceRow: 2,
        productCode: "TOWEL",
        uniqueId: "DEVONSTOWEL",
        productDescription: "Hand towel",
        period1: 100,
        period3: 50,
        totalRevenue: 150,
      });
      await ctx.db.insert("salesDataRows", {
        ...base,
        sourceRow: 3,
        productCode: "SOAP",
        uniqueId: "DEVONSSOAP",
        productDescription: "Hand soap",
        period1: 20,
        period3: 130,
        totalRevenue: 150,
      });

      return user;
    });

    return t.withIdentity({ subject: userId });
  }

  test("splits by month, newest first, and skips months with no sales", async () => {
    const client = await seedWithSales();

    const sales = await client.query(api.salesDataCustomers.listCustomerSalesByMonth, {
      accountNameKey: key("The Devonshire Hotel Ltd"),
    });

    expect(sales.months.map((month) => month.label)).toEqual(["2026-03", "2026-01"]);
    expect(sales.months.map((month) => month.total)).toEqual([180, 120]);
  });

  test("the months add up to the six-month total", async () => {
    const client = await seedWithSales();

    const sales = await client.query(api.salesDataCustomers.listCustomerSalesByMonth, {
      accountNameKey: key("The Devonshire Hotel Ltd"),
    });

    const summed = sales.months.reduce((total, month) => total + month.total, 0);
    expect(summed).toBe(sales.total);
    expect(sales.total).toBe(300);
  });

  test("a month opens to its product lines, biggest first", async () => {
    const client = await seedWithSales();

    const lines = await client.query(api.salesDataCustomers.listCustomerSalesForMonth, {
      accountNameKey: key("The Devonshire Hotel Ltd"),
      periodIndex: 2,
    });

    expect(lines.map((line) => [line.productDescription, line.value])).toEqual([
      ["Hand soap", 130],
      ["Hand towel", 50],
    ]);
  });

  test("a month with no sales for a product leaves that product out", async () => {
    const client = await seedWithSales();

    const lines = await client.query(api.salesDataCustomers.listCustomerSalesForMonth, {
      accountNameKey: key("The Devonshire Hotel Ltd"),
      periodIndex: 1,
    });

    expect(lines).toEqual([]);
  });

  test("a period outside the six is refused rather than guessed at", async () => {
    const client = await seedWithSales();

    expect(
      await client.query(api.salesDataCustomers.listCustomerSalesForMonth, {
        accountNameKey: key("The Devonshire Hotel Ltd"),
        periodIndex: 9,
      })
    ).toEqual([]);
  });

  test("a customer with no rows reads as no sales rather than failing", async () => {
    const client = await seedWithSales();

    const sales = await client.query(api.salesDataCustomers.listCustomerSalesByMonth, {
      accountNameKey: "NOBODY",
    });

    expect(sales.months).toEqual([]);
    expect(sales.total).toBe(0);
  });
});
