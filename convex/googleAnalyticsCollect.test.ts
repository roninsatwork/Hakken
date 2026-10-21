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
import { KEPT_BACK, analyticsWindow, dueJobs, fetchedAfter, finishedDue, newestWholeDayIn, overBudget, periodRange } from "./googleAnalyticsCollect";
import { pageListJobs } from "./googleAnalyticsPageLists";
import { afterTheHour, jobKey, startGap, startingAt } from "./googleAnalyticsAgentRun";
import { closeConnection } from "./googleAnalyticsRunEnd";
import { googleDay, quotaStillSeen } from "./googleAnalyticsBudget";
import { days } from "./searchConsoleAgentRun";
import { shiftDay } from "./searchConsoleDays";
import { NEWEST, PROPERTY, dayOf, fakeGoogle, history, type Visit } from "@/src/test/googleAnalyticsFake";
import { FUNNEL_ACTIONS, actionsFrom } from "./googleAnalyticsActionFunnels";
import { funnelAsk } from "./googleAnalyticsLive";
import { COUNTED_WITH } from "./googleAnalyticsSchema";

/**
 * Collecting a website's Google Analytics, end to end with Google faked at the
 * network (docs/plans/active/google-analytics-plan.md §4): the first
 * collection started on saving what counts, the 92 days kept by device, the
 * ready-made lists asked of Google for the date menu's calendar periods, page
 * addresses numbered as Search Console's are, only what changed written again,
 * the daily run's few days, access lost, and another property's figures
 * cleared. On a fixed day, Friday 9 October 2026: Google's newest day is the
 * 8th, last week 28 September to 4 October, last month September's 30 days.
 * Nothing reaches Google.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** A website connected to Analytics with what counts read, ready to save; the agent created unless asked not to. */
/**
 * The finished periods already fetched and settled, on 9 October: for a test that reads none of them, so its runs ask
 * the periods still going alone (AGENTS.md: a test asks no more than its assertions read). Asking a finished period
 * once, again when settled, then not again, is `finishedDue`'s own test below.
 */
const FETCHED = [
  { key: "lastWeek", from: "2026-09-28", settled: true },
  { key: "lastMonth", from: "2026-09-01", settled: true },
  { key: "lastQuarter", from: "2026-07-01", settled: true },
];

async function connected(t: Harness, withAgent = true, fetched: boolean | typeof FETCHED = false) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "COUNTING", property: PROPERTY, propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: ["staging.acme-shop.test"],
      timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
      events: [
        { eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 14 },
        { eventName: "click_tel", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 6 },
      ],
      // Counted by Google's own counts already, or the first run would be a recount, which asks every period again.
      ...(fetched ? { periodsFetched: fetched === true ? FETCHED : fetched, countedWith: COUNTED_WITH } : {}),
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

