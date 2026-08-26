import { describe, expect, test } from "vitest";
import { metricsClearingRatchet } from "./coverageRatchet.mjs";

/**
 * The ratchet-up prompt, proven to fire.
 *
 * `coverage-thresholds.json` carried a `nextRatchet` block that nothing read
 * for months. Once something did read it, nothing demonstrated that it read
 * correctly — and a check nobody has watched fire is indistinguishable from
 * one that cannot. It has genuinely never fired against real numbers, because
 * platform coverage is still short of every target; that is the honest reason,
 * and it is exactly why the behaviour has to be shown here instead.
 */
describe("coverage ratchet prompt", () => {
  const rows = [
    { metric: "lines", actual: 69.96 },
    { metric: "statements", actual: 67.76 },
    { metric: "branches", actual: 58.05 },
    { metric: "functions", actual: 66.07 },
  ];
  const targets = { lines: 72, statements: 70, branches: 61, functions: 69 };

  test("says nothing while every metric is short of its target", () => {
    expect(metricsClearingRatchet(rows, targets)).toEqual([]);
  });

  test("names the metric that cleared, and only that one", () => {
    const improved = rows.map((row) => (row.metric === "branches" ? { ...row, actual: 61.4 } : row));

    expect(metricsClearingRatchet(improved, targets)).toEqual([
      { metric: "branches", actual: 61.4, target: 61 },
    ]);
  });

  test("counts landing exactly on the target as cleared", () => {
    const exact = rows.map((row) => (row.metric === "lines" ? { ...row, actual: 72 } : row));

    expect(metricsClearingRatchet(exact, targets)).toEqual([
      { metric: "lines", actual: 72, target: 72 },
    ]);
  });

  test("a metric with no target is never named", () => {
    expect(metricsClearingRatchet(rows, { branches: 1 })).toEqual([
      { metric: "branches", actual: 58.05, target: 1 },
    ]);
  });

  test("no targets at all means nothing to say", () => {
    expect(metricsClearingRatchet(rows, undefined)).toEqual([]);
  });
});
