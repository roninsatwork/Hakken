import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { parseDomainRankedKeywords } from "./dataForSeoParsers";
import { isCrawlUnfinished } from "./dataForSeoCrawlOperations";
import { findSeoOperation, seoSiteOperationParams } from "./dataForSeoRegistry";
import { parseCrawlSummary } from "./siteCrawl";

/**
 * Phase 5 of the Sites plan: paid search, read from the ranked-keywords
 * answers already bought, and the site crawl behind the Site audit.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now(),
    }));
  return t.withIdentity({ subject: userId });
}

async function hold(t: Harness, companyId: Id<"companies">, host: string) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
    return { websiteId, holdId };
  });
}

async function file(t: Harness, websiteId: Id<"websites">, operationId: string, result: unknown, day: string) {
  const when = Date.parse(`${day}T10:00:00Z`);
  const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId, family: "DataForSEO Labs", mode: "LIVE", websiteId, target: "advertiser.co.uk",
    taskArgsJson: JSON.stringify({ location_code: UK }), status: "READY", tag: `t-${Math.random()}`, attempts: 0,
    costUsd: 0.02, sandbox: false, submittedAt: when, completedAt: when, resultJson: JSON.stringify(result),
  } as never));
  await t.action(internal.seoCollectionParse.parseSeoResult, { pullId });
  return pullId;
}

const ranked = (keyword: string, type: "organic" | "paid", extra: Record<string, unknown> = {}) => ({
  keyword_data: { keyword, keyword_info: { search_volume: 500, cpc: 3.5 } },
  ranked_serp_element: { serp_item: { type, rank_absolute: 1, url: "https://advertiser.co.uk/offer", etv: 40, estimated_paid_traffic_cost: 140, ...extra } },
});

describe("paid search", () => {
  test("an advert is never read as a ranking: it is kept apart, as paid search", () => {
    const parsed = parseDomainRankedKeywords([{
      total_count: 2,
      metrics: { organic: { etv: 10 }, paid: { count: 1, etv: 40, estimated_paid_traffic_cost: 140 }, featured_snippet: { count: 3 }, ai_overview_reference: { count: 7 } },
      items: [ranked("plumber leeds", "organic"), ranked("emergency plumber", "paid")],
    }]);
    expect(parsed.positions?.map((row) => row.keyword)).toEqual(["plumber leeds"]);
    expect(parsed.paidPositions).toEqual([{ keyword: "emergency plumber", position: 1, url: "https://advertiser.co.uk/offer", searchVolume: 500, cpc: 3.5, traffic: 40, trafficCost: 140 }]);
    expect(parsed.metrics).toMatchObject({ paidKeywords: 1, paidTraffic: 40, paidTrafficCost: 140, featuredSnippets: 3, aiOverviewRefs: 7, localPacks: null });
    // The site's ranked total is its organic searches, not its adverts too.
    const counted = parseDomainRankedKeywords([{
      total_count: 2, metrics: { organic: { count: 1, etv: 10 }, paid: { count: 1 } },
      items: [ranked("plumber leeds", "organic"), ranked("emergency plumber", "paid")],
    }]);
    expect(counted.metrics).toMatchObject({ rankedKeywords: 1, returnedKeywords: 1 });
    // A results-page feature the site appears in is counted, never filed as a ranking.
    const withFeatures = parseDomainRankedKeywords([{
      total_count: 3,
      metrics: { organic: { count: 1 }, ai_overview_reference: { count: 4 }, featured_snippet: { count: 2 }, local_pack: { count: 1 } },
      items: [ranked("plumber leeds", "organic"), ranked("plumber near me", "ai_overview_reference" as never), ranked("boiler repair", "local_pack" as never)],
    }]);
    expect(withFeatures.positions?.map((row) => row.keyword)).toEqual(["plumber leeds"]);
    expect(withFeatures.metrics).toMatchObject({ aiOverviewRefs: 4, featuredSnippets: 2, localPacks: 1, returnedKeywords: 1 });
  });

  test("the paid list is the newest answer's, and an older answer filed again cannot bring stopped adverts back", async () => {
    const t = harness();
    const acme = await company(t, "Acme");
    const own = await hold(t, acme, "advertiser.co.uk");
    const older = await file(t, own.websiteId, "domain_ranked_keywords", [{ items: [ranked("old advert", "paid")] }], "2026-09-01");
    await file(t, own.websiteId, "domain_ranked_keywords", [{ items: [ranked("new advert", "paid"), ranked("organic search", "organic")] }], "2026-09-08");
    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId: older });

    const asAcme = await member(t, acme);
    const list = await asAcme.query(api.sitePaid.listPaidKeywords, { siteId: own.holdId, page: 1, rows: 25 });
    expect(list.rows.map((row) => [row.keyword, row.page, row.trafficCost, row.day])).toEqual([["new advert", "/offer", 140, "2026-09-08"]]);
    // The organic search is a ranking, and only a ranking.
    const ranks = await t.run(async (ctx) => await ctx.db.query("siteKeywordRanks").collect());
    expect(ranks.map((row) => row.keyword)).toEqual(["organic search"]);
  });
});

describe("paid search, when the adverts stop", () => {
  test("an answer with no adverts ends the list, and an older answer filed again cannot bring them back", async () => {
    const t = harness();
    const acme = await company(t, "Acme");
    const own = await hold(t, acme, "advertiser.co.uk");
    const older = await file(t, own.websiteId, "domain_ranked_keywords", [{ items: [ranked("old advert", "paid")] }], "2026-09-01");
    await file(t, own.websiteId, "domain_ranked_keywords", [{ items: [ranked("organic search", "organic")] }], "2026-09-08");
    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId: older });

    const list = await (await member(t, acme)).query(api.sitePaid.listPaidKeywords, { siteId: own.holdId, page: 1, rows: 25 });
    expect(list.rows).toEqual([]);
  });
});

describe("the site crawl", () => {
  const summary = (progress: string) => [{
    crawl_progress: progress,
    crawl_status: { max_crawl_pages: 100, pages_in_queue: 0, pages_crawled: 64 },
    domain_info: { cms: "WordPress 6.6", server: "nginx", crawl_end: "2026-09-23 21:10:00 +00:00" },
    page_metrics: {
      links_internal: 900, links_external: 120, broken_links: 3, duplicate_title: 2, onpage_score: 88.4,
      checks: { no_title: 1, no_description: 5, is_https: 64, seo_friendly_url: 60, no_image_alt: 0 },
    },
  }];

  test("a crawl reads up to a thousand pages (2026-09-24): a hundred stopped short on ronins.co.uk", () => {
    expect(seoSiteOperationParams(findSeoOperation("site_crawl")!, "ronins.co.uk")).toEqual({
      target: "ronins.co.uk", max_crawl_pages: 1000,
    });
  });

  test("a crawl still running is not an answer yet; a finished one keeps only the problems", () => {
    expect(isCrawlUnfinished("site_crawl", summary("in_progress"))).toBe(true);
    expect(isCrawlUnfinished("site_crawl", summary("finished"))).toBe(false);
    expect(isCrawlUnfinished("backlinks_summary", summary("in_progress"))).toBe(false);
    expect(parseCrawlSummary(summary("in_progress"))).toBeNull();
    const parsed = parseCrawlSummary(summary("finished"));
    expect(parsed).toMatchObject({ pagesCrawled: 64, maxPages: 100, onPageScore: 88.4, cms: "WordPress 6.6", crawlEnd: "2026-09-23" });
    // Good news ("is https") and checks nothing failed are not problems.
    expect(parsed?.issues).toEqual([
      { check: "no_description", pages: 5 },
      { check: "broken_links", pages: 3 },
      { check: "duplicate_title", pages: 2 },
      { check: "no_title", pages: 1 },
    ]);
  });

  test("a filed crawl feeds the Site audit and the day summaries", async () => {
    const t = harness();
    const acme = await company(t, "Acme");
    const own = await hold(t, acme, "advertiser.co.uk");
    await file(t, own.websiteId, "site_crawl", summary("finished"), "2026-09-23");

    const asAcme = await member(t, acme);
    const audit = await asAcme.query(api.siteCrawl.siteAudit, { siteId: own.holdId });
    expect(audit).toMatchObject({ day: "2026-09-23", pagesCrawled: 64, onPageScore: 88.4, cms: "WordPress 6.6" });
    expect(audit?.issues.map((issue) => [issue.check, issue.severity])).toEqual([
      ["no_description", "WARNING"], ["broken_links", "ERROR"], ["duplicate_title", "WARNING"], ["no_title", "ERROR"],
    ]);
    const days = await t.run(async (ctx) => await ctx.db.query("siteDaySummaries").collect());
    expect(days).toEqual([expect.objectContaining({ day: "2026-09-23", crawledPages: 64, onPageScore: 88 })]);
  });

  test("another company's site answers not found, for paid search and the audit alike", async () => {
    const t = harness();
    const acme = await company(t, "Acme");
    const other = await company(t, "Someone Else");
    await hold(t, acme, "advertiser.co.uk");
    const theirs = await hold(t, other, "theirs.co.uk");
    const asAcme = await member(t, acme);
    await expect(asAcme.query(api.siteCrawl.siteAudit, { siteId: theirs.holdId })).rejects.toThrow(/not one your company holds/);
    await expect(asAcme.query(api.sitePaid.listPaidKeywords, { siteId: theirs.holdId, page: 1, rows: 25 }))
      .rejects.toThrow(/not one your company holds/);
  });
});
