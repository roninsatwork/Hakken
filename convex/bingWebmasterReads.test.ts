import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * What the Bing Webmaster screens and Ask Hakken read, from a website Bing has
 * been collected for (docs/plans/active/bing-webmaster-plan.md §5, BW13): its
 * websites list, Performance beside Google's days, the keyword list searched,
 * filtered and sorted on the server with Google's positions beside Bing's, a
 * keyword's own weeks, and nothing of it for another company.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const NOW = Date.parse("2026-10-12T04:00:00Z");
const SITE = "https://www.ronins.co.uk/";
const wcf = (day: string) => `/Date(${Date.parse(`${day}T00:00:00Z`)})/`;

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

function fakeBing() {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const json = (d: unknown) => new Response(JSON.stringify({ d }), { status: 200 });
    switch (url.pathname.split("/").pop()) {
      case "GetRankAndTrafficStats":
        return json([{ Date: wcf("2026-10-10"), Clicks: 1, Impressions: 180 }, { Date: wcf("2026-10-11"), Clicks: 2, Impressions: 240 }]);
      case "GetCrawlStats":
        return json([{ Date: wcf("2026-10-11"), CrawledPages: 41, CrawlErrors: 1, InIndex: 412 }]);
      case "GetQueryStats":
        return json([
          { Query: "ronins", Date: wcf("2026-10-04"), Clicks: 3, Impressions: 20, AvgImpressionPosition: 4 },
          { Query: "ronins", Date: wcf("2026-10-11"), Clicks: 2, Impressions: 21, AvgImpressionPosition: 4.74 },
          { Query: "what is a brand audit", Date: wcf("2026-10-11"), Clicks: 2, Impressions: 10, AvgImpressionPosition: 4.4 },
          { Query: "ai agency", Date: wcf("2026-10-11"), Clicks: 2, Impressions: 10, AvgImpressionPosition: 5.1 },
          { Query: "internal and external stakeholders", Date: wcf("2026-10-11"), Clicks: 2, Impressions: 35, AvgImpressionPosition: 8.97 },
        ]);
      case "GetPageStats":
        return json([{ Query: SITE, Date: wcf("2026-10-11"), Clicks: 3, Impressions: 120, AvgImpressionPosition: 6.8 }]);
      case "GetUrlInfo":
        return json({ Url: url.searchParams.get("url"), HttpStatus: 200, LastCrawledDate: wcf("2026-10-02") });
      default:
        throw new Error(`Unexpected fetch in test: ${String(input)}`);
    }
  }));
}

