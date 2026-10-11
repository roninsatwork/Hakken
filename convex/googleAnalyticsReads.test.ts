import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { NEWEST, PROPERTY, dayOf, fakeGoogle, history, type Visit } from "@/src/test/googleAnalyticsFake";
import { shiftDay } from "./searchConsoleDays";

/**
 * What the Google Analytics screens read (docs/plans/active/google-analytics-plan.md
 * §5, §6), from a property collected with Google faked: Overview's figures
 * against the span before and what changed most; the standard tables searched,
 * sorted and paged on the server, AI assistants as a channel of their own;
 * conversions worked out when read, Analytics' values first and Hakken's
 * filling the gaps; a landing page's own screen; and only the caller's own
 * website.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** A website collected from the log given, with generate_lead worth £250 in Hakken and sign_up £10 in Analytics. */
async function collected(t: Harness, visits: Visit[]) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "User", email: "user@acme-shop.test", role: "USER", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "COUNTING", property: PROPERTY, propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [], timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1,
      events: [
        { eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 },
        { eventName: "click_tel", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 },
        { eventName: "sign_up", counted: true, analyticsValue: 10, hakkenValue: null, lastThirtyDays: 0 },
      ],
      createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    await ctx.db.insert("agents", {
      name: "Google Analytics: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true,
      systemKey: "GOOGLE_ANALYTICS_COLLECTOR", createdAt: 1, updatedAt: 1,
    });
    // The platform's super admin, whom tracking health's system alerts are for.
    await ctx.db.insert("users", { name: "Super", email: "super@platform.test", role: "SUPER_ADMIN", createdAt: 1 });
    const rivalCompany = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
    const rivalId = await ctx.db.insert("users", { name: "Rival", email: "rival@rival.test", role: "ADMIN", companyId: rivalCompany, createdAt: 1 });
    return { siteId, connectionId, adminId, userId, rivalId };
  });
  fakeGoogle(visits);
  const admin = t.withIdentity({ subject: ids.adminId });
  await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
    siteId: ids.siteId,
    events: [
      { eventName: "generate_lead", counted: true, hakkenValue: 250 },
      { eventName: "click_tel", counted: true, hakkenValue: null },
      { eventName: "sign_up", counted: true, hakkenValue: null },
    ],
  });
  await finishScheduled(t);
  return { ...ids, admin, user: t.withIdentity({ subject: ids.userId }), rival: t.withIdentity({ subject: ids.rivalId }) };
}

/** Ten days at twice the visits and leads of the twenty before, and an AI assistant's visits. */
function growing(): Visit[] {
  const visits: Visit[] = [];
  for (let at = 0; at < 60; at += 1) visits.push(...dayOf(shiftDay(NEWEST, -at), at < 30 ? 2 : 1));
  for (let at = 0; at < 30; at += 1) {
    visits.push({
      date: shiftDay(NEWEST, -at), device: "mobile", channel: "Referral", source: "chatgpt.com", landing: "/ai-agency/", page: "/ai-agency/",
      sessions: 1, engaged: 1, seconds: 60, views: 2, events: { sign_up: [1, 10] },
    });
  }
  return visits;
}

const listArgs = { period: "30" as const, device: "", page: 1, rows: 25 };

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

