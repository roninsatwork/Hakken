import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { creditAssistantReply, creditCycleFinished, creditCycleLine, creditCycleLineDropped, creditPullSettled, creditResearchRun, creditResearchSettled } from "./creditHooks";
import { chargeCreditsNow, creditBalance, ensurePlanBatch, findCreditRun, recountCreditRun, refundCreditCharge } from "./creditLedger";
import { rowsReturnedIn, slimSeoResult } from "./dataForSeoSlim";
import { creditDayOf, creditMonthNamed, creditMonthOf, creditUnitsOfAnswer, creditUnitsOfRequest, creditUnitsUpFront, creditsForUnits, creditKindOfFamily } from "./creditKinds";

/**
 * The credit ledger, step 1 of docs/plans/active/usage-credits-plan.md:
 * every charge recorded with its real cost, nothing refused.
 */

const modules = import.meta.glob("./**/*.*s");
type Ctx = MutationCtx;
const asCtx = (ctx: unknown) => ctx as Ctx;

async function seedCompany(ctx: Ctx, name: string) {
  return await ctx.db.insert("companies", { name, createdAt: Date.now() });
}

async function seedCycle(ctx: Ctx, companyId: Id<"companies">): Promise<Doc<"seoCollectionCycles">> {
  const id = await ctx.db.insert("seoCollectionCycles", {
    companyId,
    trigger: "SCHEDULE",
    status: "SENDING",
    plannedCount: 0,
    reusedCount: 0,
    sentCount: 0,
    readyCount: 0,
    failedCount: 0,
    totalCostUsd: 0,
    startedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

async function seedPull(ctx: Ctx, args: {
  operationId: string;
  family: string;
  taskArgs: Record<string, unknown>;
  companyId?: Id<"companies">;
  cycleId?: Id<"seoCollectionCycles">;
  status?: Doc<"seoDataPulls">["status"];
  costUsd?: number;
  agentRunId?: Id<"agentRuns">;
}): Promise<Doc<"seoDataPulls">> {
  const id = await ctx.db.insert("seoDataPulls", {
    operationId: args.operationId,
    family: args.family,
    mode: "QUEUED",
    taskArgsJson: JSON.stringify(args.taskArgs),
    status: args.status ?? "PENDING",
    tag: `tag-${Math.random()}`,
    costUsd: args.costUsd ?? 0,
    sandbox: false,
    submittedAt: Date.now(),
    ...(args.companyId ? { companyId: args.companyId } : {}),
    ...(args.cycleId ? { cycleId: args.cycleId } : {}),
    ...(args.agentRunId ? { agentRunId: args.agentRunId } : {}),
  });
  return (await ctx.db.get(id))!;
}

/** A plan line, as `seoCollection.ts` writes one, and its charge. */
async function planLine(ctx: Ctx, cycle: Doc<"seoCollectionCycles">, websiteId: Id<"websites">, pull: Doc<"seoDataPulls">, reused: boolean) {
  const lineId = await ctx.db.insert("seoCycleLines", {
    cycleId: cycle._id, companyId: cycle.companyId, websiteId, operationId: pull.operationId, pullId: pull._id, reused, createdAt: Date.now(),
  });
  await creditCycleLine(ctx, cycle, websiteId, pull, reused, lineId);
  return (await ctx.db.get(lineId))!;
}

async function statement(ctx: Ctx, companyId: Id<"companies">) {
  return await ctx.db.query("creditCharges").withIndex("by_company_at", (q) => q.eq("companyId", companyId)).collect();
}

describe("credit kinds", () => {
  test("every family the collection buys has a kind, and units are counted as the price line counts them", () => {
    expect(["SERP", "DataForSEO Labs", "Keywords Data"].map(creditKindOfFamily)).toEqual(["rankings", "rankings", "rankings"]);
    expect(creditKindOfFamily("AI Optimization")).toBe("aiAnswers");
    expect(creditKindOfFamily("On-Page")).toBe("siteAudit");
    expect(creditKindOfFamily("Backlinks")).toBe("backlinks");
    expect(creditUnitsOfRequest("rankings", JSON.stringify({ limit: 1000 }))).toBe(1000);
    expect(creditUnitsOfRequest("rankings", JSON.stringify({ keywords: ["a", "b", "c"] }))).toBe(3);
    expect(creditUnitsOfRequest("siteAudit", JSON.stringify({ max_crawl_pages: 1240 }))).toBe(1240);
    expect(creditUnitsOfRequest("aiAnswers", JSON.stringify({ limit: 50 }))).toBe(1);
    expect(creditUnitsOfRequest("backlinks", "not json")).toBe(1);
  });

  test("months and days are the UK's, across both changes of the clocks", () => {
    // October 2026: begins in summer time, ends in winter time (the clocks go back on the 25th).
    expect(creditMonthOf(Date.UTC(2026, 9, 15))).toEqual({ month: "2026-10", startsAt: Date.UTC(2026, 8, 30, 23), endsAt: Date.UTC(2026, 10, 1) });
    // 30 September at 23:30 UTC is already 1 October in the UK.
    expect(creditMonthOf(Date.UTC(2026, 8, 30, 23, 30)).month).toBe("2026-10");
    expect(creditDayOf(Date.UTC(2026, 8, 30, 23, 30))).toBe("2026-10-01");
    // March 2026: begins in winter time, ends in summer time (the clocks go forward on the 29th).
    expect(creditMonthOf(Date.UTC(2026, 2, 10))).toEqual({ month: "2026-03", startsAt: Date.UTC(2026, 2, 1), endsAt: Date.UTC(2026, 2, 31, 23) });
    expect(creditMonthNamed("2026-07")).toEqual({ month: "2026-07", startsAt: Date.UTC(2026, 5, 30, 23), endsAt: Date.UTC(2026, 6, 31, 23) });
    expect(creditMonthNamed("2026-12")).toEqual({ month: "2026-12", startsAt: Date.UTC(2026, 11, 1), endsAt: Date.UTC(2027, 0, 1) });
  });

  test("credits round up once per run, and nothing is never charged", () => {
    expect(creditsForUnits({ credits: 4, per: 1000 }, 1)).toBe(1);
    expect(creditsForUnits({ credits: 4, per: 1000 }, 1000)).toBe(4);
    expect(creditsForUnits({ credits: 4, per: 1000 }, 1001)).toBe(5);
    expect(creditsForUnits({ credits: 1, per: 50 }, 1240)).toBe(25);
    expect(creditsForUnits({ credits: 4, per: 1000 }, 0)).toBe(0);
  });
});

describe("a collection's charges", () => {
  test("one charge per website and kind, at the full price whether bought or shared; failures come off", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const rival = await seedCompany(ctx, "Rival");
      const websiteId = await ctx.db.insert("websites", { host: "example.com", displayHost: "example.com", firstSeenAt: Date.now() });
      const acmeRun = await seedCycle(ctx, acme);
      const rivalRun = await seedCycle(ctx, rival);

      // Acme buys two keyword checks; the ranked keywords list was bought by Rival last week.
      const check = await seedPull(ctx, { operationId: "serp_google_organic", family: "SERP", taskArgs: { keyword: "a" }, companyId: acme, cycleId: acmeRun._id });
      const failing = await seedPull(ctx, { operationId: "serp_google_organic", family: "SERP", taskArgs: { keyword: "b" }, companyId: acme, cycleId: acmeRun._id });
      const list = await seedPull(ctx, { operationId: "domain_ranked_keywords", family: "DataForSEO Labs", taskArgs: { limit: 1000 }, companyId: rival, status: "READY", costUsd: 0.12 });
      await planLine(ctx, acmeRun, websiteId, check, false);
      await planLine(ctx, acmeRun, websiteId, failing, false);
      await planLine(ctx, acmeRun, websiteId, list, true);
      // Rival's run is served by Acme's check while it is still on its way.
      await planLine(ctx, rivalRun, websiteId, check, true);

      await creditPullSettled(ctx, check, "READY", 0.002);
      await creditPullSettled(ctx, failing, "FAILED", 0);
      await creditCycleFinished(ctx, acmeRun._id);
      await creditCycleFinished(ctx, rivalRun._id);

      const acmeLines = await statement(ctx, acme);
      expect(acmeLines.map((line) => line.entry)).toEqual(["grant", "charge"]);
      const acmeCharge = acmeLines[1];
      expect(acmeCharge).toMatchObject({
        kind: "rankings", state: "charged", how: "scheduled", websiteId,
        units: 1001, lines: 3, failedUnits: 1, creditsOut: 5, owed: 0, balanceAfter: 9995,
        realCostUsd: 0.002, reusedValueUsd: 0.12,
      });
      expect(acmeLines[0]).toMatchObject({ entry: "grant", creditsIn: 10_000, source: "plan" });

      const [, rivalCharge] = await statement(ctx, rival);
      expect(rivalCharge).toMatchObject({ units: 1, creditsOut: 1, realCostUsd: 0, reusedValueUsd: 0.002, balanceAfter: 9999 });

      const rollups = await ctx.db.query("creditMonthRollups").withIndex("by_company_month", (q) => q.eq("companyId", acme)).collect();
      expect(rollups).toEqual([expect.objectContaining({ kind: "rankings", websiteKey: websiteId, credits: 5, runs: 1, realCostUsd: 0.002 })]);
      const days = await ctx.db.query("creditDayTotals").withIndex("by_company_day", (q) => q.eq("companyId", acme)).collect();
      expect(days).toEqual([expect.objectContaining({ credits: 5, byHand: 0 })]);
    });
  });

  test("a line dropped when a run is closed by hand is never charged, and a run with nothing left is void", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const websiteId = await ctx.db.insert("websites", { host: "example.com", displayHost: "example.com", firstSeenAt: Date.now() });
      const run = await seedCycle(ctx, acme);
      const crawl = await seedPull(ctx, { operationId: "site_crawl", family: "On-Page", taskArgs: { max_crawl_pages: 500 }, companyId: acme, cycleId: run._id });
      const line = await planLine(ctx, run, websiteId, crawl, false);
      await creditCycleLineDropped(ctx, line, crawl._id);
      await creditCycleFinished(ctx, run._id);

      const lines = await statement(ctx, acme);
      expect(lines).toEqual([expect.objectContaining({ entry: "charge", state: "void", units: 0, creditsOut: 0 })]);
    });
  });
});

