import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The two tools the research agent runs on.
 *
 * The routing rules are proved on their own in `salesDataResearchService.test`.
 * What is proved here is everything that needs a database: that a confident
 * finding really reaches the customer record, that a replayed call writes once,
 * that a person's edit takes the source marker off the field they edited and
 * only that field, and that neither tool can be pointed at another workspace.
 */

const key = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ").replace(/&/g, "AND");

const HOTEL = "The Devonshire Hotel Ltd";
const SCHOOL = "Priory School Catering";

type Workspace = {
  companyId: Id<"companies">;
  userId: Id<"users">;
};

async function seed() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const make = async (name: string, modules: string[]): Promise<Workspace> =>
    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name,
        enabledModules: modules,
        createdAt: Date.now(),
      });
      const userId = await ctx.db.insert("users", {
        email: `${name.toLowerCase()}@test.com`,
        role: "ADMIN",
        companyId,
      });
      const importId = await ctx.db.insert("salesDataImports", {
        companyId,
        fileName: "sample.xlsx",
        status: "COMPLETED" as const,
        sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
        periodLabels: ["2026-01"],
        salesRowCount: 2,
        importedBy: userId,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });

      const accounts = [
        { name: HOTEL, code: "DEVONS", group: "Daish's Hotels", type: "HOTELS" },
        {
          name: SCHOOL,
          code: "PRSSC",
          group: "Bohunt Education Trust",
          type: "EDUCATION - NON RESIDENTIAL",
        },
      ];

      for (const account of accounts) {
        await ctx.db.insert("salesDataAccounts", {
          companyId,
          importId,
          accountNameKey: key(account.name),
          accountName: account.name,
          codeTally: { [account.code]: 10 },
          groupName: account.group,
          groupNameKey: key(account.group),
          customerType: account.type,
          customerTypeKey: key(account.type),
          totalRevenue: 100,
          productCount: 1,
        });
      }

      return { companyId, userId };
    });

  const comax = await make("Comax", ["salesData"]);
  const other = await make("Other Co", ["salesData"]);

  return { t, comax, other };
}

type FindingOverrides = Partial<{
  accountNameKey: string;
  field: string;
  value: string;
  confidence: string;
  sourceUrl: string;
  sourceName: string;
  reasoning: string;
  notFound: boolean;
}>;

function finding(workspace: Workspace, overrides: FindingOverrides = {}) {
  return {
    companyId: workspace.companyId,
    accountNameKey: key(HOTEL),
    field: "phone",
    value: "01803 555000",
    confidence: "HIGH",
    sourceUrl: "https://devonshirehotel.co.uk/contact",
    sourceName: "Devonshire Hotel",
    reasoning: "The contact page names this hotel and gives this number.",
    actorId: workspace.userId,
    ...overrides,
  };
}

/** The schema-aware instance, so the helpers below keep their table types. */
type TestConvex = Awaited<ReturnType<typeof seed>>["t"];

async function detailsFor(
  t: TestConvex,
  companyId: Id<"companies">,
  accountName: string
) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("salesDataCustomers")
        .withIndex("by_company_account", (q) =>
          q.eq("companyId", companyId).eq("accountNameKey", key(accountName))
        )
        .unique()
  );
}

async function researchFor(
  t: TestConvex,
  companyId: Id<"companies">,
  accountName: string
) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("salesDataCustomerResearch")
        .withIndex("by_company_subject_field", (q) =>
          q.eq("companyId", companyId).eq("subjectKey", key(accountName))
        )
        .collect()
  );
}

describe("reading a customer to research", () => {
  test("names the individual business, its chain, and what is missing", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runQuery(internal.salesDataResearch.readCustomerForResearch, {
          companyId: comax.companyId,
          accountNameKey: key(HOTEL),
        })
    );

    expect(result).toMatchObject({
      found: true,
      accountName: HOTEL,
      accountCode: "DEVONS",
      groupName: "Daish's Hotels",
      customerType: "HOTELS",
      extraField: "bedrooms",
    });
    // Stated as a list rather than left to be inferred from absent keys.
    expect(result).toHaveProperty("missing", expect.arrayContaining(["phone", "postcode"]));
    expect((result as { missing: string[] }).missing).toContain("bedrooms");
    expect((result as { missing: string[] }).missing).not.toContain("pupils");
  });

  test("a school is asked for pupils, never bedrooms", async () => {
    const { t, comax } = await seed();

    const result = (await t.run(
      async (ctx) =>
        await ctx.runQuery(internal.salesDataResearch.readCustomerForResearch, {
          companyId: comax.companyId,
          accountNameKey: key(SCHOOL),
        })
    )) as { missing: string[]; extraField: string };

    expect(result.extraField).toBe("pupils");
    expect(result.missing).toContain("pupils");
    expect(result.missing).not.toContain("bedrooms");
  });

  test("a detail already searched for and not published is not asked for again", async () => {
    const { t, comax } = await seed();

    await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordResearchFinding,
          finding(comax, { field: "bedrooms", notFound: true, value: "" })
        )
    );

    const result = (await t.run(
      async (ctx) =>
        await ctx.runQuery(internal.salesDataResearch.readCustomerForResearch, {
          companyId: comax.companyId,
          accountNameKey: key(HOTEL),
        })
    )) as { missing: string[]; alreadySearched: string[] };

    expect(result.missing).not.toContain("bedrooms");
    expect(result.alreadySearched).toContain("bedrooms");
  });

  test("called with nothing it hands back the next customer with gaps", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runQuery(internal.salesDataResearch.readCustomerForResearch, {
          companyId: comax.companyId,
        })
    );

    expect(result).toMatchObject({ found: true });
  });

  test("called with nothing it hands back prospects too, not only customers", async () => {
    // The tool offers this call shape to the agent — "call it with nothing to
    // get the next record that still has gaps" — and it only ever looked at
    // customers. An agent taking the offer was told there was nothing left to
    // research while every prospect still had every field empty, which is the
    // third of the three jobs this agent exists to do.
    const { t, comax } = await seed();
    const client = t.withIdentity({ subject: comax.userId });

    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, {
          companyId: comax.companyId,
          groupName: "Daish's Hotels",
          siteName: "Hotel Prince Regent",
          town: "Weymouth",
          postcode: "DT4 7NR",
          sourceUrl: "https://www.daishs.com/our-hotels",
        })
    );

    // Fill in both customers, so the only record left with gaps is the prospect.
    for (const name of [HOTEL, SCHOOL]) {
      await client.mutation(api.salesDataCustomers.saveCustomerDetails, {
        accountNameKey: key(name),
        addressLine1: "1 Anywhere",
        addressLine2: "Second line",
        town: "Torquay",
        postcode: "TQ1 1AA",
        country: "United Kingdom",
        phone: "01803 555000",
        mobile: "07000 000000",
        email: "info@example.com",
        accountsEmail: "accounts@example.com",
        website: "https://example.com",
        contactName: "A Person",
        contactRole: "Manager",
        ...(name === HOTEL ? { bedrooms: 40 } : { pupils: 400 }),
      });
    }

    const result = (await t.run(
      async (ctx) =>
        await ctx.runQuery(internal.salesDataResearch.readCustomerForResearch, {
          companyId: comax.companyId,
        })
    )) as { found: boolean; accountName?: string; subjectType?: string };

    expect(result).toMatchObject({
      found: true,
      accountName: "Hotel Prince Regent",
      subjectType: "PROSPECT",
    });
  });

  test("one workspace's research is invisible to another's agent", async () => {
    const { t, comax, other } = await seed();

    // Both workspaces have a customer of this name, which is the case worth
    // testing: the account key alone does not identify a record, and an agent
    // that leaked across the boundary would read as working.
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax))
    );

    const theirs = (await t.run(
      async (ctx) =>
        await ctx.runQuery(internal.salesDataResearch.readCustomerForResearch, {
          companyId: other.companyId,
          accountNameKey: key(HOTEL),
        })
    )) as { known: Record<string, unknown>; missing: string[] };

    expect(theirs.known).not.toHaveProperty("phone");
    expect(theirs.missing).toContain("phone");
    expect(await detailsFor(t, other.companyId, HOTEL)).toBeNull();
  });

  test("a workspace without the section is refused", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await t.run(
      async (ctx) => await ctx.db.insert("companies", { name: "No Modules", createdAt: Date.now() })
    );

    await expect(
      t.run(
        async (ctx) =>
          await ctx.runQuery(internal.salesDataResearch.readCustomerForResearch, { companyId })
      )
    ).rejects.toThrow("Sales Data is not enabled");
  });
});

