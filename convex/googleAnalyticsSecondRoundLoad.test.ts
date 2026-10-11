import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { metered, type MeteredRead } from "@/src/test/readMeter";
import { DAY_JOIN, packList, type ListRow } from "./googleAnalyticsLists";
import { slotKey } from "./googleAnalyticsCollect";
import { PAGE_RECORD } from "./holdPageRefs";
import { readPage } from "./googleAnalyticsPageReads";
import { readEvent, readEvents } from "./googleAnalyticsEventReads";
import { productList, readProducts } from "./googleAnalyticsProductReads";
import { readListPage } from "./googleAnalyticsReads";
import { readVisitors } from "./googleAnalyticsVisitorReads";
import type { AnalyticsList } from "./googleAnalyticsSchema";

/**
 * The second round's screens stay inside Convex's limits on a large website
 * (docs/plans/active/google-analytics-plan.md §18.6, Phase 16): a page's own
 * screen, Events and an event's screen, Campaigns, Visitors and Products, each
 * with a reading budget at five times morehandles.co.uk's size — inside half
 * of a read's limits (16 MiB and 32,000 records). Counted, not timed, as the
 * first round's (`googleAnalyticsLoad.test.ts`), so it holds on any machine.
 */

/** morehandles.co.uk's pages in 90 days, about 9,000, five times over; its products about as many. */
const PAGES = 45_000;
const PRODUCTS = 45_000;
/** Events a busy website records: Google's own and a website's own, five times a usual property's. */
const EVENT_NAMES = Array.from({ length: 150 }, (_, at) => (at === 0 ? "click" : at === 1 ? "purchase" : `event_${at}`));
const CAMPAIGNS = 2_500;
const EVENTS = ["generate_lead", "purchase"];
const MIB = 1024 * 1024;

const row = (key: string, size: number, extra: Partial<ListRow> = {}): ListRow => ({
  key, visits: size, engaged: Math.floor(size / 2), seconds: size * 40, views: size * 2, purchases: 0, revenue: 0,
  people: size, newPeople: Math.floor(size / 2), length: size * 90,
  counts: new Map(EVENTS.map((event) => [event, 0])), values: new Map(EVENTS.map((event) => [event, 0])), ...extra,
});

/** Days of a year, each with every event: the 12 months' each-event-a-day list. */
function days(count: number): string[] {
  return Array.from({ length: count }, (_, at) => new Date(Date.parse("2026-10-08T00:00:00Z") - at * 86_400_000).toISOString().slice(0, 10));
}

