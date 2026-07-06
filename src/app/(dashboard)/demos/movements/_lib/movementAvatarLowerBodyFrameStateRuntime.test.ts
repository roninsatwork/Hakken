import { describe, expect, it } from "vitest";
import { resolveMovementAvatarLowerBodyFrameStateRuntime } from "./movementAvatarLowerBodyFrameStateRuntime";
import {
  createMovementAvatarLowerBodyVisualState,
  createMovementAvatarPlayerLegRaiseHoldState,
} from "./movementAvatarRuntimeState";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";

const makePose = (): TrackingLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.9,
  }));

function withCorePose() {
  const pose = makePose();
  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.9 };
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility: 0.9 };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility: 0.9 };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  pose[13] = { x: 0.34, y: 0.56, z: 0, visibility: 0.9 };
  pose[14] = { x: 0.66, y: 0.56, z: 0, visibility: 0.9 };
  pose[15] = { x: 0.32, y: 0.68, z: 0, visibility: 0.9 };
  pose[16] = { x: 0.68, y: 0.68, z: 0, visibility: 0.9 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.85 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.85 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.8 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.8 };
  pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.8 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.8 };
  return pose;
}

function squatPose() {
  const pose = withCorePose();
  pose[23] = { ...pose[23]!, y: 0.8 };
  pose[24] = { ...pose[24]!, y: 0.8 };
  pose[25] = { ...pose[25]!, y: 0.73 };
  pose[26] = { ...pose[26]!, y: 0.73 };
  return pose;
}

function resolveDecision({
  avatarRole,
  pose,
}: {
  avatarRole: "instructor" | "player";
  pose: TrackingLandmark[];
}) {
  const neutralPose = withCorePose();
  return resolveMovementAvatarPipelineDecision({
    avatarRole,
    calibration: buildMovementCalibration({ poseLandmarks: neutralPose }),
    retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutralPose }),
    source: {
      poseLandmarks: pose,
    },
    sourceOrigin: avatarRole === "player" ? "studio" : "replay",
  });
}

describe("movementAvatarLowerBodyFrameStateRuntime", () => {
  it("collects player lower-body hold, visual, and target decisions for a squat frame", () => {
    const runtime = resolveMovementAvatarLowerBodyFrameStateRuntime({
      avatarDecision: resolveDecision({
        avatarRole: "player",
        pose: squatPose(),
      }),
      avatarRole: "player",
      instructorLowerBodyVisualState: createMovementAvatarLowerBodyVisualState(),
      now: 100,
      playerLegRaiseHoldState: createMovementAvatarPlayerLegRaiseHoldState(),
      playerLowerBodyVisualState: {
        squatPresentationDepth: 0.42,
        visualRootDrop: 0.2,
      },
    });

    expect(runtime.shouldApplyLowerBody).toBe(true);
    expect(runtime.shouldApplySolverTorso).toBe(true);
    expect(runtime.liveSquatDepth).toBeGreaterThan(0.12);
    expect(runtime.playerSquatPresentationDepth).toBeGreaterThan(0.18);
    expect(runtime.shouldHoldPlayerSquatPose).toBe(true);
    expect(runtime.lowerBodyTarget.stageDecision?.stage).toBe("player-squat");
    expect(runtime.playerRetargetLowerBodyMotion).toBeGreaterThan(0.4);
  });

  it("keeps instructor visual state separate from player visual state", () => {
    const playerVisualState = {
      squatPresentationDepth: 0.2,
      visualRootDrop: 0.1,
    };
    const runtime = resolveMovementAvatarLowerBodyFrameStateRuntime({
      avatarDecision: resolveDecision({
        avatarRole: "instructor",
        pose: withCorePose(),
      }),
      avatarRole: "instructor",
      instructorLowerBodyVisualState: createMovementAvatarLowerBodyVisualState(),
      now: 100,
      playerLegRaiseHoldState: {
        depth: 0.3,
        expiresAt: 140,
        side: "right",
      },
      playerLowerBodyVisualState: playerVisualState,
    });

    expect(runtime.lowerBodyRuntimeStateDecision.nextPlayerLowerBodyVisualState).toBe(playerVisualState);
    expect(runtime.lowerBodyRuntimeStateDecision.nextInstructorLowerBodyVisualState).not.toBe(playerVisualState);
    expect(runtime.lowerBodyTarget.stageDecision?.stage).toBe("recorded-neutral");
    expect(runtime.visualRootDrop).toBeGreaterThanOrEqual(0);
  });
});
