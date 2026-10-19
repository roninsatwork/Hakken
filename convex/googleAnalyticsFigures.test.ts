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
import { PROPERTY, fakeGoogle, history } from "@/src/test/googleAnalyticsFake";

/**
 * The second round's figures (docs/plans/active/google-analytics-plan.md
 * GA24–GA27, §18.6.2–§18.6.3): people and new people, how long visits
 * lasted, bounce rate and pages a visit, and each page's title — with the
 * website's people asked whole, since people cannot be added up across
 * devices. Google faked: its people count is not additive, as Google's isn't.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");

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

/** A ready-made list's rows, read through its slot as a screen does. */
const rowsIn = (t: Harness, siteId: Id<"companyWebsites">, key: string) =>
  t.run(async (ctx) => {
    const slot = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", siteId).eq("key", key)).first();
    if (!slot) return [];
    const parts = await ctx.db
      .query("googleAnalyticsPeriods")
      .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", siteId).eq("key", key).eq("slot", slot.slot))
      .collect();
    return parts.flatMap((part) => unpackPart(part)).map(({ counts: _counts, values: _values, ...figures }) => figures);
  });

// The fake property's visits over 30 days on the website's own address: 10 a day on phones, 6 on computers.
const MOBILE = 30 * 10;
const DESKTOP = 30 * 6;
/** People as the fake counts them: from a row's visits taken whole, so adding rows up gives more. */
const peopleOf = (visits: number) => Math.ceil(Math.sqrt(visits) * 10);

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

describe("the second round's figures", () => {
  test("people for every device are the website's counted whole, never the devices' added up", async () => {
    const t = harness();
    const { siteId, admin } = await connected(t);
    fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);

    const [every] = await rowsIn(t, siteId, "total|30|NOW|");
    expect(every).toMatchObject({ visits: MOBILE + DESKTOP, people: peopleOf(MOBILE + DESKTOP) });
    expect(peopleOf(MOBILE + DESKTOP)).toBeLessThan(peopleOf(MOBILE) + peopleOf(DESKTOP));
    const [mobile] = await rowsIn(t, siteId, "total|30|NOW|mobile");
    expect(mobile).toMatchObject({ visits: MOBILE, people: peopleOf(MOBILE) });
    // Visit length adds up: 75 seconds a visit on every row.
    expect(every.length).toBe((MOBILE + DESKTOP) * 75);
  });

  test("Overview reads page views, people, visit length and bounce rate's makings; the lists read them a row", async () => {
    const t = harness();
    const { siteId, admin } = await connected(t);
    fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);

    const args = { siteId, period: "30" as const, device: "" };
    const overview = await admin.query(api.googleAnalyticsReads.analyticsOverview, args);
    // A day: 10 visits with 6 engaged and 20 views on phones; 4 with 3 and 9, and 2 with 2 and 3, on computers.
    expect(overview.now).toMatchObject({ visits: 480, engaged: 330, views: 960, people: peopleOf(480), length: 480 * 75 });
    const landing = await admin.query(api.googleAnalyticsReads.analyticsListPage, { ...args, list: "landing", page: 1, rows: 25 });
    // Opening by visits (GA26): the home page first.
    expect(landing.rows[0]).toMatchObject({ label: "https://www.acme-shop.test/", visits: 300, bounceRate: 0.4, pagesPerVisit: 2, lengthPerVisit: 75 });
    const pages = await admin.query(api.googleAnalyticsReads.analyticsListPage, { ...args, list: "page", page: 1, rows: 25 });
    expect(pages.rows.map((row) => row.label)).toEqual(["https://www.acme-shop.test/", "https://www.acme-shop.test/ai-agency/", "https://www.acme-shop.test/contact/"]);
    expect(pages.rows[0]).toMatchObject({ views: 600, people: peopleOf(300) });
  });

  test("each page's title is asked weekly and kept by its number; the lists show it from the website's page list", async () => {
    const t = harness();
    const { siteId, admin } = await connected(t);
    fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);

    const titles = await t.run(async (ctx) => await ctx.db.query("googleAnalyticsTitles").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", siteId)).collect());
    expect(titles.map((row) => row.title).sort()).toEqual(["Title of /", "Title of /ai-agency/", "Title of /contact/"]);
    expect(titles.every((row) => row.page.startsWith("~"))).toBe(true);

    // The website's page list carries a title once its rebuild has copied it: read from there, on the rows shown.
    await t.run(async (ctx) => {
      await ctx.db.insert("holdPages", { companyWebsiteId: siteId, page: "/ai-agency/", crawled: false, shown: false, clicks: 0, ranks: false, title: "AI Agency | Acme" });
    });
    const args = { siteId, period: "30" as const, device: "" };
    const landing = await admin.query(api.googleAnalyticsReads.analyticsListPage, { ...args, list: "landing", page: 1, rows: 25 });
    expect(landing.rows.map((row) => [row.label, row.title ?? null])).toEqual([
      ["https://www.acme-shop.test/", null],
      ["https://www.acme-shop.test/ai-agency/", "AI Agency | Acme"],
      ["https://www.acme-shop.test/contact/", null],
    ]);
  });

  test("charts: page views a day, each channel a day from the days kept or asked of Google, and a list's top ten", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await connected(t);
    fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);
    // The first night: the two-year fills follow its run (ga-big-site-reliability-plan.md BR7).
    await t.mutation(internal.googleAnalyticsFillAfter.startFills, { connectionId });
    await finishScheduled(t);
    const args = { siteId, period: "30" as const, device: "" };

    const chart = await admin.query(api.googleAnalyticsChartReads.analyticsChart, args);
    expect(chart.points).toHaveLength(30);
    expect(chart.points.every((point) => point.views === 32 && point.visits === 16)).toBe(true);

    // Thirty days: from the days kept, the busiest channel first.
    const daily = await admin.query(api.googleAnalyticsChartReads.analyticsChannelChart, args);
    expect(daily).toMatchObject({ live: false, channels: ["Organic Search", "AI assistants", "Direct"], rest: false });
    expect(daily.points).toHaveLength(30);
    expect(daily.points[0].visits).toEqual([10, 4, 2]);

    // Ninety days are kept as days (ga-stored-figures-plan.md SF2): read from what is held, never asked of Google.
    const ninety = await admin.query(api.googleAnalyticsChartReads.analyticsChannelChart, { ...args, period: "90" as const });
    expect(ninety).toMatchObject({ live: false, channels: ["Organic Search", "AI assistants", "Direct"] });
    expect(ninety.points).toHaveLength(90);
    // Twelve months from the two years filled by themselves after the first night's collection (SF9, BR7): a day for 90 days, then weeks.
    const long = await admin.query(api.googleAnalyticsChartReads.analyticsChannelChart, { ...args, period: "365" as const });
    expect(long).toMatchObject({ live: false, channels: ["Organic Search", "AI assistants", "Direct"] });
    expect(long.points.filter((point) => !point.lastDay)).toHaveLength(90);

    const top = await admin.query(api.googleAnalyticsReads.analyticsTopList, { ...args, list: "page", sort: "views", direction: "desc", count: 2 });
    expect(top.rows.map((row) => [row.label, row.views])).toEqual([["https://www.acme-shop.test/", 600], ["https://www.acme-shop.test/ai-agency/", 270]]);
    expect(top.total).toBe(3);
  });
});

