import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { finishScheduled } from "@/src/test/finishScheduled";
import { NEWEST, dayOf, type Visit } from "@/src/test/googleAnalyticsFake";
import { collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { shiftDay } from "./searchConsoleDays";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { fillPieces } from "./googleAnalyticsHistory";
import { unpackPart, type PackedPart } from "./googleAnalyticsLists";
import { historyFloors } from "./utils/analyticsHistory";

/**
 * Google Analytics' channels over time (docs/plans/active/ga-stored-figures-plan.md
 * SF2, SF2b, SF9): a day for 90 days, a week to 12 months, a month to two
 * years. After the two years are filled from Google's history, any dates read
 * what Hakken holds and never ask Google; each run rolls the past on, its
 * figures kept whole. From a property collected with Google faked.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

/** Two years of the plain day: Organic Search's 10 visits a day among them. */
function twoYears(): Visit[] {
  return Array.from({ length: 730 }, (_, at) => dayOf(shiftDay(NEWEST, -at))).flat();
}

const args = { device: "", channel: "Organic Search" };
const visitsOf = (points: ReadonlyArray<{ visits: number }>) => points.reduce((sum, point) => sum + point.visits, 0);

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

describe("the fill's pieces", () => {
  test("whole months to the year's weeks, then four weeks at a time to the 90 days: no week or month split", () => {
    const pieces = fillPieces(NEWEST);
    const floors = historyFloors(NEWEST);
    expect(pieces[0].from).toBe(floors.month);
    expect(pieces.at(-1)?.to).toBe(shiftDay(floors.day, -1));
    for (const [at, piece] of pieces.entries()) if (at > 0) expect(piece.from).toBe(shiftDay(pieces[at - 1].to, 1));
  });
});

describe("channels over time", () => {
  test("filled once: 12 months and the 12 before read from what is held, by day, week and month, never asking Google", async () => {
    const t = harness();
    // Filled by its first night (ga-big-site-reliability-plan.md BR7).
    const { siteId, connectionId, user, google } = await collectedWebsite(t, twoYears(), encryptConnectorToken);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.historyFilled).toContain("channel");
    const asked = google.calls.length;
    const year = await user.query(api.googleAnalyticsChannelReads.analyticsChannelDays, { siteId, period: "365", ...args });
    expect(year).toMatchObject({ live: false, liveBefore: false });
    // The last 90 days by day, the rest by week; every day once, the first week drawn whole as most of it is inside.
    expect(year.now.filter((point) => !point.lastDay)).toHaveLength(90);
    const daysOf = (point: { day: string; lastDay?: string }) => (point.lastDay ? (Date.parse(point.lastDay) - Date.parse(point.day)) / 86_400_000 + 1 : 1);
    expect(visitsOf(year.now)).toBe(10 * year.now.reduce((sum, point) => sum + daysOf(point), 0));
    expect(Date.parse(year.from!) - Date.parse(year.now[0].day)).toBeLessThanOrEqual(3 * 86_400_000);
    // The 12 months before, by month.
    expect(year.before.every((point) => point.lastDay !== undefined)).toBe(true);
    expect(year.before.length).toBeGreaterThanOrEqual(12);
    const chart = await user.query(api.googleAnalyticsChartReads.analyticsChannelChart, { siteId, period: "365", device: "" });
    expect(chart.live).toBe(false);
    expect(google.calls.length).toBe(asked);
  });

  test("filled once: Overview, Events, Campaigns and Visitors read 12 months from each fact a day, never asking Google", async () => {
    const t = harness();
    const { siteId, user, google } = await collectedWebsite(t, twoYears(), encryptConnectorToken);
    const asked = google.calls.length;
    const year = { siteId, period: "365" as const, device: "" };
    const overview = await user.query(api.googleAnalyticsChartReads.analyticsChart, year);
    expect(overview.points.filter((point) => !point.lastDay)).toHaveLength(90);
    expect(overview.points.some((point) => point.lastDay !== undefined)).toBe(true);
    const events = (await user.query(api.googleAnalyticsEventReads.analyticsEvents, year))!;
    expect(events.points.some((point) => point.lastDay !== undefined)).toBe(true);
    const campaigns = await user.query(api.googleAnalyticsChartReads.analyticsCampaignChart, year);
    expect(campaigns.live).toBe(false);
    const visitors = (await user.query(api.googleAnalyticsVisitorReads.analyticsVisitors, year))!;
    expect(visitors.points.some((point) => point.lastDay !== undefined)).toBe(true);
    expect(google.calls.length).toBe(asked);
  });

  test("a website held as 60 days: the fill tops the days up to 90 first, and nothing past the days is read until it has", async () => {
    const t = harness();
    const { siteId, connectionId, user } = await collectedWebsite(t, twoYears(), encryptConnectorToken, { firstNight: false });
    // As a website collected before 90 days were kept: its 60 newest days.
    const sixty = shiftDay(NEWEST, -59);
    await t.run(async (ctx) => {
      for (const day of await ctx.db.query("googleAnalyticsDays").withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", siteId)).collect()) {
        if (day.day < sixty) await ctx.db.delete(day._id);
      }
      await ctx.db.patch(connectionId, { oldestDay: sixty });
    });
    expect((await user.query(api.googleAnalyticsChannelReads.analyticsChannelDays, { siteId, period: "90", ...args })).live).toBe(true);
    expect((await t.action(internal.googleAnalyticsSteps.fillHistory, { connectionId })).ok).toBe(true);
    const ninety = await user.query(api.googleAnalyticsChannelReads.analyticsChannelDays, { siteId, period: "90", ...args });
    expect(ninety).toMatchObject({ live: false, liveBefore: false });
    expect(visitsOf(ninety.now)).toBe(900);
  });

  test("rolling on: every day fact's day past 90 goes into its week, a week past a year into its month, the figures kept whole", async () => {
    const t = harness();
    const { siteId } = await collectedWebsite(t, twoYears(), encryptConnectorToken);
    const held = async () => await t.run(async (ctx) => {
      const days = await ctx.db.query("googleAnalyticsDays").withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", siteId)).collect();
      const history = await ctx.db.query("googleAnalyticsHistory").withIndex("by_hold_grain_start", (q) => q.eq("companyWebsiteId", siteId)).collect();
      return { days, history };
    });
    const before = await held();
    // A week on: the newest day moves seven days, and the run rolls the past on.
    const newest = shiftDay(NEWEST, 7);
    await t.mutation(internal.googleAnalyticsHistory.rollHistory, { companyWebsiteId: siteId, newest });
    // One list and device a call, the rest scheduled at once after (collection-reliability-plan.md, RR3).
    await finishScheduled(t);
    const after = await held();
    const floors = historyFloors(newest);
    expect(after.days.every((day) => day.day >= floors.day)).toBe(true);
    expect(after.history.filter((record) => record.grain === "week").every((record) => record.start >= floors.week)).toBe(true);
    // Every visit still held once, but those past two years.
    const visits = (records: ReadonlyArray<PackedPart & { device: string }>) => records
      .filter((record) => record.device === "")
      .reduce((sum, record) => sum + unpackPart(record).reduce((all, row) => all + row.visits, 0), 0);
    const gone = before.history.filter((record) => record.grain === "month" && record.start < floors.month);
    expect(visits([...after.days, ...after.history])).toBe(visits([...before.days, ...before.history]) - visits(gone));
  });
});
