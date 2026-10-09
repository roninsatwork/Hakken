import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { pressAsset } from "./assetSummaries";

/**
 * Your assets (discovery-local-reputation-ai-plan.md, step 5): worked out
 * after a collection and kept once per website, rewritten only when it moved
 * (rule 11), and none for a competitor watched.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => useFixedDay("2026-10-09"));
afterEach(() => vi.useRealTimers());

describe("Your assets", () => {
  test("a website barely on Google's page one is not seen enough; kept once, and not rewritten when nothing moved", async () => {
    const t = harness();
    const { holdId, rivalId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
      const rivalSite = await ctx.db.insert("websites", { host: "rival.co.uk", displayHost: "rival.co.uk", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
      const rivalId = await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalSite, relationship: "TRACKED", againstWebsiteId: websiteId, locationCode: 2826, createdAt: Date.now() });
      await ctx.db.insert("siteDaySummaries", { websiteId, locationCode: 2826, day: "2026-10-08", keywords: 40, bands: { p01_03: 2, p04_10: 3, p11_20: 10, p21_50: 10, p51_up: 15 }, estimatedTraffic: 120, updatedAt: Date.now() } as never);
      return { holdId, rivalId };
    });
    await t.mutation(internal.assetSummaries.rebuildAssets, { holdId });
    const [first] = await t.run(async (ctx) => await ctx.db.query("assetSummaries").collect());
    expect(first.rows[0]).toMatchObject({ kind: "WEBSITE", stage: "NOT_SEEN", seen: { code: "pageOne", a: 5 }, fix: { code: "fewOnPageOne", a: 5 } });

    vi.advanceTimersByTime(60_000);
    await t.mutation(internal.assetSummaries.rebuildAssets, { holdId });
    const [again] = await t.run(async (ctx) => await ctx.db.query("assetSummaries").collect());
    expect(again.updatedAt).toBe(first.updatedAt);

    await t.mutation(internal.assetSummaries.rebuildAssets, { holdId: rivalId });
    expect(await t.run(async (ctx) => await ctx.db.query("assetSummaries").collect())).toHaveLength(1);
  });

  test("the press line: not there with no page in a year, not seen under one a month, not chosen when most do not link", () => {
    const page = (linked: number) => ({ url: "https://a.example/x", host: "a.example", title: null, day: "2026-09-01", kind: 1, tone: 0, strength: 0, linked, about: 1 });
    expect(pressAsset(null)).toBeNull();
    expect(pressAsset([])).toMatchObject({ kind: "PRESS", stage: "NOT_THERE", fix: { code: "getMentioned" } });
    expect(pressAsset([page(1), page(0)])).toMatchObject({ stage: "NOT_SEEN", chosen: { code: "linked", a: 1, b: 2 }, fix: { code: "fewMentions", a: 2 } });
    expect(pressAsset([...Array(10).fill(page(0)), page(1), page(1)])).toMatchObject({ stage: "SEEN_NOT_CHOSEN", fix: { code: "askForLinks", a: 10 } });
    expect(pressAsset(Array(12).fill(page(1)))).toMatchObject({ stage: "WORKING", fix: null });
  });
});