describe("credits count what came back (finish-off-plan.md, item 3)", () => {
  test("a request counts nothing up front for a list or crawl, then what came back, never more than it asked", () => {
    const list = JSON.stringify({ target: "a.com", limit: 1000 });
    const crawl = JSON.stringify({ target: "a.com", max_crawl_pages: 1000 });
    expect(creditUnitsUpFront("backlinks", list)).toBe(0);
    expect(creditUnitsUpFront("siteAudit", crawl)).toBe(0);
    expect(creditUnitsUpFront("rankings", JSON.stringify({ keyword: "a" }))).toBe(1);
    expect(creditUnitsUpFront("aiAnswers", JSON.stringify({ limit: 50 }))).toBe(1);
    expect(creditUnitsOfAnswer("backlinks", list, 340)).toBe(340);
    expect(creditUnitsOfAnswer("backlinks", list, 5000)).toBe(1000);
    expect(creditUnitsOfAnswer("siteAudit", crawl, 1)).toBe(1);
    expect(creditUnitsOfAnswer("siteAudit", crawl, 0)).toBe(0);
    // A single answer is one whatever it brings; an answer never counted is what was asked.
    expect(creditUnitsOfAnswer("backlinks", JSON.stringify({ target: "a.com" }), 900)).toBe(1);
    expect(creditUnitsOfAnswer("backlinks", list, undefined)).toBe(1000);
  });

  test("what an answer brought back, as sent or as kept", () => {
    expect(rowsReturnedIn("site_crawl", [{ crawl_progress: "finished", crawl_status: { max_crawl_pages: 1000, pages_crawled: 7 } }])).toBe(7);
    expect(rowsReturnedIn("backlinks_list", [{ items_count: 3, items: [{}, {}, {}] }])).toBe(3);
    expect(rowsReturnedIn("backlinks_list", slimSeoResult("backlinks_list", [{ items_count: 2, items: [{ domain_from: "a" }, { domain_from: "b" }] }]))).toBe(2);
    expect(rowsReturnedIn("backlinks_list", [{ items_count: 0, items: null }])).toBe(0);
    expect(rowsReturnedIn("keyword_search_volume", [{ keyword: "a" }, { keyword: "b" }])).toBe(2);
    expect(rowsReturnedIn("backlinks_list", null)).toBe(0);
    expect(rowsReturnedIn("backlinks_list", "garbled")).toBeUndefined();
  });

  test("a list and a crawl are charged for the rows and pages that came back", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const websiteId = await ctx.db.insert("websites", { host: "example.com", displayHost: "example.com", firstSeenAt: Date.now() });
      const run = await seedCycle(ctx, acme);
      const links = await seedPull(ctx, { operationId: "backlinks_list", family: "Backlinks", taskArgs: { target: "example.com", limit: 1000 }, companyId: acme, cycleId: run._id });
      const crawl = await seedPull(ctx, { operationId: "site_crawl", family: "On-Page", taskArgs: { target: "example.com", max_crawl_pages: 1000 }, companyId: acme, cycleId: run._id });
      await planLine(ctx, run, websiteId, links, false);
      await planLine(ctx, run, websiteId, crawl, false);
      // While they are out, nothing is counted yet.
      const open = await statement(ctx, acme);
      expect(open.map((line) => [line.kind, line.state, line.units, line.pendingLines])).toEqual([["backlinks", "open", 0, 1], ["siteAudit", "open", 0, 1]]);

      await ctx.db.patch(links._id, { status: "READY", rowsReturned: 340 });
      await creditPullSettled(ctx, links, "READY", 0.34);
      await ctx.db.patch(crawl._id, { status: "READY", rowsReturned: 1 });
      await creditPullSettled(ctx, crawl, "READY", 1.5);
      await creditCycleFinished(ctx, run._id);

      const charges = (await statement(ctx, acme)).filter((line) => line.entry === "charge");
      // 340 links at 10 a thousand is 4 credits, not 10; one page at 1 a 50 is 1, not 20.
      expect(charges.map((line) => [line.kind, line.units, line.creditsOut, line.pendingLines])).toEqual([["backlinks", 340, 4, 0], ["siteAudit", 1, 1, 0]]);
      const lines = await ctx.db.query("seoCycleLines").withIndex("by_pull", (q) => q.eq("pullId", links._id)).collect();
      expect(lines[0]).toMatchObject({ creditUnits: 340, creditPending: false });
    });
  });

  test("a run waits for a request another collection sent, and is charged when it comes back", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const rival = await seedCompany(ctx, "Rival");
      const websiteId = await ctx.db.insert("websites", { host: "example.com", displayHost: "example.com", firstSeenAt: Date.now() });
      const acmeRun = await seedCycle(ctx, acme);
      const rivalRun = await seedCycle(ctx, rival);
      const list = await seedPull(ctx, { operationId: "referring_domains_list", family: "Backlinks", taskArgs: { target: "example.com", limit: 1000 }, companyId: acme, cycleId: acmeRun._id });
      await planLine(ctx, acmeRun, websiteId, list, false);
      await planLine(ctx, rivalRun, websiteId, list, true);
      // Rival's collection is done before Acme's request comes back: its run stays open, waiting.
      await ctx.db.patch(rivalRun._id, { status: "DONE" });
      await creditCycleFinished(ctx, rivalRun._id);
      expect((await statement(ctx, rival))[0]).toMatchObject({ state: "open", pendingLines: 1 });

      await ctx.db.patch(list._id, { status: "READY", rowsReturned: 1000 });
      await creditPullSettled(ctx, list, "READY", 0.2);
      const [, rivalCharge] = await statement(ctx, rival);
      expect(rivalCharge).toMatchObject({ entry: "charge", state: "charged", units: 1000, creditsOut: 10, pendingLines: 0 });
      // Acme's own collection still has to finish to be charged.
      expect((await statement(ctx, acme))[0]).toMatchObject({ state: "open", units: 1000, pendingLines: 0 });
    });
  });

  test("a list's later page counts for the run that bought it", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const websiteId = await ctx.db.insert("websites", { host: "example.com", displayHost: "example.com", firstSeenAt: Date.now() });
      const run = await seedCycle(ctx, acme);
      const first = await seedPull(ctx, { operationId: "backlinks_all", family: "Backlinks", taskArgs: { target: "example.com", limit: 1000 }, companyId: acme, cycleId: run._id });
      await planLine(ctx, run, websiteId, first, false);
      await ctx.db.patch(first._id, { status: "READY", rowsReturned: 1000 });
      await creditPullSettled(ctx, first, "READY", 1);
      // Queued by the first page's answer, with no plan line of its own.
      const next = await seedPull(ctx, { operationId: "backlinks_all", family: "Backlinks", taskArgs: { target: "example.com", limit: 1000, offset: 1000 }, companyId: acme, cycleId: run._id });
      await ctx.db.patch(next._id, { websiteId, status: "READY", rowsReturned: 650 });
      const sent = (await ctx.db.get(next._id))!;
      await creditPullSettled(ctx, { ...sent, status: "SUBMITTED" }, "READY", 0.65);
      await creditPullSettled(ctx, { ...sent, status: "SUBMITTED", creditUnits: (await ctx.db.get(next._id))!.creditUnits }, "READY", 0);
      await creditCycleFinished(ctx, run._id);
      const [charge] = (await statement(ctx, acme)).filter((line) => line.entry === "charge");
      expect(charge).toMatchObject({ units: 1650, creditsOut: 17, realCostUsd: 1.65 });
    });
  });

  test("a charge counted again after it was charged keeps its line, and the difference is a line of its own", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const now = Date.now();
      const acme = await seedCompany(ctx, "Acme");
      const websiteId = await ctx.db.insert("websites", { host: "example.com", displayHost: "example.com", firstSeenAt: now });
      // A crawl charged, before 2026-10-05, as the thousand pages it might read: 20 credits.
      await chargeCreditsNow(ctx, { companyId: acme, kind: "siteAudit", runKey: "cycle:x", how: "scheduled", websiteId }, 1000, { realCostUsd: 1.5 }, now);
      const charge = (await findCreditRun(ctx, "cycle:x"))!;
      expect(await recountCreditRun(ctx, charge._id, 1, "recounted", now)).toBe(-19);

      const lines = await statement(ctx, acme);
      expect(lines.map((line) => [line.entry, line.creditsIn, line.creditsOut, line.balanceAfter])).toEqual([
        ["grant", 10_000, 0, 10_000],
        ["charge", 0, 20, 9_980],
        ["recount", 19, 0, 9_999],
      ]);
      expect(lines[1]).toMatchObject({ units: 1000, unitsNow: 1, creditsNow: 1 });
      expect(lines[2]).toMatchObject({ reason: "recounted", units: 1, before: 1000, refundOf: charge._id, kind: "siteAudit", websiteId });
      expect(lines[2].paidFrom).toEqual([{ batchId: lines[1].paidFrom[0].batchId, credits: 19 }]);
      // The month, every company's month and the day the work was charged on all move with it.
      const rollup = await ctx.db.query("creditMonthRollups").withIndex("by_company_month", (q) => q.eq("companyId", acme)).first();
      expect(rollup).toMatchObject({ credits: 1, runs: 1 });
      const day = await ctx.db.query("creditDayTotals").withIndex("by_company_day", (q) => q.eq("companyId", acme)).first();
      expect(day?.credits).toBe(1);
      const platform = await ctx.db.query("creditPlatformMonths").first();
      expect(platform).toMatchObject({ credits: 1, units: 1 });
      // Counted again at what it already stands at: nothing more is written.
      expect(await recountCreditRun(ctx, charge._id, 1, "recounted", now)).toBe(0);
      expect(await statement(ctx, acme)).toHaveLength(3);
      // And a refund after it gives back only what it stands at.
      await refundCreditCharge(ctx, charge._id, now);
      expect((await statement(ctx, acme)).at(-1)).toMatchObject({ entry: "refund", creditsIn: 1, balanceAfter: 10_000 });
    });
  });
});

