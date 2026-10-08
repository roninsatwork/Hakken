import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Position bands' and New and lost keywords' view of the checks, as the
 * designs agreed with Anthony on 2026-09-27 show them: which searches moved
 * from one band to another, the searches just off page one, and each check —
 * what it covered, and its moves, never a start's.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;

beforeEach(() => useFixedDay());
afterEach(() => vi.useRealTimers());

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
    name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now(),
  }));
  return t.withIdentity({ subject: userId });
}

async function hold(t: Harness, companyId: Id<"companies">, host: string) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
    return { websiteId, holdId };
  });
}

async function pull(t: Harness, websiteId: Id<"websites">, operationId: string) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId, family: "DataForSEO Labs", mode: "LIVE", websiteId, taskArgsJson: "{}",
    status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.02, sandbox: false, submittedAt: Date.now(),
  } as never));
}

/** A ranked-keywords answer, filed as the parser files it. */
async function fileRanks(t: Harness, websiteId: Id<"websites">, day: string, positions: Array<Record<string, unknown>>) {
  await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
    pullId: await pull(t, websiteId, "domain_ranked_keywords"),
    websiteId,
    operationId: "domain_ranked_keywords",
    day,
    locationCode: UK,
    metricsJson: JSON.stringify({ returnedKeywords: positions.length, estimatedTraffic: 100, rankedKeywords: 50 }),
    positions: positions as never,
  });
}

/** One page of the keyword list's figures, as a list page records them. */
async function listPage(t: Harness, websiteId: Id<"websites">, day: string, figures: { listOffset: number; listLimit: number; listItems: number }) {
  const pullId = await pull(t, websiteId, KEYWORD_LIST_OPERATION_ID);
  await t.run(async (ctx) => await ctx.db.insert("seoWebsiteMetrics", {
    websiteId, day, operationId: KEYWORD_LIST_OPERATION_ID, pullId, locationCode: UK,
    metricsJson: JSON.stringify({ ...figures, listDropped: 0 }), createdAt: Date.now(),
  }));
}

/** How many searches the everyday call brought on a day. */
async function everyday(t: Harness, websiteId: Id<"websites">, day: string, returnedKeywords: number) {
  const pullId = await pull(t, websiteId, "domain_ranked_keywords");
  await t.run(async (ctx) => await ctx.db.insert("seoWebsiteMetrics", {
    websiteId, day, operationId: "domain_ranked_keywords", pullId, locationCode: UK,
    metricsJson: JSON.stringify({ returnedKeywords }), createdAt: Date.now(),
  }));
}

async function dayRow(t: Harness, websiteId: Id<"websites">, day: string, keywords: number, moves: [number, number, number, number]) {
  await t.run(async (ctx) => await ctx.db.insert("siteDaySummaries", {
    websiteId, locationCode: UK, day, keywords,
    rankedNew: moves[0], rankedUp: moves[1], rankedDown: moves[2], rankedLost: moves[3], updatedAt: Date.now(),
  }));
}

const rebuild = (t: Harness, websiteId: Id<"websites">) => t.action(internal.siteSummaries.rebuildSite, { websiteId, locationCode: UK });

/** Two checks a week apart: two searches cross a band's edge, two newly rank, and three move within their bands or not at all. */
async function twoChecks(t: Harness, websiteId: Id<"websites">) {
  await fileRanks(t, websiteId, "2026-09-16", [
    { keyword: "carp rods", position: 5 }, { keyword: "bait boats", position: 2 }, { keyword: "bivvies", position: 12, searchVolume: 900 },
    { keyword: "zig rigs", position: 30 }, { keyword: "rig tubing", position: 8 },
  ]);
  await fileRanks(t, websiteId, "2026-09-23", [
    { keyword: "carp rods", position: 2 }, { keyword: "bait boats", position: 4 }, { keyword: "bivvies", position: 11, searchVolume: 900 },
    { keyword: "zig rigs", position: 30 }, { keyword: "rig tubing", position: 9 },
    { keyword: "boilies", position: 60, searchVolume: 40 }, { keyword: "hooks", position: 13, searchVolume: 2_400 },
  ]);
  await rebuild(t, websiteId);
}

