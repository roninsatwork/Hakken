import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import type { Visit } from "@/src/test/googleAnalyticsFake";
import { collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { shiftDay } from "./searchConsoleDays";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { channelBoxes } from "./utils/channelBoxes";

/**
 * What Channels reads above its table (docs/plans/active/channels-new-page-plan-2026-11-06.md, step 1) and how Ask Hakken reads it
 * (step 9), from a property collected with Google faked: figures easy to check by hand, September against August. Nothing is asked of
 * Google by any read here. Only the caller's own website.
 */

const NOW = Date.parse("2026-10-02T09:30:00Z");
const TOP = "2026-09-30";
const IN_SEPTEMBER = 30;
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const SHOP_EVENTS = [
  { eventName: "add_to_cart", counted: true }, { eventName: "begin_checkout", counted: true },
  { eventName: "purchase", counted: true }, { eventName: "checkout_complete", counted: true },
];

/**
 * A shop. Organic Search sends 10 visits a day to a Classification-less home page and buys once; Paid Search sends 4 to /shop/ and buys
 * twice; Referral is AI, from Perplexity, a visit a day; Email stops at the end of August.
 */
function shopVisits(): Visit[] {
  const visits: Visit[] = [];
  for (let at = 0; at < 61; at += 1) {
    const date = shiftDay(TOP, -at);
    const now = at < IN_SEPTEMBER;
    visits.push({
      date, device: "mobile", channel: "Organic Search", source: "google", landing: "/", page: "/",
      sessions: now ? 10 : 8, engaged: 6, seconds: 300, views: 20, purchases: 1, revenue: 500,
      events: { add_to_cart: [3, 0], begin_checkout: [2, 0], purchase: [1, 0], checkout_complete: [1, 0], generate_lead: [1, 0] },
    });
    visits.push({
      date, device: "desktop", channel: "Paid Search", source: "google", landing: "/services/web/", page: "/services/web/",
      sessions: now ? 4 : 6, engaged: 3, seconds: 100, views: 8, purchases: 2, revenue: 900,
      events: { add_to_cart: [2, 0], begin_checkout: [2, 0], purchase: [2, 0], checkout_complete: [2, 0] },
    });
    visits.push({ date, device: "desktop", channel: "Referral", source: "perplexity.ai", landing: "/blog/a/", page: "/blog/a/", sessions: 1, engaged: 1, seconds: 10, views: 1 });
    if (!now) visits.push({ date, device: "mobile", channel: "Email", source: "newsletter", landing: "/", page: "/", sessions: 3, engaged: 2, seconds: 30, views: 3, events: { generate_lead: [1, 0] } });
  }
  return visits;
}

const lastMonth = { period: "lastMonth" as const, device: "" };

type Fixture = Awaited<ReturnType<typeof collectedWebsite>>;
let shop: { fixture: Fixture; t: ReturnType<typeof harness> } | undefined;
async function collectedShop() {
  if (!shop) {
    const t = harness();
    shop = { t, fixture: await collectedWebsite(t, shopVisits(), encryptConnectorToken, { keyEvents: SHOP_EVENTS }) };
  }
  return shop;
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

describe("Visits each day, by channel", () => {
  test("every channel's days, with every key event's times, in one read: the busiest first, and the dates before", async () => {
    const { fixture: { siteId, user } } = await collectedShop();
    const chart = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelsEachDay, { siteId, ...lastMonth });
    expect(chart.live).toBe(false);
    expect(chart.channels).toEqual(["Organic Search", "Paid Search", "AI assistants"]);
    expect(chart.points).toHaveLength(30);
    expect(chart.points[0].visits).toEqual([10, 4, 1]);
    const at = (event: string) => chart.events.findIndex((one) => one.eventName === event);
    expect(chart.points[0].events[at("add_to_cart")]).toEqual([3, 2, 0]);
    expect(chart.points[0].events[at("purchase")]).toEqual([1, 2, 0]);
    expect(chart.before).toHaveLength(31);
    expect(chart.before?.[0].visits).toEqual([8, 6, 1]);
  });

  test("a key event nearly the same as another shows once, the purchase kept; one not counted says so; the most first", async () => {
    const { fixture: { siteId, user } } = await collectedShop();
    const { events } = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelsEachDay, { siteId, ...lastMonth });
    expect(events.map((one) => [one.eventName, one.times, one.counted])).toEqual([
      ["add_to_cart", 150, true],
      ["begin_checkout", 120, true],
      ["purchase", 90, true],
      ["generate_lead", 30, true],
    ]);
  });
});

