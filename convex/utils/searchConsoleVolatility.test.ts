import { describe, expect, test } from "vitest";
import { aboveUsual, completeDays, dayVolatility, levelOf, periodVolatility, type Standing } from "./searchConsoleVolatility";

/** Keywords on a day: name → [impressions, average position]. */
const day = (rows: Record<string, [number, number]>): Map<string, Standing> =>
  new Map(Object.entries(rows).map(([keyword, [impressions, position]]) => [keyword, { impressions, positionSum: impressions * position }]));

/** Ten keywords with 20 impressions, each at the position given. */
const ten = (position: (at: number) => number) => day(Object.fromEntries(Array.from({ length: 10 }, (_, at) => [`k${at}`, [20, position(at)] as [number, number]])));

describe("volatility (search-console-volatility-plan.md §3)", () => {
  test("nothing moved is 0; every keyword moving ten places or more is 10", () => {
    expect(dayVolatility(ten(() => 4), ten(() => 4)).volatility).toBe(0);
    expect(dayVolatility(ten(() => 15), ten(() => 4)).volatility).toBe(10);
  });

  test("a keyword's move counts up to 10 places, so one fall of forty cannot carry the day", () => {
    const today = ten((at) => (at === 0 ? 44 : 4));
    expect(dayVolatility(today, ten(() => 4)).volatility).toBe(1);
  });

  test("a keyword counts only with 10 or more impressions on both days", () => {
    const today = ten(() => 6);
    today.set("rare", { impressions: 9, positionSum: 9 * 50 });
    const before = ten(() => 4);
    before.set("rare", { impressions: 40, positionSum: 40 * 4 });
    expect(dayVolatility(today, before)).toEqual({ volatility: 2, volatilityUp: 0, volatilityDown: 2, volatilityKeywords: 10, movedUp5: 0, movedDown5: 0 });
  });

  test("fewer than 10 keywords counted is too few to judge: no score, the counts kept", () => {
    const today = day({ a: [20, 10], b: [20, 3] });
    expect(dayVolatility(today, day({ a: [20, 4], b: [20, 9] }))).toEqual({ volatilityKeywords: 2, movedUp5: 1, movedDown5: 1 });
  });

  test("moved 5 places or more, up and down apart", () => {
    const today = ten((at) => (at < 3 ? 12 : at < 5 ? 1 : 4));
    expect(dayVolatility(today, ten((at) => (at < 3 ? 6 : at < 5 ? 7 : 4)))).toMatchObject({ movedUp5: 2, movedDown5: 3 });
  });

  test("the score in two parts that add up to it: Up from the keywords that climbed, Down from those that fell (2026-11-20)", () => {
    // Four climb 3 places, three fall 5, one falls forty (counted as 10), two stay: (12 + 15 + 10) / 10.
    const before = ten(() => 20);
    const today = ten((at) => (at < 4 ? 17 : at < 7 ? 25 : at === 7 ? 60 : 20));
    expect(dayVolatility(today, before)).toMatchObject({ volatility: 3.7, volatilityUp: 1.2, volatilityDown: 2.5 });
    // Rounded so the two still add up to the score as written: 1.25 Up of 2.5 is 1.3 and 1.2, never 1.3 and 1.3.
    const halves = dayVolatility(ten((at) => (at < 5 ? 17.5 : 22.5)), ten(() => 20));
    expect(halves).toMatchObject({ volatility: 2.5 });
    expect(halves.volatilityUp! + halves.volatilityDown!).toBeCloseTo(2.5, 10);
    // Too few counted: no score, so no parts either.
    expect(dayVolatility(day({ a: [20, 10] }), day({ a: [20, 4] }))).not.toHaveProperty("volatilityUp");
  });

  test("a week's or month's parts are the average of its days', only when every day with a score has them", () => {
    expect(periodVolatility([
      { volatility: 2, volatilityUp: 0.5, volatilityDown: 1.5, volatilityKeywords: 10, movedUp5: 0, movedDown5: 0 },
      { volatility: 4, volatilityUp: 3, volatilityDown: 1, volatilityKeywords: 10, movedUp5: 0, movedDown5: 0 },
    ])).toMatchObject({ volatility: 3, volatilityUp: 1.8, volatilityDown: 1.2 });
    // A day built before the parts were kept leaves the period with its score alone.
    const mixed = periodVolatility([
      { volatility: 2, volatilityKeywords: 10, movedUp5: 0, movedDown5: 0 },
      { volatility: 4, volatilityUp: 3, volatilityDown: 1, volatilityKeywords: 10, movedUp5: 0, movedDown5: 0 },
    ]);
    expect(mixed).toMatchObject({ volatility: 3 });
    expect(mixed).not.toHaveProperty("volatilityUp");
  });

  test("a week or month is the average of its days' scores, its counts added up", () => {
    expect(periodVolatility([
      { volatility: 2, volatilityKeywords: 10, movedUp5: 1, movedDown5: 0 },
      { volatilityKeywords: 4, movedUp5: 0, movedDown5: 1 },
      { volatility: 5, volatilityKeywords: 12, movedUp5: 0, movedDown5: 3 },
    ])).toEqual({ volatility: 3.5, volatilityKeywords: 26, movedUp5: 1, movedDown5: 4 });
    expect(periodVolatility([{ volatilityKeywords: 3, movedUp5: 0, movedDown5: 0 }]).volatility).toBeUndefined();
  });

  test("levels against the website's own usual: High from 30% above it, Very high from 60% (changed 2026-10-11)", () => {
    expect([levelOf(1.9, 1.5), levelOf(1.95, 1.5), levelOf(2.39, 1.5), levelOf(2.4, 1.5)]).toEqual(["NORMAL", "HIGH", "HIGH", "VERY_HIGH"]);
    expect(levelOf(9, null)).toBe("NORMAL");
  });

  test("a day Google has only half filled in is not complete: fewer than half the keywords of the fortnight before", () => {
    const days = [120, 110, 130, 125, 20, 61].map((keywords, at) => ({ week: `2026-10-0${at + 1}`, volatilityKeywords: keywords }));
    expect([...completeDays(days)]).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-06"]);
    expect([...completeDays([{ week: "2026-10-01" }, { week: "2026-10-02", volatilityKeywords: 5 }])]).toEqual(["2026-10-02"]);
  });

  test("how much more than usual, as a whole percentage", () => {
    expect([aboveUsual(2.06, 1.54), aboveUsual(1.4, 1.5), aboveUsual(2, null), aboveUsual(null, 1.5)]).toEqual([34, null, null, null]);
  });
});
