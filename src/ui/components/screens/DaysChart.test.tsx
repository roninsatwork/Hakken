import { describe, expect, test } from "vitest";
import { daysChartRows, daysScores, type DaysLine } from "./DaysChart";

const line = (key: string, points: Array<[string, number, string?]>, extra: Partial<DaysLine> = {}): DaysLine => ({
  key, name: key, colour: "#000", points: points.map(([day, value, lastDay]) => ({ day, value, ...(lastDay ? { lastDay } : {}) })), ...extra,
});

describe("a chart's rows", () => {
  test("a day is a row, in order, named by its day", () => {
    const rows = daysChartRows("day", [line("now", [["2026-10-02", 5], ["2026-10-01", 3]])]);
    expect(rows.map((row) => [row.day, row.now])).toEqual([["2026-10-01", 3], ["2026-10-02", 5]]);
  });

  test("days add up into their week, from its Monday, and into their month", () => {
    const days: Array<[string, number]> = [["2026-10-05", 1], ["2026-10-06", 2], ["2026-10-12", 4], ["2026-11-02", 8]];
    expect(daysChartRows("week", [line("now", days)]).map((row) => [row.day, row.now])).toEqual([["2026-10-05", 3], ["2026-10-12", 4], ["2026-11-02", 8]]);
    expect(daysChartRows("month", [line("now", days)]).map((row) => [row.day, row.now])).toEqual([["2026-10-01", 7], ["2026-11-01", 8]]);
  });

  test("a week held whole, on a daily chart, is drawn as its average, and says so", () => {
    const [row] = daysChartRows("day", [line("now", [["2026-10-05", 70, "2026-10-11"]])]);
    expect(row.now).toBe(10);
    expect(row.coarse).toBe(true);
    expect(row.lastDay).toBe("2026-10-11");
  });

  test("a line with no point in a step is nought, unless it has gaps", () => {
    const rows = daysChartRows("day", [line("now", [["2026-10-01", 3], ["2026-10-02", 5]]), line("page", [["2026-10-01", 1]]), line("before", [["2026-10-01", 2]], { gaps: true })]);
    expect(rows[1].page).toBe(0);
    expect(rows[1].before).toBeNull();
    expect(rows[0].before).toBe(2);
  });

  test("the span before can be laid under the dates, first under first, whatever its own dates", () => {
    const rows = daysChartRows("day", [line("now", [["2026-10-01", 3], ["2026-10-02", 5], ["2026-10-03", 7]]), line("was", [["2026-09-01", 1], ["2026-09-02", 2]], { under: true })]);
    expect(rows.map((row) => row.was)).toEqual([1, 2, null]);
    expect(rows.map((row) => row.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  test("a line laid under makes no rows of its own", () => {
    expect(daysChartRows("day", [line("was", [["2026-09-01", 1]], { under: true })])).toEqual([]);
  });
});

describe("Up or down", () => {
  // Whole weeks from Monday 14 September 2026, each day worth its week's number.
  const week = (monday: string, value: number): Array<[string, number]> => Array.from({ length: 7 }, (_, at) => [new Date(Date.parse(`${monday}T00:00:00Z`) + at * 86_400_000).toISOString().slice(0, 10), value]);
  const before = [...week("2026-09-14", 1), ...week("2026-09-21", 2)];
  const now = [...week("2026-09-28", 3), ...week("2026-10-05", 4), ...week("2026-10-12", 5), ...week("2026-10-19", 6)];

  test("whole weeks, with the span before them on its own dates, and the week the dates cut left out", () => {
    const cut = [...now, ["2026-10-26", 100] as [string, number]];
    const [score] = daysScores("week", [{ key: "visits", name: "Visits", now: line("n", cut).points, before: line("b", before).points }]);
    expect(score.latest).toBe(6 * 7);
    expect(score.previous).toBe(5 * 7);
    expect(score.last3).toBe((4 + 5 + 6) * 7);
    expect(score.previous3).toBe((1 + 2 + 3) * 7);
    expect(score.yearAgo).toBeNull();
  });

  test("a week that starts in the span before and ends in the dates is still a whole week", () => {
    const week2 = week("2026-09-28", 3);
    const [score] = daysScores("week", [{
      key: "visits", name: "Visits",
      now: line("n", [...week2.filter(([day]) => day >= "2026-10-01"), ...week("2026-10-05", 4), ...week("2026-10-12", 5), ...week("2026-10-19", 6)]).points,
      before: line("b", [...before, ...week2.filter(([day]) => day < "2026-10-01")]).points,
    }]);
    expect(score.last3).toBe((4 + 5 + 6) * 7);
    expect(score.previous3).toBe((1 + 2 + 3) * 7);
  });

  test("too few steps for a window says nothing rather than a part of one", () => {
    const [score] = daysScores("week", [{ key: "visits", name: "Visits", now: line("n", week("2026-10-19", 6)).points }]);
    expect(score.latest).toBe(42);
    expect(score.previous).toBeNull();
    expect(score.last3).toBeNull();
  });

  test("each line keeps its own figures", () => {
    const scores = daysScores("week", [{ key: "a", name: "A", now: line("n", week("2026-10-19", 1)).points }, { key: "b", name: "B", now: line("n", week("2026-10-19", 2)).points }]);
    expect(scores.map((score) => [score.key, score.latest])).toEqual([["a", 7], ["b", 14]]);
  });
});
