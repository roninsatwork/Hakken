import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { readList } from "./searchConsoleLists";
import { bookRecords } from "./searchConsolePeriodBooks";
import { PART_ROWS, packNumbers } from "./utils/searchConsolePacks";
import { metered, type MeteredRead } from "@/src/test/readMeter";
import { useFixedDay } from "@/src/test/realTime";

/**
 * A list whose dates and dates before come from two builds (speed fixes, 18 November 2026): one rebuilt while the other
 * waited on Google. Until then the read turned every row of both into text from every book of both builds, read whole:
 * 14.4 MB for More Handles' pages in October against September, near a read's 16 MB. Now each list's keys are named from
 * its own build's book of their kind, each book read once, and the rows on screen name their top from the dates' own
 * book. A list and its span before of one build read their book of pages once, not twice.
 *
 * Counted, not timed, through the database the read is given (`metered`), so it holds on any machine.
 */

const NEWEST = "2026-09-26";
const PAGES = 3_000;
const KEYWORDS = 4_000;
/** The span before's lists start this far in: its books hold other pages and keywords, in other places. */
const SHIFT = 500;

const page = (at: number) => `https://big.co.uk/p/${String(at).padStart(5, "0")}/`;
const keyword = (at: number) => `search ${String(at).padStart(5, "0")}`;
const range = (from: number, count: number) => Array.from({ length: count }, (_, at) => from + at);

type Build = { builtAt: number; pages: number[]; keywords: number[] };
const NOW_BUILD: Build = { builtAt: 2, pages: range(0, PAGES), keywords: range(0, KEYWORDS) };
const BEFORE_BUILD: Build = { builtAt: 1, pages: range(SHIFT, PAGES), keywords: range(SHIFT, KEYWORDS) };

/** Records of the books read. */
function bookReads(reads: readonly MeteredRead[]): number {
  return reads.filter((read) => read.table === "searchConsolePeriodBooks").reduce((sum, read) => sum + read.documents, 0);
}

/** A list read through a metered database: the records of books it read, and only what the test asserts of the list. */
async function readMetered(t: ReturnType<typeof convexTest>, siteId: Id<"companyWebsites">, dimension: "page" | "query", keys: string[]) {
  return await t.run(async (ctx) => {
    const { db, reads } = metered(ctx.db, { gets: false });
    const list = await readList({ db }, siteId, { ...ask, dimension });
    const rows = list.rows.slice().filter((row) => keys.includes(row.key)).map((row) => ({ key: row.key, clicks: row.clicks, previousClicks: row.previousClicks, change: row.change }));
    return { books: bookReads(reads), listed: list.listed, comparable: list.comparable, rows };
  });
}

async function setUp(builds: { now: Build; before: Build }) {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Member", email: "big@test.com", role: "USER" as const, companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "sc-domain:big.co.uk",
      newestDay: NEWEST, oldestDay: "2026-03-31", createdAt: 1, updatedAt: 1,
    });
    for (let day = 0; day < 70; day += 1) {
      const at = new Date(Date.parse(`${NEWEST}T00:00:00Z`) - day * 86_400_000).toISOString().slice(0, 10);
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day: at, clicks: 1, impressions: 10, ctr: 0.1, position: 5, fetchedAt: 1 });
    }
    const written = new Set<number>();
    for (const [which, build, from, to] of [["NOW", builds.now, "2026-09-01", NEWEST], ["BEFORE", builds.before, "2026-08-01", "2026-08-26"]] as const) {
      const pageBook = bookRecords(build.pages.map(page));
      const keywordBook = bookRecords(build.keywords.map(keyword));
      if (!written.has(build.builtAt)) {
        written.add(build.builtAt);
        for (const [kind, book] of [["page", pageBook], ["query", keywordBook]] as const) {
          for (const { record, terms } of book.records) await ctx.db.insert("searchConsolePeriodBooks", { companyWebsiteId: siteId, searchType: "web", builtAt: build.builtAt, kind, record, terms });
        }
      }
      // A page's clicks fall with its number, the same in both spans; its top keyword the one of the same number.
      const lists = [
        { list: "page" as const, keys: build.pages.map((at) => pageBook.places.get(page(at))!), tops: build.pages.map((at) => keywordBook.places.get(keyword(at))!), clicks: build.pages.map((at) => 10_000 - at) },
        { list: "query" as const, keys: build.keywords.map((at) => keywordBook.places.get(keyword(at))!), tops: build.keywords.map((at) => pageBook.places.get(page(Math.min(at, build.pages.at(-1)!)))!), clicks: build.keywords.map((at) => 10_000 - at) },
      ];
      for (const { list, keys, tops, clicks } of lists) {
        for (let part = 0; part * PART_ROWS < keys.length; part += 1) {
          const slice = (values: number[]) => values.slice(part * PART_ROWS, (part + 1) * PART_ROWS);
          await ctx.db.insert("searchConsolePeriods", {
            companyWebsiteId: siteId, searchType: "web", list, period: "thisMonth", which, part, from, to,
            keys: packNumbers(slice(keys)), tops: packNumbers(slice(tops)), counts: slice(clicks).map(() => 2),
            clicks: slice(clicks), impressions: slice(clicks).map((value) => value * 10), positionSums: slice(clicks).map((value) => value * 50), builtAt: build.builtAt,
          });
        }
      }
    }
    return { siteId, userId };
  });
  return { t, ...ids, reader: t.withIdentity({ subject: ids.userId }) };
}

