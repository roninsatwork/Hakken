import { describe, expect, test } from "vitest";
import { chartReportFigures, chartReportTitle } from "./hakkenChartReport";
import { nextRunOf } from "./hakkenTaskTiming";
import { mainConversionAt } from "./assistantCharts";

/**
 * A chart sent at a time (sees-side-panel-plan-2026-10-31.md, phase 5): its figures worked out in code, its title as
 * the Hakken tasks page lists it, and when a chart sent once goes.
 */

const day = (date: string, visits: number, conversions: number, purchase: number) => ({ day: date, visits, conversions, events: [purchase], eventVisits: [purchase] });

describe("a chart's figures", () => {
  test("a total for visits and conversions; for the rate, the period's conversions over its visits, never an average of days", () => {
    const now = [day("2026-10-01", 100, 2, 1), day("2026-10-02", 300, 12, 3)];
    const before = [day("2026-09-29", 200, 2, 1), day("2026-09-30", 200, 2, 1)];
    expect(chartReportFigures(now, before, "visits", null)).toEqual({ from: "2026-10-01", to: "2026-10-02", values: [100, 300], figure: 400, figureBefore: 400 });
    expect(chartReportFigures(now, null, "conversions", 0)).toMatchObject({ values: [1, 3], figure: 4 });
    // 14 of 400 visits: 3.5%, where the days' own rates (2% and 4%) would average 3%.
    expect(chartReportFigures(now, before, "conversionRate", null)).toMatchObject({ figure: 3.5, figureBefore: 1 });
  });
});

describe("its title", () => {
  test("says when it goes and what it shows, in plain words", () => {
    expect(chartReportTitle({ look: "analyticsChart", measure: "conversionRate", period: "lastMonth", every: "once", weekday: 5, sendOn: "2026-10-02" }))
      .toBe("On 2 October, send me a chart of the share of visits that converted");
    expect(chartReportTitle({ look: "analyticsChart", measure: "conversions", event: "add_to_cart", period: "lastWeek", every: "week", weekday: 1 }))
      .toBe("Every Monday, send me a chart of add to cart each day");
  });
});

describe("when a chart sent once goes", () => {
  const once = { timeOfDay: "10:00", timeZone: "Europe/London", report: { every: "once" as const, weekday: 5, sendOn: "2026-10-02" } };
  test("at the owner's time on its day, not before", () => {
    expect(nextRunOf(once, Date.parse("2026-10-01T09:30:00Z"))).toBe(Date.parse("2026-10-02T09:00:00Z"));
    // Across the clocks going back: 10am in London is 10:00 UTC on 26 October.
    expect(nextRunOf({ ...once, report: { ...once.report, sendOn: "2026-10-26" } }, Date.parse("2026-10-01T09:30:00Z"))).toBe(Date.parse("2026-10-26T10:00:00Z"));
  });
  test("its day reached but its time passed: the next day, so a late yes is still sent", () => {
    expect(nextRunOf(once, Date.parse("2026-10-02T11:00:00Z"))).toBe(Date.parse("2026-10-03T09:00:00Z"));
  });
});

describe("the conversion a rate is of", () => {
  test("a shop's purchase, else the conversion done most; never every conversion together", () => {
    const points = [{ events: [40, 3, 9] }, { events: [50, 2, 8] }];
    expect(mainConversionAt(["add_to_cart", "purchase", "sign_up"], points)).toBe(1);
    expect(mainConversionAt(["add_to_cart", "sign_up"], [{ events: [4, 9] }])).toBe(1);
    expect(mainConversionAt(["add_to_cart", "purchase"], [{ events: [0, 0] }])).toBeNull();
  });
});
