import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { readList } from "./searchConsoleLists";
import { PART_ROWS, bookedColumns, packedColumns } from "./utils/searchConsolePacks";
import { metered } from "@/src/test/readMeter";

/**
 * Search Console at five times morehandles.co.uk's size
 * (docs/plans/active/core-data-normalisation-plan.md, N1 and §8): what each
 * list screen reads, as Convex counts it, against rule 4 — under half of
 * Convex's 16 MiB a read without a search, three quarters with one.
 *
 * Written first, before part 1: it pins what each screen reads today, and
 * which pass the limit. Part 1 turns each "today" into a pass.
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
/** Rule 4: half of it without a search (three quarters with one, once part 1 is in). */
const HALF = LIMIT / 2;

/** Five times morehandles.co.uk, measured on dev 2026-10-08. */
const SCALE = 5;
const KEYWORDS_90 = 40_005 * SCALE;
const COMPETING_90 = 46_863 * SCALE;
const PAGES_90 = 9_233 * SCALE;
const KEYWORDS_30 = 24_586 * SCALE;
const KEYWORDS_30_BEFORE = 25_956 * SCALE;
const PAGES = 50_000;

const NEWEST = "2026-10-06";
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
      // Each list written as the build writes it (`writePeriodPart`): numbers packed, page addresses and kinds booked.
      const write = async (slot: Slot, rows: number, rowOf: (index: number) => { key: string; page?: string; top?: string }) => {
        for (let part = 0; part * PART_ROWS < rows || part === 0; part += 1) {
          const indexes = Array.from({ length: Math.min(PART_ROWS, rows - part * PART_ROWS) }, (_, at) => part * PART_ROWS + at);
          const made = indexes.map(rowOf);
          const numbers = {
            clicks: indexes.map((index) => Math.max(0, 500 - Math.floor(index / 50))),
            impressions: indexes.map((index) => 5_000 - Math.floor(index / 50)),
            positionSums: slot.list === "competing" ? [] : indexes.map((index) => (5_000 - Math.floor(index / 50)) * ((index % 40) + 1)),
          };
          const nowOnly = slot.which === "NOW" && slot.list !== "competing";
          const beside = {
            list: slot.list,
            ...(slot.list === "competing" ? { pages: made.map((row) => row.page ?? "") } : {}),
            ...(nowOnly ? { tops: made.map((row) => row.top ?? ""), kinds: indexes.map((index) => ["BUYING", "RESEARCHING", "BRANDED", "UNJUDGED"][index % 4]) } : {}),
          };
          await ctx.db.insert("searchConsolePeriods", {
            companyWebsiteId: holdId, searchType: "web", list: slot.list, period: slot.period, which: slot.which, part, from: slot.from, to: slot.to,
            keys: made.map((row) => row.key),
            ...packedColumns({ ...numbers, ...(nowOnly ? { counts: indexes.map((index) => 1 + (index % 5)), volumes: indexes.map((index) => (index % 7 === 0 ? -1 : 10 * (index % 300))) } : {}) }),
            ...bookedColumns(beside),
            ...(slot.list === "competing" && part === 0 ? { shown: PAGES } : {}),
            builtAt: 1,
          });
        }
      };
      const keywordRow = (index: number) => ({ key: keyword(index), top: page(index % PAGES) });
      await write({ list: "query", period: "90", which: "NOW", from: "2026-07-09", to: NEWEST }, KEYWORDS_90, keywordRow);
      await write({ list: "query", period: "30", which: "NOW", from: "2026-09-07", to: NEWEST }, KEYWORDS_30, keywordRow);
      await write({ list: "query", period: "30", which: "BEFORE", from: "2026-08-08", to: "2026-09-06" }, KEYWORDS_30_BEFORE, keywordRow);
      await write({ list: "page", period: "90", which: "NOW", from: "2026-07-09", to: NEWEST }, PAGES_90, (index) => ({ key: page(index), top: keyword(index) }));
      // Pages competing: each keyword shown with two or three pages.
      await write({ list: "competing", period: "90", which: "NOW", from: "2026-07-09", to: NEWEST }, COMPETING_90, (index) => ({
        key: keyword(Math.floor(index / 2.35)), page: page((index * 7) % PAGES),
      }));
      return holdId;
    });
  });

  /** What one screen reads: the list it asks for, read as the screen reads it. */
  const reads = async (ask: Partial<Parameters<typeof readList>[2]> & { dimension: "query" | "page"; from: string }) => await t.run(async (ctx) => {
    const meter = metered(ctx.db);
    const list = await readList({ db: meter.db }, siteId, { searchType: "web", to: NEWEST, ...ask });
    expect(list.preparing).toBe(false);
    expect(list.rows.length).toBeGreaterThan(0);
    return { bytes: meter.bytes(), documents: meter.documents() };
  });

  // Today (2026-10-08, before part 1), as measured: Keywords for 90 days 19.4 MiB, for 30 days compared 16.3,
  // searched 19.4, Pages competing 40.1 — each past Convex's whole 16 MiB, so each screen would fail; Pages 3.2.
  // Part 1 turns each "today" into a pass under rule 4's share.
  test("Keywords for 90 days — today past Convex's limit", async () => {
    const read = await reads({ dimension: "query", from: "2026-07-09" });
    expect(read.bytes).toBeGreaterThan(LIMIT);
  });

  test("Keywords for 30 days, compared with the 30 before — today past Convex's limit", async () => {
    const read = await reads({ dimension: "query", from: "2026-09-07" });
    expect(read.bytes).toBeGreaterThan(LIMIT);
  });

  test("Keywords for 90 days with a search — today past Convex's limit", async () => {
    const read = await reads({ dimension: "query", from: "2026-07-09", q: "door brass" });
    expect(read.bytes).toBeGreaterThan(LIMIT);
  });

  test("Pages competing for 90 days — today more than twice Convex's limit", async () => {
    const read = await reads({ dimension: "query", from: "2026-07-09", view: "competing" });
    expect(read.bytes).toBeGreaterThan(2 * LIMIT);
  });

  test("Pages for 90 days — within half the limit already", async () => {
    const read = await reads({ dimension: "page", from: "2026-07-09" });
    expect(read.bytes).toBeLessThan(HALF);
  });
});
