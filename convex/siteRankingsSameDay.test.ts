import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { fileKeywordRank } from "./siteRankings";

/**
 * Two checks of one search on one day (insights-intelligence-plan.md phase 6):
 * the better place is the one the website holds, and the page kept is the
 * page that holds it — never the worse check's page beside the better place.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("one search checked twice on one day", () => {
  test("the better place keeps its own page", async () => {
    const t = harness();
    const row = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const sighting = { websiteId, locationCode: 2826, keyword: "brass levers", day: "2026-10-01", host: "acme-shop.test" };
      await fileKeywordRank(ctx, { ...sighting, position: 4, url: "https://acme-shop.test/levers/" });
      await fileKeywordRank(ctx, { ...sighting, position: 12, url: "https://acme-shop.test/hub/levers-guide/" });
      return await ctx.db.query("siteKeywordRanks").first();
    });
    expect(row).toMatchObject({ position: 4, page: "/levers/" });
  });

  test("a better place found later in the day brings its page", async () => {
    const t = harness();
    const row = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const sighting = { websiteId, locationCode: 2826, keyword: "brass levers", day: "2026-10-01", host: "acme-shop.test" };
      await fileKeywordRank(ctx, { ...sighting, position: 12, url: "https://acme-shop.test/hub/levers-guide/" });
      await fileKeywordRank(ctx, { ...sighting, position: 4, url: "https://acme-shop.test/levers/" });
      return await ctx.db.query("siteKeywordRanks").first();
    });
    expect(row).toMatchObject({ position: 4, page: "/levers/" });
  });
});
