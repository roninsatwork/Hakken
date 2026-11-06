import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { analyticsPartsOf, type ANALYTICS_SCREENS } from "./utils/analyticsScreens";
import { flowBoxes } from "./utils/landingFlowRoutes";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { PROPERTY, dayOf, fakeGoogle, history, type Visit } from "@/src/test/googleAnalyticsFake";
import { shiftDay } from "./searchConsoleDays";
import { DOWNLOAD_PART } from "./googleAnalyticsReads";
import { YOUR_PAGES_COPY, YOUR_PAGES_FIELDS } from "./holdPages";
import { encodeCopyRows } from "./utils/copyColumns";
import { keyedRead } from "./utils/agentTools";
import { factsByKey } from "./utils/insightFacts";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { ASSISTANT_TASK_HANDLERS } from "./assistantTaskHandlers";
import { ASSISTANT_CHART_HANDLERS } from "./assistantChartHandlers";
import { renderOutboxRow } from "./outboxTemplates";
import { chartFromToolCalls } from "./utils/assistantCharts";

/**
 * What the Google Analytics screens read (docs/plans/active/google-analytics-plan.md
 * §5, §6), from a property collected with Google faked: Overview's figures
 * against the span before and what changed most; the standard tables searched,
 * sorted and paged on the server, AI assistants as a channel of their own;
 * conversions worked out when read, Analytics' values first and Hakken's
 * filling the gaps; a landing page's own screen; and only the caller's own
 * website.
 */

/**
 * The morning of 1 October 2026, so the property's newest whole day is 30 September and Last month — what the
 * screens open on (calendar-periods-plan.md) — is the whole of September: the logs' last 30 days, set against August.
 */
const NOW = Date.parse("2026-10-01T09:30:00Z");
/** The newest whole day Google has sent: yesterday, on the property's own day. */
const TOP = "2026-09-30";
/** Search Console's newest day, a day behind Google Analytics'. */
const SEARCH_CONSOLE_NEWEST = shiftDay(TOP, -1);
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/**
 * A website collected from the log given, with generate_lead worth £250 in Hakken and sign_up £10 in Analytics —
 * holding the page addresses `numbered` first, as Search Console or Bing would have numbered them.
 */
async function collected(t: Harness, visits: Visit[], numbered: string[] = []) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "User", email: "user@acme-shop.test", role: "USER", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    if (numbered.length > 0) await ctx.db.insert("holdPageAddresses", { companyWebsiteId: siteId, record: 0, addresses: numbered });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "COUNTING", property: PROPERTY, propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [], timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
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
  // The first night: the two-year fills follow its run (ga-big-site-reliability-plan.md BR7).
  await t.mutation(internal.googleAnalyticsFillAfter.startFills, { connectionId: ids.connectionId });
  await finishScheduled(t);
  return { ...ids, google, admin, user: t.withIdentity({ subject: ids.userId }), rival: t.withIdentity({ subject: ids.rivalId }) };
}

/** Last month (September's 30 days) at twice the visits and leads of the 30 days before, and an AI assistant's visits. */
function growing(): Visit[] {
  const visits: Visit[] = [];
  for (let at = 0; at < 60; at += 1) visits.push(...dayOf(shiftDay(TOP, -at), at < 30 ? 2 : 1));
  for (let at = 0; at < 30; at += 1) {
    visits.push({
      date: shiftDay(TOP, -at), device: "mobile", channel: "Referral", source: "chatgpt.com", landing: "/ai-agency/", page: "/ai-agency/",
      sessions: 1, engaged: 1, seconds: 60, views: 2, events: { sign_up: [1, 10] },
    });
  }
  return visits;
}

type CollectedFixture = Awaited<ReturnType<typeof collected>> & { t: Harness };
let growingFixture: Promise<CollectedFixture> | undefined;

/**
 * Read-only tests share one real collection. Repeating the same two-year fill
 * in every test made this read contract one of CI's longest files without
 * exercising another path. Tests that change stored data or call Google keep
 * their own isolated collection below.
 */
function collectedGrowing(): Promise<CollectedFixture> {
  if (!growingFixture) {
    growingFixture = (async () => {
      const t = harness();
      return { t, ...(await collected(t, growing())) };
    })();
  }
  return growingFixture;
}

const listArgs = { period: "lastMonth" as const, device: "", page: 1, rows: 25 };

beforeEach(() => {
  useFixedDay("2026-10-01");
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from(new Uint8Array(32).fill(7)).toString("base64"));
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Overview", () => {
  test("visits, engaged visits, conversions and value against the month before, and what changed most", async () => {
    const { siteId, user } = await collectedGrowing();
    const overview = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "lastMonth", device: "" });
    // 30 days at twice the plain day (32 visits), plus the assistant's one a day.
    expect(overview.now).toMatchObject({ visits: 30 * 33, engaged: 30 * 23, conversions: 30 * (2 + 2 + 1) });
    expect(overview.before).toMatchObject({ visits: 30 * 16, conversions: 30 * 2 });
    // Leads at £250 set in Hakken; sign-ups at Analytics' own £10; calls have no value anywhere.
    expect(overview.now?.value).toBe(30 * 2 * 25_000 + 30 * 1_000);
    expect(overview.now?.unvalued).toBe(30 * 2);
    expect(overview.changedMost[0]).toMatchObject({ kind: "landing", label: "https://www.acme-shop.test/" });
    expect(overview.changedMost.map((row) => row.kind)).toContain("channel");
  });

  test("the chart: a day a point from the days kept, for the month", async () => {
    const { siteId, user } = await collectedGrowing();
    const chart = await user.query(api.googleAnalyticsChartReads.analyticsChart, { siteId, period: "lastMonth", device: "" });
    expect(chart.points).toHaveLength(30);
    expect(chart.events).toEqual(["generate_lead", "click_tel", "sign_up"]);
    expect(chart.points.at(-1)).toMatchObject({ day: TOP, visits: 33, conversions: 5, events: [2, 2, 1] });
  });
});

describe("the standard tables", () => {
  test("Channels: AI assistants a channel of their own, sorted by value, paged on the server", async () => {
    const { siteId, user } = await collectedGrowing();
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
    const { siteId, user } = await collectedGrowing();
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
    const visits = history(10, TOP).map((visit) => (visit.landing === "/ai-agency/" ? { ...visit, landing: "/ai-agency" } : visit));
    const { siteId, user } = await collected(t, visits);
    const landing = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    const pages = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    const landed = landing.rows.find((row) => row.label.includes("ai-agency"))!;
    const viewed = pages.rows.find((row) => row.label.includes("ai-agency"))!;
    expect(landed.label).toBe("https://www.acme-shop.test/ai-agency/");
    expect(landed.key).toBe(viewed.key);
  });

  test("a page list for one device is read from what the collection kept, never asked of Google", async () => {
    const { siteId, user } = await collectedGrowing();
    const after = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, device: "mobile" });
    expect(after.live).toBe(false);
    expect(after.rows.map((row) => [row.label, row.visits])).toEqual([
      ["https://www.acme-shop.test/", 600], ["https://www.acme-shop.test/ai-agency/", 30],
    ]);
  });

  test("a device's list not built yet by a run waits for the next one: every device's is shown meanwhile, nothing asked of Google", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    // As on the day lists became kept by device: this device's Last month not built yet.
    await t.run(async (ctx) => {
      const slot = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", siteId).eq("key", "landing|lastMonth|NOW|mobile")).first();
      if (slot) await ctx.db.delete(slot._id);
    });
    const before = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, device: "mobile" });
    expect(before).toMatchObject({ live: true, rows: [] });
    // The screen shows every device's list beside it (`AnalyticsListScreen`): that one is held.
    const every = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    expect(every.live).toBe(false);
  });

  test("only the caller's own website", async () => {
    const { siteId, rival } = await collectedGrowing();
    await expect(rival.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "channel", ...listArgs })).rejects.toThrow("not one your company holds");
    await expect(rival.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "lastMonth", device: "" })).rejects.toThrow("not one your company holds");
  });
});

describe("Conversions", () => {
  test("each kind with its count against the span before; its value kept for Ask Hakken alone", async () => {
    const { siteId, user } = await collectedGrowing();
    const conversions = await user.query(api.googleAnalyticsReads.analyticsConversions, { siteId, period: "lastMonth", device: "" });
    // No screen shows money (Anthony, 2026-11-03: "Take money off"): only Ask Hakken reads each kind's value.
    expect(conversions.kinds).toEqual([
      { eventName: "generate_lead", count: 60, countBefore: 30, value: 60 * 25_000 },
      { eventName: "click_tel", count: 60, countBefore: 30, value: null },
      { eventName: "sign_up", count: 30, countBefore: 0, value: 30 * 1_000 },
    ]);
    expect(conversions.shop).toBeNull();
    // Only one conversion's landing pages.
    const leads = await user.query(api.googleAnalyticsReads.analyticsTopList, { siteId, list: "landing", period: "lastMonth", device: "", eventName: "sign_up" });
    expect(leads.rows.map((row) => row.label)).toEqual(["https://www.acme-shop.test/ai-agency/"]);
  });

  test("a value set in Hakken re-prices all history at once, with nothing rewritten", async () => {
    const t = harness();
    const { siteId, admin, user } = await collected(t, growing());
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId, events: [{ eventName: "generate_lead", counted: true, hakkenValue: 100 }, { eventName: "click_tel", counted: true, hakkenValue: 50 }],
    });
    const overview = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "lastMonth", device: "" });
    expect(overview.now?.value).toBe(60 * 10_000 + 60 * 5_000 + 30 * 1_000);
    expect(overview.before?.value).toBe(30 * 10_000 + 30 * 5_000);
  });
});

