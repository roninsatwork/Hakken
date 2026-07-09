import { describe, expect, it } from "vitest";

import { MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS } from "./movementNextProofRehearsal";
import {
  getMovementProofRehearsalBatchEvidence,
  getMovementProofRehearsalBatchSummary,
  getMovementProofRehearsalEvidence,
} from "./movementProofRehearsalEvidence";
import type { MovementReplayAnalysis, MovementReplayGamePathFrame } from "./movementReplayAnalyzer";

function gameFrame(overrides: Partial<MovementReplayGamePathFrame>): MovementReplayGamePathFrame {
  return {
    exercisePoseKey: "standing-neutral",
    exercisePoseLabel: "Standing neutral",
    exercisePoseQualityScore: 0,
    exercisePoseToleranceBand: "outside",
    exerciseTransitionKey: "none",
    exerciseTransitionLabel: "None",
    feetOwner: "feet-neutral",
    frameIndex: 0,
    hipDrop: 0,
    leftKneeLift: 0,
    lowerBodyTargetCanUsePlayerRetargetLegRaise: false,
    lowerBodyTargetInstructorMotion: 0,
    lowerBodyTargetPlayerRetargetMotion: 0,
    lowerBodyTargetShouldHoldPlayerSquat: false,
    lowerBodyTargetStage: "neutral",
    lowerBodyTrackingReady: true,
    lowerLabel: "neutral",
    lowerOwner: "neutral",
    rightKneeLift: 0,
    rootHeadingYaw: 0,
    rootMotionHeadingDelta: 0,
    rootMotionIntentKey: "stationary",
    rootMotionIntentLabel: "Stationary",
    rootMotionJumpResponseApplied: false,
    rootMotionJumpResponseHeightOffset: 0,
    rootMotionJumpResponseOwner: "none",
    rootMotionPlantedFoot: "both",
    rootMotionStepResponseApplied: false,
    rootMotionStepResponseFootLiftOffset: 0,
    rootMotionStepResponseOwner: "none",
    rootMotionStepResponseSide: "none",
    rootMotionSwingFoot: "none",
    rootMotionTravelDirection: "",
    rootMotionTravelDistance: 0,
    rootPathDistance: 0,
    rootPositionConfidence: 1,
    rootSource: "world-landmarks",
    seatedForwardFoldCandidateScore: null,
    shouldDrivePlayerLegRaise: false,
    shouldDrivePlayerSquat: false,
    sourceQuality: 1,
    spineSideBend: 0,
    spineTwist: 0,
    squatDepth: 0,
    supportConstraintOwner: "none",
    supportConstraintStatus: "none",
    supportContactAnchorCount: 0,
    supportContactOwner: "none",
    supportContactStatus: "none",
    supportIntentKey: "none",
    supportIntentLabel: "None",
    supportPresentationApplied: false,
    supportPresentationArmSpecCount: 0,
    supportPresentationOwner: "none",
    supportPresentationSpineSpecCount: 0,
    visualRootDrop: 0,
    ...overrides,
  };
}

function analysisWithFrames(frames: MovementReplayGamePathFrame[]): MovementReplayAnalysis {
  return ({
    gamePath: {
      frames,
      sourceFrames: [],
      startReadinessMessageSummary: [],
    },
  } as unknown) as MovementReplayAnalysis;
}

