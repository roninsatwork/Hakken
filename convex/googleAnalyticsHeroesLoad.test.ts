import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { metered } from "@/src/test/readMeter";
import { channelKey, packList, type ListRow } from "./googleAnalyticsLists";
import { slotKey } from "./googleAnalyticsCollect";
import { PAGE_RECORD } from "./holdPageRefs";
import { PART_ROWS, bookedColumns, packedColumns } from "./utils/searchConsolePacks";
import { bookRecords } from "./searchConsolePeriodBooks";
import { inBook, termsOf, type PartToWrite } from "./searchConsolePeriods";
import { journeyOf } from "./googleAnalyticsHeroes";

/**
 * Heroes and attention stays inside Convex's limits on a large website
 * (docs/plans/active/google-analytics-plan.md §4.3, §13): it reads the most of
 * any Analytics screen — Analytics' landing pages and their addresses, Search
 * Console's pages, its searches and its days, each for 30 days and the 30
 * before — so its reading budget is held at five times morehandles.co.uk's
 * size, inside half of a read's limits (16 MiB and 32,000 records), as every
 * Analytics screen's is. Counted, not timed (AGENTS.md, "Test time limits").
 */

/** morehandles.co.uk's landing pages in 30 days, about 9,000, five times over; as many pages in Search Console. */
const PAGES = 45_000;
/** Its searches in 30 days, about 25,000, five times over. */
const SEARCHES = 125_000;
const MIB = 1024 * 1024;
const address = (index: number) => `https://www.big.co.uk/collections/handles/product-${index}.html`;

/**
 * Figures spread as a website's are: a few pages with most of the visits and
 * showings, a long tail of pages with a handful. About 5,000 of the 45,000
 * pages have visits enough for a rule (five times morehandles.co.uk's ~1,000),
 * and about 4,000 are shown 500 times or more in Search Console.
 */
const visitsAt = (index: number) => Math.floor(100_000 / (index + 50));
const showingsAt = (index: number) => Math.floor(2_000_000 / (index + 40));

const landingRows = (count: number, shift: number): ListRow[] => Array.from({ length: count }, (_, index) => ({
  key: `~${(index + shift).toString(36)}`,
  visits: visitsAt(index),
  engaged: Math.floor(visitsAt(index) / 2),
  seconds: visitsAt(index) * 40,
  views: visitsAt(index) * 2,
  purchases: 0,
  revenue: 0,
  // About one visit in 70 converts, as Ronins' 1.45%: the pages with value are the busier ones.
  counts: new Map([["generate_lead", Math.floor(visitsAt(index) / 70)]]),
  values: new Map([["generate_lead", 0]]),
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
      events: [{ eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: 100, lastThirtyDays: 0 }],
      createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("searchConsoleConnections", { companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", newestDay: "2026-10-07", createdAt: 1, updatedAt: 1 });
    for (let record = 0; record * PAGE_RECORD < PAGES + 5_000; record += 1) {
      await ctx.db.insert("holdPageAddresses", { companyWebsiteId: siteId, record, addresses: Array.from({ length: PAGE_RECORD }, (_, place) => address(record * PAGE_RECORD + place)) });
    }
    for (const [list, which, rows] of [
      ["landing", "NOW", landingRows(PAGES, 0)],
      ["landing", "BEFORE", landingRows(PAGES - 5_000, 5_000)],
      ["channel", "NOW", Array.from({ length: 200 }, (_, index) => ({ ...landingRows(1, 0)[0], key: channelKey(index === 0 ? "Organic Search" : "Referral", index === 0 ? "google" : `site-${index}.com`), visits: 1_000 }))],
    ] as const) {
      const key = slotKey(list, "30", which, "");
      const parts = packList(list, rows, ["generate_lead"]);
      await ctx.db.insert("googleAnalyticsPeriodSlots", { companyWebsiteId: siteId, key, slot: 0, parts: parts.length, from: "2026-09-09", to: "2026-10-08", hash: "x", builtAt: 1 });
      for (const [part, packed] of parts.entries()) await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: siteId, key, slot: 0, part, ...packed });
    }
    // Search Console's pages and searches for the 30 days, written as the build writes them (`buildSitePeriods`):
    // one book for the build, every keyword and page once, the lists holding places in it, numbers packed.
    type Slot = { list: "page" | "query"; which: "NOW" | "BEFORE"; from: string; to: string };
    const lists: Array<{ slot: Slot; parts: PartToWrite[] }> = [];
    const make = (slot: Slot, rows: number, keyOf: (index: number) => string) => {
      const parts: PartToWrite[] = [];
      for (let part = 0; part * PART_ROWS < rows || part === 0; part += 1) {
        const indexes = Array.from({ length: Math.min(PART_ROWS, rows - part * PART_ROWS) }, (_, at) => part * PART_ROWS + at);
        const nowOnly = slot.which === "NOW";
        parts.push({
          keys: indexes.map(keyOf),
          clicks: indexes.map((index) => Math.floor(showingsAt(index) / 500)),
          impressions: indexes.map(showingsAt),
          positionSums: indexes.map((index) => showingsAt(index) * (1 + (index % 30))),
          ...(nowOnly ? { tops: indexes.map(() => ""), counts: indexes.map((index) => 1 + (index % 5)) } : {}),
        });
      }
      lists.push({ slot, parts });
    };
    make({ list: "page", which: "NOW", from: "2026-09-08", to: "2026-10-07" }, PAGES, address);
    make({ list: "page", which: "BEFORE", from: "2026-08-09", to: "2026-09-07" }, PAGES - 5_000, (index) => address(index + 5_000));
    make({ list: "query", which: "NOW", from: "2026-09-08", to: "2026-10-07" }, SEARCHES, (index) => `door handles brass ${index}`);
    const places = { query: new Map<string, number>(), page: new Map<string, number>() };
    for (const kind of ["query", "page"] as const) {
      const book = bookRecords(lists.flatMap(({ slot, parts }) => parts.flatMap((part) => termsOf(slot.list, part, kind))));
      places[kind] = book.places;
      for (const { record, terms } of book.records) {
        await ctx.db.insert("searchConsolePeriodBooks", { companyWebsiteId: siteId, searchType: "web", builtAt: 1, kind, record, terms });
      }
    }
    for (const { slot, parts } of lists) {
      for (const [part, made] of parts.entries()) {
        const stored = inBook(slot.list, made, places, []);
        await ctx.db.insert("searchConsolePeriods", {
          companyWebsiteId: siteId, searchType: "web", list: slot.list, period: "30", which: slot.which, part, from: slot.from, to: slot.to,
          ...stored, ...packedColumns(stored), ...bookedColumns({ ...stored, list: slot.list }), builtAt: 1,
        });
      }
    }
    for (let day = 0; day < 30; day += 1) {
      const date = new Date(Date.parse("2026-10-07T00:00:00Z") - day * 86_400_000).toISOString().slice(0, 10);
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day: date, clicks: 900, impressions: 1_000_000, ctr: 0.0009, position: 12, fetchedAt: 1 });
    }
    return siteId;
  });
  return { t, siteId: siteId as Id<"companyWebsites"> };
}

