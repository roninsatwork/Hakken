import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { unpackPart, splitChannelKey } from "./googleAnalyticsLists";
import { decodePages } from "./holdPageRefs";
import { analyticsWindow, dueJobs, newestWholeDayIn, periodRange } from "./googleAnalyticsCollect";
import { shiftDay } from "./searchConsoleDays";
import { NEWEST, PROPERTY, dayOf, fakeGoogle, history } from "@/src/test/googleAnalyticsFake";

/**
 * Collecting a website's Google Analytics, end to end with Google faked at the
 * network (docs/plans/active/google-analytics-plan.md §4): the first
 * collection started on saving what counts, the 60 days kept by device, the
 * ready-made lists asked of Google, page addresses numbered as Search
 * Console's are, only what changed written again, the daily run's few days,
 * access lost, and another property's figures cleared. Nothing reaches Google.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** A website connected to Analytics with what counts read, ready to save; the agent created unless asked not to. */
async function connected(t: Harness, withAgent = true) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "COUNTING", property: PROPERTY, propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: ["staging.acme-shop.test"],
      timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1,
      events: [
        { eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 14 },
        { eventName: "click_tel", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 6 },
      ],
      createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    const agentId = withAgent
      ? await ctx.db.insert("agents", {
        name: "Google Analytics: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true,
        systemKey: "GOOGLE_ANALYTICS_COLLECTOR", createdAt: 1, updatedAt: 1,
      })
      : null;
    return { companyId, siteId, connectionId, agentId, admin: adminId };
  }).then((ids) => ({ ...ids, admin: t.withIdentity({ subject: ids.admin }) }));
}

const save = (admin: ReturnType<Harness["withIdentity"]>, siteId: Id<"companyWebsites">) =>
  admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
    siteId,
    events: [
      { eventName: "generate_lead", counted: true, hakkenValue: 250 },
      { eventName: "click_tel", counted: true, hakkenValue: 150 },
    ],
  });

const runsOf = (t: Harness) => t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
const connectionOf = (t: Harness, connectionId: Id<"googleAnalyticsConnections">) => t.run(async (ctx) => await ctx.db.get(connectionId));

/** Rows as plain objects, as a query hands them back. */
const plain = (rows: ReturnType<typeof unpackPart>) =>
  rows.map((row) => ({ ...row, counts: Object.fromEntries(row.counts), values: Object.fromEntries(row.values) }));

/** A kept day's rows for a list and device. */
const dayRows = (t: Harness, siteId: Id<"companyWebsites">, list: "total" | "channel", device: string, day: string) =>
  t.run(async (ctx) => {
    const parts = await ctx.db
      .query("googleAnalyticsDays")
      .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", siteId).eq("list", list).eq("device", device).eq("day", day))
      .collect();
    return plain(parts.flatMap((part) => unpackPart(part)));
  });

/** A ready-made list's rows, read through its slot as a screen does. */
const periodRows = (t: Harness, siteId: Id<"companyWebsites">, key: string) =>
  t.run(async (ctx) => {
    const slot = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", siteId).eq("key", key)).first();
    if (!slot) return null;
    const parts = await ctx.db
      .query("googleAnalyticsPeriods")
      .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", siteId).eq("key", key).eq("slot", slot.slot))
      .collect();
    return { slot, rows: plain(parts.flatMap((part) => unpackPart(part))) };
  });

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