describe("movement proof rehearsal evidence", () => {
  it("selects the strongest root-travel frame for the root-travel rehearsal", () => {
    const item = MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS.find((candidate) => (
      candidate.freshRecordingLabel === "movement-proof-root-travel"
    ));

    expect(getMovementProofRehearsalEvidence(item!, analysisWithFrames([
      gameFrame({ frameIndex: 1, rootMotionIntentKey: "root-travel", rootMotionTravelDistance: 0.12 }),
      gameFrame({
        frameIndex: 4,
        rootMotionIntentKey: "root-travel",
        rootMotionTravelDirection: "right",
        rootMotionTravelDistance: 0.35,
      }),
    ]))).toEqual({
      detail: "travel right · 0.35",
      frameIndex: 4,
      label: "Root-travel evidence",
      requiredScore: 0.16,
      score: 0.35,
      scorePercent: 219,
      scoreState: "meets-threshold",
      scoreSummary: "0.35 / 0.16 (219%)",
    });
  });

  it("selects the strongest seated-forward-fold frame for the seated rehearsal", () => {
    const item = MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS.find((candidate) => (
      candidate.freshRecordingLabel === "movement-proof-seated-forward-fold"
    ));

    expect(getMovementProofRehearsalEvidence(item!, analysisWithFrames([
      gameFrame({ frameIndex: 1, seatedForwardFoldCandidateScore: 0.2 }),
      gameFrame({ frameIndex: 3, seatedForwardFoldCandidateScore: 0.7 }),
    ]))).toEqual({
      detail: "fold score 0.70",
      frameIndex: 3,
      label: "Seated-fold evidence",
      requiredScore: 1,
      score: 0.7,
      scorePercent: 70,
      scoreState: "below-threshold",
      scoreSummary: "0.70 / 1.00 (70%)",
    });
  });

  it("selects the strongest matching evidence across a rehearsal batch", () => {
    const item = MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS.find((candidate) => (
      candidate.freshRecordingLabel === "movement-proof-root-travel"
    ));

    expect(getMovementProofRehearsalBatchEvidence(item!, [
      {
        analysis: analysisWithFrames([
          gameFrame({
            frameIndex: 7,
            rootMotionIntentKey: "root-travel",
            rootMotionTravelDirection: "left",
            rootMotionTravelDistance: 0.2,
          }),
        ]),
        order: 0,
        recordingId: "movement-proof-root-travel-a",
        recordingTitle: "Root travel A",
      },
      {
        analysis: analysisWithFrames([
          gameFrame({
            frameIndex: 2,
            rootMotionIntentKey: "root-travel",
            rootMotionTravelDirection: "right",
            rootMotionTravelDistance: 0.5,
          }),
        ]),
        order: 1,
        recordingId: "movement-proof-root-travel-b",
        recordingTitle: "Root travel B",
      },
    ])).toEqual({
      detail: "travel right · 0.50",
      frameIndex: 2,
      label: "Root-travel evidence",
      recordingId: "movement-proof-root-travel-b",
      recordingTitle: "Root travel B",
      requiredScore: 0.16,
      score: 0.5,
      scorePercent: 313,
      scoreState: "meets-threshold",
      scoreSummary: "0.50 / 0.16 (313%)",
    });
  });

  it("returns null when the current recording has no matching rehearsal evidence", () => {
    expect(getMovementProofRehearsalEvidence(
      MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS[0]!,
      analysisWithFrames([gameFrame({ frameIndex: 1 })]),
    )).toBeNull();
  });

  it("summarizes selected-batch threshold coverage across rehearsal items", () => {
    const summary = getMovementProofRehearsalBatchSummary(MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS, [
      {
        analysis: analysisWithFrames([
          gameFrame({
            frameIndex: 2,
            rootMotionIntentKey: "root-travel",
            rootMotionTravelDistance: 0.2,
          }),
          gameFrame({
            frameIndex: 6,
            seatedForwardFoldCandidateScore: 0.5,
          }),
        ]),
        recordingId: "batch-a",
        recordingTitle: "Batch A",
      },
    ]);

    expect(summary).toMatchObject({
      belowThresholdCount: 1,
      meetsThresholdCount: 1,
      missingCount: 0,
      total: 2,
    });
    expect(summary.rows.map((row) => [row.freshRecordingLabel, row.scoreState])).toEqual([
      ["movement-proof-root-travel", "meets-threshold"],
      ["movement-proof-seated-forward-fold", "below-threshold"],
    ]);
  });

  it("summarizes missing selected-batch evidence", () => {
    expect(getMovementProofRehearsalBatchSummary(MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS, [])).toMatchObject({
      belowThresholdCount: 0,
      meetsThresholdCount: 0,
      missingCount: 2,
      total: 2,
    });
  });
});
