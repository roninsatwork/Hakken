import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { ANALYTICS_SCREENS } from "./utils/analyticsScreens";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { NEWEST, PROPERTY, dayOf, fakeGoogle, history, type Visit } from "@/src/test/googleAnalyticsFake";
import { shiftDay } from "./searchConsoleDays";
import { YOUR_PAGES_COPY, YOUR_PAGES_FIELDS } from "./holdPages";
import { encodeCopyRows } from "./utils/copyColumns";

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
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [], timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT",
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
  const google = fakeGoogle(visits);
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
  return { ...ids, google, admin, user: t.withIdentity({ subject: ids.userId }), rival: t.withIdentity({ subject: ids.rivalId }) };
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

  test("a page list for one device is read from what the collection kept, never asked of Google", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const after = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, device: "mobile" });
    expect(after.live).toBe(false);
    expect(after.rows.map((row) => [row.label, row.visits])).toEqual([
      ["https://www.acme-shop.test/", 600], ["https://www.acme-shop.test/ai-agency/", 30],
    ]);
  });

  test("a device's list not built yet by a run waits for the next one: every device's is shown meanwhile, nothing asked of Google", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    // As on the day lists became kept by device: this device's 30 days not built yet.
    await t.run(async (ctx) => {
      const slot = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", siteId).eq("key", "landing|30|NOW|mobile")).first();
      if (slot) await ctx.db.delete(slot._id);
    });
    const before = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, device: "mobile" });
    expect(before).toMatchObject({ live: true, rows: [] });
    // The screen shows every device's list beside it (`AnalyticsListScreen`): that one is held.
    const every = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    expect(every.live).toBe(false);
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
  test("its figures from the ready-made list, its chart from the page held over time and its channels from those kept, never asked of Google", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const landing = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    const page = landing.rows.find((row) => row.label.endsWith("/ai-agency/"))!.key;
    const opened = (await user.query(api.googleAnalyticsPageReads.analyticsLandingPage, { siteId, page, period: "30", device: "" }))!;
    expect(opened).toMatchObject({ address: "https://www.acme-shop.test/ai-agency/", path: "/ai-agency/", live: false });
    expect(opened.row).toMatchObject({ visits: 30 * 8 + 30 });
    expect(opened.points).toHaveLength(30);
    expect(opened.channels.map((row) => row.label)).toEqual(["AI assistants"]);
  });
});

describe("a page's own screen from All pages (GA29)", () => {
  test("its figures from All pages, its views a day and where visitors were just before, all from what each collection keeps", async () => {
    const t = harness();
    // /ai-agency/'s desktop views came from the home page, its phone views from ChatGPT.
    const visits = growing().map((visit) => (visit.page !== "/ai-agency/" ? visit : { ...visit, referrer: visit.device === "desktop" ? "https://www.acme-shop.test/" : "https://chatgpt.com/" }));
    const { siteId, user } = await collected(t, visits);
    const all = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    const page = all.rows.find((row) => row.label.endsWith("/ai-agency/"))!.key;
    const home = all.rows.find((row) => row.label === "https://www.acme-shop.test/")!.key;
    const args = { siteId, page, period: "30" as const, device: "" };
    // Its views a day from the page held over time, and where they came from, kept for every page (ga-stored-figures-plan.md SF5, SF13).
    const opened = (await user.query(api.googleAnalyticsPageReads.analyticsPage, args))!;
    expect(opened).toMatchObject({ address: "https://www.acme-shop.test/ai-agency/", path: "/ai-agency/", live: false, viewsBefore: 30 * 9 });
    expect(opened.row).toMatchObject({ views: 30 * 18 + 30 * 2 });
    expect(opened.points).toHaveLength(30);
    expect(opened.points.reduce((sum, point) => sum + point.views, 0)).toBe(600);
    expect(opened.before).toMatchObject([
      { kind: "page", key: home, label: "https://www.acme-shop.test/", views: 540, share: 0.9 },
      { kind: "site", key: "chatgpt.com", label: "ChatGPT", views: 60, share: 0.1 },
    ]);
    // Its story first (analytics-page-screen-plan.md §5): the visits that started on it, kept with the landing pages, and their
    // conversions; then, its story held, the page counted again (1 different page a visit, 2.2 as Google counts them).
    expect(opened.seen.says.map((phrase) => phrase.code)).toEqual(["startedConverted", "countedAgainPages", "twoSources"]);
    expect(opened.seen.says[2]).toEqual({ code: "twoSources", text: "/", a: 0.9, more: "ChatGPT", b: 0.1 });
    expect(opened.seen.steps).toMatchObject([
      { code: "fixCountedAgain" },
      { code: "keepLink", text: "/", to: { segment: "all-pages/page", filters: { key: home } } },
      { code: "checkAssistant", text: "ChatGPT" },
    ]);
  });
});

