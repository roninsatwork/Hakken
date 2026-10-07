import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  coarsened,
  coarsenPositions,
  monthsBefore,
  newestPoints,
  pointOnDay,
  pointsBetween,
  removeChecksOfSearch,
  setPoint,
  weekSpanOf,
  type PositionPoint,
} from "./positionHistory";
import { packKeywordPositions } from "./positionHistoryMigration";
import schema from "./schema";

/**
 * A keyword's positions kept as a line a month (keep-less-history-plan.md,
 * part 1): one point a day, the later sighting standing; coarser with age —
 * each week's last of each kind past 90 days, the month's last past a year,
 * nothing past two years; and the rows kept a check packed into it.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const UK = 2826;
const point = (day: string, position: number | null, kind: PositionPoint["kind"] = "LIST", url: string | null = null): PositionPoint =>
  ({ day, position, pagePosition: position === null ? null : position + 2, url, kind });

async function setup() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const otherId = await ctx.db.insert("websites", { host: "rival.test", displayHost: "rival.test", firstSeenAt: 1 });
    const pull = (operationId: string) => ctx.db.insert("seoDataPulls", {
      operationId, family: "DataForSEO", mode: "QUEUED", websiteId, taskArgsJson: "{}", status: "READY",
      tag: `t-${operationId}`, attempts: 1, costUsd: 0.02, sandbox: false, submittedAt: 1,
    } as never);
    return { websiteId, otherId, listPull: await pull("domain_ranked_keywords"), checkPull: await pull("serp_google_organic") };
  });
  return { t, ...ids };
}

const records = (t: Harness) => t.run((ctx) => ctx.db.query("keywordPositionMonths").collect());

describe("the line's days, weeks and months", () => {
  test("a week runs Monday to Sunday and stops at its month's edges", () => {
    expect(weekSpanOf("2026-10-07")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(weekSpanOf("2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-04" });
    expect(weekSpanOf("2026-09-29")).toEqual({ from: "2026-09-28", to: "2026-09-30" });
  });

  test("months count back across a year's turn", () => {
    expect(monthsBefore("2026-10", 12)).toBe("2025-10");
    expect(monthsBefore("2026-01", 1)).toBe("2025-12");
    expect(monthsBefore("2026-03", 24)).toBe("2024-03");
  });

  test("a week's grain keeps each week's last of each kind; a month's, the month's", () => {
    const points = [
      point("2026-03-02", 9), point("2026-03-04", 7, "CHECK"), point("2026-03-05", 6), point("2026-03-06", 5, "CHECK"),
      point("2026-03-10", 4), point("2026-03-31", 3),
    ];
    expect(coarsened(points, "WEEK").map((kept) => kept.day)).toEqual(["2026-03-05", "2026-03-06", "2026-03-10", "2026-03-31"]);
    expect(coarsened(points, "MONTH").map((kept) => kept.day)).toEqual(["2026-03-06", "2026-03-31"]);
  });
});

describe("filing a point", () => {
  test("a month's points live in one record, each address kept once", async () => {
    const { t, websiteId } = await setup();
    await t.run(async (ctx) => {
      const key = { websiteId, keyword: "red shoes", locationCode: UK };
      await setPoint(ctx, { ...key, day: "2026-10-03" }, { position: 4, pagePosition: 6, url: "https://acme-shop.test/red", kind: "LIST" });
      await setPoint(ctx, { ...key, day: "2026-10-01" }, { position: 5, url: "https://acme-shop.test/red", kind: "CHECK" });
      await setPoint(ctx, { ...key, day: "2026-10-02" }, { kind: "CHECK" });
    });
    const [record, ...rest] = await records(t);
    expect(rest).toEqual([]);
    expect(record).toMatchObject({
      month: "2026-10", grain: "DAY", days: [1, 2, 3], positions: [5, null, 4], pagePositions: [null, null, 6],
      kinds: [1, 1, 0], pages: ["https://acme-shop.test/red"], pageRefs: [0, -1, 0],
    });
  });

  test("a later sighting the same day replaces the earlier, whatever filed it", async () => {
    const { t, websiteId } = await setup();
    const key = { websiteId, keyword: "red shoes", locationCode: UK, day: "2026-10-03" };
    await t.run(async (ctx) => {
      await setPoint(ctx, key, { position: 4, url: "https://acme-shop.test/old", kind: "LIST" });
      await setPoint(ctx, key, { position: 2, url: "https://acme-shop.test/new", kind: "CHECK" });
    });
    const [record] = await records(t);
    expect(record).toMatchObject({ days: [3], positions: [2], kinds: [1], pages: ["https://acme-shop.test/new"], pageRefs: [0] });
  });

  test("another place is another line", async () => {
    const { t, websiteId } = await setup();
    await t.run(async (ctx) => {
      await setPoint(ctx, { websiteId, keyword: "red shoes", locationCode: UK, day: "2026-10-03" }, { position: 4, kind: "LIST" });
      await setPoint(ctx, { websiteId, keyword: "red shoes", locationCode: 1006886, day: "2026-10-03" }, { position: 9, kind: "LIST" });
    });
    expect((await records(t)).map((record) => [record.locationCode, record.positions])).toEqual([[UK, [4]], [1006886, [9]]]);
  });

  test("a point filed late into a coarsened month is coarsened with it", async () => {
    const { t, websiteId } = await setup();
    const key = { websiteId, keyword: "red shoes", locationCode: UK };
    await t.run(async (ctx) => {
      await setPoint(ctx, { ...key, day: "2026-03-06" }, { position: 5, kind: "LIST" });
      const [record] = await ctx.db.query("keywordPositionMonths").collect();
      await ctx.db.patch(record._id, { grain: "WEEK" });
      await setPoint(ctx, { ...key, day: "2026-03-04" }, { position: 8, kind: "LIST" });
      await setPoint(ctx, { ...key, day: "2026-03-10" }, { position: 3, kind: "LIST" });
    });
    expect((await records(t))[0]).toMatchObject({ grain: "WEEK", days: [6, 10], positions: [5, 3] });
  });
});

describe("reading a line", () => {
  async function line() {
    const setupDone = await setup();
    const key = { websiteId: setupDone.websiteId, keyword: "red shoes", locationCode: UK };
    await setupDone.t.run(async (ctx) => {
      for (const [day, position] of [["2026-08-30", 9], ["2026-09-02", 8], ["2026-09-30", 7], ["2026-10-01", 6], ["2026-10-05", 5]] as const) {
        await setPoint(ctx, { ...key, day }, { position, kind: "LIST" });
      }
    });
    return { ...setupDone, key };
  }

  test("between two days, oldest first, across months", async () => {
    const { t, key } = await line();
    const points = await t.run((ctx) => pointsBetween(ctx, key, "2026-09-01", "2026-10-03"));
    expect(points.map((kept) => [kept.day, kept.position])).toEqual([["2026-09-02", 8], ["2026-09-30", 7], ["2026-10-01", 6]]);
  });

  test("the newest, newest first", async () => {
    const { t, key } = await line();
    const points = await t.run((ctx) => newestPoints(ctx, key, 3));
    expect(points.map((kept) => kept.day)).toEqual(["2026-10-05", "2026-10-01", "2026-09-30"]);
  });

  test("a day's point; past the 90 days, the point kept for its week or month", async () => {
    const { t, websiteId } = await setup();
    const key = { websiteId, keyword: "red shoes", locationCode: UK };
    await t.run(async (ctx) => {
      await setPoint(ctx, { ...key, day: "2026-10-05" }, { position: 5, kind: "LIST" });
      await setPoint(ctx, { ...key, day: "2026-05-08" }, { position: 6, kind: "LIST" });
      await setPoint(ctx, { ...key, day: "2025-08-29" }, { position: 7, kind: "LIST" });
      const august = (await ctx.db.query("keywordPositionMonths").collect()).find((record) => record.month === "2025-08");
      await ctx.db.patch(august!._id, { grain: "MONTH" });
    });
    const on = (day: string) => t.run((ctx) => pointOnDay(ctx, { ...key, day, today: "2026-10-07" }));
    expect((await on("2026-10-05"))?.position).toBe(5);
    expect(await on("2026-10-04")).toBeNull();
    expect((await on("2026-05-06"))?.position).toBe(6);
    expect(await on("2026-05-11")).toBeNull();
    expect((await on("2025-08-02"))?.position).toBe(7);
  });
});

describe("coarser with age", () => {
  test("a month wholly past 90 days goes weekly, past a year monthly, past two years goes", async () => {
    const { t, websiteId } = await setup();
    const key = { websiteId, keyword: "red shoes", locationCode: UK };
    await t.run(async (ctx) => {
      for (const day of ["2026-10-01", "2026-10-02", "2026-07-01", "2026-07-02", "2026-06-01", "2026-06-02", "2026-06-09",
        "2025-08-01", "2025-08-20", "2024-09-30"]) {
        await setPoint(ctx, { ...key, day }, { position: Number(day.slice(8)), kind: "LIST" });
      }
    });
    const now = Date.parse("2026-10-07T12:00:00Z");
    expect(await t.run((ctx) => coarsenPositions(ctx, now))).toEqual({ more: false });
    const kept = Object.fromEntries((await records(t)).map((record) => [record.month, [record.grain, record.days]]));
    expect(kept).toEqual({
      "2026-10": ["DAY", [1, 2]],
      // The 90 days began on 9 July: July is not yet wholly past them.
      "2026-07": ["DAY", [1, 2]],
      "2026-06": ["WEEK", [2, 9]],
      "2025-08": ["MONTH", [20]],
    });
    expect(await t.run((ctx) => coarsenPositions(ctx, now))).toEqual({ more: false });
    expect((await records(t)).length).toBe(4);
  });
});

describe("taking a search's checks away", () => {
  test("only that day's checks, from every website; a record left empty goes", async () => {
    const { t, websiteId, otherId } = await setup();
    await t.run(async (ctx) => {
      await setPoint(ctx, { websiteId, keyword: "red shoes", locationCode: UK, day: "2026-10-03" }, { position: 4, kind: "CHECK" });
      await setPoint(ctx, { websiteId, keyword: "red shoes", locationCode: UK, day: "2026-10-04" }, { position: 3, kind: "CHECK" });
      await setPoint(ctx, { websiteId: otherId, keyword: "red shoes", locationCode: UK, day: "2026-10-03" }, { kind: "CHECK" });
      await setPoint(ctx, { websiteId, keyword: "blue shoes", locationCode: UK, day: "2026-10-03" }, { position: 2, kind: "CHECK" });
      await setPoint(ctx, { websiteId: otherId, keyword: "red shoes", locationCode: UK, day: "2026-10-05" }, { position: 9, kind: "LIST" });
    });
    let after: Id<"websites"> | null = null;
    let removed = 0;
    let passes = 0;
    do {
      const step: { removed: number; after: Id<"websites"> | null } = await t.run((ctx) =>
        removeChecksOfSearch(ctx, { keyword: "red shoes", locationCode: UK, day: "2026-10-03" }, { after, take: 1 }));
      removed += step.removed;
      after = step.after;
      passes += 1;
    } while (after !== null);
    expect(removed).toBe(2);
    // A pass a website, and one to find none is left.
    expect(passes).toBe(3);
    const left = (await records(t)).map((record) => [record.websiteId === websiteId ? "acme" : "rival", record.keyword, record.days]);
    expect(left).toEqual([["acme", "red shoes", [4]], ["rival", "red shoes", [5]], ["acme", "blue shoes", [3]]]);
  });
});

describe("packing the rows kept a check", () => {
  test("each row becomes its month's point, by the kind its purchase was; a place unset was the UK", async () => {
    const { t, websiteId, listPull, checkPull } = await setup();
    await t.run(async (ctx) => {
      const row = (day: string, pullId: Id<"seoDataPulls">, extra: object) =>
        ctx.db.insert("seoKeywordPositions", { websiteId, keyword: "red shoes", day, pullId, createdAt: 1, ...extra });
      await row("2026-09-29", listPull, { position: 7, url: "https://acme-shop.test/red", searchVolume: 900 });
      await row("2026-09-30", checkPull, { locationCode: UK });
      await row("2026-10-01", checkPull, { locationCode: UK, position: 5, pagePosition: 8, url: "https://acme-shop.test/red" });
      await row("2026-10-01", listPull, { locationCode: 1006886, position: 9 });
    });
    let cursor: string | null = null;
    for (;;) {
      const page = await t.run((ctx) => packKeywordPositions(ctx, cursor, 2));
      cursor = page.cursor;
      if (page.isDone) break;
    }
    const packedOnce = await records(t);
    expect(packedOnce.map((record) => [record.locationCode, record.month, record.days, record.positions, record.kinds, record.pages]))
      .toEqual([
        [UK, "2026-09", [29, 30], [7, null], [0, 1], ["https://acme-shop.test/red"]],
        [UK, "2026-10", [1], [5], [1], ["https://acme-shop.test/red"]],
        [1006886, "2026-10", [1], [9], [0], []],
      ]);
    // Run again: nothing changes.
    await t.run((ctx) => packKeywordPositions(ctx, null, 100));
    expect(await records(t)).toEqual(packedOnce);
    // And the check over the rows finds each day's point.
    expect(await t.action(internal.positionHistoryMigration.comparePacked, {})).toEqual({ rows: 4, matched: 4, differing: [] });
    await t.run(async (ctx) => {
      const [october] = (await ctx.db.query("keywordPositionMonths").collect()).filter((record) => record.month === "2026-10");
      await ctx.db.patch(october._id, { positions: [6] });
    });
    expect(await t.action(internal.positionHistoryMigration.comparePacked, {})).toMatchObject({ rows: 4, matched: 3 });
  });
});

describe("filed beside the rows", () => {
  test("a check files a point for every site on the page and every one tracking it", async () => {
    const { t, websiteId, otherId, checkPull } = await setup();
    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId: otherId, relationship: "OWNED", createdAt: 1 });
      await ctx.db.insert("websiteKeywords", { websiteId: otherId, companyWebsiteId: holdId, keyword: "red shoes", isActive: true, createdAt: 1 });
    });
    await t.mutation(internal.seoKeywordChecks.writeKeywordCheck, {
      pullId: checkPull, keyword: "red shoes", locationCode: UK, day: "2026-10-03",
      found: [{ websiteId, position: 4, pagePosition: 6, url: "https://acme-shop.test/red" }],
    });
    const kept = (await records(t)).map((record) => [record.websiteId === websiteId ? "acme" : "rival", record.positions, record.kinds]);
    expect(kept).toEqual([["acme", [4], [1]], ["rival", [null], [1]]]);
  });
});
