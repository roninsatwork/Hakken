import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { readList } from "./searchConsoleLists";
import { PART_ROWS, bookedColumns, packedColumns } from "./utils/searchConsolePacks";
import { bookRecords } from "./searchConsolePeriodBooks";
import { inBook, termsOf, type PartToWrite } from "./searchConsolePeriods";
import { metered } from "@/src/test/readMeter";
import { heldBy } from "@/src/test/heapMeter";

/**
 * Search Console at five times morehandles.co.uk's size
 * (docs/plans/active/core-data-normalisation-plan.md, N1 and §8): what each
 * list screen reads, as Convex counts it, against rule 4 — under half of
 * Convex's 16 MiB a read without a search, three quarters with one.
 *
 * Written first, before part 1, pinning what each screen read then — four of
 * five past Convex's whole limit — and turned into passes by part 1's books.
 *
 * And what each holds in memory, against Convex's 64 MB a query, by the same
 * shares (step 4b): a row object a keyword, the lists held 88 MB here, Pages
 * competing 184 — past Convex's whole memory at twice morehandles.co.uk. Read
 * as columns (`searchConsoleKeywordTable.ts`), 11 to 22 MiB; 16 to 29 at their
 * fullest, measured once.
 *
 * Counted, not timed (`metered`, `src/test/readMeter.ts`), so it would hold on
 * any machine; run here and never on GitHub, as the Sites speed test is, since
 * seeding a website this size is slow on GitHub's small runner (Anthony,
 * 2026-10-08: the one test allowed slower).
 */

const ON_GITHUB = process.env.GITHUB_ACTIONS === "true";
const MiB = 1 << 20;
/** Convex's limit on one read. */
const LIMIT = 16 * MiB;
/** Rule 4: half of it without a search, three quarters with one. */
const HALF = LIMIT / 2;
const THREE_QUARTERS = (LIMIT * 3) / 4;
/** Convex's memory for a query, and what a screen may hold of it: half without a search, three quarters with one. */
const MEMORY = 64 * MiB;
const HALF_MEMORY = MEMORY / 2;
const THREE_QUARTERS_MEMORY = (MEMORY * 3) / 4;

/** Five times morehandles.co.uk, measured on dev 2026-10-08. */
const SCALE = 5;
const KEYWORDS_90 = 40_005 * SCALE;
const COMPETING_90 = 46_863 * SCALE;
const PAGES_90 = 9_233 * SCALE;
const KEYWORDS_30 = 24_586 * SCALE;
const KEYWORDS_30_BEFORE = 25_956 * SCALE;
const PAGES = 50_000;

const NEWEST = "2026-10-06";
const BUILT = 1_791_400_000_000;
const WORDS = ["door", "handles", "brass", "lever", "cupboard", "knobs", "sash", "window", "latch", "pull", "black", "chrome", "satin", "antique", "bathroom", "kitchen"];
/** A keyword of about morehandles.co.uk's length: three words and a number. */
const keyword = (index: number) => `${WORDS[index % 16]} ${WORDS[(index >> 4) % 16]} ${WORDS[(index >> 8) % 16]} ${index}`;
/** A page address of about its length. */
const page = (index: number) => `https://www.big-shop.co.uk/${WORDS[index % 16]}-${WORDS[(index >> 4) % 16]}/${WORDS[(index >> 8) % 16]}-${index}.html`;

type Slot = { list: "query" | "page" | "competing"; period: "30" | "90"; which: "NOW" | "BEFORE"; from: string; to: string };