describe("a landing page's own screen", () => {
  test("its figures from the ready-made list, its chart from the page held over time and its channels from those kept, never asked of Google", async () => {
    const { siteId, user } = await collectedGrowing();
    const landing = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    const page = landing.rows.find((row) => row.label.endsWith("/ai-agency/"))!.key;
    const opened = (await user.query(api.googleAnalyticsPageReads.analyticsLandingPage, { siteId, page, period: "lastMonth", device: "" }))!;
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
    const args = { siteId, page, period: "lastMonth" as const, device: "" };
    // Its views a day from the page held over time, and where they came from, kept for every page (ga-stored-figures-plan.md SF5, SF13).
    // Its own figures and its story, read side by side as the screen reads them.
    const opened = { ...(await user.query(api.googleAnalyticsPageReads.analyticsPage, args))!, ...(await user.query(api.googleAnalyticsPageReads.analyticsPageStory, args))! };
    expect(opened).toMatchObject({ address: "https://www.acme-shop.test/ai-agency/", path: "/ai-agency/", live: false, viewsBefore: 30 * 9 });
    expect(opened.row).toMatchObject({ views: 30 * 18 + 30 * 2 });
    expect(opened.points).toHaveLength(30);
    expect(opened.points.reduce((sum, point) => sum + point.views, 0)).toBe(600);
    expect(opened.before).toMatchObject([
      { kind: "page", key: home, label: "https://www.acme-shop.test/", views: 540, share: 0.9 },
      { kind: "site", key: "chatgpt.com", label: "ChatGPT", views: 60, share: 0.1 },
    ]);
    // Its story as the redone screen shows it (page-screen-redo-plan-2026-11-03.md, item 13): the visits that started on
    // it, kept with the landing pages, and the source that sent most of them; never the page before, which it no longer shows.
    expect(opened.seen.says.map((phrase) => phrase.code)).toEqual(["startedMore", "biggest", "phones"]);
    expect(opened.seen.says[1]).toEqual({ code: "biggest", text: "Perplexity", a: 240, b: 60 });
    // Its phones' share of its views against the whole website's, far apart (a tenth against nearly two-thirds).
    expect(opened.seen.says[2]).toEqual({ code: "phones", a: 0.1, b: expect.closeTo(0.636, 3) });
    expect(opened.seen.steps).toEqual([]);
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
      const date = shiftDay(TOP, -at);
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
    const args = { siteId, page, period: "lastMonth" as const, device: "" };
    const first = { ...(await user.query(api.googleAnalyticsPageReads.analyticsPage, args))!, ...(await user.query(api.googleAnalyticsPageReads.analyticsPageStory, args))! };
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
    // The box: the visits that started here, and the source that sent most of them, with none converting.
    expect(opened.seen.says.map((phrase) => phrase.code)).toEqual(["started", "biggestNone", "phones"]);
    expect(opened.seen.says[1]).toEqual({ code: "biggestNone", text: "Google", a: 300 });
    // First visit or back again by the visits that started here, which add up to them as the figure and the table do.
    expect(story.returning).toMatchObject({ first: 300, back: 90, unknown: 0 });
    // Ask Hakken draws the same page's readers (page-screen-redo-plan-2026-11-03.md, step 5): by device and by day of the
    // week, from the page's own screen; never its conversions, which Google counts each time.
    const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
    const pageChart = { companyId, website: "acme-shop.test", period: "lastMonth" as const, kind: "bars" as const, measure: "visits" as const, source: "analytics" as const, page: "/hub/prism/" };
    const byDevice = await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...pageChart, by: "device" });
    expect(byDevice).toMatchObject({ ok: true, chart: { by: "device", link: expect.stringContaining(`all-pages/page?key=${encodeURIComponent(page)}`) } });
    expect(await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...pageChart, by: "weekday" })).toMatchObject({ ok: true, chart: { by: "weekday" } });
    expect(await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...pageChart, by: "device", measure: "conversions" })).toMatchObject({ ok: false });
    // Age without a page is the whole website's, as Visits' bars draw it (visits-redo-plan-2026-11-03.md, step 3): visits
    // only, never conversions; the day of the week is one page's alone.
    const { page: _page, ...website } = pageChart;
    expect(await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...website, by: "age" })).toMatchObject({ ok: true, chart: { by: "age", link: expect.stringContaining("/visits?view=age") } });
    expect(await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...website, by: "age", measure: "conversions" })).toMatchObject({ ok: false });
    expect(await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...website, by: "weekday" })).toMatchObject({ ok: false });
    expect((story.returning?.first ?? 0) + (story.returning?.back ?? 0) + (story.returning?.unknown ?? 0)).toBe(story.started?.visits);
    // Google sent most of its visits and none converted: a look at that channel across the website.
    expect(opened.seen.steps).toEqual([{ code: "seeChannel", text: "Google", link: "channel", to: { segment: "channels/channel", filters: { key: "Organic Search" } } }]);
  });

  test("the visits that started on it, when Analytics' address for it without the slash was numbered too (morehandles.co.uk's tubular latch guide, 2026-11-03)", async () => {
    const t = harness();
    // Analytics names the landing page without the slash All pages keeps, and another section had numbered that address.
    const visits = article().map((visit) => (visit.landing === "/hub/prism/" ? { ...visit, landing: "/hub/prism" } : visit));
    const { siteId, user } = await collected(t, visits, ["https://www.acme-shop.test/hub/prism"]);
    const all = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    const page = all.rows.find((row) => row.label === "https://www.acme-shop.test/hub/prism/")!.key;
    const args = { siteId, page, period: "lastMonth" as const, device: "" };
    const { story } = (await user.query(api.googleAnalyticsPageReads.analyticsPageStory, args))!;
    expect(story.started).toMatchObject({ visits: 30 * 13, conversions: 30 });
    expect(story.sources.map((row) => [row.name ?? row.source, row.visits])).toEqual([["Google", 300], ["(direct)", 90]]);
    expect(story.returning).toMatchObject({ first: 300, back: 90 });
    // Its visits by channel, from the landing pages by channel.
    const grid = (await user.query(api.googleAnalyticsPageConversions.analyticsPageConversionGrid, args))!;
    expect(grid.channels.map((row) => [row.channel, row.visits, row.conversions])).toEqual([["Organic Search", 300, 0], ["Direct", 90, 30]]);
  });
});

