import { describe, expect, it } from "vitest";
import {
  buildDailySeries,
  findVersionChangeDays,
  groupFailures,
  percentile,
  splitByPeriod,
  summariseLatency,
  summarisePeriod,
  type ObservabilityRun,
} from "./agentObservabilityService";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A fixed instant so the tests never depend on when they run. 2026-07-29T12:00:00Z. */
const NOW = Date.UTC(2026, 6, 29, 12, 0, 0);

function run(overrides: Partial<ObservabilityRun> = {}): ObservabilityRun {
  return { status: "SUCCESS", startedAt: NOW, ...overrides };
}

describe("percentile", () => {
  it("matches a hand-computed sample rather than an interpolated one", () => {
    // 20 values, 1..20. Nearest rank for p95 is ceil(0.95 * 20) = 19, so the
    // 19th smallest, which is 19.
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(percentile(values, 95)).toBe(19);
    expect(percentile(values, 50)).toBe(10);
    expect(percentile(values, 100)).toBe(20);
  });

  it("returns a value that was actually observed", () => {
    const values = [1, 2, 100];
    expect(values).toContain(percentile(values, 50));
    expect(values).toContain(percentile(values, 95));
  });

  it("does not care what order the values arrive in", () => {
    expect(percentile([9, 1, 5, 3, 7], 50)).toBe(percentile([1, 3, 5, 7, 9], 50));
  });

  it("handles an empty sample without dividing by zero", () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe("summariseLatency", () => {
  it("surfaces the slow tail that the mean hides", () => {
    // Ninety fast runs and ten very slow ones. The mean reads 6.6s and sounds
    // acceptable; one run in ten actually takes thirty seconds, and that is the
    // one somebody complains about.
    const values = [
      ...Array.from({ length: 90 }, () => 4000),
      ...Array.from({ length: 10 }, () => 30000),
    ];
    const summary = summariseLatency(values);

    expect(summary.medianMs).toBe(4000);
    expect(summary.p95Ms).toBe(30000);
    expect(Math.round(summary.averageMs)).toBe(6600);
    expect(summary.sampleSize).toBe(100);
  });

  it("holds the 95th percentile to its definition at the boundary", () => {
    // Exactly one slow run in twenty is the top 5%, not the 95th percentile:
    // nineteen of twenty runs do come in at 4000, so that is what 95% is under.
    const values = [...Array.from({ length: 19 }, () => 4000), 30000];
    expect(summariseLatency(values).p95Ms).toBe(4000);

    // Two slow runs in twenty push the tail past the boundary.
    const worse = [...Array.from({ length: 18 }, () => 4000), 30000, 30000];
    expect(summariseLatency(worse).p95Ms).toBe(30000);
  });

  it("reports zeros for an empty sample rather than NaN", () => {
    expect(summariseLatency([])).toEqual({ medianMs: 0, p95Ms: 0, averageMs: 0, sampleSize: 0 });
  });
});

describe("buildDailySeries", () => {
  it("includes days where nothing ran", () => {
    const series = buildDailySeries([run({ startedAt: NOW })], { days: 7, now: NOW });
    expect(series).toHaveLength(7);
    expect(series.filter((day) => day.total === 0)).toHaveLength(6);
  });

  it("returns the days in chronological order, ending today", () => {
    const series = buildDailySeries([], { days: 3, now: NOW });
    expect(series[0].dayStartMs).toBeLessThan(series[2].dayStartMs);
    expect(series[2].dayStartMs).toBe(Date.UTC(2026, 6, 29));
  });

  it("counts successes, failures and cost into the right day", () => {
    const series = buildDailySeries(
      [
        run({ startedAt: NOW, status: "SUCCESS", costGBP: 0.01 }),
        run({ startedAt: NOW, status: "FAILED", costGBP: 0.02 }),
        run({ startedAt: NOW, status: "CANCELLED", costGBP: 0.03 }),
        run({ startedAt: NOW - DAY_MS, status: "SUCCESS", costGBP: 0.5 }),
      ],
      { days: 7, now: NOW }
    );

    const today = series[series.length - 1];
    expect(today.total).toBe(3);
    expect(today.succeeded).toBe(1);
    // A cancelled run counts as failed, matching how the rest of the screen reads.
    expect(today.failed).toBe(2);
    expect(today.costGBP).toBeCloseTo(0.06, 5);

    expect(series[series.length - 2].total).toBe(1);
  });

  it("drops runs that fall outside the window instead of piling them onto day one", () => {
    const series = buildDailySeries([run({ startedAt: NOW - 30 * DAY_MS })], { days: 7, now: NOW });
    expect(series.every((day) => day.total === 0)).toBe(true);
  });
});

describe("findVersionChangeDays", () => {
  it("marks the day a new configuration first carried traffic", () => {
    const days = findVersionChangeDays([
      run({ startedAt: NOW - 3 * DAY_MS, agentVersionId: "v1" }),
      run({ startedAt: NOW - 2 * DAY_MS, agentVersionId: "v1" }),
      run({ startedAt: NOW - DAY_MS, agentVersionId: "v2" }),
      run({ startedAt: NOW, agentVersionId: "v2" }),
    ]);

    expect(days).toEqual([Date.UTC(2026, 6, 28)]);
  });

  it("does not mark the first run in the window as a change", () => {
    // There is nothing before it to have changed from, and marking it would put
    // a marker on day one of every chart.
    expect(findVersionChangeDays([run({ agentVersionId: "v1" })])).toEqual([]);
  });

  it("does not care what order the runs arrive in", () => {
    const ordered = findVersionChangeDays([
      run({ startedAt: NOW - 2 * DAY_MS, agentVersionId: "v1" }),
      run({ startedAt: NOW, agentVersionId: "v2" }),
    ]);
    const shuffled = findVersionChangeDays([
      run({ startedAt: NOW, agentVersionId: "v2" }),
      run({ startedAt: NOW - 2 * DAY_MS, agentVersionId: "v1" }),
    ]);
    expect(shuffled).toEqual(ordered);
  });

  it("treats gaining a version as a change from having none", () => {
    const days = findVersionChangeDays([
      run({ startedAt: NOW - DAY_MS, agentVersionId: undefined }),
      run({ startedAt: NOW, agentVersionId: "v1" }),
    ]);
    expect(days).toEqual([Date.UTC(2026, 6, 29)]);
  });

  it("marks each change once, however many runs followed it", () => {
    const days = findVersionChangeDays([
      run({ startedAt: NOW - 2 * DAY_MS, agentVersionId: "v1" }),
      run({ startedAt: NOW - DAY_MS, agentVersionId: "v2" }),
      run({ startedAt: NOW - DAY_MS + 1000, agentVersionId: "v2" }),
      run({ startedAt: NOW - DAY_MS + 2000, agentVersionId: "v2" }),
    ]);
    expect(days).toHaveLength(1);
  });

  it("reports nothing when the agent never changed", () => {
    expect(findVersionChangeDays([])).toEqual([]);
  });
});

describe("splitByPeriod", () => {
  it("puts the window being reported and the one before it in separate buckets", () => {
    const { current, previous } = splitByPeriod(
      [
        run({ startedAt: NOW - 1 * DAY_MS }),
        run({ startedAt: NOW - 6 * DAY_MS }),
        run({ startedAt: NOW - 9 * DAY_MS }),
        run({ startedAt: NOW - 20 * DAY_MS }),
      ],
      { days: 7, now: NOW }
    );

    expect(current).toHaveLength(2);
    expect(previous).toHaveLength(1);
  });
});

describe("summarisePeriod", () => {
  it("computes success rate over settled runs only, so in-flight work does not drag it down", () => {
    const totals = summarisePeriod([
      run({ status: "SUCCESS" }),
      run({ status: "SUCCESS" }),
      run({ status: "SUCCESS" }),
      run({ status: "FAILED" }),
      run({ status: "RUNNING" }),
    ]);

    expect(totals.runs).toBe(5);
    expect(totals.succeeded).toBe(3);
    expect(totals.failed).toBe(1);
    expect(totals.successRate).toBe(0.75);
  });

  it("reports zero rather than NaN when nothing has run", () => {
    const totals = summarisePeriod([]);
    expect(totals.successRate).toBe(0);
    expect(totals.costPerRunGBP).toBe(0);
  });
});

describe("groupFailures", () => {
  it("collapses the same fault worded differently into one row", () => {
    const groups = groupFailures([
      { failureKey: "search timed out", message: "Search timed out after 24000ms", at: 200, runId: "r1" },
      { failureKey: "search timed out", message: "Search timed out", at: 100, runId: "r2" },
      { failureKey: "model refused", message: "The model refused to answer", at: 150, runId: "r3" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].count).toBe(2);
    expect(groups[0].firstSeenAt).toBe(100);
    expect(groups[0].lastSeenAt).toBe(200);
  });

  it("labels a group with its shortest wording", () => {
    const groups = groupFailures([
      { failureKey: "k", message: "Search timed out after 24000ms on run abc", at: 1 },
      { failureKey: "k", message: "Search timed out", at: 2 },
    ]);
    expect(groups[0].label).toBe("Search timed out");
  });

  it("orders the worst first", () => {
    const groups = groupFailures([
      { failureKey: "rare", message: "Rare", at: 1 },
      { failureKey: "common", message: "Common", at: 1 },
      { failureKey: "common", message: "Common", at: 2 },
    ]);
    expect(groups[0].failureKey).toBe("common");
  });

  it("caps the example runs so one noisy failure cannot bloat the payload", () => {
    const entries = Array.from({ length: 500 }, (_, index) => ({
      failureKey: "k",
      message: "Same failure",
      at: index,
      runId: `run_${index}`,
    }));
    expect(groupFailures(entries)[0].runIds).toHaveLength(20);
    expect(groupFailures(entries)[0].count).toBe(500);
  });

  it("returns nothing when there are no failures", () => {
    expect(groupFailures([])).toEqual([]);
  });
});