describe("Overview", () => {
  test("visits, engaged visits, conversions and value against the 30 days before, and what changed most", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const overview = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "30", device: "" });
    // 30 days at twice the plain day (32 visits), plus the assistant's one a day.
    expect(overview.now).toMatchObject({ visits: 30 * 33, engaged: 30 * 23, conversions: 30 * (2 + 2 + 1) });
    expect(overview.before).toMatchObject({ visits: 30 * 16, conversions: 30 * 2 });
    // Leads at £250 set in Hakken; sign-ups at Analytics' own £10; calls have no value anywhere.
    expect(overview.now?.value).toBe(30 * 2 * 25_000 + 30 * 1_000);
    expect(overview.now?.unvalued).toBe(30 * 2);
    expect(overview.changedMost[0]).toMatchObject({ kind: "landing", label: "https://www.acme-shop.test/" });
    expect(overview.changedMost.map((row) => row.kind)).toContain("channel");
  });

  test("the chart: a day a point from the days kept, for the 30 days", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const chart = await user.query(api.googleAnalyticsChartReads.analyticsChart, { siteId, period: "30", device: "" });
    expect(chart.points).toHaveLength(30);
    expect(chart.events).toEqual(["generate_lead", "click_tel", "sign_up"]);
    expect(chart.points.at(-1)).toMatchObject({ day: NEWEST, visits: 33, conversions: 5, events: [2, 2, 1] });
  });
});

describe("the standard tables", () => {
  test("Channels: AI assistants a channel of their own, sorted by value, paged on the server", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const channels = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "channel", ...listArgs });
    // Perplexity's visits Google files under Referral are an assistant's too (§4.4).
    expect(channels.rows.map((row) => row.label)).toEqual(["Organic Search", "AI assistants", "Direct"]);
    expect(channels.total).toBe(3);
    const ai = channels.rows.find((row) => row.label === "AI assistants")!;
    expect(ai).toMatchObject({ visits: 30 + 240, conversions: 30 + 60, value: 30 * 1_000, fewVisits: false });
    const sources = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "source", channel: "AI assistants", ...listArgs });
    expect(sources.rows.map((row) => row.label)).toEqual(["ChatGPT", "Perplexity"]);
    const byVisits = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "channel", ...listArgs, sort: "visits", direction: "asc" });
    expect(byVisits.rows.map((row) => row.label)).toEqual(["Direct", "AI assistants", "Organic Search"]);
    const paged = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "channel", ...listArgs, rows: 2, page: 2 });
    expect(paged).toMatchObject({ total: 3, pages: 2, page: 2 });
    expect(paged.rows).toHaveLength(1);
  });

  test("Landing pages: addresses named, searched by address, with the change on the span before", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const landing = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    expect(landing.rows.map((row) => row.label)).toEqual([
      "https://www.acme-shop.test/", "https://www.acme-shop.test/ai-agency/", "https://www.acme-shop.test/contact/",
    ]);
    expect(landing.rows[0]).toMatchObject({ visits: 600, change: 1 });
    const found = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, q: "contact" });
    expect(found.rows.map((row) => row.label)).toEqual(["https://www.acme-shop.test/contact/"]);
  });

  test("a landing page Analytics names without its trailing slash shares its number with All pages, on the visits' own host", async () => {
    const t = harness();
    const visits = history(10).map((visit) => (visit.landing === "/ai-agency/" ? { ...visit, landing: "/ai-agency" } : visit));
    const { siteId, user } = await collected(t, visits);
    const landing = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    const pages = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    const landed = landing.rows.find((row) => row.label.includes("ai-agency"))!;
    const viewed = pages.rows.find((row) => row.label.includes("ai-agency"))!;
    expect(landed.label).toBe("https://www.acme-shop.test/ai-agency/");
    expect(landed.key).toBe(viewed.key);
  });

  test("a page list for one device is asked of Google, then read from what it held", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const before = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, device: "mobile" });
    expect(before).toMatchObject({ live: true, rows: [] });
    await user.action(api.googleAnalyticsLive.askGoogleAnalyticsLive, { siteId, period: "30", device: "mobile", pages: "landing" });
    const after = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, device: "mobile" });
    expect(after.live).toBe(false);
    expect(after.rows.map((row) => [row.label, row.visits])).toEqual([
      ["https://www.acme-shop.test/", 600], ["https://www.acme-shop.test/ai-agency/", 30],
    ]);
  });

  test("only the caller's own website", async () => {
    const t = harness();
    const { siteId, rival } = await collected(t, growing());
    await expect(rival.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "channel", ...listArgs })).rejects.toThrow("not one your company holds");
    await expect(rival.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "30", device: "" })).rejects.toThrow("not one your company holds");
  });
});