/** The first night: the two-year fills follow its run (ga-big-site-reliability-plan.md BR7), started now. */
const firstNight = async (t: Harness, connectionId: Id<"googleAnalyticsConnections">) => {
  await t.mutation(internal.googleAnalyticsFillAfter.startFills, { connectionId });
  await finishScheduled(t);
};
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
  test("nothing held: the 92 days kept; held: the days since, and the two before again", () => {
    expect(newestWholeDayIn(NOW, "Europe/London")).toBe(NEWEST);
    // Before dawn in London it is still the day before in California, but Analytics keeps the property's own day.
    expect(newestWholeDayIn(Date.parse("2026-10-09T23:30:00Z"), "Europe/London")).toBe("2026-10-09");
    expect(analyticsWindow(undefined, undefined, NEWEST)).toEqual({ from: shiftDay(NEWEST, -91), top: NEWEST });
    expect(analyticsWindow("2026-10-07", shiftDay(NEWEST, -91), NEWEST)).toEqual({ from: "2026-10-06", top: NEWEST });
    // Two mornings missed: every day since the newest held, and two again.
    expect(analyticsWindow("2026-10-05", shiftDay(NEWEST, -91), NEWEST)).toEqual({ from: "2026-10-04", top: NEWEST });
    // Holding the 90 days first fetched before 92 were kept: collected — the two more fill in as the days roll on,
    // rather than every website fetching its days again (calendar-periods-plan.md).
    expect(analyticsWindow("2026-10-07", shiftDay(NEWEST, -89), NEWEST)).toEqual({ from: "2026-10-06", top: NEWEST });
    // A first collection that stopped with only its newest 20 days: all 92 again.
    expect(analyticsWindow(NEWEST, shiftDay(NEWEST, -19), NEWEST)).toEqual({ from: shiftDay(NEWEST, -91), top: NEWEST });
    // Held as 60 days before the 90 were kept (ga-stored-figures-plan.md SF2): the older fetched once.
    expect(analyticsWindow(NEWEST, shiftDay(NEWEST, -59), NEWEST)).toEqual({ from: shiftDay(NEWEST, -91), top: NEWEST });
  });

  test("each calendar period's dates on the property's own day: the days Google has sent, the span before, a year before", () => {
    // Thursday 8 October 2026 is the newest whole day. A period still going runs to it, set against the same days before.
    expect(periodRange("thisWeek", "NOW", NEWEST)).toEqual({ from: "2026-10-05", to: NEWEST });
    expect(periodRange("thisWeek", "BEFORE", NEWEST)).toEqual({ from: "2026-09-28", to: "2026-10-01" });
    expect(periodRange("thisMonth", "NOW", NEWEST)).toEqual({ from: "2026-10-01", to: NEWEST });
    expect(periodRange("thisMonth", "BEFORE", NEWEST)).toEqual({ from: "2026-09-01", to: "2026-09-08" });
    expect(periodRange("thisQuarter", "YEAR", NEWEST)).toEqual({ from: "2025-10-01", to: "2025-10-08" });
    expect(periodRange("thisYear", "NOW", NEWEST)).toEqual({ from: "2026-01-01", to: NEWEST });
    expect(periodRange("thisYear", "BEFORE", NEWEST)).toEqual({ from: "2025-01-01", to: "2025-10-08" });
    // A finished period whole, against the whole period before; the quarter against the same quarter a year before too.
    expect(periodRange("lastWeek", "NOW", NEWEST)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(periodRange("lastWeek", "BEFORE", NEWEST)).toEqual({ from: "2026-09-21", to: "2026-09-27" });
    expect(periodRange("lastMonth", "NOW", NEWEST)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("lastMonth", "BEFORE", NEWEST)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(periodRange("lastQuarter", "NOW", NEWEST)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(periodRange("lastQuarter", "BEFORE", NEWEST)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(periodRange("lastQuarter", "YEAR", NEWEST)).toEqual({ from: "2025-07-01", to: "2025-09-30" });
    // Weeks and months have no year before.
    expect(periodRange("lastMonth", "YEAR", NEWEST)).toBeNull();
    // Insights' 12 months a day end on the newest day.
    expect(periodRange("365", "NOW", NEWEST)).toEqual({ from: "2025-10-09", to: NEWEST });
    // Google has sent none of it yet: This Week on a Monday (its newest day the Sunday), This Month and This Quarter on the 1st.
    expect(periodRange("thisWeek", "NOW", "2026-10-11")).toBeNull();
    expect(periodRange("lastWeek", "NOW", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(periodRange("thisMonth", "NOW", "2026-09-30")).toBeNull();
    expect(periodRange("thisQuarter", "NOW", "2026-09-30")).toBeNull();
  });

  test("the periods still going each run, the finished ones due, and Insights' 12 months a day with the weekly lists", () => {
    // Sixteen lists each — every event, the campaigns and their words, Visitors' six, Insights' first channel and
    // landing pages by channel, and AI assistants' landing pages among them (§18.6.5, §18.6.6; insights-analyst-plan.md
    // I35, §8; ga-channel-pages-plan.md CH13). The charts read the days, weeks and months kept (ga-stored-figures-plan.md
    // SF12). Each period with its span before, the quarters a year before too: This Week 2, This Month 2, This Quarter
    // 3, This Year 2 — and, weekly, Insights' 12 months a day.
    const LISTS = 16;
    expect(dueJobs({ weeklyPeriodsAt: undefined }, NOW)).toHaveLength((2 + 2 + 3 + 2) * LISTS + 1);
    // Not weekly: This Week and This Month alone.
    const daily = dueJobs({ weeklyPeriodsAt: NOW - 24 * 60 * 60 * 1000 }, NOW);
    expect(daily).toHaveLength((2 + 2) * LISTS);
    expect(new Set(daily.map((job) => job.period))).toEqual(new Set(["thisWeek", "thisMonth"]));
    expect(daily.some((job) => job.list === "series")).toBe(false);

    // Nothing fetched yet: every finished period is due — Last Week 2, Last Month 2, Last Quarter 3 — beside the rest.
    const finished = finishedDue([], NEWEST);
    expect(finished).toEqual(["lastWeek", "lastMonth", "lastQuarter"]);
    const first = dueJobs({ weeklyPeriodsAt: undefined }, NOW, [], NEWEST, finished);
    expect(first).toHaveLength((2 + 2 + 3 + 2 + 2 + 2 + 3) * LISTS + 1);
    expect(first.filter((job) => job.period === "lastQuarter").map((job) => job.which)).toEqual([
      ...Array(LISTS).fill("NOW"), ...Array(LISTS).fill("BEFORE"), ...Array(LISTS).fill("YEAR"),
    ]);
    expect(first.filter((job) => job.list === "series")).toEqual([{ list: "series", period: "365", which: "NOW" }]);
    // A shop's products beside them.
    expect(dueJobs({ weeklyPeriodsAt: undefined, shop: true }, NOW, [], NEWEST, finished)).toHaveLength((2 + 2 + 3 + 2 + 2 + 2 + 3) * (LISTS + 1) + 1);

    // On the 1st, Google has sent none of This Month or This Quarter: they are not asked.
    const firstOfMonth = dueJobs({ weeklyPeriodsAt: undefined }, NOW, [], "2026-09-30");
    expect(new Set(firstOfMonth.map((job) => job.period))).toEqual(new Set(["thisWeek", "thisYear", "365"]));
    // On a Monday, none of This Week.
    expect(dueJobs({ weeklyPeriodsAt: undefined }, NOW, [], "2026-10-11").some((job) => job.period === "thisWeek")).toBe(false);

    // The shared page lists (ga-stored-figures-plan.md SF13) follow the same periods, each device's parts a job.
    const periodsOf = (jobs: ReturnType<typeof pageListJobs>) => [...new Set(jobs.map((job) => job.period))];
    expect(periodsOf(pageListJobs(false, [], NEWEST))).toEqual(["thisWeek", "thisMonth"]);
    expect(periodsOf(pageListJobs(true, [], NEWEST, finished))).toEqual(["thisWeek", "thisMonth", "thisQuarter", "thisYear", "lastWeek", "lastMonth", "lastQuarter"]);
    expect(periodsOf(pageListJobs(true, [], "2026-09-30"))).toEqual(["thisWeek", "thisYear"]);
    // Every device's parts with its readers by country and its devices; each device's without its devices.
    expect(pageListJobs(false, [], NEWEST).filter((job) => job.period === "thisWeek")).toHaveLength(15 + 3 * 14);
    // Another home country's finished periods are its own record: due only where its own key is.
    const fra = pageListJobs(true, ["fra"], NEWEST, ["lastMonth|fra"]);
    expect(periodsOf(fra.filter((job) => !job.country))).toEqual(["thisWeek", "thisMonth", "thisQuarter", "thisYear"]);
    expect(periodsOf(fra.filter((job) => job.country === "fra"))).toEqual(["thisWeek", "thisMonth", "thisQuarter", "thisYear", "lastMonth"]);
  });

  test("a finished period is asked once it ends, again once Google's figures settle two days later, then not again", () => {
    // Monday 12 October: Google's newest day is Sunday the 11th, so last week (5–11 October) has just ended. Last week
    // was held from the week before; last month and last quarter already held, settled.
    let fetched: Array<{ key: string; from: string; settled: boolean }> = [
      { key: "lastWeek", from: "2026-09-28", settled: true },
      { key: "lastMonth", from: "2026-09-01", settled: true },
      { key: "lastQuarter", from: "2026-07-01", settled: true },
    ];
    const night = (top: string) => {
      const due = finishedDue(fetched, top);
      fetched = fetchedAfter(fetched, due, top);
      return due;
    };
    expect(night("2026-10-11")).toEqual(["lastWeek"]);
    expect(fetched).toContainEqual({ key: "lastWeek", from: "2026-10-05", settled: false });
    // The next night, Google's figures for its last days still settling: kept as fetched.
    expect(night("2026-10-12")).toEqual([]);
    // Two days after it ended, settled: asked once more, and marked so.
    expect(night("2026-10-13")).toEqual(["lastWeek"]);
    expect(fetched).toContainEqual({ key: "lastWeek", from: "2026-10-05", settled: true });
    // Then kept, night after night, until the next week ends.
    for (const top of ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]) expect(night(top)).toEqual([]);
    expect(night("2026-10-18")).toEqual(["lastWeek"]);
    // The others untouched all the while.
    expect(fetched.filter((entry) => entry.key !== "lastWeek")).toEqual([
      { key: "lastMonth", from: "2026-09-01", settled: true },
      { key: "lastQuarter", from: "2026-07-01", settled: true },
    ]);

    // A run that missed the settling night asks it on the next; one first fetching a period already settled, once only.
    expect(finishedDue([{ key: "lastWeek", from: "2026-10-05", settled: false }], "2026-10-15")).toContain("lastWeek");
    const late = fetchedAfter([], ["lastMonth"], "2026-10-15");
    expect(late).toEqual([{ key: "lastMonth", from: "2026-09-01", settled: true }]);
    expect(finishedDue(late, "2026-10-16")).not.toContain("lastMonth");
    // Each other home country keeps its own record: the main one's fetched leaves another's due.
    expect(finishedDue(late, "2026-10-16", ["fra"])).toContain("lastMonth|fra");
  });
});

/**
 * A website whose shop sits on an address of its own (conversion-addresses-plan.md): each day a visit that landed on
 * /ai-agency/ from Google buys on the shop, the sale recorded on the shop's address; saved, and its first run collected.
 */
async function shopCollected(t: Harness, how: { refuseFunnelFields?: boolean } = {}) {
  const ids = await connected(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.connectionId, {
      events: [
        { eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 14 },
        { eventName: "purchase", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 },
      ],
      addressesRead: [{ host: "store.acme-shop.test", kind: "SAME_DOMAIN", reached: true, events: [{ eventName: "purchase", year: 70, month: 30 }] }],
    });
  });
  const sale = (date: string): Visit => ({
    date, device: "desktop", channel: "Organic Search", source: "google", landing: "/ai-agency/", page: "/checkout/", host: "store.acme-shop.test",
    sessions: 0, engaged: 0, seconds: 0, views: 2, purchases: 1, revenue: 150, events: { purchase: [1, 150] },
  });
  const google = fakeGoogle([...history(70), ...Array.from({ length: 70 }, (_, at) => sale(shiftDay(NEWEST, -at)))]);
  google.refuseFunnelFields = how.refuseFunnelFields;
  await ids.admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
    siteId: ids.siteId,
    events: [{ eventName: "generate_lead", counted: true, hakkenValue: 250 }, { eventName: "purchase", counted: true, hakkenValue: null }],
  });
  await finishScheduled(t);
  return { ...ids, google };
}

