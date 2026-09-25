import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { RANK_BANDS, RANK_INTENTS, RANK_STATUSES, KD_BANDS, PAGE_TYPES } from "./utils/siteShapes";

/**
 * The Sites load test (docs/plans/active/user-sites-plan.md, "Speed": "A test
 * seeds one site with 50,000 keywords, 5,000 pages, 20,000 backlinks and two
 * years of summaries, and checks that every Sites query … returns within the
 * targets").
 *
 * Every table query reads one page from an index, so its time must not grow
 * with the table. The in-memory test backend is not the real one, so the
 * yardstick is measured in the same run: reading all 50,000 keywords once.
 * Each query must take well under half of that — on 2026-09-23 the slowest
 * took about a quarter, and a full scan about 1.2 seconds — so a query that
 * scanned the table fails here on any machine, fast or slow.
 *
 * Both sides are timed as the fastest of a few runs. The whole suite runs in
 * parallel, and one run caught behind a busy moment once took 1.5 seconds for
 * a read that takes 55ms alone. A query that really scans is slow every time,
 * so its fastest run still fails; a busy moment is not slow every time.
 *
 * **Run here, not on GitHub.** GitHub's runner times the app's code under
 * coverage on a small, busy machine, and failed a query that takes 17% of a
 * scan here at 50.2% (2026-09-25). Anthony, the same day: "We need tests on
 * dev still just remove these new ones that are causing failures in GitHub".
 * It runs in every local run before a push (`npm run check`).
 */
const UK = 2826;
/** On GitHub's runner, where this test's timings mean nothing. */
const ON_GITHUB = process.env.GITHUB_ACTIONS === "true";
/** A query may take at most this share of one full scan of the keywords. */
const SHARE_OF_A_SCAN = 0.5;
/** Runs per query; the fastest counts. */
const RUNS = 3;

/** The fastest of `times` runs, and what the last one returned. */
async function fastest<T>(run: () => Promise<T>, times: number): Promise<{ took: number; result: T }> {
  let took = Infinity;
  let result!: T;
  for (let attempt = 0; attempt < times; attempt += 1) {
    const started = performance.now();
    result = await run();
    took = Math.min(took, performance.now() - started);
  }
  return { took, result };
}