describe("moves between bands", () => {
  test("count only the searches that crossed a band's edge, and list them the most searched first", async () => {
    vi.setSystemTime(new Date("2026-09-16T08:00:00Z"));
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await twoChecks(t, own.websiteId);
    // The week before is a check the moves are counted from.
    await dayRow(t, own.websiteId, "2026-09-16", 5, [5, 0, 0, 0]);

    const asKorda = await member(t, korda);
    const moves = await asKorda.query(api.siteBands.bandMoves, { siteId: own.holdId });
    expect(moves).toMatchObject({ rankingDay: "2026-09-23", previousDay: "2026-09-16", start: null });
    expect(moves.bands).toEqual({ p01_03: 1, p04_10: 2, p11_20: 2, p21_50: 1, p51_up: 1 });
    // Up into the top 3, down out of it, and two newly ranking; a move within a band is none.
    expect(moves.moves.map((move) => `${move.from}>${move.to}:${move.count}`).sort()).toEqual([
      "none>p11_20:1", "none>p51_up:1", "p01_03>p04_10:1", "p04_10>p01_03:1",
    ]);
    // Positions 11 to 13, the most searched first.
    expect(moves.closest).toEqual({
      rows: [
        expect.objectContaining({ keyword: "hooks", position: 13, volume: 2_400 }),
        expect.objectContaining({ keyword: "bivvies", position: 11, volume: 900 }),
      ],
      total: 2,
    });

    const all = await asKorda.query(api.siteBands.listBandMoves, { siteId: own.holdId });
    expect(all.rows.map((row) => [row.keyword, row.was, row.now])).toEqual([
      ["hooks", null, 13], ["boilies", null, 60], ["bait boats", 2, 4], ["carp rods", 5, 2],
    ]);
    expect(all).toMatchObject({ cut: null, day: "2026-09-23" });
    // One square of the grid.
    const square = await asKorda.query(api.siteBands.listBandMoves, { siteId: own.holdId, from: "p04_10", to: "p01_03" });
    expect(square.rows.map((row) => row.keyword)).toEqual(["carp rods"]);
    const fresh = await asKorda.query(api.siteBands.listBandMoves, { siteId: own.holdId, from: "none" });
    expect(fresh.rows.map((row) => row.keyword)).toEqual(["hooks", "boilies"]);
  });

  test("are none on the day the whole list was first held: its searches were new to the list, not new rankings", async () => {
    vi.setSystemTime(new Date("2026-09-16T08:00:00Z"));
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await twoChecks(t, own.websiteId);
    await dayRow(t, own.websiteId, "2026-09-16", 5, [5, 0, 0, 0]);
    await listPage(t, own.websiteId, "2026-09-23", { listOffset: 0, listLimit: 1_000, listItems: 7 });

    const asKorda = await member(t, korda);
    const moves = await asKorda.query(api.siteBands.bandMoves, { siteId: own.holdId });
    expect(moves).toMatchObject({ rankingDay: "2026-09-23", start: "FIRST_LIST", moves: [] });
    expect((await asKorda.query(api.siteBands.listBandMoves, { siteId: own.holdId })).rows).toEqual([]);
  });

  test("are another company's to read only through its own site", async () => {
    vi.setSystemTime(new Date("2026-09-16T08:00:00Z"));
    const t = harness();
    const korda = await company(t, "Korda");
    const other = await company(t, "Another agency");
    const own = await hold(t, korda, "kordatackle.com");
    await twoChecks(t, own.websiteId);
    const asOther = await member(t, other);
    await expect(asOther.query(api.siteBands.bandMoves, { siteId: own.holdId })).rejects.toThrow();
    await expect(asOther.query(api.siteBands.listBandMoves, { siteId: own.holdId })).rejects.toThrow();
  });
});