describe("batches", () => {
  test("plan credits are used before a top-up, and what none can cover is owed", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const now = Date.now();
      const acme = await seedCompany(ctx, "Acme");
      await ctx.db.insert("creditSettings", { key: "platform", planCredits: 10, creditCoversUsd: 0.05, updatedAt: now });
      await ensurePlanBatch(ctx, acme, now);
      const topUp = await ctx.db.insert("creditBatches", {
        companyId: acme, source: "topup", granted: 20, left: 20, startsAt: now, endsAt: now + 365 * 86_400_000, state: "open", createdAt: now,
      });

      // Keyword research at 5 a keyword: three keywords is 15 credits.
      await chargeCreditsNow(ctx, { companyId: acme, kind: "keywordResearch", runKey: "research:one", how: "byHand" }, 3, {}, now);
      const [first] = (await statement(ctx, acme)).filter((line) => line.entry === "charge");
      expect(first.paidFrom.map((part) => part.credits)).toEqual([10, 5]);
      expect(first.paidFrom[1].batchId).toBe(topUp);
      expect(first.balanceAfter).toBe(15);

      await chargeCreditsNow(ctx, { companyId: acme, kind: "keywordResearch", runKey: "research:two", how: "byHand" }, 4, {}, now);
      const second = (await statement(ctx, acme)).filter((line) => line.entry === "charge")[1];
      expect(second).toMatchObject({ creditsOut: 20, owed: 5, balanceAfter: -5 });
      expect(await creditBalance(ctx, acme)).toBe(-5);
    });
  });

  test("a month's plan credits end with it, written off as their own line, and the next month's are granted", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const october = Date.UTC(2026, 9, 20, 9);
      await chargeCreditsNow(ctx, { companyId: acme, kind: "assistant", runKey: "message:one", how: "byHand" }, 1, {}, october);

      const november = Date.UTC(2026, 10, 1, 0, 5);
      await ensurePlanBatch(ctx, acme, november);
      const lines = await statement(ctx, acme);
      // UK midnights: 1 October 2026 is in summer time (an hour ahead of UTC), 1 November in winter.
      expect(lines.map((line) => [line.entry, line.creditsIn, line.creditsOut, line.at])).toEqual([
        ["grant", 10_000, 0, Date.UTC(2026, 8, 30, 23)],
        ["charge", 0, 1, october],
        ["ended", 0, 9999, Date.UTC(2026, 10, 1)],
        ["grant", 10_000, 0, Date.UTC(2026, 10, 1)],
      ]);
      expect(await creditBalance(ctx, acme)).toBe(10_000);
    });
  });

  test("a request that fails after it was charged gives its credits back", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const pull = await seedPull(ctx, { operationId: "serp_google_organic", family: "SERP", taskArgs: { keyword: "a" }, companyId: acme });
      await creditPullSettled(ctx, pull, "SUBMITTED", 0.01);
      expect(await creditBalance(ctx, acme)).toBe(9999);
      await creditPullSettled(ctx, pull, "FAILED", 0);
      const lines = await statement(ctx, acme);
      expect(lines.map((line) => line.entry)).toEqual(["grant", "charge", "refund"]);
      expect(lines[2]).toMatchObject({ creditsIn: 1, refundOf: lines[1]._id, balanceAfter: 10_000 });
      expect(lines[1].realCostUsd).toBe(0.01);
    });
  });
});

