import { describe, expect, it } from "vitest";
import { whole } from "@/src/ui/components/screens/chartExplorerRule";
import { bucketsOf, linesOf, measureOf, rowsOf, scoresOf, type ExplorerPoint } from "./explorerRule";

/**
 * A page's "Visits for one conversion" explorer (page-conversion-explorer-plan.md): steps from the dates, points
 * held whole spread over their days, the lines chosen, each measure, the span compared and the scorecard.
 */

const EVENTS = ["prospectus", "visit"];
const day = (date: string, rows: Array<[string, number, number, number]>): ExplorerPoint => ({
  day: date, lastDay: date, rows: rows.map(([channel, visits, prospectus, visit]) => ({ channel, visits, counts: [prospectus, visit] })),
});

describe("the explorer's rule", () => {
  it("spreads a week held whole over the months its days fall in", () => {
    // Monday 28 September to Sunday 4 October: three days in September, four in October.
    const week: ExplorerPoint = { day: "2026-09-28", lastDay: "2026-10-04", rows: [{ channel: "Organic Search", visits: 700, counts: [7, 0] }] };
    const months = bucketsOf([week], "month", 2);
    expect(months.map((bucket) => [bucket.key, Math.round(bucket.channels.get("Organic Search")!.visits)])).toEqual([["2026-09", 300], ["2026-10", 400]]);
  });

  it("draws a line per channel, per kind, or one, each measure from the ticked channels and kinds", () => {
    const buckets = bucketsOf([day("2026-10-05", [["Organic Search", 100, 2, 2], ["Paid Search", 60, 1, 0]])], "day", 2);
    const pick = { measure: "perOne" as const, kinds: ["prospectus", "visit"], channels: ["Organic Search", "Paid Search"] };
    const byChannel = rowsOf(buckets, null, linesOf({ ...pick, lines: "channel" }), "perOne", EVENTS)[0].values;
    expect(byChannel).toEqual({ "c:Organic Search": 25, "c:Paid Search": 60 });
    const byKind = rowsOf(buckets, null, linesOf({ ...pick, lines: "kind" }), "perOne", EVENTS)[0].values;
    expect(byKind).toEqual({ "k:prospectus": 53.3, "k:visit": 80 });
    const one = rowsOf(buckets, null, linesOf({ ...pick, lines: "one" }), "conversions", EVENTS)[0].values;
    expect(one).toEqual({ all: 5 });
    expect(measureOf("rate", { visits: 160, conversions: 5 })).toBe(3.1);
    // No conversion: no figure for visits for one, never nought.
    expect(measureOf("perOne", { visits: 40, conversions: 0 })).toBeNull();
  });

  it("puts the span compared beside each step, the newest against the newest", () => {
    const now = bucketsOf([day("2026-10-05", [["Organic Search", 100, 4, 0]]), day("2026-10-06", [["Organic Search", 90, 3, 0]])], "day", 2);
    const before = bucketsOf([day("2026-10-03", [["Organic Search", 50, 1, 0]]), day("2026-10-04", [["Organic Search", 60, 2, 0]])], "day", 2);
    const rows = rowsOf(now, before, linesOf({ measure: "perOne", kinds: ["prospectus"], channels: ["Organic Search"], lines: "one" }), "perOne", EVENTS);
    expect(rows.map((row) => row.values)).toEqual([{ all: 25, "all~": 50 }, { all: 30, "all~": 30 }]);
    // Each point's visits and conversions, for its readout.
    expect(rows[0].sums).toEqual({ all: { visits: 100, conversions: 4 }, "all~": { visits: 50, conversions: 1 } });
  });

  it("marks a week or month the dates cut as a part of one, its points spread over the steps", () => {
    // 90 days to Monday 19 October: the last week holds that Monday alone; the first starts on a Wednesday.
    const weeks = bucketsOf([day("2026-07-22", [["Organic Search", 10, 0, 0]]), day("2026-07-27", [["Organic Search", 10, 0, 0]]), day("2026-10-19", [["Organic Search", 10, 0, 0]])], "week", 2);
    expect(weeks.map((bucket) => [bucket.key, whole(bucket, "week")])).toEqual([["2026-07-20", false], ["2026-07-27", false], ["2026-10-19", false]]);
    const full = bucketsOf([{ day: "2026-07-27", lastDay: "2026-08-02", rows: [{ channel: "Organic Search", visits: 70, counts: [0, 0] }] }], "week", 2);
    expect(whole(full[0], "week")).toBe(true);
    // 12 months to 19 October: October still going.
    const months = bucketsOf([{ day: "2026-09-01", lastDay: "2026-09-30", rows: [] }, { day: "2026-10-01", lastDay: "2026-10-19", rows: [] }], "month", 2);
    expect(months.map((bucket) => whole(bucket, "month"))).toEqual([true, false]);
  });

  it("gives a step with visits and no conversion no figure, and keeps its visits for the readout", () => {
    const now = bucketsOf([day("2026-10-05", [["Organic Search", 40, 0, 0]])], "day", 2);
    const [row] = rowsOf(now, null, linesOf({ measure: "perOne", kinds: ["prospectus"], channels: ["Organic Search"], lines: "one" }), "perOne", EVENTS);
    expect(row.values).toEqual({ all: null });
    expect(row.sums).toEqual({ all: { visits: 40, conversions: 0 } });
  });

  it("scores the latest whole step, the last three and a year before, leaving out the month still going", () => {
    const month = (start: string, end: string, visits: number, prospectus: number): ExplorerPoint => ({ day: start, lastDay: end, rows: [{ channel: "Organic Search", visits, counts: [prospectus, 0] }] });
    const now = bucketsOf([
      month("2026-05-01", "2026-05-31", 1000, 10), month("2026-06-01", "2026-06-30", 1000, 10), month("2026-07-01", "2026-07-31", 900, 10),
      month("2026-08-01", "2026-08-31", 800, 10), month("2026-09-01", "2026-09-30", 600, 10), month("2026-10-01", "2026-10-19", 500, 1),
    ], "month", 2);
    const year = bucketsOf([month("2025-07-01", "2025-07-31", 2000, 10), month("2025-08-01", "2025-08-31", 2000, 10), month("2025-09-01", "2025-09-30", 2000, 10)], "month", 2);
    const lines = linesOf({ measure: "perOne", kinds: ["prospectus"], channels: ["Organic Search"], lines: "one" }).map((line) => ({ ...line, name: "Everything ticked" }));
    const [score] = scoresOf([], now, year, lines, "perOne", "month", EVENTS);
    // October is still going: September is the latest, against August; July to September against April to June.
    expect(score).toMatchObject({ latest: 60, previous: 80, last3: 76.7, yearAgo: 200 });
    expect(score.previous3).toBeNull();
    expect(score.name).toBe("Everything ticked");
  });
});