describe("a page's story on its own screen (analytics-page-screen-plan.md §2, §4; ga-stored-figures-plan.md SF13–SF16)", () => {
  /**
   * An article over the last 30 days: Google's visits read it, counted three times a visit, and leave a link out; visits typed in
   * read it and go on to /contact/, where they convert; ChatGPT's come from abroad.
   */
  function article(): Visit[] {
    const page = "/hub/prism/";
    return Array.from({ length: 30 }, (_, at): Visit[] => {
      const date = shiftDay(NEWEST, -at);
      return [
        { date, device: "mobile", channel: "Organic Search", source: "google", landing: page, page, sessions: 10, engaged: 8, seconds: 400, views: 30, age: "18-24", gender: "female", events: { scroll: [2, 0], click: [1, 0] }, about: { linkUrl: "https://en.wikipedia.org/wiki/Brand" } },
        { date, device: "desktop", channel: "Direct", source: "(direct)", landing: page, page, sessions: 2, engaged: 2, seconds: 100, views: 2, visitor: "returning", events: { scroll: [1, 0] } },
        { date, device: "desktop", channel: "Direct", source: "(direct)", landing: page, page: "/contact/", referrer: "https://www.acme-shop.test/hub/prism/", sessions: 1, engaged: 1, seconds: 30, views: 1, visitor: "returning", events: { generate_lead: [1, 0] } },
        { date, device: "mobile", channel: "Referral", source: "chatgpt.com", landing: page, page, country: "US", sessions: 1, engaged: 1, seconds: 50, views: 1 },
      ];
    }).flat();
  }

  test("worked out from the shared lists every collection keeps, never asked of Google: the visits that started on it, each source on its own line, where its views went, who reads it, and its box", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, [...growing(), ...article()]);
    const all = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    const page = all.rows.find((row) => row.label.endsWith("/hub/prism/"))!.key;
    const args = { siteId, page, period: "30" as const, device: "" };
    const first = (await user.query(api.googleAnalyticsPageReads.analyticsPage, args))!;
    // Kept with the landing pages: the visits that started here and the conversions they made elsewhere.
    expect(first.story.started).toMatchObject({ visits: 30 * 13, conversions: 30, fewVisits: false });
    expect(first.row).toMatchObject({ conversions: 0 });
    // Held: worked out from the shared lists, nothing asked of Google.
    expect(first.story.live).toBe(false);
    const opened = first;
    const story = opened.story;
    // One line a source, never a group (PS2): typed in by Google's own word, with the conversion.
    expect(story.sources.map((row) => [row.channel, row.name ?? row.source, row.visits, row.conversions])).toEqual([
      ["Organic Search", "Google", 300, 0],
      ["Direct", "(direct)", 90, 30],
    ]);
    // A source's pages a visit as Google counts them, and its reading over the visit: a source's visits are not kept by page.
    expect(story.sources[0]).toMatchObject({ pages: 3, read: 60 / 300, back: 0 });
    expect(story.sources[1].back).toBe(1);
    // Its views a visit (the page counted again), how far it is read, and where its views went next.
    expect(story.viewsPerVisit).toBeCloseTo(960 / 360);
    expect(story.read).toBeCloseTo(90 / 360);
    expect(story.next.map((row) => [row.kind, row.address, row.views])).toEqual([
      ["again", "", 600],
      ["left", "", 330],
      ["page", "https://www.acme-shop.test/contact/", 30],
    ]);
    // Its readers: devices, every country (PS8), age where Google can tell and the conversions it could place.
    expect(story.devices.map((row) => row.device)).toEqual(["mobile", "desktop"]);
    expect(story.countries.map((row) => row.code)).toEqual(["GB", "US"]);
    expect(story.ages).toMatchObject({ rows: [{ key: "18-24", share: 1, conversions: 0 }], conversionsPlaced: 0, conversions: 30, readers: expect.any(Number) });
    expect(story.genders.rows.map((row) => row.key)).toEqual(["female"]);
    expect(story.weekdays).toHaveLength(7);
    expect(story.weekdays.reduce((sum, row) => sum + row.views, 0)).toBe(960);
    expect(story.clicks).toEqual([{ kind: "click", url: "https://en.wikipedia.org/wiki/Brand", clicks: 30 }]);
    expect(story.returning).toMatchObject({ first: expect.any(Number), back: expect.any(Number) });
    // The box: the visits and the conversion made elsewhere, the biggest source with none, the page counted again.
    expect(opened.seen.says.map((phrase) => phrase.code)).toEqual(["startedElsewhere", "biggestNoneTyped", "countedAgainPages"]);
    // The box's figures are the page's own: 1.0 different pages a visit, 2.5 as Google counts them (990 views in 390 visits).
    expect(opened.seen.says[2]).toEqual({ code: "countedAgainPages", a: 1, b: 2.5 });
    // First visit or back again by the visits that started here, which add up to them as the figure and the table do.
    expect(story.returning).toMatchObject({ first: 300, back: 90, unknown: 0 });
    expect((story.returning?.first ?? 0) + (story.returning?.back ?? 0) + (story.returning?.unknown ?? 0)).toBe(story.started?.visits);
    expect(opened.seen.steps.map((step) => step.code)).toEqual(["fixCountedAgain"]);
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

    // One device's events are kept by the collection (ga-stored-figures-plan.md SF3): read at once, never asked of Google.
    const mobile = { ...args, device: "mobile" };
    const phones = (await user.query(api.googleAnalyticsEventReads.analyticsEvents, mobile))!;
    expect(phones.live).toBe(false);
    expect(phones.rows.find((one) => one.eventName === "scroll")).toBeUndefined();
    expect(phones.rows.find((one) => one.eventName === "generate_lead")?.times).toBe(60);
  });

  test("an event's figures, its times a day, and what it was about and its pages from what each collection keeps; its funnel asked when it opens", async () => {
    const t = harness();
    const { siteId, user, google } = await collected(t, [...growing(), ...clicks()]);
    const args = { siteId, event: "click", period: "30" as const, device: "" };
    const first = (await user.query(api.googleAnalyticsEventReads.analyticsEvent, args))!;
    // What it was about and its pages, kept for every event by each collection (ga-stored-figures-plan.md SF13, SF15).
    expect(first).toMatchObject({ kind: "measured", counted: false, detail: "linkUrl", live: false, afterLive: true, after: null });
    expect(first.about).toEqual([{ key: "https://www.linkedin.com/company/acme", label: "linkedin.com/company/acme", times: 60, people: 30, change: null }]);
    expect(first.pages).toMatchObject([{ label: "https://www.acme-shop.test/", times: 60 }]);
    expect(first.figures).toMatchObject({ times: 60, timesBefore: 0, visits: 30, visitsShare: 30 / (30 * 34) });
    expect(first.points.reduce((sum, point) => sum + point.times, 0)).toBe(60);

    // Only its funnel is asked of Google, and kept a week (SF8).
    const asked = google.calls.length;
    await user.action(api.googleAnalyticsLive.askEventFunnel, { siteId, period: "30", device: "", event: "click" });
    expect(google.calls.slice(asked).filter((call) => call.url.includes("analyticsdata")).map((call) => call.url.split(":").at(-1))).toEqual(["runFunnelReport"]);
    const opened = (await user.query(api.googleAnalyticsEventReads.analyticsEvent, args))!;
    expect(opened).toMatchObject({ live: false, afterLive: false, about: first.about, pages: first.pages });
    // The people who clicked, and of them none who converted after it: Google's funnel report (Anthony, 2026-10-11).
    expect(opened).toMatchObject({ counting: true, after: { did: 30, converted: 0 } });
    expect(opened.seen).toEqual({
      says: [
        { code: "timesNew", text: "click", a: 60, b: 30 },
        { code: "topLink", text: "linkedin.com/company/acme", a: 60, b: 1 },
        { code: "noneAfter", a: 30 },
      ],
      steps: [{ code: "newTab", link: "allPages", to: { segment: "all-pages" } }],
    });
  });
});