describe("recording what the agent found", () => {
  test("a confident finding reaches the customer record, with its source", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax))
    );

    expect(result).toMatchObject({ recorded: true, status: "APPLIED" });

    const details = await detailsFor(t, comax.companyId, HOTEL);
    expect(details?.phone).toBe("01803 555000");

    const rows = await researchFor(t, comax.companyId, HOTEL);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "APPLIED",
      field: "phone",
      sourceUrl: "https://devonshirehotel.co.uk/contact",
      sourceName: "Devonshire Hotel",
      subjectType: "CUSTOMER",
    });
  });

  test("the website is a detail the agent can fill in", async () => {
    const { t, comax } = await seed();

    await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordResearchFinding,
          finding(comax, {
            field: "website",
            value: "https://devonshirehotel.co.uk",
            sourceUrl: "https://devonshirehotel.co.uk",
          })
        )
    );

    expect((await detailsFor(t, comax.companyId, HOTEL))?.website).toBe(
      "https://devonshirehotel.co.uk"
    );
  });

  test("an unsure finding parks and the record stays empty", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordResearchFinding,
          finding(comax, { confidence: "MEDIUM" })
        )
    );

    expect(result).toMatchObject({ recorded: true, status: "NEEDS_CHECK" });
    expect(await detailsFor(t, comax.companyId, HOTEL)).toBeNull();
  });

  test("a confident finding does not overwrite what somebody typed", async () => {
    const { t, comax } = await seed();

    await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataCustomers.saveCustomerDetails, {
        accountNameKey: key(HOTEL),
        phone: "01803 111222",
      });

    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax))
    );

    const details = await detailsFor(t, comax.companyId, HOTEL);
    expect(details?.phone).toBe("01803 111222");

    const rows = await researchFor(t, comax.companyId, HOTEL);
    expect(rows[0]).toMatchObject({ status: "NEEDS_CHECK" });
  });

  test("a finding with no source is refused and nothing is stored", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordResearchFinding,
          finding(comax, { sourceUrl: undefined })
        )
    );

    expect(result).toMatchObject({ recorded: false });
    expect(await researchFor(t, comax.companyId, HOTEL)).toHaveLength(0);
    expect(await detailsFor(t, comax.companyId, HOTEL)).toBeNull();
  });

  test("a bed count offered for a school is refused", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordResearchFinding,
          finding(comax, { accountNameKey: key(SCHOOL), field: "bedrooms", value: "64" })
        )
    );

    expect(result).toMatchObject({ recorded: false });
    expect(await researchFor(t, comax.companyId, SCHOOL)).toHaveLength(0);
  });

  test("a customer that is not in the import is refused", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordResearchFinding,
          finding(comax, { accountNameKey: "A HOTEL NOBODY IMPORTED" })
        )
    );

    expect(result).toMatchObject({ recorded: false });
  });

  test("a customer belonging to another workspace cannot be written", async () => {
    const { t, comax, other } = await seed();

    // Pointed at our account name but carrying the other tenant's company. The
    // write must land on their record, never on ours.
    await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordResearchFinding,
          finding(other, { accountNameKey: key(HOTEL) })
        )
    );

    expect(await researchFor(t, comax.companyId, HOTEL)).toHaveLength(0);
    expect(await detailsFor(t, comax.companyId, HOTEL)).toBeNull();
  });

  describe("the cited page has to be one the run opened", () => {
    /**
     * Seeds a run that successfully read one page, as a real run does.
     *
     * The first live run cited a plausible address it had never opened for a
     * bed count it had read elsewhere. The number was right and the link was
     * dead, which is the one thing a source is for.
     */
    async function seedRunThatRead(
      t: TestConvex,
      workspace: Workspace,
      url: string
    ) {
      return await t.run(async (ctx) => {
        const agentId = await ctx.db.insert("agents", {
          name: "Researcher",
          modelId: "test-model",
          thinkingMode: false,
          isActive: true,
          temperature: 1,
          humanApprovalRequired: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const runId = await ctx.db.insert("agentRuns", {
          agentId,
          triggerType: "MANUAL" as const,
          objective: "Research a customer.",
          status: "RUNNING" as const,
          companyId: workspace.companyId,
          userId: workspace.userId,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        });
        await ctx.db.insert("agentToolCalls", {
          runId,
          agentId,
          normalizedToolName: "web_scrape",
          handlerMapping: "web.scrape",
          argumentsJson: JSON.stringify({ url }),
          status: "SUCCESS" as const,
          requiredRole: "ADMIN" as const,
          sideEffectLevel: "EXTERNAL" as const,
          confirmationRequired: false,
          companyId: workspace.companyId,
          startedAt: Date.now(),
        });
        return runId;
      });
    }

    test("a source the run never opened is refused", async () => {
      const { t, comax } = await seed();
      const runId = await seedRunThatRead(t, comax, "https://allegracare.co.uk/fairmile-grange");

      const result = await t.run(
        async (ctx) =>
          await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, {
            ...finding(comax, {
              // Plausible, and a 404. This is the exact address the live run
              // invented.
              sourceUrl: "https://www.allegracare.co.uk/our-homes/fairmile-grange",
            }),
            runId,
          })
      );

      expect(result).toMatchObject({ recorded: false });
      expect(await researchFor(t, comax.companyId, HOTEL)).toHaveLength(0);
      expect(await detailsFor(t, comax.companyId, HOTEL)).toBeNull();
    });

    test("the page it did open is accepted, however it is spelled", async () => {
      const { t, comax } = await seed();
      const runId = await seedRunThatRead(t, comax, "https://allegracare.co.uk/fairmile-grange");

      const result = await t.run(
        async (ctx) =>
          await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, {
            ...finding(comax, {
              sourceUrl: "https://www.allegracare.co.uk/fairmile-grange/?ref=search",
            }),
            runId,
          })
      );

      expect(result).toMatchObject({ recorded: true, status: "APPLIED" });
    });

    test("reporting nothing found needs no page", async () => {
      const { t, comax } = await seed();
      const runId = await seedRunThatRead(t, comax, "https://allegracare.co.uk/fairmile-grange");

      const result = await t.run(
        async (ctx) =>
          await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, {
            ...finding(comax, { field: "email", notFound: true, value: "", sourceUrl: undefined }),
            runId,
          })
      );

      expect(result).toMatchObject({ recorded: true, status: "NOT_FOUND" });
    });
  });

  test("a replayed call writes once", async () => {
    const { t, comax } = await seed();

    const first = await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax))
    );
    const second = await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax))
    );

    expect(first).toMatchObject({ recorded: true });
    expect(second).toMatchObject({ replayed: true });
    expect(await researchFor(t, comax.companyId, HOTEL)).toHaveLength(1);
  });

  test("nothing found is recorded, and writes nothing to the record", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordResearchFinding,
          finding(comax, { field: "email", notFound: true, value: "", sourceUrl: undefined })
        )
    );

    expect(result).toMatchObject({ recorded: true, status: "NOT_FOUND" });
    expect(await detailsFor(t, comax.companyId, HOTEL)).toBeNull();
  });
});

