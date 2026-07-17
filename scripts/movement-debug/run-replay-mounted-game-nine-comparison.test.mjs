import { describe, expect, it } from "vitest";
import { buildReplayGameNineComparisonSummary } from "./run-replay-mounted-game-nine-comparison.mjs";

describe("buildReplayGameNineComparisonSummary", () => {
  it("passes every runnable comparison while keeping setup-blocked recordings in the overall failure", () => {
    const summary = buildReplayGameNineComparisonSummary({
      gameSummaryPath: "game-summary.json",
      manifestPath: "manifest.json",
      recordingSetId: "nine",
      rows: [
        {
          comparedFrameCount: 572,
          divergenceCount: 0,
          exactChecksumDivergenceCount: 0,
          gamePassed: true,
          passed: true,
        },
        {
          comparedFrameCount: 0,
          divergenceCount: 0,
          exactChecksumDivergenceCount: 0,
          gamePassed: false,
          passed: false,
        },
      ],
    });

    expect(summary).toMatchObject({
      blockedRecordingCount: 1,
      comparedFrameCount: 572,
      exactChecksumDivergenceCount: 0,
      passed: false,
      recordingCount: 2,
      recordingSetId: "nine",
      runnablePassed: true,
      runnableRecordingCount: 1,
      toleranceDivergenceCount: 0,
    });
  });

  it("fails runnable coverage when any mounted comparison diverges", () => {
    const summary = buildReplayGameNineComparisonSummary({
      gameSummaryPath: "game-summary.json",
      manifestPath: "manifest.json",
      recordingSetId: "nine",
      rows: [{
        comparedFrameCount: 100,
        divergenceCount: 2,
        exactChecksumDivergenceCount: 4,
        gamePassed: true,
        passed: false,
      }],
    });

    expect(summary.runnablePassed).toBe(false);
    expect(summary.passed).toBe(false);
    expect(summary.toleranceDivergenceCount).toBe(2);
    expect(summary.exactChecksumDivergenceCount).toBe(4);
  });
});
