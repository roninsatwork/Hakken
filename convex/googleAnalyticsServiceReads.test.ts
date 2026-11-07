import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { channelKey, packList, type ListRow } from "./googleAnalyticsLists";
import { slotKey } from "./googleAnalyticsCollect";
import { serviceKeyOf, serviceNameOf } from "./googleAnalyticsServiceReads";
import { normalisePage } from "./utils/pageClassification";

/**
 * What Services reads (docs/plans/active/services-new-page-plan-2026-11-07.md, step 1): each service's figures now and before, a page
 * kept under both of its addresses as one, the visits that started on it by channel, the events on other pages, a device not kept
 * yet, a website with no service pages, and only the caller's own website.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** Contact is counted; scroll is kept by visits for scrolling to the bottom, and never counted. */
const EVENTS = ["contact", "scroll"];

const row = (key: string, visits: number, contact: number, extra: { engaged?: number; views?: number; scrolled?: number } = {}): ListRow => ({
  key, visits, engaged: extra.engaged ?? Math.round(visits / 2), seconds: visits * 30, views: extra.views ?? visits * 2, purchases: 0, revenue: 0, people: 0, newPeople: 0, length: 0,
  counts: new Map([["contact", contact], ["scroll", extra.scrolled ?? 0]]), values: new Map(),
  eventVisits: new Map([["contact", contact], ["scroll", extra.scrolled ?? 0]]), eventTimes: new Map([["contact", contact], ["scroll", extra.scrolled ?? 0]]),
});

const MONTHS = { NOW: { from: "2026-09-01", to: "2026-09-30" }, BEFORE: { from: "2026-08-01", to: "2026-08-31" } } as const;

async function slot(t: Harness, siteId: Id<"companyWebsites">, list: "page" | "landing" | "landingChannel" | "total", which: "NOW" | "BEFORE", rows: ListRow[], device = "") {
  await t.run(async (ctx) => {
    const key = slotKey(list, "lastMonth", which, device);
    const parts = packList(list, rows, EVENTS);
    await ctx.db.insert("googleAnalyticsPeriodSlots", { companyWebsiteId: siteId, key, slot: 0, parts: parts.length, ...MONTHS[which], hash: "x", builtAt: 1 });
    for (const [part, packed] of parts.entries()) await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: siteId, key, slot: 0, part, ...packed });
  });
}

/**
 * A service business: two service pages, one kept under both its addresses (`/services/web` and `/services/web/`), a home page and a
 * blog post. The home page has events no service gets the credit for.
 */
async function connected(t: Harness, { services = true }: { services?: boolean } = {}) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "properties/1", addresses: ["www.acme.test"],
      currency: "GBP", newestDay: "2026-10-09", oldestDay: "2026-08-11", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
      events: [{ eventName: "contact", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 7 }, { eventName: "scroll", counted: false, analyticsValue: null, hakkenValue: null, lastThirtyDays: 70 }],
      createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("holdPageAddresses", {
      companyWebsiteId: siteId, record: 0,
      addresses: ["https://www.acme.test/", "https://www.acme.test/services/web", "https://www.acme.test/services/web/", "https://www.acme.test/services/seo/", "https://www.acme.test/blog/post/"],
    });
    await ctx.db.insert("holdPages", { companyWebsiteId: siteId, page: normalisePage("https://www.acme.test/services/web/"), title: "Web Design | Acme", crawled: true, shown: true, clicks: 0, ranks: true });
    const id = await ctx.db.insert("pageClassifications", { companyWebsiteId: siteId, name: "Services", type: services ? "SERVICE" : "PRODUCT", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("pageClassificationLines", { companyWebsiteId: siteId, classificationId: id, kind: "STARTS_WITH", value: "/services/", createdAt: 1 });
    return { companyId, userId, siteId };
  });
  await slot(t, ids.siteId, "page", "NOW", [row("~0", 100, 3), row("~1", 40, 1), row("~2", 60, 2, { scrolled: 20 }), row("~3", 30, 0, { scrolled: 3 }), row("~4", 50, 0)]);
  await slot(t, ids.siteId, "page", "BEFORE", [row("~0", 90, 1), row("~2", 50, 1), row("~3", 40, 1)]);
  await slot(t, ids.siteId, "landing", "NOW", [row("~0", 90, 3), row("~1", 10, 0), row("~2", 45, 1), row("~3", 20, 0)]);
  await slot(t, ids.siteId, "landing", "BEFORE", [row("~2", 30, 1)]);
  await slot(t, ids.siteId, "landingChannel", "NOW", [row(channelKey("~2", "Organic Search"), 40, 1), row(channelKey("~1", "Organic Search"), 5, 0), row(channelKey("~3", "Direct"), 20, 0), row(channelKey("~0", "Direct"), 90, 3)]);
  await slot(t, ids.siteId, "landingChannel", "BEFORE", [row(channelKey("~2", "Organic Search"), 30, 1)]);
  await slot(t, ids.siteId, "total", "NOW", [row("", 250, 6, { engaged: 150 })]);
  await slot(t, ids.siteId, "total", "BEFORE", [row("", 200, 3, { engaged: 100 })]);
  return { ...ids, user: t.withIdentity({ subject: ids.userId }) };
}

