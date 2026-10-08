import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { readList } from "./searchConsoleLists";
import { SORT_KEYS } from "./searchConsoleSorts";
import { bookRecords } from "./searchConsolePeriodBooks";
import { inBook, termsOf, type PartToWrite } from "./searchConsolePeriods";
import { bookedColumns, packedColumns } from "./utils/searchConsolePacks";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import type { Filters, View } from "./utils/searchConsoleViews";

/**
 * A list of keywords read as columns (`searchConsoleKeywordTable.ts`, core-data
 * plan step 4b) gives the row reading's answer exactly: the same rows, in the
 * same order, with the same figures, the same hero boxes and the same count —
 * for every page's rule, every filter, and every heading either way round. One
 * small website holding every kind of row: keywords gone since the days
 * before, ties on every figure, keywords never shown, tracked keywords the
 * book does not hold, brand words, pages competing with a page twice over.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const NEWEST = "2026-10-06";
const FROM = "2026-07-09";
const BUILT = 1_791_400_000_000;
const KINDS = ["BUYING", "RESEARCHING", "BRANDED", "UNJUDGED"] as const;
const WORDS = ["door", "handle", "acme", "lever", "knob", "brass"];
const keyword = (index: number) => `${WORDS[index % 6]} ${WORDS[(index >> 2) % 6]} ${index}`;
const page = (index: number) => `https://acme-shop.test/${WORDS[index % 6]}/${index}`;
/** A keyword's impressions: none for every ninth, 10 to 69 for the rest — keyword 40 has 50, Missed demand's line. */
const shownFor = (index: number) => (index % 9 === 0 ? 0 : 10 + ((index * 13) % 60));
/** Parts of this many rows: a list in several, as a busy website's is. */
const PART = 70;

type Slot = { list: "query" | "competing"; which: "NOW" | "BEFORE"; from: string; to: string };