describe("Campaigns (GA28)", () => {
  test("the visits from tagged links by campaign and by their words, the untagged said beside them, and a day at a time", async () => {
    const t = harness();
    // A LinkedIn campaign's visit a day for the last 30 days, its links carrying "ai agency".
    const tagged = Array.from({ length: 30 }, (_, at): Visit => ({
      date: shiftDay(NEWEST, -at), device: "mobile", channel: "Organic Social", source: "linkedin.com", landing: "/ai-agency/", page: "/ai-agency/",
      campaign: "ai-agents-launch", medium: "social", term: "ai agency", sessions: 1, engaged: 1, seconds: 20, views: 1,
    }));
    const { siteId, user } = await collected(t, [...growing(), ...tagged]);
    const args = { siteId, ...listArgs };
    const campaigns = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...args, list: "campaign" });
    expect(campaigns.rows.map((row) => [row.label, row.source, row.visits])).toEqual([["ai-agents-launch", "linkedin.com / social", 30]]);
    // The plain days' 32 visits and the assistant's one, a day: none tagged.
    expect(campaigns.untagged).toBe(30 * 33);
    expect(campaigns.seen).toEqual({
      says: [{ code: "fewTagged", a: 30, b: 30 * 34, c: 30 * 33 }, { code: "noneConverted" }, { code: "quiet", text: "ai-agents-launch", a: 30 }],
      steps: [
        { code: "tagLinks", link: "channels", to: { segment: "channels" } },
        { code: "seeLanding", text: "ai-agents-launch", link: "landingPages", to: { segment: "funnel" } },
      ],
    });
    const words = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...args, list: "adKeyword" });
    expect(words.rows.map((row) => [row.label, row.visits])).toEqual([["ai agency", 30]]);
    const chart = await user.query(api.googleAnalyticsChartReads.analyticsCampaignChart, { siteId, period: "30", device: "" });
    expect(chart.points).toHaveLength(30);
    expect(chart.points.every((point) => point.visits === 1)).toBe(true);
    // One device's campaigns are kept by the collection (SF3): read at once, never asked of Google.
    const phones = { ...args, list: "campaign" as const, device: "desktop" };
    const desktop = await user.query(api.googleAnalyticsReads.analyticsListPage, phones);
    expect(desktop).toMatchObject({ live: false, rows: [] });
  });
});

