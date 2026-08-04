import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const key = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ").replace(/&/g, "AND");

const MARKET_TOOLS = [
  "marketDiscovery.job.next",
  "marketDiscovery.groups.record",
  "marketDiscovery.groups.review",
  "marketDiscovery.locations.read",
  "marketDiscovery.locations.record",
];

async function seed(args: { installTools?: boolean } = {}) {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", {
      name: "Comax",
      enabledModules: ["salesData"],
      createdAt: now,
    });
    const userId = await ctx.db.insert("users", {
      email: "buyer@test.com",
      role: "ADMIN",
      companyId,
    });
    const importId = await ctx.db.insert("salesDataImports", {
      companyId,
      fileName: "sample.xlsx",
      status: "COMPLETED",
      sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
      periodLabels: ["2026-01"],
      importedBy: userId,
      startedAt: now,
      completedAt: now,
    });

    await ctx.db.insert("salesDataAccounts", {
      companyId,
      importId,
      accountNameKey: key("Fairmile Grange"),
      accountName: "Fairmile Grange",
      codeTally: { CARE1: 1 },
      groupName: "Allegra Care",
      groupNameKey: key("Allegra Care"),
      customerType: "CARE HOMES",
      customerTypeKey: key("CARE HOMES"),
      totalRevenue: 100,
      productCount: 1,
    });

    const agentId = await ctx.db.insert("agents", {
      name: "Market Discovery Agent",
      modelId: "test-model",
      thinkingMode: false,
      isActive: true,
      companyId,
      autonomousToolExecution: true,
      createdAt: now,
      updatedAt: now,
    });

    if (args.installTools ?? true) {
      for (const handlerMapping of MARKET_TOOLS) {
        await ctx.db.insert("aiTools", {
          name: handlerMapping,
          description: "Market discovery.",
          handlerMapping,
          connectorKey: "sales-market-discovery",
          requiredRole: "ADMIN",
          sideEffectLevel: handlerMapping.endsWith(".read") ? "READ" : "WRITE",
          confirmationRequired: false,
          createdAt: now,
          createdBy: userId,
        });
      }
      await ctx.db.insert("aiTools", {
        name: "web.scrape",
        description: "Read a page.",
        handlerMapping: "web.scrape",
        connectorKey: "sonae-firecrawl",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: false,
        createdAt: now,
        createdBy: userId,
      });
    }

    return { companyId, userId, agentId };
  });

  return { t, ...seeded, client: t.withIdentity({ subject: seeded.userId }) };
}

async function latestJob(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await ctx.db.query("salesDataMarketDiscoveryJobs").first());
}

async function markPageRead(
  t: ReturnType<typeof convexTest>,
  args: {
    companyId: Id<"companies">;
    userId: Id<"users">;
    agentId: Id<"agents">;
    runId: Id<"agentRuns">;
    url: string;
  }
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("agentToolCalls", {
      runId: args.runId,
      agentId: args.agentId,
      normalizedToolName: "web_scrape",
      handlerMapping: "web.scrape",
      argumentsJson: JSON.stringify({ url: args.url }),
      resultJson: "{}",
      status: "SUCCESS",
      requiredRole: "ADMIN",
      sideEffectLevel: "EXTERNAL",
      confirmationRequired: false,
      companyId: args.companyId,
      userId: args.userId,
      startedAt: Date.now(),
      completedAt: Date.now(),
    });
  });
}