describe("finding the rest of a group", () => {
  const prospect = (workspace: Workspace, overrides: Record<string, unknown> = {}) => ({
    companyId: workspace.companyId,
    groupName: "Daish's Hotels",
    siteName: "Hotel Prince Regent",
    town: "Weymouth",
    postcode: "DT4 7NR",
    sourceUrl: "https://www.daishs.com/our-hotels",
    sourceName: "Daish's Holidays",
    reasoning: "Listed on Daish's own page of hotels.",
    ...overrides,
  });

  const prospectsFor = async (t: TestConvex, companyId: Id<"companies">) =>
    await t.run(async (ctx) =>
      await ctx.db
        .query("salesDataProspects")
        .withIndex("by_company_prospect", (q) => q.eq("companyId", companyId))
        .collect()
    );

  test("a site not in the workbook is filed as a prospect", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    expect(result).toMatchObject({ recorded: true, conflict: false });
    const rows = await prospectsFor(t, comax.companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      siteName: "Hotel Prince Regent",
      groupName: "Daish's Hotels",
      // Inherited from the group's existing members rather than guessed.
      customerType: "HOTELS",
      status: "NEW",
      postcode: "DT4 7NR",
      sourceName: "Daish's Holidays",
    });
  });

  test("a site that is already a customer is refused and named back", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordProspect,
          prospect(comax, { siteName: HOTEL, postcode: undefined })
        )
    );

    // The whole point: a rep must not be sent to an account already supplied.
    expect(result).toMatchObject({ recorded: false, alreadyKnown: true });
    expect(await prospectsFor(t, comax.companyId)).toHaveLength(0);
  });

  test("a customer found under a different spelling is still recognised", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordProspect,
          prospect(comax, { siteName: "The Devonshire", postcode: undefined })
        )
    );

    expect(result).toMatchObject({ recorded: false, alreadyKnown: true });
  });

  test("a customer found at its own postcode is recognised whatever it is called", async () => {
    const { t, comax } = await seed();

    await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataCustomers.saveCustomerDetails, {
        accountNameKey: key(HOTEL),
        postcode: "TQ1 1AA",
      });

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordProspect,
          prospect(comax, { siteName: "Something Quite Different", postcode: "TQ1 1AA" })
        )
    );

    expect(result).toMatchObject({ recorded: false, alreadyKnown: true });
  });

  test("a familiar name at a different postcode is filed, with the clash recorded", async () => {
    const { t, comax } = await seed();

    await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataCustomers.saveCustomerDetails, {
        accountNameKey: key(HOTEL),
        postcode: "TQ1 1AA",
      });

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordProspect,
          prospect(comax, { siteName: "The Devonshire Hotel", postcode: "EX1 1AA" })
        )
    );

    expect(result).toMatchObject({ recorded: true, conflict: true });
    const rows = await prospectsFor(t, comax.companyId);
    expect(rows[0].conflictNote).toContain("TQ1 1AA");
  });

  test("a second run over the same group adds nothing", async () => {
    const { t, comax } = await seed();

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax));
      await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax));
    });

    expect(await prospectsFor(t, comax.companyId)).toHaveLength(1);
  });

  test("a group the workspace does not supply is refused", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordProspect,
          prospect(comax, { groupName: "Some Chain We Have Never Sold To" })
        )
    );

    expect(result).toMatchObject({ recorded: false });
    expect(await prospectsFor(t, comax.companyId)).toHaveLength(0);
  });

  test("a site with no source is refused", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordProspect,
          prospect(comax, { sourceUrl: undefined })
        )
    );

    expect(result).toMatchObject({ recorded: false });
    expect(await prospectsFor(t, comax.companyId)).toHaveLength(0);
  });

  test("reading a group names what is already supplied", async () => {
    const { t, comax } = await seed();

    const result = await t.run(
      async (ctx) =>
        await ctx.runQuery(internal.salesDataResearch.readGroupForProspecting, {
          companyId: comax.companyId,
          groupName: "Daish's Hotels",
        })
    );

    expect(result).toMatchObject({ found: true, groupName: "Daish's Hotels" });
    expect((result as { supplied: string[] }).supplied).toContain(HOTEL);
  });

  test("a group already looked through is not offered again", async () => {
    const { t, comax } = await seed();

    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    const next = (await t.run(
      async (ctx) =>
        await ctx.runQuery(internal.salesDataResearch.readGroupForProspecting, {
          companyId: comax.companyId,
        })
    )) as { found: boolean; groupName?: string };

    expect(next.groupName).not.toBe("Daish's Hotels");
  });

  test("a prospect that starts buying becomes a customer, keeping what was researched", async () => {
    const { t, comax } = await seed();

    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    // What the agent would have found about the prospect before it bought
    // anything. Keyed the same way a customer's details are, which is the whole
    // reason conversion is a status change rather than a data move.
    await t.run(async (ctx) => {
      await ctx.db.insert("salesDataCustomers", {
        companyId: comax.companyId,
        accountNameKey: key("Hotel Prince Regent"),
        town: "Weymouth",
        postcode: "DT4 7NR",
        updatedAt: Date.now(),
        updatedBy: comax.userId,
      });
    });

    // The next workbook contains them.
    const importId = await t.run(async (ctx) => {
      const created = await ctx.db.insert("salesDataImports", {
        companyId: comax.companyId,
        fileName: "next.xlsx",
        status: "COMPLETED" as const,
        sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
        periodLabels: ["2026-02"],
        salesRowCount: 1,
        importedBy: comax.userId,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });
      await ctx.runMutation(internal.salesData.insertSalesRowsInternal, {
        companyId: comax.companyId,
        importId: created,
        rows: [
          {
            sourceRow: 2,
            accountName: "Hotel Prince Regent",
            parentAccount: "PRINCE",
            groupName: "Daish's Hotels",
            customerType: "HOTELS",
            customerTypeKey: "HOTELS",
            productCode: "CL1",
            uniqueId: "PRINCE-CL1",
            productDescription: "Cloths",
            productCategory: "Cleaning",
            productCategoryKey: "CLEANING",
            productType: "Cloths",
            productTypeKey: "CLOTHS",
            totalRevenue: 120,
          },
        ],
      });
      return created;
    });

    const rows = await prospectsFor(t, comax.companyId);
    expect(rows[0]).toMatchObject({ status: "CONVERTED" });

    // And what was researched about them is already on the customer record.
    const details = await t.run(
      async (ctx) =>
        await ctx.db
          .query("salesDataCustomers")
          .withIndex("by_company_account", (q) =>
            q.eq("companyId", comax.companyId).eq("accountNameKey", key("Hotel Prince Regent"))
          )
          .unique()
    );
    expect(details).toMatchObject({ town: "Weymouth", postcode: "DT4 7NR" });
    expect(importId).toBeTruthy();
  });

  test("the list shows customers by default, and prospects only when asked", async () => {
    const { t, comax } = await seed();
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    const client = t.withIdentity({ subject: comax.userId });
    const opts = { numItems: 25, cursor: null };

    const customers = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: opts,
    });
    const prospects = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: opts,
      record: "PROSPECTS" as const,
    });

    // The everyday list is unchanged — that is the point of the default.
    expect(customers.page.map((row) => row.accountName)).not.toContain("Hotel Prince Regent");
    expect(customers.page.every((row) => row.record === "CUSTOMER")).toBe(true);

    expect(prospects.page.map((row) => row.accountName)).toEqual(["Hotel Prince Regent"]);
    expect(prospects.page[0]).toMatchObject({
      record: "PROSPECT",
      town: "Weymouth",
      postcode: "DT4 7NR",
      // No spend: it is a business the workspace does not sell to.
      totalRevenue: 0,
    });
  });

  test("the missing-details filter answers for prospects, not just customers", async () => {
    // The filter exists so somebody can see who is about to be researched. It
    // was only applied to the customers half, so ticking it while looking at
    // prospects changed nothing and every prospect stayed listed — reading as
    // "these have all been checked" when none of them had.
    const { t, comax } = await seed();
    const client = t.withIdentity({ subject: comax.userId });
    const opts = { numItems: 25, cursor: null };

    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    const beforeFilling = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: opts,
      record: "PROSPECTS" as const,
      missingDetailsOnly: true,
    });
    expect(beforeFilling.page.map((row) => row.accountName)).toEqual(["Hotel Prince Regent"]);

    await client.mutation(api.salesDataCustomers.saveCustomerDetails, {
      accountNameKey: key("Hotel Prince Regent"),
      addressLine1: "1 Anywhere",
      addressLine2: "Second line",
      town: "Weymouth",
      postcode: "DT4 7NR",
      country: "United Kingdom",
      phone: "01305 555000",
      mobile: "07000 000000",
      email: "info@example.com",
      accountsEmail: "accounts@example.com",
      website: "https://example.com",
      contactName: "A Person",
      contactRole: "Manager",
      bedrooms: 40,
    });

    const afterFilling = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: opts,
      record: "PROSPECTS" as const,
      missingDetailsOnly: true,
    });
    expect(afterFilling.page).toHaveLength(0);

    // Still there without the filter — filled in, not gone.
    const unfiltered = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: opts,
      record: "PROSPECTS" as const,
    });
    expect(unfiltered.page.map((row) => row.accountName)).toEqual(["Hotel Prince Regent"]);
  });

  test("everything reads customers first, then prospects, without dropping a row", async () => {
    const { t, comax } = await seed();
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    const client = t.withIdentity({ subject: comax.userId });
    const seen: string[] = [];
    // Annotated because the loop reassigns it from the page it fetches, and the
    // inference would otherwise chase its own tail.
    let cursor: string | null = null;
    type Listing = Awaited<
      ReturnType<typeof client.query<typeof api.salesDataCustomers.listCustomers>>
    >;

    // One row a page, so the handover from accounts to prospects happens on a
    // page boundary — the case a merged cursor gets wrong.
    for (let guard = 0; guard < 10; guard += 1) {
      const page: Listing = await client.query(api.salesDataCustomers.listCustomers, {
        paginationOpts: { numItems: 1, cursor },
        record: "ALL" as const,
      });
      seen.push(...page.page.map((row) => row.accountName));
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    expect(seen).toContain(HOTEL);
    expect(seen).toContain(SCHOOL);
    expect(seen).toContain("Hotel Prince Regent");
    expect(new Set(seen).size).toBe(seen.length);
  });

  test("a prospect carries the same record as a customer, and can be filled in", async () => {
    const { t, comax } = await seed();
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    const client = t.withIdentity({ subject: comax.userId });
    const prospectKey = key("Hotel Prince Regent");

    const record = await client.query(api.salesDataCustomers.getCustomer, {
      accountNameKey: prospectKey,
    });

    expect(record).toMatchObject({
      record: "PROSPECT",
      accountName: "Hotel Prince Regent",
      customerType: "HOTELS",
      // Its type decides the extra figure, exactly as a customer's does.
      extraField: "bedrooms",
      // Known from the page that listed it, before anybody researches it.
      town: "Weymouth",
      postcode: "DT4 7NR",
    });
    expect(record?.prospect).toMatchObject({ status: "NEW", sourceName: "Daish's Holidays" });

    // Every field a customer has, saved the same way.
    await client.mutation(api.salesDataCustomers.saveCustomerDetails, {
      accountNameKey: prospectKey,
      phone: "01305 771 313",
      email: "ReceptionRegent@daishs.com",
      contactName: "A Person",
      bedrooms: 75,
    });

    const filled = await client.query(api.salesDataCustomers.getCustomer, {
      accountNameKey: prospectKey,
    });
    expect(filled).toMatchObject({
      phone: "01305 771 313",
      email: "ReceptionRegent@daishs.com",
      contactName: "A Person",
      bedrooms: 75,
    });
  });

  test("the agent can research a prospect, not just a customer", async () => {
    const { t, comax } = await seed();
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );
    const prospectKey = key("Hotel Prince Regent");

    const read = await t.run(
      async (ctx) =>
        await ctx.runQuery(internal.salesDataResearch.readCustomerForResearch, {
          companyId: comax.companyId,
          accountNameKey: prospectKey,
        })
    );
    expect(read).toMatchObject({ found: true, subjectType: "PROSPECT" });

    const recorded = await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, {
          ...finding(comax, { accountNameKey: prospectKey }),
          sourceUrl: "https://www.daishs.com/weymouth/hotel-prince-regent",
        })
    );

    expect(recorded).toMatchObject({ recorded: true, status: "APPLIED" });
    const rows = await t.run(async (ctx) =>
      await ctx.db
        .query("salesDataCustomerResearch")
        .withIndex("by_company_subject_field", (q) =>
          q.eq("companyId", comax.companyId).eq("subjectKey", prospectKey)
        )
        .collect()
    );
    expect(rows[0]).toMatchObject({ subjectType: "PROSPECT" });
  });

  test("a dismissed prospect stops appearing", async () => {
    const { t, comax } = await seed();
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    const client = t.withIdentity({ subject: comax.userId });
    await client.mutation(api.salesDataResearch.dismissProspect, {
      prospectKey: key("Hotel Prince Regent"),
    });

    const listed = await client.query(api.salesDataCustomers.listCustomers, {
      paginationOpts: { numItems: 25, cursor: null },
      record: "PROSPECTS" as const,
    });
    expect(listed.page).toHaveLength(0);

    // Kept rather than deleted, so a later run does not re-report it.
    expect(await prospectsFor(t, comax.companyId)).toHaveLength(1);
  });

  test("another workspace cannot dismiss a prospect", async () => {
    const { t, comax, other } = await seed();
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    await expect(
      t
        .withIdentity({ subject: other.userId })
        .mutation(api.salesDataResearch.dismissProspect, {
          prospectKey: key("Hotel Prince Regent"),
        })
    ).rejects.toThrow("not in this workspace");
  });

  test("a group's other sites are listed for its members' profiles", async () => {
    const { t, comax } = await seed();
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    const sites = await t
      .withIdentity({ subject: comax.userId })
      .query(api.salesDataResearch.listGroupProspects, { groupName: "Daish's Hotels" });

    expect(sites).toEqual([
      { prospectKey: key("Hotel Prince Regent"), siteName: "Hotel Prince Regent", town: "Weymouth" },
    ]);
  });

  test("one workspace's prospects are invisible to another", async () => {
    const { t, comax, other } = await seed();

    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, prospect(comax))
    );

    expect(await prospectsFor(t, other.companyId)).toHaveLength(0);
  });
});

