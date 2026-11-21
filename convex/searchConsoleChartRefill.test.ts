import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";

/**
 * The Position bands and Brand charts' weeks and months older than the days kept, worked out again from Google's own
 * keyword figures (search-console-and-analytics-data-plan-2026-11-21.md, fix 1): each search once, by its own place, every
 * search past the top 20 counted, its volatility kept. Google faked at the network.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(4)).toString("base64");
const PROPERTY = "sc-domain:acme-shop.test";
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

type Ask = { startDate: string; endDate: string; dimensions: string[]; startRow: number };

/** Google, faked: the keywords of whatever span is asked, as Google counts them, and every ask kept. */
function fakeGoogle() {
  const asks: Ask[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (!/searchAnalytics\/query$/.test(url)) throw new Error(`Unexpected fetch in test: ${url}`);
    const ask = JSON.parse(String(init?.body)) as Ask;
    asks.push(ask);
    if (ask.startRow > 0) return Response.json({});
    const row = (key: string, clicks: number, impressions: number, position: number) => ({ keys: [key], clicks, impressions, ctr: clicks / impressions, position });
    return Response.json({ rows: [row("acme handles", 40, 200, 1.2), row("door handles", 5, 900, 7), row("brass knobs", 0, 50, 15), row("odd hinge", 0, 10, 48)] });
  }));
  return asks;
}

async function setup() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    await ctx.db.insert("holdProfiles", { companyWebsiteId: siteId, companyId, websiteId, brandNames: [{ name: "Acme", isPrimary: true }], hasBrandNames: true, updatedAt: 1 } as never);
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: PROPERTY, permission: "siteOwner", dataProperty: PROPERTY,
      newestDay: "2026-11-16", oldestDay: "2026-07-08", daysFrom: "2025-08-01", mainCountry: "gbr", createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    // Web results held: the kinds of result whose charts are worked out again.
    await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day: "2026-11-16", clicks: 45, impressions: 1_160, ctr: 45 / 1_160, position: 6, fetchedAt: 1 });
    const week = (grain: "DAY" | "WEEK" | "MONTH", start: string) => ctx.db.insert("searchConsoleWeeks", {
      companyWebsiteId: siteId, searchType: "web", grain, week: start, days: 7, top3: 9, top10: 9, top20: 9, rest: 9, brandClicks: 9, otherClicks: 9, volatility: 4.2, builtAt: 1,
    });
    // A week built from the pairs before the days kept, a month from before collection began, and a day inside the days kept.
    await week("WEEK", "2026-08-03");
    await week("MONTH", "2026-06-01");
    await week("DAY", "2026-11-10");
    return { siteId, connectionId };
  });
  return { t, ...ids };
}

beforeEach(() => {
  useFixedDay("2026-11-18");
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the charts' older weeks and months worked out again", () => {
  test("each from Google's own keywords, every search past the top 20 counted, its volatility kept, and the days kept left alone", async () => {
    const { t, siteId, connectionId } = await setup();
    const asks = fakeGoogle();
    const done = await t.action(internal.searchConsoleChartRefill.refillCharts, { connectionId });
    expect(done).toMatchObject({ periods: 2, problems: [] });
    const rows = await t.run(async (ctx) => await ctx.db.query("searchConsoleWeeks").withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", siteId)).collect());
    const of = (grain: string, week: string) => rows.find((row) => row.grain === grain && row.week === week)!;
    for (const [grain, week] of [["WEEK", "2026-08-03"], ["MONTH", "2026-06-01"]]) {
      expect(of(grain, week)).toMatchObject({ top3: 1, top10: 1, top20: 1, rest: 1, brandClicks: 40, otherClicks: 5, volatility: 4.2 });
    }
    // The week's whole span, the month's whole span: each asked of Google by keyword alone.
    expect(of("WEEK", "2026-08-03").days).toBe(7);
    expect(of("MONTH", "2026-06-01").days).toBe(30);
    expect(asks.map((ask) => `${ask.dimensions.join("+")} ${ask.startDate} ${ask.endDate}`).sort()).toEqual(["query 2026-06-01 2026-06-30", "query 2026-08-03 2026-08-09"]);
    // A day inside the days kept is every night's build's own: left as it was.
    expect(of("DAY", "2026-11-10")).toMatchObject({ top3: 9, rest: 9 });
  });
});
