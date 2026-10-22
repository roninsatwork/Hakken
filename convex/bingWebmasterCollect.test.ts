import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { aboutMs, useFixedDay } from "@/src/test/realTime";
import { rowsOfBingPart } from "./utils/bingWebmasterWeeks";
import { unpackNumbers } from "./utils/searchConsolePacks";

/**
 * A website's Bing collection end to end, Bing faked at the network
 * (docs/plans/active/bing-webmaster-plan.md §4): its days and how Bing read
 * it, its keywords and pages kept by the week, the ready-made lists with
 * Google's figures beside them, its money pages, and a second morning that
 * writes nothing Bing did not change.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const NOW = Date.parse("2026-10-12T04:00:00Z");
const SITE = "https://www.ronins.co.uk/";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const wcf = (day: string) => `/Date(${Date.parse(`${day}T00:00:00Z`)})/`;

type Bing = { calls: string[]; keywords: { Query: string; Date: string; Clicks: number; Impressions: number; AvgImpressionPosition: number }[] };

function fakeBing(): Bing {
  const bing: Bing = {
    calls: [],
    keywords: [
      { Query: "ronins", Date: wcf("2026-10-04"), Clicks: 3, Impressions: 20, AvgImpressionPosition: 4 },
      { Query: "ronins", Date: wcf("2026-10-11"), Clicks: 2, Impressions: 21, AvgImpressionPosition: 4.74 },
      { Query: "what is a brand audit", Date: wcf("2026-10-11"), Clicks: 2, Impressions: 10, AvgImpressionPosition: 4.4 },
      { Query: "internal and external stakeholders", Date: wcf("2026-10-11"), Clicks: 2, Impressions: 35, AvgImpressionPosition: 8.97 },
    ],
  };
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    bing.calls.push(url.pathname.split("/").pop()!);
    const json = (d: unknown) => new Response(JSON.stringify({ d }), { status: 200 });
    switch (url.pathname.split("/").pop()) {
      case "GetRankAndTrafficStats":
        return json([
          { Date: wcf("2026-10-10"), Clicks: 1, Impressions: 180 },
          { Date: wcf("2026-10-11"), Clicks: 2, Impressions: 240 },
        ]);
      case "GetCrawlStats":
        return json([{ Date: wcf("2026-10-11"), CrawledPages: 41, CrawlErrors: 1, InIndex: 412, InLinks: 90, BlockedByRobotsTxt: 0, Code2xx: 40, Code4xx: 1 }]);
      case "GetQueryStats":
        return json(bing.keywords);
      case "GetPageStats":
        return json([
          { Query: "https://www.ronins.co.uk/", Date: wcf("2026-10-11"), Clicks: 3, Impressions: 120, AvgImpressionPosition: 6.8 },
          { Query: "https://www.ronins.co.uk/hub/brand-audit/", Date: wcf("2026-10-11"), Clicks: 2, Impressions: 30, AvgImpressionPosition: 6.2 },
        ]);
      case "GetUrlInfo":
        return url.searchParams.get("url")?.endsWith("/venture-studio/")
          ? new Response('{"Message":"InvalidUrl"}', { status: 400 })
          : json({ Url: url.searchParams.get("url"), HttpStatus: 200, LastCrawledDate: wcf("2026-10-02") });
      default:
        throw new Error(`Unexpected fetch in test: ${String(input)}`);
    }
  }));
  return bing;
}

/** A website connected to Bing, with its keys, Search Console's 90 days for Google's column, two money pages, and the agent. */
async function connected(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("bingConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", site: SITE, dataSite: SITE, connectedAt: 1, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("bingTokens", {
      companyWebsiteId: siteId, bingConnectionId: connectionId,
      accessTokenCiphertext: await encryptConnectorToken("access-1"), refreshTokenCiphertext: await encryptConnectorToken("refresh-1"),
      expiresAt: NOW + 3_000_000, createdAt: 1, updatedAt: 1,
    });
    // Google's 90 days for the same website, as Search Console keeps them ready-made.
    await ctx.db.insert("searchConsolePeriods", {
      companyWebsiteId: siteId, searchType: "web", list: "query", period: "thisMonth", which: "NOW", part: 0, from: "2026-10-01", to: "2026-10-11",
      keys: ["ronins", "what is a brand audit", "ai agency"], clicks: [45, 1, 106], impressions: [2129, 1509, 3848], positionSums: [14264, 15845, 9620], builtAt: 1,
    });
    for (const page of ["/", "/venture-studio/"]) {
      await ctx.db.insert("moneyPageChecks", { companyWebsiteId: siteId, page, kind: null, clicks: 1, indexed: null, speed: null, structured: null, checkedAt: 1 });
    }
    const agentId = await ctx.db.insert("agents", {
      name: "Bing Webmaster: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true,
      systemKey: "BING_WEBMASTER_COLLECTOR", createdAt: 1, updatedAt: 1,
    });
    return { siteId, connectionId, agentId };
  });
}

async function runCollector(t: Harness, agentId: Id<"agents">) {
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "SCHEDULE", objective: "Collect", title: "Bing Webmaster: Data Collection Scheduler", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.bingWebmasterAgentRun.runBingCollectorNow, { runId });
  await finishScheduled(t);
  return runId;
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