describe("a large website's Heroes and attention", () => {
  test("every page joined, judged and priced, inside its reading budget", async () => {
    const { t, siteId } = await bigWebsite();
    const { journey, reads } = await t.run(async (ctx) => {
      const { db, reads } = metered(ctx.db);
      const read = await journeyOf({ db }, siteId, "big.co.uk");
      // What a test run can hand back: plain values, not the read's own maps.
      return { journey: { state: read.state, pages: read.pages.length, problems: read.pages.filter((page) => page.problems.length > 0).length, clicks: read.consoleTotals?.clicks ?? null }, reads };
    });
    expect(journey).toMatchObject({ state: "READY", clicks: 30 * 900 });
    expect(journey.problems).toBeGreaterThan(1_000);
    // At most 8 MiB: the first try, naming every page from both sources, read 18.5 MiB.
    const bytes = reads.reduce((sum, read) => sum + read.bytes, 0);
    const documents = reads.reduce((sum, read) => sum + read.documents, 0);
    expect(bytes).toBeLessThan(16 * MIB * 0.5);
    expect(documents).toBeLessThan(32_000 * 0.5);
    // Every read by the website's own hold, or one record by its id.
    expect(reads.every((read) => read.index === null || read.index.startsWith("by_hold")), JSON.stringify(reads.map((read) => read.index))).toBe(true);
  });

  test("one page's own view reads that page alone, inside the same budget", async () => {
    const { t, siteId } = await bigWebsite();
    const { journey, reads } = await t.run(async (ctx) => {
      const { db, reads } = metered(ctx.db);
      const read = await journeyOf({ db }, siteId, "big.co.uk", { page: { ref: "~2s", consoleAddress: address(100) } });
      const page = read.pages.find((one) => one.page === "/collections/handles/product-100.html");
      return { journey: { found: Boolean(page?.google && page.visits && page.googleBefore === null), pages: read.pages.length }, reads };
    });
    // The page, and the heroes among the rest: every page with value.
    expect(journey.found).toBe(true);
    expect(reads.reduce((sum, read) => sum + read.bytes, 0)).toBeLessThan(16 * MIB * 0.5);
    expect(reads.reduce((sum, read) => sum + read.documents, 0)).toBeLessThan(32_000 * 0.5);
  });
});