describe("Conversions", () => {
  test("each kind with its count, value each and where it is set, against the span before", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const conversions = await user.query(api.googleAnalyticsReads.analyticsConversions, { siteId, period: "30", device: "" });
    expect(conversions.kinds).toEqual([
      { eventName: "generate_lead", count: 60, countBefore: 30, each: 25_000, setIn: "HAKKEN", value: 60 * 25_000, valueBefore: 30 * 25_000 },
      { eventName: "click_tel", count: 60, countBefore: 30, each: null, setIn: null, value: null, valueBefore: null },
      { eventName: "sign_up", count: 30, countBefore: 0, each: 1_000, setIn: "ANALYTICS", value: 30 * 1_000, valueBefore: 0 },
    ]);
    expect(conversions.shop).toBeNull();
    // Only one conversion's landing pages.
    const leads = await user.query(api.googleAnalyticsReads.analyticsTopList, { siteId, list: "landing", period: "30", device: "", eventName: "sign_up" });
    expect(leads.rows.map((row) => row.label)).toEqual(["https://www.acme-shop.test/ai-agency/"]);
  });

  test("a value set in Hakken re-prices all history at once, with nothing rewritten", async () => {
    const t = harness();
    const { siteId, admin, user } = await collected(t, growing());
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId, events: [{ eventName: "generate_lead", counted: true, hakkenValue: 100 }, { eventName: "click_tel", counted: true, hakkenValue: 50 }],
    });
    const overview = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "30", device: "" });
    expect(overview.now?.value).toBe(60 * 10_000 + 60 * 5_000 + 30 * 1_000);
    expect(overview.before?.value).toBe(30 * 10_000 + 30 * 5_000);
  });
});

describe("a landing page's own screen", () => {
  test("its figures from the ready-made list, its chart and channels asked of Google when it opens", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const landing = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    const page = landing.rows.find((row) => row.label.endsWith("/ai-agency/"))!.key;
    const first = (await user.query(api.googleAnalyticsPageReads.analyticsLandingPage, { siteId, page, period: "30", device: "" }))!;
    expect(first).toMatchObject({ address: "https://www.acme-shop.test/ai-agency/", path: "/ai-agency/", live: true });
    expect(first.row).toMatchObject({ visits: 30 * 8 + 30 });
    await user.action(api.googleAnalyticsLive.askGoogleAnalyticsLive, { siteId, period: "30", device: "", page: { ref: page, path: first.path } });
    const opened = (await user.query(api.googleAnalyticsPageReads.analyticsLandingPage, { siteId, page, period: "30", device: "" }))!;
    expect(opened.live).toBe(false);
    expect(opened.points).toHaveLength(30);
    expect(opened.channels.map((row) => row.label)).toEqual(["AI assistants"]);
  });
});