const ask = { searchType: "web" as const, from: "2026-09-01", to: NEWEST, period: "thisMonth" as const };
/** Records in a book of `count` entries: 250 a record, and its header. */
const recordsOf = (count: number) => Math.ceil(count / 250) + 1;

describe("a list read beside another build's", () => {
  beforeEach(() => useFixedDay("2026-09-27"));
  afterEach(() => vi.useRealTimers());

  test("a list of pages: each build's book of pages read once, no book of keywords; the same figures and names", async () => {
    const { t, siteId, reader } = await setUp({ now: NOW_BUILD, before: BEFORE_BUILD });
    const list = await readMetered(t, siteId, "page", [page(600), page(10)]);
    expect(list.books).toBe(2 * recordsOf(PAGES));
    expect(list).toMatchObject({ listed: PAGES, comparable: true });
    // Page 600 is in both spans; page 10 only in the dates.
    expect(list.rows).toEqual([
      { key: page(10), clicks: 9_990, previousClicks: null, change: 9_990 },
      { key: page(600), clicks: 9_400, previousClicks: 9_400, change: 0 },
    ]);

    // The rows on screen name their top keyword from the dates' own book.
    const first = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...ask, dimension: "page", page: 1, rows: 25 });
    expect(first.rows.slice(0, 2).map((row) => [row.key, row.top, row.clicks])).toEqual([[page(0), keyword(0), 10_000], [page(1), keyword(1), 9_999]]);
  });

  test("a list of keywords: each build's book of keywords read once, no book of pages whole; the same figures and names", async () => {
    const { t, siteId, reader } = await setUp({ now: NOW_BUILD, before: BEFORE_BUILD });
    const list = await readMetered(t, siteId, "query", [keyword(1_500), keyword(20)]);
    expect(list.books).toBe(2 * recordsOf(KEYWORDS));
    expect(list).toMatchObject({ listed: KEYWORDS, comparable: true });
    expect(list.rows).toEqual([
      { key: keyword(20), clicks: 9_980, previousClicks: null, change: 9_980 },
      { key: keyword(1_500), clicks: 8_500, previousClicks: 8_500, change: 0 },
    ]);

    const searched = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...ask, dimension: "query", q: "search 00150", page: 1, rows: 25 });
    expect(searched.rows.map((row) => [row.key, row.top])).toEqual([[keyword(150), page(150)]]);
  });

  test("a list of pages and its span before of one build read its book of pages once", async () => {
    const { t, siteId } = await setUp({ now: NOW_BUILD, before: { ...BEFORE_BUILD, builtAt: NOW_BUILD.builtAt, pages: NOW_BUILD.pages, keywords: NOW_BUILD.keywords } });
    const list = await readMetered(t, siteId, "page", [page(5)]);
    expect(list.books).toBe(recordsOf(PAGES));
    expect(list.rows).toEqual([{ key: page(5), clicks: 9_995, previousClicks: 9_995, change: 0 }]);
  });
});
