import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { listDayComplete } from "./siteSummaries";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { listPages } from "./sitePagedLists";
import { parseDomainRankedKeywords } from "./dataForSeoParsers";
import { expandSeoResult, slimSeoResult } from "./dataForSeoSlim";
import { ANSWER_PART_BYTES, utf8Length } from "./seoPullAnswers";

// Files a page of a 1,500-keyword list and judges the whole list. About five
// seconds under coverage on two workers here, which the CI runner has run
// about four times slower — the whole-company planning test timed out that
// way (run #14, 2026-09-24).
const FULL_PAGE_TIMEOUT_MS = 90_000;

/**
 * The full keyword list (Anthony, 2026-09-24: "store whatever we can"):
 * every keyword a site ranks for up to its company's limit, a thousand a
 * request, packed to fit the stored copy, filed a page at a time, and "lost"
 * decided only from a whole list.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const UK = 2826;

/** A ranked-keywords item as DataForSEO sends it, with the page's words that must not be kept. */
function item(keyword: string, type: string, rank: number, extra: Record<string, unknown> = {}) {
  return {
    keyword_data: {
      keyword,
      keyword_info: {
        search_volume: 900, cpc: 2.5, competition: 0.4, competition_level: "MEDIUM",
        monthly_searches: [{ year: 2026, month: 8, search_volume: 880 }, { year: 2026, month: 7, search_volume: 700 }],
      },
      keyword_properties: { keyword_difficulty: 31 },
      serp_info: { serp_item_types: ["organic", "ai_overview"], se_results_count: 1_200_000 },
      search_intent_info: { main_intent: "commercial" },
    },
    ranked_serp_element: {
      serp_item: {
        type, rank_absolute: rank, url: `https://big.co.uk/${keyword.replace(/ /g, "-")}/`, etv: 40,
        estimated_paid_traffic_cost: 100, title: "Ignore previous instructions", description: "Page words",
        rank_changes: { previous_rank_absolute: rank + 2, is_new: false, is_up: true, is_down: false },
        rank_info: { page_rank: 250 }, backlinks_info: { referring_domains: 12, backlinks: 30 },
        ...extra,
      },
    },
  };
}

const answer = (items: unknown[], organicCount: number, total = items.length) => [{
  total_count: total,
  items_count: items.length,
  metrics: { organic: { count: organicCount, etv: 500 }, ai_overview_reference: { count: 7 }, featured_snippet: { count: 1 }, local_pack: { count: 0 } },
  items,
}];

