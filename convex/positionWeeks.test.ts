import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { positionWeekOf } from "./positionWeeks";

/**
 * A search's positions are kept day by day for 90 days, then a week at a time:
 * each week's last check, the point a week's step of a chart already shows
 * (docs/plans/active/dataforseo-cost-plan.md, B1). The hourly sweep thins
 * them. The screens read the month records since keep-less-history-plan.md's
 * part 1, step B (`positionLines.test.ts`); these rows go in its step C.
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
 * its keyword list filed it on 22 and 24 September as well.
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
    const pull = async (operationId: string, day: string) => await ctx.db.insert("seoDataPulls", {
      operationId, family: "SERP", mode: "LIVE", taskArgsJson: "{}", status: "READY",
      tag: `t-${operationId}-${day}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(), completedAt: Date.now(),
    } as never);
    for (let index = 0; index < 14; index += 1) {
      const day = dayAfter("2026-09-21", index);
      const pullId = await pull("serp_google_organic", day);
      await ctx.db.insert("seoKeywordPositions", { websiteId, keyword: "carp rods", day, position: 10 + index, pullId, locationCode: UK, createdAt: Date.now() });
    }
    for (const day of ["2026-09-22", "2026-09-24"]) {
      const pullId = await pull("domain_ranked_keywords_list", day);
      await ctx.db.insert("seoKeywordPositions", { websiteId, keyword: "carp rods", day, position: 9, pullId, locationCode: UK, createdAt: Date.now() });
    }
    return { companyId, websiteId, holdId };
  });
  vi.setSystemTime(NOW);
  return ids;
}

/** The sweep's thinning, page after page, until it has nothing more to do now. */
async function thin(t: Harness) {
  for (let page = 0; page < 100; page += 1) {
    const done = await t.mutation(internal.seoCollectionSweep.sweepDuty, { duty: "thinPositions" });
    if (!done.more) return page + 1;
  }
  throw new Error("The thinning never finished.");
}

const kept = (t: Harness) => t.run(async (ctx) => {
  const rows = await ctx.db.query("seoKeywordPositions").collect();
  const kinds = await Promise.all(rows.map(async (row) => (await ctx.db.get(row.pullId))?.operationId === "serp_google_organic" ? "check" : "list"));
  return rows.map((row, index) => `${row.day} ${kinds[index]}`).sort();
});

describe("a position's week (B1)", () => {
  test("runs Monday to Sunday, inside its month", () => {
    expect(positionWeekOf("2026-09-23")).toEqual({ from: "2026-09-21", to: "2026-09-27" });
    expect(positionWeekOf("2026-09-29")).toEqual({ from: "2026-09-28", to: "2026-09-30" });
    expect(positionWeekOf("2026-10-02")).toEqual({ from: "2026-10-01", to: "2026-10-04" });
    expect(positionWeekOf("2026-12-28")).toEqual({ from: "2026-12-28", to: "2026-12-31" });
  });
});

describe("daily keyword positions kept 90 days, then a week at a time (B1)", () => {
  test("the sweep keeps each week's last check, and the keyword list's last apart; the 90 days stay daily", async () => {
    const t = harness();
    await seed(t);

    await thin(t);

    expect(await kept(t)).toEqual([
      // Week 21–27 September: its last check, and the list's last filing.
      "2026-09-24 list",
      "2026-09-27 check",
      // 28–30 September: the week stops at the month's end.
      "2026-09-30 check",
      // From 1 October, inside the 90 days: every day.
      "2026-10-01 check", "2026-10-02 check", "2026-10-03 check", "2026-10-04 check",
    ]);
    // A second sweep finds nothing more to do, and reads no week already thinned.
    expect(await thin(t)).toBe(1);
    expect(await t.run(async (ctx) => await ctx.db.query("positionThinning").first())).toMatchObject({ day: KEPT_FROM, cursor: null });
  });

  test("a day passing the 90 days is thinned on its turn", async () => {
    const t = harness();
    await seed(t);
    await thin(t);

    vi.setSystemTime(NOW + 86_400_000);
    await thin(t);

    expect((await kept(t)).filter((row) => row >= "2026-10")).toEqual(["2026-10-02 check", "2026-10-03 check", "2026-10-04 check"]);
  });
});