describe("Visitors (GA24)", () => {
  test("people, new and returning, a day at a time, each list by people and visits, and Google signals off", async () => {
    const t = harness();
    // The last 30 days' returning visitors on Safari: a visit a day, each one a lead.
    const returning = Array.from({ length: 30 }, (_, at): Visit => ({
      date: shiftDay(NEWEST, -at), device: "mobile", channel: "Direct", source: "(direct)", landing: "/", page: "/",
      visitor: "returning", browser: "Safari", system: "iOS", sessions: 1, engaged: 1, seconds: 30, views: 2, events: { generate_lead: [1, 0] },
    }));
    const { siteId, user } = await collected(t, [...growing(), ...returning]);
    const args = { siteId, period: "30" as const, device: "" };
    const visitors = (await user.query(api.googleAnalyticsVisitorReads.analyticsVisitors, args))!;
    expect(visitors).toMatchObject({ preparing: false, missing: [], signals: "off" });
    expect(visitors.figures).toMatchObject({ visits: 30 * 34, visitsBefore: 30 * 16 });
    expect(visitors.points).toHaveLength(30);
    expect(visitors.points.every((point) => point.returning > 0 && point.new > 0)).toBe(true);
    // Returning visitors converted every time; new ones two leads in 33 visits a day — at least twice as often.
    expect(visitors.seen.says.map((phrase) => phrase.code)).toEqual(["people", "returnersConvert", "signalsOff"]);
    expect(visitors.seen.steps.map((step) => step.code)).toEqual(["reasonToReturn"]);
    const browsers = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...args, ...listArgs, list: "browser" });
    expect(browsers.rows.map((row) => [row.label, row.visits])).toEqual([["Chrome", 30 * 33], ["Safari", 30]]);
    expect(browsers.seen).toEqual({ says: [], steps: [] });
    const types = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...args, ...listArgs, list: "visitorType" });
    expect(types.rows.map((row) => row.label)).toEqual(["new", "returning"]);
  });
});