describe("Where each channel's visits started", () => {
  test("by Classification: visits, bought and conversions in each square, now and before, AI assistants counted once", async () => {
    const { fixture: { siteId, user } } = await collectedShop();
    const squares = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelSquares, { siteId, ...lastMonth, split: "kind" });
    expect(squares).toMatchObject({ collecting: false, everyDevice: false, hasBefore: true });
    expect(squares.rows.map((row) => row.channel)).toEqual(["Organic Search", "Paid Search", "AI assistants"]);
    const organic = squares.rows[0];
    expect(organic).toMatchObject({ visits: 300, visitsBefore: 248, bought: 30, boughtBefore: 31 });
    const home = organic.cells[squares.columns.findIndex((column) => column.key === "HOME")];
    expect(home).toMatchObject({ visits: 300, visitsBefore: 248, bought: 30, boughtBefore: 31 });
    expect(squares.rows.find((row) => row.channel === "Referral")).toBeUndefined();
  });

  test("by device: every device's own list, each channel's total as the table says it", async () => {
    const { fixture: { siteId, user } } = await collectedShop();
    const squares = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelSquares, { siteId, ...lastMonth, device: "desktop", split: "device" });
    expect(squares.columns.map((column) => [column.key, column.visits])).toEqual([["desktop", 150], ["mobile", 300]]);
    const paid = squares.rows.find((row) => row.channel === "Paid Search");
    expect(paid).toMatchObject({ visits: 120, visitsBefore: 186, bought: 60 });
    expect(paid?.cells[0]).toMatchObject({ visits: 120, visitsBefore: 186, bought: 60, boughtBefore: 62 });
    expect(paid?.cells[1]).toMatchObject({ visits: 0, bought: 0 });
  });
});

describe("How far people got", () => {
  test("every channel's steps in visits, and the whole website's by Google's own total", async () => {
    const { fixture: { siteId, user } } = await collectedShop();
    const steps = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelSteps, { siteId, ...lastMonth });
    expect(steps.tracks).toEqual({ basket: true, checkout: true });
    expect(steps.channels.map((row) => row.channel)).toEqual(["Organic Search", "Paid Search", "AI assistants"]);
    expect(steps.channels[1]).toEqual({ channel: "Paid Search", arrived: 120, stayed: 90, basket: 60, checkout: 60, bought: 60 });
    expect(steps.everywhere).toMatchObject({ arrived: 450, stayed: 300, basket: 150, checkout: 120, bought: 90 });
  });
});

describe("one device chosen at the top of the page", () => {
  test("the chart, the squares, the steps and the table are that device's own, and don't say every device", async () => {
    const { fixture: { siteId, user } } = await collectedShop();
    const args = { siteId, period: "lastMonth" as const, device: "desktop" };
    const chart = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelsEachDay, args);
    expect(chart.channels).toEqual(["Paid Search", "AI assistants"]);
    const squares = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelSquares, { ...args, split: "kind" });
    expect(squares.everyDevice).toBe(false);
    expect(squares.rows.map((row) => [row.channel, row.visits])).toEqual([["Paid Search", 120], ["AI assistants", 30]]);
    const steps = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelSteps, args);
    expect(steps.everyDevice).toBe(false);
    expect(steps.everywhere).toMatchObject({ arrived: 150, basket: 60 });
    expect(steps.channels.map((row) => [row.channel, row.arrived, row.bought])).toEqual([["Paid Search", 120, 60], ["AI assistants", 30, 0]]);
    const list = await user.query(api.googleAnalyticsReads.analyticsListPage, { ...args, list: "channel", page: 1, rows: 25, sort: "visits", direction: "desc" });
    expect(list.rows.map((row) => [row.label, row.visits, row.basketVisits])).toEqual([["Paid Search", 120, 60], ["AI assistants", 30, 0]]);
  });
});

