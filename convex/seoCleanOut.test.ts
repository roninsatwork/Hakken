import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { COMPETITOR_KEYWORDS_KEPT } from "./seoCleanOut";

/**
 * What competitors no longer have collected, cleared across every website on
 * the platform (docs/plans/active/finish-off-plan.md, item 12): counted first
 * without a change, then removed — never from a website any company owns,
 * even one another company watches as a competitor.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;
const DAY = "2026-10-01";

/** Everything DataForSEO files for a website, a row or so of each. */
async function collected(t: Harness, websiteId: Id<"websites">, keywordRanks: number) {
  await t.run(async (ctx) => {
    const pull = async (operationId: string, taskArgs: Record<string, unknown> = {}) => await ctx.db.insert("seoDataPulls", {
      operationId, family: "DataForSEO Labs", mode: "LIVE", taskArgsJson: JSON.stringify(taskArgs), status: "READY",
      tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.02, sandbox: false, submittedAt: Date.now(), websiteId,
    } as never);
    const crawl = await pull("site_crawl");
    await ctx.db.insert("siteCrawls", { websiteId, pullId: crawl, day: DAY, pagesCrawled: 1, issues: [], createdAt: 1 } as never);
    await ctx.db.insert("siteCrawlPages", { websiteId, pullId: crawl, day: DAY, url: "https://x.test/", page: "/", problems: [] } as never);
    await ctx.db.insert("siteCrawlLinks", { websiteId, pullId: crawl, day: DAY, from: "https://x.test/", fromPage: "/", to: "https://x.test/gone" } as never);
    await ctx.db.insert("siteDaySummaries", { websiteId, locationCode: UK, day: DAY, crawledPages: 1, onPageScore: 90, updatedAt: 1 } as never);
    const links = await pull("backlinks_all");
    await ctx.db.insert("siteBacklinks", {
      websiteId, pass: "ALL", pullId: links, day: DAY, domainFrom: "a.test", urlFrom: "https://a.test/", urlTo: "https://x.test/", pageTo: "/",
      dofollow: true, status: "LIVE", isBroken: false, domainRank: 1, searchText: "a.test",
    } as never);
    await ctx.db.insert("siteAnchors", { websiteId, pullId: links, day: DAY, anchor: "x", rank: 1, backlinks: 1, referringDomains: 1, status: "LIVE" } as never);
    await ctx.db.insert("siteReferringIps", { websiteId, pullId: links, day: DAY, ip: "1.2.3.4", subnet: "1.2.3", rank: 1, backlinks: 1, referringDomains: 1, status: "LIVE", searchText: "1.2.3.4" } as never);
    await ctx.db.insert("siteReferringSubnets", { websiteId, pullId: links, subnet: "1.2.3", ips: 1, backlinks: 1, referringDomains: 1 } as never);
    await ctx.db.insert("siteLinkDays", {
      websiteId, day: DAY, newBacklinks: 1, lostBacklinks: 0, newReferringDomains: 1, lostReferringDomains: 0, newMainDomains: 0, lostMainDomains: 0, updatedAt: 1,
    });
    // Kept for a competitor: its linking websites, and its link and keyword totals.
    const domains = await pull("referring_domains_list");
    await ctx.db.insert("siteReferringDomains", { websiteId, pullId: domains, day: DAY, domain: "a.test", rank: 1, backlinks: 1, status: "LIVE" } as never);
    for (const operationId of ["backlinks_all", "backlinks_summary", "domain_competitors"]) {
      await ctx.db.insert("seoWebsiteMetrics", { websiteId, day: DAY, operationId, pullId: links, metricsJson: "{}", locationCode: UK, createdAt: 1 } as never);
    }
    // The keyword list: its first page kept, its second gone.
    for (const offset of [0, COMPETITOR_KEYWORDS_KEPT]) {
      const page = await pull("domain_ranked_keywords_list", { offset, limit: COMPETITOR_KEYWORDS_KEPT });
      await ctx.db.insert("siteKeywordFeatures", { websiteId, locationCode: UK, keyword: `kw ${offset}`, feature: "featured_snippet", day: DAY, pullId: page } as never);
    }
    for (let index = 0; index < keywordRanks; index += 1) {
      await ctx.db.insert("siteKeywordRanks", {
        websiteId, locationCode: UK, keyword: `kw ${index}`, band: "p04_10", intent: "BUYING", status: "SAME", page: "/", volume: 10, volumeKnown: true, change: 0, day: DAY, firstSeenDay: DAY,
        traffic: keywordRanks - index,
      } as never);
    }
  });
}