describe("Live (GA34)", () => {
  test("who is on the website now and the last 30 minutes, from Google's live figures, and nothing kept", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const google = fakeGoogle(growing());
    google.live = [
      { minutesAgo: 1, city: "London", page: "AI Agency", device: "desktop", views: 3 },
      { minutesAgo: 2, city: "London", page: "AI Agency", device: "mobile", views: 2, events: { generate_lead: 1 } },
      { minutesAgo: 3, city: "Guildford", page: "Home", device: "desktop", views: 1 },
      { minutesAgo: 20, city: "Leeds", page: "Home", device: "mobile", views: 4 },
      // Another country's visitor: counted like any other, as Google's own Realtime does (Anthony, 2026-10-13).
      { minutesAgo: 1, city: "Paris", page: "Home", device: "desktop", views: 9, country: "FR" },
    ];
    const kept = async () => await t.run(async (ctx) => (await ctx.db.query("googleAnalyticsLive").collect()).length);
    const before = await kept();
    const answer = await user.action(api.googleAnalyticsRealtime.askGoogleAnalyticsRealtime, { siteId, device: "", list: "pages" });
    expect(answer).toMatchObject({ ok: true, now: 4, people: 5, views: 19, conversions: { count: 1, eventName: "generate_lead", minutesAgo: 2 } });
    if (!answer.ok) throw new Error("unreachable");
    expect(answer.minutes).toHaveLength(30);
    expect(answer.minutes.slice(-4)).toEqual([1, 1, 2, 0]);
    expect(answer.rows.map((row) => [row.name, row.people, row.views])).toEqual([["Home", 3, 14], ["AI Agency", 2, 5]]);
    expect(answer.places.map((row) => [row.name, row.people])).toEqual([["London", 2], ["Guildford", 1], ["Leeds", 1], ["Paris", 1]]);
    expect(answer.countries.map((row) => [row.name, row.people])).toEqual([["GB", 4], ["FR", 1]]);
    expect(answer.seen).toEqual({
      says: [{ code: "onNow", a: 4, b: 3, text: "Home" }, { code: "converted", text: "generate_lead", a: 2 }],
      steps: [{ code: "seeConversions", link: "conversions", to: { segment: "conversions" } }],
    });
    // One device, and the events list.
    const phones = await user.action(api.googleAnalyticsRealtime.askGoogleAnalyticsRealtime, { siteId, device: "mobile", list: "events" });
    expect(phones).toMatchObject({ ok: true, now: 1, people: 2, rows: [{ name: "generate_lead", people: 1, times: 1 }], countries: [{ name: "GB", people: 2 }] });
    // Nothing is kept: no held list, no row of any kind.
    expect(await kept()).toBe(before);
  });
});