describe("lookups and questions", () => {
  test("a lookup is charged by the keyword, and its calls add what they cost", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const userId = await ctx.db.insert("users", { email: "priya@example.com", role: "ADMIN", companyId: acme });
      const agentId = await ctx.db.insert("agents", {
        name: "Keyword research", modelId: "test-model", thinkingMode: false, isActive: true, temperature: 1, humanApprovalRequired: false, createdAt: Date.now(), updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", { agentId, triggerType: "MANUAL", objective: "Look up", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now() });
      await creditResearchRun(ctx, { companyId: acme, userId, runId, keywords: ["web design leeds", "web design york", "web design leeds"] });
      const call = await seedPull(ctx, { operationId: "research_keyword_overview", family: "DataForSEO Labs", taskArgs: { keywords: ["web design leeds"] }, companyId: acme, agentRunId: runId });
      await creditPullSettled(ctx, call, "READY", 0.03);

      const [, charge] = await statement(ctx, acme);
      expect(charge).toMatchObject({
        kind: "keywordResearch", how: "byHand", userId, units: 2, creditsOut: 10, realCostUsd: 0.03,
        detail: "“web design leeds”, “web design york”",
      });
    });
  });

  test("a lookup is charged only for the keywords something came back for (finish-off-plan.md, item 9)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const userId = await ctx.db.insert("users", { email: "priya@example.com", role: "ADMIN", companyId: acme });
      const agentId = await ctx.db.insert("agents", {
        name: "Keyword research", modelId: "test-model", thinkingMode: false, isActive: true, temperature: 1, humanApprovalRequired: false, createdAt: Date.now(), updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", { agentId, triggerType: "MANUAL", objective: "Look up", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now() });
      await creditResearchRun(ctx, { companyId: acme, userId, runId, keywords: ["a", "b", "c"] });
      // Three keywords, two parts each: something came back for two of them.
      await creditResearchSettled(ctx, runId, [
        { keyword: "a", ready: true }, { keyword: "a", ready: false },
        { keyword: "b", ready: false }, { keyword: "b", ready: false },
        { keyword: "c", ready: true }, { keyword: "c", ready: true },
      ]);
      // A second settle that settled nothing changes nothing.
      await creditResearchSettled(ctx, runId, []);
      const lines = await statement(ctx, acme);
      expect(lines.map((line) => [line.entry, line.units, line.creditsOut, line.creditsIn, line.reason ?? null])).toEqual([
        ["grant", 0, 0, 10_000, null],
        ["charge", 3, 15, 0, null],
        ["recount", 2, 0, 5, "recounted"],
      ]);
      expect(lines[1]).toMatchObject({ unitsNow: 2, creditsNow: 10 });
    });
  });

  test("an Ask Hakken reply is one question, charged with what it cost; an evaluation's is not", async () => {
    const t = convexTest(schema, modules);
    const { acme, threadId, evalThreadId } = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const acme = await seedCompany(ctx, "Acme");
      const userId = await ctx.db.insert("users", { email: "anthony@example.com", role: "ADMIN", companyId: acme });
      await ctx.db.insert("aiModels", {
        modelId: "test-model", displayName: "Test", isEnabled: true, isDefault: true, lastSyncedAt: Date.now(),
        standardInputCostBelow200k: 3, outputResponseCost: 15,
      });
      const threadId = await ctx.db.insert("threads", { userId, companyId: acme, createdAt: Date.now(), updatedAt: Date.now() });
      const evalThreadId = await ctx.db.insert("threads", { userId, companyId: acme, purpose: "EVAL", createdAt: Date.now(), updatedAt: Date.now() });
      return { acme, threadId, evalThreadId };
    });

    await t.mutation(internal.chat.saveAssistantMessage, { threadId, content: "Here is what changed.", inputTokens: 1_000_000, outputTokens: 100_000, modelUsed: "test-model" });
    await t.mutation(internal.chat.saveAssistantMessage, { threadId: evalThreadId, content: "Graded.", inputTokens: 10, outputTokens: 10, modelUsed: "test-model" });

    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const charges = (await statement(ctx, acme)).filter((line) => line.entry === "charge");
      expect(charges).toHaveLength(1);
      expect(charges[0]).toMatchObject({ kind: "assistant", units: 1, creditsOut: 1, realCostUsd: 4.5 });
      // A second save of the same reply is not a second question.
      await creditAssistantReply(ctx, await ctx.db.get(threadId), charges[0].messageId!, { inputTokens: 1, outputTokens: 1 });
      expect((await statement(ctx, acme)).filter((line) => line.entry === "charge")).toHaveLength(1);
    });
  });
});
