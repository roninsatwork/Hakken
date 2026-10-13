import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { readList } from "./bingWebmasterReads";
import { packBingRows } from "./utils/bingWebmasterWeeks";
import { BING_BOOK_CHUNK } from "./bingWebmasterBook";
import { packNumbers } from "./utils/searchConsolePacks";
import { metered } from "@/src/test/readMeter";
import { heldBy } from "@/src/test/heapMeter";

/**
 * Bing Webmaster at five times morehandles.co.uk's size (docs/plans/active/
 * bing-webmaster-plan.md §4.5, BW2): what its Keywords and Bing against
 * Google screens read, as Convex counts it, against the core data plan's rule
 * 4 — under half of Convex's 16 MiB a read without a search, three quarters
 * with one — and what they hold in memory against Convex's 64 MB a query.
 *
 * Bing's keywords for a website are a fraction of Google's; this holds it to
 * as many as Google's own at that size, 200,025, so it errs long.
 *
 * Counted, not timed, and run here, never on GitHub, as Search Console's
 * scale test is: seeding a website this size is slow on GitHub's small runner.
 */

const ON_GITHUB = process.env.GITHUB_ACTIONS === "true";
const MiB = 1 << 20;
const LIMIT = 16 * MiB;
const HALF = LIMIT / 2;
const THREE_QUARTERS = (LIMIT * 3) / 4;
const MEMORY = 64 * MiB;
const HALF_MEMORY = MEMORY / 2;
const THREE_QUARTERS_MEMORY = (MEMORY * 3) / 4;

/** Search Console's 90 days of keywords at five times morehandles.co.uk, measured on dev 2026-10-08. */
const KEYWORDS = 40_005 * 5;
const BUILT = 1_791_400_000_000;
const WORDS = ["door", "handles", "brass", "lever", "cupboard", "knobs", "sash", "window", "latch", "pull", "black", "chrome", "satin", "antique", "bathroom", "kitchen"];
const keyword = (index: number) => `${WORDS[index % 16]} ${WORDS[(index >> 4) % 16]} ${WORDS[(index >> 8) % 16]} ${index}`;

describe.skipIf(ON_GITHUB)("Bing Webmaster at five times morehandles.co.uk", () => {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  let holdId: Id<"companyWebsites">;

  beforeAll(async () => {
    holdId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Shop", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "big-shop.co.uk", displayHost: "big-shop.co.uk", firstSeenAt: 1 });
      const hold = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      await ctx.db.insert("bingConnections", {
        companyId, companyWebsiteId: hold, websiteId, status: "CONNECTED", site: "https://www.big-shop.co.uk/", dataSite: "https://www.big-shop.co.uk/",
        newestDay: "2026-10-11", newestWeek: "2026-10-11", createdAt: 1, updatedAt: 1,
      });
      // The website's book: every keyword once, 4,000 a chunk.
      for (let chunk = 0; chunk * BING_BOOK_CHUNK < KEYWORDS; chunk += 1) {
        const keywords = Array.from({ length: Math.min(BING_BOOK_CHUNK, KEYWORDS - chunk * BING_BOOK_CHUNK) }, (_, at) => keyword(chunk * BING_BOOK_CHUNK + at));
        await ctx.db.insert("bingKeywordBooks", { companyWebsiteId: hold, chunk, keywords });
      }
      // The 90 days, as the build writes it: places, packed, Google's columns beside Bing's.
      const rows = Array.from({ length: KEYWORDS }, (_, key) => ({ key, clicks: Math.max(0, 200 - Math.floor(key / 100)), impressions: 2_000 - Math.floor(key / 200), positionSum: (2_000 - Math.floor(key / 200)) * ((key % 40) + 1) }));
      for (const [part, packed] of packBingRows(rows).entries()) {
        const count = packed.keys.length > 0 ? rows.slice(part * 2_000, part * 2_000 + 2_000).length : 0;
        await ctx.db.insert("bingPeriods", {
          companyWebsiteId: hold, list: "query", period: "90", which: "NOW", part, from: "2026-07-14", to: "2026-10-11", ...packed,
          googleClicks: packNumbers(Array.from({ length: count }, (_, at) => (at % 3 === 0 ? -1 : at % 500))),
          googleImpressions: packNumbers(Array.from({ length: count }, (_, at) => (at % 3 === 0 ? -1 : 5_000 - (at % 500)))),
          googlePositionSums: packNumbers(Array.from({ length: count }, (_, at) => (at % 3 === 0 ? -1 : (5_000 - (at % 500)) * ((at % 30) + 1)))),
          builtAt: BUILT,
        });
      }
      return hold;
    });
  });

  const reads = async (ask: Parameters<typeof readList>[2]) => await t.run(async (ctx) => {
    const meter = metered(ctx.db);
    const list = await readList({ db: meter.db }, holdId, ask);
    expect(list.rows.length).toBeGreaterThan(0);
    const held = await heldBy(async () => {
      const again = await readList(ctx, holdId, ask);
      return { again, page: again.rows.slice(0, 25) };
    });
    return { bytes: meter.bytes(), holds: held.bytes };
  });

  test("Keywords for 90 days — within half the limit", async () => {
    const read = await reads({ list: "query", period: "90" });
    expect(read.bytes).toBeLessThan(HALF);
    expect(read.holds).toBeLessThan(HALF_MEMORY);
  });

  test("Keywords for 90 days, searched — within three quarters", async () => {
    const read = await reads({ list: "query", period: "90", q: "brass lever" });
    expect(read.bytes).toBeLessThan(THREE_QUARTERS);
    expect(read.holds).toBeLessThan(THREE_QUARTERS_MEMORY);
  });

  test("Bing against Google, by the widest gap — within half the limit", async () => {
    const read = await reads({ list: "query", period: "90", sort: "gap" });
    expect(read.bytes).toBeLessThan(HALF);
    expect(read.holds).toBeLessThan(HALF_MEMORY);
  });
});
