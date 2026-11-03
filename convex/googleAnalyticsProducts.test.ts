import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { shiftDay } from "./searchConsoleDays";
import { PROPERTY, fakeGoogle, history, type Visit } from "@/src/test/googleAnalyticsFake";
import { chartFromToolCalls } from "./utils/assistantCharts";

/**
 * Products (docs/plans/active/google-analytics-plan.md GA34, §18.6.6): a
 * website is a shop when any of the shop's four steps happened this quarter or
 * last — found by itself, nothing set in admin — and only a shop has its
 * products asked and its page shown. On a fixed day, 9 October 2026, so last
 * month is September. Google faked.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");
/** Last month's last day on that day: September's 30 days are its whole. */
const LAST_MONTH_END = "2026-09-30";
/** On Thursday 1 October, Google's newest day 30 September: last week from 21 September and last month fetched already. */
const ON_1_OCTOBER = [{ key: "lastWeek", from: "2026-09-21", settled: true }, { key: "lastMonth", from: "2026-09-01", settled: true }];

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** On Friday 9 October, last week and last month fetched already; last quarter, which shows a shop or none, still asked. */
const ON_9_OCTOBER = [{ key: "lastWeek", from: "2026-09-28", settled: true }, { key: "lastMonth", from: "2026-09-01", settled: true }];

/** A website connected to Analytics with a purchase counted; `fetched`, the finished periods fetched already. */
async function connected(t: Harness, fetched: false | typeof ON_1_OCTOBER = false) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "COUNTING", property: PROPERTY, propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [],
      timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
      events: [{ eventName: "purchase", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 30 }],
      // Counted by Google's own counts, last week and last month fetched already: the first run asks the periods still
      // going and last quarter, whose events show the shop (AGENTS.md: a test asks no more than its assertions read).
      ...(fetched ? { countedWith: "EVENT_COUNT", periodsFetched: fetched } : {}),
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

/** The daily run, as the schedule starts it. */
async function dailyRun(t: Harness, agentId: Id<"agents">) {
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "SCHEDULE", objective: "Collect", title: "Google Analytics: Data Collection Scheduler",
    status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId });
  await finishScheduled(t);
}

/**
 * A shop's last month, September's 30 days: a hundred looks at products a day,
 * ten baskets, five checkouts and two sales — the brass handle selling, the
 * T-bar pull looked at and never bought.
 */
function shopDays(): Visit[] {
  return Array.from({ length: 30 }, (_, at): Visit => ({
    date: shiftDay(LAST_MONTH_END, -at), device: "mobile", channel: "Organic Search", source: "google", landing: "/shop/", page: "/shop/",
    sessions: 20, engaged: 12, seconds: 600, views: 120, purchases: 2, revenue: 260,
    events: { view_item: [100, 0], add_to_cart: [10, 0], begin_checkout: [5, 0], purchase: [2, 0] },
    items: [
      { name: "Brass lever handle", category: "Handles", viewed: 60, added: 8, bought: 2, revenue: 130 },
      { name: "Black T-bar pull", category: "Pulls", viewed: 40, added: 2, bought: 0, revenue: 0 },
    ],
  }));
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

const save = (admin: Awaited<ReturnType<typeof connected>>["admin"], siteId: Id<"companyWebsites">) =>
  admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, { siteId, events: [{ eventName: "purchase", counted: true, hakkenValue: null }] });

/**
 * A shop found by itself on 1 October, and the next run asking its products: September's figures for the page. On
 * 1 October This Month and This Quarter hold no days yet: the runs ask This Week, This Year and the finished periods,
 * the second run every finished one again with the shop's products (AGENTS.md: as little as it reads).
 */
async function aShop(t: Harness) {
  vi.setSystemTime(Date.parse("2026-10-01T09:30:00Z"));
  const { siteId, connectionId, agentId, admin } = await connected(t, ON_1_OCTOBER);
  const google = fakeGoogle([...history(70, LAST_MONTH_END), ...shopDays()]);
  await save(admin, siteId);
  await finishScheduled(t);
  const asked = google.calls.length;
  await dailyRun(t, agentId);
  const companyId = await t.run(async (ctx) => (await ctx.db.get(siteId))!.companyId);
  return { siteId, connectionId, admin, companyId, itemAsks: google.calls.slice(asked).filter((call) => call.url.endsWith(":runReport") && call.body.includes("itemsViewed")) };
}

