import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { clearUnreadColumns, UNREAD_COLUMNS } from "./unreadColumnsMigration";

/**
 * The columns written and never read are cleared from the rows already held
 * (docs/plans/active/keep-less-history-plan.md, 5.6), table by table, before
 * they leave the schema: only those columns go, everything else on the row
 * stays, and a second run changes nothing.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const DAY = "2026-10-05";

async function rowsWithEveryColumn(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "domain_ranked_keywords_list", family: "DataForSEO Labs", mode: "LIVE", tag: "test", attempts: 0, costUsd: 0,
      sandbox: false, submittedAt: Date.now(), status: "READY", taskArgsJson: "{}",
    } as never);
    const rank = await ctx.db.insert("siteKeywordRanks", {
      websiteId, locationCode: 2826, keyword: "brass door handles", position: 4, band: "p04_10", page: "/brass/", volume: 880,
      volumeKnown: true, intent: "BUYING", status: "UP", change: 2, day: DAY, firstSeenDay: DAY,
      competitionLevel: "HIGH", searchText: "brass door handles /brass/", updatedAt: 1, competition: 0.8, previousPositionDfs: 6, movementDfs: "UP",
    });
    const page = await ctx.db.insert("sitePageRanks", {
      websiteId, locationCode: 2826, page: "/brass/", url: "https://acme-shop.test/brass/", section: "/brass/", keywords: 3,
      bestPosition: 4, top3: 0, topKeyword: "brass door handles", topKeywordVolume: 880, firstSeenDay: DAY, day: DAY, rebuildId: "r1",
      volumeSum: 1_200, searchText: "/brass/ brass door handles", updatedAt: 1,
    });
    const feature = await ctx.db.insert("siteKeywordFeatures", {
      websiteId, locationCode: 2826, keyword: "brass door handles", feature: "featured_snippet", position: 1, page: "/brass/", day: DAY,
      pullId, url: "https://acme-shop.test/brass/", updatedAt: 1,
    });
    const holdPage = await ctx.db.insert("holdPages", {
      companyWebsiteId: holdId, page: "/brass/", crawled: true, shown: true, clicks: 12, ranks: true, builtAt: 1,
    });
    const sitemapPage = await ctx.db.insert("siteSitemapPages", { websiteId, page: "/brass/", file: "product-sitemap.xml", readAt: 1, day: DAY });
    return { rank, page, feature, holdPage, sitemapPage };
  });
}

/** Run the clear-out to its end, a few rows a step, as the migration's batches do. */
async function clearAll(t: Harness): Promise<number> {
  let cursor: string | null = null;
  let updated = 0;
  for (let steps = 0; steps < 50; steps += 1) {
    const step = await t.run(async (ctx) => await clearUnreadColumns(ctx, cursor, 2));
    updated += step.updated;
    if (step.isDone) return updated;
    cursor = step.cursor;
  }
  throw new Error("The clear-out did not finish.");
}

describe("clearing the columns nobody reads", () => {
  test("each table's unread columns go, and nothing else on the row", async () => {
    const t = harness();
    const ids = await rowsWithEveryColumn(t);
    expect(await clearAll(t)).toBe(5);

    const rows = await t.run(async (ctx) => ({
      rank: await ctx.db.get(ids.rank),
      page: await ctx.db.get(ids.page),
      feature: await ctx.db.get(ids.feature),
      holdPage: await ctx.db.get(ids.holdPage),
      sitemapPage: await ctx.db.get(ids.sitemapPage),
    }));
    const byTable = { siteKeywordRanks: rows.rank, sitePageRanks: rows.page, siteKeywordFeatures: rows.feature, holdPages: rows.holdPage, siteSitemapPages: rows.sitemapPage };
    for (const { table, fields } of UNREAD_COLUMNS) {
      for (const field of fields) expect(byTable[table]).not.toHaveProperty(field);
    }
    expect(rows.rank).toMatchObject({ keyword: "brass door handles", position: 4, competitionLevel: "HIGH", change: 2 });
    expect(rows.page).toMatchObject({ page: "/brass/", keywords: 3, topKeyword: "brass door handles" });
    expect(rows.feature).toMatchObject({ feature: "featured_snippet", page: "/brass/", day: DAY });
    expect(rows.holdPage).toMatchObject({ page: "/brass/", clicks: 12 });
    expect(rows.sitemapPage).toMatchObject({ page: "/brass/", file: "product-sitemap.xml", readAt: 1 });
  });

  test("a second run changes nothing", async () => {
    const t = harness();
    await rowsWithEveryColumn(t);
    await clearAll(t);
    expect(await clearAll(t)).toBe(0);
  });
});