describe("which days and lists a run asks for", () => {
  test("nothing held: the 60 days kept; held: the days since, and the two before again", () => {
    expect(newestWholeDayIn(NOW, "Europe/London")).toBe(NEWEST);
    // Before dawn in London it is still the day before in California, but Analytics keeps the property's own day.
    expect(newestWholeDayIn(Date.parse("2026-10-09T23:30:00Z"), "Europe/London")).toBe("2026-10-09");
    expect(analyticsWindow(undefined, undefined, NEWEST)).toEqual({ from: shiftDay(NEWEST, -59), top: NEWEST });
    expect(analyticsWindow("2026-10-07", shiftDay(NEWEST, -59), NEWEST)).toEqual({ from: "2026-10-06", top: NEWEST });
    // Two mornings missed: every day since the newest held, and two again.
    expect(analyticsWindow("2026-10-05", shiftDay(NEWEST, -59), NEWEST)).toEqual({ from: "2026-10-04", top: NEWEST });
    // A first collection that stopped with only its newest 20 days: all 60 again.
    expect(analyticsWindow(NEWEST, shiftDay(NEWEST, -19), NEWEST)).toEqual({ from: shiftDay(NEWEST, -59), top: NEWEST });
  });

  test("the 7 and 30 days each run; the 90 days, 12 months and the year before once a week", () => {
    expect(periodRange("30", "NOW", NEWEST)).toEqual({ from: "2026-09-09", to: NEWEST });
    expect(periodRange("30", "BEFORE", NEWEST)).toEqual({ from: "2026-08-10", to: "2026-09-08" });
    // A year before is 52 weeks before, so each day falls on the same weekday.
    expect(periodRange("90", "YEAR", NEWEST)).toEqual({ from: "2025-07-12", to: "2025-10-09" });
    expect(dueJobs({ weeklyPeriodsAt: undefined }, NOW)).toHaveLength(2 * 2 * 4 + 2 * (3 * 4 + 1));
    expect(dueJobs({ weeklyPeriodsAt: NOW - 24 * 60 * 60 * 1000 }, NOW)).toHaveLength(16);
  });
});