describe("Events and an event's own screen (GA30)", () => {
  /** The last 30 days' scrolls and clicks off the website, on the home page: five scrolls and two clicks a day, in one visit. */
  function clicks(): Visit[] {
    return Array.from({ length: 30 }, (_, at): Visit => ({
      date: shiftDay(TOP, -at), device: "desktop", channel: "Organic Search", source: "google", landing: "/", page: "/",
      sessions: 1, engaged: 1, seconds: 10, views: 1, events: { scroll: [5, 0], click: [2, 0] },
      about: { linkUrl: "https://www.linkedin.com/company/acme", percentScrolled: "90" },
    }));
  }

  let clicksFixture: Promise<CollectedFixture> | undefined;
  const collectedClicks = () => {
    if (!clicksFixture) {
      clicksFixture = (async () => {
        const t = harness();
        return { t, ...(await collected(t, [...growing(), ...clicks()])) };
      })();
    }
    return clicksFixture;
  };

  test("every event against the span before, what counts among them, scrolls and link clicks a day", async () => {
    const { siteId, user } = await collectedClicks();
    const args = { siteId, period: "lastMonth" as const, device: "" };
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
    const { siteId, user } = await collectedClicks();
    // Globals are restored after every test, so this test installs its own
    // Google endpoint while reusing only the read-only collected rows.
    const google = fakeGoogle([...growing(), ...clicks()]);
    const args = { siteId, event: "click", period: "lastMonth" as const, device: "" };
    const first = (await user.query(api.googleAnalyticsEventReads.analyticsEvent, args))!;
    // What it was about and its pages, kept for every event by each collection (ga-stored-figures-plan.md SF13, SF15).
    expect(first).toMatchObject({ kind: "measured", counted: false, detail: "linkUrl", live: false, afterLive: true, after: null });
    expect(first.about).toEqual([{ key: "https://www.linkedin.com/company/acme", label: "linkedin.com/company/acme", times: 60, people: 30, change: null }]);
    expect(first.pages).toMatchObject([{ label: "https://www.acme-shop.test/", times: 60 }]);
    expect(first.figures).toMatchObject({ times: 60, timesBefore: 0, visits: 30, visitsShare: 30 / (30 * 34) });
    expect(first.points.reduce((sum, point) => sum + point.times, 0)).toBe(60);

    // Only its funnel is asked of Google, and kept a week (SF8).
    const asked = google.calls.length;
    await user.action(api.googleAnalyticsLive.askEventFunnel, { siteId, period: "lastMonth", device: "", event: "click" });
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
      date: shiftDay(TOP, -at), device: "mobile", channel: "Organic Social", source: "linkedin.com", landing: "/ai-agency/", page: "/ai-agency/",
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
    const chart = await user.query(api.googleAnalyticsChartReads.analyticsCampaignChart, { siteId, period: "lastMonth", device: "" });
    expect(chart.points).toHaveLength(30);
    expect(chart.points.every((point) => point.visits === 1)).toBe(true);
    // One device's campaigns are kept by the collection (SF3): read at once, never asked of Google.
    const phones = { ...args, list: "campaign" as const, device: "desktop" };
    const desktop = await user.query(api.googleAnalyticsReads.analyticsListPage, phones);
    expect(desktop).toMatchObject({ live: false, rows: [] });
  });

  /**
   * The new page (docs/plans/active/campaigns-new-page-plan-2026-11-05.md): three campaigns over September and August, whose figures
   * are easy to check by hand. Google Ads' Zombies falls from 4 visits a day to 2. Brand doubles, and sells. A Facebook ad with no name
   * of its own arrives only in September and sells nothing.
   */
  const CAMPAIGN_NOW = 30;
  function campaignVisits(): Visit[] {
    const visit = (date: string, campaign: string, source: string, medium: string, sessions: number, extra: Partial<Visit> = {}): Visit => ({
      date, device: "desktop", channel: "Paid Search", source, landing: "/shop/", page: "/shop/", campaign, medium, sessions, engaged: sessions - 1, seconds: 20, views: sessions, ...extra,
    });
    const visits: Visit[] = [];
    for (let at = 0; at < 60; at += 1) {
      const date = shiftDay(TOP, -at);
      const now = at < CAMPAIGN_NOW;
      visits.push(...dayOf(date, 1));
      visits.push(visit(date, "Zombies", "google", "cpc", now ? 2 : 4, { events: { generate_lead: [1, 0] } }));
      visits.push(visit(date, "Brand", "google", "cpc", now ? 4 : 2, { purchases: now ? 2 : 1, revenue: 5_000 }));
      if (now) visits.push(visit(date, "52536031490414", "fb", "paid", 3));
    }
    return visits;
  }
  const askCampaigns = async (t: Harness, siteId: Id<"companyWebsites">, extra: Record<string, unknown> = {}) => {
    const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
    return (await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "acme-shop.test", screen: "campaigns", period: "lastMonth", ...extra } as never)) as never as Record<string, unknown> & {
      rows: Array<Record<string, unknown>>; boxes: Record<string, unknown>; chart: { rows: Array<Record<string, number>>; theDatesBefore?: Array<Record<string, number>> };
      whatPeopleDid: { things: string[]; campaigns: Array<{ name: string; cameFrom: string; visits: number; did: Array<Record<string, unknown>> }> };
    };
  };

  test("each campaign's visits and what it sold against the dates before, its place in plain words, in any order, and the whole list's totals", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, campaignVisits());
    const ask = (extra: Record<string, unknown> = {}) => user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, ...listArgs, list: "campaign", ...extra } as never);
    const answer = await ask();
    expect(answer.rows.map((row) => [row.label, row.cameFrom, row.visits, row.visitsBefore, row.purchases, row.purchasesBefore])).toEqual([
      ["Brand", "googleAds", 120, 60, 60, 30],
      ["52536031490414", "facebookAd", 90, 0, 0, 0],
      ["Zombies", "googleAds", 60, 120, 0, 0],
    ]);
    expect(answer.cameFromChoices).toEqual([{ cameFrom: "googleAds", visits: 180 }, { cameFrom: "facebookAd", visits: 90 }]);
    // The whole list's own, whichever page of it's on screen.
    expect(answer.campaignTotals).toMatchObject({ visits: 270, visitsBefore: 180, bought: 60, boughtBefore: 30 });
    const onePage = await ask({ rows: 1 });
    expect(onePage.campaignTotals).toEqual(answer.campaignTotals);
    // Each order, over the whole list.
    const firstOf = async (sort: string, direction: string) => (await ask({ sort, direction })).rows[0]!.label;
    expect(await firstOf("visitsBefore", "desc")).toBe("Zombies");
    expect(await firstOf("visitsChange", "desc")).toBe("52536031490414");
    expect(await firstOf("visitsChange", "asc")).toBe("Zombies");
    expect(await firstOf("bought", "desc")).toBe("Brand");
    // One place alone: the rows and the totals both.
    const ads = await ask({ cameFrom: "googleAds" });
    expect(ads.rows.map((row) => row.label)).toEqual(["Brand", "Zombies"]);
    expect(ads.total).toBe(2);
    expect(ads.campaignTotals).toMatchObject({ visits: 180, visitsBefore: 180, bought: 60 });
    expect(ads.cameFromChoices).toEqual(answer.cameFromChoices);
  });

  test("the chart's days hold each figure, follow one place, and bring the same days of the dates before", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, campaignVisits());
    const chart = await user.query(api.googleAnalyticsChartReads.analyticsCampaignChart, { siteId, period: "lastMonth", device: "" });
    expect(chart.points).toHaveLength(30);
    expect(chart.points[0]).toMatchObject({ visits: 9, engaged: 6, bought: 2, conversions: 1 });
    // September against August, which has a day more: each day's drawn on the same date of its month.
    expect(chart.before).toMatchObject({ drawn: true, shift: 31 });
    expect(chart.before!.points.at(-1)).toMatchObject({ visits: 6, bought: 1 });
    const ads = await user.query(api.googleAnalyticsChartReads.analyticsCampaignChart, { siteId, period: "lastMonth", device: "", cameFrom: "facebookAd" });
    expect(ads.points[0]).toMatchObject({ visits: 3, engaged: 2, bought: 0, conversions: 0 });
    // A year's before is held in weeks and months, so it isn't drawn against.
    const year = await user.query(api.googleAnalyticsChartReads.analyticsCampaignChart, { siteId, period: "last12Months", device: "" });
    expect(year.before?.drawn ?? false).toBe(false);
  });

  test("what people did: the most counted things, times and visits apart, and one place's alone", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, campaignVisits());
    const did = await user.query(api.googleAnalyticsCampaignReads.analyticsCampaignActions, { siteId, period: "lastMonth", device: "" });
    expect(did.live).toBe(false);
    expect(did.rows.map((row) => row.label)).toEqual(["Brand", "52536031490414", "Zombies"]);
    const zombies = did.rows.find((row) => row.label === "Zombies")!;
    expect(did.events).toEqual(["generate_lead"]);
    expect(zombies.times).toEqual([30]);
    // The visits that did it, kept apart from the times: what a conversion rate is worked out from, so it can't pass 100%.
    expect(zombies.visitsDid).toEqual([30]);
    expect(did.rows.find((row) => row.label === "Brand")!.visitsDid).toEqual([0]);
    const ads = await user.query(api.googleAnalyticsCampaignReads.analyticsCampaignActions, { siteId, period: "lastMonth", device: "", cameFrom: "facebookAd" });
    expect(ads.rows.map((row) => row.label)).toEqual(["52536031490414"]);
  });

  test("Ask Hakken reads what the screen shows, on any date: the same figures, in the page's words, and never money", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, campaignVisits());
    for (const period of ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"] as const) {
      const screen = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, period, device: "", page: 1, rows: 25, list: "campaign", sort: "visits", direction: "desc" });
      const said = await askCampaigns(t, siteId, { period });
      expect(said.listed).toBe(screen.total);
      expect(said.rows.map((row) => row.visits)).toEqual(screen.rows.map((row) => row.visits));
      expect(said.rows.map((row) => row.visitsBefore)).toEqual(screen.rows.map((row) => row.visitsBefore));
      expect(said.rows.map((row) => row.conversions)).toEqual(screen.rows.map((row) => row.conversions));
      const boxes = await askCampaigns(t, siteId, { period, part: "boxes" });
      if (screen.campaignTotals) expect(boxes.boxes.visits).toBe(screen.campaignTotals.visits);
      const chart = await user.query(api.googleAnalyticsChartReads.analyticsCampaignChart, { siteId, period, device: "" });
      const drawn = await askCampaigns(t, siteId, { period, part: "chart" });
      expect((drawn.chart?.rows ?? []).map((row) => row.visits)).toEqual(chart.points.map((point) => point.visits));
      const did = await user.query(api.googleAnalyticsCampaignReads.analyticsCampaignActions, { siteId, period, device: "" });
      const told = await askCampaigns(t, siteId, { period, part: "did" });
      expect(told.whatPeopleDid.campaigns.map((row) => row.visits)).toEqual(did.rows.map((row) => row.visits));
      expect(told.whatPeopleDid.campaigns.map((row) => row.did.map((cell) => cell.times))).toEqual(did.rows.map((row) => row.times));
    }
    const told = await askCampaigns(t, siteId, { part: "did" });
    expect(told.whatPeopleDid.campaigns.find((row) => row.name === "Zombies")!.did).toEqual([{ thing: "generate lead", times: 30, timesPer100Visits: 50, visitsThatDidIt: 30, conversionRatePercent: 50 }]);
    const said = await askCampaigns(t, siteId);
    expect(said.rows[0]).toMatchObject({ name: "Brand", cameFrom: "Google Ads", visits: 120, visitsBefore: 60, upOrDown: 60, bought: 60, boughtBefore: 30, boughtPer100Visits: 50 });
    // A number's a name only to the ad platform. Nothing here speaks of money.
    expect(said.rows[1]).toMatchObject({ name: "Facebook ad with no name", cameFrom: "Facebook ad" });
    for (const part of [{}, { part: "boxes" }, { part: "chart" }, { part: "did" }]) {
      const answer = await askCampaigns(t, siteId, part);
      expect(answer).not.toHaveProperty("currency");
      expect(JSON.stringify(answer)).not.toMatch(/"value"|"revenue"/);
    }
    // Its rule says conversions count times, so a figure over 100 is never told as a percentage.
    expect(said.conversionsRule).toMatch(/not visits/);
    expect(said.conversionsRule).toMatch(/never call one a conversion rate/);
  });

  test("Ask Hakken reads in any order, one place in the page's words, the boxes against the whole website, and what to say when there are none", async () => {
    const t = harness();
    const { siteId } = await collected(t, campaignVisits());
    const first = async (order: string) => (await askCampaigns(t, siteId, { order })).rows[0]!.name;
    expect(await first("mostVisits")).toBe("Brand");
    expect(await first("gainedMostVisits")).toBe("Facebook ad with no name");
    expect(await first("lostMostVisits")).toBe("Zombies");
    expect(await first("mostBought")).toBe("Brand");
    expect(await first("mostConversions")).toBe("Zombies");
    const ads = await askCampaigns(t, siteId, { cameFrom: "google ads" });
    expect(ads).toMatchObject({ onlyFrom: "Google Ads", listed: 2 });
    expect(String(ads.link)).toContain("cameFrom=googleAds");
    const adBoxes = await askCampaigns(t, siteId, { cameFrom: "Google Ads", part: "boxes" });
    expect(adBoxes.boxes).toMatchObject({ visits: 180, visitsBefore: 180, bought: 60, boughtBefore: 30 });
    const boxes = await askCampaigns(t, siteId, { part: "boxes" });
    expect(boxes.boxes).toMatchObject({ visits: 270, visitsBefore: 180, bought: 60, boughtBefore: 30, shareOfAllBoughtPercent: 100 });
    const nowhere = await askCampaigns(t, siteId, { cameFrom: "Pinterest" });
    expect(nowhere.listed).toBe(0);
    expect(String(nowhere.message)).toMatch(/No campaign .* came from Pinterest/);
    expect(nowhere.placesCampaignsCameFrom).toEqual([{ cameFrom: "Google Ads", visits: 180 }, { cameFrom: "Facebook ad", visits: 90 }]);
  });

  test("a website with no campaigns is told so, with where to look next, and one that sells nothing speaks in conversions", async () => {
    const t = harness();
    const { siteId } = await collected(t, growing());
    const none = await askCampaigns(t, siteId);
    expect(none.listed).toBe(0);
    expect(String(none.message)).toMatch(/no visits from a campaign link in these dates.*last12Months/);
    const boxes = await askCampaigns(t, siteId, { part: "boxes" });
    expect(boxes.boxes).toMatchObject({ visits: 0, conversions: 0 });
    expect(boxes.boxes).not.toHaveProperty("bought");
    const did = await askCampaigns(t, siteId, { part: "did" });
    expect(did.whatPeopleDid).toEqual({ things: [], campaigns: [] });
  });
});

describe("Visits (GA24; visits-redo-plan-2026-11-03.md)", () => {
  test("visits, new and returning, a day at a time with the month before, each list by people and visits, and Google signals off", async () => {
    const t = harness();
    // The last 30 days' returning visitors on Safari: a visit a day, each one a lead.
    const returning = Array.from({ length: 30 }, (_, at): Visit => ({
      date: shiftDay(TOP, -at), device: "mobile", channel: "Direct", source: "(direct)", landing: "/", page: "/",
      visitor: "returning", browser: "Safari", system: "iOS", sessions: 1, engaged: 1, seconds: 30, views: 2, events: { generate_lead: [1, 0] },
    }));
    const { siteId, user } = await collected(t, [...growing(), ...returning]);
    const args = { siteId, period: "lastMonth" as const, device: "" };
    const visitors = (await user.query(api.googleAnalyticsVisitorReads.analyticsVisitors, args))!;
    expect(visitors).toMatchObject({ preparing: false, missing: [], signals: "off" });
    expect(visitors.figures).toMatchObject({ visits: 30 * 34, visitsBefore: 30 * 16, returningVisits: 30 });
    expect(visitors.figures!.newVisits + visitors.figures!.returningVisits).toBe(30 * 34);
    const days = (await user.query(api.googleAnalyticsVisitorReads.analyticsVisitorDays, args))!;
    expect(days.points).toHaveLength(30);
    // Each day's visits, not people: one returning visit a day.
    expect(days.points.every((point) => point.returning === 1 && point.new > 0)).toBe(true);
    // The month before's days, kept beside them for the chart to compare.
    expect(days.pointsBefore?.length).toBeGreaterThan(0);
    expect(visitors.spanBefore?.from.endsWith("-01")).toBe(true);
    // Every figure in visits; no rule weighs conversions, which the lists count as events, not visits. Every returning
    // visit started on the home page, in no page group: not said, as Not sorted is nothing to act on.
    expect(visitors.seen.says.map((phrase) => phrase.code)).toEqual(["visits", "signalsOff"]);
    expect(visitors.seen.steps).toEqual([]);
    // The bars' list: each group's visits now and the month before.
    const bars = (await user.query(api.googleAnalyticsVisitorReads.analyticsVisitorBars, { ...args, list: "browser" }))!;
    expect(bars.rows.map((row) => [row.key, row.visits])).toEqual([["Chrome", 30 * 33], ["Safari", 30]]);
    expect(bars.rows.every((row) => row.visitsBefore !== null)).toBe(true);
    const browsers = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...args, ...listArgs, list: "browser" });
    expect(browsers.rows.map((row) => [row.label, row.visits])).toEqual([["Chrome", 30 * 33], ["Safari", 30]]);
    expect(browsers.seen).toEqual({ says: [], steps: [] });
    const types = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...args, ...listArgs, list: "visitorType" });
    expect(types.rows.map((row) => row.label)).toEqual(["new", "returning"]);
  });
});