describe("market discovery jobs", () => {
  test("starting a job configures the blank market discovery agent and exposes progress", async () => {
    const { client } = await seed();

    const started = await client.mutation(api.salesDataMarketDiscovery.startMarketDiscoveryJob, {});

    expect(started.started).toBe(true);
    const progress = await client.query(api.salesDataMarketDiscovery.getMarketDiscoveryJob, {});
    expect(progress).toMatchObject({
      status: "RUNNING",
      phase: "FIND_GROUPS",
      customerType: "All customer types",
      targetGroupCount: 2,
      groupsAccepted: 0,
      locationsFiled: 0,
      maxCostGBP: 25,
    });
  });

  test("starting a job creates missing built-in tool rows for a blank agent", async () => {
    const { t, client, agentId } = await seed({ installTools: false });

    await client.mutation(api.salesDataMarketDiscovery.startMarketDiscoveryJob, {});

    const bindings = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("agentTools")
        .withIndex("by_agent", (q) => q.eq("agentId", agentId))
        .collect();
      const tools = await Promise.all(rows.map((row) => ctx.db.get(row.toolId)));
      return tools.map((tool) => tool?.handlerMapping).filter(Boolean).sort();
    });

    expect(bindings).toEqual([
      "marketDiscovery.groups.record",
      "marketDiscovery.groups.review",
      "marketDiscovery.job.next",
      "marketDiscovery.locations.read",
      "marketDiscovery.locations.record",
      "web.scrape",
    ]);
  });

  test("parent groups require a source opened in the same run and refuse workspace duplicates", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    await client.mutation(api.salesDataMarketDiscovery.startMarketDiscoveryJob, {});
    const job = await latestJob(t);
    if (!job?.runId) throw new Error("Missing job run.");

    const sourceUrl = "https://example.com/barchester";
    const refused = await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      customerType: "CARE HOMES",
      sourceUrl,
      reasoning: "The page says Barchester operates care homes.",
      confidence: "HIGH",
      agentId,
      runId: job.runId,
    });
    expect(refused.recorded).toBe(false);
    expect(refused.reason).toContain("Open the source page");

    await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url: sourceUrl });
    const accepted = await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      customerType: "CARE HOMES",
      sourceUrl,
      reasoning: "The page says Barchester operates care homes.",
      confidence: "HIGH",
      agentId,
      runId: job.runId,
    });
    expect(accepted.recorded).toBe(true);

    await markPageRead(t, {
      companyId,
      userId,
      agentId,
      runId: job.runId,
      url: "https://example.com/allegra",
    });
    const duplicate = await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
      companyId,
      groupName: "Allegra Care",
      customerType: "CARE HOMES",
      sourceUrl: "https://example.com/allegra",
      reasoning: "The page says Allegra operates care homes.",
      confidence: "HIGH",
      agentId,
      runId: job.runId,
    });
    expect(duplicate.recorded).toBe(false);
    expect(duplicate.duplicate).toBe(true);

    const progress = await client.query(api.salesDataMarketDiscovery.getMarketDiscoveryJob, {});
    expect(progress?.groupsAccepted).toBe(1);
    expect(progress?.groupsDuplicate).toBe(1);
  });

  test("accepted group locations are filed as market-discovery prospects and counted", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    await client.mutation(api.salesDataMarketDiscovery.startMarketDiscoveryJob, {});
    const job = await latestJob(t);
    if (!job?.runId) throw new Error("Missing job run.");

    const groupUrl = "https://example.com/barchester";
    await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url: groupUrl });
    await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      customerType: "CARE HOMES",
      sourceUrl: groupUrl,
      reasoning: "The page says Barchester operates care homes.",
      confidence: "HIGH",
      agentId,
      runId: job.runId,
    });
    await markPageRead(t, {
      companyId,
      userId,
      agentId,
      runId: job.runId,
      url: "https://example.com/care-uk",
    });
    await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
      companyId,
      groupName: "Care UK",
      customerType: "CARE HOMES",
      sourceUrl: "https://example.com/care-uk",
      reasoning: "The page says Care UK operates care homes.",
      confidence: "HIGH",
      agentId,
      runId: job.runId,
    });

    const next = await t.mutation(internal.salesDataMarketDiscovery.nextTaskInternal, {
      companyId,
      runId: job.runId,
    });
    expect(next.task?.kind).toBe("FIND_LOCATIONS");

    const locationUrl = "https://example.com/barchester/homes";
    await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url: locationUrl });
    const recorded = await t.mutation(internal.salesDataMarketDiscovery.recordLocationInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      siteName: "Barchester Test Home",
      town: "Poole",
      postcode: "BH1 1AA",
      sourceUrl: locationUrl,
      reasoning: "The page lists Barchester Test Home as a Barchester care home.",
      agentId,
      runId: job.runId,
    });
    expect(recorded.recorded).toBe(true);

    const prospect = await t.run(async (ctx) =>
      await ctx.db
        .query("salesDataProspects")
        .withIndex("by_company_prospect", (q) =>
          q.eq("companyId", companyId).eq("prospectKey", key("Barchester Test Home"))
        )
        .unique()
    );
    expect(prospect).toMatchObject({
      origin: "MARKET_DISCOVERY",
      groupName: "Barchester Healthcare",
      customerType: "CARE HOMES",
    });

    const progress = await client.query(api.salesDataMarketDiscovery.getMarketDiscoveryJob, {});
    expect(progress?.locationsFiled).toBe(1);
  });
});
