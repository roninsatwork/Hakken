import { describe, expect, it } from "vitest";
import type {
  MovementDebugReplayFrame,
  MovementDebugReplaySession,
} from "../_lib/movementDebugReplay";
import { buildMovementGamePathSimulation } from "../_lib/movementGamePathSimulation";
import { makeMovementAvatarProofMotionPayload } from "../_lib/movementAvatarProofFixtures";
import { buildMovementRetargetSourceModel } from "../_lib/movementRetargeting";
import {
  buildSyntheticMovementSourceFrame,
} from "../_lib/movementSourceFrame";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "../_lib/movementTrackingCalibration";
import {
  resolveMovementMotionFrame,
  type MovementMotionFrame,
} from "../_lib/movementMotionFrame";
import {
  resolveMovementMatchScoringGameplaySummary,
} from "../_lib/movementGameplayScoring";
import {
  resolveMovementMatchHudFrame,
} from "./useMovementMatchScoring";

function proofPose(mode: Parameters<typeof makeMovementAvatarProofMotionPayload>[0]) {
  return makeMovementAvatarProofMotionPayload(mode).landmarks as TrackingLandmark[];
}

function replayFrame(pose: TrackingLandmark[], capturedAt: number): MovementDebugReplayFrame {
  return {
    bodyConfidence: {},
    capturedAt,
    fallbacks: {},
    tracking: {
      pose,
      worldPose: pose,
    },
  };
}

function replaySession(samples: MovementDebugReplayFrame[]): MovementDebugReplaySession {
  return {
    baselineSummary: "manual-calibration:1",
    durationMs: 1000,
    endedAt: 2000,
    id: "scoring-parity-session",
    movementId: "movement-1",
    sampleCount: samples.length,
    samples,
    startedAt: 1000,
    trigger: "debug-tracking",
    warningSummary: "none",
  };
}

function motionFrameFor({
  avatarRole,
  displayPoseLandmarks,
  poseLandmarks,
}: {
  avatarRole: "instructor" | "player";
  displayPoseLandmarks?: TrackingLandmark[];
  poseLandmarks: TrackingLandmark[];
}): MovementMotionFrame {
  const neutral = proofPose("standing");

  return resolveMovementMotionFrame({
    avatarRole,
    calibration: buildMovementCalibration({ poseLandmarks: neutral }),
    displayPoseLandmarks,
    mirrorMode: "facing-player",
    retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    sourceFrame: buildSyntheticMovementSourceFrame({
      capturedAt: 1000,
      poseLandmarks,
    }),
  });
}

describe("resolveMovementMatchHudFrame", () => {
  it("resolves HUD sync and spine metrics from MovementMotionFrame display landmarks", () => {
    const standing = proofPose("standing");
    const squat = proofPose("squat");
    const playerMotionFrame = motionFrameFor({
      avatarRole: "player",
      displayPoseLandmarks: squat,
      poseLandmarks: standing,
    });
    const instructorMotionFrame = motionFrameFor({
      avatarRole: "instructor",
      displayPoseLandmarks: squat,
      poseLandmarks: squat,
    });

    const hudFrame = resolveMovementMatchHudFrame({
      instructorMotionFrame,
      playerMotionFrame,
      spineGoal: null,
    });

    expect(hudFrame).not.toBeNull();
    expect(hudFrame?.sync).toBeGreaterThan(85);
    expect(hudFrame?.spineScore).toBeGreaterThan(85);
  });

  it("keeps HUD sync and spine as presentation diagnostics beside gameplay scoring", () => {
    const standing = proofPose("standing");
    const squat = proofPose("squat");
    const playerMotionFrame = motionFrameFor({
      avatarRole: "player",
      poseLandmarks: squat,
    });
    const instructorMotionFrame = motionFrameFor({
      avatarRole: "instructor",
      poseLandmarks: standing,
    });

    const hudFrame = resolveMovementMatchHudFrame({
      instructorMotionFrame,
      playerMotionFrame,
      spineGoal: null,
    });
    const scoring = resolveMovementMatchScoringGameplaySummary({
      playerMotionFrame,
    });

    expect(hudFrame).not.toBeNull();
    expect(hudFrame?.sync).toBeLessThan(85);
    expect(scoring.gameplaySummary).toEqual({
      feedbackMessage: "great-effort",
      scoreDeltaTotal: 15,
    });
  });
});

describe("resolveMovementMatchScoringGameplaySummary", () => {
  it("matches Replay game-path score and message events for the same MovementMotionFrame", () => {
    const simulation = buildMovementGamePathSimulation(replaySession([
      replayFrame(proofPose("standing"), 1000),
      replayFrame(proofPose("squat"), 1140),
    ]));
    const replayGameplayEventFrame = simulation.gameplayEvents[1];
    const playerMotionFrame = simulation.motionFrames[1];
    const previousPlayerMotionFrame = simulation.motionFrames[0] ?? null;
    const previousStreak = simulation.gameplayEvents[0]?.nextStreak ?? 0;

    expect(playerMotionFrame).toBeDefined();
    expect(replayGameplayEventFrame).toBeDefined();

    const gameScoring = resolveMovementMatchScoringGameplaySummary({
      playerMotionFrame: playerMotionFrame!,
      previousPlayerMotionFrame,
      streak: previousStreak,
    });

    expect(gameScoring.gameplayEventFrame).toEqual(replayGameplayEventFrame);
    expect(gameScoring.gameplaySummary).toEqual({
      feedbackMessage: "great-effort",
      scoreDeltaTotal: 15,
    });
  });
});