describe("Live (GA34)", () => {
  test("who is on the website now and the last 30 minutes, from Google's live figures, and nothing kept", async () => {
    const { t, siteId, user } = await collectedGrowing();
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
    // An event has its times and never its people: Google refuses those live, and the whole minute failed on it (2026-11-06).
    expect(phones).toMatchObject({ ok: true, now: 1, people: 2, rows: [{ name: "generate_lead", people: 0, times: 1 }], countries: [{ name: "GB", people: 2 }] });
    // Nothing is kept: no held list, no row of any kind.
    expect(await kept()).toBe(before);
  });

  test("each page's address and Classification are found by its title, from what's saved, and nothing more is asked", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing().slice(-3));
    const google = fakeGoogle(growing());
    const person = (page: string, views: number) => ({ minutesAgo: 1, city: "London", page, device: "desktop", views });
    google.live = [person("Home", 8), person("Locks", 4), person("Locks", 4), person("Checkout", 3), person("Never saved", 1), person("(not set)", 2)];
    await t.run(async (ctx) => {
      const page = { companyWebsiteId: siteId, crawled: true, shown: true, ranks: false };
      await ctx.db.insert("holdPages", { ...page, page: "/live-home-test/", clicks: 0, title: "Home" });
      await ctx.db.insert("holdPages", { ...page, page: "/locks-quiet/", clicks: 1, title: "Locks" });
      // A title on two pages: the busier one.
      await ctx.db.insert("holdPages", { ...page, page: "/locks/", clicks: 50, title: "Locks" });
      await ctx.db.insert("holdPages", { ...page, page: "/checkout/onepage/", clicks: 2, title: "Checkout" });
      const locks = await ctx.db.insert("pageClassifications", { companyWebsiteId: siteId, name: "Locks", type: "PRODUCT", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: siteId, classificationId: locks, kind: "STARTS_WITH", value: "/locks", createdAt: 1 });
    });
    const asks = () => google.calls.filter((call) => call.url.endsWith(":runRealtimeReport")).length;
    const askedBefore = asks();
    const answer = await user.action(api.googleAnalyticsRealtime.askGoogleAnalyticsRealtime, { siteId, device: "", list: "pages" });
    if (!answer.ok) throw new Error("unreachable");
    // Still one ask each: now, the half hour, its minutes, towns, countries, pages and conversions.
    expect(asks() - askedBefore).toBe(7);
    expect(Object.fromEntries(answer.rows.map((row) => [row.name, row.address]))).toEqual({ Home: "/live-home-test/", Locks: "/locks/", Checkout: "/checkout/onepage/", "Never saved": null, "(not set)": null });
    expect(answer.busiestPage?.name).toBe("Locks");
    expect(answer.sorted).toBe(true);
    // By Classification; the shop's pages together, by address or by name; the rest Not sorted.
    expect(Object.fromEntries(answer.kinds.map((kind) => [kind.name ?? kind.kind, [kind.views, kind.pages]]))).toEqual({ Locks: [8, 1], NOT_SORTED: [11, 3], SHOP_PAGES: [3, 1] });
    expect(answer.kinds.reduce((sum, kind) => sum + kind.views, 0)).toBe(answer.views);
    // The pages reach the eye whichever list the table shows.
    const towns = await user.action(api.googleAnalyticsRealtime.askGoogleAnalyticsRealtime, { siteId, device: "", list: "places" });
    if (!towns.ok) throw new Error("unreachable");
    expect(towns.pages.map((row) => row.name)).toContain("Locks");
    expect(towns.rows.map((row) => row.name)).toEqual(["London"]);
  });

  test("a page's number is found from its address, for a screen that only has the address, and only that exact page", async () => {
    const { siteId, user } = await collectedGrowing();
    const listed = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", period: "lastMonth", device: "", page: 1, rows: 5, sort: "views", direction: "desc" });
    const row = listed.rows[0];
    expect(row.key.startsWith("~")).toBe(true);
    const path = new URL(row.label, "https://acme-shop.test").pathname;
    const key = (page: string) => user.query(api.googleAnalyticsPageReads.analyticsPageKey, { siteId, page, period: "lastMonth", device: "" });
    expect(await key(path)).toBe(row.key);
    // However the address is written.
    expect(await key(path.toUpperCase())).toBe(row.key);
    expect(await key(`https://acme-shop.test${path}`)).toBe(row.key);
    // Never another page that's nearly it: a page with no views in these dates says so.
    expect(await key(`${path}-not-this-one`)).toBeNull();
  });

  test("a website with no Classifications says so, and its pages still find their addresses", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing().slice(-3));
    const google = fakeGoogle(growing());
    google.live = [{ minutesAgo: 1, city: "London", page: "Home", device: "desktop", views: 2 }];
    await t.run(async (ctx) => {
      await ctx.db.insert("holdPages", { companyWebsiteId: siteId, crawled: true, shown: true, ranks: false, page: "/live-home-test/", clicks: 0, title: "Home" });
      for (const row of await ctx.db.query("pageClassifications").collect()) await ctx.db.delete(row._id);
    });
    const answer = await user.action(api.googleAnalyticsRealtime.askGoogleAnalyticsRealtime, { siteId, device: "", list: "pages" });
    if (!answer.ok) throw new Error("unreachable");
    expect(answer.sorted).toBe(false);
    expect(answer.rows[0]).toMatchObject({ name: "Home", address: "/live-home-test/" });
  });

  test("a usual half hour reads the website's own hours once a run has saved them, and each device's share of people", async () => {
    const { siteId, user } = await collectedGrowing();
    const october = Date.parse("2026-10-09T10:15:00Z");
    const flat = await user.query(api.googleAnalyticsLiveUsual.analyticsLiveUsual, { siteId, device: "" });
    expect(flat).not.toBeNull();
    expect(flat!.dayOfWeek).toBeNull();
    expect(flat!.peopleThisTime).toBeNull();
    const usual = await user.query(api.googleAnalyticsLiveUsual.analyticsLiveUsual, { siteId, device: "", at: october });
    expect(usual!.dayOfWeek).toBe(new Date(october).getUTCDay());
    expect(usual!.hour).toBe(11);
    expect(usual!.devices.reduce((sum, device) => sum + device.peopleShare, 0)).toBeCloseTo(1);
    // One device chosen: its own figures, and no shares to set it against.
    const phones = await user.query(api.googleAnalyticsLiveUsual.analyticsLiveUsual, { siteId, device: "mobile", at: october });
    expect(phones!.devices).toEqual([]);
  });

  test("Ask Hakken says what the screen says: the boxes, the usual and its meaning, and the views by Classification", async () => {
    const t = harness();
    const { siteId } = await collected(t, growing().slice(-3));
    const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
    const google = fakeGoogle(growing());
    google.live = [
      { minutesAgo: 1, city: "London", page: "Home", device: "desktop", views: 5, events: { generate_lead: 1 } },
      { minutesAgo: 2, city: "(not set)", page: "Home", device: "mobile", views: 1 },
    ];
    await t.run(async (ctx) => {
      await ctx.db.insert("holdPages", { companyWebsiteId: siteId, crawled: true, shown: true, ranks: false, page: "/live-home-test/", clicks: 0, title: "Home" });
    });
    const told = await t.action(internal.assistantAnalyticsReads.googleAnalyticsLiveInternal, { companyId, website: "acme-shop.test" }) as Record<string, unknown>;
    const screen = await t.action(internal.assistantAnalyticsReads.googleAnalyticsLiveInternal, { companyId, website: "acme-shop.test", list: "events" }) as Record<string, unknown>;
    expect(told).toMatchObject({
      ok: true,
      onTheWebsiteNow: 2,
      peopleInTheLast30Minutes: 2,
      pageViewsInTheLast30Minutes: 6,
      busiestPage: { title: "Home", address: "/live-home-test/", people: 2, views: 6 },
      busiestTown: { town: "London", people: 1, ofPeople: 2 },
    });
    expect((told.peopleEachMinuteOldestFirst as number[]).slice(-3)).toEqual([1, 1, 0]);
    expect(told.usualHalfHour).toMatchObject({ people: { forThisTimeOfTheWeek: expect.any(Boolean) }, views: { forThisTimeOfTheWeek: expect.any(Boolean) } });
    expect(told.rule).toEqual(expect.stringContaining("Never give a cause"));
    expect(screen.events).toEqual([{ event: "generate lead", times: 1 }]);
  });
});

