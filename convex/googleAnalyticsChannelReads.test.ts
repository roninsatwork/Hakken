import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { dayOf, type Visit } from "@/src/test/googleAnalyticsFake";
import { collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { shiftDay } from "./searchConsoleDays";
import { encryptConnectorToken } from "./connectorTokenCrypto";

/**
 * What Channels and a channel's own page read
 * (docs/plans/active/ga-channel-pages-plan.md): a channel's figures with the
 * conversions it started and its dwell time, its visits by page group and the
 * pages behind the change, every key event, the channel a day against the
 * span before — asked of Google for long spans — and, on Channels, each
 * channel by page group, what a visit is worth and the table's extras. From
 * a property collected with Google faked; only the caller's own website.
 */

/**
 * 31 October 2026: Google's newest whole day is the 30th, so This month is 1–30 October, set against the same days of
 * September — all thirty.
 */
const NOW = Date.parse("2026-10-31T09:30:00Z");
const LAST = "2026-10-30";
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

/**
 * Sixty days of the plain day to `last`, and on Organic Search: an article
 * found in its 30 days only, and a service page whose leads stopped after the
 * 30 before. Forms sent from Organic Search on every day, not counted.
 */
function shifting(last = LAST): Visit[] {
  const visits: Visit[] = [];
  for (let at = 0; at < 60; at += 1) {
    const date = shiftDay(last, -at);
    visits.push(...dayOf(date));
    if (at < 30) {
      visits.push({ date, device: "mobile", channel: "Organic Search", source: "google", landing: "/blog/a/", page: "/blog/a/", sessions: 3, engaged: 3, seconds: 90, views: 6, events: { form_submit: [1, 0] } });
    } else {
      visits.push({ date, device: "desktop", channel: "Organic Search", source: "google", landing: "/services/web/", page: "/services/web/", sessions: 5, engaged: 4, seconds: 150, views: 10, events: { generate_lead: [1, 0] } });
    }
  }
  return visits;
}

const args = { period: "thisMonth" as const, device: "" };

type CollectedFixture = Awaited<ReturnType<typeof collectedWebsite>>;
let shiftingFixture: Promise<CollectedFixture> | undefined;

/**
 * These read-only contracts all inspect the same completed collection. Keep
 * one real collection for them; tests that alter it or use a different day
 * still create their own isolated website.
 */
function collectedShifting(): Promise<CollectedFixture> {
  if (!shiftingFixture) {
    const t = harness();
    shiftingFixture = collectedWebsite(t, shifting(), encryptConnectorToken);
  }
  return shiftingFixture;
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

describe("a channel's own page", () => {
  test("its figures against the same days of the month before and the whole website, with the conversions it started", async () => {
    const { siteId, user } = await collectedShifting();
    const top = await user.query(api.googleAnalyticsChannelReads.analyticsChannelTop, { siteId, ...args, channel: "Organic Search" });
    expect(top.state).toBe("READY");
    // The plain day's 10 visits, and the article's 3 now against the service page's 5 before.
    expect(top.figures).toMatchObject({ visits: 30 * 13, visitsBefore: 30 * 15, conversions: 30, conversionsBefore: 60, started: 30, startedBefore: 60 });
    expect(top.figures?.seconds).toBe(30 * (300 + 90));
    expect(top.figures?.siteVisits).toBeGreaterThan(top.figures?.visits ?? 0);
  });

  test("its visits by page group, Hakken's own page types while the website has no classification, and the pages behind the change", async () => {
    const { siteId, user } = await collectedShifting();
    const top = await user.query(api.googleAnalyticsChannelReads.analyticsChannelTop, { siteId, ...args, channel: "Organic Search" });
    const kind = (key: string) => top.kinds.find((one) => one.kind === key);
    expect(kind("HOME")).toMatchObject({ visits: 300, visitsBefore: 300, conversions: 30, conversionsBefore: 30 });
    expect(kind("ARTICLE")).toMatchObject({ visits: 90, visitsBefore: 0 });
    expect(kind("SERVICE")).toMatchObject({ visits: 0, visitsBefore: 150, conversionsBefore: 30 });
    expect(top.movers.map((page) => [page.address, page.visitsBefore, page.visits])).toEqual([
      ["https://www.acme-shop.test/blog/a/", 0, 90],
      ["https://www.acme-shop.test/services/web/", 150, 0],
    ]);
  });

  test("its table's landing pages and page groups: every device's, each page with its group, filtered by group", async () => {
    const { siteId, user } = await collectedShifting();
    const list = { siteId, ...args, device: "mobile", channel: "Organic Search", page: 1, rows: 25 };
    const pages = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...list, list: "landing" });
    expect(pages.live).toBe(false);
    expect(pages.rows.map((row) => [row.label, row.kind, row.visits])).toEqual([
      ["https://www.acme-shop.test/", "HOME", 300],
      ["https://www.acme-shop.test/blog/a/", "ARTICLE", 90],
    ]);
    // The box is the page's own, never Landing pages'.
    expect(pages.seen.says).toEqual([]);
    const groups = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...list, list: "groups" });
    expect(groups.rows.map((row) => [row.label, row.visits])).toEqual([["HOME", 300], ["ARTICLE", 90]]);
    const articles = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...list, list: "landing", group: "ARTICLE" });
    expect(articles.rows.map((row) => row.visits)).toEqual([90]);
  });

  test("the website's own classifications name its page groups", async () => {
    const t = harness();
    const { siteId, user } = await collectedWebsite(t, shifting(), encryptConnectorToken);
    const classificationId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("pageClassifications", { companyWebsiteId: siteId, name: "Services", type: "SERVICE", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: siteId, classificationId: id, kind: "STARTS_WITH", value: "/services/", createdAt: 1 });
      return id;
    });
    const top = await user.query(api.googleAnalyticsChannelReads.analyticsChannelTop, { siteId, ...args, channel: "Organic Search" });
    expect(top.kinds.find((one) => one.kind === classificationId)).toMatchObject({ name: "Services", visitsBefore: 150 });
    expect(top.kinds.find((one) => one.kind === "NOT_SORTED")?.visits).toBe(390);
  });

  test("What Hakken sees: the service page that made leads and lost its visits, and where the change went", async () => {
    const { siteId, user } = await collectedShifting();
    const top = await user.query(api.googleAnalyticsChannelReads.analyticsChannelTop, { siteId, ...args, channel: "Organic Search" });
    expect(top.seen.says.map((say) => say.code)).toEqual(["lead.down.down", "pageFell", "shift"]);
    expect(top.seen.says[1]).toMatchObject({ text: "/services/web/", a: 150, b: 0, c: 30 });
    expect(top.seen.says[2]).toMatchObject({ text: "ARTICLE", more: "SERVICE" });
    expect(top.seen.steps[0]).toMatchObject({ code: "winBack", text: "/services/web/", link: "seePage" });
  });

  test("a key event Tracking health reads as an enquiry, not counted: count it", async () => {
    const t = harness();
    const { siteId, connectionId, user } = await collectedWebsite(t, shifting(), encryptConnectorToken);
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, { health: { checkedAt: 1, checks: [{ check: "ENQUIRY_UNCOUNTED", passing: false, names: ["form_submit"], count: 30 }] } });
    });
    const top = await user.query(api.googleAnalyticsChannelReads.analyticsChannelTop, { siteId, ...args, channel: "Organic Search" });
    expect(top.seen.steps.find((step) => step.code === "countIt")).toMatchObject({ text: "form_submit", a: 30, link: "chooseWhatCounts" });
  });

  test("AI assistants: each assistant, and the visits Google filed under another channel", async () => {
    const { siteId, user } = await collectedShifting();
    const top = await user.query(api.googleAnalyticsChannelReads.analyticsChannelTop, { siteId, ...args, channel: "AI assistants" });
    // The plain day's Perplexity visits arrive as Referral.
    expect(top.figures).toMatchObject({ visits: 120, elsewhere: 120 });
    expect(top.assistants).toEqual([{ name: "Perplexity", visits: 120, visitsBefore: 120, conversions: 30, filed: [{ channel: "Referral", visits: 120 }] }]);
    expect(top.seen.says.map((say) => say.code)).toContain("filedElsewhere");
    // Where they land: every assistant visit, from the assistants' own list, though Google filed them as Referral (CH13).
    expect(top.kinds.reduce((sum, kind) => sum + kind.visits, 0)).toBe(120);
    // Counted once: AI assistants' row of Channels' map holds them, and Referral's none.
    const channels = await user.query(api.googleAnalyticsChannelReads.analyticsChannelsTop, { siteId, ...args });
    expect(channels.map.rows.find((row) => row.channel === "AI assistants")?.visits).toBe(120);
    expect(channels.map.rows.find((row) => row.channel === "Referral")).toBeUndefined();
    // Its table: each assistant with the visits filed elsewhere, and only those filed as one channel when asked.
    const list = { siteId, ...args, list: "source" as const, channel: "AI assistants", page: 1, rows: 25 };
    const every = await user.query(api.googleAnalyticsReads.analyticsListPage, list);
    expect(every.rows.map((row) => [row.label, row.visits, row.elsewhere])).toEqual([["Perplexity", 120, 120]]);
    expect((await user.query(api.googleAnalyticsReads.analyticsListPage, { ...list, filed: "Referral" })).rows.map((row) => row.visits)).toEqual([120]);
    expect((await user.query(api.googleAnalyticsReads.analyticsListPage, { ...list, filed: "AI Assistant" })).rows).toEqual([]);
  });

  test("every key event, counted or not, with where those visits landed", async () => {
    const { siteId, user } = await collectedShifting();
    const events = await user.query(api.googleAnalyticsChannelReads.analyticsChannelEvents, { siteId, ...args, channel: "Organic Search" });
    expect(events.rows.map((row) => row.eventName).sort()).toEqual(["click_tel", "form_submit", "generate_lead", "sign_up"]);
    expect(events.rows.find((row) => row.eventName === "generate_lead")).toMatchObject({ counted: true, count: 30, countBefore: 60, value: 30 * 25_000 });
    expect(events.rows.find((row) => row.eventName === "form_submit")).toMatchObject({
      counted: false, count: 30, countBefore: 0, value: 0, landed: [{ address: "https://www.acme-shop.test/blog/a/", count: 30 }],
    });
  });

  test("the channel a day, against the span before, from the days kept", async () => {
    const { siteId, user } = await collectedShifting();
    const days = await user.query(api.googleAnalyticsChannelReads.analyticsChannelDays, { siteId, ...args, channel: "Organic Search" });
    expect(days.live).toBe(false);
    expect(days.now).toHaveLength(30);
    expect(days.before).toHaveLength(30);
    expect(days.now.at(-1)).toMatchObject({ day: LAST, visits: 13, seconds: 390, conversions: 1 });
    // September's days laid over October's, first over first.
    expect(days.shift).toBe(30);
    expect(days.before[0]).toMatchObject({ visits: 15, conversions: 2 });
    expect(days.events.map((event) => event.eventName)).toEqual(["generate_lead", "click_tel", "sign_up", "form_submit"]);
    expect(days.sources).toEqual(["google"]);
  });

  test("for last quarter: the dates and the span before from what is held, its two years filled by itself after the first collection", async () => {
    // 1 October: Google's newest whole day is 30 September, so Last quarter is July to September, every day held.
    vi.setSystemTime(Date.parse("2026-10-01T09:30:00Z"));
    const t = harness();
    const { siteId, user, google } = await collectedWebsite(t, shifting("2026-09-30"), encryptConnectorToken);
    const asked = google.calls.length;
    const held = await user.query(api.googleAnalyticsChannelReads.analyticsChannelDays, { siteId, period: "last3Months", device: "", channel: "Organic Search" });
    expect(held).toMatchObject({ live: false, liveBefore: false, from: "2026-07-01", to: "2026-09-30" });
    expect(held.now).toHaveLength(92);
    expect(held.now.at(-1)?.visits).toBe(13);
    expect(google.calls.length).toBe(asked);
  });

  test("only the caller's own website", async () => {
    const { siteId, rival } = await collectedShifting();
    await expect(rival.query(api.googleAnalyticsChannelReads.analyticsChannelTop, { siteId, ...args, channel: "Organic Search" })).rejects.toThrow();
    await expect(rival.query(api.googleAnalyticsChannelReads.analyticsChannelDays, { siteId, ...args, channel: "Organic Search" })).rejects.toThrow();
    await expect(rival.query(api.googleAnalyticsChannelReads.analyticsChannelEvents, { siteId, ...args, channel: "Organic Search" })).rejects.toThrow();
    await expect(rival.query(api.googleAnalyticsChannelReads.analyticsChannelsTop, { siteId, ...args })).rejects.toThrow();
  });
});

