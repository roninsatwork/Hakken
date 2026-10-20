import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { NEWEST, dayOf, type Visit } from "@/src/test/googleAnalyticsFake";
import { collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { shiftDay } from "./searchConsoleDays";
import { encryptConnectorToken } from "./connectorTokenCrypto";

/**
 * A page's own conversions under its "Views a day" (Anthony, 2026-10-20): the
 * visits that started on it and their conversions a day at a time, the 30
 * days before laid over them, the figures as the screen's "Visits that
 * started here" counts them, and those conversions by channel — all from what
 * the collection keeps, never asking Google.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

/** Two years of the plain day; before the last 30 days, twice the visits from organic search for the same one lead. */
function twoYears(): Visit[] {
  return Array.from({ length: 730 }, (_, at) => dayOf(shiftDay(NEWEST, -at))).flat()
    .map((visit) => (visit.date < shiftDay(NEWEST, -29) && visit.channel === "Organic Search" ? { ...visit, sessions: visit.sessions * 2 } : visit));
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

describe("a page's own conversions", () => {
  test("its visits for one conversion day for day against the 30 days before, and its conversions by channel, never asking Google", async () => {
    const t = harness();
    const { siteId, user, google } = await collectedWebsite(t, twoYears(), encryptConnectorToken);
    const home = (await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", period: "30", device: "" , page: 1, rows: 25 }))
      .rows.find((row) => row.label === "https://www.acme-shop.test/")!.key;
    const asked = google.calls.length;
    const args = { siteId, page: home, period: "30" as const, device: "" };

    const chart = await user.query(api.googleAnalyticsPageConversions.analyticsPageVisitsPerConversion, args);
    expect(chart).toMatchObject({ live: false, events: ["generate_lead", "click_tel", "sign_up"] });
    // A day each, one lead a day from the visits that started here.
    expect(chart.points.map((point) => point.day)).toEqual(Array.from({ length: 30 }, (_, at) => shiftDay(NEWEST, at - 29)));
    const perDay = chart.points[0].visits;
    expect(chart.points.every((point) => point.visits === perDay && point.conversions === 1 && point.events[0] === 1 && !point.lastDay)).toBe(true);
    // The 30 days before, each laid over the day 30 later: ten more visits from organic search, the same lead.
    expect(chart.before?.shift).toBe(30);
    expect(chart.before?.points.map((point) => point.day)).toEqual(chart.points.map((point) => point.day));
    expect(chart.before?.points.every((point) => point.visits === perDay + 10 && point.conversions === 1)).toBe(true);
    // The figures as "Visits that started here" counts them, now and before.
    expect(chart.figures).toEqual({
      visits: 30 * perDay,
      visitsBefore: 30 * (perDay + 10),
      kinds: [
        { eventName: "generate_lead", count: 30, countBefore: 30 },
        { eventName: "click_tel", count: 0, countBefore: 0 },
        { eventName: "sign_up", count: 0, countBefore: 0 },
      ],
    });
    // Past 90 days only weeks and months are kept: no days before for the longer periods.
    expect((await user.query(api.googleAnalyticsPageConversions.analyticsPageVisitsPerConversion, { ...args, period: "90" })).before).toBeNull();

    const grid = (await user.query(api.googleAnalyticsPageConversions.analyticsPageConversionGrid, args))!;
    // Each channel whose visits started here, the most first; the lead from organic search; a key event not counted that never happened left off.
    // Organic search lands only on the home page: its visits and lead are the whole website's from that channel.
    expect(grid.channels[0]).toEqual({ channel: "Organic Search", visits: 300, conversions: 30, websiteVisits: 300, websiteConversions: 30 });
    expect(grid.channels.every((entry) => entry.websiteVisits >= entry.visits)).toBe(true);
    expect(grid.rows.map((row) => [row.eventName, row.counted, row.count])).toEqual([["generate_lead", true, 30], ["click_tel", true, 0], ["sign_up", true, 0]]);
    expect(grid.rows[0].cells[0]).toBe(30);
    expect(grid.rows[0].cells.reduce((sum, count) => sum + count, 0)).toBe(30);
    expect(google.calls.length).toBe(asked);
  });
});
