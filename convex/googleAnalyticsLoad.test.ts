import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { metered } from "@/src/test/readMeter";
import { packList, type ListRow } from "./googleAnalyticsLists";
import { readAnalyticsList } from "./googleAnalyticsReads";
import { slotKey } from "./googleAnalyticsCollect";
import { PAGE_RECORD } from "./holdPageRefs";

/**
 * Google Analytics' screens stay inside Convex's limits on a large website
 * (docs/plans/active/google-analytics-plan.md §4.3, GA23): every screen has a
 * reading budget at five times morehandles.co.uk's size — inside half of a
 * read's limits (16 MiB and 32,000 records), or three quarters with a
 * search, which reads every page's address.
 *
 * Counted, not timed: the reads are counted through the database the list is
 * given, so this holds on any machine, GitHub's included (AGENTS.md, "Test
 * time limits").
 */

/** morehandles.co.uk's landing pages in 90 days, about 9,000, five times over. */
const PAGES = 45_000;
const EVENTS = ["generate_lead", "click_tel", "click_email", "purchase", "sign_up"];
const MIB = 1024 * 1024;

const rowsOf = (count: number, shift: number): ListRow[] => Array.from({ length: count }, (_, index) => ({
  key: `~${(index + shift).toString(36)}`,
  visits: count - index,
  engaged: Math.floor((count - index) / 2),
  seconds: (count - index) * 40,
  views: (count - index) * 2,
  purchases: index % 50 === 0 ? 1 : 0,
  revenue: index % 50 === 0 ? 4_999 : 0,
  counts: new Map(EVENTS.map((event, at) => [event, (index + at) % 30 === 0 ? 1 : 0])),
  values: new Map(EVENTS.map((event) => [event, 0])),
}));

async function bigWebsite() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const siteId = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "properties/1", addresses: ["www.big.co.uk"],
      currency: "GBP", newestDay: "2026-10-08", oldestDay: "2026-08-10", eventsReadAt: 1,
      events: EVENTS.map((eventName) => ({ eventName, counted: true, analyticsValue: null, hakkenValue: 100, lastThirtyDays: 0 })),
      createdAt: 1, updatedAt: 1,
    });
    // The website's page numbers: every page's address, 250 a record.
    for (let record = 0; record * PAGE_RECORD < PAGES + 5_000; record += 1) {
      const addresses = Array.from({ length: PAGE_RECORD }, (_, place) => `https://www.big.co.uk/collections/handles/product-${record * PAGE_RECORD + place}.html`);
      await ctx.db.insert("holdPageAddresses", { companyWebsiteId: siteId, record, addresses });
    }
    for (const [which, rows] of [["NOW", rowsOf(PAGES, 0)], ["BEFORE", rowsOf(PAGES - 5_000, 5_000)]] as const) {
      const key = slotKey("landing", "90", which, "");
      const parts = packList("landing", rows, EVENTS);
      await ctx.db.insert("googleAnalyticsPeriodSlots", { companyWebsiteId: siteId, key, slot: 0, parts: parts.length, from: "2026-07-11", to: "2026-10-08", hash: "x", builtAt: 1 });
      for (const [part, packed] of parts.entries()) {
        await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: siteId, key, slot: 0, part, ...packed });
      }
    }
    return siteId;
  });
  return { t, siteId: siteId as Id<"companyWebsites"> };
}

describe("a large website's Google Analytics", () => {
  test("Landing pages, sorted by value, then searched by address, each inside its reading budget", async () => {
    const { t, siteId } = await bigWebsite();
    for (const [args, share] of [
      [{ list: "landing" as const, period: "90" as const, device: "" }, 0.5],
      [{ list: "landing" as const, period: "90" as const, device: "", sort: "visits" as const, direction: "asc" as const }, 0.5],
      [{ list: "landing" as const, period: "90" as const, device: "", q: "product-4471" }, 0.75],
    ] as const) {
      const { list, reads } = await t.run(async (ctx) => {
        const { db, reads } = metered(ctx.db);
        return { list: await readAnalyticsList({ db }, siteId, args), reads };
      });
      expect(list.preparing).toBe(false);
      // Words matched from their starts, as every Sites search: product-4471 and product-44710 to 44719.
      if ("q" in args) expect(list.rows.map((row) => row.label)).toHaveLength(11);
      else expect(list.rows).toHaveLength(PAGES);
      const bytes = reads.reduce((sum, read) => sum + read.bytes, 0);
      const documents = reads.reduce((sum, read) => sum + read.documents, 0);
      expect(bytes, JSON.stringify(args)).toBeLessThan(16 * MIB * share);
      expect(documents, JSON.stringify(args)).toBeLessThan(32_000 * share);
      // Every read by the website's own hold, or one record by its id.
      expect(reads.every((read) => read.index === null || read.index.startsWith("by_hold")), JSON.stringify(reads.map((read) => read.index))).toBe(true);
    }
  });
});