async function bigWebsite() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "properties/1", addresses: ["www.big.co.uk"],
      currency: "GBP", newestDay: "2026-10-08", oldestDay: "2026-08-10", eventsReadAt: 1, shop: true,
      events: EVENTS.map((eventName) => ({ eventName, counted: true, analyticsValue: null, hakkenValue: 100, lastThirtyDays: 0 })),
      createdAt: 1, updatedAt: 1,
    });
    for (let record = 0; record * PAGE_RECORD < PAGES; record += 1) {
      const addresses = Array.from({ length: PAGE_RECORD }, (_, place) => `https://www.big.co.uk/collections/handles/product-${record * PAGE_RECORD + place}.html`);
      await ctx.db.insert("holdPageAddresses", { companyWebsiteId: siteId, record, addresses });
    }
    const put = async (list: AnalyticsList, which: "NOW" | "BEFORE", rows: ListRow[]) => {
      const key = slotKey(list, "365", which, "");
      const parts = packList(list, rows, EVENTS);
      await ctx.db.insert("googleAnalyticsPeriodSlots", { companyWebsiteId: siteId, key, slot: 0, parts: parts.length, from: "2025-10-09", to: "2026-10-08", hash: "x", builtAt: 1 });
      for (const [part, packed] of parts.entries()) await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: siteId, key, slot: 0, part, ...packed });
    };
    for (const which of ["NOW", "BEFORE"] as const) {
      await put("total", which, [row("", 900_000)]);
      await put("page", which, Array.from({ length: PAGES }, (_, at) => row(`~${at.toString(36)}`, PAGES - at)));
      await put("event", which, EVENT_NAMES.map((name, at) => row(name, 1_000 - at, { times: 5_000 - at })));
      await put("campaign", which, Array.from({ length: CAMPAIGNS }, (_, at) => row(`campaign-${at}\u001flinkedin.com / social`, CAMPAIGNS - at)));
      await put("product", which, Array.from({ length: PRODUCTS }, (_, at) => row(`Product ${at}\u001fHandles`, PRODUCTS - at, { basket: 10, purchases: 1, revenue: 4_999 })));
      for (const list of ["visitorType", "browser", "system", "age", "gender", "interest"] as const) await put(list, which, Array.from({ length: 40 }, (_, at) => row(`${list}-${at}`, 100 + at)));
    }
    const year = days(365);
    await put("eventSeries", "NOW", year.flatMap((day) => EVENT_NAMES.map((name) => row(`${day}${DAY_JOIN}${name}`, 3, { times: 7 }))));
    await put("visitorSeries", "NOW", year.flatMap((day) => ["new", "returning"].map((type) => row(`${day}${DAY_JOIN}${type}`, 50))));
    await put("productSeries", "NOW", year.map((day) => row(day, 1, { purchases: 3 })));
    return { siteId, companyId };
  });
  return { t, siteId: ids.siteId as Id<"companyWebsites">, companyId: ids.companyId as Id<"companies"> };
}

/** A read's whole cost, inside half of Convex's limits. */
function withinBudget(reads: MeteredRead[], what: string) {
  const bytes = reads.reduce((sum, read) => sum + read.bytes, 0);
  const documents = reads.reduce((sum, read) => sum + read.documents, 0);
  expect(bytes, what).toBeLessThan(16 * MIB * 0.5);
  expect(documents, what).toBeLessThan(32_000 * 0.5);
}

describe("a large website's second-round Google Analytics", () => {
  test("each screen of 12 months, at five times the largest website, inside its reading budget", async () => {
    const { t, siteId, companyId } = await bigWebsite();
    const args = { siteId, period: "365" as const, device: "" };
    const measured = async <T>(what: string, read: (ctx: { db: never; companyId: Id<"companies"> }) => Promise<T>) => {
      const { answer, reads } = await t.run(async (ctx) => {
        const { db, reads } = metered(ctx.db);
        return { answer: await read({ db: db as never, companyId }), reads };
      });
      withinBudget(reads, what);
      return answer;
    };
    const page = await measured("a page's own screen", (ctx) => readPage(ctx, { ...args, page: "~a" }));
    expect(page?.row?.views).toBeGreaterThan(0);
    const events = await measured("Events", (ctx) => readEvents(ctx, args));
    expect(events?.rows).toHaveLength(EVENT_NAMES.length + 1);
    const event = await measured("an event's own screen", (ctx) => readEvent(ctx, { ...args, event: "click" }));
    expect(event?.points).toHaveLength(365);
    const campaigns = await measured("Campaigns", (ctx) => readListPage(ctx, { ...args, list: "campaign", page: 1, rows: 25 }));
    expect(campaigns.total).toBe(CAMPAIGNS);
    const visitors = await measured("Visitors", (ctx) => readVisitors(ctx, args));
    expect(visitors?.points).toHaveLength(365);
    const products = await measured("Products", (ctx) => readProducts(ctx, args));
    expect(products?.points).toHaveLength(365);
    const hold = (await t.run(async (ctx) => await ctx.db.get(siteId)))!;
    const list = await measured("Products' list", (ctx) => productList({ db: ctx.db }, hold, { ...args, sort: "looks" }));
    expect(list.rows).toHaveLength(PRODUCTS);
  });
});
