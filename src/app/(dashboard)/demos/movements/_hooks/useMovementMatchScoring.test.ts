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
  accumulateMovementSessionScoreFrame,
  createMovementSessionScoreState,
  resolveMovementSessionScoreResult,
} from "../_lib/movementSessionScore";
import {
  resolveMovementMatchHudFrame,
  resolveMovementPlayerSpineHudFrame,
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
    expect(hudFrame?.spineReadiness).toBe("ready");
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

  it("resolves paused player spine readiness without instructor playback", () => {
    const playerMotionFrame = motionFrameFor({
      avatarRole: "player",
      poseLandmarks: proofPose("weak-spine-standing"),
    });

    const hudFrame = resolveMovementPlayerSpineHudFrame(playerMotionFrame);

    expect(hudFrame).toEqual({
      spineCue: "Bring shoulders and hips into view.",
      spineReadiness: "blocked",
      spineScore: expect.any(Number),
    });
    expect(hudFrame?.spineScore).toBeLessThan(25);
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

/**
 * Drives the whole chain the studio runs each scoring tick — HUD frame, gameplay
 * events, session accumulator — over real motion frames, so the reported result
 * is checked against what the player actually did rather than in isolation.
 */
function runScoredSession({
  instructorPose,
  playerPoses,
}: {
  instructorPose: TrackingLandmark[];
  playerPoses: TrackingLandmark[][];
}) {
  const state = createMovementSessionScoreState();
  const instructorMotionFrame = motionFrameFor({
    avatarRole: "instructor",
    poseLandmarks: instructorPose,
  });
  let previousPlayerMotionFrame: MovementMotionFrame | null = null;
  let streak = 0;

  playerPoses.forEach((poseLandmarks) => {
    const playerMotionFrame = motionFrameFor({ avatarRole: "player", poseLandmarks });
    const hudFrame = resolveMovementMatchHudFrame({
      instructorMotionFrame,
      playerMotionFrame,
      spineGoal: null,
    });
    const { gameplayEventFrame, gameplaySummary } = resolveMovementMatchScoringGameplaySummary({
      instructorSync: hudFrame?.sync ?? null,
      playerMotionFrame,
      previousPlayerMotionFrame,
      streak,
    });
    streak = gameplayEventFrame.nextStreak;
    previousPlayerMotionFrame = playerMotionFrame;
    accumulateMovementSessionScoreFrame(state, {
      gameplayEventFrame,
      instructorSync: hudFrame?.sync ?? null,
      scoreDeltaTotal: gameplaySummary.scoreDeltaTotal,
      spineCue: hudFrame?.spineCue,
      spineScore: hudFrame?.spineScore,
    });
  });

  return resolveMovementSessionScoreResult(state);
}

describe("scored session result", () => {
  const standing = () => proofPose("standing");
  const squat = () => proofPose("squat");
  const squatReps = (count: number) =>
    Array.from({ length: count }, () => [squat(), squat(), standing()]).flat();

  it("reports reps, coach match and a normalised headline for a followed routine", () => {
    const result = runScoredSession({
      instructorPose: squat(),
      playerPoses: squatReps(4),
    });

    expect(result.repCount).toBe(4);
    expect(result.coachMatchPercent).not.toBeNull();
    expect(result.overallPercent).toBeGreaterThan(0);
    expect(result.overallPercent).toBeLessThanOrEqual(100);
    expect(result.trackingPercent).toBe(100);
  });

  it("scores a followed routine above the same movements done against a different pose", () => {
    const followed = runScoredSession({
      instructorPose: squat(),
      playerPoses: squatReps(4),
    });
    const ignored = runScoredSession({
      instructorPose: proofPose("hands-front"),
      playerPoses: squatReps(4),
    });

    expect(ignored.repCount).toBe(followed.repCount);
    expect(ignored.coachMatchPercent!).toBeLessThan(followed.coachMatchPercent!);
    expect(ignored.overallPercent).toBeLessThan(followed.overallPercent);
    expect(ignored.points).toBeLessThan(followed.points);
  });

  it("does not reward standing still through the whole routine", () => {
    const result = runScoredSession({
      instructorPose: squat(),
      playerPoses: Array.from({ length: 12 }, standing),
    });

    expect(result.repCount).toBe(0);
    expect(result.points).toBe(0);
    expect(result.overallPercent).toBe(0);
  });

  it("keeps the headline length-independent while points keep accumulating", () => {
    const short = runScoredSession({ instructorPose: squat(), playerPoses: squatReps(2) });
    const long = runScoredSession({ instructorPose: squat(), playerPoses: squatReps(8) });

    expect(long.points).toBeGreaterThan(short.points);
    expect(long.overallPercent).toBe(short.overallPercent);
  });
});
