import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { clearKeptHistory } from "./keepLessHistoryMigration";

/**
 * What keep-less-history-plan.md stops keeping is cleared once nothing reads
 * it: each found competitor's last day kept on its row first, then its day
 * rows, the rows a check of keyword positions and the old thinning's place;
 * and the AI's searches by day go after twelve months, the searches kept.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("clearing what is no longer kept", () => {
  test("a competitor keeps its last day, then the day rows and the position rows go, in stages", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "dataforseo_labs_google_competitors_domain", family: "Labs", mode: "LIVE", websiteId, taskArgsJson: "{}",
        status: "READY", tag: "t", attempts: 1, costUsd: 0, sandbox: false, submittedAt: 1,
      } as never);
      for (const host of ["nashtackle.co.uk", "fox.com", "never-dated.com"]) {
        await ctx.db.insert("discoveredCompetitors", { companyWebsiteId: holdId, companyId, host, intersections: 10, discoveredAt: 1 });
      }
      for (const [host, day] of [["nashtackle.co.uk", "2026-09-01"], ["nashtackle.co.uk", "2026-10-01"], ["fox.com", "2026-09-15"]] as const) {
        await ctx.db.insert("discoveredCompetitorDays", { companyWebsiteId: holdId, companyId, host, day, intersections: 10, pullId, createdAt: 1 });
      }
      for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) {
        await ctx.db.insert("seoKeywordPositions", { websiteId, keyword: "carp rods", day, position: 4, pullId, locationCode: 2826, createdAt: 1 });
      }
      await ctx.db.insert("positionThinning", { day: "2026-07-01", cursor: null, updatedAt: 1 });
    });

    let cursor: string | null = null;
    const stages: string[] = [];
    for (let batch = 0; batch < 20; batch += 1) {
      const step: { cursor: string | null; isDone: boolean } = await t.run((ctx) => clearKeptHistory(ctx, cursor, 2));
      cursor = step.cursor;
      stages.push((cursor ?? "done").split(":")[0]);
      if (step.isDone) break;
    }

    expect(stages).toEqual(["lastDays", "competitorDays", "competitorDays", "positions", "positions", "done"]);
    const left = await t.run(async (ctx) => ({
      lastDays: (await ctx.db.query("discoveredCompetitors").collect()).map((row) => [row.host, row.lastSeenDay ?? null]),
      days: (await ctx.db.query("discoveredCompetitorDays").collect()).length,
      positions: (await ctx.db.query("seoKeywordPositions").collect()).length,
      thinning: (await ctx.db.query("positionThinning").collect()).length,
    }));
    expect(left).toEqual({
      lastDays: [["nashtackle.co.uk", "2026-10-01"], ["fox.com", "2026-09-15"], ["never-dated.com", null]],
      days: 0,
      positions: 0,
      thinning: 0,
    });
  });

  test("the AI's searches by day are kept twelve months, the searches themselves for ever", async () => {
    const t = harness();
    // Rows are created in time order: the purchase first, a year back.
    vi.setSystemTime(Date.parse("2025-09-30T09:00:00Z"));
    const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_perplexity", family: "AI", mode: "LIVE", taskArgsJson: "{}",
      status: "READY", tag: "t", attempts: 1, costUsd: 0, sandbox: false, submittedAt: 1,
    } as never));
    const searched = async (day: string) => {
      vi.setSystemTime(Date.parse(`${day}T09:00:00Z`));
      await t.run(async (ctx) => {
        await ctx.db.insert("promptFanOutDays", { prompt: "best carp rods", engine: "perplexity", query: `carp rods ${day}`, day, pullId, createdAt: Date.now() });
      });
    };
    await searched("2025-10-01");
    await searched("2025-10-20");
    vi.setSystemTime(Date.parse("2026-10-07T12:00:00Z"));

    expect(await t.mutation(internal.seoCollectionSweep.sweepDuty, { duty: "purgeFanOutDays" })).toMatchObject({ more: false });

    const days = await t.run(async (ctx) => (await ctx.db.query("promptFanOutDays").collect()).map((row) => row.day));
    expect(days).toEqual(["2025-10-20"]);
  });
});
