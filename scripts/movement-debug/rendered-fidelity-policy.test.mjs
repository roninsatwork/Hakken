import { describe, expect, it } from "vitest";
import {
  RENDERED_FIDELITY_POLICY,
  classifyRenderedFidelitySample,
  contiguousRenderedFidelityRuns,
} from "../../src/lib/movements/renderedFidelityPolicy.mjs";

describe("rendered avatar fidelity policy", () => {
  it.each([
    [0.1, "pass"],
    [0.1001, "repair-required"],
    [0.15, "repair-required"],
    [0.1501, "blocked"],
    [0.25, "blocked"],
    [0.2501, "severe"],
  ])("classifies trustworthy error %s as %s", (error, outcome) => {
    expect(classifyRenderedFidelitySample({ confidence: 0.9, error })).toBe(outcome);
  });

  it("does not turn weak or missing source evidence into a fidelity pass", () => {
    expect(classifyRenderedFidelitySample({ confidence: 0.44, error: 0.01 })).toBe("source-limited");
    expect(classifyRenderedFidelitySample({ confidence: 0.7, error: 0.3 })).toBe("limited-review");
    expect(classifyRenderedFidelitySample({ confidence: 0.9, error: null })).toBe("proof-limited");
  });

  it("finds the three-frame repair run required by the acceptance contract", () => {
    const samples = [0, 1, 2, 4].map((frameIndex) => ({ frameIndex, outcome: "repair-required" }));
    const runs = contiguousRenderedFidelityRuns(samples, ({ outcome }) => outcome === "repair-required");
    expect(runs.map((run) => run.map(({ frameIndex }) => frameIndex))).toEqual([[0, 1, 2], [4]]);
    expect(runs[0]).toHaveLength(RENDERED_FIDELITY_POLICY.sustainedRepairFrames);
  });
});