const ASK = { period: "lastMonth" as const, device: "" };

describe("Services' read", () => {
  test("each service's figures now and before, with a page kept under both its addresses as one", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    const answer = await user.query(api.googleAnalyticsServiceReads.analyticsServices, { siteId, ...ASK });
    expect(answer.state).toBe("ready");
    expect(answer.classifications.map((one) => one.name)).toEqual(["Services"]);
    expect(answer.services.map((one) => one.key)).toEqual(["https://www.acme.test/services/web/", "https://www.acme.test/services/seo/"]);
    const [web, seo] = answer.services;
    // 40 + 60 visits under its two addresses; shown by the one with more, by the first part of its title.
    expect(web).toMatchObject({ address: "https://www.acme.test/services/web/", page: "~2", name: "Web Design", now: { visits: 100, events: 3, scrolled: 20, views: 200 }, before: { visits: 50, events: 1 }, started: 55, startedBefore: 30 });
    expect([...web.refs].sort()).toEqual(["~1", "~2"]);
    // Scroll is kept by visits and never counted as an event.
    expect(seo).toMatchObject({ name: "Seo", now: { visits: 30, events: 0, scrolled: 3 }, before: { visits: 40, events: 1 }, started: 20 });
    expect(answer.hasBefore).toBe(true);
    expect([answer.from, answer.to, answer.beforeFrom, answer.beforeTo]).toEqual(["2026-09-01", "2026-09-30", "2026-08-01", "2026-08-31"]);
  });

  test("the visits that started on each service, by channel, now and before", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    const answer = await user.query(api.googleAnalyticsServiceReads.analyticsServices, { siteId, ...ASK });
    // Organic Search brought 45 visits to the services, Direct 20: the home page's Direct visits are no service's.
    expect(answer.channels).toEqual(["Organic Search", "Direct"]);
    expect(answer.services[0].byChannel).toEqual([[45, 23, 1, 30, 15, 1], [0, 0, 0, 0, 0, 0]]);
    expect(answer.services[1].byChannel).toEqual([[0, 0, 0, 0, 0, 0], [20, 10, 0, 0, 0, 0]]);
  });

  test("the whole website's own figures, and the events on pages that aren't services", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    const answer = await user.query(api.googleAnalyticsServiceReads.analyticsServices, { siteId, ...ASK });
    expect(answer.website).toMatchObject({ visits: 250, visitsBefore: 200, events: 6, eventsBefore: 3, engaged: 150, pageVisits: 280, pageScrolled: 23 });
    expect(answer.elsewhere).toEqual({ events: 3, eventsBefore: 1, page: { address: "https://www.acme.test/", name: "Home page", events: 3 } });
  });

  test("a device not kept yet shows every device's, says so, and has no split by channel", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    const answer = await user.query(api.googleAnalyticsServiceReads.analyticsServices, { siteId, period: "lastMonth", device: "mobile" });
    expect(answer.everyDevice).toBe(true);
    expect(answer.channels).toEqual([]);
    expect(answer.services[0].byChannel).toBeNull();
    expect(answer.services[0].now.visits).toBe(100);
  });

  test("a device kept is read as its own", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    await slot(t, siteId, "page", "NOW", [row("~2", 7, 1)], "mobile");
    const answer = await user.query(api.googleAnalyticsServiceReads.analyticsServices, { siteId, period: "lastMonth", device: "mobile" });
    expect(answer.everyDevice).toBe(false);
    expect(answer.services.map((one) => [one.name, one.now.visits])).toEqual([["Web Design", 7]]);
  });

  // As Products does for a website that doesn't sell, the page says why it's empty (Anthony, 7 November: "put this blocker back").
  test("a website with no Service-type Classification has no services, and the page says why", async () => {
    const t = harness();
    const { siteId, user } = await connected(t, { services: false });
    expect((await user.query(api.googleAnalyticsServiceReads.analyticsServices, { siteId, ...ASK })).state).toBe("noServices");
    expect(await user.query(api.googleAnalyticsServiceReads.analyticsHasServices, { siteId })).toBe(false);
  });

  test("the menu lists Services for a website with service pages", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    expect(await user.query(api.googleAnalyticsServiceReads.analyticsHasServices, { siteId })).toBe(true);
  });

  test("another company's website answers as a missing one, and the menu says no rather than failing", async () => {
    const t = harness();
    const { siteId } = await connected(t);
    const otherUser = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Other", createdAt: 1 });
      return await ctx.db.insert("users", { name: "Someone", email: "someone@other.test", role: "ADMIN", companyId, createdAt: 1 });
    });
    const other = t.withIdentity({ subject: otherUser });
    await expect(other.query(api.googleAnalyticsServiceReads.analyticsServices, { siteId, ...ASK })).rejects.toThrow(/not one your company holds/);
    expect(await other.query(api.googleAnalyticsServiceReads.analyticsHasServices, { siteId })).toBe(false);
  });

  test("the month chart reads the ticked services' days, and the whole website's", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    // No days kept for the page yet: the chart says it's collecting, never draws nought.
    const answer = await user.query(api.googleAnalyticsServiceReads.analyticsServiceDays, { siteId, ...ASK, services: [{ key: "https://www.acme.test/services/web/", refs: ["~1", "~2"] }], channels: false });
    expect(answer.state).toBe("collecting");
    expect(answer.services).toEqual([]);
  });
});

describe("one page, one name", () => {
  test("a page's two addresses share one key; a home page keeps its own slash", () => {
    expect(serviceKeyOf("https://www.acme.test/services/web")).toBe("https://www.acme.test/services/web/");
    expect(serviceKeyOf("https://www.acme.test/services/web/")).toBe("https://www.acme.test/services/web/");
    expect(serviceKeyOf("https://www.acme.test")).toBe("https://www.acme.test/");
    expect(serviceKeyOf("https://www.acme.test/")).toBe("https://www.acme.test/");
    expect(serviceKeyOf("https://www.acme.test/a?b=1")).toBe("https://www.acme.test/a?b=1");
  });

  test("a service is named by the first part of its title, or its address in words", () => {
    expect(serviceNameOf("AI Agency | Ronins", "https://www.ronins.co.uk/ai-agency/")).toBe("AI Agency");
    expect(serviceNameOf("Web Design – London", "https://x.test/web/")).toBe("Web Design");
    expect(serviceNameOf(undefined, "https://www.ronins.co.uk/chatbot-agency/")).toBe("Chatbot agency");
  });
});
