import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { readList } from "./searchConsoleLists";
import { PART_ROWS, pack, packByKey, type Row } from "./utils/searchConsolePacks";

/**
 * The Search Console lists stay quick on a large website
 * (docs/plans/active/search-console-plan.md §14.3, item 9): a list's page
 * reads its ready-made period — a record per 2,000 rows — the company's
 * tracked list and the website's brand words, each by its hold's index, and
 * never a kept day. So however
 * many days are kept, a page costs the same.
 *
 * Counted, not timed: the reads are counted through the database the list
 * is given, so this holds on any machine, GitHub's included (AGENTS.md,
 * "Test time limits"). A country kept ready (§16) costs the same: its own
 * period, by the same index with the country second.
 */

const NEWEST = "2026-09-26";
const ROWS_NOW = 25_000;
const ROWS_BEFORE = 20_000;
const TRACKED = 200;
/** A country kept ready's share of the same website: its own, smaller, period. */
const COUNTRY_NOW = 9_000;
const COUNTRY_BEFORE = 7_000;

type Read = { table: string; index: string | null; documents: number };

/** The database, every query on it noted: the table, the index it read by, and the documents it returned. */
function counted<Db extends object>(db: Db): { db: Db; reads: Read[] } {
  const reads: Read[] = [];
  const wrap = (read: Read, query: object): object => new Proxy(query, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (property === "withIndex") read.index = String(args[0]);
        const out = (value as (...rest: unknown[]) => unknown).apply(target, args);
        if (out instanceof Promise) {
          return out.then((found: unknown) => {
            read.documents += Array.isArray(found) ? found.length : found ? 1 : 0;
            return found;
          });
        }
        return out && typeof out === "object" ? wrap(read, out) : out;
      };
    },
  });
  const proxied = new Proxy(db, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown;
      if (property !== "query" || typeof value !== "function") return typeof value === "function" ? value.bind(target) : value;
      return (table: string) => {
        const read: Read = { table, index: null, documents: 0 };
        reads.push(read);
        return wrap(read, (value as (name: string) => object).call(target, table));
      };
    },
  });
  return { db: proxied, reads };
}

const periodRows = (count: number, offset: number) => Array.from({ length: count }, (_, index) => ({
  key: `search ${index + offset}`,
  clicks: count - index,
  impressions: (count - index) * 10,
  positionSum: (count - index) * 10 * ((index % 60) + 1),
}));

