import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { BOOK_RECORD, BookNames, bookRecords, deletePeriodBooks, namedRows, noteListBuild, wholeBook, type BookScope } from "./searchConsolePeriodBooks";
import type { ListRow } from "./utils/searchConsoleViews";
import { termToken } from "./utils/searchConsoleTerms";

/**
 * The book each build of a website's ready-made lists writes beside them
 * (core-data-normalisation-plan.md §5.1). Written and read through Search
 * Console's own collection in searchConsole.test.ts, and at five times
 * morehandles.co.uk in searchConsoleScale.test.ts; here, the book itself.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const EMPTY_ROW: ListRow = {
  key: "", clicks: 1, impressions: 1, ctr: 1, position: 1, band: "1-3", previousClicks: null, change: null, previousPosition: null,
  positionChange: null, share: 0, count: null, top: null, tracked: false, kind: null, volume: null, estimate: null, brand: null,
  usualCtr: null, expected: null, topShare: null, next: null, nextShare: null, verdict: null, gap: null,
};

async function hold(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
  });
}

const write = async (t: ReturnType<typeof harness>, scope: BookScope, kind: "query" | "page", texts: string[]) => {
  const { records, places } = bookRecords(texts);
  await t.run(async (ctx) => {
    for (const { record, terms } of records) await ctx.db.insert("searchConsolePeriodBooks", { ...scope, kind, record, terms });
  });
  return places;
};

describe("a build's book", () => {
  test("every text once, sorted A to Z in records of 250 with a header, each place its order", async () => {
    const texts = Array.from({ length: BOOK_RECORD + 10 }, (_, index) => `keyword ${String(index).padStart(4, "0")}`).reverse();
    const { records, places } = bookRecords([...texts, texts[0]]);
    expect(records.map((one) => [one.record, one.terms.length])).toEqual([[0, BOOK_RECORD], [1, 10], [-1, 2]]);
    expect(records[0].terms[0]).toBe("keyword 0000");
    expect(records.at(-1)!.terms).toEqual(["keyword 0000", `keyword ${String(BOOK_RECORD).padStart(4, "0")}`]);
    expect(places.get("keyword 0003")).toBe(3);
    expect(places.size).toBe(BOOK_RECORD + 10);
  });

  test("a row is named by its record, a text found by the header, and a whole book read for a search", async () => {
    const t = harness();
    const holdId = await hold(t);
    const scope: BookScope = { companyWebsiteId: holdId, searchType: "web", builtAt: 5 };
    const keywords = Array.from({ length: 600 }, (_, index) => `door handle ${index}`);
    const places = await write(t, scope, "query", keywords);
    await write(t, scope, "page", ["https://acme-shop.test/", "https://acme-shop.test/levers/"]);

    const named = await t.run(async (ctx) => {
      const names = new BookNames(ctx, scope);
      return {
        text: await names.textOf(termToken("query", places.get("door handle 412")!)),
        page: await names.textOf(termToken("page", 1)),
        plain: await names.textOf("not a token"),
        token: await names.tokenOf("query", "door handle 77"),
        missing: await names.tokenOf("query", "brass knob"),
        whole: (await wholeBook(ctx, scope, "query")).length,
      };
    });
    expect(named).toEqual({
      text: "door handle 412",
      page: "https://acme-shop.test/levers/",
      plain: "not a token",
      token: termToken("query", places.get("door handle 77")!),
      // A text the book does not hold stays text.
      missing: "brass knob",
      whole: 600,
    });
  });

  test("rows are named one by one for a screen, and from the books read whole for a download", async () => {
    const t = harness();
    const holdId = await hold(t);
    const scope: BookScope = { companyWebsiteId: holdId, searchType: "web", builtAt: 7 };
    const keywords = Array.from({ length: 800 }, (_, index) => `lever handle ${index}`);
    const places = await write(t, scope, "query", keywords);
    await write(t, scope, "page", ["https://acme-shop.test/levers/"]);
    const row = (keyword: string) => ({ ...EMPTY_ROW, key: termToken("query", places.get(keyword)!), top: termToken("page", 0) });
    const named = await t.run(async (ctx) => {
      const names = new BookNames(ctx, scope);
      const few = await namedRows({ names }, [row("lever handle 3")]);
      const many = await namedRows({ names }, keywords.map(row));
      return { few: few.map((one) => [one.key, one.top]), many: many.map((one) => one.key), tops: new Set(many.map((one) => one.top)).size };
    });
    expect(named.few).toEqual([["lever handle 3", "https://acme-shop.test/levers/"]]);
    expect(named.many).toEqual(keywords);
    expect(named.tops).toBe(1);
  });

  test("a book goes once no list is read from its build; all go with the website", async () => {
    const t = harness();
    const holdId = await hold(t);
    for (const builtAt of [1, 2, 3]) await write(t, { companyWebsiteId: holdId, searchType: "web", builtAt }, "query", ["door handles"]);
    await t.run(async (ctx) => {
      await noteListBuild(ctx, { companyWebsiteId: holdId, searchType: "web", list: "query", period: "30", which: "NOW" }, 3);
      await noteListBuild(ctx, { companyWebsiteId: holdId, searchType: "web", list: "query", period: "90", which: "NOW" }, 2);
    });
    const builds = () => t.run(async (ctx) => [...new Set((await ctx.db.query("searchConsolePeriodBooks").collect()).map((record) => record.builtAt))].sort());

    expect(await t.mutation(internal.searchConsolePeriodBooks.dropUnusedBooks, { companyWebsiteId: holdId, searchType: "web" })).toBe(false);
    expect(await builds()).toEqual([2, 3]);

    expect(await t.run(async (ctx) => await deletePeriodBooks(ctx, holdId, "ALL", 50))).toBe(true);
    expect(await builds()).toEqual([]);
    expect(await t.run(async (ctx) => (await ctx.db.query("searchConsolePeriodUses").collect()).length)).toBe(0);
  });
});
