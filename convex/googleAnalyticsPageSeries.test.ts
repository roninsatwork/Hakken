import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { NEWEST, dayOf, type Visit } from "@/src/test/googleAnalyticsFake";
import { collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { shiftDay } from "./searchConsoleDays";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { channelKey, emptyRow } from "./googleAnalyticsLists";
import { pointKey, reshaped, writeBatches } from "./googleAnalyticsPageSeries";

/**
 * Each page over time (docs/plans/active/ga-stored-figures-plan.md SF5): a
 * day for 92 days (calendar-periods-plan.md), a week to 12 months, a month to
 * two years, one record a page, list and device. Filled once from Google's
 * history, its own screens and All pages' ticked pages read it for any dates
 * without asking Google.
 */

/**
 * 1 October 2026: the newest whole day is 30 September, so Last quarter is July to September, its 92 days the 92 kept
 * a day, and This year is 1 January to 30 September.
 */
const NOW = Date.parse("2026-10-01T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

function twoYears(): Visit[] {
  return Array.from({ length: 730 }, (_, at) => dayOf(shiftDay(NEWEST, -at))).flat();
}

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from(new Uint8Array(32).fill(7)).toString("base64"));
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a page's points reshaped to the rule", () => {
  test("a day past 92 into its week, a week past a year into its month, past two years gone, added up", () => {
    const row = (key: string, visits: number) => ({ ...emptyRow(key), visits });
    const out = reshaped([
      row("2026-10-08", 1),
      row("2026-07-01", 2),
      row("2026-07-02", 3),
      row(pointKey("week", "2025-09-29"), 4),
      row(pointKey("month", "2024-01-01"), 5),
    ], NEWEST);
    expect(Object.fromEntries(out.map((one) => [one.key, one.visits]))).toEqual({
      "2026-10-08": 1,
      "w:2026-06-29": 5,
      "m:2025-09-01": 4,
    });
  });
});

describe("a page's points by channel reshaped to the same rule (page-conversion-explorer-plan.md)", () => {
  test("each point keeps its channel: two channels' days past 90 land in their own week, added up", () => {
    const row = (key: string, visits: number) => ({ ...emptyRow(key), visits });
    const out = reshaped([
      row(channelKey("2026-07-01", "Organic Search"), 2),
      row(channelKey("2026-07-02", "Organic Search"), 3),
      row(channelKey("2026-07-02", "Paid Search"), 4),
      row(channelKey("2026-10-08", "Organic Search"), 1),
    ], NEWEST);
    expect(Object.fromEntries(out.map((one) => [one.key, one.visits]))).toEqual({
      [channelKey("w:2026-06-29", "Organic Search")]: 5,
      [channelKey("w:2026-06-29", "Paid Search")]: 4,
      [channelKey("2026-10-08", "Organic Search")]: 1,
    });
  });
});

describe("each page's records written in fixed-size writes (collection-reliability-plan.md, RR3)", () => {
  test("never more than the most records a write, nor past the characters a write, and one record too big still goes alone", () => {
    const record = (size: number) => ({ part: { keys: "x".repeat(size) } });
    expect(writeBatches(Array.from({ length: 250 }, () => record(10)), 100, 1_000_000).map((batch) => batch.length)).toEqual([100, 100, 50]);
    // A big shop's records, each with every event it counts: cut by size before the count.
    expect(writeBatches(Array.from({ length: 10 }, () => record(300)), 100, 1_000).map((batch) => batch.length)).toEqual([3, 3, 3, 1]);
    expect(writeBatches([record(5_000), record(10)], 100, 1_000).map((batch) => batch.length)).toEqual([1, 1]);
    expect(writeBatches([], 100, 1_000)).toEqual([]);
  });
});

describe("each page over time", () => {
  test("filled by itself after the first collection: a landing page's and a page's 12 months, and All pages' ticked page, read without asking Google", async () => {
    const t = harness();
    const { siteId, connectionId, user, google } = await collectedWebsite(t, twoYears(), encryptConnectorToken);
    const home = (await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", period: "lastMonth", device: "", page: 1, rows: 25 }))
      .rows.find((row) => row.label === "https://www.acme-shop.test/")!.key;
    // The fill ran once the first collection was in (ga-stored-figures-plan.md SF9): the pages held from two years back.
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.pageHistoryFrom).toBeDefined();
    const asked = google.calls.length;
    const landing = (await user.query(api.googleAnalyticsPageReads.analyticsLandingPage, { siteId, page: home, period: "last12Months", device: "" }))!;
    expect(landing.live).toBe(false);
    // This year: the 92 days kept a day, then weeks back to January.
    expect(landing.points.filter((point) => !point.lastDay)).toHaveLength(92);
    expect(landing.points.some((point) => point.lastDay !== undefined)).toBe(true);
    const daysOf = (point: { day: string; lastDay?: string }) => (point.lastDay ? (Date.parse(point.lastDay) - Date.parse(point.day)) / 86_400_000 + 1 : 1);
    // The plain day lands 10 visits on the home page from Organic Search, 2 from Direct, and the staging address's 2 are not the website's.
    const perDay = landing.points.find((point) => !point.lastDay)!.visits;
    expect(landing.points.reduce((sum, point) => sum + point.visits, 0)).toBe(perDay * landing.points.reduce((sum, point) => sum + daysOf(point), 0));
    const page = (await user.query(api.googleAnalyticsPageReads.analyticsPage, { siteId, page: home, period: "last3Months", device: "" }))!;
    // Last quarter on the 1st of the next: every one of its 92 days held a day at a time.
    expect(page.points).toHaveLength(92);
    const daily = await user.query(api.googleAnalyticsPageReads.analyticsPagesDaily, { siteId, period: "last12Months", device: "", pages: [home] });
    expect(daily.pages[0].points?.length).toBeGreaterThan(90);
    expect(google.calls.length).toBe(asked);
  });
});