describe("Channels", () => {
  test("each channel by page group, what a visit is worth, and What Hakken sees", async () => {
    const { siteId, user } = await collectedShifting();
    const top = await user.query(api.googleAnalyticsChannelReads.analyticsChannelsTop, { siteId, ...args });
    expect(top.state).toBe("READY");
    // A lead and a call a day, and the service page's lead a day before.
    expect(top.figures).toMatchObject({ conversions: 30 * 2, conversionsBefore: 30 * 3 });
    const organic = top.map.rows.find((row) => row.channel === "Organic Search");
    expect(organic?.visits).toBe(390);
    expect(organic?.cells.find((cell) => cell.kind === "HOME")).toMatchObject({ visits: 300, conversions: 30 });
    expect(top.worth.rows.map((row) => row.channel)).toContain("AI assistants");
    expect(top.figures?.uncounted).toEqual([{ eventName: "form_submit", count: 30, enquiry: false }]);
    expect(top.seen.says[0].code).toMatch(/^lead\./);
  });

  test("the table's extras: the conversions each channel started and where most of its visits land, filtered by that page group", async () => {
    const { siteId, user } = await collectedShifting();
    const page = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, ...args, list: "channel", page: 1, rows: 25 });
    const organic = page.rows.find((row) => row.label === "Organic Search");
    expect(organic).toMatchObject({ started: 30, landsMost: { kind: "HOME", name: null } });
    expect(organic?.landsMost?.share).toBeCloseTo(300 / 390);
    const home = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, ...args, list: "channel", group: "HOME", page: 1, rows: 25 });
    expect(home.rows.map((row) => row.label)).toContain("Organic Search");
    expect(home.rows.map((row) => row.label)).not.toContain("AI assistants");
  });
});
