import { describe, expect, test } from "vitest";
import { createTimelineMap, formatAnalyticsDateGroup, getAggregationType } from "./analyticsService";

describe("analytics service helpers", () => {
  test("selects daily, weekly, and monthly aggregation windows", () => {
    const day = 24 * 60 * 60 * 1000;

    expect(getAggregationType(0, 30 * day)).toBe("day");
    expect(getAggregationType(0, 90 * day)).toBe("week");
    expect(getAggregationType(0, 365 * day)).toBe("month");
  });

  test("formats week groups with optional year suffix", () => {
    const date = new Date("2026-05-31T12:00:00.000Z");

    expect(formatAnalyticsDateGroup(date, "week")).toMatch(/^Wk \d+$/);
    expect(formatAnalyticsDateGroup(date, "week", { includeWeekYear: true })).toMatch(/^Wk \d+, 2026$/);
  });

  test("preseeds timeline maps across a date window", () => {
    const timeline = createTimelineMap(
      new Date("2026-05-01T00:00:00.000Z"),
      new Date("2026-05-03T00:00:00.000Z"),
      "day",
      () => ({ cost: 0 })
    );

    expect(Object.keys(timeline)).toEqual(["1 May", "2 May", "3 May"]);
  });
});