describe.skipIf(ON_GITHUB)("Search Console at five times morehandles.co.uk", () => {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  let siteId: Id<"companyWebsites">;

  beforeAll(async () => {
    siteId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Shop", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "big-shop.co.uk", displayHost: "big-shop.co.uk", firstSeenAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      await ctx.db.insert("searchConsoleConnections", {
        companyId, companyWebsiteId: holdId, websiteId, status: "CONNECTED", property: "sc-domain:big-shop.co.uk",
        newestDay: NEWEST, oldestDay: "2025-10-07", createdAt: 1, updatedAt: 1,
      });
      // Each list worked out as text, then written as the build writes it (`buildSitePeriods`): one book for the
      // build, every keyword and page once, and the lists holding places in it; numbers packed, kinds booked.
      const lists: Array<{ slot: Slot; parts: PartToWrite[] }> = [];
      const make = (slot: Slot, rows: number, rowOf: (index: number) => { key: string; page?: string; top?: string }) => {
        const parts: PartToWrite[] = [];
        for (let part = 0; part * PART_ROWS < rows || part === 0; part += 1) {
          const indexes = Array.from({ length: Math.min(PART_ROWS, rows - part * PART_ROWS) }, (_, at) => part * PART_ROWS + at);
          const made = indexes.map(rowOf);
          const nowOnly = slot.which === "NOW" && slot.list !== "competing";
          parts.push({
            keys: made.map((row) => row.key),
            ...(slot.list === "competing" ? { pages: made.map((row) => row.page ?? "") } : {}),
            clicks: indexes.map((index) => Math.max(0, 500 - Math.floor(index / 50))),
            impressions: indexes.map((index) => 5_000 - Math.floor(index / 50)),
            positionSums: slot.list === "competing" ? [] : indexes.map((index) => (5_000 - Math.floor(index / 50)) * ((index % 40) + 1)),
            ...(nowOnly ? {
              tops: made.map((row) => row.top ?? ""),
              kinds: indexes.map((index) => ["BUYING", "RESEARCHING", "BRANDED", "UNJUDGED"][index % 4]),
              counts: indexes.map((index) => 1 + (index % 5)),
              volumes: indexes.map((index) => (index % 7 === 0 ? -1 : 10 * (index % 300))),
            } : {}),
            ...(slot.list === "competing" && part === 0 ? { shown: PAGES } : {}),
          });
        }
        lists.push({ slot, parts });
      };
      const keywordRow = (index: number) => ({ key: keyword(index), top: page(index % PAGES) });
      make({ list: "query", period: "90", which: "NOW", from: "2026-07-09", to: NEWEST }, KEYWORDS_90, keywordRow);
      make({ list: "query", period: "30", which: "NOW", from: "2026-09-07", to: NEWEST }, KEYWORDS_30, keywordRow);
      make({ list: "query", period: "30", which: "BEFORE", from: "2026-08-08", to: "2026-09-06" }, KEYWORDS_30_BEFORE, keywordRow);
      make({ list: "page", period: "90", which: "NOW", from: "2026-07-09", to: NEWEST }, PAGES_90, (index) => ({ key: page(index), top: keyword(index) }));
      // Pages competing: each keyword shown with two or three pages.
      make({ list: "competing", period: "90", which: "NOW", from: "2026-07-09", to: NEWEST }, COMPETING_90, (index) => ({
        key: keyword(Math.floor(index / 2.35)), page: page((index * 7) % PAGES),
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
          const stored = inBook(slot.list, made, places, []);
          await ctx.db.insert("searchConsolePeriods", {
            companyWebsiteId: holdId, searchType: "web", list: slot.list, period: slot.period, which: slot.which, part, from: slot.from, to: slot.to,
            ...stored, ...packedColumns(stored), ...bookedColumns({ ...stored, list: slot.list }), builtAt: BUILT,
          });
        }
      }
      return holdId;
    });
  });

  /**
   * What one screen reads — the list it asks for, read as the screen reads it — and what it
   * holds in memory with the page of rows it shows, against Convex's 64 MB a query.
   */
  const reads = async (ask: Partial<Parameters<typeof readList>[2]> & { dimension: "query" | "page"; from: string }) => await t.run(async (ctx) => {
    const args = { searchType: "web" as const, to: NEWEST, ...ask };
    const meter = metered(ctx.db);
    const list = await readList({ db: meter.db }, siteId, args);
    expect(list.preparing).toBe(false);
    expect(list.rows.length).toBeGreaterThan(0);
    const held = await heldBy(async () => {
      const again = await readList(ctx, siteId, args);
      return { again, page: again.rows.slice(0, 25) };
    });
    // A list of keywords read as columns, its rows made only when asked (step 4b); a list of pages is a website's pages.
    expect(Array.isArray(held.value.again.rows)).toBe(ask.dimension === "page");
    return { bytes: meter.bytes(), documents: meter.documents(), holds: held.bytes };
  });

  // Before part 1 (2026-10-08, lists holding every row's text): Keywords for 90 days read 19.4 MiB, for 30 days compared
  // 16.3, searched 19.4, Pages competing 40.1 — each past Convex's whole 16 MiB, so each screen would fail; Pages 3.2.
  // With each keyword and page once in the build's book (§5.1), each within rule 4's share.
  test("Keywords for 90 days — within half the limit", async () => {
    const read = await reads({ dimension: "query", from: "2026-07-09" });
    expect(read.bytes).toBeLessThan(HALF);
    expect(read.holds).toBeLessThan(HALF_MEMORY);
  });

  test("Keywords for 30 days, compared with the 30 before — within half the limit", async () => {
    const read = await reads({ dimension: "query", from: "2026-09-07" });
    expect(read.bytes).toBeLessThan(HALF);
    expect(read.holds).toBeLessThan(HALF_MEMORY);
  });

  test("Keywords for 90 days with a search — within three quarters", async () => {
    const read = await reads({ dimension: "query", from: "2026-07-09", q: "door brass" });
    expect(read.bytes).toBeLessThan(THREE_QUARTERS);
    expect(read.holds).toBeLessThan(THREE_QUARTERS_MEMORY);
  });

  test("Pages competing for 90 days — within half the limit", async () => {
    const read = await reads({ dimension: "query", from: "2026-07-09", view: "competing" });
    expect(read.bytes).toBeLessThan(HALF);
    expect(read.holds).toBeLessThan(HALF_MEMORY);
  });

  test("Pages for 90 days — within half the limit", async () => {
    const read = await reads({ dimension: "page", from: "2026-07-09" });
    expect(read.bytes).toBeLessThan(HALF);
    expect(read.holds).toBeLessThan(HALF_MEMORY);
  });
});