describe("starting the research from a screen", () => {
  /**
   * Installs the research tools on an agent, which is how the screens find it.
   *
   * Deliberately not by name: the platform never learns what a client calls
   * their agent, so the only question it can ask is which active agent in this
   * workspace holds these tools.
   */
  async function giveAgentTheTools(
    t: TestConvex,
    options: { companyId?: Id<"companies">; isActive?: boolean } = {}
  ) {
    return await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "toolsmith@test.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Whatever The Client Called It",
        modelId: "test-model",
        thinkingMode: false,
        isActive: options.isActive ?? true,
        temperature: 1,
        humanApprovalRequired: false,
        ...(options.companyId ? { companyId: options.companyId } : {}),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      for (const handlerMapping of [
        "salesCustomers.research.read",
        "salesCustomers.research.record",
      ]) {
        const toolId = await ctx.db.insert("aiTools", {
          name: handlerMapping,
          description: "Customer research.",
          handlerMapping,
          connectorKey: "sales-customer-research",
          requiredRole: "ADMIN" as const,
          createdAt: Date.now(),
          createdBy: userId,
        });
        await ctx.db.insert("agentTools", { agentId, toolId, assignedAt: Date.now() });
      }
      return agentId;
    });
  }

  const runsFor = async (t: TestConvex, companyId: Id<"companies">) =>
    await t.run(async (ctx) =>
      (await ctx.db.query("agentRuns").collect()).filter((run) => run.companyId === companyId)
    );

  test("one customer queues one run, naming that customer", async () => {
    const { t, comax } = await seed();
    const agentId = await giveAgentTheTools(t, { companyId: comax.companyId });

    const result = await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.startCustomerResearch, { accountNameKey: key(HOTEL) });

    expect(result).toMatchObject({ queued: 1 });
    const runs = await runsFor(t, comax.companyId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ agentId, status: "QUEUED", userId: comax.userId });
    expect(runs[0].objective).toContain(key(HOTEL));
  });

  test("the sweep queues one run per customer with gaps", async () => {
    const { t, comax } = await seed();
    await giveAgentTheTools(t, { companyId: comax.companyId });

    const result = await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.startCustomerResearchSweep, {});

    // Two customers are seeded and neither has anything filled in.
    expect(result).toMatchObject({ queued: 2, skipped: 0 });
    expect(await runsFor(t, comax.companyId)).toHaveLength(2);
  });

  test("the sweep researches prospects as well as customers", async () => {
    const { t, comax } = await seed();
    await giveAgentTheTools(t, { companyId: comax.companyId });
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, {
          companyId: comax.companyId,
          groupName: "Daish's Hotels",
          siteName: "Hotel Prince Regent",
          town: "Weymouth",
          postcode: "DT4 7NR",
          sourceUrl: "https://www.daishs.com/our-hotels",
        })
    );

    const result = await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.startCustomerResearchSweep, {});

    // Two customers plus the prospect: a name and a postcode is enough to
    // prioritise a site, not enough to ring it.
    expect(result).toMatchObject({ queued: 3 });
    const runs = await runsFor(t, comax.companyId);
    expect(runs.some((run) => run.objective.includes(key("Hotel Prince Regent")))).toBe(true);
  });

  test("a prospect is queued even when there are more customers than the cap allows", async () => {
    // Customers used to be queued first and prospects second, under a cap of
    // sixty runs per press. A workspace with sixty gapped customers therefore
    // queued no prospect on any press, ever — silently, because the sweep only
    // reports its own count. Interleaving means both halves advance together.
    const { t, comax } = await seed();
    await giveAgentTheTools(t, { companyId: comax.companyId });

    await t.run(async (ctx) => {
      const currentImport = await ctx.db
        .query("salesDataImports")
        .filter((q) => q.eq(q.field("companyId"), comax.companyId))
        .first();
      if (!currentImport) throw new Error("seed has no import");

      for (let index = 0; index < 70; index += 1) {
        await ctx.db.insert("salesDataAccounts", {
          companyId: comax.companyId,
          importId: currentImport._id,
          accountName: `Filler Hotel ${index}`,
          accountNameKey: key(`Filler Hotel ${index}`),
          groupName: "Daish's Hotels",
          groupNameKey: key("Daish's Hotels"),
          customerType: "Hotels",
          customerTypeKey: key("Hotels"),
          codeTally: {},
          totalRevenue: 0,
          productCount: 0,
        });
      }

      await ctx.runMutation(internal.salesDataResearch.recordProspect, {
        companyId: comax.companyId,
        groupName: "Daish's Hotels",
        siteName: "Hotel Prince Regent",
        town: "Weymouth",
        postcode: "DT4 7NR",
        sourceUrl: "https://www.daishs.com/our-hotels",
      });
    });

    const result = await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.startCustomerResearchSweep, {});

    // Capped, and honest about it — but the prospect is inside the cap.
    expect(result.skipped).toBeGreaterThan(0);
    const runs = await runsFor(t, comax.companyId);
    expect(runs.some((run) => run.objective.includes(key("Hotel Prince Regent")))).toBe(true);
  });

  test("a customer that is already complete is not researched again", async () => {
    const { t, comax } = await seed();
    await giveAgentTheTools(t, { companyId: comax.companyId });
    const client = t.withIdentity({ subject: comax.userId });

    await client.mutation(api.salesDataCustomers.saveCustomerDetails, {
      accountNameKey: key(HOTEL),
      addressLine1: "1 Anywhere",
      addressLine2: "Second line",
      town: "Torquay",
      postcode: "TQ1 1AA",
      country: "United Kingdom",
      phone: "01803 555000",
      mobile: "07000 000000",
      email: "info@example.com",
      accountsEmail: "accounts@example.com",
      website: "https://example.com",
      contactName: "A Person",
      contactRole: "Manager",
      bedrooms: 40,
    });

    const result = await client.mutation(api.salesDataResearch.startCustomerResearchSweep, {});

    expect(result).toMatchObject({ queued: 1 });
    const runs = await runsFor(t, comax.companyId);
    expect(runs.every((run) => !run.objective.includes(key(HOTEL)))).toBe(true);
  });

  test("the prospecting sweep looks through every group, once each", async () => {
    const { t, comax } = await seed();
    await giveAgentTheTools(t, { companyId: comax.companyId });
    const client = t.withIdentity({ subject: comax.userId });

    // Two groups are seeded: Daish's Hotels and Bohunt Education Trust.
    const first = await client.mutation(api.salesDataResearch.startProspectingSweep, {});
    expect(first).toMatchObject({ queued: 2, skipped: 0 });

    const runs = await runsFor(t, comax.companyId);
    expect(runs.some((run) => run.objective.includes("Daish's Hotels"))).toBe(true);
    expect(runs.some((run) => run.objective.includes("Bohunt Education Trust"))).toBe(true);
  });

  test("a group with prospects against it is looked through again", async () => {
    const { t, comax } = await seed();
    await giveAgentTheTools(t, { companyId: comax.companyId });
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, {
          companyId: comax.companyId,
          groupName: "Daish's Hotels",
          siteName: "Hotel Prince Regent",
          sourceUrl: "https://www.daishs.com/our-hotels",
        })
    );

    // A run cut short by the budget records two sites out of twenty, and to a
    // sweep that skipped "groups with prospects" it would look finished for
    // ever. Correctness beats the few pence a second pass costs.
    const result = await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.startProspectingSweep, {});

    expect(result).toMatchObject({ queued: 2 });
    const runs = await runsFor(t, comax.companyId);
    expect(runs.some((run) => run.objective.includes("Daish's Hotels"))).toBe(true);
  });

  test("only the untouched groups, when that is what is asked for", async () => {
    const { t, comax } = await seed();
    await giveAgentTheTools(t, { companyId: comax.companyId });
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordProspect, {
          companyId: comax.companyId,
          groupName: "Daish's Hotels",
          siteName: "Hotel Prince Regent",
          sourceUrl: "https://www.daishs.com/our-hotels",
        })
    );

    const result = await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.startProspectingSweep, { unsearchedOnly: true });

    expect(result).toMatchObject({ queued: 1 });
    const runs = await runsFor(t, comax.companyId);
    expect(runs.every((run) => !run.objective.includes("Daish's Hotels"))).toBe(true);
  });

  test("a workspace with no agent holding the tools is told so", async () => {
    const { t, comax } = await seed();

    await expect(
      t
        .withIdentity({ subject: comax.userId })
        .mutation(api.salesDataResearch.startCustomerResearchSweep, {})
    ).rejects.toThrow();
  });

  test("another workspace's agent is not borrowed", async () => {
    const { t, comax, other } = await seed();
    await giveAgentTheTools(t, { companyId: other.companyId });

    await expect(
      t
        .withIdentity({ subject: comax.userId })
        .mutation(api.salesDataResearch.startCustomerResearchSweep, {})
    ).rejects.toThrow();
  });

  test("a draft agent is not used", async () => {
    const { t, comax } = await seed();
    await giveAgentTheTools(t, { companyId: comax.companyId, isActive: false });

    await expect(
      t
        .withIdentity({ subject: comax.userId })
        .mutation(api.salesDataResearch.startCustomerResearchSweep, {})
    ).rejects.toThrow();
  });
});