describe("a page's own screen from All pages (GA29)", () => {
  test("its figures from All pages; its views a day and where visitors were just before, asked of Google when it opens", async () => {
    const t = harness();
    // /ai-agency/'s desktop views came from the home page, its phone views from ChatGPT.
    const visits = growing().map((visit) => (visit.page !== "/ai-agency/" ? visit : { ...visit, referrer: visit.device === "desktop" ? "https://www.acme-shop.test/" : "https://chatgpt.com/" }));
    const { siteId, user } = await collected(t, visits);
    const all = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    const page = all.rows.find((row) => row.label.endsWith("/ai-agency/"))!.key;
    const home = all.rows.find((row) => row.label === "https://www.acme-shop.test/")!.key;
    const args = { siteId, page, period: "30" as const, device: "" };
    const first = (await user.query(api.googleAnalyticsPageReads.analyticsPage, args))!;
    expect(first).toMatchObject({ address: "https://www.acme-shop.test/ai-agency/", path: "/ai-agency/", live: true, viewsBefore: 30 * 9, before: [], points: [] });
    expect(first.row).toMatchObject({ views: 30 * 18 + 30 * 2 });
    expect(first.seen).toEqual({ says: [], steps: [] });

    await user.action(api.googleAnalyticsLive.askGoogleAnalyticsLive, { siteId, period: "30", device: "", viewed: { ref: page, path: first.path } });
    const opened = (await user.query(api.googleAnalyticsPageReads.analyticsPage, args))!;
    expect(opened.live).toBe(false);
    expect(opened.points).toHaveLength(30);
    expect(opened.points.reduce((sum, point) => sum + point.views, 0)).toBe(600);
    expect(opened.before).toMatchObject([
      { kind: "page", key: home, label: "https://www.acme-shop.test/", views: 540, share: 0.9 },
      { kind: "site", key: "chatgpt.com", label: "ChatGPT", views: 60, share: 0.1 },
    ]);
    expect(opened.seen.says[0]).toEqual({ code: "twoSources", text: "/", a: 0.9, more: "ChatGPT", b: 0.1 });
    expect(opened.seen.steps).toMatchObject([
      { code: "keepLink", text: "/", to: { segment: "all-pages/page", filters: { key: home } } },
      { code: "checkAssistant", text: "ChatGPT" },
    ]);
  });
});

describe("Events and an event's own screen (GA30)", () => {
  /** The last 30 days' scrolls and clicks off the website, on the home page: five scrolls and two clicks a day, in one visit. */
  function clicks(): Visit[] {
    return Array.from({ length: 30 }, (_, at): Visit => ({
      date: shiftDay(NEWEST, -at), device: "desktop", channel: "Organic Search", source: "google", landing: "/", page: "/",
      sessions: 1, engaged: 1, seconds: 10, views: 1, events: { scroll: [5, 0], click: [2, 0] },
      about: { linkUrl: "https://www.linkedin.com/company/acme", percentScrolled: "90" },
    }));
  }

  test("every event against the span before, what counts among them, scrolls and link clicks a day", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, [...growing(), ...clicks()]);
    const args = { siteId, period: "30" as const, device: "" };
    const events = (await user.query(api.googleAnalyticsEventReads.analyticsEvents, args))!;
    expect(events).toMatchObject({ preparing: false, live: false });
    const row = (name: string) => events.rows.find((one) => one.eventName === name);
    expect(row("page_view")).toMatchObject({ kind: "automatic", counted: false, times: 30 * 67, timesBefore: 30 * 32 });
    expect(row("generate_lead")).toMatchObject({ kind: "conversion", counted: true, times: 60, timesBefore: 30 });
    expect(row("sign_up")).toMatchObject({ counted: true, times: 30, timesBefore: 0 });
    expect(row("scroll")).toMatchObject({ kind: "measured", times: 150, visits: 30 });
    expect(events.rows[0].eventName).toBe("page_view");
    expect(events.points).toHaveLength(30);
    expect(events.points.reduce((sum, point) => sum + point.scroll, 0)).toBe(150);
    expect(events.points.reduce((sum, point) => sum + point.click, 0)).toBe(60);
    expect(events.seen.says).toEqual([{ code: "reachedBottom", a: 150 / (30 * 67), b: 150 }]);

    // One device is asked of Google when the screen opens.
    const mobile = { ...args, device: "mobile" };
    expect((await user.query(api.googleAnalyticsEventReads.analyticsEvents, mobile))?.live).toBe(true);
    await user.action(api.googleAnalyticsLive.askGoogleAnalyticsLive, { ...mobile, pages: "event" });
    await user.action(api.googleAnalyticsLive.askGoogleAnalyticsLive, { ...mobile, pages: "eventSeries" });
    const phones = (await user.query(api.googleAnalyticsEventReads.analyticsEvents, mobile))!;
    expect(phones.live).toBe(false);
    expect(phones.rows.find((one) => one.eventName === "scroll")).toBeUndefined();
    expect(phones.rows.find((one) => one.eventName === "generate_lead")?.times).toBe(60);
  });

  test("an event's figures, its times a day, and what it was about and its pages, asked of Google when it opens", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, [...growing(), ...clicks()]);
    const args = { siteId, event: "click", period: "30" as const, device: "" };
    const first = (await user.query(api.googleAnalyticsEventReads.analyticsEvent, args))!;
    expect(first).toMatchObject({ kind: "measured", counted: false, detail: "linkUrl", live: true, about: [], pages: [] });
    expect(first.figures).toMatchObject({ times: 60, timesBefore: 0, visits: 30, visitsShare: 30 / (30 * 34) });
    expect(first.points.reduce((sum, point) => sum + point.times, 0)).toBe(60);

    await user.action(api.googleAnalyticsLive.askGoogleAnalyticsLive, { siteId, period: "30", device: "", event: "click" });
    const opened = (await user.query(api.googleAnalyticsEventReads.analyticsEvent, args))!;
    expect(opened.live).toBe(false);
    expect(opened.about).toEqual([{ key: "https://www.linkedin.com/company/acme", label: "linkedin.com/company/acme", times: 60, people: 30, change: null }]);
    expect(opened.pages).toMatchObject([{ label: "https://www.acme-shop.test/", times: 60 }]);
    expect(opened.seen).toEqual({
      says: [{ code: "timesNew", text: "click", a: 60, b: 30 }, { code: "topLink", text: "linkedin.com/company/acme", a: 60, b: 1 }],
      steps: [{ code: "newTab", link: "allPages", to: { segment: "all-pages" } }],
    });
  });
});

