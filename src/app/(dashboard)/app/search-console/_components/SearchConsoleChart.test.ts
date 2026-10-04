import { describe, expect, it } from "vitest";
import { chartPoints } from "./SearchConsoleChart";

const day = (date: string) => ({ day: date, clicks: 10, impressions: 100, ctr: 0.1, position: 5 });
const readout = (first: string, last: string, days: number, part: boolean) => `${first}..${last} ${days}${part ? " part" : ""}`;

/**
 * A week or month the dates or the history cut short holds fewer days, so it
 * is marked as part of one and its hover names its days (2026-10-04: the
 * Performance line dipped at the edges of the dates, as if clicks had fallen).
 */
describe("the Search Console line chart's weeks and months", () => {
  const days = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-09", "2026-09-30", "2026-10-02"].map(day);
  const held = { from: "2026-07-04", to: "2026-10-02" };

  it("marks a week cut by the dates, and names each week's days", () => {
    const weeks = chartPoints(days, { from: "2026-08-01", to: "2026-08-16", step: "week" }, held, readout);
    expect(weeks.map((week) => [week.day, week.part ?? false, week.readout])).toEqual([
      ["2026-07-27", true, "2026-08-01..2026-08-02 2 part"],
      ["2026-08-03", false, "2026-08-03..2026-08-09 7"],
      ["2026-08-10", false, "2026-08-10..2026-08-16 7"],
    ]);
    expect(weeks[0].clicks).toBe(20);
  });

  it("marks a month cut by the newest day held", () => {
    const months = chartPoints(days, { from: "2026-09-01", to: "2026-10-31", step: "month" }, held, readout);
    expect(months.map((month) => [month.day, month.part ?? false])).toEqual([["2026-09-01", false], ["2026-10-01", true]]);
  });

  it("leaves days alone: a day is always whole", () => {
    const daily = chartPoints(days, { from: "2026-08-01", to: "2026-08-03", step: "day" }, held, readout);
    expect(daily.every((point) => !point.part && point.readout === undefined)).toBe(true);
  });
});
