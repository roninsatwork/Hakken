import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { askDifficultyFor, difficultiesOf, parseKeywordDifficulty } from "./searchVolumes";

/**
 * How hard a search is (searchVolumes.ts; insights-one-voice-plan.md,
 * Anthony: "use what we have and the handful of keywords we need to get"):
 * the monthly ranking collection's difficulty where it holds one, else one
 * bought, and only the missing bought, once a month.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function website(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    // The monthly collection already holds "mobile app developers".
    await ctx.db.insert("siteKeywordRanks", {
      websiteId, locationCode: 2826, keyword: "mobile app developers", band: "p11_20", page: "/mobile-app-developers/", volume: 4_400, volumeKnown: true,
      intent: "BUYING", status: "SAME", change: 0, day: "2026-10-12", firstSeenDay: "2026-09-01", difficulty: 43,
    } as never);
    return { websiteId, holdId };
  });
}

describe("how hard a search is", () => {
  test("reads Labs' answer, its searches listed under items", () => {
    expect(parseKeywordDifficulty([{ items: [{ keyword: "Web Designers", keyword_difficulty: 61 }, { keyword: "web designer near me", keyword_difficulty: null }] }])).toEqual([
      { keyword: "web designers", difficulty: 61 },
      { keyword: "web designer near me", difficulty: null },
    ]);
  });

  test("the collection's first; only the missing are bought, once, and filed into the shared store", async () => {
    const t = harness();
    const { websiteId, holdId } = await website(t);
    const asked = await t.run(async (ctx) => await askDifficultyFor(ctx, (await ctx.db.get(holdId))!, ["mobile app developers", "web designers"], Date.now()));
    expect(asked).toBe(1);
    // Asked again the same day: the one request stands.
    await t.run(async (ctx) => await askDifficultyFor(ctx, (await ctx.db.get(holdId))!, ["web designers"], Date.now()));
    const pulls = await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect());
    expect(pulls).toHaveLength(1);
    expect(pulls[0]).toMatchObject({ operationId: "keyword_difficulty", mode: "LIVE" });
    expect(JSON.parse(pulls[0].taskArgsJson)).toMatchObject({ keywords: ["web designers"], location_code: 2826 });

    await t.run(async (ctx) => await ctx.db.patch(pulls[0]._id, { status: "READY", resultJson: JSON.stringify([{ items: [{ keyword: "web designers", keyword_difficulty: 61 }] }]), completedAt: Date.now() }));
    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId: pulls[0]._id });
    const held = await t.run(async (ctx) => Object.fromEntries(await difficultiesOf(ctx, websiteId, 2826, ["mobile app developers", "web designers", "app developers"])));
    expect(held).toEqual({ "mobile app developers": 43, "web designers": 61, "app developers": null });
  });
});
