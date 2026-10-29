import { describe, expect, it } from "vitest";
import {
  openingPeriod,
  customSpans,
  CALENDAR_PERIODS,
  isCalendarPeriod,
  periodBounds,
  periodSpan,
  shiftMonths,
  spanBefore,
  sameDayBefore,
  spanYearBefore,
  stepOf,
  stepsOf,
  ukDay,
} from "./calendarPeriods";

// Tuesday 20 October 2026.
const TODAY = "2026-10-20";

describe("calendar periods (calendar-periods-plan.md, rules 1–9; sees-header-and-rolling-dates-plan.md, part two)", () => {
  it("names the seven, in the menu's order, with the quarters and the year gone (Anthony, 2026-10-29)", () => {
    expect(CALENDAR_PERIODS).toEqual(["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"]);
    expect(isCalendarPeriod("lastMonth")).toBe(true);
    expect(isCalendarPeriod("lastQuarter")).toBe(false);
    expect(isCalendarPeriod("30")).toBe(false);
  });

  it("runs a rolling period back from the newest day held, the same number of whole months, and sets it against the months before", () => {
    // Thursday 29 October 2026, Google Analytics' newest day the 28th (the canvas of 2026-10-29).
    expect(periodSpan("last3Months", "2026-10-29", "2026-10-28")).toEqual({ from: "2026-07-29", to: "2026-10-28", whole: true });
    expect(periodSpan("last6Months", "2026-10-29", "2026-10-28")).toEqual({ from: "2026-04-29", to: "2026-10-28", whole: true });
    expect(periodSpan("last12Months", "2026-10-29", "2026-10-28")).toEqual({ from: "2025-10-29", to: "2026-10-28", whole: true });
    // Sites' newest day is today itself; a source ahead of today still ends on today.
    expect(periodSpan("last3Months", "2026-10-29", "2026-10-29")).toEqual({ from: "2026-07-30", to: "2026-10-29", whole: true });
    expect(periodBounds("last3Months", "2026-10-29")).toEqual({ from: "2026-07-30", to: "2026-10-29" });
    const three = periodSpan("last3Months", "2026-10-29", "2026-10-28")!;
    expect(spanBefore("last3Months", three)).toEqual({ from: "2026-04-29", to: "2026-07-28", whole: true });
    const year = periodSpan("last12Months", "2026-10-29", "2026-10-28")!;
    expect(spanBefore("last12Months", year)).toEqual({ from: "2024-10-29", to: "2025-10-28", whole: true });
    // Only the 12 months have a year before: the 12 months before them.
    expect(spanYearBefore("last12Months", year)).toEqual(spanBefore("last12Months", year));
    expect(spanYearBefore("last3Months", three)).toBeNull();
    expect(spanYearBefore("last6Months", periodSpan("last6Months", "2026-10-29", "2026-10-28")!)).toBeNull();
    // A day's match in the months before.
    expect(sameDayBefore("last3Months", "2026-10-15")).toBe("2026-07-15");
    // The end of a shorter month: 31 May back three months is 28 February, so the span starts 1 March.
    expect(periodSpan("last3Months", "2026-06-01", "2026-05-31")).toEqual({ from: "2026-03-01", to: "2026-05-31", whole: true });
  });

  it("gives custom dates the same number of days before them, and a step by their length", () => {
    expect(customSpans("2026-09-01", "2026-09-30")).toEqual({ span: { from: "2026-09-01", to: "2026-09-30", whole: true }, before: { from: "2026-08-02", to: "2026-08-31", whole: true }, step: "day" });
    expect(customSpans("2026-05-01", "2026-10-28").step).toBe("week");
    expect(customSpans("2025-10-01", "2026-10-28").step).toBe("month");
  });

  it("bounds each period in calendar weeks from Monday and months", () => {
    expect(periodBounds("thisWeek", TODAY)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(periodBounds("lastWeek", TODAY)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(periodBounds("thisMonth", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodBounds("lastMonth", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    // A Sunday is the last day of its week.
    expect(periodBounds("thisWeek", "2026-10-25")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
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
  });

  it("draws weeks and months by the day, 3 and 6 months by the week and 12 months by the month", () => {
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
