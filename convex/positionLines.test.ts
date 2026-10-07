import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { recomputeSearchStats } from "./websiteTrackingStats";
import { setPoint } from "./positionHistory";

/**
 * A search's line kept day by day for 90 days, then a week at a time — each
 * week's last of each kind, the point a week's step of a chart already shows
 * — then a month at a time past a year (keep-less-history-plan.md, part 1;
 * B1 before it). The hourly sweep coarsens a month once it is wholly past
 * the 90 days; the charts' weeks and months read the same before and after,
 * a day's step says where it turns weekly, and the summary and the compare
 * column read the point kept.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const UK = 2826;
/** A Wednesday: the 90 days kept day by day begin on 1 October. */
const NOW = Date.parse("2026-12-30T12:00:00Z");
const KEPT_FROM = "2026-10-01";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const dayAfter = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Korda tracking "carp rods": a check every day from Monday 21 September to
 * Sunday 4 October, the site 10th on the first and a place lower each day;
 * its keyword list filed it on 22 and 24 September too, after the day's
 * check — the day's point, the later standing.
 */
async function seed(t: Harness) {
  vi.setSystemTime(Date.parse("2026-09-21T09:00:00Z"));
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
    await ctx.db.insert("websiteKeywords", { websiteId, companyWebsiteId: holdId, keyword: "carp rods", isActive: true, createdAt: Date.now() });
    await ctx.db.insert("siteKeywordRanks", {
      websiteId, locationCode: UK, keyword: "carp rods", band: "p04_10", page: "/rods", url: "https://kordatackle.com/rods",
      volume: 480, volumeKnown: true, intent: "BUYING", status: "SAME", change: 0, day: "2026-10-04", firstSeenDay: "2026-09-21",
      position: 23,
    } as never);
    for (let index = 0; index < 14; index += 1) {
      await setPoint(ctx, { websiteId, keyword: "carp rods", locationCode: UK, day: dayAfter("2026-09-21", index) }, { position: 10 + index, kind: "CHECK" });
    }
    for (const day of ["2026-09-22", "2026-09-24"]) {
      await setPoint(ctx, { websiteId, keyword: "carp rods", locationCode: UK, day }, { position: 9, kind: "LIST" });
    }
    return { companyId, websiteId, holdId };
  });
  vi.setSystemTime(NOW);
  return ids;
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

/** The sweep's thinning, step after step, until it has nothing more to do now. */
async function coarsen(t: Harness) {
  for (let step = 0; step < 100; step += 1) {
    const done = await t.mutation(internal.seoCollectionSweep.sweepDuty, { duty: "thinPositions" });
    if (!done.more) return step + 1;
  }
  throw new Error("The coarsening never finished.");
}

const kept = (t: Harness) => t.run(async (ctx) => (await ctx.db.query("keywordPositionMonths").collect())
  .map((record) => [record.month, record.grain, record.days, record.kinds.map((kind) => (kind === 1 ? "check" : "list"))]));

describe("a keyword's line kept 90 days daily, then a week at a time", () => {
  test("a month wholly past the 90 days keeps each week's last check and the list's last apart; the 90 days stay daily", async () => {
    const t = harness();
    await seed(t);

    await coarsen(t);

    expect(await kept(t)).toEqual([
      // Week 21–27 September: the list's last filing and its last check; 28–30, the week stopping at the month's end.
      ["2026-09", "WEEK", [24, 27, 30], ["list", "check", "check"]],
      // From 1 October, inside the 90 days: every day.
      ["2026-10", "DAY", [1, 2, 3, 4], ["check", "check", "check", "check"]],
    ]);
    // A second sweep finds nothing more to do.
    expect(await coarsen(t)).toBe(1);
  });

  test("a month is coarsened once its last day passes the 90 days", async () => {
    const t = harness();
    await seed(t);
    vi.setSystemTime(Date.parse("2027-01-29T12:00:00Z"));
    await coarsen(t);
    expect((await kept(t))[1]).toEqual(["2026-10", "DAY", [1, 2, 3, 4], ["check", "check", "check", "check"]]);

    vi.setSystemTime(Date.parse("2027-01-31T12:00:00Z"));
    await coarsen(t);
    expect((await kept(t))[1]).toEqual(["2026-10", "WEEK", [4], ["check"]]);
  });

  test("a chart's weeks and months read the same after, and its days say where they turn weekly", async () => {
    const t = harness();
    const s = await seed(t);
    const asKorda = await member(t, s.companyId);
    const chart = (step: "day" | "week" | "month") =>
      asKorda.query(api.siteGoogle.searchPositions, { siteId: s.holdId, keywords: ["carp rods"], from: "2026-09-01", to: "2026-10-31", step });
    const weeks = await chart("week");
    const months = await chart("month");

    await coarsen(t);

    expect(await chart("week")).toEqual(weeks);
    expect(await chart("month")).toEqual(months);
    expect(weeks[0].weeklyBefore).toBeNull();
    const days = await chart("day");
    expect(days[0].weeklyBefore).toBe(KEPT_FROM);
    expect(days[0].points.map((point) => [point.day, point.position])).toEqual([
      ["2026-09-24", 9],
      ["2026-09-27", 16],
      ["2026-09-30", 19],
      ["2026-10-01", 20], ["2026-10-02", 21], ["2026-10-03", 22], ["2026-10-04", 23],
    ]);
  });

  test("a search checked again after its weeks are coarsened keeps its first check in its summary", async () => {
    const t = harness();
    const s = await seed(t);
    const key = { websiteId: s.websiteId, keyword: "carp rods", locationCode: UK };
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteSearchStats", {
        ...key, firstCheckedDay: "2026-09-21", lastCheckedDay: "2026-10-04", lastPosition: 23, bestPosition: 9, everRanked: true, updatedAt: Date.now(),
      });
    });
    await coarsen(t);

    await t.run(async (ctx) => await recomputeSearchStats(ctx, key));

    // Its 21 September check was cleared, the week keeping its last: the summary still says it was first checked then.
    const stats = await t.run(async (ctx) => await ctx.db.query("websiteSearchStats").withIndex("by_key", (q) =>
      q.eq("websiteId", key.websiteId).eq("keyword", key.keyword).eq("locationCode", key.locationCode)).unique());
    expect(stats).toMatchObject({ firstCheckedDay: "2026-09-21", bestPosition: 9, lastCheckedDay: "2026-10-04", lastPosition: 23 });
  });

  test("compared with a day past the 90 days, a keyword shows its week's last point", async () => {
    const t = harness();
    const s = await seed(t);
    await coarsen(t);
    const asKorda = await member(t, s.companyId);

    const [onWednesday] = await asKorda.query(api.siteKeywords.keywordsOnDay, { siteId: s.holdId, day: "2026-09-23", keywords: ["carp rods"] });
    expect(onWednesday).toMatchObject({ position: 16, checked: true });
    // A day inside the 90 days reads its own check.
    const [onFriday] = await asKorda.query(api.siteKeywords.keywordsOnDay, { siteId: s.holdId, day: "2026-10-02", keywords: ["carp rods"] });
    expect(onFriday).toMatchObject({ position: 21, checked: true });
  });
});
