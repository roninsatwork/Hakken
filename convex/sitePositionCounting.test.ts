import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { parseDomainRankedKeywords, parseSerpPage, placesOf } from "./dataForSeoParsers";
import { expandSeoResult, slimSeoResult } from "./dataForSeoSlim";
import { clearCountingSwitchMoves } from "./sitePositionRepair";

/**
 * One way of counting a position (sites-data-completeness-plan.md, G2): among
 * Google's normal results, as the supplier's own totals and the menu count
 * them — "ai agency" is 3rd of the normal results and 5th on the page. The
 * place on the whole page is kept beside it, and the day the counting
 * changed is no move: a search does not "rise" two places because it began
 * to be counted another way.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const UK = 2826;

const ranked = (keyword: string, group: number | undefined, absolute: number) => ({
  keyword_data: { keyword, keyword_info: { search_volume: 90 } },
  ranked_serp_element: {
    serp_item: { type: "organic", ...(group !== undefined ? { rank_group: group } : {}), rank_absolute: absolute, url: "https://ourshop.com/" },
  },
});

describe("reading a position", () => {
  test("counted among the normal results, the place on the page beside it", () => {
    expect(placesOf({ rank_group: 3, rank_absolute: 5 })).toEqual({ position: 3, pagePosition: 5 });
    // An answer stored before the normal place was kept is counted on the page, and says so.
    expect(placesOf({ rank_absolute: 5 })).toEqual({ position: 5 });
    expect(placesOf(null)).toEqual({});

    const parsed = parseDomainRankedKeywords([{ items: [ranked("ai agency", 3, 5)] }]);
    expect(parsed.positions?.[0]).toMatchObject({ keyword: "ai agency", position: 3, pagePosition: 5 });

    const page = parseSerpPage([{ items: [
      { type: "ai_overview", rank_group: 1, rank_absolute: 1 },
      { type: "organic", domain: "rival.com", rank_group: 1, rank_absolute: 2 },
      { type: "people_also_ask", rank_group: 1, rank_absolute: 3 },
      { type: "organic", domain: "ourshop.com", rank_group: 2, rank_absolute: 4 },
    ] }]);
    expect(page.rows).toEqual([
      { domain: "rival.com", position: 1, pagePosition: 2 },
      { domain: "ourshop.com", position: 2, pagePosition: 4 },
    ]);
  });

  test("the stored copy of a keyword list keeps the normal place", () => {
    const answer = [{ total_count: 1, items: [ranked("web design surrey", 7, 11)] }];
    const stored = expandSeoResult(slimSeoResult("domain_ranked_keywords_list", answer));
    expect(parseDomainRankedKeywords(stored).positions?.[0]).toMatchObject({ position: 7, pagePosition: 11 });
  });
});

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host: "ourshop.com", displayHost: "ourshop.com", firstSeenAt: Date.now() });
    const pull = () => ctx.db.insert("seoDataPulls", {
      operationId: "domain_ranked_keywords", family: "DataForSEO Labs", mode: "LIVE", websiteId, target: "ourshop.com",
      taskArgsJson: "{}", status: "READY", tag: `t-${Math.random()}`, costUsd: 0.01, sandbox: false, submittedAt: Date.now(),
    });
    return { websiteId, pulls: [await pull(), await pull(), await pull(), await pull()] };
  });
}

async function file(
  t: Harness,
  websiteId: Id<"websites">,
  pullId: Id<"seoDataPulls">,
  day: string,
  places: { position: number; pagePosition?: number },
) {
  await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
    pullId, websiteId, operationId: "domain_ranked_keywords", day, locationCode: UK, metricsJson: "{}",
    positions: [{ keyword: "ai agency", ...places }],
  });
}

const rank = (t: Harness) => t.run(async (ctx) => await ctx.db.query("siteKeywordRanks").first());

describe("the day the counting changed", () => {
  test("is no move, and the moves after it are counted the new way", async () => {
    const t = harness();
    const { websiteId, pulls } = await seed(t);

    // Counted on the page: 5th.
    await file(t, websiteId, pulls[0], "2026-09-20", { position: 5 });
    // Counted among the normal results: 3rd of them, still 5th on the page.
    await file(t, websiteId, pulls[1], "2026-09-27", { position: 3, pagePosition: 5 });
    expect(await rank(t)).toMatchObject({ position: 3, pagePosition: 5, status: "SAME", change: 0, band: "p01_03", previousDay: "2026-09-20" });
    expect((await rank(t))?.previousPosition).toBeUndefined();

    // A second check the same day files again: still no move.
    await file(t, websiteId, pulls[2], "2026-09-27", { position: 3, pagePosition: 5 });
    expect(await rank(t)).toMatchObject({ status: "SAME", change: 0 });

    // The next check, counted the same way, moves as it always did.
    await file(t, websiteId, pulls[3], "2026-10-04", { position: 2, pagePosition: 4 });
    expect(await rank(t)).toMatchObject({ position: 2, previousPosition: 3, status: "UP", change: 1 });
  });

  test("filed again the same day counted the other way — the morning's run the old way — is no move either", async () => {
    const t = harness();
    const { websiteId, pulls } = await seed(t);

    await file(t, websiteId, pulls[0], "2026-09-20", { position: 5 });
    // The morning's run, counted on the page as before: 5th to 5th.
    await file(t, websiteId, pulls[1], "2026-09-27", { position: 5 });
    expect(await rank(t)).toMatchObject({ status: "SAME", previousPosition: 5 });
    // The afternoon's, among the normal results: 3rd, not a rise of two.
    await file(t, websiteId, pulls[2], "2026-09-27", { position: 3, pagePosition: 5 });
    expect(await rank(t)).toMatchObject({ position: 3, pagePosition: 5, status: "SAME", change: 0, previousDay: "2026-09-20" });
    expect((await rank(t))?.previousPosition).toBeUndefined();

    // The next check, counted the same way, moves as it always did.
    await file(t, websiteId, pulls[3], "2026-10-04", { position: 2, pagePosition: 4 });
    expect(await rank(t)).toMatchObject({ status: "UP", previousPosition: 3, change: 1 });
  });

  test("a tracked search's previous place is only one counted the same way", async () => {
    const t = harness();
    const { websiteId, pulls } = await seed(t);
    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() });
      const companyWebsiteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, createdAt: Date.now() });
      await ctx.db.insert("websiteKeywords", { websiteId, companyWebsiteId, keyword: "ai agency", isActive: true, createdAt: Date.now() });
    });

    await file(t, websiteId, pulls[0], "2026-09-20", { position: 5 });
    await file(t, websiteId, pulls[1], "2026-09-27", { position: 3, pagePosition: 5 });
    const stats = await t.run(async (ctx) => await ctx.db.query("websiteSearchStats").first());
    expect(stats).toMatchObject({ lastPosition: 3, previousCheckedDay: "2026-09-20" });
    expect(stats?.previousPosition).toBeUndefined();

    await file(t, websiteId, pulls[2], "2026-10-04", { position: 2, pagePosition: 4 });
    expect(await t.run(async (ctx) => await ctx.db.query("websiteSearchStats").first())).toMatchObject({ lastPosition: 2, previousPosition: 3 });
  });
});

/*
  The repair for 2026-09-27, when the afternoon's run moved each search from
  the place the morning's run had counted the old way.
*/
describe("clearing the counting change's moves", () => {
  test("a place counted the new way never moves from one counted before the change", async () => {
    const t = harness();
    const { websiteId } = await seed(t);
    const row = (keyword: string, fields: Record<string, unknown>) => ({
      websiteId, locationCode: UK, keyword, band: "p01_03", page: "/", volume: 90, volumeKnown: true, intent: "OTHER",
      day: "2026-09-27", firstSeenDay: "2026-09-01", searchText: keyword, updatedAt: Date.now(), ...fields,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("siteKeywordRanks", row("moved by mistake", { position: 3, pagePosition: 5, previousPosition: 5, previousDay: "2026-09-26", change: 2, status: "UP" }) as never);
      await ctx.db.insert("siteKeywordRanks", row("counted the old way", { position: 4, previousPosition: 6, previousDay: "2026-09-26", change: 2, status: "UP" }) as never);
      await ctx.db.insert("siteKeywordRanks", row("new today", { position: 2, pagePosition: 2, change: 0, status: "NEW" }) as never);
    });

    const first = await t.run(async (ctx) => await clearCountingSwitchMoves(ctx, null, 50));
    expect(first).toMatchObject({ isDone: true, processed: 3, updated: 1 });
    const rows = new Map((await t.run(async (ctx) => await ctx.db.query("siteKeywordRanks").collect())).map((entry) => [entry.keyword, entry]));
    expect(rows.get("moved by mistake")).toMatchObject({ status: "SAME", change: 0, position: 3 });
    expect(rows.get("moved by mistake")?.previousPosition).toBeUndefined();
    expect(rows.get("counted the old way")).toMatchObject({ status: "UP", change: 2, previousPosition: 6 });
    expect(rows.get("new today")).toMatchObject({ status: "NEW" });
    // Run again, it changes nothing.
    expect(await t.run(async (ctx) => await clearCountingSwitchMoves(ctx, null, 50))).toMatchObject({ updated: 0 });
  });
});
