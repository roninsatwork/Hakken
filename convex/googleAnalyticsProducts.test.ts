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
import { NEWEST, PROPERTY, fakeGoogle, history, type Visit } from "@/src/test/googleAnalyticsFake";

/**
 * Products (docs/plans/active/google-analytics-plan.md GA34, §18.6.6): a
 * website is a shop when any of the shop's four steps happened in the last 90
 * days — found by itself, nothing set in admin — and only a shop has its
 * products asked and its page shown. Google faked.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** A website connected to Analytics with a purchase counted. */
async function connected(t: Harness) {
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
 * A shop's last 30 days: a hundred looks at products a day, ten baskets, five
 * checkouts and two sales — the brass handle selling, the T-bar pull looked at
 * and never bought.
 */
function shopDays(): Visit[] {
  return Array.from({ length: 30 }, (_, at): Visit => ({
    date: shiftDay(NEWEST, -at), device: "mobile", channel: "Organic Search", source: "google", landing: "/shop/", page: "/shop/",
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

describe("Products, only for a shop", () => {
  test("a shop is found by itself from its last 90 days; the next run asks its products; the page reads them", async () => {
    const t = harness();
    const { siteId, connectionId, agentId, admin } = await connected(t);
    const google = fakeGoogle([...history(70), ...shopDays()]);
    await save(admin, siteId);
    await finishScheduled(t);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.shop).toBe(true);
    expect((await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))?.connection?.shop).toBe(true);
    const asked = google.calls.length;

    await dailyRun(t, agentId);
    const itemAsks = google.calls.slice(asked).filter((call) => call.url.endsWith(":runReport") && call.body.includes("itemsViewed"));
    expect(itemAsks.length).toBeGreaterThan(0);

    const args = { siteId, period: "30" as const, device: "" };
    const products = (await admin.query(api.googleAnalyticsProductReads.analyticsProducts, args))!;
    expect(products).toMatchObject({ shop: true, preparing: false, missing: [], categories: ["Handles", "Pulls"] });
    expect(products.steps).toEqual({ looked: 3000, basket: 300, checkout: 150, bought: 60, revenue: 30 * 26_000 });
    expect(products.points).toHaveLength(30);
    expect(products.points.every((point) => point.bought === 2)).toBe(true);
    expect(products.seen.says.map((phrase) => phrase.code)).toEqual(["looksToBasket", "fewFinished", "stuck"]);
    expect(products.seen.steps.map((step) => step.code)).toEqual(["seeProduct", "whyUnfinished"]);

    const list = await admin.query(api.googleAnalyticsProductReads.analyticsProductList, { ...args, page: 1, rows: 25 });
    expect(list.rows.map((row) => [row.name, row.category, row.looks, row.basket, row.bought, row.revenue])).toEqual([
      ["Brass lever handle", "Handles", 1800, 240, 60, 30 * 13_000],
      ["Black T-bar pull", "Pulls", 1200, 60, 0, 0],
    ]);
    const pulls = await admin.query(api.googleAnalyticsProductReads.analyticsProductList, { ...args, category: "Pulls", page: 1, rows: 25 });
    expect(pulls.rows.map((row) => row.name)).toEqual(["Black T-bar pull"]);
  });

  test("a website selling nothing is no shop: no products asked, the page says so", async () => {
    const t = harness();
    const { siteId, connectionId, agentId, admin } = await connected(t);
    const google = fakeGoogle(history(70));
    await save(admin, siteId);
    await finishScheduled(t);
    await dailyRun(t, agentId);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.shop).toBeUndefined();
    expect(google.calls.some((call) => call.body.includes("itemsViewed"))).toBe(false);
    expect((await admin.query(api.googleAnalyticsProductReads.analyticsProducts, { siteId, period: "30", device: "" }))?.shop).toBe(false);
  });
});
