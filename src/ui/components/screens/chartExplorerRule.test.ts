import { describe, expect, it } from "vitest";
import { scoreWindows, scoresOf, stepFor, stepKey, verdictOf, whole, yearComparable, type StepSpan } from "./chartExplorerRule";

/**
 * The rule every configurable chart follows (`ChartExplorer`; screen-kit.md, "Configurable charts"): steps from the
 * dates, whole steps, a year before only for This Year, and better or worse over the latest whole steps.
 */

const month = (key: string, last: string): StepSpan => ({ key, first: `${key}-01`, last });

describe("a configurable chart's rule", () => {
  it("steps by day for the weeks and months, by week for the quarters and by month for the year (calendar-periods-plan.md, rule 8)", () => {
    expect(["thisWeek", "lastWeek", "thisMonth", "lastMonth"].map(stepFor)).toEqual(["day", "day", "day", "day"]);
    expect([stepFor("thisQuarter"), stepFor("lastQuarter"), stepFor("thisYear")]).toEqual(["week", "week", "month"]);
    expect([stepKey("2026-10-21", "day"), stepKey("2026-10-21", "week"), stepKey("2026-10-21", "month")]).toEqual(["2026-10-21", "2026-10-19", "2026-10"]);
  });

  it("sets the dates against a year before only for This Year, month against month", () => {
    expect(["thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisQuarter", "lastQuarter"].map(yearComparable)).toEqual([false, false, false, false, false, false]);
    expect(yearComparable("thisYear")).toBe(true);
  });

  it("calls a step whole only when it holds every one of its days", () => {
    expect(whole({ key: "2026-10-12", first: "2026-10-12", last: "2026-10-18" }, "week")).toBe(true);
    // The dates start on a Wednesday, or end on a Monday.
    expect(whole({ key: "2026-07-20", first: "2026-07-22", last: "2026-07-26" }, "week")).toBe(false);
    expect(whole({ key: "2026-10-19", first: "2026-10-19", last: "2026-10-19" }, "week")).toBe(false);
    expect(whole(month("2026-09", "2026-09-30"), "month")).toBe(true);
    expect(whole(month("2026-10", "2026-10-19"), "month")).toBe(false);
  });

  it("scores the latest whole step, the last three and a year before, leaving out the month still going", () => {
    const now = ["05", "06", "07", "08", "09"].map((at) => month(`2026-${at}`, `2026-${at}-${at === "06" || at === "09" ? 30 : 31}`)).concat(month("2026-10", "2026-10-19"));
    const year = ["07", "08", "09"].map((at) => month(`2025-${at}`, `2025-${at}-${at === "09" ? 30 : 31}`));
    const windows = scoreWindows([], now, year, "month");
    expect(windows.latest.map((span) => span.key)).toEqual(["2026-09"]);
    expect(windows.previous.map((span) => span.key)).toEqual(["2026-08"]);
    expect(windows.last3.map((span) => span.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(windows.previous3.map((span) => span.key)).toEqual(["2026-05", "2026-06"]);
    const [score] = scoresOf(windows, [{ key: "all", name: "Everything" }], (_line, spans) => spans.length * 10);
    // A window short of its steps says nothing: two months before the last three, not three.
    expect(score).toEqual({ key: "all", name: "Everything", latest: 10, previous: 10, last3: 30, previous3: null, yearAgo: 30 });
  });

  it("says better, worse or about the same by the measure's own direction", () => {
    expect(verdictOf(true, 60, 80)).toEqual({ kind: "better", by: 25 });
    expect(verdictOf(false, 60, 80)).toEqual({ kind: "worse", by: 25 });
    expect(verdictOf(true, 100, 101)).toEqual({ kind: "same", by: 0 });
    expect(verdictOf(false, 5, null)).toBeNull();
  });
});