describe("the profile's view of what was found", () => {
  test("separates what was written from what is waiting for a person", async () => {
    const { t, comax } = await seed();

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax));
      await ctx.runMutation(
        internal.salesDataResearch.recordResearchFinding,
        finding(comax, { field: "town", value: "Torquay", confidence: "MEDIUM" })
      );
      // History, not something the profile should show.
      await ctx.runMutation(
        internal.salesDataResearch.recordResearchFinding,
        finding(comax, { field: "email", notFound: true, value: "", sourceUrl: undefined })
      );
    });

    const research = await t
      .withIdentity({ subject: comax.userId })
      .query(api.salesDataResearch.listCustomerResearch, { accountNameKey: key(HOTEL) });

    expect(research.applied.map((row) => row.field)).toEqual(["phone"]);
    expect(research.applied[0]).toMatchObject({
      sourceName: "Devonshire Hotel",
      sourceUrl: "https://devonshirehotel.co.uk/contact",
    });
    expect(research.needsCheck.map((row) => row.field)).toEqual(["town"]);
  });

  test("another workspace cannot read it", async () => {
    const { t, comax, other } = await seed();

    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax))
    );

    const theirs = await t
      .withIdentity({ subject: other.userId })
      .query(api.salesDataResearch.listCustomerResearch, { accountNameKey: key(HOTEL) });

    expect(theirs.applied).toHaveLength(0);
    expect(theirs.needsCheck).toHaveLength(0);
  });
});