describe("each check", () => {
  async function checks(t: Harness, websiteId: Id<"websites">) {
    // The first check: the everyday hundred.
    await dayRow(t, websiteId, "2026-09-16", 100, [100, 0, 0, 0]);
    await everyday(t, websiteId, "2026-09-16", 100);
    // The everyday hundred again, with moves.
    await dayRow(t, websiteId, "2026-09-18", 100, [2, 1, 1, 0]);
    await everyday(t, websiteId, "2026-09-18", 100);
    // The whole list, first held: three pages, the last short.
    await dayRow(t, websiteId, "2026-09-20", 2_400, [2_300, 0, 0, 0]);
    for (const [offset, items] of [[0, 1_000], [1_000, 1_000], [2_000, 400]]) {
      await listPage(t, websiteId, "2026-09-20", { listOffset: offset, listLimit: 1_000, listItems: items });
    }
    // An everyday check of the list's first thousand.
    await dayRow(t, websiteId, "2026-09-23", 2_400, [5, 4, 3, 2]);
    await everyday(t, websiteId, "2026-09-23", 100);
    await listPage(t, websiteId, "2026-09-23", { listOffset: 0, listLimit: 1_000, listItems: 1_000 });
    // The whole list again.
    await dayRow(t, websiteId, "2026-09-27", 2_410, [20, 30, 40, 10]);
    for (const [offset, items] of [[0, 1_000], [1_000, 1_000], [2_000, 410]]) {
      await listPage(t, websiteId, "2026-09-27", { listOffset: offset, listLimit: 1_000, listItems: items });
    }
  }

  test("says what each covered, and counts no start as moves", async () => {
    vi.setSystemTime(new Date("2026-09-16T08:00:00Z"));
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await checks(t, own.websiteId);
    const asKorda = await member(t, korda);
    const range = { siteId: own.holdId, from: "2026-09-01", to: "2026-09-30" };

    const daily = await asKorda.query(api.siteChecks.siteChecks, { ...range, step: "day" });
    // A start and the whole list are as many searches as they held; an everyday check, as many as it checked again.
    expect(daily.steps.map((step) => [step.day, step.kind, step.checked, step.rankedNew, step.rankedUp])).toEqual([
      ["2026-09-16", "FIRST", 100, null, null],
      ["2026-09-18", "EVERYDAY", 100, 2, 1],
      ["2026-09-20", "FIRST_LIST", 2_400, null, null],
      ["2026-09-23", "EVERYDAY", 1_000, 5, 4],
      ["2026-09-27", "WHOLE", 2_410, 20, 30],
    ]);
    expect(daily.newest).toMatchObject({ day: "2026-09-27", kind: "WHOLE", rankedNew: 20, rankedUp: 30, rankedDown: 40, rankedLost: 10 });

    // A week holding both starts counts only the check between them; the newest check says what the week was.
    const weekly = await asKorda.query(api.siteChecks.siteChecks, { ...range, step: "week" });
    expect(weekly.steps.map((step) => [step.day, step.lastDay, step.checks, step.start, step.kind, step.rankedNew, step.rankedDown])).toEqual([
      ["2026-09-14", "2026-09-20", 3, "FIRST", "FIRST_LIST", 2, 1],
      ["2026-09-21", "2026-09-27", 2, null, "WHOLE", 25, 43],
    ]);
  });

  test("reads a list filed before its pages recorded their reach as the whole list, and a first check by what it held", async () => {
    // kordatackle.com's first check bought its whole list, on pages filed before they recorded how far they reached.
    vi.setSystemTime(new Date("2026-09-24T08:00:00Z"));
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const unrecorded = async (day: string) => {
      const pullId = await pull(t, own.websiteId, KEYWORD_LIST_OPERATION_ID);
      await t.run(async (ctx) => await ctx.db.insert("seoWebsiteMetrics", {
        websiteId: own.websiteId, day, operationId: KEYWORD_LIST_OPERATION_ID, pullId, locationCode: UK, metricsJson: "{}", createdAt: Date.now(),
      }));
    };
    await dayRow(t, own.websiteId, "2026-09-24", 2_545, [2_545, 0, 0, 0]);
    await everyday(t, own.websiteId, "2026-09-24", 100);
    await unrecorded("2026-09-24");
    await dayRow(t, own.websiteId, "2026-09-25", 2_545, [3, 2, 1, 0]);
    await everyday(t, own.websiteId, "2026-09-25", 100);
    await unrecorded("2026-09-25");
    const asKorda = await member(t, korda);

    const { steps } = await asKorda.query(api.siteChecks.siteChecks, { siteId: own.holdId, from: "2026-09-01", to: "2026-09-30", step: "day" });
    expect(steps.map((step) => [step.day, step.kind, step.checked])).toEqual([
      ["2026-09-24", "FIRST", 2_545],
      ["2026-09-25", "WHOLE", 2_545],
    ]);
  });

  test("names the newest check even when the dates end before it", async () => {
    vi.setSystemTime(new Date("2026-09-16T08:00:00Z"));
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await checks(t, own.websiteId);
    const asKorda = await member(t, korda);

    const early = await asKorda.query(api.siteChecks.siteChecks, { siteId: own.holdId, from: "2026-09-01", to: "2026-09-19", step: "day" });
    expect(early.steps.map((step) => step.day)).toEqual(["2026-09-16", "2026-09-18"]);
    expect(early.newest).toMatchObject({ day: "2026-09-27", kind: "WHOLE", checked: 2_410 });
  });
});

describe("the first whole list on the charts and the Calendar", () => {
  test("is counted as searches held, never as new ones", async () => {
    vi.setSystemTime(new Date("2026-09-16T08:00:00Z"));
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await dayRow(t, own.websiteId, "2026-09-16", 100, [100, 0, 0, 0]);
    await dayRow(t, own.websiteId, "2026-09-18", 100, [2, 1, 1, 0]);
    await dayRow(t, own.websiteId, "2026-09-20", 2_400, [2_300, 0, 0, 0]);
    await listPage(t, own.websiteId, "2026-09-20", { listOffset: 0, listLimit: 1_000, listItems: 400 });
    const asKorda = await member(t, korda);

    const [line] = await asKorda.query(api.siteCharts.siteSeries, { siteId: own.holdId, from: "2026-09-01", to: "2026-09-30", step: "day" });
    expect(line.points.map((point) => [point.day, point.firstCheck ?? false, point.firstList ?? false, point.rankedNew])).toEqual([
      ["2026-09-16", true, false, 0],
      ["2026-09-18", false, false, 2],
      ["2026-09-20", false, true, 0],
    ]);
  });
});