describe("a list of keywords read as columns", () => {
  const t = harness();
  let siteId: Id<"companyWebsites">;

  beforeAll(async () => {
    siteId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      await ctx.db.insert("searchConsoleConnections", {
        companyId, companyWebsiteId: holdId, websiteId, status: "CONNECTED", property: "sc-domain:acme-shop.test",
        newestDay: NEWEST, oldestDay: "2025-10-07", createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("holdProfiles", { companyWebsiteId: holdId, companyId, websiteId, brandNames: [{ name: "acme", isPrimary: true }], hasBrandNames: true, updatedAt: 1 });
      // Tracked: two Google showed, one shown only before, one in no list of the build at all.
      for (const key of [keyword(5), keyword(40), keyword(330), "brass door stop"]) {
        await ctx.db.insert("searchConsoleTracked", { companyWebsiteId: holdId, kind: "query", key, createdAt: 1 });
      }
      // Sites' most-searched keywords: one shown barely, one at the line, one shown well, one never shown.
      for (const [index, text] of [keyword(250), keyword(40), keyword(23), "acme cupboard knobs"].entries()) {
        await ctx.db.insert("siteKeywordRanks", {
          websiteId, locationCode: DEFAULT_LOCATION_CODE, keyword: text, position: 5, band: "p04_10", page: "/", volume: 5_000 - index,
          volumeKnown: true, intent: KINDS[index % 4], status: "SAME", change: 0, day: NEWEST, firstSeenDay: NEWEST,
        });
      }

      const lists: Array<{ slot: Slot; parts: PartToWrite[] }> = [];
      const make = (slot: Slot, indexes: number[], rowOf: (index: number) => { key: string; page?: string; top?: string }) => {
        const parts: PartToWrite[] = [];
        for (let start = 0; start < indexes.length || parts.length === 0; start += PART) {
          const chunk = indexes.slice(start, start + PART);
          const made = chunk.map(rowOf);
          const nowOnly = slot.which === "NOW" && slot.list === "query";
          parts.push({
            keys: made.map((row) => row.key),
            ...(slot.list === "competing" ? { pages: made.map((row) => row.page ?? "") } : {}),
            // Ties on purpose: most keywords' clicks are a handful of values.
            clicks: chunk.map((index) => (index * 7) % 5),
            impressions: chunk.map(shownFor),
            positionSums: slot.list === "competing" ? [] : chunk.map((index) => shownFor(index) * (1 + (index % 30))),
            ...(nowOnly ? {
              tops: made.map((row) => row.top ?? ""),
              kinds: chunk.map((index) => KINDS[index % 4]),
              counts: chunk.map((index) => index % 4),
              volumes: chunk.map((index) => (index % 5 === 0 ? -1 : 10 * (index % 30))),
            } : {}),
            ...(slot.list === "competing" && start === 0 ? { shown: 140 } : {}),
          });
        }
        lists.push({ slot, parts });
      };
      const range = (from: number, to: number) => Array.from({ length: to - from }, (_, at) => from + at);
      make({ list: "query", which: "NOW", from: FROM, to: NEWEST }, range(0, 300), (index) => ({ key: keyword(index), top: page(index % 40) }));
      // The days before: half the keywords shown now, and sixty gone since.
      make({ list: "query", which: "BEFORE", from: "2026-04-10", to: "2026-07-08" }, range(150, 360), (index) => ({ key: keyword(index) }));
      // Pages competing: the first 200 keywords with one to three pages, the third twice over for some.
      const pairs = range(0, 200).flatMap((index) => range(0, 1 + (index % 3)).map((at) => ({ index, at })));
      const pairIndexes = pairs.flatMap((pair, at) => (pair.index % 7 === 0 && pair.at === 2 ? [at, at] : [at]));
      make({ list: "competing", which: "NOW", from: FROM, to: NEWEST }, pairIndexes, (at) => ({
        key: keyword(pairs[at].index), page: page((pairs[at].index + pairs[at].at * 11) % 50),
      }));

      const places = { query: new Map<string, number>(), page: new Map<string, number>() };
      for (const kind of ["query", "page"] as const) {
        const book = bookRecords(lists.flatMap(({ slot, parts }) => parts.flatMap((part) => termsOf(slot.list, part, kind))));
        places[kind] = book.places;
        for (const { record, terms } of book.records) {
          await ctx.db.insert("searchConsolePeriodBooks", { companyWebsiteId: holdId, searchType: "web", builtAt: BUILT, kind, record, terms });
        }
      }
      for (const { slot, parts } of lists) {
        for (const [part, made] of parts.entries()) {
          const stored = inBook(slot.list, made, places, ["acme"]);
          await ctx.db.insert("searchConsolePeriods", {
            companyWebsiteId: holdId, searchType: "web", list: slot.list, period: "90", which: slot.which, part, from: slot.from, to: slot.to,
            ...stored, ...packedColumns(stored), ...bookedColumns({ ...stored, list: slot.list }), builtAt: BUILT,
          });
        }
      }
      return holdId;
    });
  });

  /** One list read both ways, with what each says. */
  const bothWays = async (asks: Array<{ view: View; missed?: "searched" | "untracked"; sort?: (typeof SORT_KEYS)[number]; direction?: "asc" | "desc" } & Filters>) =>
    await t.run(async (ctx) => {
      const out = [];
      for (const ask of asks) {
        const args = { searchType: "web" as const, dimension: "query" as const, from: FROM, to: NEWEST, ...ask };
        const columns = await readList(ctx, siteId, args);
        const rows = await readList(ctx, siteId, args, { rows: true });
        const said = (list: typeof rows) => ({
          rows: list.rows.slice(), cut: list.cut, listed: list.listed, named: list.named, summary: list.summary,
          from: list.from, to: list.to, comparable: list.comparable, live: list.live, preparing: list.preparing,
        });
        // Read as columns, the rows are made when asked; Missed demand's few from Sites are rows already.
        const asColumns = !Array.isArray(columns.rows) || (ask.view === "missed" && ask.missed !== "untracked");
        out.push({ ask, asColumns, columns: said(columns), rows: said(rows) });
      }
      return out;
    });

  const VIEWS: Array<{ view: View; missed?: "searched" | "untracked" }> = [
    { view: "all" }, { view: "tracked" }, { view: "almost" }, { view: "competing" }, { view: "moves" },
    { view: "missed", missed: "searched" }, { view: "missed", missed: "untracked" },
  ];

  test("every page's rule, searched and filtered every way: the same rows, figures and hero boxes", async () => {
    const filters: Filters[] = [
      {}, { q: "door" }, { q: "acme lev" }, { tracked: "yes" }, { tracked: "no" }, { band: "4-10" }, { kind: "BUYING" }, { kind: "UNJUDGED" },
      { brand: "yes" }, { brand: "no" }, { move: "win" }, { move: "loss" }, { verdict: "high" },
    ];
    const results = await bothWays(VIEWS.flatMap((view) => filters.map((filter) => ({ ...view, ...filter }))));
    for (const result of results) {
      expect(result.asColumns, JSON.stringify(result.ask)).toBe(true);
      expect(result.columns, JSON.stringify(result.ask)).toEqual(result.rows);
    }
    // Each rule lists something, so the comparison is of rows, not of nothing.
    for (const view of VIEWS) expect(results.find((result) => result.ask.view === view.view && result.ask.missed === view.missed)!.rows.rows.length).toBeGreaterThan(0);
  });

  test("every heading, either way round, on the rules that add their own figures", async () => {
    const rules: Array<{ view: View }> = [{ view: "competing" }, { view: "moves" }, { view: "tracked" }];
    const results = await bothWays(rules.flatMap((rule) => SORT_KEYS.flatMap((sort) => (["asc", "desc"] as const).map((direction) => ({ ...rule, sort, direction })))));
    for (const result of results) expect(result.columns, JSON.stringify(result.ask)).toEqual(result.rows);
  });
});