describe("deciding what the agent parked", () => {
  async function parkedFinding(t: TestConvex, workspace: Workspace, overrides: FindingOverrides = {}) {
    await t.run(
      async (ctx) =>
        await ctx.runMutation(
          internal.salesDataResearch.recordResearchFinding,
          finding(workspace, { confidence: "MEDIUM", ...overrides })
        )
    );
    const rows = await researchFor(t, workspace.companyId, HOTEL);
    return rows[rows.length - 1]._id;
  }

  test("accepting one writes it to the record", async () => {
    const { t, comax } = await seed();
    const researchId = await parkedFinding(t, comax);

    const result = await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.decideResearchFinding, { researchId, decision: "accept" });

    expect(result).toMatchObject({ status: "APPLIED" });
    expect((await detailsFor(t, comax.companyId, HOTEL))?.phone).toBe("01803 555000");
  });

  test("accepting a count stores it as a number", async () => {
    const { t, comax } = await seed();
    const researchId = await parkedFinding(t, comax, {
      field: "bedrooms",
      value: "Registered beds: 64",
    });

    await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.decideResearchFinding, { researchId, decision: "accept" });

    expect((await detailsFor(t, comax.companyId, HOTEL))?.bedrooms).toBe(64);
  });

  test("accepting one answer clears the other offers for that field", async () => {
    const { t, comax } = await seed();
    const first = await parkedFinding(t, comax, { value: "01803 111111" });
    const second = await parkedFinding(t, comax, { value: "01803 222222" });

    await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.decideResearchFinding, {
        researchId: second,
        decision: "accept",
      });

    const rows = await researchFor(t, comax.companyId, HOTEL);
    expect(rows.find((row) => row._id === first)).toMatchObject({ status: "SUPERSEDED" });
    expect(rows.find((row) => row._id === second)).toMatchObject({ status: "APPLIED" });
  });

  test("discarding a parked finding leaves the record alone", async () => {
    const { t, comax } = await seed();
    const researchId = await parkedFinding(t, comax);

    const result = await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.decideResearchFinding, { researchId, decision: "discard" });

    expect(result).toMatchObject({ status: "REJECTED" });
    expect(await detailsFor(t, comax.companyId, HOTEL)).toBeNull();
  });

  test("'not right' on a written value clears the field", async () => {
    const { t, comax } = await seed();
    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax))
    );
    const researchId = (await researchFor(t, comax.companyId, HOTEL))[0]._id;

    await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataResearch.decideResearchFinding, { researchId, decision: "discard" });

    expect((await detailsFor(t, comax.companyId, HOTEL))?.phone).toBeUndefined();
    expect((await researchFor(t, comax.companyId, HOTEL))[0]).toMatchObject({
      status: "REJECTED",
      decidedBy: comax.userId,
    });
  });

  test("a finding in another workspace cannot be decided", async () => {
    const { t, comax, other } = await seed();
    const researchId = await parkedFinding(t, comax);

    await expect(
      t
        .withIdentity({ subject: other.userId })
        .mutation(api.salesDataResearch.decideResearchFinding, { researchId, decision: "accept" })
    ).rejects.toThrow("not in this workspace");
  });

  test("a finding already decided cannot be decided again", async () => {
    const { t, comax } = await seed();
    const researchId = await parkedFinding(t, comax);
    const client = t.withIdentity({ subject: comax.userId });

    await client.mutation(api.salesDataResearch.decideResearchFinding, {
      researchId,
      decision: "discard",
    });

    await expect(
      client.mutation(api.salesDataResearch.decideResearchFinding, { researchId, decision: "accept" })
    ).rejects.toThrow("already been decided");
  });
});

