import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { BOOK_CHUNK, deleteBooks, lineKeywordsInQuery, monthOfDay } from "./searchConsoleKeywordBooks";
import { packNumbers } from "./utils/searchConsolePacks";

/**
 * Each keyword a website's daily lines hold, kept once a month
 * (keep-less-history-plan.md, part 8.3): a line holds each keyword's place in
 * its month's book. Written and read through Search Console's own collection
 * in searchConsole.test.ts; here, the book itself.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function hold(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
  });
}

const books = (t: ReturnType<typeof harness>) => t.run(async (ctx) => (await ctx.db.query("searchConsoleKeywordBooks").collect())
  .map((record) => `${record.country ?? "all"} ${record.month} ${record.chunk} ${record.keywords.length}`).sort());

describe("a month's book of keywords", () => {
  test("keywords are added in records of 4,000, each at its place, and a line's places read back as its keywords", async () => {
    const t = harness();
    const holdId = await hold(t);
    const keywords = Array.from({ length: BOOK_CHUNK + 100 }, (_, index) => `keyword ${index}`);

    const places = await t.mutation(internal.searchConsoleKeywordBooks.addToBook, { holdId, month: "2026-09", keywords });
    expect(places).toEqual(keywords.map((_, index) => index));
    expect(await books(t)).toEqual(["all 2026-09 0 4000", "all 2026-09 1 100"]);
    // Added again later, after the last.
    expect(await t.mutation(internal.searchConsoleKeywordBooks.addToBook, { holdId, month: "2026-09", keywords: ["boiler repair"] })).toEqual([BOOK_CHUNK + 100]);
    expect(await t.query(internal.searchConsoleKeywordBooks.bookChunk, { holdId, month: "2026-09", chunk: 1 })).toHaveLength(101);

    const line = packNumbers([BOOK_CHUNK + 100, 0, BOOK_CHUNK + 5]);
    expect(await t.run(async (ctx) => await lineKeywordsInQuery(ctx, holdId, undefined, "2026-09-26", line)))
      .toEqual(["boiler repair", "keyword 0", `keyword ${BOOK_CHUNK + 5}`]);
    // A line kept before 2026-10-08 names its keywords in full.
    expect(await t.run(async (ctx) => await lineKeywordsInQuery(ctx, holdId, undefined, "2026-09-26", ["plumber leeds"]))).toEqual(["plumber leeds"]);
    expect(monthOfDay("2026-09-26")).toBe("2026-09");
  });

  test("each country kept ready has its own books; a month's goes once its lines have, and all go with the website", async () => {
    const t = harness();
    const holdId = await hold(t);
    for (const month of ["2026-07", "2026-08", "2026-09"]) {
      await t.mutation(internal.searchConsoleKeywordBooks.addToBook, { holdId, month, keywords: ["plumber leeds"] });
      await t.mutation(internal.searchConsoleKeywordBooks.addToBook, { holdId, country: "gbr", month, keywords: ["plumber leeds"] });
    }

    expect(await t.mutation(internal.searchConsoleKeywordBooks.dropOldBooks, { holdId, before: "2026-09" })).toBe(false);
    expect(await books(t)).toEqual(["all 2026-09 0 1", "gbr 2026-07 0 1", "gbr 2026-08 0 1", "gbr 2026-09 0 1"]);

    expect(await t.run(async (ctx) => await deleteBooks(ctx, holdId, { country: "gbr" }, 10))).toBe(true);
    expect(await books(t)).toEqual(["all 2026-09 0 1"]);
    expect(await t.run(async (ctx) => await deleteBooks(ctx, holdId, "ALL", 10))).toBe(true);
    expect(await books(t)).toEqual([]);
  });
});