describe("a very large site", () => {
  test.skipIf(ON_GITHUB)("every Sites query answers within the target on 50,000 keywords, 5,000 pages, 20,000 links and two years", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { holdId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "Member", email: "big@test.com", role: "ADMIN" as const, companyId, createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
      return { holdId, userId, websiteId };
    });
    const websiteId = await t.run(async (ctx) => (await ctx.db.get(holdId))!.websiteId);

    // 50,000 keywords, in batches so no one transaction is huge.
    for (let batch = 0; batch < 50; batch += 1) {
      await t.run(async (ctx) => {
        for (let index = batch * 1_000; index < (batch + 1) * 1_000; index += 1) {
          const position = (index % 100) + 1;
          await ctx.db.insert("siteKeywordRanks", {
            websiteId, locationCode: UK, keyword: `search number ${index}`, position,
            band: RANK_BANDS[Math.min(4, Math.floor(position / 21))], page: `/section-${index % 40}/page-${index % 5_000}/`,
            volume: (index * 7) % 5_000, volumeKnown: true, intent: RANK_INTENTS[index % RANK_INTENTS.length],
            status: RANK_STATUSES[index % 4], change: (index % 11) - 5, day: "2026-09-23", firstSeenDay: "2025-01-01",
            searchText: `search number ${index} /section-${index % 40}/page-${index % 5_000}/`,
            kdBand: KD_BANDS[index % KD_BANDS.length], difficulty: index % 100, cpc: (index % 50) / 10, traffic: (index * 3) % 900,
            updatedAt: Date.now(),
          });
        }
      });
    }
    // 5,000 pages and 20,000 links.
    for (let batch = 0; batch < 5; batch += 1) {
      await t.run(async (ctx) => {
        for (let index = batch * 1_000; index < (batch + 1) * 1_000; index += 1) {
          await ctx.db.insert("sitePageRanks", {
            websiteId, locationCode: UK, page: `/section-${index % 40}/page-${index}/`, url: `https://big.co.uk/section-${index % 40}/page-${index}/`,
            section: `/section-${index % 40}/`, keywords: (index % 30) + 1, bestPosition: (index % 50) + 1, top3: index % 3,
            volumeSum: index * 3, topKeyword: `search number ${index}`, topKeywordVolume: index, firstSeenDay: "2025-01-01",
            day: "2026-09-23", searchText: `/section-${index % 40}/page-${index}/ search number ${index}`,
            traffic: index % 700, pageType: PAGE_TYPES[index % PAGE_TYPES.length], rebuildId: "load", updatedAt: Date.now(),
          });
        }
      });
    }
    const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "backlinks_list", family: "Backlinks", mode: "LIVE", websiteId, taskArgsJson: "{}", status: "READY",
      tag: "load", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never));
    for (let batch = 0; batch < 20; batch += 1) {
      await t.run(async (ctx) => {
        for (let index = batch * 1_000; index < (batch + 1) * 1_000; index += 1) {
          await ctx.db.insert("siteBacklinks", {
            websiteId, pass: "ONE_PER_DOMAIN", pullId, day: "2026-09-23", domainFrom: `linker-${index}.com`,
            urlFrom: `https://linker-${index}.com/post`, urlTo: "https://big.co.uk/", pageTo: "/", anchor: `anchor ${index % 300}`,
            dofollow: index % 3 !== 0, status: index % 10 === 0 ? "LOST" : index % 10 === 1 ? "NEW" : "LIVE", isBroken: false,
            domainRank: index % 1_000, firstSeen: "2025-06-01", searchText: `linker-${index}.com anchor ${index % 300}`,
          });
        }
      });
    }
    // Two years of day summaries.
    await t.run(async (ctx) => {
      const start = Date.parse("2024-09-24T00:00:00Z");
      for (let day = 0; day < 730; day += 1) {
        await ctx.db.insert("siteDaySummaries", {
          websiteId, locationCode: UK, day: new Date(start + day * 86_400_000).toISOString().slice(0, 10),
          keywords: 50_000, estimatedTraffic: 10_000 + day, backlinks: 20_000, referringDomains: 3_000 + day,
          bands: { p01_03: 1_000, p04_10: 5_000, p11_20: 10_000, p21_50: 20_000, p51_up: 14_000 },
          rankedUp: day % 7, rankedDown: day % 5, rankedNew: day % 3, rankedLost: day % 2, updatedAt: Date.now(),
        });
      }
    });

    const asMember = t.withIdentity({ subject: userId });
    const page = { numItems: 15, cursor: null };
    const range = { from: "2024-09-24", to: "2026-09-23" };
    const timed: Array<[string, () => Promise<unknown>]> = [
      ["keywords, best first", () => asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page })],
      ["keywords, one band", () => asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page, band: "p11_20" })],
      ["keywords, by intent", () => asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page, intent: "BUYING" })],
      ["keywords, by movement", () => asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page, status: "UP" })],
      ["keywords, by difficulty", () => asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page, kdBand: "kd31_70" })],
      ["keywords, most searched", () => asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page, sort: "volume" })],
      ["keywords, most traffic", () => asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page, sort: "traffic" })],
      ["keywords, dearest clicks", () => asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page, sort: "cpc" })],
      ["keywords, on one page", () => asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page, page: "/section-3/page-43/" })],
      ["wins", () => asMember.query(api.siteKeywords.listMoves, { siteId: holdId, paginationOpts: page, status: "UP" })],
      ["compare with a day", () => asMember.query(api.siteKeywords.keywordsOnDay, { siteId: holdId, day: "2026-09-01", keywords: ["search number 1", "search number 2"] })],
      ["pages, most keywords", () => asMember.query(api.siteKeywords.listPages, { siteId: holdId, paginationOpts: page })],
      ["pages, most traffic", () => asMember.query(api.siteKeywords.listPages, { siteId: holdId, paginationOpts: page, sort: "traffic" })],
      ["pages, one type", () => asMember.query(api.siteKeywords.listPages, { siteId: holdId, paginationOpts: page, pageType: "ARTICLE" })],
      ["pages, one section", () => asMember.query(api.siteKeywords.listPages, { siteId: holdId, paginationOpts: page, section: "/section-7/" })],
      ["sections", () => asMember.query(api.siteKeywords.listSections, { siteId: holdId })],
      ["two years, daily", () => asMember.query(api.siteCharts.siteSeries, { siteId: holdId, ...range, step: "day" })],
      ["two years, monthly", () => asMember.query(api.siteCharts.siteSeries, { siteId: holdId, ...range, step: "month" })],
      ["a month's calendar", () => asMember.query(api.siteCharts.siteCalendar, { siteId: holdId, month: "2026-09" })],
      ["backlinks, strongest", () => asMember.query(api.siteLinkLists.listBacklinks, { siteId: holdId, paginationOpts: page })],
      ["backlinks, lost", () => asMember.query(api.siteLinkLists.listBacklinks, { siteId: holdId, paginationOpts: page, status: "LOST" })],
      ["backlinks, nofollow", () => asMember.query(api.siteLinkLists.listBacklinks, { siteId: holdId, paginationOpts: page, follow: "NOFOLLOW" })],
      ["backlinks, newest", () => asMember.query(api.siteLinkLists.listBacklinks, { siteId: holdId, paginationOpts: page, sort: "newest" })],
      ["the site's header", () => asMember.query(api.sites.getMySite, { siteId: holdId })],
      ["the Sites list", () => asMember.query(api.sites.listMySites, {})],
    ];
    // Warm the functions up once, so module loading is not timed as reading.
    await timed[0][1]();
    const scan = await fastest(() => t.run(async (ctx) => (await ctx.db.query("siteKeywordRanks").collect()).length), 2);
    const fullScan = scan.took;
    expect(scan.result).toBe(50_000);

    const slow: string[] = [];
    for (const [name, run] of timed) {
      const { took, result } = await fastest(run, RUNS);
      expect(result).toBeDefined();
      if (took > fullScan * SHARE_OF_A_SCAN) slow.push(`${name}: ${Math.round(took)}ms against a ${Math.round(fullScan)}ms scan`);
    }
    expect(slow).toEqual([]);

    // A page is fifteen rows, however large the table.
    const first = await asMember.query(api.siteKeywords.listKeywords, { siteId: holdId, paginationOpts: page, sort: "traffic" });
    expect(first.page).toHaveLength(15);
    expect(first.page[0].traffic).toBeGreaterThanOrEqual(first.page[14].traffic ?? 0);
  }, 300_000);
});