describe("a person's edit outranks the agent's", () => {
  test("editing a researched field takes its source marker off, and only that one", async () => {
    const { t, comax } = await seed();

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax));
      await ctx.runMutation(
        internal.salesDataResearch.recordResearchFinding,
        finding(comax, {
          field: "town",
          value: "Torquay",
          sourceUrl: "https://devonshirehotel.co.uk/find-us",
        })
      );
    });

    await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataCustomers.saveCustomerDetails, {
        accountNameKey: key(HOTEL),
        phone: "01803 999888",
        town: "Torquay",
      });

    const rows = await researchFor(t, comax.companyId, HOTEL);
    const phone = rows.find((row) => row.field === "phone");
    const town = rows.find((row) => row.field === "town");

    expect(phone).toMatchObject({ status: "SUPERSEDED", decidedBy: comax.userId });
    // Re-submitted unchanged by the same form save, so its provenance stands.
    expect(town).toMatchObject({ status: "APPLIED" });
  });

  test("clearing a researched field also supersedes it", async () => {
    const { t, comax } = await seed();

    await t.run(
      async (ctx) =>
        await ctx.runMutation(internal.salesDataResearch.recordResearchFinding, finding(comax))
    );

    await t
      .withIdentity({ subject: comax.userId })
      .mutation(api.salesDataCustomers.saveCustomerDetails, {
        accountNameKey: key(HOTEL),
        phone: "",
      });

    const rows = await researchFor(t, comax.companyId, HOTEL);
    expect(rows[0]).toMatchObject({ status: "SUPERSEDED" });
    expect((await detailsFor(t, comax.companyId, HOTEL))?.phone).toBeUndefined();
  });
});