describe("collecting a website's Bing Webmaster figures", () => {
  test("its days, weeks, ready-made lists and money pages, with Google's figures beside Bing's", async () => {
    const t = harness();
    const { siteId, connectionId, agentId } = await connected(t);
    fakeBing();
    const runId = await runCollector(t, agentId);

    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    expect(runs.find((run) => run._id === runId)?.finalOutput).toContain("Started a run of its own for the 1 website");
    const siteRun = runs.find((run) => run.title === "Bing Webmaster: ronins.co.uk")!;
    expect(siteRun.status).toBe("SUCCESS");
    expect(siteRun.finalOutput).toContain("and the ready-made lists built again");

    const connection = (await t.run(async (ctx) => await ctx.db.get(connectionId)))!;
    expect(connection).toMatchObject({ newestDay: "2026-10-11", oldestDay: "2026-10-10", newestWeek: "2026-10-11", oldestWeek: "2026-10-04", lastCollectedAt: aboutMs(NOW) });
    expect(connection.collecting).toBeUndefined();

    const days = await t.run(async (ctx) => await ctx.db.query("bingDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", siteId)).collect());
    expect(days.map((day) => [day.day, day.clicks, day.impressions, day.crawl?.inIndex])).toEqual([["2026-10-10", 1, 180, undefined], ["2026-10-11", 2, 240, 412]]);

    // Each keyword once in the website's book, its weeks naming it by place.
    const book = await t.run(async (ctx) => (await ctx.db.query("bingKeywordBooks").collect()).flatMap((row) => row.keywords));
    expect([...book].sort()).toEqual(["internal and external stakeholders", "ronins", "what is a brand audit"]);
    const weeks = await t.run(async (ctx) => await ctx.db.query("bingWeeks").collect());
    expect(weeks.filter((week) => week.list === "query").map((week) => week.week).sort()).toEqual(["2026-10-04", "2026-10-11"]);

    // On Monday 12 October, This month is the two Bing weeks ending in it, busiest first, with Google's figures for the
    // same keyword from Search Console's This month (calendar-periods-plan.md, phase 5).
    const month = await t.run(async (ctx) => await ctx.db.query("bingPeriods")
      .withIndex("by_hold_list_period_which_part", (q) => q.eq("companyWebsiteId", siteId).eq("list", "query").eq("period", "thisMonth").eq("which", "NOW"))
      .first());
    const rows = rowsOfBingPart(month!);
    const named = rows.map((row) => ({ keyword: book[row.key], clicks: row.clicks, impressions: row.impressions }));
    expect(named).toEqual([
      { keyword: "ronins", clicks: 5, impressions: 41 },
      { keyword: "internal and external stakeholders", clicks: 2, impressions: 35 },
      { keyword: "what is a brand audit", clicks: 2, impressions: 10 },
    ]);
    expect(unpackNumbers(month!.googleClicks!)).toEqual([45, -1, 1]);
    expect(month).toMatchObject({ from: "2026-09-28", to: "2026-10-11" });
    // Last week is Bing's week ending inside it, alone; nothing is kept under the old day counts.
    const lastWeek = await t.run(async (ctx) => await ctx.db.query("bingPeriods")
      .withIndex("by_hold_list_period_which_part", (q) => q.eq("companyWebsiteId", siteId).eq("list", "query").eq("period", "lastWeek").eq("which", "NOW"))
      .first());
    expect(lastWeek).toMatchObject({ from: "2026-10-05", to: "2026-10-11" });
    const kept = await t.run(async (ctx) => await ctx.db.query("bingPeriods").collect());
    expect(kept.every((row) => !/^\d+$/.test(row.period))).toBe(true);

    // The page list names pages by the website's one page numbering.
    const pages = await t.run(async (ctx) => await ctx.db.query("holdPageAddresses").collect());
    expect(pages.flatMap((record) => record.addresses)).toEqual(expect.arrayContaining([SITE, "https://www.ronins.co.uk/hub/brand-audit/"]));

    // The money pages, one in Bing's index and one not.
    const checks = await t.run(async (ctx) => await ctx.db.query("bingPageChecks").collect());
    expect(checks.map((check) => [check.page, check.inIndex, check.lastRead]).sort()).toEqual([["/", true, "2026-10-02"], ["/venture-studio/", false, null]]);
  });

  test("the next morning, a week Bing gives again unchanged is not written again", async () => {
    const t = harness();
    const { agentId } = await connected(t);
    fakeBing();
    await runCollector(t, agentId);
    const before = await t.run(async (ctx) => (await ctx.db.query("bingWeeks").collect()).map((row) => row._id).sort());
    vi.setSystemTime(NOW + 86_400_000);
    await runCollector(t, agentId);
    const after = await t.run(async (ctx) => (await ctx.db.query("bingWeeks").collect()).map((row) => row._id).sort());
    expect(after).toEqual(before);
  });

  test("an account that lost the site asks for connecting again, and its run says what to do", async () => {
    const t = harness();
    const { connectionId, agentId } = await connected(t);
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"Message":"UserNotAuthorized"}', { status: 400 })));
    await runCollector(t, agentId);
    const run = await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).find((row) => row.title === "Bing Webmaster: ronins.co.uk"));
    expect(run?.status).toBe("FAILED");
    expect(run?.finalOutput).toContain("Connect it again from its Bing Webmaster page");
    expect(await t.run(async (ctx) => await ctx.db.get(connectionId))).toMatchObject({ status: "NEEDS_RECONNECT", problem: "NO_ACCESS" });
  });
});