describe("Products, only for a shop", () => {
  test("a shop is found by itself from this quarter or last; the next run asks its products; last month's page reads them", async () => {
    const t = harness();
    const { siteId, connectionId, admin, companyId, itemAsks } = await aShop(t);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.shop).toBe(true);
    expect((await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))?.connection?.shop).toBe(true);
    expect(itemAsks.length).toBeGreaterThan(0);

    const args = { siteId, period: "lastMonth" as const, device: "" };
    const products = (await admin.query(api.googleAnalyticsProductReads.analyticsProducts, args))!;
    expect(products).toMatchObject({ shop: true, preparing: false, missing: [], categories: ["Handles", "Pulls"] });
    // No money (products-screen-4-plan-2026-11-02.md). Until the company picks, Google's own names are the steps and
    // the sale: ten visits a day added to the basket, five started checkout and two bought; August had none.
    expect(products.choice).toEqual({ steps: ["add_to_cart", "begin_checkout"], sale: "purchase", saved: false });
    expect(products.journey).toEqual({
      steps: [{ eventName: "add_to_cart", visits: 300, visitsBefore: 0 }, { eventName: "begin_checkout", visits: 150, visitsBefore: 0 }],
      sale: { eventName: "purchase", visits: 60, visitsBefore: 0 },
    });
    // The Steps dropdown: every event recorded, most visits first, Google's automatic four left out.
    const recorded = products.events.map((event) => event.eventName);
    expect(recorded).toEqual(expect.arrayContaining(["view_item", "add_to_cart", "begin_checkout", "purchase"]));
    expect(recorded.some((name) => ["session_start", "first_visit", "user_engagement", "page_view"].includes(name))).toBe(false);
    expect(products.events.map((event) => event.visits)).toEqual([...products.events.map((event) => event.visits)].sort((left, right) => right - left));
    // The T-bar pull added and never bought.
    expect(products.neverBought).toMatchObject({ count: 1, of: 2 });
    // Four in five baskets and three in five checkouts left; the pull added sixty times and never bought.
    expect(products.seen.says).toEqual([
      { code: "basketsLeftAlone", a: 0.8, c: 300, text: "add_to_cart" },
      { code: "checkoutsLeftAlone", a: 0.6, c: 150, text: "begin_checkout" },
      { code: "mostLeft", text: "Black T-bar pull", a: 60, b: 0 },
    ]);
    expect(products.seen.steps.map((step) => step.code)).toEqual(["seeProduct", "whyUnfinished"]);
    // Ask Hakken reads the same: each step's visits and the share left without the sale, and never money.
    const assistant = await t.query(internal.assistantAnalyticsReads.googleAnalyticsInternal, { companyId, website: "acme-shop.test", screen: "products", period: "lastMonth" }) as unknown as {
      steps: unknown[]; sale: unknown; products: Array<Record<string, unknown>>;
    };
    expect(assistant.steps).toEqual([
      { event: "add_to_cart", visits: 300, visitsTheSpanBefore: 0, visitsLeftWithoutTheSale: 240, leftWithoutTheSalePercent: 80 },
      { event: "begin_checkout", visits: 150, visitsTheSpanBefore: 0, visitsLeftWithoutTheSale: 90, leftWithoutTheSalePercent: 60 },
    ]);
    expect(assistant.sale).toEqual({ event: "purchase", visits: 60, visitsTheSpanBefore: 0 });
    expect(JSON.stringify(assistant)).not.toMatch(/revenue/i);
    expect(assistant.products[0]).toMatchObject({ name: "Brass lever handle", itemsBought: 60, itemsAddedToBasket: 240, itemsLeftInBasket: 180, shareOfItemsBoughtPercent: 100 });

    // The company picks its own steps and sale: the page reads them, for everyone at the company.
    await admin.mutation(api.googleAnalyticsShopSteps.saveShopSteps, { siteId, steps: ["add_to_cart"], sale: "begin_checkout" });
    const picked = (await admin.query(api.googleAnalyticsProductReads.analyticsProducts, args))!;
    expect(picked.choice).toEqual({ steps: ["add_to_cart"], sale: "begin_checkout", saved: true });
    expect(picked.journey.sale).toEqual({ eventName: "begin_checkout", visits: 150, visitsBefore: 0 });
    await expect(admin.mutation(api.googleAnalyticsShopSteps.saveShopSteps, { siteId, steps: ["purchase"], sale: "purchase" })).rejects.toThrow(/can't also be one of the steps/);
    await expect(admin.mutation(api.googleAnalyticsShopSteps.saveShopSteps, { siteId, steps: ["page_view"], sale: "purchase" })).rejects.toThrow(/every visit/);
    // Another company's admin can't change it.
    const stranger = await t.run(async (ctx) => {
      const otherCompany = await ctx.db.insert("companies", { name: "Other", createdAt: 1 });
      return await ctx.db.insert("users", { name: "Other admin", email: "admin@other.test", role: "ADMIN", companyId: otherCompany, createdAt: 1 });
    });
    await expect(t.withIdentity({ subject: stranger }).mutation(api.googleAnalyticsShopSteps.saveShopSteps, { siteId, steps: [], sale: "purchase" })).rejects.toThrow();
  });

  test("the table by product or category, the products chart, and Ask Hakken's chart by product", async () => {
    const t = harness();
    const { siteId, admin, companyId } = await aShop(t);
    const args = { siteId, period: "lastMonth" as const, device: "" };
    // The table: items bought, added and left, and each product's share, the most bought first.
    const list = await admin.query(api.googleAnalyticsProductReads.analyticsProductList, { ...args, page: 1, rows: 25 });
    expect(list.rows.map((row) => [row.name, row.category, row.itemsBought, row.itemsAdded, row.itemsLeft, row.share])).toEqual([
      ["Brass lever handle", "Handles", 60, 240, 180, 1],
      ["Black T-bar pull", "Pulls", 0, 60, 60, 0],
    ]);
    const pulls = await admin.query(api.googleAnalyticsProductReads.analyticsProductList, { ...args, category: "Pulls", page: 1, rows: 25 });
    expect(pulls.rows.map((row) => row.name)).toEqual(["Black T-bar pull"]);
    const notBought = await admin.query(api.googleAnalyticsProductReads.analyticsProductList, { ...args, show: "notBought", page: 1, rows: 25 });
    expect(notBought.rows.map((row) => row.name)).toEqual(["Black T-bar pull"]);
    const byCategory = await admin.query(api.googleAnalyticsProductReads.analyticsProductList, { ...args, view: "categories", sort: "itemsAdded", page: 1, rows: 25 });
    expect(byCategory.rows.map((row) => [row.name, row.itemsBought, row.itemsAdded])).toEqual([["Handles", 60, 240], ["Pulls", 0, 60]]);

    // The products chart: most left, most bought, and the rise against August, when nothing sold.
    const chart = await admin.query(api.googleAnalyticsProductReads.analyticsProductChart, args);
    expect(chart.left.map((row) => [row.name, row.itemsLeft])).toEqual([["Brass lever handle", 180], ["Black T-bar pull", 60]]);
    expect(chart.sold.map((row) => row.name)).toEqual(["Brass lever handle"]);
    expect(chart.more.map((row) => [row.name, row.itemsBought, row.itemsBoughtBefore])).toEqual([["Brass lever handle", 60, 0]]);
    expect(chart.less).toEqual([]);
    // Ask Hakken draws the same chart by product: items, never money, the period before beside them.
    const byProduct = { companyId, website: "acme-shop.test", period: "lastMonth" as const, kind: "bars" as const, by: "product" as const, source: "analytics" as const };
    const sold = await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...byProduct, measure: "itemsBought" });
    expect(sold.ok && sold.chart).toMatchObject({ look: "analyticsGroups", by: "product", measure: "itemsBought", groups: [{ name: "Brass lever handle", value: 60, before: 0 }] });
    // And it is drawn under the answer: the chart is picked up from the tool's result (seen missing on MoreHandles, 2026-11-02).
    const called = { handlerMapping: "assistant.chart", status: "SUCCESS", resultJson: JSON.stringify({ status: "ok", data: { ok: true, chart: sold.ok ? sold.chart : null } }) };
    expect(chartFromToolCalls([called])).toMatchObject({ look: "analyticsGroups", by: "product" });
    expect(await t.query(internal.assistantGroupChartReads.groupsChartInternal, { ...byProduct, kind: "pie", measure: "itemsBought" })).toMatchObject({ ok: false, problem: "A chart of products is drawn as bars." });

  });

  test("a website selling nothing is no shop: no products asked, the page says so", async () => {
    const t = harness();
    // Its quarters asked, which show a shop or none; last week and last month not read (AGENTS.md: as little as it reads).
    const { siteId, connectionId, agentId, admin } = await connected(t, ON_9_OCTOBER);
    const google = fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);
    await dailyRun(t, agentId);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.shop).toBeUndefined();
    expect(google.calls.some((call) => call.body.includes("itemsViewed"))).toBe(false);
    expect((await admin.query(api.googleAnalyticsProductReads.analyticsProducts, { siteId, period: "lastMonth", device: "" }))?.shop).toBe(false);
  });
});
