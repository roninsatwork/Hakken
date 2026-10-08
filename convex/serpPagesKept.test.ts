import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { setPoint } from "./positionHistory";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Google's full results page for a search is kept 90 days; where the website
 * stood on it, for ever (docs/plans/active/dataforseo-cost-plan.md, B3). The
 * hourly sweep clears the pages, never the positions; a search last checked
 * before the 90 days shows the website's position at that check and says the
 * full page is kept 90 days.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const NOW = Date.parse("2026-12-30T12:00:00Z");
const OLD_DAY = "2026-09-25";
const RECENT_DAY = "2026-12-25";
const UK = 2826;

beforeEach(() => useFixedDay());
afterEach(() => vi.useRealTimers());

/** One check of a search, as its filing writes it: the results page, the site's position, its stats. */
async function checked(t: Harness, websiteId: Id<"websites">, keyword: string, day: string, position: number) {
  return await t.run(async (ctx) => {
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "serp_google_organic", family: "SERP", mode: "LIVE", taskArgsJson: "{}", status: "READY",
      tag: `t-${keyword}-${day}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(), completedAt: Date.now(),
    } as never);
    const pageId = await ctx.db.insert("siteSerpPages", {
      keyword, locationCode: UK, day, pullId, resultCount: 2,
      results: [
        { position: 1, domain: "nashtackle.co.uk", url: "https://nashtackle.co.uk/rods" },
        { position, domain: "kordatackle.com", url: "https://kordatackle.com/rods" },
      ],
      features: ["people_also_ask"], aiOverviewDomains: [], localPackDomains: [], questions: ["Which carp rod?"], related: [], createdAt: Date.now(),
    });
    await setPoint(ctx, { websiteId, keyword, locationCode: UK, day }, { position, url: "https://kordatackle.com/rods", kind: "CHECK" });
    const stats = await ctx.db.query("websiteSearchStats").withIndex("by_key", (q) => q.eq("websiteId", websiteId).eq("keyword", keyword).eq("locationCode", UK)).unique();
    const fields = { websiteId, keyword, locationCode: UK, firstCheckedDay: stats?.firstCheckedDay ?? day, lastCheckedDay: day, lastPosition: position, everRanked: true, updatedAt: Date.now() };
    if (stats) await ctx.db.replace(stats._id, fields);
    else await ctx.db.insert("websiteSearchStats", fields);
    return pageId;
  });
}

/** Korda tracking two searches: "carp rods", paused since its check 96 days ago, and "carp bait", checked five days ago. */
async function seed(t: Harness) {
  vi.setSystemTime(Date.parse(`${OLD_DAY}T09:00:00Z`));
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
    for (const [keyword, isActive] of [["carp rods", false], ["carp bait", true]] as const) {
      await ctx.db.insert("websiteKeywords", { websiteId, companyWebsiteId: holdId, keyword, isActive, createdAt: Date.now() });
    }
    await ctx.db.insert("siteKeywordRanks", {
      websiteId, locationCode: UK, keyword: "carp rods", band: "p01_03", page: "/rods", address: "https://kordatackle.com/rods",
      volume: 480, volumeKnown: true, intent: "BUYING", status: "SAME", change: 0, day: OLD_DAY, firstSeenDay: OLD_DAY,
      position: 3,
    } as never);
    return { companyId, websiteId, holdId };
  });
  const oldPage = await checked(t, ids.websiteId, "carp rods", OLD_DAY, 3);
  vi.setSystemTime(Date.parse(`${RECENT_DAY}T09:00:00Z`));
  const recentPage = await checked(t, ids.websiteId, "carp bait", RECENT_DAY, 5);
  vi.setSystemTime(NOW);
  return { ...ids, oldPage, recentPage };
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

const purge = (t: Harness) => t.mutation(internal.seoCollectionSweep.sweepDuty, { duty: "purgeSerpPages" });

describe("Google's full results page, kept 90 days (B3)", () => {
  test("the hourly sweep clears the pages older than 90 days and keeps the newer; never the positions", async () => {
    const t = harness();
    const s = await seed(t);
    const counts = () => t.run(async (ctx) => ({
      positions: (await ctx.db.query("keywordPositionMonths").collect()).length,
      ranks: (await ctx.db.query("siteKeywordRanks").collect()).length,
      stats: (await ctx.db.query("websiteSearchStats").collect()).length,
    }));
    const before = await counts();

    expect(await purge(t)).toMatchObject({ more: false });

    expect(await t.run(async (ctx) => (await ctx.db.query("siteSerpPages").collect()).map((row) => row._id))).toEqual([s.recentPage]);
    expect(await counts()).toEqual(before);
    expect(before).toEqual({ positions: 2, ranks: 1, stats: 2 });
  });

  test("a search last checked before them shows the website's position at that check, and says the full page is kept 90 days", async () => {
    const t = harness();
    const s = await seed(t);
    await purge(t);
    const asKorda = await member(t, s.companyId);

    const record = await asKorda.query(api.siteRecords.keywordRecord, { siteId: s.holdId, keyword: "carp rods" });
    expect(record.serp).toBeNull();
    expect(record.serpNotKept).toEqual({ day: OLD_DAY, position: 3 });
    // A search checked inside them shows its page, as before.
    const recent = await asKorda.query(api.siteRecords.keywordRecord, { siteId: s.holdId, keyword: "carp bait" });
    expect(recent.serp?.day).toBe(RECENT_DAY);
    expect(recent.serpNotKept).toBeNull();

    const above = await asKorda.query(api.siteGoogleSerp.listAbove, { siteId: s.holdId });
    expect(above.map((row) => [row.keyword, row.day, row.position, row.above.length, row.pageKept])).toEqual([
      ["carp bait", RECENT_DAY, 5, 1, true],
      ["carp rods", OLD_DAY, 3, 0, false],
    ]);
  });
});
