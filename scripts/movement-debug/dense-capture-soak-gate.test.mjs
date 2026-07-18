import { describe, expect, it } from "vitest";
import { auditDenseCaptureSoakResults } from "./dense-capture-soak-gate.mjs";

function results(overrides = {}) {
  return {
    candidates: [{
      id: "bodypix-mobilenet-v1-075-q2",
      sampleCount: 90,
      status: "measured",
      sustainedPerformance: { latencyDriftRatio: 1.05, tensorMemoryGrowthMb: 0.2 },
      thermalMeasurementStatus: "automated-soak-complete",
    }],
    cycles: 3,
    evidenceType: "sustained-performance",
    ...overrides,
  };
}

describe("dense capture soak gate", () => {
  it("accepts bounded three-cycle sustained evidence without calling it thermal approval", () => {
    expect(auditDenseCaptureSoakResults(results())).toEqual({ failures: [], passed: true });
  });

  it("rejects short runs, latency drift, and tensor-memory growth", () => {
    const report = auditDenseCaptureSoakResults(results({
      candidates: [{
        id: "bodypix-mobilenet-v1-075-q2",
        sampleCount: 30,
        status: "measured",
        sustainedPerformance: { latencyDriftRatio: 1.5, tensorMemoryGrowthMb: 9 },
        thermalMeasurementStatus: "pending-manual",
      }],
      cycles: 1,
    }));

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/at least 3 cycles/),
      expect.stringMatching(/at least 90 samples/),
      expect.stringMatching(/latency drift/),
      expect.stringMatching(/tensor-memory growth/),
      expect.stringMatching(/sustained-performance status/),
    ]));
  });
});