describe("collecting a website's Google Analytics", () => {
  test("saving what counts starts its first collection at once: the 60 days by device, then the ready-made lists", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t);
    const google = fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);

    const runs = await runsOf(t);
    expect(runs.map((run) => [run.title, run.status])).toEqual([["Google Analytics: acme-shop.test", "SUCCESS"]]);
    expect(runs[0].finalOutput).toContain("Collected acme-shop.test");
    const connection = (await connectionOf(t, connectionId))!;
    expect(connection).toMatchObject({ status: "CONNECTED", newestDay: NEWEST, oldestDay: shiftDay(NEWEST, -59) });
    expect(connection.backfilledAt).toBeGreaterThan(0);
    expect(connection.weeklyPeriodsAt).toBeGreaterThan(0);
    expect(connection.collecting).toBeUndefined();

    // Every device's totals are the devices' added up; the other address is never read.
    const every = await dayRows(t, siteId, "total", "", NEWEST);
    expect(every).toHaveLength(1);
    expect(every[0]).toMatchObject({ visits: 16, engaged: 11, seconds: 590, views: 32 });
    expect(every[0].counts).toEqual({ generate_lead: 1, click_tel: 1 });
    expect((await dayRows(t, siteId, "total", "mobile", NEWEST))[0]).toMatchObject({ visits: 10 });
    const channels = await dayRows(t, siteId, "channel", "", NEWEST);
    expect(channels.map((row) => [splitChannelKey(row.key).channel, splitChannelKey(row.key).source, row.visits])).toEqual([
      ["Organic Search", "google", 10], ["Referral", "perplexity.ai", 4], ["Direct", "(direct)", 2],
    ]);
    // Nothing older than the 60 days kept was asked for.
    expect(await dayRows(t, siteId, "total", "", shiftDay(NEWEST, -60))).toEqual([]);
    // Each report was for the website's own address — but the weekly one of every address, for tracking health.
    const asks = google.calls.filter((call) => call.url.endsWith(":runReport"))
      .map((call) => JSON.parse(call.body) as { dimensions: { name: string }[]; dimensionFilter?: unknown })
      .filter((ask) => ask.dimensions[0].name !== "hostName");
    expect(asks.every((ask) => JSON.stringify(ask.dimensionFilter).includes("www.acme-shop.test"))).toBe(true);
    // Tracking health ran on the first collection: the other address is a stranger.
    expect((await connectionOf(t, connectionId))?.health?.checks.find((check) => check.check === "STRANGERS")).toMatchObject({ passing: false, names: ["staging.acme-shop.test"], count: 1500 });

    // The landing pages' ready-made 30 days: numbered as Search Console's pages are, the query left off.
    const landing = (await periodRows(t, siteId, "landing|30|NOW|"))!;
    const addresses = await t.run(async (ctx) => await decodePages(ctx, siteId, landing.rows.map((row) => row.key)));
    expect(addresses).toEqual(["https://www.acme-shop.test/", "https://www.acme-shop.test/ai-agency/", "https://www.acme-shop.test/contact/"]);
    expect(landing.rows[0]).toMatchObject({ visits: 300, views: 600 });
    expect(landing.slot).toMatchObject({ from: "2026-09-09", to: NEWEST });
    // A list kept by device has a build for each device; a page list only for every device.
    expect(await periodRows(t, siteId, "total|7|NOW|mobile")).not.toBeNull();
    expect(await periodRows(t, siteId, "landing|7|NOW|mobile")).toBeNull();
    // The 12 months' chart, a day a row.
    expect((await periodRows(t, siteId, "series|365|NOW|"))!.rows.length).toBe(70);
  });

  test("without the agent nothing starts, and the website waits for its first run", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t, false);
    fakeGoogle(history(5));
    await save(admin, siteId);
    await finishScheduled(t);
    expect(await runsOf(t)).toEqual([]);
    expect((await connectionOf(t, connectionId))?.newestDay).toBeUndefined();
  });

  test("the daily run: a run per website, the newest days again, and lists whose figures did not move left as they were", async () => {
    const t = harness();
    const { siteId, connectionId, admin, agentId } = await connected(t);
    const google = fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);
    const before = (await periodRows(t, siteId, "landing|90|NOW|"))!.slot;

    // The next morning: one new day, nothing else changed.
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    google.visits.push(...dayOf("2026-10-09"));
    const asked = google.calls.length;
    const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId: agentId!, triggerType: "SCHEDULE", objective: "Collect", title: "Google Analytics: Data Collection Scheduler",
      status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId });
    await finishScheduled(t);

    const runs = await runsOf(t);
    expect(runs.find((run) => run._id === runId)?.finalOutput).toContain("Started a run of its own for the 1 website");
    expect(runs.filter((run) => run.title === "Google Analytics: acme-shop.test").every((run) => run.status === "SUCCESS")).toBe(true);
    expect((await connectionOf(t, connectionId))?.newestDay).toBe("2026-10-09");
    // Three days asked, by device: two asks each for totals and channels.
    const dayAsks = google.calls.slice(asked)
      .filter((call) => call.url.endsWith(":runReport"))
      .map((call) => JSON.parse(call.body) as { dateRanges: { startDate: string; endDate: string }[]; dimensions: { name: string }[] })
      .filter((ask) => ask.dimensions[0].name === "date");
    expect(dayAsks.map((ask) => ask.dateRanges[0])).toEqual(Array(4).fill({ startDate: "2026-10-07", endDate: "2026-10-09" }));
    // The weekly lists were not asked again within the week.
    expect((await periodRows(t, siteId, "landing|90|NOW|"))!.slot).toEqual(before);
    // The 7 days moved on a day: rebuilt into the other slot.
    expect((await periodRows(t, siteId, "total|7|NOW|"))!.slot.to).toBe("2026-10-09");
  });

  test("an account that lost the property asks for connecting again, and its run says what to do", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t);
    const google = fakeGoogle(history(3));
    google.reportStatus = 403;
    await save(admin, siteId);
    await finishScheduled(t);
    expect(await connectionOf(t, connectionId)).toMatchObject({ status: "NEEDS_RECONNECT", problem: "NO_ACCESS" });
    const [run] = await runsOf(t);
    expect(run.status).toBe("FAILED");
    expect(run.finalOutput).toContain("Connect it again from its Google Analytics page");
  });

  test("another property's figures go before the new one's come in", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t);
    fakeGoogle(history(10));
    await save(admin, siteId);
    await finishScheduled(t);
    expect((await dayRows(t, siteId, "total", "", NEWEST))).toHaveLength(1);

    // Disconnected, signed in again, another property chosen: its figures are cleared, then collected afresh.
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { status: "COUNTING", property: "properties/999" }));
    await save(admin, siteId);
    expect((await connectionOf(t, connectionId))?.clearing).toBe(true);
    await finishScheduled(t);
    const connection = (await connectionOf(t, connectionId))!;
    expect(connection.clearing).toBeUndefined();
    expect(connection.dataProperty).toBe("properties/999");
    expect(await dayRows(t, siteId, "total", "", NEWEST)).toEqual([]);
  });
});