describe("the table", () => {
  test("each channel's visits at each step and what was bought, sorted over the whole list, and a channel that stopped altogether", async () => {
    const { fixture: { siteId, user } } = await collectedShop();
    const ask = (sort: string, direction: string) => user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, ...lastMonth, list: "channel", page: 1, rows: 25, sort, direction } as never);
    const byVisits = await ask("visits", "desc");
    expect(byVisits.rows.map((row) => [row.label, row.visits, row.basketVisits, row.checkoutVisits, row.purchases])).toEqual([
      ["Organic Search", 300, 90, 60, 30],
      ["Paid Search", 120, 60, 60, 60],
      ["AI assistants", 30, 0, 0, 0],
    ]);
    expect(byVisits.gone).toEqual([{ key: "Email", visitsBefore: 93, purchasesBefore: 0, conversionsBefore: 31 }]);
    expect((await ask("basket", "desc")).rows[0].label).toBe("Organic Search");
    expect((await ask("checkout", "asc")).rows[0].label).toBe("AI assistants");
    expect((await ask("boughtRate", "desc")).rows[0].label).toBe("Paid Search");
  });

  test("the boxes' rule, on the list and Google's own total: the biggest change can be a channel that stopped", async () => {
    const { fixture: { siteId, user } } = await collectedShop();
    const list = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, ...lastMonth, list: "channel", page: 1, rows: 100 });
    const overview = await user.query(api.googleAnalyticsReads.analyticsOverview, { siteId, ...lastMonth });
    const boxes = channelBoxes(
      [...list.rows.map((row) => ({ key: row.label, visits: row.visits, visitsBefore: row.visitsBefore ?? null, done: row.purchases })), ...(list.gone ?? []).map((one) => ({ key: one.key, visits: 0, visitsBefore: one.visitsBefore, done: 0 }))],
      { visits: overview.now?.visits ?? null, done: overview.now?.purchases ?? null },
    );
    expect(boxes.mostVisits).toMatchObject({ key: "Organic Search", visits: 300 });
    expect(boxes.mostDone).toMatchObject({ key: "Paid Search", done: 60 });
    expect(boxes.bestFor).toMatchObject({ key: "Paid Search", per100: 50 });
    expect(boxes.biggestChange).toEqual({ key: "Email", change: -93 });
  });

  test("only the caller's own website", async () => {
    const { fixture: { siteId, rival } } = await collectedShop();
    await expect(rival.query(api.googleAnalyticsChannelPageReads.analyticsChannelSteps, { siteId, ...lastMonth })).rejects.toThrow();
  });
});