describe("Ask Hakken reads every Google Analytics screen (§18.6.8)", () => {
  /** An answer's own fields, whatever screen it is: the test reads what it asked for. */
  const fields = (answer: unknown) => answer as Record<string, unknown> & { rows?: Array<Record<string, unknown>> };

  // Anthony, 2026-11-04: "we need to fix these". It only ever saw the 25 most viewed pages, couldn't look at one
  // classification, told a basket's 302 as 302%, and said nothing when page views looked counted differently.
  test("All pages: in the order the question needs, one classification with its totals, and conversions told as they are", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
    await t.run(async (ctx) => {
      const classificationId = await ctx.db.insert("pageClassifications", { companyWebsiteId: siteId, name: "Services", type: "SERVICE", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: siteId, classificationId, kind: "STARTS_WITH", value: "/ai-agency/", createdAt: 1 });
    });
    const read = async (extra: Record<string, string> = {}) => fields(await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "acme-shop.test", screen: "allPages", period: "lastMonth", ...extra }));
    const pathOf = (row: Record<string, unknown>) => String(row.name).split(" — ").at(-1);

    // As the screen shows it, opening on the most viewed.
    const opening = await read();
    const shown = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    expect(opening.rows!.map((row) => row.pageViews)).toEqual(shown.rows.map((row) => row.views));

    // A rate over 100 is never told as a percentage.
    expect(opening.rows![0]).toHaveProperty("conversionsPer100Visits");
    expect(opening.rows![0]).not.toHaveProperty("conversionRatePercent");
    expect(opening.conversionsRule).toMatch(/never call it a conversion rate/);

    // The order the question needs, read from every page, with a link that opens the screen in that order.
    const gained = await read({ order: "gainedMostViews" });
    expect(gained.rows!.map((row) => row.pageViewsChange)).toEqual([...gained.rows!.map((row) => row.pageViewsChange as number)].sort((left, right) => right - left));
    expect(gained.link).toContain("sort=viewsChange");
    expect(gained.link).toContain("dir=desc");
    const lost = await read({ order: "lostMostViews" });
    expect(lost.rows!.map((row) => row.pageViewsChange)).toEqual([...lost.rows!.map((row) => row.pageViewsChange as number)].sort((left, right) => left - right));

    // One classification, its pages and its own totals, by the name a person would use.
    const services = await read({ classification: "services" });
    expect(services.rows!.map(pathOf)).toEqual(["/ai-agency/"]);
    expect(services.classification).toMatchObject({ name: "Services", pages: 1, pageViews: services.rows![0].pageViews, pageViewsBefore: services.rows![0].pageViewsBefore });
    const notSorted = await read({ classification: "Not sorted yet" });
    expect(notSorted.rows!.map(pathOf)).not.toContain("/ai-agency/");
    expect(await read({ classification: "Teapots" })).toMatchObject({ ok: false, problem: expect.stringContaining("Services") });

    // One of the screen's filters.
    const gains = await read({ move: "gains" });
    expect(gains.listed).toBe(shown.moves!.gains);

    // The whole website, as the screen's own read has it.
    const overview = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "lastMonth", device: "" });
    expect(analyticsPartsOf("allPages")).toEqual(["website"]);
    const website = await read({ part: "website" });
    expect(website.wholeWebsite).toMatchObject({ pageViews: overview.now!.views, pageViewsBefore: overview.before!.views, visits: overview.now!.visits, visitsBefore: overview.before!.visits });
    // A website this small moves by chance: no warning.
    expect(website).not.toHaveProperty("warning");
  });

  test("All pages: Ask Hakken's figures are the screen's, on every date the menu offers, with the shop's own pages left out the same way", async () => {
    const t = harness();
    const visit = (date: string, page: string, sessions: number): Visit => ({ date, device: "mobile", channel: "Direct", source: "(direct)", landing: page, page, sessions, engaged: sessions, seconds: 60, views: sessions * 3, events: {} });
    // The basket beats every other page, and nothing on the screen or in the answers may name it unless asked.
    const basket = Array.from({ length: 60 }, (_, at) => visit(shiftDay(TOP, -at), "/checkout/cart/", at < 30 ? 5 : 40));
    const { siteId, user } = await collected(t, [...growing(), ...basket]);
    const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
    const ask = async (period: string, extra: Record<string, unknown> = {}) => fields(await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "https://www.acme-shop.test/", screen: "allPages", period, ...extra } as never));
    let leftOutOn = 0;
    for (const period of ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"] as const) {
      const screen = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs, period, leaveOut: true });
      const answer = await ask(period);
      expect(answer.rows!.map((row) => row.pageViews), period).toEqual(screen.rows.map((row) => row.views));
      expect(answer.listed, period).toBe(screen.total);
      expect(answer.rows!.some((row) => String(row.name).includes("/checkout/")), period).toBe(false);
      if (screen.bands) expect(answer.busyAndQuiet, period).toMatchObject({ busyPages: screen.bands.busy, busyPagesWithFewerViews: screen.bands.busyFewer, quietPages: screen.bands.quiet, quietPagesWithMoreViews: screen.bands.quietMore });
      if (screen.concentration) expect(answer.halfOfViews, period).toMatchObject({ pagesThatMadeHalfTheViews: screen.concentration.pagesForHalf, pagesThatMadeHalfTheViewsBefore: screen.concentration.pagesForHalfBefore });
      // Dates with nothing kept yet have no list to leave anything out of.
      if (screen.shop?.pages) {
        expect(answer.leftOut, period).toMatchObject({ pages: screen.shop.pages, pageViews: screen.shop.views, pageViewsBefore: screen.shop.viewsBefore });
        leftOutOn += 1;
      }
      const overview = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period, device: "" });
      if (overview.now) expect((await ask(period, { part: "website" })).wholeWebsite, period).toMatchObject({ pageViews: overview.now.views, visits: overview.now.visits });
    }
    expect(leftOutOn).toBeGreaterThan(3);
    // Asked for, they're there: every page, only those, or by a search.
    expect((await ask("lastMonth", { everyPage: true })).rows!.some((row) => String(row.name).includes("/checkout/"))).toBe(true);
    expect(await ask("lastMonth", { everyPage: true })).not.toHaveProperty("leftOut");
    const only = await ask("lastMonth", { classification: "basket" });
    expect(only.rows!.map((row) => String(row.name))).toEqual(["/checkout/cart/"]);
    expect(only.classification).toMatchObject({ name: "Search, basket and account", pages: 1 });
    expect((await ask("lastMonth", { search: "checkout" })).rows!.map((row) => String(row.name))).toEqual(["/checkout/cart/"]);
  });

  test("each screen's figures as the screen shows them, with its link; a website not the company's has none", async () => {
    const { t, siteId, user } = await collectedGrowing();
    const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
    const read = async (screen: (typeof ANALYTICS_SCREENS)[number], extra: Record<string, string> = {}) =>
      fields(await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "https://www.acme-shop.test/", screen, period: "lastMonth", ...extra }));

    const overview = await read("overview");
    const shown = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "lastMonth", device: "" });
    // What the page says, through the same reads, with no money (overview-new-page-plan-2026-11-06.md, step 12).
    expect(overview).toMatchObject({
      ok: true, website: "acme-shop.test", screen: "overview", kind: "service",
      wholeWebsite: { visits: shown.now!.visits, views: shown.now!.views, conversions: shown.now!.conversions, visitsBefore: shown.before!.visits },
      link: `/app/analytics/${siteId}?period=lastMonth`,
    });
    expect(overview).not.toHaveProperty("currency");
    expect(JSON.stringify(overview)).not.toMatch(/"value"|"revenue"/);
    const split = (await user.query(api.googleAnalyticsOverviewSplits.analyticsOverviewSplit, { siteId, period: "lastMonth", device: "", split: "channel" }));
    expect((overview.channels as { rows: Array<{ key: string; visits: number }> }).rows.map((row) => [row.key, row.visits])).toEqual(split.rows.map((row) => [row.key, row.visits]));
    // The pages and the days, reads of their own the tool asks after the rest.
    const pages = await read("overview", { part: "pages" });
    const list = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, period: "lastMonth", device: "", list: "landing", leaveOut: true, sort: "visits", direction: "desc", page: 1, rows: 25 });
    expect((pages.topPages as Array<{ visits: number }>).map((row) => row.visits)).toEqual(list.rows.map((row) => row.visits));
    expect(pages.link).toBe(overview.link);
    // On every date the menu offers, Ask Hakken's figures are the screen's.
    for (const period of ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"] as const) {
      const answer = await read("overview", { period });
      const screen = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period, device: "" });
      if (!screen.now) continue;
      expect(answer.wholeWebsite, period).toMatchObject({ visits: screen.now.visits, views: screen.now.views, conversions: screen.now.conversions });
      const rows = await user.query(api.googleAnalyticsOverviewSplits.analyticsOverviewSplit, { siteId, period, device: "", split: "channel" });
      expect((answer.channels as { rows: Array<{ key: string; visits: number; conversions: number }> }).rows.map((row) => [row.key, row.visits, row.conversions]), period).toEqual(rows.rows.map((row) => [row.key, row.visits, row.conversions]));
    }
    const days = await read("overview", { part: "days" });
    const chart = await user.query(api.googleAnalyticsChartReads.analyticsChart, { siteId, period: "lastMonth", device: "" });
    expect((days.days as Array<{ day: string; visits: number }>).map((row) => [row.day, row.visits])).toEqual(chart.points.map((point) => [point.day, point.visits]));

    const landing = await read("landingPages");
    const landingShown = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    expect(landing.rows!.map((row) => [row.address, row.visits, row.conversions])).toEqual(landingShown.rows.map((row) => [row.label.replace("https://www.acme-shop.test", ""), row.visits, row.conversions]));

    const channel = await read("channel", { key: "Organic Search" });
    expect(channel.rows!.map((row) => row.name)).toEqual(["google"]);
    expect(channel.link).toBe(`/app/analytics/${siteId}/channels/channel?period=lastMonth&key=Organic+Search`);
    // The parts above its table, as its page shows them (ga-channel-pages-plan.md CH3–CH6).
    const channelTop = await user.query(api.googleAnalyticsChannelReads.analyticsChannelTop, { siteId, period: "lastMonth", device: "", channel: "Organic Search" });
    expect(channel.conversionsItStarted).toMatchObject({ now: channelTop.figures!.started });
    expect((channel.whereItLands as Array<{ visits: number }>).map((kind) => kind.visits)).toEqual(channelTop.kinds.map((kind) => kind.visits));
    // Channels as its page shows it (channels-new-page-plan-2026-11-06.md, step 9), never what a visit is worth: `googleAnalyticsChannelPageReads.test.ts` holds the rest.
    const channels = await read("channels");
    expect(channels).not.toHaveProperty("whatAVisitIsWorth");
    expect(JSON.stringify(channels.rows)).not.toMatch(/valuePerVisit|"value"/);
    expect((channels.rows as unknown as Array<{ channel: string }>).map((row) => row.channel)).toContain("Organic Search");
    expect(channels.link).toBe(`/app/analytics/${siteId}/channels?period=lastMonth`);

    const page = await read("page", { key: "https://www.acme-shop.test/ai-agency/" });
    // As the redone screen shows it (page-screen-redo-plan-2026-11-03.md): its views, never money, people or the page before.
    expect(page).toMatchObject({ ok: true, page: "https://www.acme-shop.test/ai-agency/", views: 30 * 18 + 30 * 2 });
    expect(page).not.toHaveProperty("figures");
    expect(page).not.toHaveProperty("justBefore");
    expect(JSON.stringify(page)).not.toMatch(/"value"|revenue/);
    // Its boxes and its story, reads of their own the tool asks after the rest by the page the first found, as the
    // screen reads them; the page found by its reference as by its address.
    expect(page.pageKey).toMatch(/^~/);
    const pageBoxes = await read("page", { key: String(page.pageKey), part: "boxes" });
    const pageStory = await read("page", { key: String(page.pageKey), part: "story" });
    expect(page).not.toHaveProperty("whoLooks");
    expect(pageStory).toHaveProperty("whoLooks");
    expect(pageStory).toHaveProperty("visitsThatStartedHereByChannel");
    expect(pageBoxes).not.toHaveProperty("whoLooks");
    expect([pageBoxes.link, pageStory.link]).toEqual([page.link, page.link]);
    expect(JSON.stringify([pageBoxes, pageStory])).not.toMatch(/"value"|revenue/);

    const events = await read("events");
    expect((events.events as Array<{ event: string; times: number }>).find((row) => row.event === "generate_lead")?.times).toBe(60);
    const event = await read("event", { key: "generate_lead" });
    expect(event).toMatchObject({ ok: true, event: "generate_lead", countsAsConversion: true, figures: { times: 60, timesBefore: 30 } });

    const conversions = await read("conversions");
    const conversionsShown = await user.query(api.googleAnalyticsReads.analyticsConversions, { siteId, period: "lastMonth", device: "" });
    expect(conversions.kinds).toEqual(conversionsShown.kinds.map((kind) => ({ event: kind.eventName, count: kind.count, countBefore: kind.countBefore, value: kind.value === null ? null : kind.value / 100 })));
    // An Insights agent reads the same screen for itself (stronger-agents-plan-2026-10-30.md A1): every figure keyed, each
    // key's fact the number the screen shows, money in the property's currency.
    const keyed = keyedRead(await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "acme-shop.test", screen: "conversions", period: "lastMonth" }), "r1.conversions", { source: "analytics", currency: "GBP" });
    const byKey = factsByKey(keyed.facts);
    expect(byKey.get("r1.conversions.visits")?.value).toBe(conversionsShown.visits);
    for (const kind of conversionsShown.kinds) {
      expect(byKey.get(`r1.conversions.kinds.${kind.eventName}.count`)).toMatchObject({ value: kind.count, unit: "count" });
      if (kind.value !== null) expect(byKey.get(`r1.conversions.kinds.${kind.eventName}.value`)).toMatchObject({ value: kind.value / 100, unit: "money", currency: "GBP" });
    }
    // The Conversions map as an agent reads it (agentReads.ts): each rate, every conversion together a visit, and each
    // view's standouts, all worked out in code from the map's own figures.
    const map = await user.query(api.googleAnalyticsConversionsMap.analyticsConversionsMap, { siteId, period: "lastMonth", device: "", columns: "channel" });
    const agentMap = await t.query(internal.agentReads.conversionsByInternal, { companyId, siteId, period: "lastMonth", device: "", columns: "channel" }) as {
      ok: boolean; standouts: Array<{ conversion: string; highest?: { column: string } }>; everyConversionTogether: Array<{ column: string; conversionsPerVisit: number | null }>;
      conversions: Array<{ event: string; by: Array<{ column: string; visitsThatDidIt: number; ratePercent: number | null }> }>;
    };
    expect(agentMap.ok).toBe(true);
    expect(agentMap.standouts[0].conversion).toBe("every conversion together, a visit");
    const lead = agentMap.conversions.find((one) => one.event === "generate_lead")!;
    const row = map.rows.find((one) => one.eventName === "generate_lead")!;
    map.columns.forEach((column, at) => {
      const cell = lead.by.find((one) => one.column === (column.name ?? column.key))!;
      expect(cell.visitsThatDidIt).toBe(row.cells[at].visits);
      expect(cell.ratePercent).toBe(column.visits > 0 ? Math.round((row.cells[at].visits / column.visits) * 1000) / 10 : null);
    });
    // No shop's steps on a website that sends none.
    expect(agentMap).not.toHaveProperty("shopSteps");

    expect(await read("visitors")).toMatchObject({ ok: true, figures: { visits: 30 * 33 }, googleSignals: "off" });
    expect(await read("products")).toMatchObject({ ok: false });

    // Another company's website, or none at all: never read.
    const stranger = fields(await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "rival.test", screen: "overview", period: "lastMonth" }));
    expect(stranger).toMatchObject({ ok: false });
  });

  test("Live, asked of Google as the Live page asks it, and kept no more than it is", async () => {
    const { t, siteId } = await collectedGrowing();
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
      conversionsInTheLast30Minutes: { count: 1, newest: "generate lead", minutesAgo: 12 },
      link: `/app/analytics/${siteId}/live`,
    });
    // An event is told in times, never as nobody.
    const events = fields(await t.action(internal.assistantAnalyticsReads.googleAnalyticsLiveInternal, { companyId, website: "acme-shop.test", list: "events" }));
    expect(events.events).toEqual([{ event: "generate lead", times: 1 }]);
    // Nothing of Live kept: the only lists held are the night's funnels, kept by the collection (ga-conversions-visitors-plan.md CV4).
    expect(await t.run(async (ctx) => (await ctx.db.query("googleAnalyticsLive").collect()).filter((row) => !row.ask.startsWith("funnel:")).length)).toBe(0);
  });
});