describe("a large website's Search Console", () => {
  test("a list's page reads only its period and the tracked list, by index, however many days are kept", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { siteId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "Member", email: "big@test.com", role: "USER" as const, companyId, createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: Date.now() });
      const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
      await ctx.db.insert("searchConsoleConnections", {
        companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "sc-domain:big.co.uk",
        newestDay: NEWEST, oldestDay: "2026-03-31", createdAt: Date.now(), updatedAt: Date.now(),
      });
      // Ninety kept days of pairs, which a list's page must never read.
      for (let day = 0; day < 90; day += 1) {
        const start = new Date(Date.parse(`${NEWEST}T00:00:00Z`) - day * 86_400_000).toISOString().slice(0, 10);
        await ctx.db.insert("searchConsoleLists", {
          companyWebsiteId: siteId, searchType: "web", list: "pair", grain: "DAY", start, part: 0,
          keys: ["search 1"], pages: ["https://big.co.uk/"], clicks: [1], impressions: [1], positionSums: [1], fetchedAt: 1,
        });
      }
      for (const [which, rows, from, to] of [["NOW", periodRows(ROWS_NOW, 0), "2026-08-28", NEWEST], ["BEFORE", periodRows(ROWS_BEFORE, 5_000), "2026-07-29", "2026-08-27"]] as const) {
        for (let part = 0; part * PART_ROWS < rows.length; part += 1) {
          const slice = rows.slice(part * PART_ROWS, (part + 1) * PART_ROWS);
          await ctx.db.insert("searchConsolePeriods", {
            companyWebsiteId: siteId, searchType: "web", list: "query", period: "30", which, part, from, to,
            keys: slice.map((row) => row.key), clicks: slice.map((row) => row.clicks), impressions: slice.map((row) => row.impressions),
            positionSums: slice.map((row) => row.positionSum), counts: slice.map(() => 2), tops: slice.map(() => "https://big.co.uk/"), builtAt: 1,
          });
        }
      }
      for (let index = 0; index < TRACKED; index += 1) {
        await ctx.db.insert("searchConsoleTracked", { companyWebsiteId: siteId, kind: "query", key: `search ${index * 7}`, createdAt: 1 });
      }
      return { siteId, userId };
    });

    const ask = { searchType: "web" as const, dimension: "query" as const, from: "2026-08-28", to: NEWEST };
    for (const filters of [{}, { sort: "position" as const }, { q: "search 12" }, { tracked: "yes" as const }, { band: "4-10" as const, direction: "asc" as const }]) {
      const { list, reads } = await t.run(async (ctx) => {
        const { db, reads } = counted(ctx.db);
        return { list: await readList({ db }, siteId as Id<"companyWebsites">, { ...ask, ...filters }), reads };
      });
      expect(list.preparing).toBe(false);
      // The website's limits (§17): its own, its company's and the platform's row — three small reads, the first two by index.
      const limitReads = reads.filter((read) => read.table === "fanOutLimits" || read.table === "platformLimits");
      expect(limitReads.map((read) => read.table).sort()).toEqual(["fanOutLimits", "fanOutLimits", "platformLimits"]);
      expect(limitReads.filter((read) => read.table === "fanOutLimits").every((read) => read.index !== null)).toBe(true);
      const listReads = reads.filter((read) => !limitReads.includes(read));
      // The connection, the period and the one before, the tracked list, and the website's brand words.
      expect(listReads.map((read) => read.table).sort()).toEqual([
        "holdProfiles", "searchConsoleConnections", "searchConsolePeriods", "searchConsolePeriods", "searchConsoleTracked",
      ]);
      expect(listReads.every((read) => read.index?.startsWith("by_hold")), JSON.stringify(listReads)).toBe(true);
      const documents = listReads.reduce((sum, read) => sum + read.documents, 0);
      expect(documents).toBe(1 + Math.ceil(ROWS_NOW / PART_ROWS) + Math.ceil(ROWS_BEFORE / PART_ROWS) + TRACKED);
    }

    // The browser is sent one page of rows, counted exactly over the whole list.
    const reader = t.withIdentity({ subject: userId });
    const first = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...ask, page: 1, rows: 25 });
    expect(first).toMatchObject({ total: ROWS_NOW, pages: ROWS_NOW / 25, cut: null, comparable: true });
    expect(first.rows).toHaveLength(25);
    expect(first.rows[0]).toMatchObject({ key: "search 0", clicks: ROWS_NOW, tracked: true, change: ROWS_NOW, previousClicks: null });
    const last = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...ask, page: ROWS_NOW / 25, rows: 25 });
    expect(last.rows.at(-1)).toMatchObject({ key: `search ${ROWS_NOW - 1}`, clicks: 1 });

    // The website's own list limit (`consoleListRows`, §17) holds the list to its rows with the most clicks, and says it is cut.
    await t.run(async (ctx) => {
      const hold = (await ctx.db.get(siteId))!;
      await ctx.db.insert("fanOutLimits", { companyId: hold.companyId, companyWebsiteId: siteId, consoleListRows: 5_000, updatedAt: 1 });
    });
    const held = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...ask, page: 1, rows: 25 });
    expect(held).toMatchObject({ total: 5_000, cut: 5_000 });
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("fanOutLimits").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).collect()) await ctx.db.delete(row._id);
    });

    // A country kept ready beside the main one reads its own ready-made period by the same index, country second: never the main one's parts.
    await t.run(async (ctx) => {
      await ctx.db.patch(siteId, { searchConsoleCountries: ["usa", "gbr"] });
      const connection = (await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first())!;
      await ctx.db.patch(connection._id, { countriesHeld: [{ country: "gbr", newestDay: NEWEST, oldestDay: "2026-03-31" }] });
      for (const [which, rows, from, to] of [["NOW", periodRows(COUNTRY_NOW, 0), "2026-08-28", NEWEST], ["BEFORE", periodRows(COUNTRY_BEFORE, 3_000), "2026-07-29", "2026-08-27"]] as const) {
        for (let part = 0; part * PART_ROWS < rows.length; part += 1) {
          const slice = rows.slice(part * PART_ROWS, (part + 1) * PART_ROWS);
          await ctx.db.insert("searchConsolePeriods", {
            companyWebsiteId: siteId, country: "gbr", searchType: "web", list: "query", period: "30", which, part, from, to,
            keys: slice.map((row) => row.key), clicks: slice.map((row) => row.clicks), impressions: slice.map((row) => row.impressions),
            positionSums: slice.map((row) => row.positionSum), builtAt: 1,
          });
        }
      }
    });
    const { list, reads } = await t.run(async (ctx) => {
      const { db, reads } = counted(ctx.db);
      return { list: await readList({ db }, siteId as Id<"companyWebsites">, { ...ask, country: "gbr" }), reads };
    });
    expect(list).toMatchObject({ preparing: false, live: false, comparable: true, listed: COUNTRY_NOW });
    const consoleReads = reads.filter((read) => read.table.startsWith("searchConsole"));
    expect(consoleReads.every((read) => read.index?.startsWith("by_hold")), JSON.stringify(consoleReads)).toBe(true);
    const periods = reads.filter((read) => read.table === "searchConsolePeriods");
    expect(periods.map((read) => read.index)).toEqual(["by_hold_country_type_list_period", "by_hold_country_type_list_period"]);
    expect(periods.reduce((sum, read) => sum + read.documents, 0)).toBe(Math.ceil(COUNTRY_NOW / PART_ROWS) + Math.ceil(COUNTRY_BEFORE / PART_ROWS));
  });

  /**
   * Drift fixes, 2026-10-03: one keyword's pages, one page's keywords and
   * Pages competing had asked Google for 90 days and 12 months — a year of
   * Pages competing took 33 seconds. They read the ready-made pairs kept in
   * key order, and Pages competing its own list: a few parts by index for
   * every period, never a whole period of pairs.
   */
  test("one keyword's pages, one page's keywords and Pages competing over 12 months read a few parts by index, never the whole year", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const KEYWORDS = 20_000;
    const PAGES = 500;
    // Three pages for every keyword: 60,000 pairs, thirty parts each way.
    const pairs: Row[] = Array.from({ length: KEYWORDS * 3 }, (_, index) => {
      const keyword = Math.floor(index / 3);
      return {
        key: `search ${String(keyword).padStart(5, "0")}`,
        page: `https://big.co.uk/page-${String((keyword * 3 + (index % 3)) % PAGES).padStart(3, "0")}`,
        clicks: 3 - (index % 3),
        impressions: 30,
        positionSum: 150,
      };
    });
    const competing = pairs.filter((pair) => pair.key < "search 02000");
    const year = { period: "365" as const, which: "NOW" as const, from: "2025-09-27", to: NEWEST };
    const siteId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: Date.now() });
      const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
      await ctx.db.insert("searchConsoleConnections", {
        companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "sc-domain:big.co.uk",
        newestDay: NEWEST, oldestDay: "2025-09-27", createdAt: Date.now(), updatedAt: Date.now(),
      });
      const parts = (list: "pair" | "pairByPage" | "competing" | "query", packed: ReturnType<typeof pack>) => packed.map((part, index) => ctx.db.insert("searchConsolePeriods", {
        companyWebsiteId: siteId, searchType: "web", list, ...year, part: index, ...part, builtAt: 1,
      }));
      await Promise.all([
        ...parts("pair", packByKey(pairs, "query")),
        ...parts("pairByPage", packByKey(pairs, "page")),
        ...parts("competing", pack(competing, true).map((part) => ({ ...part, shown: PAGES }))),
        ...parts("query", pack(Array.from({ length: KEYWORDS }, (_, keyword) => ({ key: `search ${String(keyword).padStart(5, "0")}`, clicks: 6, impressions: 90, positionSum: 450 })), false)),
      ]);
      return siteId;
    });
    const ask = { searchType: "web" as const, dimension: "query" as const, from: year.from, to: NEWEST };
    const read = async (extra: Partial<Parameters<typeof readList>[2]>) => await t.run(async (ctx) => {
      const { db, reads } = counted(ctx.db);
      return { list: await readList({ db }, siteId as Id<"companyWebsites">, { ...ask, ...extra }), reads };
    });
    const periodDocuments = (reads: Read[]) => reads.filter((one) => one.table === "searchConsolePeriods").reduce((sum, one) => sum + one.documents, 0);

    // One keyword's three pages: the period's first part, the part before the keyword and any starting with it.
    const pagesOf = await read({ within: { kind: "query", key: "search 12345" } });
    expect(pagesOf.list).toMatchObject({ live: false, preparing: false, listed: 3 });
    expect(periodDocuments(pagesOf.reads)).toBeLessThanOrEqual(3);
    // One page's keywords: 120 of them, from the pairs kept by page.
    const keywordsOf = await read({ dimension: "page", within: { kind: "page", key: "https://big.co.uk/page-250" } });
    expect(keywordsOf.list).toMatchObject({ live: false, preparing: false, listed: 120 });
    expect(periodDocuments(keywordsOf.reads)).toBeLessThanOrEqual(3);
    // Pages competing: the keyword list and its own small list, never the year's pairs.
    const competingList = await read({ view: "competing" });
    expect(competingList.list).toMatchObject({ live: false, preparing: false, listed: 2_000 });
    expect(competingList.list.summary).toMatchObject({ pagesShown: PAGES });
    expect(periodDocuments(competingList.reads)).toBe(Math.ceil(KEYWORDS / PART_ROWS) + Math.ceil(competing.length / PART_ROWS));
    for (const one of [...pagesOf.reads, ...keywordsOf.reads, ...competingList.reads]) {
      if (one.table.startsWith("searchConsole")) expect(one.index, JSON.stringify(one)).toMatch(/^by_hold/);
    }
  });
});
