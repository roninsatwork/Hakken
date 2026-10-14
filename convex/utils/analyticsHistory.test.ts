import { describe, expect, test } from "vitest";
import { daysIn, grainEnd, historyFloors, homeOf, pointsBetween } from "./analyticsHistory";

/**
 * Google Analytics' channels over time (ga-stored-figures-plan.md SF2, SF2b):
 * a day for 90 days, a week to 12 months, a month to two years, nothing older;
 * a chart draws each date at the finest grain kept for it, no day twice.
 */

const NEWEST = "2026-10-12";

describe("where a day's figures are kept", () => {
  test("the floors: 90 days, a year back to its Monday, two years back to its month", () => {
    expect(historyFloors(NEWEST)).toEqual({ day: "2026-07-15", week: "2025-10-13", month: "2024-10-01" });
  });

  test("a day as a day, then in its week, then in its month, then nowhere", () => {
    expect(homeOf("2026-07-15", NEWEST)).toEqual({ grain: "day", start: "2026-07-15" });
    expect(homeOf("2026-07-14", NEWEST)).toEqual({ grain: "week", start: "2026-07-13" });
    expect(homeOf("2025-10-13", NEWEST)).toEqual({ grain: "week", start: "2025-10-13" });
    expect(homeOf("2025-10-12", NEWEST)).toEqual({ grain: "month", start: "2025-10-01" });
    expect(homeOf("2024-10-01", NEWEST)).toEqual({ grain: "month", start: "2024-10-01" });
    expect(homeOf("2024-09-30", NEWEST)).toBeNull();
  });

  test("a week's and a month's last day", () => {
    expect(grainEnd("week", "2026-07-13")).toBe("2026-07-19");
    expect(grainEnd("month", "2026-02-01")).toBe("2026-02-28");
  });
});

describe("the points a chart draws", () => {
  test("30 days: every day", () => {
    const points = pointsBetween("2026-09-13", NEWEST, NEWEST);
    expect(points).toHaveLength(30);
    expect(points.every((point) => point.grain === "day")).toBe(true);
  });

  test("12 months: the last 90 days by day, the rest by week, the week at the edge cut where the days begin", () => {
    const points = pointsBetween("2025-10-13", NEWEST, NEWEST);
    expect(points.filter((point) => point.grain === "day")).toHaveLength(90);
    expect(points.filter((point) => point.grain === "month")).toHaveLength(0);
    const edge = points.find((point) => point.start === "2026-07-13");
    expect(edge).toEqual({ grain: "week", start: "2026-07-13", end: "2026-07-14" });
    expect(daysIn(edge!)).toBe(2);
    // Every day of the dates once.
    expect(points.reduce((sum, point) => sum + daysIn(point), 0)).toBe(365);
  });

  test("the 12 months before: by month, a month mostly inside the dates drawn whole", () => {
    const points = pointsBetween("2024-10-13", "2025-10-12", NEWEST);
    expect(points[0]).toEqual({ grain: "month", start: "2024-10-01", end: "2024-10-31" });
    expect(points).toHaveLength(13);
    expect(points.at(-1)).toEqual({ grain: "month", start: "2025-10-01", end: "2025-10-12" });
    expect(points.every((point) => point.grain === "month")).toBe(true);
  });
});