describe("collecting a website's Google Analytics", () => {
  test("saving what counts starts its first collection at once: the 92 days by device, then the ready-made lists", async () => {
    // Tuesday 6 October: Google's newest day is the 5th, so this quarter holds five days and tracking health reads last
    // quarter's pages. The fake log's three days after are never asked.
    vi.setSystemTime(Date.parse("2026-10-06T09:30:00Z"));
    const top = "2026-10-05";
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t);
    const google = fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);

    const runs = await runsOf(t);
    expect(runs.map((run) => [run.title, run.status])).toEqual([["Google Analytics: acme-shop.test", "SUCCESS"]]);
    expect(runs[0].finalOutput).toContain("Collected acme-shop.test");
    const connection = (await connectionOf(t, connectionId))!;
    expect(connection).toMatchObject({ status: "CONNECTED", newestDay: top, oldestDay: shiftDay(top, -91) });
    expect(connection.backfilledAt).toBeGreaterThan(0);
    expect(connection.weeklyPeriodsAt).toBeGreaterThan(0);
    expect(connection.collecting).toBeUndefined();

    // Every device's totals are the devices' added up; the other address is never read.
    const every = await dayRows(t, siteId, "total", "", top);
    expect(every).toHaveLength(1);
    expect(every[0]).toMatchObject({ visits: 16, engaged: 11, seconds: 590, views: 32 });
    expect(every[0].counts).toEqual({ generate_lead: 1, click_tel: 1 });
    expect((await dayRows(t, siteId, "total", "mobile", top))[0]).toMatchObject({ visits: 10 });
    const channels = await dayRows(t, siteId, "channel", "", top);
    expect(channels.map((row) => [splitChannelKey(row.key).channel, splitChannelKey(row.key).source, row.visits])).toEqual([
      ["Organic Search", "google", 10], ["Referral", "perplexity.ai", 4], ["Direct", "(direct)", 2],
    ]);
    // Nothing older than the 92 days kept was asked for.
    expect(await dayRows(t, siteId, "total", "", shiftDay(top, -92))).toEqual([]);
    // Each report was for the website's own address — but the weekly one of every address, for tracking health.
    const asks = google.calls.filter((call) => call.url.endsWith(":runReport"))
      .map((call) => JSON.parse(call.body) as { dimensions: { name: string }[]; dimensionFilter?: unknown })
      .filter((ask) => ask.dimensions[0]?.name !== "hostName");
    expect(asks.every((ask) => JSON.stringify(ask.dimensionFilter).includes("www.acme-shop.test"))).toBe(true);
    // Tracking health ran on the first collection: the other address is a stranger.
    expect((await connectionOf(t, connectionId))?.health?.checks.find((check) => check.check === "STRANGERS")).toMatchObject({ passing: false, names: ["staging.acme-shop.test"], count: 1500 });
    // Every page of the log is counted more than once a visit — /ai-agency/ 2.25 times — the most counted named first (phase 6):
    // last quarter's pages, while this quarter holds under a week.
    expect((await connectionOf(t, connectionId))?.health?.checks.find((check) => check.check === "COUNTED_AGAIN")).toMatchObject({ passing: false, names: ["/ai-agency/", "/", "/contact/"], count: 3 });

    // The landing pages' ready-made last month: numbered as Search Console's pages are, the query left off.
    const landing = (await periodRows(t, siteId, "landing|lastMonth|NOW|"))!;
    const addresses = await t.run(async (ctx) => await decodePages(ctx, siteId, landing.rows.map((row) => row.key)));
    expect(addresses).toEqual(["https://www.acme-shop.test/", "https://www.acme-shop.test/ai-agency/", "https://www.acme-shop.test/contact/"]);
    expect(landing.rows[0]).toMatchObject({ visits: 300, views: 600 });
    expect(landing.slot).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    // Every list a screen shows for one device is kept for each device (ga-stored-figures-plan.md SF3): the page lists
    // too, each device's own; every device asked whole, its people as Google counts them.
    expect(await periodRows(t, siteId, "total|lastWeek|NOW|mobile")).not.toBeNull();
    const mobile = (await periodRows(t, siteId, "landing|lastMonth|NOW|mobile"))!;
    const desktop = (await periodRows(t, siteId, "landing|lastMonth|NOW|desktop"))!;
    expect(mobile.rows[0].visits + (desktop.rows.find((row) => row.key === mobile.rows[0].key)?.visits ?? 0)).toBe(landing.rows.find((row) => row.key === mobile.rows[0].key)!.visits);
    // A landing page's channels for each device too (SF5); Insights' first channel only for every device.
    expect(await periodRows(t, siteId, "landingChannel|lastWeek|NOW|mobile")).not.toBeNull();
    expect(await periodRows(t, siteId, "firstChannel|lastWeek|NOW|mobile")).toBeNull();
    // The 12 months' chart, a day a row: the fake log's days to the newest.
    expect((await periodRows(t, siteId, "series|365|NOW|"))!.rows.length).toBe(67);
  });

  test("a shop on its own address: each sale credited to the visit's landing page and channel; visits, pages and other events the website's own", async () => {
    // conversion-addresses-plan.md: National Extension College's courses are bought on store.nec.ac.uk (2026-10-19).
    const t = harness();
    const { siteId, connectionId, google } = await shopCollected(t);
    expect((await runsOf(t)).map((run) => run.status)).toEqual(["SUCCESS"]);

    // The day: the website's own visits and views, the shop's sale and its revenue beside them.
    const every = (await dayRows(t, siteId, "total", "", NEWEST))[0];
    expect(every).toMatchObject({ visits: 16, views: 32, purchases: 1, revenue: 15_000 });
    expect(every.counts).toEqual({ generate_lead: 1, purchase: 1 });
    // Last month's landing pages: the sale credited to the page the visit landed on, its visits unmoved; no shop page.
    const landing = (await periodRows(t, siteId, "landing|lastMonth|NOW|"))!;
    const pages = await t.run(async (ctx) => await decodePages(ctx, siteId, landing.rows.map((row) => row.key)));
    const agency = landing.rows[pages.indexOf("https://www.acme-shop.test/ai-agency/")];
    expect(agency).toMatchObject({ visits: 120, purchases: 30, revenue: 450_000 });
    expect(agency.counts).toMatchObject({ purchase: 30 });
    expect(pages.some((page) => page.includes("checkout"))).toBe(false);
    // The channel too: the sale is Google's.
    const channels = (await periodRows(t, siteId, "channel|lastMonth|NOW|"))!.rows;
    expect(channels.find((row) => splitChannelKey(row.key).channel === "Organic Search")).toMatchObject({ visits: 300, purchases: 30 });
    // A page's own figures are what happened on it: the shop's checkout is never one of the website's pages.
    const allPages = (await periodRows(t, siteId, "page|lastMonth|NOW|"))!;
    const pageAddresses = await t.run(async (ctx) => await decodePages(ctx, siteId, allPages.rows.map((row) => row.key)));
    expect(pageAddresses.some((page) => page.includes("checkout"))).toBe(false);
    expect(allPages.rows.every((row) => (row.counts.purchase ?? 0) === 0)).toBe(true);
    // Every event: the sales on the shop counted, the website's page views its own.
    const events = (await periodRows(t, siteId, "event|lastMonth|NOW|"))!.rows;
    expect(events.find((row) => row.key === "purchase")).toMatchObject({ times: 30 });
    expect(events.find((row) => row.key === "page_view")).toMatchObject({ times: 960 });
    // The shop's sales are asked apart, on both addresses; no visits are ever asked of the shop.
    const asks = google.calls.filter((call) => call.url.endsWith(":runReport")).map((call) => JSON.parse(call.body) as { metrics: { name: string }[]; dimensionFilter?: unknown });
    const onShop = asks.filter((ask) => JSON.stringify(ask.dimensionFilter ?? "").includes("store.acme-shop.test"));
    expect(onShop.some((ask) => ask.metrics.map((metric) => metric.name).join() === "ecommercePurchases,purchaseRevenue")).toBe(true);
    expect(onShop.some((ask) => ask.metrics.some((metric) => metric.name === "screenPageViews"))).toBe(false);
    // "People who converted after it": the conversion step on the shop too, the first step on the website alone.
    const funnels = google.calls.filter((call) => call.url.endsWith(":runFunnelReport")).map((call) => JSON.parse(call.body) as { funnel: { steps: { filterExpression: unknown }[] } });
    expect(funnels.length).toBeGreaterThan(0);
    expect(JSON.stringify(funnels[0].funnel.steps[0])).not.toContain("store.acme-shop.test");
    expect(JSON.stringify(funnels[0].funnel.steps[1])).toContain("store.acme-shop.test");
    // The shop is the website's own: never a stranger in tracking health.
    expect((await connectionOf(t, connectionId))?.health?.checks.find((check) => check.check === "STRANGERS")?.names ?? []).not.toContain("store.acme-shop.test");
  });

  test("Google refusing a funnel held to the shop's address: asked the old way at once, the figure kept, and the run says so", async () => {
    const t = harness();
    const { google } = await shopCollected(t, { refuseFunnelFields: true });
    const run = (await runsOf(t))[0];
    expect(run.status).toBe("SUCCESS");
    const funnels = google.calls.filter((call) => call.url.endsWith(":runFunnelReport")).map((call) => call.body);
    // Each funnel asked held to its addresses, refused, then asked on the website's own address.
    expect(funnels.length).toBeGreaterThanOrEqual(2);
    expect(funnels[0]).toContain("funnelFieldFilter");
    expect(funnels[1]).not.toContain("funnelFieldFilter");
    expect(funnels[1]).toContain("www.acme-shop.test");
    const live = await t.run(async (ctx) => await ctx.db.query("googleAnalyticsLive").collect());
    expect(JSON.stringify(live)).not.toContain("refused");
    const lines = await t.run(async (ctx) => (await ctx.db.query("agentRunSteps").collect()).filter((step) => step.runId === run._id).map((step) => step.output ?? ""));
    expect(lines.some((line) => line.includes("conversions on store.acme-shop.test") && line.includes("website's own address"))).toBe(true);
  });

  test("a run that began before the counted addresses moved never marks its figures counted: the next run collects them again, whole", async () => {
    const t = harness();
    const { connectionId, companyId, agentId } = await connected(t);
    const runAt = async (startedAt: number) => await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId: agentId!, triggerType: "EVENT", objective: "Collect", title: "Google Analytics: acme-shop.test", status: "RUNNING", companyId, startedAt, updatedAt: startedAt,
    }));
    const close = async (runId: Id<"agentRuns">) => await t.run(async (ctx) => {
      await closeConnection(ctx, { connectionId, property: PROPERTY, reached: "WHOLE", weekly: false, recount: true, fills: false, runId });
    });
    await t.run(async (ctx) => { await ctx.db.patch(connectionId, { status: "CONNECTED", addressesMovedAt: NOW - 60_000 }); });
    // Begun before the move: its days were collected the old way.
    await close(await runAt(NOW - 120_000));
    expect((await connectionOf(t, connectionId))?.countedWith).toBeUndefined();
    // Begun after it: every figure counted the new way.
    await close(await runAt(NOW - 30_000));
    expect((await connectionOf(t, connectionId))?.countedWith).toBe("EVENT_COUNT");
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

  test("the daily run: a run per website, the newest days again, lists whose figures did not move left as they were, each action's funnel", async () => {
    const t = harness();
    const { siteId, connectionId, admin, agentId } = await connected(t, true, true);
    // On the home page people also scroll, an action that is not a conversion.
    const google = fakeGoogle(history(70).map((visit) => (visit.landing === "/" && !visit.host ? { ...visit, events: { ...visit.events, scroll: [3, 0] } } : visit)));
    await save(admin, siteId);
    await finishScheduled(t);
    await firstNight(t, connectionId);
    const before = (await periodRows(t, siteId, "landing|thisQuarter|NOW|"))!.slot;

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
    // Three days asked, by device: each day fact (ga-stored-figures-plan.md SF12) — two asks each for the totals, the
    // channels, the campaigns and new and returning people, one for the events, which count every event themselves.
    const dayAsks = google.calls.slice(asked)
      .filter((call) => call.url.endsWith(":runReport"))
      .map((call) => JSON.parse(call.body) as { dateRanges: { startDate: string; endDate: string }[]; dimensions: { name: string }[] })
      .filter((ask) => ask.dimensions[0]?.name === "date" && ask.dimensions[1]?.name === "deviceCategory")
      // Each page's days (ga-stored-figures-plan.md SF5) are asked beside them, once its two years are filled.
      .filter((ask) => !ask.dimensions.some((dimension) => dimension.name === "landingPage" || dimension.name === "pagePath"));
    expect(dayAsks.map((ask) => ask.dateRanges[0])).toEqual(Array(9).fill({ startDate: "2026-10-07", endDate: "2026-10-09" }));
    // Every period still going every night (Anthony, 2026-10-14: "I want everything once a day"): this quarter moved on
    // a day too, rebuilt into the other slot.
    expect((await periodRows(t, siteId, "landing|thisQuarter|NOW|"))!.slot.to).toBe("2026-10-09");
    expect((await periodRows(t, siteId, "landing|thisQuarter|NOW|"))!.slot.slot).not.toBe(before.slot);
    // This week moved on a day.
    expect((await periodRows(t, siteId, "total|thisWeek|NOW|"))!.slot.to).toBe("2026-10-09");
    // The finished periods, fetched and settled before, are not asked again (`finishedDue`'s own test).
    expect(await periodRows(t, siteId, "landing|lastMonth|NOW|")).toBeNull();
    // The events' 12 months held since the first night's fill: scrolling's funnel over 12 months, every device, kept
    // where an event's own screen reads it (CV4, SF16), beside the website's own rate.
    const funnel = await t.run(async (ctx) => await ctx.db
      .query("googleAnalyticsLive")
      .withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", siteId).eq("ask", funnelAsk("scroll", "365", "")))
      .collect());
    expect(plain(funnel.flatMap((part) => unpackPart(part))).map((row) => [row.key, row.people])).toEqual([["did", 140], ["then", 140]]);
    expect(google.calls.slice(asked).filter((call) => call.url.endsWith(":runFunnelReport")).length).toBe(2);
  });

  test("a website counted the old way is collected again, whole, by Google's own counts, once; Insights' old months go", async () => {
    // conversions-back-in-time-plan.md BT1, BT4, BT6: a website collected before is redone, whole, and marked. Its first
    // collection here is already counted Google's way and has its finished periods, so it asks the periods still going
    // alone: the redone collection is this test's subject, and the first one's every period took it past five seconds.
    const t = harness();
    // Collected first, then redone an hour later, on Friday 1 January, when This Month, This Quarter and This Year hold
    // no days: the first collection asks This Week, the redone one This Week and the three finished periods, all again
    // by Google's own counts.
    const FIRST = Date.parse("2027-01-01T09:30:00Z");
    const HOUR = 60 * 60 * 1000;
    vi.setSystemTime(FIRST);
    const { siteId, connectionId, admin, agentId } = await connected(t, true, [
      { key: "lastWeek", from: "2026-12-21", settled: true },
      { key: "lastMonth", from: "2026-12-01", settled: true },
      { key: "lastQuarter", from: "2026-10-01", settled: true },
    ]);
    // Its two years noted as filled already: nothing here reads them, and the fill took this test past five seconds.
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, { historyFrom: "2024-10-01", historyFilled: ["total", "channel", "event", "campaign", "visitorType"], pageHistoryFrom: "2024-10-01", pageChannelsFrom: "2024-10-01" });
    });
    const google = fakeGoogle(history(70, "2026-12-31"));
    await save(admin, siteId);
    await finishScheduled(t);
    // Every list's counted events are asked by Google's own counts and visits, never by the key-event count.
    const eventAsks = google.calls.filter((call) => call.url.endsWith(":runReport"))
      .map((call) => JSON.parse(call.body) as { dimensions: { name: string }[]; metrics: { name: string }[] })
      .filter((ask) => ask.dimensions.some((dimension) => dimension.name === "eventName"));
    expect(eventAsks.length).toBeGreaterThan(0);
    expect(eventAsks.some((ask) => ask.metrics.some((metric) => metric.name === "keyEvents"))).toBe(false);

    // As every website was before 2026-10-13: counted the old way, with Insights' months held.
    vi.setSystemTime(FIRST + HOUR);
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, { countedWith: undefined });
      await ctx.db.insert("insightHistory", { companyWebsiteId: siteId, kind: "GA_PAGES", month: "2026-08", from: "2026-08-01", to: "2026-08-31", rows: [], fetchedAt: 1 });
      await ctx.db.insert("insightHistory", { companyWebsiteId: siteId, kind: "GA_SOURCES", month: "2026-08", from: "2026-08-01", to: "2026-08-31", rows: [], fetchedAt: 1 });
    });
    const asked = google.calls.length;
    const daily = () => t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId: agentId!, triggerType: "SCHEDULE", objective: "Collect", title: "Google Analytics: Data Collection Scheduler",
      status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId: await daily() });
    await finishScheduled(t);
    const dayRanges = (from: number) => google.calls.slice(from)
      .filter((call) => call.url.endsWith(":runReport"))
      .map((call) => JSON.parse(call.body) as { dateRanges: { startDate: string; endDate: string }[]; dimensions: { name: string }[] })
      .filter((ask) => ask.dimensions[0]?.name === "date" && ask.dimensions[1]?.name === "deviceCategory")
      // Each page's days (ga-stored-figures-plan.md SF5) apart.
      .filter((ask) => !ask.dimensions.some((dimension) => dimension.name === "landingPage" || dimension.name === "pagePath"))
      .map((ask) => ask.dateRanges[0]);
    // The 92 days kept, all again, a week at a time, and the weekly lists though a week has not passed.
    const again = dayRanges(asked);
    expect([again.map((range) => range.startDate).sort()[0], again.map((range) => range.endDate).sort().at(-1)]).toEqual(["2026-10-01", "2026-12-31"]);
    const redone = (await connectionOf(t, connectionId))!;
    expect(redone.countedWith).toBe("EVENT_COUNT");
    expect(redone.weeklyPeriodsAt).toBe(FIRST + HOUR);
    // Insights' month kept month by month goes, to be asked again; one asked whole each run stays.
    const kinds = await t.run(async (ctx) => (await ctx.db.query("insightHistory").collect()).map((record) => record.kind));
    expect(kinds).toEqual(["GA_SOURCES"]);

    // Once only: the next morning's run is the usual few days, not the whole again. Its own run is planned and
    // not carried out: what a run of those days asks of Google is the daily run's test, above, and a third whole
    // collection here took this test past the five-second budget (2026-10-15).
    vi.setSystemTime(FIRST + 24 * HOUR);
    await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId: await daily() });
    const nextMorning = (await runsOf(t)).filter((run) => run.title === "Google Analytics: acme-shop.test").at(-1)!;
    expect(nextMorning.objective).not.toContain("again, whole");
    expect(nextMorning.objective).toContain(`its days ${days("2026-12-30", "2027-01-01")}, then its ready-made lists`);
  });

  test("a first, weekly-size run keeps inside Google's allowances: never refused, it waits for the hour and carries on", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t);
    const google = fakeGoogle(history(70));
    // Google's 120 asks an hour of age, gender and interests, counted as the real one counts them (ga-stored-figures-plan.md §2c).
    google.allowance = { thresholdedPerHour: 120, tokensPerAsk: 1 };
    await save(admin, siteId);
    await finishScheduled(t);

    // About 300 such asks — every period still going and the three just finished, each with its span before — never more
    // than the run's budget in an hour, and none refused.
    expect(google.refused).toBe(0);
    const hours = [...google.spent.values()].map((hour) => hour.thresholded);
    expect(Math.max(...hours)).toBeLessThanOrEqual(120 - KEPT_BACK.thresholdedPerHour);
    expect(hours.reduce((sum, count) => sum + count, 0)).toBeGreaterThan(120);
    const site = (await runsOf(t)).find((run) => run.title === "Google Analytics: acme-shop.test")!;
    expect(site.status).toBe("SUCCESS");
    const lines = await t.run(async (ctx) => (await ctx.db.query("agentRunSteps").collect()).filter((step) => step.runId === site._id).map((step) => step.output ?? ""));
    expect(lines.some((line) => line.includes("Nothing more is asked of Google until"))).toBe(true);
    // Every list built, the last of them hours later.
    expect((await periodRows(t, siteId, "pageWho|thisYear|NOW|tablet"))).not.toBeNull();
    expect((await periodRows(t, siteId, "pageWho|lastQuarter|NOW|tablet"))).not.toBeNull();
    expect((await connectionOf(t, connectionId))?.weeklyPeriodsAt).toBeDefined();
  });

  test("every night's run collects everything, inside Google's allowances: about two hours, never refused", async () => {
    const t = harness();
    const { siteId, admin, agentId } = await connected(t, true, true);
    const google = fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    google.allowance = { thresholdedPerHour: 120, tokensPerAsk: 1 };
    const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId: agentId!, triggerType: "SCHEDULE", objective: "Collect", title: "Google Analytics: Data Collection Scheduler",
      status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId });
    await finishScheduled(t);
    expect(google.refused).toBe(0);
    expect(google.spent.size).toBe(2);
    expect(Math.max(...[...google.spent.values()].map((hour) => hour.thresholded))).toBeLessThanOrEqual(120 - KEPT_BACK.thresholdedPerHour);
    expect((await periodRows(t, siteId, "pageWho|thisYear|NOW|tablet"))!.slot.to).toBe("2026-10-09");
  });

  test("Google refusing for the hour (another tool used the allowance): the run asks nothing for an hour, then carries on", async () => {
    const t = harness();
    const { siteId, admin, agentId } = await connected(t, true, true);
    const google = fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    google.refusing = {
      when: "userAgeBracket", times: 1, status: 429,
      message: "Exhausted potentially thresholded requests quota. This quota will refresh in under an hour.",
    };
    const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId: agentId!, triggerType: "SCHEDULE", objective: "Collect", title: "Google Analytics: Data Collection Scheduler",
      status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId });
    const asked = google.calls.length;
    await finishScheduled(t);

    const site = (await runsOf(t)).filter((run) => run.title === "Google Analytics: acme-shop.test").at(-1)!;
    expect(site.status).toBe("SUCCESS");
    // Refused once, not asked again a few seconds later: the next ask of Google comes an hour later.
    const reports = google.calls.slice(asked).filter((call) => call.url.endsWith(":runReport"));
    const refusedAt = reports.findIndex((call) => call.body.includes("userAgeBracket"));
    expect(reports[refusedAt + 1].at - reports[refusedAt].at).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  test("a run the night is too short for stops when it is over, and leaves the rest to the next night", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t);
    const google = fakeGoogle(history(70));
    // An allowance so small the weekly lists would take many hours.
    google.allowance = { thresholdedPerHour: 25, tokensPerAsk: 1 };
    await save(admin, siteId);
    await finishScheduled(t);
    expect(google.refused).toBe(0);
    const site = (await runsOf(t)).find((run) => run.title === "Google Analytics: acme-shop.test")!;
    expect(site.status).toBe("SUCCESS");
    expect(site.finalOutput).toContain("as far as the night allowed");
    expect(google.spent.size).toBeLessThanOrEqual(6);
    // Cut short, it still ends as collected, free of Google (the audit of 2026-10-14): the run no longer reads as
    // going, and the next night's lists start where this one stopped, so the last lists are never always left out.
    const connection = (await connectionOf(t, connectionId))!;
    expect(connection.lastCollectedAt).toBeDefined();
    expect(connection.collecting).toBeUndefined();
    expect(connection.listsFrom).toBeDefined();
  });

  test("a run starts from what Google last said is left: with the day's allowance used, it asks Google nothing", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t);
    const google = fakeGoogle(history(70));
    // Another tool used the property's day: Google said so a minute ago, on the last answer anyone had.
    await t.run(async (ctx) => await ctx.db.patch(connectionId, {
      quotaSeen: { at: Date.now() - 60_000, tokensPerDay: 1_000, tokensPerHour: 30_000, tokensPerProjectPerHour: 10_000, thresholdedPerHour: 100 },
    }));
    await save(admin, siteId);
    await finishScheduled(t);
    expect(google.calls.filter((call) => call.url.endsWith(":runReport"))).toHaveLength(0);
    const site = (await runsOf(t)).find((run) => run.title === "Google Analytics: acme-shop.test")!;
    expect(site.finalOutput).toContain("as far as the night allowed");
    expect(site.finalOutput).toContain("today");
  });

  test("what Google said is left holds for ten minutes, and the day's until Google's day turns", () => {
    const seen = { at: Date.parse("2026-10-14T10:00:00Z"), tokensPerDay: 5_000, tokensPerHour: 7_000, tokensPerProjectPerHour: 2_000, thresholdedPerHour: 10 };
    expect(quotaStillSeen(null, seen.at)).toBeNull();
    // One step of a run following another keeps to it.
    expect(quotaStillSeen(seen, seen.at + 9 * 60_000)).toEqual({ tokensPerDay: 5_000, tokensPerHour: 7_000, tokensPerProjectPerHour: 2_000, thresholdedPerHour: 10 });
    // Past ten minutes — a run back from waiting for the hour, above all — the hour's counts are Google's to say again;
    // the day's still hold (03:00 in California). A count kept for the whole hour cost a run a second hour on 2026-10-14.
    expect(quotaStillSeen(seen, seen.at + 11 * 60_000)).toEqual({ tokensPerDay: 5_000, tokensPerHour: null, tokensPerProjectPerHour: null, thresholdedPerHour: null });
    expect(quotaStillSeen(seen, seen.at + 62 * 60_000)).toEqual({ tokensPerDay: 5_000, tokensPerHour: null, tokensPerProjectPerHour: null, thresholdedPerHour: null });
    // Google's day turns at midnight Pacific: 07:00 UTC in October.
    expect(googleDay(Date.parse("2026-10-14T06:59:00Z"))).toBe("2026-10-13");
    expect(googleDay(Date.parse("2026-10-14T07:00:00Z"))).toBe("2026-10-14");
    expect(quotaStillSeen(seen, Date.parse("2026-10-15T07:30:00Z"))).toBeNull();
  });

  test("the night's run keeps what Conversions and Visitors draw: visits that converted, visitors by landing page, the website's funnel", async () => {
    const t = harness();
    const { siteId, admin } = await connected(t);
    // On the home page people also scroll, an action that is not a conversion, and come on Safari, a Mac and with an interest.
    const google = fakeGoogle(history(70).map((visit) => (visit.landing === "/" && !visit.host
      ? { ...visit, events: { ...visit.events, scroll: [3, 0] }, browser: "Safari", system: "Macintosh", interest: "Technology" }
      : visit)));
    await save(admin, siteId);
    await finishScheduled(t);

    // Landing pages by channel for the dates now: each row's visits that made a listed event, once each (CV8) — last
    // month's one lead a day from search and one call a day from the referral, none from the typed-in visits.
    const byChannel = (rows: Array<{ key: string; visits: number; converting?: number }>) =>
      Object.fromEntries(rows.map((row) => [splitChannelKey(row.key).source, [row.visits, row.converting]]));
    expect(byChannel((await periodRows(t, siteId, "landingChannel|lastMonth|NOW|"))!.rows)).toEqual({ "Organic Search": [300, 30], Referral: [120, 30], Direct: [60, 0] });
    expect(byChannel((await periodRows(t, siteId, "landingChannel|lastMonth|NOW|mobile"))!.rows)).toEqual({ "Organic Search": [300, 30] });
    // The span before is compared by no screen's flow: not asked.
    expect((await periodRows(t, siteId, "landingChannel|lastMonth|BEFORE|"))!.rows.every((row) => row.converting === undefined)).toBe(true);

    // Each landing page by browser and operating system with its key events; by interests without them (CV8, CV10).
    const browsers = (await periodRows(t, siteId, "landingBrowser|lastMonth|NOW|"))!.rows;
    expect(browsers.find((row) => splitChannelKey(row.key).source === "Safari")).toMatchObject({ visits: 300, counts: { generate_lead: 30, click_tel: 0 } });
    expect((await periodRows(t, siteId, "landingSystem|lastMonth|NOW|mobile"))!.rows.map((row) => [splitChannelKey(row.key).source, row.visits])).toEqual([["Macintosh", 300]]);
    const interests = (await periodRows(t, siteId, "landingInterest|thisYear|NOW|"))!.rows;
    expect(interests.find((row) => splitChannelKey(row.key).source === "Technology")).toMatchObject({ visits: 700, counts: {} });

    // The website's own rate over 12 months, from everyone who started a visit, and scrolling's funnel, every device,
    // kept where an event's own screen reads them (CV4, SF16). Before the two-year fill holds the events' months, the
    // actions are this year's busiest from Google's own list, which the run has just fetched (calendar-periods-plan.md).
    const funnelOf = (action: string) => t.run(async (ctx) => await ctx.db
      .query("googleAnalyticsLive")
      .withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", siteId).eq("ask", funnelAsk(action, "365", "")))
      .collect());
    expect(await funnelOf("session_start")).not.toEqual([]);
    expect(plain((await funnelOf("scroll")).flatMap((part) => unpackPart(part))).map((row) => [row.key, row.people])).toEqual([["did", 140], ["then", 140]]);

    // What the night asks for them: the visits that converted twice a date range now (by device and whole), each new list
    // once a date range and device — the browser and system with the key events, twice — and the website's funnel. Seven
    // date ranges now on 9 October: the four periods still going and the three just finished, each asked once.
    const RANGES = 7;
    const asks = google.calls.filter((call) => call.url.endsWith(":runReport")).map((call) => JSON.parse(call.body) as { dimensions: { name: string }[]; metrics: { name: string }[] });
    const named = (ask: (typeof asks)[number]) => ask.dimensions.map((dimension) => dimension.name);
    expect(asks.filter((ask) => named(ask).includes("sessionDefaultChannelGroup") && named(ask).includes("landingPage") && ask.metrics.length === 1).length).toBe(RANGES * 2);
    expect(asks.filter((ask) => named(ask).includes("landingPage") && named(ask).includes("browser")).length).toBe(RANGES * 4 * 2);
    expect(asks.filter((ask) => named(ask).includes("landingPage") && named(ask).includes("operatingSystem")).length).toBe(RANGES * 4 * 2);
    expect(asks.filter((ask) => named(ask).includes("landingPage") && named(ask).includes("brandingInterest")).length).toBe(RANGES * 4);
    expect(google.calls.filter((call) => call.url.endsWith(":runFunnelReport")).length).toBe(2);
  });

  test("the actions asked a funnel: the busiest by people, never a conversion or what every visit has, ten at most", () => {
    const rows = [
      { key: "page_view", people: 900 }, { key: "session_start", people: 800 }, { key: "generate_lead", people: 40 },
      { key: "scroll", people: 300 }, { key: "file_download", people: 30 }, { key: "click", people: 30 }, { key: "video_start", people: 0 },
      ...Array.from({ length: 12 }, (_, at) => ({ key: `custom_${String(at).padStart(2, "0")}`, people: 10 })),
    ];
    const actions = actionsFrom(rows, ["generate_lead"]);
    expect(actions).toHaveLength(FUNNEL_ACTIONS);
    expect(actions.slice(0, 4)).toEqual(["scroll", "click", "file_download", "custom_00"]);
    expect(actions).not.toContain("page_view");
    expect(actions).not.toContain("generate_lead");
    expect(actionsFrom(rows, ["generate_lead"]).includes("video_start")).toBe(false);
  });

  test("the next night's lists start where a run cut short stopped, then come round to the rest", () => {
    const lists = [
      { list: "page", period: "thisWeek", which: "NOW" },
      { list: "page", period: "thisMonth", which: "NOW" },
      { pages: true, period: "thisQuarter", device: "" },
    ] as Parameters<typeof startingAt>[0];
    expect(startingAt(lists, undefined)).toEqual(lists);
    expect(startingAt(lists, jobKey(lists[2]))).toEqual([lists[2], lists[0], lists[1]]);
    // A list gone since keeps the usual order; the same list's key is the same whatever order its fields were set in.
    expect(startingAt(lists, "gone")).toEqual(lists);
    expect(jobKey({ which: "NOW", period: "thisWeek", list: "page" } as (typeof lists)[0])).toBe(jobKey(lists[0]));
  });

  test("the budget, the hour's turn and the websites' start gaps", () => {
    expect(overBudget(null, true)).toBeNull();
    const left = { tokensPerDay: 150_000, tokensPerHour: 30_000, tokensPerProjectPerHour: 10_000, thresholdedPerHour: 20 };
    expect(overBudget(left, true)).toContain("Google says 20 are left");
    expect(overBudget(left, false)).toBeNull();
    expect(overBudget({ ...left, tokensPerProjectPerHour: 2_800 }, false)).toContain("Google says 2800 of the platform's own are left");
    // A fifth of each kept in hand (AGENTS.md, "Respect Google's quotas").
    expect(overBudget({ ...left, tokensPerDay: 40_000 }, false)).toContain("today");
    expect(overBudget({ ...left, tokensPerHour: 8_000 }, false)).toContain("this hour");
    // Google's hourly allowances refresh within an hour, not on the clock's hour: an hour and two minutes after.
    expect(new Date(afterTheHour(Date.parse("2026-10-14T03:41:00Z"))).toISOString()).toBe("2026-10-14T04:43:00.000Z");
    expect(startGap(1)).toBe(2 * 60 * 1000);
    expect(startGap(100)).toBe(7_200);
    expect(startGap(10_000)).toBe(5_000);
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
    await firstNight(t, connectionId);
    expect((await dayRows(t, siteId, "total", "", NEWEST))).toHaveLength(1);
    expect((await connectionOf(t, connectionId))?.historyFilled).toContain("channel");

    // Disconnected, signed in again, another property chosen: its figures are cleared, then collected afresh.
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { status: "COUNTING", property: "properties/999" }));
    await save(admin, siteId);
    expect((await connectionOf(t, connectionId))?.clearing).toBe(true);
    await finishScheduled(t);
    const connection = (await connectionOf(t, connectionId))!;
    expect(connection.clearing).toBeUndefined();
    expect(connection.dataProperty).toBe("properties/999");
    expect(await dayRows(t, siteId, "total", "", NEWEST)).toEqual([]);
    // The old property's fill marks go with its figures, so the new property's two years are filled once its days are in
    // (the audit of 2026-10-14: a mark left behind kept the fill from ever running again).
    expect(connection.historyFilled).toBeUndefined();
    expect(connection.historyFrom).toBeUndefined();
  });
});