describe("What Hakken sees, from what each screen already reads (§14)", () => {
  /** Search Console connected for the website, with its last 30 days held: 100 clicks from 20,000 showings. */
  async function withSearchConsole(t: Harness, siteId: Id<"companyWebsites">) {
    await t.run(async (ctx) => {
      const hold = (await ctx.db.get(siteId))!;
      await ctx.db.insert("searchConsoleConnections", {
        companyId: hold.companyId, companyWebsiteId: siteId, websiteId: hold.websiteId, status: "CONNECTED", newestDay: SEARCH_CONSOLE_NEWEST, createdAt: 1, updatedAt: 1,
      });
      for (let at = 0; at < 40; at += 1) {
        await ctx.db.insert("searchConsoleDays", {
          companyWebsiteId: siteId, searchType: "web", day: shiftDay(SEARCH_CONSOLE_NEWEST, -at), clicks: at < 30 ? 4 : 99, impressions: at < 30 ? 800 : 99, ctr: 0, position: 10, fetchedAt: 1,
        });
      }
    });
  }

  test("Overview's box weighs conversions against visits and Google's showings, with the page named", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    await withSearchConsole(t, siteId);
    const overview = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "lastMonth", device: "" });
    expect(overview.counting).toBe(true);
    // The last 30 of the 40 days held: 4 clicks from 800 showings a day.
    expect(overview.searchConsole).toEqual({ clicks: 120, impressions: 24_000 });
    expect(overview.seen.says[0]).toEqual({ code: "lead.up.up", a: (990 - 480) / 480, b: 60, c: 150 });
    expect(overview.seen.says.at(-1)).toEqual({ code: "googleRarely", a: 24_000, b: 0.005 });
    // Pages shown but rarely clicked: Search Console's Almost there for the same website.
    expect(overview.seen.steps.at(-1)).toEqual({ code: "push", link: "pagesToPush", to: { url: `/app/search-console/${siteId}/almost-there` } });
  });

  test("each list's box is of the whole list, whatever is searched, its pages named by their paths", async () => {
    const { siteId, user } = await collectedGrowing();
    const channels = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "channel", ...listArgs, q: "dir" });
    expect(channels.rows.map((row) => row.label)).toEqual(["Direct"]);
    // The channel bringing the most conversions leads, never the most money (Anthony, 2026-11-03).
    expect(channels.seen.says[0]).toMatchObject({ code: "lead", text: "AI assistants" });
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
    const { siteId, user } = await collectedGrowing();
    const all = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "page", ...listArgs });
    const ticked = all.rows.filter((row) => row.key.startsWith("~")).slice(0, 2);
    const args = { siteId, period: "lastMonth" as const, device: "", pages: ticked.map((row) => row.key) };
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
    const download = await user.query(api.googleAnalyticsReads.analyticsListAll, { siteId, list: "page", period: "lastMonth", device: "", move: "gains", part: 0 });
    expect(download.rows).toHaveLength(3);
    expect(download.total).toBe(3);
  });

  test("a long list's download comes in parts: every row once, in the screen's order, with no read for each title", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    // Sites → Your pages: enough pages nobody viewed to run past one part. More Handles' All pages is 13,803 rows and up.
    const quiet = DOWNLOAD_PART + 5;
    await t.run(async (ctx) => {
      for (const held of await ctx.db.query("siteListCopies").withIndex("by_kind_key", (q) => q.eq("kind", YOUR_PAGES_COPY).eq("key", `${siteId}`)).collect()) await ctx.db.delete(held._id);
      const rows = Array.from({ length: quiet }, (_, index) => [`/quiet-${index}/`, null, 1, 0, 0, 0, "BRAND"]);
      await ctx.db.insert("siteListCopies", { kind: YOUR_PAGES_COPY, key: `${siteId}`, buildId: "b1", fields: [...YOUR_PAGES_FIELDS], rows: rows.length, parts: 1, cut: null, meta: {}, builtAt: 1 });
      await ctx.db.insert("siteListCopyParts", { kind: YOUR_PAGES_COPY, key: `${siteId}`, buildId: "b1", part: 0, data: encodeCopyRows(rows, YOUR_PAGES_FIELDS.length) });
      await ctx.db.insert("holdPages", { companyWebsiteId: siteId, page: "/ai-agency/", crawled: false, shown: false, clicks: 0, ranks: false, title: "AI Agency | Acme" });
    });
    const ask = { siteId, list: "page" as const, period: "lastMonth" as const, device: "", sort: "views" as const };
    const first = await user.query(api.googleAnalyticsReads.analyticsListAll, { ...ask, part: 0 });
    const second = await user.query(api.googleAnalyticsReads.analyticsListAll, { ...ask, part: 1 });
    const past = await user.query(api.googleAnalyticsReads.analyticsListAll, { ...ask, part: 2 });
    // An answer may hold 8,192 to a list.
    expect(DOWNLOAD_PART).toBeLessThanOrEqual(8_192);
    expect(first.rows).toHaveLength(DOWNLOAD_PART);
    expect(first.total).toBe(quiet + 3);
    expect(second.total).toBe(first.total);
    expect(second.rows).toHaveLength(first.total - DOWNLOAD_PART);
    expect(past.rows).toEqual([]);
    const every = [...first.rows, ...second.rows];
    expect(new Set(every.map((row) => row.key)).size).toBe(first.total);
    expect(every.some((row) => row.label.startsWith("~"))).toBe(false);
    // The same order as the screen's. The screen gives a page its title; the file holds none, so its read asks for none.
    const screen = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...ask, page: 1, rows: 25 });
    expect(first.rows.slice(0, 25).map((row) => row.key)).toEqual(screen.rows.map((row) => row.key));
    const titled = (rows: typeof every) => rows.find((row) => row.label.endsWith("/ai-agency/"));
    expect(titled(screen.rows)?.title).toBe("AI Agency | Acme");
    expect(titled(first.rows)).toBeDefined();
    expect(titled(first.rows)).not.toHaveProperty("title");
  });

  test("a device's box weighs it against every device, both kept by the collection", async () => {
    const { siteId, user } = await collectedGrowing();
    const answered = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, device: "mobile" });
    expect(answered.seen.says[0]).toMatchObject({ code: "device.mobile", a: 630 });
  });

  test("Conversions' box, Your websites' figures before, and Search Console only while the way to connect shows", async () => {
    const t = harness();
    const { siteId, user } = await collected(t, growing());
    await withSearchConsole(t, siteId);
    const conversions = await user.query(api.googleAnalyticsReads.analyticsConversions, { siteId, period: "lastMonth", device: "" });
    expect(conversions.seen.says[0]).toEqual({ code: "topKind", text: "generate_lead", a: 60, b: 150 });
    expect(conversions.fired).toEqual([]);
    const [site] = await user.query(api.googleAnalyticsReads.analyticsSites, {});
    expect(site).toMatchObject({ visits: 990, visitsBefore: 480, conversions: 150, conversionsBefore: 60, counting: true, checks: 14 });
    // Your websites shows no money (Anthony, 2026-11-03: "Take money off").
    expect(site).not.toHaveProperty("value");
    expect(site).not.toHaveProperty("currency");
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
    const { siteId, connectionId, admin } = await collected(t, history(40, TOP));
    const checks = async () => (await t.run(async (ctx) => await ctx.db.get(connectionId)))!.health!.checks;
    const failing = async () => (await checks()).filter((check) => !check.passing).map((check) => check.check);
    // The first collection's checks, and the two-year fill's that follows the first night: the log counts every page
    // twice a visit or more, so the ninth check fails too (analytics-page-screen-plan.md, phase 6). Each event's 90 days
    // and 12 months are added up from what is held (calendar-periods-plan.md, rules 10 and 11), so the checks run
    // again the moment the fill holds the events' months: "sign_up" is counted but never happens in 640 visits
    // (conversion-checks-plan.md CC4), said at once rather than a week on.
    // This sample's two conversions also happen the same number of times every day, so the check for one counted twice fails too.
    expect(await failing()).toEqual(["NO_VALUE", "STRANGERS", "COUNTED_AGAIN", "NEVER_HAPPENS", "COUNTED_TWICE"]);
    // The next checks change nothing.
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    expect(await failing()).toEqual(["NO_VALUE", "STRANGERS", "COUNTED_AGAIN", "NEVER_HAPPENS", "COUNTED_TWICE"]);
    expect((await checks()).find((check) => check.check === "NEVER_HAPPENS")).toMatchObject({ names: ["sign_up"], count: 90 });
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
    const day = (at: number) => shiftDay(TOP, -at);
    const base = { device: "desktop", channel: "Organic Search", source: "google", seconds: 30 };
    return Array.from({ length: 30 }, (_, at): Visit[] => [
      { ...base, date: day(at), landing: "/", page: "/", sessions: 5, engaged: 5, views: 5 },
      { ...base, date: day(at), landing: "/", page: "/about-us/", referrer: "https://www.acme-shop.test/", sessions: 2, engaged: 2, views: 2 },
      { ...base, date: day(at), landing: "/", page: "/contact/", referrer: "https://www.acme-shop.test/about-us/", sessions: 1, engaged: 1, views: 1, events: { generate_lead: [1, 0] } },
      { ...base, date: day(at), landing: "/ai-agency/", page: "/ai-agency/", sessions: 3, engaged: 1, views: 3 },
    ]).flat();
  }

  let routesFixture: Promise<CollectedFixture> | undefined;
  const collectedRoutes = () => {
    if (!routesFixture) {
      routesFixture = (async () => {
        const t = harness();
        return { t, ...(await collected(t, routes())) };
      })();
    }
    return routesFixture;
  };

  test("the chart, from what each collection keeps: visits landed, left there and went on, two steps on, conversions where made", async () => {
    const { siteId, user, google } = await collectedRoutes();
    const asked = google.calls.length;
    const flow = await user.query(api.googleAnalyticsFlowReads.analyticsLandingFlow, { siteId, period: "lastMonth", device: "" });
    expect(google.calls.length).toBe(asked);
    expect(flow.held).toBe(true);
    const node = (column: number, path: string) => flow.nodes.find((one) => one.column === column && one.address?.endsWith(path));
    // On to /about-us/, 30 of its 60 going on to /contact/, where the 30 conversions were made.
    expect(node(1, "/about-us/")).toMatchObject({ visits: 60, left: 30 });
    expect(node(2, "/contact/")).toMatchObject({ visits: 30, conversions: 30 });
    expect(flow.bands.find((band) => band.to === node(2, "/contact/")!.id)).toMatchObject({ visits: 30, conversions: 30 });
    // The first column is the table's own figures, by group: this website has no classifications, so one group. The test's
    // Google counts each line of its log as visits of their own, so / holds 240 here, and 90 on /ai-agency/.
    expect(flow.nodes.filter((one) => one.column === 0)).toEqual([expect.objectContaining({ kind: "NOT_SORTED", visits: 330, left: 270 })]);
    expect(flow.onward).toBe(60);
    expect(flow.left).toBe(270);
    // It opens with the busiest pages ticked, each with the table's figures and its own routes.
    expect(flow.ticked.map((page) => [page.address.replace("https://www.acme-shop.test", ""), page.visits, page.left])).toEqual([["/", 240, 180], ["/ai-agency/", 90, 90]]);
    // All the way down, each from the box before it.
    expect(flow.ticked[0].routes).toEqual([
      { from: flow.ticked[0].id, to: node(1, "/about-us/")!.id, visits: 60, conversions: 0 },
      { from: node(1, "/about-us/")!.id, to: node(2, "/contact/")!.id, visits: 30, conversions: 30 },
    ]);
    expect(flow.starts).toEqual(flow.ticked.map((page) => page.key));
  });

  test("the chart can be told which pages are ticked, and the menu sets which it opens with", async () => {
    const { siteId, user } = await collectedRoutes();
    const opening = await user.query(api.googleAnalyticsFlowReads.analyticsLandingFlow, { siteId, period: "lastMonth", device: "" });
    const one = opening.starts[1];
    const ticked = await user.query(api.googleAnalyticsFlowReads.analyticsLandingFlow, { siteId, period: "lastMonth", device: "", pages: [one] });
    expect(ticked.ticked.map((page) => page.key)).toEqual([one]);
    expect(ticked.starts).toEqual(opening.starts);
    const none = await user.query(api.googleAnalyticsFlowReads.analyticsLandingFlow, { siteId, period: "lastMonth", device: "", pages: [] });
    expect(none.ticked).toEqual([]);
  });

  test("the table: each landing page's visits that went on, and the page most of them opened next, sorted over the whole list", async () => {
    const { siteId, user } = await collectedRoutes();
    const list = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs, sort: "left" });
    // The fewest leaving first: / (60 went on) before /ai-agency/ (none).
    expect(list.rows.map((row) => [row.label.replace("https://www.acme-shop.test", ""), row.visits, row.onward, row.next?.page.replace("https://www.acme-shop.test", "") ?? null])).toEqual([
      // The test's Google counts each line of its log as visits of their own, so / holds 240 here.
      ["/", 240, 60, "/about-us/"],
      ["/ai-agency/", 90, 0, null],
    ]);
    expect(list.rows[0].next?.share).toBe(1);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each read's own shape: what's asserted is its figures.
  type FunnelRead = Record<string, any>;
  describe("Ask Hakken says what Funnel says (funnel-way-1-plan-2026-11-05.md, step 8)", () => {
    const NAMES = { shop: "Search and basket", notSorted: "Not sorted yet", otherPages: "Other pages", otherGroups: (count: number) => `${count} other groups`, pageNotKnown: "Page not known" };
    const asking = async (extra: Record<string, unknown>) => {
      const { t, siteId } = await collectedRoutes();
      const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
      return await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "acme-shop.test", screen: "landingPages", period: "lastMonth", ...extra }) as FunnelRead;
    };

    test("the tool asks for the boxes and the chart after the rest, each a read of its own", () => {
      expect(analyticsPartsOf("landingPages")).toEqual(["boxes", "chart"]);
    });

    test("its four boxes are the screen's, and it explains the two meanings of left", async () => {
      const { siteId, user } = await collectedRoutes();
      const shown = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "lastMonth", device: "" });
      const { boxes, twoMeaningsOfLeft } = await asking({ part: "boxes" });
      expect(boxes).toMatchObject({ visits: shown.now!.visits, conversions: shown.now!.conversions, pagesAVisit: Math.round((shown.now!.views / shown.now!.visits) * 10) / 10 });
      expect(boxes.leftStraightAwayPercent).toBe(Math.round((1000 * (shown.now!.visits - shown.now!.engaged)) / shown.now!.visits) / 10);
      expect(twoMeaningsOfLeft).toMatch(/under 10 seconds/);
      expect(twoMeaningsOfLeft).toMatch(/saw one page/);
    });

    test("its chart's columns and figures are what the chart draws, and it says the later figures are close", async () => {
      const { siteId, user } = await collectedRoutes();
      const shown = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, period: "lastMonth", device: "" });
      const flow = await user.query(api.googleAnalyticsFlowReads.analyticsLandingFlow, { siteId, period: "lastMonth", device: "", leaveOut: true });
      const built = flowBoxes({ ...flow, ticked: [] }, NAMES);
      const { chart, pageNotKnown, classifications, busyPages } = await asking({ part: "chart" });
      expect(chart.rule).toMatch(/close rather than exact/);
      expect(chart.columns.map((column: { column: string }) => column.column).slice(0, 2)).toEqual(["First page", "Second page"]);
      expect(chart.columns[0]).toMatchObject({ visits: shown.now!.visits, left: flow.left });
      expect(chart.columns[1].visits).toBe(flow.onward);
      for (const box of built.boxes) {
        expect(chart.columns[box.column].boxes.find((one: { name: string }) => one.name === box.name)).toMatchObject({ visits: built.said(box), left: built.saidLeft(box) });
      }
      expect(pageNotKnown).toMatchObject({ visits: flow.noPageVisits, link: expect.stringContaining("/tracking-health") });
      // Each classification's whole figures, whatever the first column has ticked out of it.
      expect(classifications.map((one: { visits: number }) => one.visits)).toEqual(built.boxes.filter((box) => box.column === 0 && box.isGroup).map((box) => box.visits));
      expect(busyPages.rule).toMatch(/visits or more/);
    });

    test("a page asked about comes out of its group with every route it has", async () => {
      const { thePageAsked } = await asking({ part: "chart", key: "https://www.acme-shop.test/" });
      expect(thePageAsked).toMatchObject({ name: "Home page", address: "/", visits: 240, left: 180, stayed: 60 });
      expect(thePageAsked.columns.map((column: { column: string }) => column.column)).toEqual(["First page", "Second page", "Third page"]);
      expect(thePageAsked.columns[0].boxes[0].wentTo).toEqual([{ to: "About us", visits: 60 }]);
      expect(thePageAsked.columns[2].boxes[0]).toMatchObject({ name: "Contact", visits: 30 });
      const unknown = await asking({ part: "chart", key: "/never-there/" });
      expect(String(unknown.thePageAsked)).toMatch(/No page/);
    });

    test("its table comes in the order a question needs, and never as money", async () => {
      const mostLeft = await asking({ order: "mostPeopleLeft" });
      expect(mostLeft.rows.map((row: { address: string; left: number; stayed: number }) => [row.address, row.left, row.stayed])).toEqual([["/", 180, 60], ["/ai-agency/", 90, 0]]);
      const mostStayed = await asking({ order: "mostPeopleStayed" });
      expect(mostStayed.rows[0]).toMatchObject({ address: "/", stayed: 60, mostWentTo: { page: "About us", sharePercent: 100 } });
      expect(JSON.stringify(mostLeft.rows)).not.toMatch(/"value"|revenue/);
      expect(mostLeft.conversionsRule).toMatch(/never call it a conversion rate/);
    });

    test("a classification with its totals, and a name that isn't one says which there are", async () => {
      const { t, siteId } = await collectedRoutes();
      const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
      const answer = await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "acme-shop.test", screen: "landingPages", period: "lastMonth", classification: "not sorted" }) as FunnelRead;
      expect(answer.classification).toMatchObject({ name: "Not sorted yet", visits: 330, stayed: 60, left: 270 });
    });
  });

  test("a page is one page however Google spells it: one row without its slash doesn't lose its routes", async () => {
    const t = harness();
    const base = { device: "desktop", channel: "Organic Search", source: "google", seconds: 30, date: shiftDay(TOP, -3) };
    const { siteId, user } = await collected(t, [
      { ...base, landing: "/guide", page: "/guide/", sessions: 10, engaged: 8, views: 10 },
      { ...base, landing: "/guide", page: "/next/", referrer: "https://www.acme-shop.test/guide/", sessions: 4, engaged: 4, views: 4 },
      // The one row that spells it the other way.
      { ...base, landing: "/other/", page: "/guide", referrer: "https://www.acme-shop.test/other/", sessions: 1, engaged: 1, views: 1 },
    ]);
    const list = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", ...listArgs });
    const guide = list.rows.find((row) => row.label.endsWith("/guide"));
    expect(guide?.onward).toBe(4);
    expect(guide?.next?.page).toMatch(/\/next\/$/);
  });

  test("a date's flow asks Google three things, as it did before routes were kept: routes, their conversions, and who went on", async () => {
    const { google } = await collectedRoutes();
    const asks = google.calls
      .filter((call) => call.url.endsWith(":runReport"))
      .map((call) => JSON.parse(call.body) as { dimensions?: Array<{ name: string }>; dateRanges?: Array<{ startDate: string; endDate: string }>; dimensionFilter?: unknown })
      .filter((body) => ["landingPage", "pageReferrer"].every((name) => body.dimensions?.some((one) => one.name === name)));
    expect(asks.length).toBeGreaterThan(0);
    const byDate = new Map<string, number>();
    for (const body of asks) {
      const device = JSON.stringify(body.dimensionFilter ?? "").match(/"deviceCategory".*?"value":"(\w+)"/)?.[1] ?? "";
      const date = `${body.dateRanges?.[0]?.startDate}|${body.dateRanges?.[0]?.endDate}|${device}`;
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
    }
    expect(Math.max(...byDate.values())).toBeLessThanOrEqual(3);
  });

  test("only the caller's own website", async () => {
    const { siteId, rival } = await collectedRoutes();
    await expect(rival.query(api.googleAnalyticsFlowReads.analyticsLandingFlow, { siteId, period: "lastMonth", device: "" })).rejects.toThrow();
  });
});