/** A website collected from Bing once, with Google's 90 days and days beside it. */
async function collected(t: Harness) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "User", email: "user@ronins.test", role: "USER", companyId, createdAt: 1 });
    const connectionId = await ctx.db.insert("bingConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", site: SITE, dataSite: SITE, connectedAt: 1, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("bingTokens", {
      companyWebsiteId: siteId, bingConnectionId: connectionId,
      accessTokenCiphertext: await encryptConnectorToken("access-1"), refreshTokenCiphertext: await encryptConnectorToken("refresh-1"),
      expiresAt: NOW + 3_000_000, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("searchConsolePeriods", {
      companyWebsiteId: siteId, searchType: "web", list: "query", period: "90", which: "NOW", part: 0, from: "2026-07-15", to: "2026-10-11",
      keys: ["ronins", "what is a brand audit", "ai agency"], clicks: [45, 1, 106], impressions: [2129, 1509, 3848], positionSums: [14264, 15845, 9620], builtAt: 1,
    });
    for (const [day, clicks, impressions] of [["2026-10-10", 30, 9_000], ["2026-10-11", 33, 9_500]] as const) {
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day, clicks, impressions, ctr: clicks / impressions, position: 18, fetchedAt: 1 });
    }
    const agentId = await ctx.db.insert("agents", {
      name: "Bing Webmaster: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true, systemKey: "BING_WEBMASTER_COLLECTOR", createdAt: 1, updatedAt: 1,
    });
    const runId = await ctx.db.insert("agentRuns", {
      agentId, triggerType: "SCHEDULE", objective: "Collect", title: "Bing Webmaster: Data Collection Scheduler", status: "QUEUED", startedAt: NOW, updatedAt: NOW,
    });
    return { companyId, siteId, userId, runId };
  });
  fakeBing();
  await t.action(internal.bingWebmasterAgentRun.runBingCollectorNow, { runId: ids.runId });
  await finishScheduled(t);
  return { ...ids, user: t.withIdentity({ subject: ids.userId }) };
}

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("BING_WEBMASTER_CLIENT_ID", "bing-client");
  vi.stubEnv("BING_WEBMASTER_CLIENT_SECRET", "bing-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("what the Bing Webmaster screens read", () => {
  test("the websites list and Performance, Bing's figures beside Google's for the same days", async () => {
    const t = harness();
    const { siteId, user } = await collected(t);
    const [site] = await user.query(api.bingWebmasterReads.bingSites, {});
    expect(site).toMatchObject({ siteId, host: "ronins.co.uk", status: "CONNECTED", clicks: 3, impressions: 420, googleClicks: 63, to: "2026-10-11" });
    expect(site.share).toBeCloseTo(3 / 66);

    const performance = (await user.query(api.bingWebmasterReads.bingPerformance, { siteId, days: 90 }))!;
    expect(performance.totals).toEqual({ clicks: 3, impressions: 420 });
    expect(performance.google).toEqual({ clicks: 63, impressions: 18_500 });
    // 10 Oct is a Saturday, 11 Oct a Sunday: one week, Monday the 5th.
    expect(performance.weeks).toEqual([{ week: "2026-10-05", bing: 3, google: 63 }]);
  });

  test("the keyword list is searched, filtered and sorted over the whole list, with Google's positions beside Bing's", async () => {
    const t = harness();
    const { siteId, user } = await collected(t);
    const ask = { siteId, list: "query" as const, period: "90" as const, page: 1, rows: 25 };
    const all = await user.query(api.bingWebmasterReads.bingListPage, ask);
    // The most clicks first; a tie by name, as every Sites list (`sortOrder.ts`).
    expect(all.rows.map((row) => row.key)).toEqual(["ronins", "ai agency", "internal and external stakeholders", "what is a brand audit"]);
    expect(all.summary).toMatchObject({ rows: 4, onBoth: 3, bingHigher: 2, googleHigher: 1, onlyBing: 1, top: { key: "ronins", clicks: 5 } });
    expect(all.summary.widestGoogle).toMatchObject({ key: "ai agency" });
    const brand = all.rows.find((row) => row.key === "what is a brand audit")!;
    expect(brand.googlePosition).toBeCloseTo(15_845 / 1_509);

    const searched = await user.query(api.bingWebmasterReads.bingListPage, { ...ask, q: "brand" });
    expect(searched.rows.map((row) => row.key)).toEqual(["what is a brand audit"]);
    const onlyBing = await user.query(api.bingWebmasterReads.bingListPage, { ...ask, google: "onlyBing" });
    expect(onlyBing.rows.map((row) => row.key)).toEqual(["internal and external stakeholders"]);
    const byPosition = await user.query(api.bingWebmasterReads.bingListPage, { ...ask, sort: "position" });
    expect(byPosition.rows.map((row) => row.key)).toEqual(["ronins", "what is a brand audit", "ai agency", "internal and external stakeholders"]);
    const googleHigher = await user.query(api.bingWebmasterReads.bingListPage, { ...ask, who: "GOOGLE" });
    expect(googleHigher.rows.map((row) => row.key)).toEqual(["ai agency"]);
  });

  test("a keyword's own screen: its weeks on Bing and its 90 days beside Google's", async () => {
    const t = harness();
    const { siteId, user } = await collected(t);
    const list = await user.query(api.bingWebmasterReads.bingListPage, { siteId, list: "query", period: "90", page: 1, rows: 25 });
    const ref = list.rows.find((row) => row.key === "ronins")!.ref;
    const record = (await user.query(api.bingWebmasterReads.bingRecord, { siteId, list: "query", ref }))!;
    expect(record.key).toBe("ronins");
    expect(record.weeks.map((week) => [week.week, week.clicks])).toEqual([["2026-10-04", 3], ["2026-10-11", 2]]);
    expect(record.figures).toMatchObject({ clicks: 5, impressions: 41, googleClicks: 45 });
    expect(await user.query(api.bingWebmasterReads.bingRecord, { siteId, list: "query", ref: "999" })).toBeNull();
  });

  test("Ask Hakken reads the same figures as the screens, for the conversation's company only", async () => {
    const t = harness();
    const { companyId } = await collected(t);
    const performance = await t.query(internal.assistantBingReads.bingWebmasterInternal, { companyId, website: "ronins.co.uk", screen: "performance", days: 90 });
    expect(performance).toMatchObject({ ok: true, bing: { clicks: 3, impressions: 420 }, google: { clicks: 63 }, link: expect.stringMatching(/^\/app\/bing-webmaster\//) });
    const versus = await t.query(internal.assistantBingReads.bingWebmasterInternal, { companyId, website: "ronins.co.uk", screen: "versus", days: 90 });
    expect(versus).toMatchObject({ ok: true, summary: { bingRanksHigher: 2, googleRanksHigher: 1, onlyOnBing: 1 } });
    const other = await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Rival", createdAt: 1 }));
    expect(await t.query(internal.assistantBingReads.bingWebmasterInternal, { companyId: other, website: "ronins.co.uk", screen: "performance", days: 90 })).toMatchObject({ ok: false });
  });

  test("another company reads nothing of it", async () => {
    const t = harness();
    const { siteId } = await collected(t);
    const rival = t.withIdentity({
      subject: await t.run(async (ctx) => {
        const rivalId = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
        return await ctx.db.insert("users", { name: "Rival", email: "rival@rival.test", role: "ADMIN", companyId: rivalId, createdAt: 1 });
      }),
    });
    await expect(rival.query(api.bingWebmasterReads.bingPerformance, { siteId, days: 90 })).rejects.toThrow();
    await expect(rival.query(api.bingWebmasterReads.bingListPage, { siteId, list: "query", period: "90", page: 1, rows: 25 })).rejects.toThrow();
    expect(await rival.query(api.bingWebmasterReads.bingSites, {})).toEqual([]);
    expect(await rival.query(api.bingWebmasterConnect.bingStatus, { siteId })).toBeNull();
  });
});
