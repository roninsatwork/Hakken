import { describe, expect, it } from "vitest";
import { applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime } from "./movementAvatarLowerBodyFrameStateOrchestrationRuntime";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import {
  createMovementAvatarLowerBodyVisualState,
  createMovementAvatarPlayerLegRaiseHoldState,
} from "./movementAvatarRuntimeState";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

const makePose = (): TrackingLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    visibility: 0.9,
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
  }));

function corePose() {
  const pose = makePose();
  pose[0] = { visibility: 0.9, x: 0.5, y: 0.28, z: 0 };
  pose[11] = { visibility: 0.9, x: 0.38, y: 0.44, z: 0 };
  pose[12] = { visibility: 0.9, x: 0.62, y: 0.44, z: 0 };
  pose[23] = { visibility: 0.9, x: 0.42, y: 0.68, z: 0 };
  pose[24] = { visibility: 0.9, x: 0.58, y: 0.68, z: 0 };
  pose[25] = { visibility: 0.85, x: 0.44, y: 0.82, z: 0 };
  pose[26] = { visibility: 0.85, x: 0.56, y: 0.82, z: 0 };
  pose[27] = { visibility: 0.8, x: 0.44, y: 0.94, z: 0 };
  pose[28] = { visibility: 0.8, x: 0.56, y: 0.94, z: 0 };
  pose[31] = { visibility: 0.8, x: 0.43, y: 0.97, z: 0 };
  pose[32] = { visibility: 0.8, x: 0.57, y: 0.97, z: 0 };
  return pose;
}

function squatPose() {
  const pose = corePose();
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
  const neutralPose = corePose();
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

describe("movementAvatarLowerBodyFrameStateOrchestrationRuntime", () => {
  it("reads lower-body frame-state refs, applies next refs, and returns the hold decision", () => {
    const playerLegRaiseHoldRef = {
      current: createMovementAvatarPlayerLegRaiseHoldState(),
    };
    const playerLowerBodyStabilityRef = {
      current: {
        squatPresentationDepth: 0.42,
        visualRootDrop: 0.2,
      },
    };
    const instructorLowerBodyStabilityRef = {
      current: createMovementAvatarLowerBodyVisualState(),
    };

    const result = applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime({
      avatarDecision: resolveDecision({
        avatarRole: "player",
        pose: squatPose(),
      }),
      avatarRole: "player",
      instructorLowerBodyStabilityRef,
      now: 100,
      playerLegRaiseHoldRef,
      playerLowerBodyStabilityRef,
    });

    const nextState = result.lowerBodyFrameStateRuntime.lowerBodyRuntimeStateDecision;
    expect(playerLegRaiseHoldRef.current).toBe(nextState.nextPlayerLegRaiseHoldState);
    expect(playerLowerBodyStabilityRef.current).toBe(nextState.nextPlayerLowerBodyVisualState);
    expect(instructorLowerBodyStabilityRef.current).toBe(nextState.nextInstructorLowerBodyVisualState);
    expect(result.legRaiseHoldDecision).toBe(nextState.legRaiseHoldDecision);
    expect(result.lowerBodyFrameStateRuntime.shouldApplyLowerBody).toBe(true);
  });
});
