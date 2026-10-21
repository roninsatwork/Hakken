import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { unpackPart } from "./googleAnalyticsLists";
import { dueJobs } from "./googleAnalyticsCollect";
import { PROPERTY, fakeGoogle, history, type Visit } from "@/src/test/googleAnalyticsFake";

/**
 * Google Analytics keeps a website's home countries, and only those
 * (docs/plans/active/google-analytics-plan.md §18.6.1): every ask filtered to
 * one, the main one kept as before, each other kept as its own ready-made
 * lists and read when chosen, the figures cleared and collected again when
 * the main one changes, and a country taken off cleared. On a fixed day, 9
 * October 2026: last month is September's 30 days. Google faked.
 */

// Friday 1 January 2027: Google's newest day is 31 December, so This Month, This Quarter and This Year hold no days yet
// and the runs ask This Week and Last Month — December's 31 days, which these tests read — and little else
// (AGENTS.md: a test asks no more than its assertions read).
const NOW = Date.parse("2027-01-01T09:30:00Z");
const TOP = "2026-12-31";
/** Last month's days: December's. */
const DAYS = 31;
/** The finished periods the tests don't read, fetched already: last week from 21 December, last quarter from 1 October. */
const FETCHED = ["", "|fra"].flatMap((country) => [
  { key: `lastWeek${country}`, from: "2026-12-21", settled: true },
  { key: `lastQuarter${country}`, from: "2026-10-01", settled: true },
]);

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** A website connected to Analytics with what counts read, its home countries as given (none: the United Kingdom). */
async function connected(t: Harness, countries?: string[]) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship: "OWNED", createdAt: 1, ...(countries ? { searchConsoleCountries: countries } : {}),
    });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "COUNTING", property: PROPERTY, propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: ["staging.acme-shop.test"],
      timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
      events: [{ eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 14 }],
      // Last week and last quarter already fetched and settled, for both home countries: these tests read last month,
      // so the runs ask the periods still going and last month alone (AGENTS.md: cut what the assertions don't read).
      periodsFetched: FETCHED,
      createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    const agentId = await ctx.db.insert("agents", {
      name: "Google Analytics: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true,
      systemKey: "GOOGLE_ANALYTICS_COLLECTOR", createdAt: 1, updatedAt: 1,
    });
    return { siteId, connectionId, agentId, adminId };
  }).then((ids) => ({ ...ids, admin: t.withIdentity({ subject: ids.adminId }) }));
}

const save = (admin: ReturnType<Harness["withIdentity"]>, siteId: Id<"companyWebsites">) =>
  admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, { siteId, events: [{ eventName: "generate_lead", counted: true, hakkenValue: 250 }] });

/** The daily run, as the schedule starts it. */
async function dailyRun(t: Harness, agentId: Id<"agents">) {
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "SCHEDULE", objective: "Collect", title: "Google Analytics: Data Collection Scheduler",
    status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId });
  await finishScheduled(t);
}

/** A ready-made list's visits, read through its slot as a screen does; null when it is not kept. */
const visitsIn = (t: Harness, siteId: Id<"companyWebsites">, key: string) =>
  t.run(async (ctx) => {
    const slot = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", siteId).eq("key", key)).first();
    if (!slot) return null;
    const parts = await ctx.db
      .query("googleAnalyticsPeriods")
      .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", siteId).eq("key", key).eq("slot", slot.slot))
      .collect();
    return parts.flatMap((part) => unpackPart(part)).reduce((sum, row) => sum + row.visits, 0);
  });

const keysOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => (await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", siteId)).collect()).map((slot) => slot.key));

/** France's visits: three a day on the home page, from Google, on a phone. */
function fromFrance(days: number): Visit[] {
  const out: Visit[] = [];
  for (let at = 0; at < days; at += 1) {
    const date = new Date(Date.parse(`${TOP}T00:00:00Z`) - at * 86_400_000).toISOString().slice(0, 10);
    out.push({ date, device: "mobile", channel: "Organic Search", source: "google", landing: "/", page: "/", country: "FR", sessions: 3, engaged: 1, seconds: 30, views: 5 });
  }
  return out;
}

// The United Kingdom's visits a day in the fake property, on the website's own address.
const UK_A_DAY = 16;

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

describe("home countries", () => {
  test("every ask is the main home country's: a visit from anywhere else is never counted", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t);
    const google = fakeGoogle([...history(70, TOP), ...fromFrance(70)]);
    await save(admin, siteId);
    await finishScheduled(t);

    const asks = google.calls.filter((call) => call.url.endsWith(":runReport"))
      .map((call) => JSON.parse(call.body) as { dimensions: { name: string }[]; dimensionFilter?: unknown })
      .filter((ask) => ask.dimensions[0]?.name !== "hostName")
      // A page's readers by country are in every country, whatever the home country (analytics-page-screen-plan.md PS8).
      .filter((ask) => !ask.dimensions.some((dimension) => dimension.name === "countryId"));
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every((ask) => JSON.stringify(ask.dimensionFilter).includes('"fieldName":"countryId","inListFilter":{"values":["GB"]'))).toBe(true);
    expect(await visitsIn(t, siteId, "total|lastMonth|NOW|")).toBe(DAYS * UK_A_DAY);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.mainCountry).toBe("gbr");
    // A website with one home country keeps no other's.
    expect((await keysOf(t, siteId)).some((key) => key.split("|").length > 4)).toBe(false);
  });

  test("another home country is kept as its own ready-made lists, its chart among them, and its screens read them", async () => {
    const t = harness();
    const { siteId, admin } = await connected(t, ["gbr", "fra"]);
    fakeGoogle([...history(70, TOP), ...fromFrance(70)]);
    await save(admin, siteId);
    await finishScheduled(t);

    expect(await visitsIn(t, siteId, "total|lastMonth|NOW|")).toBe(DAYS * UK_A_DAY);
    expect(await visitsIn(t, siteId, "total|lastMonth|NOW||fra")).toBe(DAYS * 3);
    expect(await visitsIn(t, siteId, "landing|lastMonth|NOW||fra")).toBe(DAYS * 3);

    const args = { siteId, period: "lastMonth" as const, device: "" };
    expect((await admin.query(api.googleAnalyticsReads.analyticsOverview, args)).now?.visits).toBe(DAYS * UK_A_DAY);
    expect((await admin.query(api.googleAnalyticsReads.analyticsOverview, { ...args, country: "fra" })).now?.visits).toBe(DAYS * 3);
    // A country the website does not keep reads as the main one, as Search Console's do.
    expect((await admin.query(api.googleAnalyticsReads.analyticsOverview, { ...args, country: "deu" })).now?.visits).toBe(DAYS * UK_A_DAY);
    // Its chart from its own days, kept beside the main one's (ga-stored-figures-plan.md SF7).
    const chart = await admin.query(api.googleAnalyticsChartReads.analyticsChart, { ...args, country: "fra" });
    expect(chart.points).toHaveLength(DAYS);
    expect(chart.points.every((point) => point.visits === 3)).toBe(true);
    const channels = await admin.query(api.googleAnalyticsReads.analyticsListPage, { ...args, list: "channel", country: "fra", page: 1, rows: 25 });
    expect(channels.rows.map((row) => [row.label, row.visits])).toEqual([["Organic Search", DAYS * 3]]);
  });

  test("another home country keeps its own days and shared lists (SF7): its charts, a page's and an event's screens ask Google nothing", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t, ["gbr", "fra"]);
    fakeGoogle([...history(70, TOP), ...fromFrance(70)]);
    await save(admin, siteId);
    await finishScheduled(t);

    // Its 90 days a day, by device, as the main one's are: the 70 the fake holds.
    const connection = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(connection?.countryHistory).toEqual([expect.objectContaining({ country: "fra", newestDay: TOP })]);
    const days = await t.run(async (ctx) => (await ctx.db.query("googleAnalyticsDays").collect()).filter((one) => one.device === "mobile|fra" && one.list === "total"));
    expect(days).toHaveLength(70);

    const args = { siteId, period: "lastMonth" as const, device: "", country: "fra" };
    const chart = await admin.query(api.googleAnalyticsChartReads.analyticsChannelChart, args);
    expect(chart.live).toBe(false);
    const all = await admin.query(api.googleAnalyticsReads.analyticsListPage, { ...args, list: "page", page: 1, rows: 25 });
    const home = all.rows.find((row) => row.label === "https://www.acme-shop.test/")!.key;
    const page = (await admin.query(api.googleAnalyticsPageReads.analyticsPage, { ...args, page: home }))!;
    // France's own: three visits a day from Google, all landing on the home page.
    expect(page.story.live).toBe(false);
    expect(page.story.sources.map((row) => [row.channel, row.visits])).toEqual([["Organic Search", DAYS * 3]]);
    const event = (await admin.query(api.googleAnalyticsEventReads.analyticsEvent, { ...args, event: "page_view" }))!;
    expect(event.live).toBe(false);
    expect(event.pages.map((row) => [row.label, row.times])).toEqual([["https://www.acme-shop.test/", DAYS * 5]]);
  });

  test("each other home country is asked for every list; its charts read its own days (SF7), Insights' year is the main one's", () => {
    const main = dueJobs({ weeklyPeriodsAt: undefined }, NOW);
    const both = dueJobs({ weeklyPeriodsAt: undefined }, NOW, ["fra"]);
    expect(both.filter((job) => !job.country)).toEqual(main);
    expect(both.filter((job) => job.country === "fra")).toHaveLength(main.length - 1);
    expect(both.filter((job) => job.list === "series")).toEqual([{ list: "series", period: "365", which: "NOW" }]);
  });

  test("the main home country changing clears what is held, and the next run collects the new one's", async () => {
    const t = harness();
    const { siteId, connectionId, agentId, admin } = await connected(t);
    fakeGoogle([...history(70, TOP), ...fromFrance(70)]);
    await save(admin, siteId);
    await finishScheduled(t);
    expect(await visitsIn(t, siteId, "total|lastMonth|NOW|")).toBe(DAYS * UK_A_DAY);

    await t.run(async (ctx) => await ctx.db.patch(siteId, { searchConsoleCountries: ["fra"] }));
    await dailyRun(t, agentId);

    expect(await visitsIn(t, siteId, "total|lastMonth|NOW|")).toBe(DAYS * 3);
    const connection = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(connection).toMatchObject({ mainCountry: "fra", status: "CONNECTED" });
    expect(connection?.clearing).toBeUndefined();
  });

  test("lists no run keeps any more go after the next collection; Insights' 12 months a day stays", async () => {
    const t = harness();
    const { siteId, agentId, admin } = await connected(t);
    fakeGoogle(history(70, TOP));
    await save(admin, siteId);
    await finishScheduled(t);
    // As held before the charts read the days, weeks and months kept (ga-stored-figures-plan.md SF12).
    await t.run(async (ctx) => {
      for (const key of ["eventSeries|30|NOW|", "visitorSeries|90|NOW|mobile", "series|90|NOW|", "series|365|NOW|mobile"]) {
        await ctx.db.insert("googleAnalyticsPeriodSlots", { companyWebsiteId: siteId, key, slot: 0, parts: 0, from: "2026-09-09", to: "2026-10-08", hash: "x", builtAt: 1 });
      }
    });
    await dailyRun(t, agentId);
    const keys = await keysOf(t, siteId);
    expect(keys.filter((key) => key.includes("Series") || key.startsWith("series|"))).toEqual(["series|365|NOW|"]);
  });

  test("a home country taken off the website's list goes after the next collection", async () => {
    const t = harness();
    const { siteId, agentId, admin } = await connected(t, ["gbr", "fra"]);
    // A fortnight of visits is enough to hold lists and days for each: what goes is the test, not how much.
    fakeGoogle([...history(14, TOP), ...fromFrance(14)]);
    await save(admin, siteId);
    await finishScheduled(t);
    expect((await keysOf(t, siteId)).some((key) => key.endsWith("|fra"))).toBe(true);
    expect(await t.run(async (ctx) => (await ctx.db.query("googleAnalyticsDays").collect()).some((one) => one.device.endsWith("|fra")))).toBe(true);

    await t.run(async (ctx) => await ctx.db.patch(siteId, { searchConsoleCountries: ["gbr"] }));
    await dailyRun(t, agentId);

    const keys = await keysOf(t, siteId);
    expect(keys.some((key) => key.endsWith("|fra"))).toBe(false);
    expect(keys).toContain("total|lastMonth|NOW|");
    // Its days and its place on the connection go too (SF7).
    expect(await t.run(async (ctx) => (await ctx.db.query("googleAnalyticsDays").collect()).some((one) => one.device.endsWith("|fra")))).toBe(false);
    expect(await t.run(async (ctx) => (await ctx.db.query("googleAnalyticsConnections").collect())[0].countryHistory)).toEqual([]);
  });
});