describe("What Hakken sees, from what each screen already reads (§14)", () => {
  /** Search Console connected for the website, with its last 30 days held: 100 clicks from 20,000 showings. */
  async function withSearchConsole(t: Harness, siteId: Id<"companyWebsites">) {
    await t.run(async (ctx) => {
      const hold = (await ctx.db.get(siteId))!;
      await ctx.db.insert("searchConsoleConnections", {
        companyId: hold.companyId, companyWebsiteId: siteId, websiteId: hold.websiteId, status: "CONNECTED", newestDay: "2026-10-07", createdAt: 1, updatedAt: 1,
      });
      for (let at = 0; at < 40; at += 1) {
        await ctx.db.insert("searchConsoleDays", {
          companyWebsiteId: siteId, searchType: "web", day: shiftDay("2026-10-07", -at), clicks: at < 30 ? 4 : 99, impressions: at < 30 ? 800 : 99, ctr: 0, position: 10, fetchedAt: 1,
        });
      }
    });
  }

  test("Overview's box weighs conversions against visits and Google's showings, with the page named", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    await withSearchConsole(t, siteId);
    const overview = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "30", device: "" });
    expect(overview.counting).toBe(true);
    // The last 30 of the 40 days held: 4 clicks from 800 showings a day.
    expect(overview.searchConsole).toEqual({ clicks: 120, impressions: 24_000 });
    expect(overview.seen.says[0]).toEqual({ code: "lead.up.up", a: (990 - 480) / 480, b: 60, c: 150 });
    expect(overview.seen.says.at(-1)).toEqual({ code: "googleRarely", a: 24_000, b: 0.005 });
    expect(overview.seen.steps.at(-1)).toMatchObject({ code: "push", to: { segment: "heroes", filters: { tab: "push" } } });
  });

  test("each list's box is of the whole list, whatever is searched, its pages named by their paths", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const channels = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "channel", ...listArgs, q: "dir" });
    expect(channels.rows.map((row) => row.label)).toEqual(["Direct"]);
    expect(channels.seen.says[0]).toMatchObject({ code: "lead", text: "Organic Search" });
    expect(channels.figures).toBeNull();
    const assistants = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "source", channel: "AI assistants", ...listArgs });
    expect(assistants.figures).toMatchObject({ visits: 270, conversions: 90, value: 30_000, siteVisits: 990 });
    expect(assistants.seen.says[0]).toMatchObject({ code: "top.up", text: "Perplexity" });
    const landing = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    const quoted = [...landing.seen.says, ...landing.seen.steps].flatMap((phrase) => [phrase.text, phrase.more]).filter((value) => value !== undefined);
    expect(quoted.length).toBeGreaterThan(0);
    expect(quoted.every((value) => value!.startsWith("/"))).toBe(true);
    const pages = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    expect(pages.seen.says[0]).toMatchObject({ code: "madeOn" });
  });

  test("a device's box waits for Google's answer, then weighs it against every device", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const asking = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, device: "mobile" });
    expect(asking.seen).toEqual({ says: [], steps: [] });
    await user.action(api.googleAnalyticsLive.askGoogleAnalyticsLive, { siteId, period: "30", device: "mobile", pages: "landing" });
    const answered = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, device: "mobile" });
    expect(answered.seen.says[0]).toMatchObject({ code: "device.mobile", a: 630 });
  });

  test("Conversions' box, Your websites' figures before, and Search Console only while the way to connect shows", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    await withSearchConsole(t, siteId);
    const conversions = await user.query(api.googleAnalyticsReads.analyticsConversions, { siteId, period: "30", device: "" });
    expect(conversions.seen.says[0]).toEqual({ code: "topKind", text: "generate_lead", a: 60, b: 150 });
    expect(conversions.fired).toEqual([]);
    const [site] = await user.query(api.googleAnalyticsReads.analyticsSites, {});
    expect(site).toMatchObject({ visits: 990, visitsBefore: 480, counting: true, checks: 8 });
    const connected = await user.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId });
    expect(connected?.searchConsole).toBeNull();
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query("googleAnalyticsConnections").collect())[0];
      await ctx.db.delete(connection._id);
    });
    const unconnected = await user.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId });
    expect(unconnected?.searchConsole).toEqual({ clicks: 120, impressions: 24_000 });
  });
});

