import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { finishScheduled } from "@/src/test/finishScheduled";
import { NEWEST, dayOf, type Visit } from "@/src/test/googleAnalyticsFake";
import { FINISHED_ON_9_OCTOBER, collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { shiftDay } from "./searchConsoleDays";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { fillPieces } from "./googleAnalyticsHistory";
import { unpackPart, type PackedPart } from "./googleAnalyticsLists";
import { historyFloors } from "./utils/analyticsHistory";

/**
 * Google Analytics' channels over time (docs/plans/active/ga-stored-figures-plan.md
 * SF2, SF2b, SF9): a day for 92 days, a week to 12 months, a month to two
 * years. After the two years are filled from Google's history, any dates read
 * what Hakken holds and never ask Google; each run rolls the past on, its
 * figures kept whole. From a property collected with Google faked.
 */

/** Friday 9 October: Google's newest day is the 8th, this year 1 January to it, last month September. */
const NOW = Date.parse("2026-10-09T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

/** Two years of the plain day: Organic Search's 10 visits a day among them. */
function twoYears(): Visit[] {
  return Array.from({ length: 730 }, (_, at) => dayOf(shiftDay(NEWEST, -at))).flat();
}

const args = { device: "", channel: "Organic Search" };
/**
 * Last week, last month and last quarter fetched already: a test that reads none of their lists asks Google for none
 * (AGENTS.md: a test asks no more than its assertions read; these sat at five seconds on a busy machine, 2026-10-22).
 */
const FETCHED = { connection: FINISHED_ON_9_OCTOBER };
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
  test("whole months to the year's weeks, then four weeks at a time to the 92 days: no week or month split", () => {
    const pieces = fillPieces(NEWEST);
    const floors = historyFloors(NEWEST);
    expect(pieces[0].from).toBe(floors.month);
    expect(pieces.at(-1)?.to).toBe(shiftDay(floors.day, -1));
    for (const [at, piece] of pieces.entries()) if (at > 0) expect(piece.from).toBe(shiftDay(pieces[at - 1].to, 1));
  });
});