/**
 * A chart sent at a time (sees-side-panel-plan-2026-10-31.md, phase 5; Anthony: "send me a chart at 10am tomorrow
 * with my new conversion rates … this is handle tasks"): Ask Hakken offers it with today's chart drawn under the
 * offer, a yes makes it a task for that day and time, and on its day it is read from the saved days and sent.
 */
describe("a chart sent at a time", () => {
  test("offered with today's chart, set up on a yes, sent on its day from the saved days, then paused", async () => {
    const { t, siteId, adminId } = await collectedGrowing();
    const companyId = (await t.run((ctx) => ctx.db.get(siteId)))!.companyId;
    type Call = (reference: unknown, args: unknown) => Promise<unknown>;
    const loose = t as unknown as { query: Call; mutation: Call; action: Call };
    const ctx = { runQuery: loose.query, runMutation: loose.mutation, runAction: loose.action } as unknown as ToolHandlerExecutionInput["ctx"];
    const offer = (await ASSISTANT_TASK_HANDLERS["assistant.tasks.proposeChartReport"]({
      ctx, handlerMapping: "assistant.tasks.proposeChartReport", companyId, userId: adminId,
      args: { website: "acme-shop.test", measure: "conversionRate", day: "tomorrow", time: "10:00" },
    })) as { ok: boolean; chart?: { look: string; points: unknown[] }; proposal?: Record<string, unknown> };
    expect(offer.ok).toBe(true);
    // Thursday 1 October: tomorrow is Friday the 2nd, covering last month as of then.
    expect(offer.proposal).toMatchObject({
      action: "CREATE", title: "On 2 October, send me a chart of the share of visits that did generate lead", timeOfDay: "10:00",
      target: { companyWebsiteId: siteId, website: "acme-shop.test" },
      // A rate is of one conversion, as the page's own box: no purchase here, so the one done most.
      report: { look: "analyticsChart", measure: "conversionRate", event: "generate_lead", period: "lastMonth", every: "once", sendOn: "2026-10-02", weekday: 5 },
    });
    expect(offer.chart).toMatchObject({ look: "analyticsDays" });
    expect(offer.chart?.points).toHaveLength(30);
    // The reply carries the chart, as a chart's own does.
    expect(chartFromToolCalls([{ handlerMapping: "assistant.tasks.proposeChartReport", status: "SUCCESS", resultJson: JSON.stringify({ status: "ok", data: offer }) }])?.look).toBe("analyticsDays");

    const threadId = await t.run((db) => db.db.insert("threads", { userId: adminId, companyId, title: "A chart", createdAt: 1, updatedAt: 1 }));
    const messageId = await t.run((db) => db.db.insert("messages", { threadId, role: "assistant", content: "Here it is.", createdAt: NOW, taskProposal: offer.proposal as never }));
    await t.withIdentity({ subject: adminId }).mutation(api.hakkenTasks.answerProposal, { messageId, yes: true, timeZone: "Europe/London" });
    const task = (await t.run((db) => db.db.query("hakkenTasks").collect())).find((row) => row.threadId === threadId)!;
    expect(task).toMatchObject({ kind: "REPORT", state: "ON" });
    // 10am in London on the 2nd.
    expect(task.nextCheckAt).toBe(Date.parse("2026-10-02T09:00:00Z"));

    expect(await t.mutation(internal.hakkenStatReporter.sendReportInternal, { taskId: task._id })).toBe("SENT");
    const email = (await t.run((db) => db.db.query("outboxMessages").collect())).find((row) => row.idempotencyKey === `TASK_CHART:${task._id}:2026-10-01`)!;
    expect(email).toMatchObject({ messageType: "TASK_REPORT", userId: adminId });
    const rendered = await t.run((db) => renderOutboxRow(db, email));
    if (!("email" in rendered)) throw new Error(rendered.skip);
    expect(rendered.email.subject).toMatch(/^Share of visits that did generate lead each day: [0-9.]+%$/);
    expect(rendered.email.html).toContain("YOUR CHART");
    // Sent once: it stops.
    expect((await t.run((db) => db.db.get(task._id)))?.state).toBe("PAUSED");
  });
});

