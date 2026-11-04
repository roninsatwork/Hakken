import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Ask Hakken's Visibility read (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10: "today it can't read any
 * Visibility list and draws only websites and positions at the newest check"): a screen's own figures, for the
 * company's own website, with the screen's link and never a guessed money figure; and a line of the website against a
 * rival over the period's checks.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;

// 1 October 2026: last month is September, which holds the checks below.
beforeEach(() => useFixedDay());
afterEach(() => vi.useRealTimers());

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function hold(t: Harness, companyId: Id<"companies">, host: string, against?: Id<"websites">) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship: against ? "TRACKED" : "OWNED", createdAt: Date.now(),
      ...(against ? { againstWebsiteId: against } : { locationCode: UK }),
    });
    return { websiteId, holdId };
  });
}

/** A check's figures, filed as the collection files them, and its day summary built. */
async function check(t: Harness, websiteId: Id<"websites">, day: string, metrics: Record<string, number>) {
  const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "domain_ranked_keywords", family: "Labs", mode: "LIVE", websiteId, taskArgsJson: "{}",
    status: "READY", tag: day, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
  } as never));
  await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
    pullId, websiteId, operationId: "domain_ranked_keywords", day, locationCode: UK, metricsJson: JSON.stringify(metrics), positions: [], paidPositions: [],
  });
  await t.mutation(internal.siteSummaries.syncDays, { websiteId, locationCode: UK, fromDay: "2026-09-01", toDay: "2026-09-30" });
}

describe("Ask Hakken's Visibility read", () => {
  test("a screen's own figures for the company's website, with its link, and never what visits or adverts would cost", async () => {
    const t = harness();
    const acme = await company(t, "Acme");
    const own = await hold(t, acme, "acme-shop.test");
    await check(t, own.websiteId, "2026-09-05", { rankedKeywords: 900, estimatedTraffic: 1200, trafficValue: 5000, paidKeywords: 4, paidTraffic: 30, paidTrafficCost: 333 });
    await check(t, own.websiteId, "2026-09-25", { rankedKeywords: 950, estimatedTraffic: 1100, trafficValue: 4800, paidKeywords: 6, paidTraffic: 41, paidTrafficCost: 410 });

    const paid = await t.query(internal.assistantVisibilityReads.visibilityScreenInternal, { companyId: acme, website: "acme-shop.test", screen: "paid", period: "lastMonth" });
    expect(paid).toMatchObject({ ok: true, website: "acme-shop.test", screen: "paid", period: "lastMonth", link: `/app/sites/${own.holdId}/paid?period=lastMonth` });
    const text = JSON.stringify(paid);
    expect(text).toContain("\"paidKeywords\":6");
    expect(text).toContain("\"paidTraffic\":41");
    for (const money of ["paidTrafficCost", "trafficValue", "trafficCost", "cpc"]) expect(text).not.toContain(`"${money}"`);

    const overview = await t.query(internal.assistantVisibilityReads.visibilityScreenInternal, { companyId: acme, website: "acme-shop.test", screen: "overview", period: "lastMonth" });
    expect(overview).toMatchObject({ ok: true, link: `/app/sites/${own.holdId}?period=lastMonth` });
    expect(JSON.stringify(overview)).not.toContain("trafficValue");
  });

  test("a website that is not the company's is said so, and a rival is drawn beside the website on a line", async () => {
    const t = harness();
    const acme = await company(t, "Acme");
    const other = await company(t, "Other");
    const own = await hold(t, acme, "acme-shop.test");
    const rival = await hold(t, acme, "rival-shop.test", own.websiteId);
    await hold(t, other, "theirs.test");
    await check(t, own.websiteId, "2026-09-05", { rankedKeywords: 900, estimatedTraffic: 1200 });
    await check(t, rival.websiteId, "2026-09-05", { rankedKeywords: 1400, estimatedTraffic: 2600 });
    await check(t, own.websiteId, "2026-09-25", { rankedKeywords: 950, estimatedTraffic: 1100 });
    await check(t, rival.websiteId, "2026-09-25", { rankedKeywords: 1500, estimatedTraffic: 3100 });

    const theirs = await t.query(internal.assistantVisibilityReads.visibilityScreenInternal, { companyId: acme, website: "theirs.test", screen: "overview", period: "lastMonth" });
    expect(theirs.ok).toBe(false);

    const line = await t.query(internal.assistantVisibilityReads.visibilityLineInternal, { companyId: acme, website: "acme-shop.test", period: "lastMonth", measure: "estimatedVisitors" });
    expect(line.ok).toBe(true);
    if (!line.ok) return;
    expect(line.chart).toMatchObject({ look: "pageChart", kind: "line", measure: "acme-shop.test", against: "rival-shop.test", link: `/app/sites/${own.holdId}?period=lastMonth` });
    expect(line.chart.groups).toEqual([
      { name: "2026-09-05", value: 1200, before: 2600 },
      { name: "2026-09-25", value: 1100, before: 3100 },
    ]);

    const named = await t.query(internal.assistantVisibilityReads.visibilityLineInternal, { companyId: acme, website: "acme-shop.test", period: "lastMonth", measure: "searches", rival: "nobody.test" });
    expect(named.ok).toBe(false);
  });
});