describe("channels over time", () => {
  test("filled once: this year and the same days a year before read from what is held, by day, week and month, never asking Google", async () => {
    const t = harness();
    // Filled by its first night (ga-big-site-reliability-plan.md BR7).
    const { siteId, connectionId, user, google } = await collectedWebsite(t, twoYears(), encryptConnectorToken, FETCHED);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.historyFilled).toContain("channel");
    const asked = google.calls.length;
    const year = await user.query(api.googleAnalyticsChannelReads.analyticsChannelDays, { siteId, period: "thisYear", ...args });
    expect(year).toMatchObject({ live: false, liveBefore: false, from: "2026-01-01", to: NEWEST });
    // The last 92 days by day, the rest by week; every day once, the first week drawn whole as most of it is inside.
    expect(year.now.filter((point) => !point.lastDay)).toHaveLength(92);
    const daysOf = (point: { day: string; lastDay?: string }) => (point.lastDay ? (Date.parse(point.lastDay) - Date.parse(point.day)) / 86_400_000 + 1 : 1);
    expect(visitsOf(year.now)).toBe(10 * year.now.reduce((sum, point) => sum + daysOf(point), 0));
    expect(Date.parse(year.from!) - Date.parse(year.now[0].day)).toBeLessThanOrEqual(3 * 86_400_000);
    // The same days a year before, 1 January to 8 October 2025: by month, then the week of 6 October, the first kept by week.
    expect(year.before.every((point) => point.lastDay !== undefined)).toBe(true);
    expect(year.before.length).toBeGreaterThanOrEqual(10);
    expect(year.before[0]).toMatchObject({ day: "2025-01-01", lastDay: "2025-01-31" });
    const chart = await user.query(api.googleAnalyticsChartReads.analyticsChannelChart, { siteId, period: "thisYear", device: "" });
    expect(chart.live).toBe(false);
    expect(google.calls.length).toBe(asked);
  });

  test("filled once: Overview, Events, Campaigns and Visitors read this year from each fact a day, never asking Google", async () => {
    const t = harness();
    const { siteId, user, google } = await collectedWebsite(t, twoYears(), encryptConnectorToken, FETCHED);
    const asked = google.calls.length;
    const year = { siteId, period: "thisYear" as const, device: "" };
    const overview = await user.query(api.googleAnalyticsChartReads.analyticsChart, year);
    expect(overview.points.filter((point) => !point.lastDay)).toHaveLength(92);
    expect(overview.points.some((point) => point.lastDay !== undefined)).toBe(true);
    const events = (await user.query(api.googleAnalyticsEventReads.analyticsEvents, year))!;
    expect(events.points.some((point) => point.lastDay !== undefined)).toBe(true);
    const campaigns = await user.query(api.googleAnalyticsChartReads.analyticsCampaignChart, year);
    expect(campaigns.live).toBe(false);
    const visitors = (await user.query(api.googleAnalyticsVisitorReads.analyticsVisitors, year))!;
    expect(visitors.points.some((point) => point.lastDay !== undefined)).toBe(true);
    expect(google.calls.length).toBe(asked);
  });

  test("a website held as 60 days: the fill tops the days up to 92 first, and nothing past the days is read until it has", async () => {
    const t = harness();
    // Last month is read; last week and last quarter are not, so they are fetched already.
    const { siteId, connectionId, user } = await collectedWebsite(t, twoYears(), encryptConnectorToken, {
      firstNight: false, connection: { ...FINISHED_ON_9_OCTOBER, periodsFetched: FINISHED_ON_9_OCTOBER.periodsFetched.filter((period) => period.key !== "lastMonth") },
    });
    // As a website collected before 90 days were kept: its 60 newest days.
    const sixty = shiftDay(NEWEST, -59);
    await t.run(async (ctx) => {
      for (const day of await ctx.db.query("googleAnalyticsDays").withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", siteId)).collect()) {
        if (day.day < sixty) await ctx.db.delete(day._id);
      }
      await ctx.db.patch(connectionId, { oldestDay: sixty });
    });
    // Last month, September, is among the 60 days; the month before, August, reaches past them.
    expect(await user.query(api.googleAnalyticsChannelReads.analyticsChannelDays, { siteId, period: "lastMonth", ...args })).toMatchObject({ live: false, liveBefore: true });
    expect((await t.action(internal.googleAnalyticsSteps.fillHistory, { connectionId })).ok).toBe(true);
    const month = await user.query(api.googleAnalyticsChannelReads.analyticsChannelDays, { siteId, period: "lastMonth", ...args });
    expect(month).toMatchObject({ live: false, liveBefore: false });
    // August's 31 days, each read as a day: the days topped up, not their weeks.
    expect(month.before).toHaveLength(31);
    expect(month.before.every((point) => point.lastDay === undefined)).toBe(true);
    expect(visitsOf(month.before)).toBe(310);
  });

  test("the span before, day for day: the weeks and months only, its first day laid over the period's first, never asking Google", async () => {
    const t = harness();
    // Before the last 30 days, the lead from organic search never came: 16 visits for each conversion, against 8 since.
    const visits = twoYears().map((visit) => (visit.date < shiftDay(NEWEST, -29) && visit.events?.generate_lead ? { ...visit, events: { generate_lead: [0, 0] as [number, number] } } : visit));
    const { siteId, user, google } = await collectedWebsite(t, visits, encryptConnectorToken, { firstNight: false });
    const asked = google.calls.length;
    const before = (period: "lastWeek" | "thisMonth" | "lastMonth" | "lastQuarter") => user.query(api.googleAnalyticsChartReads.analyticsPeriodBeforeChart, { siteId, period, device: "" });
    // Last month, September, against August: August's 1st over September's 1st, and on, a day at a time.
    const month = await before("lastMonth");
    expect(month).toMatchObject({ held: true, shift: 31, events: ["generate_lead", "click_tel", "sign_up"] });
    // August has a day more than September: its 31st falls on 1 October, past the period, where the chart draws no day.
    expect(month.points.map((point) => point.day)).toEqual(Array.from({ length: 31 }, (_, at) => shiftDay("2026-09-01", at)));
    expect(month.points.every((point) => point.visits === 16 && point.conversions === 1)).toBe(true);
    // Each kind's own count, for the tick boxes: only the call clicked then.
    expect(month.points.every((point) => point.events[0] === 0 && point.events[1] === 1 && point.events[2] === 0)).toBe(true);
    // This month so far, 1 to 8 October, against the same days of September: still before the lead came.
    const sofar = await before("thisMonth");
    expect(sofar).toMatchObject({ held: true, shift: 30 });
    expect(sofar.points.map((point) => point.day)).toEqual(Array.from({ length: 8 }, (_, at) => shiftDay("2026-10-01", at)));
    expect(sofar.points.every((point) => point.visits === 16 && point.conversions === 1)).toBe(true);
    // Last week, 28 September to 4 October, against the week before: inside the last 30 days, both leads.
    const week = await before("lastWeek");
    expect(week).toMatchObject({ held: true, shift: 7 });
    expect(week.points.map((point) => point.day)).toEqual(Array.from({ length: 7 }, (_, at) => shiftDay("2026-09-28", at)));
    expect(week.points.every((point) => point.visits === 16 && point.conversions === 2)).toBe(true);
    // The quarters and the year are set against spans kept only as weeks and months: no line for them.
    expect(await before("lastQuarter")).toEqual({ held: false, shift: 0, points: [], events: ["generate_lead", "click_tel", "sign_up"] });
    expect(google.calls.length).toBe(asked);
  });

  test("rolling on: every day fact's day past 92 goes into its week, a week past a year into its month, the figures kept whole", async () => {
    const t = harness();
    const { siteId } = await collectedWebsite(t, twoYears(), encryptConnectorToken, FETCHED);
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