describe("provisioning the two workers", () => {
  /**
   * The boundary made real: after provisioning, the finder holds the group
   * tools and cannot record a customer detail; the filler holds the customer
   * tools and cannot file a site. Running it twice converges rather than
   * doubling bindings, because it will be run again every time an agent is
   * recreated.
   */
  test("splits the tools one skill each, and converges when run twice", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const seeded = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
      const mappings = [
        "salesCustomers.research.read",
        "salesCustomers.research.record",
        "salesCustomers.prospects.read",
        "salesCustomers.prospects.record",
        "salesCustomers.job.next",
        "web.scrape",
      ];
      const toolIds: Record<string, Id<"aiTools">> = {};
      for (const handlerMapping of mappings) {
        toolIds[handlerMapping] = await ctx.db.insert("aiTools", {
          name: handlerMapping,
          description: "Research tooling.",
          handlerMapping,
          connectorKey: handlerMapping === "web.scrape" ? "web-reader" : "sales-customer-research",
          requiredRole: "ADMIN" as const,
          createdAt: Date.now(),
          createdBy: userId,
        });
      }

      const fillerId = await ctx.db.insert("agents", {
        name: "Company Research Agent",
        systemPrompt: "Fill in details.",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const finderId = await ctx.db.insert("agents", {
        name: "Prospect Search Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // The filler starts holding everything — today's single-agent shape.
      for (const handlerMapping of mappings) {
        await ctx.db.insert("agentTools", {
          agentId: fillerId,
          toolId: toolIds[handlerMapping],
          assignedAt: Date.now(),
        });
      }

      return { fillerId, finderId };
    });

    await t.mutation(internal.salesDataResearch.provisionResearchWorkers, {
      fillerAgentId: seeded.fillerId,
      finderAgentId: seeded.finderId,
    });
    // Second run must converge, not double up.
    await t.mutation(internal.salesDataResearch.provisionResearchWorkers, {
      fillerAgentId: seeded.fillerId,
      finderAgentId: seeded.finderId,
    });

    const state = await t.run(async (ctx) => {
      const bindings = await ctx.db.query("agentTools").collect();
      const tools = await ctx.db.query("aiTools").collect();
      const nameById = new Map(tools.map((tool) => [tool._id, tool.handlerMapping]));
      const held = (agentId: Id<"agents">) =>
        bindings
          .filter((binding) => binding.agentId === agentId)
          .map((binding) => nameById.get(binding.toolId))
          .sort();
      return {
        filler: held(seeded.fillerId),
        finder: held(seeded.finderId),
        finderPrompt: (await ctx.db.get(seeded.finderId))?.systemPrompt ?? "",
        fillerPrompt: (await ctx.db.get(seeded.fillerId))?.systemPrompt ?? "",
      };
    });

    expect(state.filler).toEqual([
      "salesCustomers.job.next",
      "salesCustomers.research.read",
      "salesCustomers.research.record",
      "web.scrape",
    ]);
    expect(state.finder).toEqual([
      "salesCustomers.job.next",
      "salesCustomers.prospects.read",
      "salesCustomers.prospects.record",
      "web.scrape",
    ]);
    // Both workers get their sheets from code, priority section included.
    expect(state.finderPrompt).toContain("file each one as a prospect");
    expect(state.fillerPrompt).toContain("THE FIGURE THAT MATTERS MOST");
    expect(state.fillerPrompt).toContain("pupils for a school, bedrooms for a care home");
  });
});