describe("Ask Hakken reads every Google Analytics screen (§18.6.8)", () => {
  /** An answer's own fields, whatever screen it is: the test reads what it asked for. */
  const fields = (answer: unknown) => answer as Record<string, unknown> & { rows?: Array<Record<string, unknown>> };

  test("each screen's figures as the screen shows them, with its link; a website not the company's has none", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
    const read = async (screen: (typeof ANALYTICS_SCREENS)[number], extra: Record<string, string> = {}) =>
      fields(await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "https://www.acme-shop.test/", screen, days: 30, ...extra }));

    const overview = await read("overview");
    const shown = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "30", device: "" });
    expect(overview).toMatchObject({
      ok: true, website: "acme-shop.test", screen: "overview", currency: "GBP",
      now: { visits: shown.now!.visits, pageViews: shown.now!.views, conversions: shown.now!.conversions, value: shown.now!.value / 100 },
      theSpanBefore: { visits: shown.before!.visits },
      link: `/app/analytics/${siteId}?period=30`,
    });

    const landing = await read("landingPages");
    const landingShown = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    expect(landing.rows!.map((row) => [row.name, row.visits, row.conversions])).toEqual(landingShown.rows.map((row) => [row.label.replace("https://www.acme-shop.test", ""), row.visits, row.conversions]));

    const channel = await read("channel", { key: "Organic Search" });
    expect(channel.rows!.map((row) => row.name)).toEqual(["google"]);
    expect(channel.link).toBe(`/app/analytics/${siteId}/channels/channel?period=30&key=Organic+Search`);
    // The parts above its table, as its page shows them (ga-channel-pages-plan.md CH3–CH6).
    const channelTop = await user.query(api.googleAnalyticsChannelReads.analyticsChannelTop, { siteId, period: "30", device: "", channel: "Organic Search" });
    expect(channel.conversionsItStarted).toMatchObject({ now: channelTop.figures!.started });
    expect((channel.whereItLands as Array<{ visits: number }>).map((kind) => kind.visits)).toEqual(channelTop.kinds.map((kind) => kind.visits));
    const channels = await read("channels");
    expect((channels.whatAVisitIsWorth as unknown[]).length).toBeGreaterThan(0);
    expect((channels.whereEachChannelLands as Array<{ channel: string }>).map((row) => row.channel)).toContain("Organic Search");

    const page = await read("page", { key: "https://www.acme-shop.test/ai-agency/" });
    expect(page).toMatchObject({ ok: true, page: "https://www.acme-shop.test/ai-agency/", figures: { pageViews: 30 * 18 + 30 * 2 } });

    const events = await read("events");
    expect((events.events as Array<{ event: string; times: number }>).find((row) => row.event === "generate_lead")?.times).toBe(60);
    const event = await read("event", { key: "generate_lead" });
    expect(event).toMatchObject({ ok: true, event: "generate_lead", countsAsConversion: true, figures: { times: 60, timesBefore: 30 } });

    const conversions = await read("conversions");
    const conversionsShown = await user.query(api.googleAnalyticsReads.analyticsConversions, { siteId, period: "30", device: "" });
    expect(conversions.kinds).toEqual(conversionsShown.kinds.map((kind) => ({ event: kind.eventName, count: kind.count, countBefore: kind.countBefore, value: kind.value === null ? null : kind.value / 100 })));

    expect(await read("visitors")).toMatchObject({ ok: true, figures: { visits: 30 * 33 }, googleSignals: "off" });
    expect(await read("products")).toMatchObject({ ok: false });

    // Another company's website, or none at all: never read.
    const stranger = fields(await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "rival.test", screen: "overview", days: 30 }));
    expect(stranger).toMatchObject({ ok: false });
  });

  test("Live, asked of Google as the Live page asks it, and kept no more than it is", async () => {
    const t = harness();
    const { siteId } = await collected(t, growing());
    const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
    const google = fakeGoogle(growing());
    google.live = [
      { minutesAgo: 1, city: "London", page: "AI Agency", device: "desktop", views: 3 },
      { minutesAgo: 12, city: "Leeds", page: "Home", device: "mobile", views: 1, events: { generate_lead: 1 } },
      { minutesAgo: 3, city: "Berlin", page: "Home", device: "desktop", views: 1, country: "DE" },
    ];
    const answer = fields(await t.action(internal.assistantAnalyticsReads.googleAnalyticsLiveInternal, { companyId, website: "acme-shop.test" }));
    expect(answer).toMatchObject({
      ok: true, website: "acme-shop.test", onTheWebsiteNow: 2, peopleInTheLast30Minutes: 3, pageViewsInTheLast30Minutes: 5,
      countries: [{ country: "GB", people: 2 }, { country: "DE", people: 1 }],
      conversionsInTheLast30Minutes: { count: 1, eventName: "generate_lead", minutesAgo: 12 },
      link: `/app/analytics/${siteId}/live`,
    });
    expect(await t.run(async (ctx) => (await ctx.db.query("googleAnalyticsLive").collect()).length)).toBe(0);
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
    // Pages shown but rarely clicked: Search Console's Almost there for the same website.
    expect(overview.seen.steps.at(-1)).toEqual({ code: "push", link: "pagesToPush", to: { url: `/app/search-console/${siteId}/almost-there` } });
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
    expect(pages.seen.says[0]).toMatchObject({ code: "viewedAll", a: 3, b: 3 });
  });

  test("All pages' Views a day: the ticked pages asked of Google in one go, each held by its number, each adding up to its row", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const all = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    const ticked = all.rows.filter((row) => row.key.startsWith("~")).slice(0, 2);
    const args = { siteId, period: "30" as const, device: "", pages: ticked.map((row) => row.key) };
    // From each page held over time (ga-stored-figures-plan.md SF5), filled by itself after the first collection.
    const drawn = await user.query(api.googleAnalyticsPageReads.analyticsPagesDaily, args);
    for (const [index, page] of drawn.pages.entries()) {
      expect(page.address).toBe(ticked[index].label);
      expect(page.points).toHaveLength(30);
      expect(page.points!.reduce((sum, point) => sum + point.views, 0)).toBe(ticked[index].views);
    }
    // Five at most, whatever is asked; anything but a page number is not drawn.
    const many = await user.query(api.googleAnalyticsPageReads.analyticsPagesDaily, { ...args, pages: [...args.pages, "~x1", "~x2", "~x3", "~x4", "https://www.acme-shop.test/"] });
    expect(many.pages).toHaveLength(5);
  });

  test("All pages whole: the website's own pages nobody viewed, each filter counted, sorted by the views gained, downloaded as filtered", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    // Sites → Your pages: the home page again (one row, not two), and two pages nobody viewed.
    await t.run(async (ctx) => {
      // Collecting built one from what Analytics saw: replaced, as a rebuild would.
      for (const held of await ctx.db.query("siteListCopies").withIndex("by_kind_key", (q) => q.eq("kind", YOUR_PAGES_COPY).eq("key", `${siteId}`)).collect()) await ctx.db.delete(held._id);
      const rows = [["/", null, 1, 1, 50, 1, "HOME"], ["/pricing/", null, 1, 1, 9, 1, "SERVICE"], ["/about/", null, 1, 0, 2, 0, "BRAND"]];
      await ctx.db.insert("siteListCopies", { kind: YOUR_PAGES_COPY, key: `${siteId}`, buildId: "b1", fields: [...YOUR_PAGES_FIELDS], rows: rows.length, parts: 1, cut: null, meta: {}, builtAt: 1 });
      await ctx.db.insert("siteListCopyParts", { kind: YOUR_PAGES_COPY, key: `${siteId}`, buildId: "b1", part: 0, data: encodeCopyRows(rows, YOUR_PAGES_FIELDS.length) });
    });
    const all = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs, move: "all", sort: "viewsChange" });
    expect(all.moves).toEqual({ all: 5, gains: 3, dropped: 0, static: 0, none: 2 });
    expect(all.rows.map((row) => [new URL(row.label).pathname, row.views - (row.viewsBefore ?? 0)])).toEqual([["/", 600], ["/ai-agency/", 330], ["/contact/", 90], ["/about/", 0], ["/pricing/", 0]]);
    expect(all.seen.says[0]).toEqual({ code: "viewedOf", a: 3, b: 5, c: 2 });
    expect(all.seen.steps.at(-1)).toMatchObject({ code: "noVisitsTwo", text: "/pricing/", more: "/about/", to: { segment: "all-pages", filters: { move: "none" } } });
    const none = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs, move: "none" });
    expect(none.rows.map((row) => [new URL(row.label).pathname, row.views, row.key.startsWith("~")])).toEqual([["/about/", 0, false], ["/pricing/", 0, false]]);
    expect(none.total).toBe(2);
    const download = await user.query(api.googleAnalyticsReads.analyticsListAll, { siteId, list: "page", period: "30", device: "", move: "gains" });
    expect(download.rows).toHaveLength(3);
  });

  test("a device's box weighs it against every device, both kept by the collection", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
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
    expect(site).toMatchObject({ visits: 990, visitsBefore: 480, counting: true, checks: 12 });
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
    // The log counts every page twice a visit or more: the ninth check fails too (analytics-page-screen-plan.md, phase 6).
    // And "sign_up" is counted but never happens in 640 visits: a conversion that never happens (conversion-checks-plan.md CC4).
    expect(health.checks.filter((check) => !check.passing).map((check) => check.check)).toEqual(["NO_VALUE", "STRANGERS", "COUNTED_AGAIN", "NEVER_HAPPENS"]);
    expect(health.checks.find((check) => check.check === "NEVER_HAPPENS")).toMatchObject({ names: ["sign_up"], count: 90 });
    const told = async () => (await t.run(async (ctx) => await ctx.db.query("notifications").collect())).filter((row) => row.kind === "GOOGLE_ANALYTICS_HEALTH");
    expect((await told()).map((row) => row.title)).toEqual([
      "acme-shop.test: a conversion has no value", "acme-shop.test: visits on another address", "acme-shop.test: pages counted more than once a visit",
      "acme-shop.test: a conversion never happens",
    ]);
    // System alerts: the platform's super admins, never the company's own admins.
    const rows = await told();
    const roles = await t.run(async (ctx) => await Promise.all(rows.map(async (row) => (await ctx.db.get(row.userId))?.role)));
    expect(new Set(roles)).toEqual(new Set(["SUPER_ADMIN"]));
    // Saved again with the same gap: no second bell.
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, { siteId, events: [{ eventName: "click_tel", counted: true, hakkenValue: null }] });
    await finishScheduled(t);
    expect(await told()).toHaveLength(4);
    // Given a value: the check passes.
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, { siteId, events: [{ eventName: "click_tel", counted: true, hakkenValue: 150 }] });
    await finishScheduled(t);
    const after = (await t.run(async (ctx) => await ctx.db.get(connectionId)))!.health!;
    expect(after.checks.find((check) => check.check === "NO_VALUE")?.passing).toBe(true);
  });
});