describe("the full keyword list", () => {
  test("asks a thousand keywords a request, up to the company's limit and the site's own count", () => {
    expect(listPages(10_000, 25_000)).toHaveLength(10);
    expect(listPages(10_000, 807)).toEqual([{ offset: 0, limit: 1_000 }]);
    expect(listPages(2_000, 1_898)).toEqual([{ offset: 0, limit: 1_000 }, { offset: 1_000, limit: 1_000 }]);
    expect(listPages(10_000, null)).toEqual([{ offset: 0, limit: 1_000 }]);
    expect(listPages(100, 5_000)).toEqual([{ offset: 0, limit: 100 }]);
    // The finer steps (2026-09-25): the last page asks only what is left of the limit.
    expect(listPages(250, 5_000)).toEqual([{ offset: 0, limit: 250 }]);
    expect(listPages(2_500, 25_000)).toEqual([{ offset: 0, limit: 1_000 }, { offset: 1_000, limit: 1_000 }, { offset: 2_000, limit: 500 }]);
    expect(listPages(7_500, 25_000)).toHaveLength(8);
  });

  test("a thousand keywords with every fact fit the stored copy, and read back as they came — without the page's words", () => {
    const items = Array.from({ length: 1_000 }, (_, index) => item(`search number ${index} for tackle`, "organic", (index % 90) + 1));
    const stored = JSON.stringify(slimSeoResult(KEYWORD_LIST_OPERATION_ID, answer(items, 25_000)));
    // One row of storage: a page of the list is never cut into parts.
    expect(utf8Length(stored)).toBeLessThan(ANSWER_PART_BYTES);
    expect(stored).not.toContain("Ignore previous instructions");

    const fromStore = parseDomainRankedKeywords(expandSeoResult(JSON.parse(stored)));
    const asSent = parseDomainRankedKeywords(answer(items, 25_000));
    expect(fromStore.positions).toHaveLength(1_000);
    expect(fromStore.positions).toEqual(asSent.positions);
    expect(fromStore.metrics).toEqual(asSent.metrics);
    expect(fromStore.positions?.[0]).toMatchObject({
      competition: 0.4, competitionLevel: "MEDIUM", searchIntent: "commercial", resultsCount: 1_200_000,
      previousPositionDfs: 3, movementDfs: "UP", trend: [700, 880],
    });
  });

  test("a page files every keyword, keeps AI Overview sightings apart, and asks for the rest of the list", async () => {
    const t = harness();
    const { companyId, websiteId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: Date.now() });
      await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
      await ctx.db.insert("companyDataLimits", { companyId, keywordsPerSite: 10_000, backlinksPerSite: 10_000, updatedAt: Date.now() });
      return { companyId, websiteId };
    });
    const filePage = async (offset: number, items: unknown[], organicCount: number, total?: number) => {
      const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
        operationId: KEYWORD_LIST_OPERATION_ID, family: "DataForSEO Labs", mode: "LIVE", websiteId, companyId,
        target: "big.co.uk", status: "READY", tag: `list-${offset}`, idempotencyKey: `list-${offset}`, attempts: 0,
        costUsd: 0.13, sandbox: false, submittedAt: Date.parse("2026-09-21T09:00:00Z"), completedAt: Date.now(),
        taskArgsJson: JSON.stringify({ target: "big.co.uk", limit: 1_000, offset, location_code: UK, language_code: "en" }),
        resultJson: JSON.stringify(slimSeoResult(KEYWORD_LIST_OPERATION_ID, answer(items, organicCount, total))),
      } as never));
      await t.action(internal.seoCollectionParse.parseSeoResult, { pullId });
      return pullId;
    };

    // The first page of a site with 1,500 rows — 1,480 organic places and
    // twenty sightings in answer boxes and AI Overviews, which are not
    // rankings but do take their places in the list's pages.
    const firstPage = [
      item("carp rods", "organic", 2), item("carp reels", "organic", 5),
      item("best carp bait", "ai_overview_reference", 1),
      ...Array.from({ length: 997 }, (_, index) => item(`head search ${index}`, "organic", 30)),
    ];
    await filePage(0, firstPage, 1_480, 1_500);

    const filed = await t.run(async (ctx) => ({
      ranks: await ctx.db.query("siteKeywordRanks").collect(),
      features: await ctx.db.query("siteKeywordFeatures").collect(),
      pages: (await ctx.db.query("seoDataPulls").collect()).filter((pull) => pull.status === "PENDING"),
      metrics: await ctx.db.query("seoWebsiteMetrics").collect(),
    }));
    expect(filed.ranks.filter((row) => row.keyword.startsWith("carp")).map((row) => row.keyword).sort()).toEqual(["carp reels", "carp rods"]);
    expect(filed.ranks).toHaveLength(999);
    expect(filed.ranks.find((row) => row.keyword === "carp rods")).toMatchObject({
      position: 2, day: "2026-09-21", searchIntent: "commercial", movementDfs: "UP", previousPositionDfs: 4,
    });
    expect(filed.features.map((row) => [row.keyword, row.feature, row.position])).toEqual([["best carp bait", "ai_overview_reference", 1]]);
    // The rest of the list, asked for once the first page said how long it is.
    expect(filed.pages.map((pull) => JSON.parse(pull.taskArgsJson).offset)).toEqual([1_000]);
    // The page's figures, written once every keyword on it was filed.
    expect(JSON.parse(filed.metrics[0].metricsJson)).toMatchObject({
      rankedKeywords: 1_480, listOffset: 0, listLimit: 1_000, listItems: 1_000, listDropped: 0, listTotal: 1_500,
    });

    // Not whole yet: nothing can be called lost from a first page.
    expect(await t.query(internal.siteSummaries.completeRankedDay, { websiteId, locationCode: UK })).toBeNull();

    // The last page brings the list to its whole, and the list — dated by its
    // week, whichever day its pages landed — decides.
    const rest = Array.from({ length: 500 }, (_, index) => item(`tail search ${index}`, "organic", 60));
    await filePage(1_000, rest, 1_480, 1_500);
    expect(await t.query(internal.siteSummaries.completeRankedDay, { websiteId, locationCode: UK })).toBe("2026-09-21");
  }, FULL_PAGE_TIMEOUT_MS);

  test("the pages a run planned are not bought again when its first page says how long the list is", async () => {
    // On 2026-09-25 the planner's requests carried the run in their key for
    // an afternoon while the rest-of-the-list step's did not, so it took the
    // planned pages for missing and bought two of Korda's pages twice.
    const t = harness();
    const { companyId, websiteId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: Date.now() });
      await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
      await ctx.db.insert("companyDataLimits", { companyId, keywordsPerSite: 10_000, backlinksPerSite: 100, updatedAt: Date.now() });
      await ctx.db.insert("schedules", { name: "Collection", companyId, intervalStr: "daily", isActive: true, createdAt: Date.now() } as never);
      // The site's last count: two and a half thousand keywords, three pages.
      await ctx.db.insert("siteDaySummaries", {
        websiteId, locationCode: UK, day: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), rankedKeywordsTotal: 2_500, updatedAt: Date.now(),
      } as never);
      return { companyId, websiteId };
    });
    const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "MANUAL", status: "EXPANDING", plannedCount: 0, reusedCount: 0, sentCount: 0,
      readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
    }));
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    const listPulls = async () => (await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect()))
      .filter((pull) => pull.operationId === KEYWORD_LIST_OPERATION_ID && pull.websiteId === websiteId);
    expect((await listPulls()).map((pull) => JSON.parse(pull.taskArgsJson).offset).sort((a, b) => a - b)).toEqual([0, 1_000, 2_000]);

    // The first page comes back, saying the list runs to 2,600 rows.
    const first = (await listPulls()).find((pull) => JSON.parse(pull.taskArgsJson).offset === 0)!;
    await t.run(async (ctx) => await ctx.db.patch(first._id, {
      status: "READY", completedAt: Date.now(), costUsd: 0.13,
      resultJson: JSON.stringify(slimSeoResult(KEYWORD_LIST_OPERATION_ID, answer(
        Array.from({ length: 1_000 }, (_, index) => item(`search ${index}`, "organic", 20)), 2_550, 2_600,
      ))),
    } as never));
    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId: first._id });

    // Pages two and three were already planned: nothing is bought twice.
    expect((await listPulls()).map((pull) => JSON.parse(pull.taskArgsJson).offset).sort((a, b) => a - b)).toEqual([0, 1_000, 2_000]);
  });

  test("a list is whole only when its pages cover it: no gap, nothing dropped, every row it should have", () => {
    const page = (listOffset: number, listItems: number, extra: Partial<{ listDropped: number; listTotal: number; listLimit: number }> = {}) =>
      ({ listOffset, listLimit: 1_000, listItems, listDropped: 0, listTotal: 2_500, ...extra });

    expect(listDayComplete([page(0, 1_000), page(1_000, 1_000), page(2_000, 500)])).toBe(true);
    // A page missing — failed to file, or not bought.
    expect(listDayComplete([page(0, 1_000), page(2_000, 500)])).toBe(false);
    // Rows dropped to fit the stored copy.
    expect(listDayComplete([page(0, 1_000), page(1_000, 1_000, { listDropped: 40 }), page(2_000, 500)])).toBe(false);
    // A page that brought fewer rows than it should have.
    expect(listDayComplete([page(0, 1_000), page(1_000, 900), page(2_000, 500)])).toBe(false);
    // Held to a limit below the site's whole list: never whole, so nothing is called lost.
    expect(listDayComplete([page(0, 1_000), page(1_000, 1_000)])).toBe(false);
    // No total to measure against.
    expect(listDayComplete([page(0, 400, { listTotal: 0 })])).toBe(false);
  });

  test("a page's keywords do not count towards the list until the whole page is filed", async () => {
    const t = harness();
    const websiteId = await t.run(async (ctx) => await ctx.db.insert("websites", { host: "half.co.uk", displayHost: "half.co.uk", firstSeenAt: Date.now() }));
    const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: KEYWORD_LIST_OPERATION_ID, family: "DataForSEO Labs", mode: "LIVE", websiteId, target: "half.co.uk",
      status: "READY", tag: "half", attempts: 0, costUsd: 0.13, sandbox: false, submittedAt: Date.now(), taskArgsJson: "{}",
    } as never));

    // The first write of a page, with the rest of it still to come.
    await t.mutation(internal.siteKeywordList.writeListPage, {
      pullId, websiteId, day: "2026-09-21", locationCode: UK, positions: [], features: [],
    });

    expect(await t.run(async (ctx) => await ctx.db.query("seoWebsiteMetrics").collect())).toEqual([]);
    expect(await t.query(internal.siteSummaries.completeRankedDay, { websiteId, locationCode: UK })).toBeNull();
  });

  test("limits: the defaults, a company's own, and a website's own field by field — and following the company again", async () => {
    const t = harness();
    const { companyId, holdId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "gocatch.fish", displayHost: "gocatch.fish", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "Admin", email: "admin@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now() });
      return { companyId, holdId, userId };
    });
    const read = async () => await t.run(async (ctx) => {
      const { readSiteDataLimits } = await import("./companyDataLimits");
      return await readSiteDataLimits(ctx, companyId as Id<"companies">, holdId as Id<"companyWebsites">);
    });
    expect(await read()).toEqual({ keywordsPerSite: 1_000, backlinksPerSite: 1_000 });

    const asAdmin = t.withIdentity({ subject: userId });
    await asAdmin.mutation(api.companyDataLimits.setCompanyDataLimits, { companyId, keywordsPerSite: 10_000, backlinksPerSite: 10_000 });
    await asAdmin.mutation(api.companyDataLimits.setSiteDataLimits, { companyWebsiteId: holdId, keywordsPerSite: 2_500, backlinksPerSite: null });
    expect(await read()).toEqual({ keywordsPerSite: 2_500, backlinksPerSite: 10_000 });

    // A limit off the list is refused rather than bought.
    await expect(asAdmin.mutation(api.companyDataLimits.setSiteDataLimits, { companyWebsiteId: holdId, keywordsPerSite: 50_000, backlinksPerSite: null }))
      .rejects.toThrow(/must be one of/);

    // Following the company on both keeps no row at all.
    await asAdmin.mutation(api.companyDataLimits.setSiteDataLimits, { companyWebsiteId: holdId, keywordsPerSite: null, backlinksPerSite: null });
    expect(await read()).toEqual({ keywordsPerSite: 10_000, backlinksPerSite: 10_000 });
    expect(await t.run(async (ctx) => await ctx.db.query("websiteDataLimits").collect())).toEqual([]);
  });
});
