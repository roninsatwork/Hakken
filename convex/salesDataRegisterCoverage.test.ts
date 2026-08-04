import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * The register coverage rows.
 *
 * What these hold in place: the check's work list is the care groups and only
 * the care groups, with prospects counted as on file; a fresh verdict replaces
 * the old outright; and a deployment without the register key says so on every
 * row rather than silently not checking.
 */

const key = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");

async function seed() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const seeded = await t.run(async (ctx) => {
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
      importedBy: userId,
      startedAt: Date.now(),
      completedAt: Date.now(),
    });

    const accounts = [
      { accountName: "Woodpeckers", groupName: "Colten Care", customerType: "CARE HOMES" },
      { accountName: "Barrowfield Hotel Ltd", groupName: "Daish's Hotels", customerType: "HOTELS" },
    ];
    for (const account of accounts) {
      await ctx.db.insert("salesDataAccounts", {
        companyId,
        importId,
        accountNameKey: key(account.accountName),
        accountName: account.accountName,
        codeTally: { CODE: 4 },
        groupName: account.groupName,
        groupNameKey: key(account.groupName),
        customerType: account.customerType,
        customerTypeKey: key(account.customerType),
        totalRevenue: 100,
        productCount: 1,
      });
    }

    await ctx.db.insert("salesDataProspects", {
      companyId,
      prospectKey: key("Linden House"),
      siteName: "Linden House",
      groupName: "Colten Care",
      groupNameKey: key("Colten Care"),
      customerType: "CARE HOMES",
      customerTypeKey: "CARE HOMES",
      status: "NEW" as const,
      sourceUrl: "https://www.coltencare.co.uk/care-homes/",
      foundAt: Date.now(),
    });

    return { companyId, userId };
  });

  return { t, ...seeded, client: t.withIdentity({ subject: seeded.userId }) };
}

describe("the check's work list", () => {
  test("care groups only, with prospects counted as on file", async () => {
    const { t, companyId } = await seed();

    const chains = await t.query(internal.salesDataRegisterCoverage.listCareChainsForCoverage, {
      companyId,
    });

    expect(chains).toHaveLength(1);
    expect(chains[0].groupName).toBe("Colten Care");
    expect(chains[0].knownSites.map((site) => site.name).sort()).toEqual([
      "Linden House",
      "Woodpeckers",
    ]);
  });
});

describe("verdicts", () => {
  test("a fresh verdict replaces the old outright", async () => {
    const { t, companyId, client } = await seed();

    await t.mutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
      companyId,
      row: {
        groupNameKey: key("Colten Care"),
        groupName: "Colten Care",
        registerName: "CQC",
        status: "GAPS" as const,
        registerCount: 21,
        accountedFor: 7,
        missing: [{ name: "Avon Reach", postcode: "SO41 0GG" }],
      },
    });
    await t.mutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
      companyId,
      row: {
        groupNameKey: key("Colten Care"),
        groupName: "Colten Care",
        registerName: "CQC",
        status: "COVERED" as const,
        registerCount: 21,
        accountedFor: 21,
        missing: [],
      },
    });

    const listed = await client.query(api.salesDataRegisterCoverage.listChainCoverage, {});
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ status: "COVERED", accountedFor: 21 });
    // Yesterday's missing list must not linger under today's clean status.
    expect(listed[0].missing).toEqual([]);
  });

  test("worst news lists first", async () => {
    const { t, companyId, client } = await seed();

    for (const row of [
      {
        groupNameKey: key("Allegra Care"),
        groupName: "Allegra Care",
        registerName: "CQC",
        status: "COVERED" as const,
      },
      {
        groupNameKey: key("Colten Care"),
        groupName: "Colten Care",
        registerName: "CQC",
        status: "GAPS" as const,
        missing: [{ name: "Avon Reach" }],
      },
    ]) {
      await t.mutation(internal.salesDataRegisterCoverage.upsertChainCoverage, { companyId, row });
    }

    const listed = await client.query(api.salesDataRegisterCoverage.listChainCoverage, {});
    expect(listed.map((row) => row.status)).toEqual(["GAPS", "COVERED"]);
  });
});

describe("dismissing prospects in bulk", () => {
  test("named prospects are dismissed, everything else is left alone", async () => {
    const { t, companyId } = await seed();

    const result = await t.mutation(internal.salesDataResearch.dismissProspectsInternal, {
      companyId,
      prospectKeys: [key("Linden House"), key("No Such Prospect")],
    });
    expect(result).toEqual({ dismissed: 1 });

    const prospect = await t.run(async (ctx) =>
      await ctx.db
        .query("salesDataProspects")
        .withIndex("by_company_prospect", (q) =>
          q.eq("companyId", companyId).eq("prospectKey", key("Linden House"))
        )
        .unique()
    );
    expect(prospect?.status).toBe("DISMISSED");
  });
});

describe("a deployment without the web-reading key", () => {
  test("says so on every care group's row instead of silently not checking", async () => {
    const { t, companyId, client } = await seed();

    const result = await t.action(
      internal.salesDataRegisterCoverageActions.checkCareRegisterCoverage,
      { companyId }
    );
    expect(result).toMatchObject({ checked: 0, notConfigured: 1 });

    const listed = await client.query(api.salesDataRegisterCoverage.listChainCoverage, {});
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe("NOT_CONFIGURED");
    expect(listed[0].error).toContain("web reading service");
  });
});
