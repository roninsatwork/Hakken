import { describe, expect, it } from "vitest";
import {
  openingPeriod,
  CALENDAR_PERIODS,
  isCalendarPeriod,
  periodBounds,
  periodSpan,
  shiftMonths,
  spanBefore,
  spanYearBefore,
  stepOf,
  stepsOf,
  ukDay,
} from "./calendarPeriods";

// Tuesday 20 October 2026.
const TODAY = "2026-10-20";

describe("calendar periods (calendar-periods-plan.md, rules 1–9)", () => {
  it("names the seven, in the menu's order", () => {
    expect(CALENDAR_PERIODS).toEqual(["thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisQuarter", "lastQuarter", "thisYear"]);
    expect(isCalendarPeriod("lastMonth")).toBe(true);
    expect(isCalendarPeriod("30")).toBe(false);
  });

  it("bounds each period in calendar weeks from Monday, months, quarters and the year", () => {
    expect(periodBounds("thisWeek", TODAY)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(periodBounds("lastWeek", TODAY)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(periodBounds("thisMonth", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodBounds("lastMonth", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodBounds("thisQuarter", TODAY)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(periodBounds("lastQuarter", TODAY)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(periodBounds("thisYear", TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    // A Sunday is the last day of its week, and January's last quarter is the year before's.
    expect(periodBounds("thisWeek", "2026-10-25")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(periodBounds("lastQuarter", "2026-01-05")).toEqual({ from: "2025-10-01", to: "2025-12-31" });
    expect(periodBounds("lastMonth", "2026-03-31")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("runs a period to its source's newest day, and holds none of it before its first day arrives", () => {
    // Google Analytics' newest is yesterday; Search Console's about three days back.
    expect(periodSpan("thisMonth", TODAY, "2026-10-19")).toEqual({ from: "2026-10-01", to: "2026-10-19", whole: false });
    expect(periodSpan("lastMonth", TODAY, "2026-10-19")).toEqual({ from: "2026-09-01", to: "2026-09-30", whole: true });
    expect(periodSpan("thisWeek", TODAY, "2026-10-17")).toBeNull();
    // Last Week before Google has sent its Sunday: to Google's newest day, not whole.
    expect(periodSpan("lastWeek", TODAY, "2026-10-17")).toEqual({ from: "2026-10-12", to: "2026-10-17", whole: false });
  });

  it("sets a whole period against the whole period before, and one in part against the same dates of it", () => {
    const september = periodSpan("lastMonth", TODAY, "2026-10-19")!;
    expect(spanBefore("lastMonth", september)).toEqual({ from: "2026-08-01", to: "2026-08-31", whole: true });
    const october = periodSpan("thisMonth", TODAY, "2026-10-19")!;
    expect(spanBefore("thisMonth", october)).toEqual({ from: "2026-09-01", to: "2026-09-19", whole: false });
    // Cut at the end of a shorter month: This Month on 31 October against 1–30 September.
    expect(spanBefore("thisMonth", { from: "2026-10-01", to: "2026-10-31", whole: false })).toEqual({ from: "2026-09-01", to: "2026-09-30", whole: false });
    expect(spanBefore("thisWeek", { from: "2026-10-19", to: "2026-10-20", whole: false })).toEqual({ from: "2026-10-12", to: "2026-10-13", whole: false });
    expect(spanBefore("thisQuarter", october)).toEqual({ from: "2026-07-01", to: "2026-07-19", whole: false });
    expect(spanBefore("lastQuarter", periodSpan("lastQuarter", TODAY, "2026-10-19")!)).toEqual({ from: "2026-04-01", to: "2026-06-30", whole: true });
    // This Year against the same days last year.
    expect(spanBefore("thisYear", { from: "2026-01-01", to: "2026-10-19", whole: false })).toEqual({ from: "2025-01-01", to: "2025-10-19", whole: false });
  });

  it("sets only the quarters and This Year against a year before", () => {
    const quarter = periodSpan("lastQuarter", TODAY, "2026-10-19")!;
    expect(spanYearBefore("lastQuarter", quarter)).toEqual({ from: "2025-07-01", to: "2025-09-30", whole: true });
    expect(spanYearBefore("thisQuarter", { from: "2026-10-01", to: "2026-10-19", whole: false })).toEqual({ from: "2025-10-01", to: "2025-10-19", whole: false });
    expect(spanYearBefore("thisYear", { from: "2026-01-01", to: "2026-10-19", whole: false })).toEqual({ from: "2025-01-01", to: "2025-10-19", whole: false });
    expect(spanYearBefore("lastMonth", periodSpan("lastMonth", TODAY, "2026-10-19")!)).toBeNull();
    expect(spanYearBefore("thisWeek", { from: "2026-10-19", to: "2026-10-19", whole: false })).toBeNull();
  });

  it("draws weeks and months by the day, quarters by the week and the year by the month", () => {
    expect(CALENDAR_PERIODS.map(stepOf)).toEqual(["day", "day", "day", "day", "week", "week", "month"]);
  });

  it("moves a day by months, keeping its day or the month's last", () => {
    expect(shiftMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonths("2024-02-29", -12)).toBe("2023-02-28");
    expect(shiftMonths("2026-01-15", -3)).toBe("2025-10-15");
  });

  it("reads the UK's date, which turns at UK midnight", () => {
    // 23:30 UTC on 20 October is 00:30 on the 21st in the UK (summer time).
    expect(ukDay(Date.UTC(2026, 9, 20, 23, 30))).toBe("2026-10-21");
    // In winter the UK is on UTC.
    expect(ukDay(Date.UTC(2026, 11, 20, 23, 30))).toBe("2026-12-20");
  });

  it("cuts a span into its steps, the first and last cut where the span cuts them", () => {
    expect(stepsOf({ from: "2026-10-01", to: "2026-10-19" }, "week")[0]).toEqual({ key: "2026-09-28", from: "2026-10-01", to: "2026-10-04" });
    expect(stepsOf({ from: "2026-10-01", to: "2026-10-19" }, "week").at(-1)).toEqual({ key: "2026-10-19", from: "2026-10-19", to: "2026-10-19" });
    expect(stepsOf({ from: "2026-01-01", to: "2026-10-19" }, "month").map((one) => one.key)).toHaveLength(10);
    expect(stepsOf({ from: "2026-09-01", to: "2026-09-30" }, "day")).toHaveLength(30);
  });

  it("opens on Last month, or This month for a website holding nothing of last month yet (agreed 2026-10-20)", () => {
    expect(openingPeriod("2025-06-01", "2026-10-20")).toBe("lastMonth");
    // Some of last month held: Last month, even in part.
    expect(openingPeriod("2026-09-25", "2026-10-20")).toBe("lastMonth");
    // First held this month: This month, until the 1st.
    expect(openingPeriod("2026-10-03", "2026-10-20")).toBe("thisMonth");
    expect(openingPeriod("2026-10-03", "2026-11-01")).toBe("lastMonth");
    // Nothing held at all: Last month, which says so.
    expect(openingPeriod(null, "2026-10-20")).toBe("lastMonth");
  });
});