describe("tracking health", () => {
  test("a counted conversion with no value fails once, and the super admins are told once", async () => {
    const t = harness();
    const { siteId, connectionId, admin } = await collected(t, history(40));
    const health = (await t.run(async (ctx) => await ctx.db.get(connectionId)))!.health!;
    expect(health.checks.filter((check) => !check.passing).map((check) => check.check)).toEqual(["NO_VALUE", "STRANGERS"]);
    const told = async () => (await t.run(async (ctx) => await ctx.db.query("notifications").collect())).filter((row) => row.kind === "GOOGLE_ANALYTICS_HEALTH");
    expect((await told()).map((row) => row.title)).toEqual(["acme-shop.test: a conversion has no value", "acme-shop.test: visits on another address"]);
    // System alerts: the platform's super admins, never the company's own admins.
    const rows = await told();
    const roles = await t.run(async (ctx) => await Promise.all(rows.map(async (row) => (await ctx.db.get(row.userId))?.role)));
    expect(new Set(roles)).toEqual(new Set(["SUPER_ADMIN"]));
    // Saved again with the same gap: no second bell.
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, { siteId, events: [{ eventName: "click_tel", counted: true, hakkenValue: null }] });
    await finishScheduled(t);
    expect(await told()).toHaveLength(2);
    // Given a value: the check passes.
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, { siteId, events: [{ eventName: "click_tel", counted: true, hakkenValue: 150 }] });
    await finishScheduled(t);
    const after = (await t.run(async (ctx) => await ctx.db.get(connectionId)))!.health!;
    expect(after.checks.find((check) => check.check === "NO_VALUE")?.passing).toBe(true);
  });
});
