import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { packRankFacts } from "./siteRankings";
import { keywordCopyTuple } from "./siteKeywordCopy";
import { featuresOf, trendOf } from "./utils/rankFacts";

/**
 * Ranking rows kept before 2026-10-08 — months of searches and results-page
 * features as lists, a difficulty band stored — packed in place
 * (`2026-10-08-pack-rank-facts`), reading back exactly as before.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("ranking rows kept before, packed", () => {
  test("read back the same, their band worked out from their difficulty, and a second run changes nothing", async () => {
    const t = harness();
    const trend = [100, 120, 90, 0, 40, 1_000, 2_400, 18, 5, 70, 330, 12];
    const features = ["related_searches", "people_also_ask", "video"];
    const ids = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const row = {
        websiteId, locationCode: 2826, position: 4, band: "p04_10" as const, page: "/levers/", volume: 880, volumeKnown: true,
        intent: "BUYING" as const, status: "SAME" as const, change: 0, day: "2026-10-01", firstSeenDay: "2026-01-01",
      };
      return [
        await ctx.db.insert("siteKeywordRanks", { ...row, keyword: "brass levers", difficulty: 42, kdBand: "kd31_70", trend, serpFeatures: features }),
        await ctx.db.insert("siteKeywordRanks", { ...row, keyword: "door knobs", serpFeatures: ["images", "brand_new_kind"] }),
        await ctx.db.insert("siteKeywordRanks", { ...row, keyword: "sash locks" }),
      ];
    });
    const copyBefore = await t.run(async (ctx) => await Promise.all(ids.map(async (id) => keywordCopyTuple((await ctx.db.get(id))!))));

    const run = () => t.run(async (ctx) => await packRankFacts(ctx, null, 100));
    expect(await run()).toMatchObject({ processed: 3, updated: 1, isDone: true });
    const packed = await t.run(async (ctx) => await Promise.all(ids.map(async (id) => (await ctx.db.get(id))!)));
    expect(await run()).toMatchObject({ updated: 0 });

    expect(typeof packed[0].trend).toBe("string");
    expect(typeof packed[0].serpFeatures).toBe("string");
    expect(packed[0].kdBand).toBeUndefined();
    expect(trendOf(packed[0].trend)).toEqual(trend);
    expect(featuresOf(packed[0].serpFeatures)).toEqual(features);
    // A feature not known keeps the row's list as names.
    expect(packed[1].serpFeatures).toEqual(["images", "brand_new_kind"]);
    expect(packed[2]).not.toHaveProperty("trend");
    // The compact copy the Keywords screens filter by difficulty from is the same.
    expect(packed.map((row) => keywordCopyTuple(row))).toEqual(copyBefore);
  });
});
