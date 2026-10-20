import { describe, expect, it } from "vitest";
import { formatPerConversion } from "./analyticsFormat";
import { beforeOver, visitsPerConversion, type CostPoint } from "./visitsPerConversion";

/**
 * Conversions' "Visits needed for one conversion" (Anthony, 2026-10-20): each
 * step's visits over its conversions, a step with none left without a figure,
 * and the days just before laid over this period's day for day.
 */

const day = (date: string, visits: number, conversions: number): CostPoint => ({ day: date, visits, conversions });
/** Monday 5 to Sunday 11 October 2026, each day's own figures. */
const week = (visits: number, conversions: (at: number) => number) => Array.from({ length: 7 }, (_, at) => day(`2026-10-${String(5 + at).padStart(2, "0")}`, visits, conversions(at)));

describe("visits for one conversion", () => {
  it("divides each day's visits by its conversions, and leaves a day with none without a figure", () => {
    const rows = visitsPerConversion([day("2026-10-05", 240, 5), day("2026-10-06", 180, 0), day("2026-10-07", 90, 4)], null, "day");
    expect(rows.map((row) => row.perConversion)).toEqual([48, null, 22.5]);
    expect(rows[1]).toMatchObject({ first: "2026-10-06", visits: 180, conversions: 0, perConversionBefore: null });
  });

  it("adds a week's days up before dividing, so a day with none still counts its visits", () => {
    const [row] = visitsPerConversion(week(100, (at) => at % 2), null, "week");
    expect(row).toMatchObject({ day: "2026-10-05", lastDay: "2026-10-11", visits: 700, conversions: 3, perConversion: 233.3, coarse: false });
  });

  it("gives a week held whole its own figure on a chart by day, and says it is a whole week", () => {
    const [row] = visitsPerConversion([{ day: "2026-06-01", lastDay: "2026-06-07", visits: 700, conversions: 14 }], null, "day");
    expect(row).toMatchObject({ perConversion: 50, coarse: true });
  });

  it("lays the days before over this period's day for day, and adds them up into a week", () => {
    // Already dated onto this period's days by the read.
    const before = week(50, () => 2);
    const rows = visitsPerConversion([day("2026-10-05", 240, 5), day("2026-10-06", 180, 0)], before, "day");
    expect(rows.map((row) => row.perConversionBefore)).toEqual([25, 25]);
    expect(rows[1]).toMatchObject({ visitsBefore: 50, conversionsBefore: 2 });
    const [whole] = visitsPerConversion(week(60, () => 1), before, "week");
    expect(whole).toMatchObject({ visitsBefore: 350, conversionsBefore: 14, perConversionBefore: 25 });
  });

  it("counts only the days before that fall in a step", () => {
    expect(beforeOver(week(50, () => 2), "2026-10-09", "2026-10-20")).toEqual({ visits: 150, conversions: 6 });
    expect(beforeOver(week(50, () => 2), "2026-10-12", "2026-10-20")).toEqual({ visits: 0, conversions: 0 });
  });

  it("reads whole from ten up, to one decimal under ten, and a dash with no conversion", () => {
    expect(formatPerConversion(43.54)).toBe("44");
    expect(formatPerConversion(1234)).toBe("1,234");
    expect(formatPerConversion(3.24)).toBe("3.2");
    expect(formatPerConversion(null)).toBe("–");
  });
});
