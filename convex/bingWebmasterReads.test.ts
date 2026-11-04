import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { packBingRows } from "./utils/bingWebmasterWeeks";
import { packNumbers } from "./utils/searchConsolePacks";

/**
 * What the Bing Webmaster screens and Ask Hakken read, from a website Bing has
 * been collected for (docs/plans/active/bing-webmaster-plan.md §5, BW13): its
 * websites list, Performance beside Google's days, the keyword list searched,
 * filtered and sorted on the server with Google's positions beside Bing's, a
 * keyword's own weeks, and nothing of it for another company.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
// Monday 2 November: last month, the screens' opening period, is October, which holds Bing's two days and two weeks.
const NOW = Date.parse("2026-11-02T04:00:00Z");
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
      companyWebsiteId: siteId, searchType: "web", list: "query", period: "lastMonth", which: "NOW", part: 0, from: "2026-10-01", to: "2026-10-31",
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

    const performance = (await user.query(api.bingWebmasterReads.bingPerformance, { siteId, period: "lastMonth" }))!;
    expect(performance.totals).toEqual({ clicks: 3, impressions: 420 });
    expect(performance.google).toEqual({ clicks: 63, impressions: 18_500 });
    // 10 Oct is a Saturday, 11 Oct a Sunday: one week, Monday the 5th.
    expect(performance.weeks).toEqual([{ week: "2026-10-05", bing: 3, google: 63 }]);
  });

  test("the keyword list is searched, filtered and sorted over the whole list, with Google's positions beside Bing's", async () => {
    const t = harness();
    const { siteId, user } = await collected(t);
    const ask = { siteId, list: "query" as const, period: "lastMonth" as const, page: 1, rows: 25 };
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

  test("Ask Hakken's Bing chart: its searches from Bing's own list, as bars and as shares", async () => {
    // ask-hakken-every-chart-plan-2026-10-31.md, the last sources: saved figures only, nothing asked of Bing.
    const t = harness();
    const { companyId, siteId } = await collected(t);
    const ask = { companyId, website: "ronins.co.uk", period: "lastMonth" as const, by: "query" as const, measure: "clicks" as const, source: "bing" as const };
    const bars = await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...ask, kind: "bars" });
    if (!bars.ok) throw new Error(bars.problem);
    expect(bars.chart).toMatchObject({ look: "bingGroups", by: "query", measure: "clicks", link: `/app/bing-webmaster/${siteId}/keywords?period=lastMonth` });
    // September holds nothing of Bing's, so no bar is set against a period before.
    expect(bars.chart.groups).toEqual([
      { name: "ronins", value: 5 }, { name: "ai agency", value: 2 }, { name: "internal and external stakeholders", value: 2 }, { name: "what is a brand audit", value: 2 },
    ]);
    const pie = await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...ask, kind: "pie" });
    expect(pie.ok && pie.chart.groups.map((group) => [group.name, group.value])).toEqual([["ronins", 45.5], ["ai agency", 18.2], ["internal and external stakeholders", 18.2], ["what is a brand audit", 18.2]]);
    const grid = await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...ask, kind: "grid" });
    expect(grid).toMatchObject({ ok: false, problem: expect.stringContaining("no grid") });
  });

  test("a keyword's own screen: its weeks on Bing and the menu's period beside Google's", async () => {
    const t = harness();
    const { siteId, user } = await collected(t);
    const list = await user.query(api.bingWebmasterReads.bingListPage, { siteId, list: "query", period: "lastMonth", page: 1, rows: 25 });
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
    const performance = await t.query(internal.assistantBingReads.bingWebmasterInternal, { companyId, website: "ronins.co.uk", screen: "performance", period: "lastMonth" });
    expect(performance).toMatchObject({ ok: true, bing: { clicks: 3, impressions: 420 }, google: { clicks: 63 }, link: expect.stringMatching(/^\/app\/bing-webmaster\//) });
    const versus = await t.query(internal.assistantBingReads.bingWebmasterInternal, { companyId, website: "ronins.co.uk", screen: "versus", period: "lastMonth" });
    expect(versus).toMatchObject({ ok: true, summary: { bingRanksHigher: 2, googleRanksHigher: 1, onlyOnBing: 1 } });
    const other = await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Rival", createdAt: 1 }));
    expect(await t.query(internal.assistantBingReads.bingWebmasterInternal, { companyId: other, website: "ronins.co.uk", screen: "performance", period: "lastMonth" })).toMatchObject({ ok: false });
  });

  test("the eye's figures: each read's span before, the whole list's movers and gaps, and never a part of a span set against a whole one", async () => {
    // ask-hakken-every-chart-page-plan-2026-11-03.md, section 7: "Bing keeps each row's span before and its days, but no
    // screen reads them". Written straight into the tables, as the build leaves them.
    const t = harness();
    const { siteId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Shop", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "shop.co.uk", displayHost: "shop.co.uk", firstSeenAt: 1 });
      const hold = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      const userId = await ctx.db.insert("users", { name: "User", email: "user@shop.test", role: "USER", companyId, createdAt: 1 });
      await ctx.db.insert("bingConnections", {
        companyId, companyWebsiteId: hold, websiteId, status: "CONNECTED", site: "https://www.shop.co.uk/", dataSite: "https://www.shop.co.uk/",
        newestDay: "2026-10-31", oldestDay: "2026-09-01", newestWeek: "2026-10-25", createdAt: 1, updatedAt: 1,
      });
      const crawl = { crawled: 400, errors: 2, inIndex: 3_000, inLinks: 0, blockedByRobots: 5, malware: 0, code2xx: 0, code301: 0, code302: 0, code4xx: 0, code5xx: 0, otherCodes: 0, dnsFailures: 0, timeouts: 0 };
      for (const [day, clicks, inIndex] of [["2026-09-30", 40, 3_100], ["2026-10-31", 30, 2_950]] as const) {
        await ctx.db.insert("bingDays", { companyWebsiteId: hold, day, clicks, impressions: clicks * 50, crawl: { ...crawl, inIndex }, fetchedAt: 1 });
      }
      // Google's every day of September, and one of October: a span before is set against only where nearly whole.
      for (let date = 1; date <= 30; date += 1) {
        await ctx.db.insert("searchConsoleDays", { companyWebsiteId: hold, searchType: "web", day: `2026-09-${String(date).padStart(2, "0")}`, clicks: 20, impressions: 2_000, ctr: 0.01, position: 9, fetchedAt: 1 });
      }
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: hold, searchType: "web", day: "2026-10-31", clicks: 600, impressions: 60_000, ctr: 0.01, position: 9, fetchedAt: 1 });
      await ctx.db.insert("bingKeywordBooks", { companyWebsiteId: hold, chunk: 0, keywords: ["door handles", "brass knobs", "sash locks", "pewter pulls"] });
      const part = (period: string, which: "NOW" | "BEFORE", from: string, to: string, rows: Array<[number, number, number, number]>, google?: Array<[number, number, number]>) => ctx.db.insert("bingPeriods", {
        companyWebsiteId: hold, list: "query", period, which, part: 0, from, to,
        ...packBingRows(rows.map(([key, clicks, impressions, position]) => ({ key, clicks, impressions, positionSum: position * impressions })))[0],
        ...(google ? {
          googleClicks: packNumbers(google.map(([clicks]) => clicks)),
          googleImpressions: packNumbers(google.map(([, impressions]) => impressions)),
          googlePositionSums: packNumbers(google.map(([, impressions, position]) => impressions * position)),
        } : {}),
        builtAt: 1,
      });
      // Busiest first, as the build packs them: door handles fell, brass knobs rose, sash locks is new, pewter pulls gone.
      await part("lastMonth", "NOW", "2026-09-28", "2026-10-25", [[0, 30, 600, 3], [1, 12, 300, 11], [2, 6, 100, 4]], [[200, 9_000, 16], [150, 4_000, 2], [-1, -1, -1]]);
      await part("lastMonth", "BEFORE", "2026-08-31", "2026-09-27", [[0, 50, 700, 2], [3, 8, 90, 5], [1, 4, 250, 12]]);
      // Last 12 months' span before, built from the weeks still kept: five of them, not fifty-two.
      await part("last12Months", "NOW", "2025-10-27", "2026-10-25", [[0, 300, 7_000, 3]], [[2_000, 90_000, 15]]);
      await part("last12Months", "BEFORE", "2025-09-22", "2025-10-26", [[0, 20, 500, 3]]);
      return { siteId: hold, userId };
    });
    const user = t.withIdentity({ subject: userId });

    const performance = (await user.query(api.bingWebmasterReads.bingPerformance, { siteId, period: "lastMonth" }))!;
    expect(performance.before).toEqual({ from: "2026-09-01", to: "2026-09-30", totals: { clicks: 40, impressions: 2_000 }, google: { clicks: 600, impressions: 60_000 } });
    const crawling = (await user.query(api.bingWebmasterReads.bingCrawling, { siteId, period: "lastMonth" }))!;
    expect(crawling.before).toEqual({ from: "2026-09-01", to: "2026-09-30", totals: { crawled: 400, errors: 2, blocked: 5 }, inIndex: 3_100 });

    const seen = (await user.query(api.bingWebmasterReads.bingListSeen, { siteId, list: "query", period: "lastMonth" }))!;
    expect(seen).toMatchObject({ totals: { rows: 3, clicks: 48 }, before: { rows: 3, clicks: 62 }, newLost: { gained: 1, lost: 1 }, who: { bingHigher: 1, googleHigher: 1, onlyBing: 1, onlyBingClicks: 6 } });
    expect(seen.down[0]).toMatchObject({ name: "door handles", clicks: 30, clicksBefore: 50, ref: "0" });
    expect(seen.up[0]).toMatchObject({ name: "brass knobs", clicks: 12, clicksBefore: 4 });
    expect(seen.down.map((row) => row.name)).toContain("pewter pulls");
    expect(seen.bingAhead).toMatchObject({ name: "door handles", position: 3, googlePosition: 16 });
    expect(seen.googleAhead).toMatchObject({ name: "brass knobs", position: 11, googlePosition: 2 });
    expect(seen.bands.find((band) => band.band === "top3")).toMatchObject({ rows: 1, clicks: 30, googleRows: 1, googleClicks: 150 });

    const year = (await user.query(api.bingWebmasterReads.bingListSeen, { siteId, list: "query", period: "last12Months" }))!;
    expect(year.before).toBeNull();
    expect(year.up).toEqual([]);
    const record = (await user.query(api.bingWebmasterReads.bingRecord, { siteId, list: "query", ref: "0", period: "lastMonth" }))!;
    expect(record.before).toEqual({ from: "2026-08-31", to: "2026-09-27", clicks: 50, impressions: 700, position: 2 });
    expect((await user.query(api.bingWebmasterReads.bingRecord, { siteId, list: "query", ref: "0", period: "last12Months" }))!.before).toBeNull();
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
    await expect(rival.query(api.bingWebmasterReads.bingPerformance, { siteId, period: "lastMonth" })).rejects.toThrow();
    await expect(rival.query(api.bingWebmasterReads.bingListPage, { siteId, list: "query", period: "lastMonth", page: 1, rows: 25 })).rejects.toThrow();
    expect(await rival.query(api.bingWebmasterReads.bingSites, {})).toEqual([]);
    expect(await rival.query(api.bingWebmasterConnect.bingStatus, { siteId })).toBeNull();
  });
});