describe("Landing pages' flow (landing-pages-flow-plan.md LF2, LF4, LF5)", () => {
  /** The last 30 days: visits landing on /, a share going on to /about-us/ and from there to /contact/, converting; /ai-agency/'s all leaving. */
  function routes(): Visit[] {
    const day = (at: number) => shiftDay(NEWEST, -at);
    const base = { device: "desktop", channel: "Organic Search", source: "google", seconds: 30 };
    return Array.from({ length: 30 }, (_, at): Visit[] => [
      { ...base, date: day(at), landing: "/", page: "/", sessions: 5, engaged: 5, views: 5 },
      { ...base, date: day(at), landing: "/", page: "/about-us/", referrer: "https://www.acme-shop.test/", sessions: 2, engaged: 2, views: 2 },
      { ...base, date: day(at), landing: "/", page: "/contact/", referrer: "https://www.acme-shop.test/about-us/", sessions: 1, engaged: 1, views: 1, events: { generate_lead: [1, 0] } },
      { ...base, date: day(at), landing: "/ai-agency/", page: "/ai-agency/", sessions: 3, engaged: 1, views: 3 },
    ]).flat();
  }

  test("the chart, from what each collection keeps: visits landed, left there and went on, two steps on, conversions where made", async () => {
    const t = harness();
    const { siteId, user, google } = await collected(t, routes());
    const asked = google.calls.length;
    const flow = await user.query(api.googleAnalyticsFlowReads.analyticsLandingFlow, { siteId, period: "30", device: "" });
    expect(google.calls.length).toBe(asked);
    expect(flow.held).toBe(true);
    const node = (column: number, path: string) => flow.nodes.find((one) => one.column === column && one.path?.endsWith(path));
    // 150 landed on /, 60 of them went on (counted once a visit): 90 left. All 90 on /ai-agency/ left.
    expect(node(0, "/")).toMatchObject({ visits: 150, left: 90, conversions: 0 });
    expect(node(0, "/ai-agency/")).toMatchObject({ visits: 90, left: 90 });
    // On to /about-us/, 30 of its 60 going on to /contact/, where the 30 conversions were made.
    expect(node(1, "/about-us/")).toMatchObject({ visits: 60, left: 30 });
    expect(node(2, "/contact/")).toMatchObject({ visits: 30, conversions: 30 });
    expect(flow.bands.find((band) => band.to === node(2, "/contact/")!.id)).toMatchObject({ visits: 30, conversions: 30 });
    expect(flow.columns[0]).toMatchObject({ visits: 240, left: 180 });
  });

  test("the table: each landing page's visits that went on, and the page most of them opened next, sorted over the whole list", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, routes());
    const list = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, sort: "left" });
    // The fewest leaving first: / (60 went on) before /ai-agency/ (none).
    expect(list.rows.map((row) => [row.label.replace("https://www.acme-shop.test", ""), row.visits, row.onward, row.next?.page.replace("https://www.acme-shop.test", "") ?? null])).toEqual([
      // The test's Google counts each line of its log as visits of their own, so / holds 240 here.
      ["/", 240, 60, "/about-us/"],
      ["/ai-agency/", 90, 0, null],
    ]);
    expect(list.rows[0].next?.share).toBe(1);
  });

  test("only the caller's own website", async () => {
    const t = harness();
    const { siteId, rival } = await collected(t, routes());
    await expect(rival.query(api.googleAnalyticsFlowReads.analyticsLandingFlow, { siteId, period: "30", device: "" })).rejects.toThrow();
  });
});