/**
 * Every kind of chart (ask-hakken-every-chart-plan-2026-10-31.md, phase 1): a website's groups over a period, from
 * the Conversions map's own saved figures, as bars, stacked bars, a pie, a scatter or a grid.
 */
describe("a chart of a website's groups", () => {
  test("each kind is drawn from the map's figures, and the figures go back for the words", async () => {
    const { t, siteId, adminId } = await collectedGrowing();
    const companyId = (await t.run((ctx) => ctx.db.get(siteId)))!.companyId;
    type Call = (reference: unknown, args: unknown) => Promise<unknown>;
    const loose = t as unknown as { query: Call; mutation: Call; action: Call };
    const ctx = { runQuery: loose.query, runMutation: loose.mutation, runAction: loose.action } as unknown as ToolHandlerExecutionInput["ctx"];
    const draw = async (args: Record<string, unknown>) => (await ASSISTANT_CHART_HANDLERS["assistant.chart"]({
      ctx, handlerMapping: "assistant.chart", companyId, userId: adminId,
      args: { lookup: "google_analytics", website: "acme-shop.test", period: "lastMonth", ...args },
    })) as { ok: boolean; problem?: string; groups?: Array<{ name: string; value: number }>; chart?: { look: string; kind: string; groups: Array<{ name: string; value: number }>; rows?: unknown[]; link: string } };
    const map = await t.query(internal.agentReads.conversionsByInternal, { companyId, siteId, period: "lastMonth", device: "", columns: "channel" }) as { visits: Array<{ column: string; visits: number }> };
    const biggest = [...map.visits].sort((a, b) => b.visits - a.visits)[0];

    const bars = await draw({ kind: "bars", measure: "visits" });
    expect(bars.ok).toBe(true);
    expect(bars.chart).toMatchObject({ look: "analyticsGroups", kind: "bars", link: `/app/analytics/${siteId}/conversions?period=lastMonth` });
    // The map's own figures, never the model's.
    expect(bars.chart?.groups[0]).toMatchObject({ name: biggest.column, value: biggest.visits });
    expect(bars.groups?.[0]).toMatchObject({ name: biggest.column, value: biggest.visits });

    const pie = await draw({ kind: "pie", measure: "visits", by: "device" });
    expect(pie.ok).toBe(true);
    expect(Math.round(pie.chart!.groups.reduce((sum, group) => sum + group.value, 0))).toBe(100);

    const grid = await draw({ kind: "grid", measure: "conversionRate", by: "channel" });
    expect(grid.ok).toBe(true);
    expect(grid.chart?.rows?.length).toBeGreaterThan(0);

    // The reply carries it, as a line chart's does.
    expect(chartFromToolCalls([{ handlerMapping: "assistant.chart", status: "SUCCESS", resultJson: JSON.stringify({ status: "ok", data: bars }) }])?.look).toBe("analyticsGroups");
    // A kind it doesn't draw is said.
    expect(await draw({ kind: "radar", measure: "visits" })).toMatchObject({ ok: false, problem: expect.stringContaining("kind is one of") });

    // Landing pages, from their own list (the plan's gaps): the busiest first, by its address.
    const pages = await draw({ kind: "bars", measure: "visits", by: "page" });
    expect(pages.ok).toBe(true);
    expect(pages.chart).toMatchObject({ look: "analyticsGroups", by: "page", link: `/app/analytics/${siteId}/landing-pages?period=lastMonth` });
    expect(pages.chart!.groups[0].name.startsWith("/")).toBe(true);
    expect(pages.chart!.groups.map((group) => group.value)).toEqual([...pages.chart!.groups.map((group) => group.value)].sort((a, b) => b - a));
    // The week's hours, from the list "When people convert" reads: Monday first, the conversion done most.
    const hours = await draw({ kind: "grid", by: "hour" }) as { ok: boolean; problem?: string; chart?: { by: string; event?: string; rows?: Array<{ event: string; values: number[] }> } };
    expect(hours.problem).toBeUndefined();
    expect(hours.chart?.rows?.map((row) => row.event)).toEqual(["1", "2", "3", "4", "5", "6", "0"]);
    expect(hours.chart?.rows?.flatMap((row) => row.values).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
  });
});

describe("a chart of groups sent at a time", () => {
  test("a pie of visits by device: offered with today's, set up on a yes, sent on its day with each device written beside its bar", async () => {
    const { t, siteId, adminId } = await collectedGrowing();
    const companyId = (await t.run((ctx) => ctx.db.get(siteId)))!.companyId;
    type Call = (reference: unknown, args: unknown) => Promise<unknown>;
    const loose = t as unknown as { query: Call; mutation: Call; action: Call };
    const ctx = { runQuery: loose.query, runMutation: loose.mutation, runAction: loose.action } as unknown as ToolHandlerExecutionInput["ctx"];
    const offer = (await ASSISTANT_TASK_HANDLERS["assistant.tasks.proposeChartReport"]({
      ctx, handlerMapping: "assistant.tasks.proposeChartReport", companyId, userId: adminId,
      args: { website: "acme-shop.test", measure: "visits", kind: "pie", by: "device", every: "week", weekday: "Monday", time: "08:00" },
    })) as { ok: boolean; problem?: string; chart?: { look: string; kind: string }; proposal?: Record<string, unknown> };
    expect(offer.ok).toBe(true);
    expect(offer.chart).toMatchObject({ look: "analyticsGroups", kind: "pie" });
    expect(offer.proposal).toMatchObject({
      title: "Every Monday, send me a pie of visits by device",
      report: { look: "analyticsChart", measure: "visits", period: "lastWeek", every: "week", weekday: 1, kind: "pie", by: "device" },
    });

    const threadId = await t.run((db) => db.db.insert("threads", { userId: adminId, companyId, title: "A pie", createdAt: 1, updatedAt: 1 }));
    const messageId = await t.run((db) => db.db.insert("messages", { threadId, role: "assistant", content: "Here it is.", createdAt: NOW, taskProposal: offer.proposal as never }));
    await t.withIdentity({ subject: adminId }).mutation(api.hakkenTasks.answerProposal, { messageId, yes: true, timeZone: "Europe/London" });
    const task = (await t.run((db) => db.db.query("hakkenTasks").collect())).find((row) => row.threadId === threadId)!;
    expect(task).toMatchObject({ kind: "REPORT", state: "ON" });

    expect(await t.mutation(internal.hakkenStatReporter.sendReportInternal, { taskId: task._id })).toBe("SENT");
    const email = (await t.run((db) => db.db.query("outboxMessages").collect())).find((row) => row.idempotencyKey?.startsWith(`TASK_CHART:${task._id}:`))!;
    const rendered = await t.run((db) => renderOutboxRow(db, email));
    if (!("email" in rendered)) throw new Error(rendered.skip);
    expect(rendered.email.subject).toMatch(/^Visits by device: \S+ [0-9.]+%$/);
    expect(rendered.email.text).toContain("Last week, against the week before.");
    expect(rendered.email.pictures).toHaveLength(1);
    // Weekly: it waits for next week.
    expect((await t.run((db) => db.db.get(task._id)))?.state).toBe("ON");
  });
});