describe("Ask Hakken on Channels", () => {
  const PERIODS = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
  const read = async (t: ReturnType<typeof harness>, siteId: Fixture["siteId"], extra: Record<string, unknown> = {}) => {
    const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
    return (await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "acme-shop.test", screen: "channels", period: "lastMonth", ...extra } as never)) as never as Record<string, never>;
  };

  test("on all seven dates its figures are the screen's: the table, the steps and each square", async () => {
    const { t, fixture: { siteId, user } } = await collectedShop();
    for (const period of PERIODS) {
      const list = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, period, device: "", list: "channel", page: 1, rows: 25, sort: "visits", direction: "desc" });
      const asked = await read(t, siteId, { period });
      expect((asked.rows as Array<{ channel: string; visits: number; bought: number }>).map((row) => [row.channel, row.visits, row.bought]), period).toEqual(list.rows.map((row) => [row.label, row.visits, row.purchases]));
      const steps = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelSteps, { siteId, period, device: "" });
      const askedSteps = (await read(t, siteId, { period, part: "steps" })).steps as { channels: Array<{ channel: string; arrived: number; bought: number }> };
      expect(askedSteps.channels.map((row) => [row.channel, row.arrived, row.bought]), period).toEqual(steps.channels.map((row) => [row.channel, row.arrived, row.bought]));
      const squares = await user.query(api.googleAnalyticsChannelPageReads.analyticsChannelSquares, { siteId, period, device: "", split: "kind" });
      const askedSquares = (await read(t, siteId, { period, part: "squares" })).whereVisitsStarted as { rows: Array<{ channel: string; visits: number; classifications: Array<{ visits: number }> }> };
      expect(askedSquares.rows.map((row) => [row.channel, row.visits, row.classifications.reduce((sum, one) => sum + one.visits, 0)]), period).toEqual(squares.rows.map((row) => [row.channel, row.visits, row.cells.reduce((sum, one) => sum + one.visits, 0)]));
    }
  });

  test("it says the page's words, and no money: the boxes, the chart's events in times, the order asked, one channel alone", async () => {
    const { t, fixture: { siteId } } = await collectedShop();
    const first = await read(t, siteId);
    expect(JSON.stringify(first)).not.toMatch(/"value"|revenue|GBP/);
    expect(first.conversionsRule).toContain("not visits");
    expect(first.conversionsRule).toContain("135");
    expect(first.listsRule).toContain("Google counts each list on its own");
    expect((await read(t, siteId, { order: "lostMostVisits" })).rows[0]).toMatchObject({ channel: "Paid Search" });
    expect((await read(t, siteId, { order: "sellsBest" })).rows[0]).toMatchObject({ channel: "Paid Search" });

    const { boxes } = await read(t, siteId, { part: "boxes" }) as never as { boxes: Record<string, Record<string, unknown>> };
    expect(boxes.mostVisits).toMatchObject({ channel: "Organic Search", visits: 300 });
    expect(boxes.sellsBest).toMatchObject({ channel: "Paid Search", boughtPer100Visits: 50 });
    expect(boxes.biggestChange).toMatchObject({ channel: "Email", moreOrFewerVisits: -93 });

    const { chart } = await read(t, siteId, { part: "chart", key: "Paid Search" }) as never as { chart: { rows: Array<Record<string, number>>; eventsInTimes: Array<{ event: string; times: number; byChannel: Array<{ channel: string; times: number }> }> } };
    expect(chart.rows[0]["Paid Search"]).toBe(4);
    expect(chart.rows[0]["Organic Search"]).toBeUndefined();
    expect(chart.eventsInTimes.find((one) => one.event === "Added to basket")?.byChannel).toEqual([{ channel: "Paid Search", times: 60 }]);

    const { steps } = await read(t, siteId, { part: "steps", key: "paid search" }) as never as { steps: { everywhere?: unknown; channels: unknown[]; rule: string } };
    expect(steps.channels).toEqual([{ channel: "Paid Search", arrived: 120, stayed: 90, inBasket: 60, atCheckout: 60, bought: 60 }]);
    expect(steps.everywhere).toBeUndefined();
    expect(steps.rule).toContain("no step can pass 100%");

    const { byDevice } = await read(t, siteId, { part: "devices" }) as never as { byDevice: { rows: Array<{ channel: string; devices: Array<{ device: string; visits: number; bought: number }> }> } };
    expect(byDevice.rows.find((row) => row.channel === "Organic Search")?.devices).toEqual([expect.objectContaining({ device: "mobile", visits: 300, bought: 30 })]);
  });

  test("a website with nothing bought speaks of events, and leaves the steps off", async () => {
    const t = harness();
    const visits: Visit[] = [];
    for (let at = 0; at < 61; at += 1) {
      visits.push({ date: shiftDay(TOP, -at), device: "mobile", channel: "Organic Search", source: "google", landing: "/", page: "/", sessions: 5, engaged: 3, seconds: 90, views: 8, events: { generate_lead: [1, 0] } });
    }
    const { siteId } = await collectedWebsite(t, visits, encryptConnectorToken);
    const first = await read(t, siteId);
    expect(first.rows[0]).toMatchObject({ channel: "Organic Search", visits: 150, events: 30, eventsPer100Visits: 20 });
    expect(JSON.stringify(first.rows)).not.toMatch(/bought|conversions/i);
    expect(first.rule).toContain("Say events");
    const { boxes } = await read(t, siteId, { part: "boxes" }) as never as { boxes: Record<string, Record<string, unknown> | null> };
    expect(boxes.mostBought).toBeUndefined();
    expect(boxes.mostEvents).toMatchObject({ channel: "Organic Search", events: 30 });
    // The only channel with 100 visits has nothing to beat, so it isn't the best of anything.
    expect(boxes.bestForEvents).toBeNull();
    expect((await read(t, siteId, { part: "steps" })).steps).toContain("leaves the steps off");
    expect((await read(t, siteId, { order: "sellsBest" })).rows[0]).toMatchObject({ channel: "Organic Search" });
  });
});
