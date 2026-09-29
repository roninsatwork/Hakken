import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { parseSearchVolumes, SEARCHES_PER_VOLUME_REQUEST, volumeSteps } from "./searchVolumes";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const PROMPT = "who is a good SEO agency in surrey, uk";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Google Ads' figures for the AI's fan-out queries (Anthony, 2026-09-29:
 * "won't Data for SEO give us this", then "build it"): which are bought, how
 * the answer is kept, and that nothing is bought twice within the month.
 */
describe("search volumes for fan-out queries", () => {
  test("reads each search's volume, cost per click, competition and last twelve months, oldest first", () => {
    const months = Array.from({ length: 14 }, (_, index) => ({ year: 2025 + Math.floor((index + 8) / 12), month: ((index + 8) % 12) + 1, search_volume: index * 10 }));
    expect(parseSearchVolumes([
      { keyword: "Best SEO Agency Surrey UK", search_volume: 30, cpc: 12.5, competition: "HIGH", monthly_searches: [...months].reverse() },
      { keyword: "seo agency surrey for small firms", search_volume: null, cpc: null, competition: null, monthly_searches: null },
    ])).toEqual([
      { keyword: "best seo agency surrey uk", volume: 30, cpc: 12.5, competition: "HIGH", trend: months.slice(-12).map((month) => month.search_volume) },
      { keyword: "seo agency surrey for small firms", volume: null, cpc: null, competition: null, trend: [] },
    ]);
  });

  test("a purchase is filed into the shared figures, and filing it again replaces them", async () => {
    const t = harness();
    const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "keyword_search_volume", family: "Keywords Data", mode: "QUEUED", status: "READY", tag: "volumes",
      taskArgsJson: JSON.stringify({ keywords: ["best seo agency surrey uk"], location_code: 2826, language_code: "en" }),
      resultJson: JSON.stringify([{ keyword: "best seo agency surrey uk", search_volume: 30, cpc: 12.5, competition: "HIGH", monthly_searches: [] }]),
      attempts: 0, costUsd: 0.05, sandbox: false, submittedAt: Date.now(), completedAt: Date.now(),
    }));

    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId });
    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId });

    const held = await t.run(async (ctx) => await ctx.db.query("searchVolumes").collect());
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ keyword: "best seo agency surrey uk", locationCode: 2826, volume: 30, cpc: 12.5, competition: "HIGH", pullId });
  });

  async function website(t: Harness, relationship: "OWNED" | "TRACKED" = "OWNED") {
    return await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", {
        companyId, websiteId, relationship, createdAt: Date.now(), ...(relationship === "TRACKED" ? { againstWebsiteId: websiteId } : {}),
      });
      await ctx.db.insert("websiteQuestions", {
        websiteId, companyWebsiteId: holdId, prompt: PROMPT, engines: ["claude"], isActive: true, createdAt: Date.now(),
      });
      return { companyId, websiteId, holdId };
    });
  }

  const wording = (query: string) => ({ query, queryText: query, engines: ["claude" as const], timesSeen: 1, lastSeenDay: "2026-09-28" });

  test("buys only the fan-out queries with no figures, or figures older than a month, and never a competitor's", async () => {
    const t = harness();
    const { websiteId, holdId } = await website(t);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("fanOutAngles", {
        holdId, prompt: PROMPT, angle: "seo agency surrey", engines: ["claude"], timesSeen: 9, lastSeenDay: "2026-09-28", rebuiltAt: now,
        wordings: [
          wording("best seo agency surrey uk"),
          wording("seo agency surrey"),
          wording("seo agencies surrey"),
          wording("stale seo agency surrey"),
          wording("seo agency surrey 🚀"),
          wording("one two three four five six seven eight nine ten eleven"),
        ],
      });
      // Measured by the website's own keyword list.
      await ctx.db.insert("siteKeywordRanks", {
        websiteId, locationCode: 2826, keyword: "seo agency surrey", band: "p01_03", page: "/seo/", volume: 90, volumeKnown: true,
        intent: "BUYING", status: "SAME", change: 0, day: "2026-09-28", firstSeenDay: "2026-09-01", searchText: "seo agency surrey", updatedAt: now,
      } as never);
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "keyword_search_volume", family: "Keywords Data", mode: "QUEUED", status: "READY", tag: "earlier",
        taskArgsJson: "{}", attempts: 0, costUsd: 0, sandbox: false, submittedAt: now,
      });
      const figures = { locationCode: 2826, volume: 10, cpc: null, competition: null, trend: [], checkedDay: "2026-09-20", pullId };
      await ctx.db.insert("searchVolumes", { ...figures, keyword: "seo agencies surrey", updatedAt: now - 5 * DAY_MS });
      await ctx.db.insert("searchVolumes", { ...figures, keyword: "stale seo agency surrey", updatedAt: now - 40 * DAY_MS });
    });

    const asked: Array<Record<string, unknown>> = [];
    await t.run(async (ctx) => {
      const hold = (await ctx.db.get(holdId))!;
      const steps = await volumeSteps(ctx, { startedAt: now } as Doc<"seoCollectionCycles">, hold, async (params) => {
        asked.push(params);
        return { reused: false, pullId: "p" as Id<"seoDataPulls">, pull: null };
      });
      for (const [index, step] of steps.entries()) await step(index, 100);
    });

    expect(SEARCHES_PER_VOLUME_REQUEST).toBe(1_000);
    expect(asked).toEqual([{ keywords: ["best seo agency surrey uk", "stale seo agency surrey"], location_code: 2826, language_code: "en" }]);

    const rival = await website(t, "TRACKED");
    const none = await t.run(async (ctx) => await volumeSteps(ctx, { startedAt: now } as Doc<"seoCollectionCycles">, (await ctx.db.get(rival.holdId))!, async () => {
      throw new Error("a competitor's list is never bought");
    }));
    expect(none).toEqual([]);
  });
});
