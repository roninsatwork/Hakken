import { describe, expect, it } from "vitest";
import {
  MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK,
  summarizeMovementDenseCaptureDeviceBenchmark,
  type MovementDenseCaptureDeviceBenchmarkSample,
} from "./movementDenseCaptureDeviceBenchmark";

function samples({ anchors = 400, durationMs = 70 }: {
  anchors?: number;
  durationMs?: number;
} = {}): MovementDenseCaptureDeviceBenchmarkSample[] {
  return Array.from({ length: MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumSampleCount }, (_, sampleIndex) => ({
    anchorCount: anchors,
    elapsedMs: (sampleIndex / (MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumSampleCount - 1)) * 120_000,
    inferenceDurationMs: durationMs,
    qualityTier: "medium" as const,
    sampleIndex,
  }));
}

describe("movement dense capture physical-device benchmark", () => {
  it("passes a complete browser run within its final adaptive cadence", () => {
    expect(summarizeMovementDenseCaptureDeviceBenchmark({
      deviceClass: "ipad",
      durationMs: 120_000,
      samples: samples(),
    })).toMatchObject({
      deviceClass: "ipad",
      failures: [],
      finalQualityTier: "medium",
      passed: true,
      sampleCount: 60,
      status: "measured-awaiting-review",
      sustained: {
        latencyDriftRatio: 1,
      },
      tierSummaries: {
        medium: {
          medianAnchorCount: 400,
          medianInferenceMs: 70,
          p95InferenceMs: 70,
          targetIntervalMs: 180,
        },
      },
    });
  });

  it("fails incomplete, cadence-breaking, low-anchor, or frozen samples", () => {
    const broken = samples({ anchors: 150, durationMs: 220 });
    broken.pop();
    broken[0]!.inferenceDurationMs = 1_200;
    const report = summarizeMovementDenseCaptureDeviceBenchmark({
      deviceClass: "older-laptop",
      durationMs: 60_000,
      samples: broken,
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/requires at least 60 samples/),
      expect.stringMatching(/did not complete the sustained two-minute window/),
      expect.stringMatching(/exceeds its 180ms cadence/),
      expect.stringMatching(/median anchor count 150 is below 200/),
      expect.stringMatching(/UI-blocking inference sample/),
    ]));
  });
});