async function setup() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("companies", { name: "Owner", createdAt: 1 });
    const watcher = await ctx.db.insert("companies", { name: "Watcher", createdAt: 1 });
    const own = await ctx.db.insert("websites", { host: "own.test", displayHost: "own.test", firstSeenAt: 1 });
    const rival = await ctx.db.insert("websites", { host: "rival.test", displayHost: "rival.test", firstSeenAt: 1 });
    await ctx.db.insert("companyWebsites", { companyId: owner, websiteId: own, relationship: "OWNED", createdAt: 1 });
    // own.test is watched as a competitor by another company: still never touched.
    await ctx.db.insert("companyWebsites", { companyId: watcher, websiteId: own, relationship: "TRACKED", createdAt: 1 });
    const rivalHold = await ctx.db.insert("companyWebsites", { companyId: owner, websiteId: rival, relationship: "TRACKED", againstWebsiteId: own, createdAt: 1 });
    await ctx.db.insert("discoveredCompetitors", { companyWebsiteId: rivalHold, companyId: owner, host: "other.test", intersections: 1, discoveredAt: 1 } as never);
    return { own, rival };
  });
  await collected(t, ids.own, 3);
  await collected(t, ids.rival, COMPETITOR_KEYWORDS_KEPT + 2);
  return { t, ...ids };
}

/** What a website holds, table by table. */
async function heldBy(t: Harness, websiteId: Id<"websites">) {
  return await t.run(async (ctx) => {
    const count = async (table: "siteCrawls" | "siteCrawlPages" | "siteCrawlLinks" | "siteBacklinks" | "siteAnchors" | "siteReferringIps" | "siteReferringSubnets" | "siteLinkDays" | "siteReferringDomains" | "seoWebsiteMetrics" | "siteKeywordFeatures" | "siteKeywordRanks") =>
      (await ctx.db.query(table).collect()).filter((row) => (row as { websiteId?: Id<"websites"> }).websiteId === websiteId).length;
    return {
      crawls: await count("siteCrawls") + await count("siteCrawlPages") + await count("siteCrawlLinks"),
      crawlFigures: (await ctx.db.query("siteDaySummaries").collect()).filter((row) => row.websiteId === websiteId && row.crawledPages !== undefined).length,
      links: await count("siteBacklinks") + await count("siteAnchors") + await count("siteReferringIps") + await count("siteReferringSubnets") + await count("siteLinkDays"),
      linkingWebsites: await count("siteReferringDomains"),
      metrics: (await ctx.db.query("seoWebsiteMetrics").collect()).filter((row) => row.websiteId === websiteId).map((row) => row.operationId).sort(),
      features: await count("siteKeywordFeatures"),
      ranks: await count("siteKeywordRanks"),
    };
  });
}

describe("clearing out what competitors no longer have collected", () => {
  test("counts first, then removes it from the competitor alone", async () => {
    const { t, own, rival } = await setup();
    const before = await heldBy(t, own);

    const counted = await t.action(internal.seoCleanOut.cleanOutCompetitors, { go: false });
    expect(counted?.websites).toBe(1);
    expect(counted?.tally).toMatchObject({
      crawls: 1, crawlPages: 1, crawlLinks: 1, crawlFigures: 1, backlinks: 1, anchors: 1, ips: 1, subnets: 1, linkDays: 1,
      metrics: 2, keywordPages: 1, keywordRanks: 2, discovery: 1,
    });
    expect(await heldBy(t, rival)).toMatchObject({ crawls: 3, links: 5, ranks: COMPETITOR_KEYWORDS_KEPT + 2 });

    await t.action(internal.seoCleanOut.cleanOutCompetitors, { go: true });

    expect(await heldBy(t, rival)).toEqual({
      crawls: 0,
      crawlFigures: 0,
      links: 0,
      linkingWebsites: 1,
      metrics: ["backlinks_summary"],
      features: 1,
      ranks: COMPETITOR_KEYWORDS_KEPT,
    });
    expect(await heldBy(t, own)).toEqual(before);
    expect(await t.run(async (ctx) => (await ctx.db.query("discoveredCompetitors").collect()).length)).toBe(0);

    // A second run finds nothing left.
    const again = await t.action(internal.seoCleanOut.cleanOutCompetitors, { go: false });
    expect(again?.lines).toEqual(["All 1 competitor websites: nothing to clear."]);
  });
});
