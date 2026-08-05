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


  test("a site outside the UK is refused however good the parent company is", async () => {
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
    await t.mutation(internal.salesDataMarketDiscovery.nextTaskInternal, {
      companyId,
      runId: job.runId,
    });

    const siteUrl = "https://example.com/barchester/locations";
    await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url: siteUrl });

    // A real site, a real source page, an address Comax cannot deliver to.
    const abroad = await t.mutation(internal.salesDataMarketDiscovery.recordLocationInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      siteName: "Barchester Boston Home",
      town: "Boston",
      postcode: "02108",
      sourceUrl: siteUrl,
      reasoning: "Listed on the group's locations page.",
      agentId,
      runId: job.runId,
    });
    expect(abroad.recorded).toBe(false);
    expect(abroad.reason).toContain("not a UK postcode");

    // No postcode at all is refused too — otherwise leaving it out is the way
    // round the rule.
    const noPostcode = await t.mutation(internal.salesDataMarketDiscovery.recordLocationInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      siteName: "Barchester Somewhere Home",
      town: "Somewhere",
      sourceUrl: siteUrl,
      reasoning: "Listed on the group's locations page.",
      agentId,
      runId: job.runId,
    });
    expect(noPostcode.recorded).toBe(false);
    expect(noPostcode.reason).toContain("full UK postcode");

    // Nothing was filed by either attempt.
    const filed = await t.run(async (ctx) =>
      await ctx.db.query("salesDataProspects").collect()
    );
    expect(filed).toEqual([]);
  });

  test("a UK site is filed, and the run is told whether it is a southern one", async () => {
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
    await t.mutation(internal.salesDataMarketDiscovery.nextTaskInternal, {
      companyId,
      runId: job.runId,
    });

    const siteUrl = "https://example.com/barchester/locations";
    await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url: siteUrl });

    const southern = await t.mutation(internal.salesDataMarketDiscovery.recordLocationInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      siteName: "Barchester Christchurch Home",
      town: "Christchurch",
      postcode: "BH23 2FR",
      sourceUrl: siteUrl,
      reasoning: "Listed on the group's locations page.",
      agentId,
      runId: job.runId,
    });
    expect(southern.recorded).toBe(true);
    expect(southern.southOfEngland).toBe(true);

    // Northern sites are still filed — the preference is not a gate.
    const northern = await t.mutation(internal.salesDataMarketDiscovery.recordLocationInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      siteName: "Barchester Dalkeith Home",
      town: "Dalkeith",
      postcode: "EH22 2AH",
      sourceUrl: siteUrl,
      reasoning: "Listed on the group's locations page.",
      agentId,
      runId: job.runId,
    });
    expect(northern.recorded).toBe(true);
    expect(northern.southOfEngland).toBe(false);
    expect(northern.message).toContain("outside the south of England");
  });

  test("a group with no locations to find is retired when the run says so", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    await client.mutation(api.salesDataMarketDiscovery.startMarketDiscoveryJob, {});
    const job = await latestJob(t);
    if (!job?.runId) throw new Error("Missing job run.");

    // Two accepted groups. The first is a publisher with no sites of its own —
    // Pearson, on the real run — and the second is behind it in the queue.
    for (const [groupName, url] of [
      ["Pearson", "https://example.com/pearson"],
      ["Eton College", "https://example.com/eton"],
    ]) {
      await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url });
      await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
        companyId,
        groupName,
        customerType: "CARE HOMES",
        sourceUrl: url,
        reasoning: `The page says ${groupName} is a group of this type.`,
        confidence: "HIGH",
        agentId,
        runId: job.runId,
      });
    }

    // Every parent group target is met, so the queue is location work only.
    const first = await t.mutation(internal.salesDataMarketDiscovery.nextTaskInternal, {
      companyId,
      runId: job.runId,
    });
    expect(first.task?.kind).toBe("FIND_LOCATIONS");
    const firstGroup = first.task?.kind === "FIND_LOCATIONS" ? first.task.groupName : null;

    // The run reports honestly that there is nothing to file.
    const second = await t.mutation(internal.salesDataMarketDiscovery.nextTaskInternal, {
      companyId,
      runId: job.runId,
      previousOutcome: "COULD_NOT",
      note: "It sells products, not sites.",
    });

    expect(second.task?.kind).toBe("FIND_LOCATIONS");
    const secondGroup = second.task?.kind === "FIND_LOCATIONS" ? second.task.groupName : null;
    // The queue moved on rather than handing the same group back.
    expect(secondGroup).not.toBe(firstGroup);

    const retired = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("salesDataMarketDiscoveryGroups")
        .withIndex("by_job_status", (q) => q.eq("jobId", job._id).eq("status", "ACCEPTED"))
        .collect();
      return rows.find((row) => row.groupName === firstGroup);
    });
    expect(retired?.locationsStatus).toBe("DONE");
    expect(retired?.locationsEndedReason).toContain("sells products");
  });

  test("a group the run never reports on is retired after three attempts", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    await client.mutation(api.salesDataMarketDiscovery.startMarketDiscoveryJob, {});
    const job = await latestJob(t);
    if (!job?.runId) throw new Error("Missing job run.");

    for (const [groupName, url] of [
      ["Pearson", "https://example.com/pearson"],
      ["Eton College", "https://example.com/eton"],
    ]) {
      await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url });
      await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
        companyId,
        groupName,
        customerType: "CARE HOMES",
        sourceUrl: url,
        reasoning: `The page says ${groupName} is a group of this type.`,
        confidence: "HIGH",
        agentId,
        runId: job.runId,
      });
    }

    // Asked for repeatedly with no outcome ever reported, which is what a
    // model that cannot finish and will not admit it looks like.
    const seen: string[] = [];
    for (let ask = 0; ask < 4; ask += 1) {
      const next = await t.mutation(internal.salesDataMarketDiscovery.nextTaskInternal, {
        companyId,
        runId: job.runId,
      });
      if (next.task?.kind === "FIND_LOCATIONS") seen.push(next.task.groupName);
      // Put it back the way a dead run leaves it, so the same group is next.
      await t.run(async (ctx) => {
        const held = await ctx.db
          .query("salesDataMarketDiscoveryGroups")
          .withIndex("by_job_locations_status", (q) =>
            q.eq("jobId", job._id).eq("locationsStatus", "IN_PROGRESS")
          )
          .first();
        if (held) await ctx.db.patch(held._id, { locationsStatus: "PENDING" });
      });
    }

    // Three goes at the first group, then the queue moves on by itself.
    expect(seen.filter((name) => name === seen[0]).length).toBe(3);
    expect(seen[3]).not.toBe(seen[0]);
  });

  test("a run that walks away mid-queue hands the job to a new run", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    await client.mutation(api.salesDataMarketDiscovery.startMarketDiscoveryJob, {});
    const job = await latestJob(t);
    if (!job?.runId) throw new Error("Missing job run.");

    // One accepted parent group whose locations were never searched — the
    // exact state the first live run left behind.
    const sourceUrl = "https://example.com/barchester";
    await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url: sourceUrl });
    await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      customerType: "CARE HOMES",
      sourceUrl,
      reasoning: "The page says Barchester operates care homes.",
      confidence: "HIGH",
      agentId,
      runId: job.runId,
    });

    // The run ends of its own accord, reporting success.
    await t.run(async (ctx) => {
      await ctx.db.patch(job.runId!, { status: "SUCCESS", completedAt: Date.now() });
    });

    await t.mutation(internal.salesDataMarketDiscovery.watchJobInternal, { jobId: job._id });

    const after = await latestJob(t);
    expect(after?.status).toBe("RUNNING");
    expect(after?.runsStarted).toBe(2);
    expect(after?.runId).not.toBe(job.runId);

    // And the queue is intact, so the new run is handed the location task the
    // old one never asked for.
    const group = await t.run(async (ctx) =>
      await ctx.db
        .query("salesDataMarketDiscoveryGroups")
        .withIndex("by_job_status", (q) => q.eq("jobId", job._id).eq("status", "ACCEPTED"))
        .first()
    );
    expect(group?.locationsStatus).toBe("PENDING");
  });

  test("a group left in progress by a dead run goes back on the queue", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    await client.mutation(api.salesDataMarketDiscovery.startMarketDiscoveryJob, {});
    const job = await latestJob(t);
    if (!job?.runId) throw new Error("Missing job run.");

    const sourceUrl = "https://example.com/barchester";
    await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url: sourceUrl });
    await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      customerType: "CARE HOMES",
      sourceUrl,
      reasoning: "The page says Barchester operates care homes.",
      confidence: "HIGH",
      agentId,
      runId: job.runId,
    });
    // Taken off the queue by a run that then died holding it.
    await t.run(async (ctx) => {
      const group = await ctx.db
        .query("salesDataMarketDiscoveryGroups")
        .withIndex("by_job_status", (q) => q.eq("jobId", job._id).eq("status", "ACCEPTED"))
        .first();
      await ctx.db.patch(group!._id, { locationsStatus: "IN_PROGRESS" });
      await ctx.db.patch(job.runId!, { status: "SUCCESS", completedAt: Date.now() });
    });

    await t.mutation(internal.salesDataMarketDiscovery.watchJobInternal, { jobId: job._id });

    const group = await t.run(async (ctx) =>
      await ctx.db
        .query("salesDataMarketDiscoveryGroups")
        .withIndex("by_job_status", (q) => q.eq("jobId", job._id).eq("status", "ACCEPTED"))
        .first()
    );
    expect(group?.locationsStatus).toBe("PENDING");
  });

  test("a job that runs out of runs says what it left undone rather than reading as a clean finish", async () => {
    const { t, client, companyId, userId, agentId } = await seed();
    await client.mutation(api.salesDataMarketDiscovery.startMarketDiscoveryJob, {});
    const job = await latestJob(t);
    if (!job?.runId) throw new Error("Missing job run.");

    const sourceUrl = "https://example.com/barchester";
    await markPageRead(t, { companyId, userId, agentId, runId: job.runId, url: sourceUrl });
    await t.mutation(internal.salesDataMarketDiscovery.recordGroupInternal, {
      companyId,
      groupName: "Barchester Healthcare",
      customerType: "CARE HOMES",
      sourceUrl,
      reasoning: "The page says Barchester operates care homes.",
      confidence: "HIGH",
      agentId,
      runId: job.runId,
    });
    await t.run(async (ctx) => {
      // Already spent every run it is allowed.
      await ctx.db.patch(job._id, { runsStarted: 6 });
      await ctx.db.patch(job.runId!, { status: "SUCCESS", completedAt: Date.now() });
    });

    await t.mutation(internal.salesDataMarketDiscovery.watchJobInternal, { jobId: job._id });

    const after = await latestJob(t);
    expect(after?.status).toBe("COMPLETE_WITH_EXCEPTIONS");
    expect(after?.endedReason).toContain("Not finished");
    expect(after?.endedReason).toContain("Barchester Healthcare");
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
