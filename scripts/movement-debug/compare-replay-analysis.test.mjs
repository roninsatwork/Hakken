import { describe, expect, it } from "vitest";

import {
  compareAnalyses,
  compareProofManifests,
  hasProofRegression,
  proofComparisonTrend,
  proofRegressionGateReasons,
  proofRegressionReasons,
} from "./compare-replay-analysis.mjs";

const analysis = (sessionId, pass = true, failures = [], metrics = {}) => ({
  failures,
  metrics,
  pass,
  sessionId,
});

const proofManifest = (summary) => ({
  summary: {
    acceptedProductLimitationCount: 0,
    appliedManualReviewDecisionCount: 0,
    appliedSourceLimitationDecisionCount: 0,
    blockingRowCount: 0,
    blockingRowsByProofBlockerCode: {},
    blockingRowsByProofCase: {},
    blockingRowsByStatus: {},
    failedCount: 0,
    manualReviewCount: 0,
    missingProofCount: 0,
    passedCount: 0,
    sourceDataLimitationCount: 0,
    totalRows: 0,
    visualCaptureFrameCount: 0,
    visualCaptureRowCount: 0,
    ...summary,
  },
});

describe("compare replay analysis proof manifest deltas", () => {
  it("compares proof manifest counts and blocker rollups", () => {
    const comparison = compareProofManifests(
      proofManifest({
        blockingRowCount: 110,
        blockingRowsByProofBlockerCode: {
          "candidate-below-threshold": 30,
          "manual-review-pending": 60,
        },
        blockingRowsByStatus: {
          "manual-review": 60,
          "missing-proof": 32,
          "source-data-limitation": 18,
        },
        manualReviewCount: 60,
        missingProofCount: 32,
        passedCount: 7,
      }),
      proofManifest({
        acceptedProductLimitationCount: 2,
        blockingRowCount: 104,
        blockingRowsByProofBlockerCode: {
          "candidate-below-threshold": 28,
          "manual-review-pending": 58,
        },
        blockingRowsByStatus: {
          "manual-review": 58,
          "missing-proof": 28,
          "source-data-limitation": 18,
        },
        manualReviewCount: 58,
        missingProofCount: 28,
        passedCount: 11,
      }),
    );

    expect(comparison?.deltas.counts.blockingRowCount).toEqual({
      after: 104,
      before: 110,
      delta: -6,
    });
    expect(comparison?.deltas.counts.passedCount.delta).toBe(4);
    expect(comparison?.deltas.counts.acceptedProductLimitationCount.delta).toBe(2);
    expect(comparison?.improvementReasons).toEqual(expect.arrayContaining([
      "blockingRowCount decreased by 6",
      "missingProofCount decreased by 4",
      "passedCount increased by 4",
      "acceptedProductLimitationCount increased by 2",
    ]));
    expect(comparison?.deltas.blockingRowsByProofBlockerCode["candidate-below-threshold"]).toEqual({
      after: 28,
      before: 30,
      delta: -2,
    });
  });

  it("attaches proof manifest comparison to analysis comparison", () => {
    const proofComparison = compareProofManifests(
      proofManifest({ blockingRowCount: 2 }),
      proofManifest({ blockingRowCount: 1 }),
    );
    const comparison = compareAnalyses(
      [analysis("session-1", false, [{ code: "warning-a", severity: "warning" }])],
      [analysis("session-1", true, [])],
      proofComparison,
    );

    expect(comparison.deltas.failedSessionCount).toBe(-1);
    expect(comparison.proofManifest?.deltas.counts.blockingRowCount.delta).toBe(-1);
  });

  it("compares Replay/Game score-message parity metrics", () => {
    const comparison = compareAnalyses(
      [analysis("session-1", true, [], {
        replayGameScoreMessageDivergenceFrameCount: 2,
        replayGameScoreMessageFrameCount: 10,
      })],
      [analysis("session-1", true, [], {
        replayGameScoreMessageDivergenceFrameCount: 0,
        replayGameScoreMessageFrameCount: 12,
      })],
    );

    expect(comparison.deltas.metrics.replayGameScoreMessageDivergenceFrameCount).toBe(-2);
    expect(comparison.deltas.metrics.replayGameScoreMessageFrameCount).toBe(2);
    expect(comparison.sessions[0]?.metricDeltas).toMatchObject({
      replayGameScoreMessageDivergenceFrameCount: -2,
      replayGameScoreMessageFrameCount: 2,
    });
  });

  it("flags proof regressions for strict comparison gates", () => {
    const proofComparison = compareProofManifests(
      proofManifest({
        acceptedProductLimitationCount: 2,
        blockingRowCount: 10,
        manualReviewCount: 4,
        passedCount: 20,
        visualCaptureRowCount: 8,
      }),
      proofManifest({
        acceptedProductLimitationCount: 1,
        blockingRowCount: 12,
        manualReviewCount: 6,
        passedCount: 18,
        visualCaptureRowCount: 7,
      }),
    );
    const comparison = compareAnalyses(
      [analysis("session-1")],
      [analysis("session-1")],
      proofComparison,
    );

    expect(hasProofRegression(comparison)).toBe(true);
    expect(proofComparisonTrend(comparison)).toBe("regressed");
    expect(proofRegressionReasons(comparison)).toEqual(expect.arrayContaining([
      "blockingRowCount increased by 2",
      "manualReviewCount increased by 2",
      "passedCount decreased by 2",
      "acceptedProductLimitationCount decreased by 1",
      "visualCaptureRowCount decreased by 1",
    ]));
  });

  it("does not flag proof improvements as regressions", () => {
    const proofComparison = compareProofManifests(
      proofManifest({
        blockingRowCount: 10,
        manualReviewCount: 4,
        missingProofCount: 3,
        passedCount: 20,
      }),
      proofManifest({
        acceptedProductLimitationCount: 1,
        blockingRowCount: 8,
        manualReviewCount: 3,
        missingProofCount: 2,
        passedCount: 23,
        visualCaptureRowCount: 2,
      }),
    );
    const comparison = compareAnalyses(
      [analysis("session-1")],
      [analysis("session-1")],
      proofComparison,
    );

    expect(hasProofRegression(comparison)).toBe(false);
    expect(proofComparisonTrend(comparison)).toBe("improved");
    expect(proofRegressionReasons(comparison)).toEqual([]);
    expect(proofRegressionGateReasons(comparison)).toEqual([]);
  });

  it("requires proof manifests for strict proof-regression gates", () => {
    const comparison = compareAnalyses(
      [analysis("session-1")],
      [analysis("session-1")],
      null,
    );

    expect(hasProofRegression(comparison)).toBe(false);
    expect(proofComparisonTrend(comparison)).toBe("missing");
    expect(proofRegressionReasons(comparison)).toEqual([]);
    expect(proofRegressionGateReasons(comparison)).toEqual([
      "proof manifest comparison is missing",
    ]);
  });
});
