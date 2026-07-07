import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarLocomotionFrameOrchestrationRuntime } from "./movementAvatarLocomotionFrameOrchestrationRuntime";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarRootOrientationDecision } from "./movementAvatarPipeline";
import { getMovementAvatarTrackingProfile } from "./movementAvatarProfiles";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import type { MovementRootMotionInputFrame } from "./movementRootMotion";
import { buildMovementCalibration } from "./movementTrackingCalibration";
import type { VrmSolverLandmark } from "./vrmRigging";

const uprightRootOrientation: MovementAvatarRootOrientationDecision = {
  heightLerp: 0.16,
  owner: "upright-root",
  reason: "upright",
  shouldApply: false,
  shouldApplyHeight: false,
  slerp: 0.16,
  targetHeightDrop: 0,
  targetPitch: 0,
  targetRoll: 0,
};

function pose(): VrmSolverLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    visibility: 0.9,
    x: 0,
    y: 0,
    z: 0,
  }));
  landmarks[23] = { visibility: 0.95, x: -0.14, y: 1.02, z: 0 };
  landmarks[24] = { visibility: 0.95, x: 0.14, y: 1.02, z: 0 };
  landmarks[27] = { visibility: 0.9, x: -0.14, y: 0.08, z: 0.04 };
  landmarks[28] = { visibility: 0.9, x: 0.14, y: 0.08, z: 0.04 };
  landmarks[31] = { visibility: 0.9, x: -0.13, y: 0, z: 0.18 };
  landmarks[32] = { visibility: 0.9, x: 0.13, y: 0, z: 0.18 };
  return landmarks;
}

function lowerBodyDrive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
  return {
    groundedSquatDepth: 0,
    liveSquatDepth: 0,
    playerLegRaiseDepth: 0,
    playerLegRaiseSide: null,
    playerLowerBodyState: "neutral",
    playerSquatPresentationDepth: 0,
    shouldApplyLowerBody: true,
    shouldApplySolverTorso: true,
    shouldDrivePlayerLegRaise: false,
    shouldDrivePlayerSquat: false,
    visualRootDrop: 0,
    ...overrides,
  };
}

describe("movementAvatarLocomotionFrameOrchestrationRuntime", () => {
  it("resolves hips and returns fallback without applying root motion when forced standby", () => {
    const root = new THREE.Object3D();
    const history: MovementRootMotionInputFrame[] = [];
    const result = applyMovementAvatarLocomotionFrameOrchestrationRuntime({
      avatarBaseY: -2.8,
      avatarRole: "player",
      avatarRoot: root,
      calibration: buildMovementCalibration({
        poseLandmarks: makeMovementAvatarProofMotionPayload("standing").landmarks,
      }),
      displayWorldPose: pose(),
      forceStandby: true,
      history,
      lowerBodyDrive: lowerBodyDrive(),
      lowerBodyTrackingReady: true,
      mirrorPlayerDisplay: false,
      playerSquatPresentationDepth: 0,
      poseLandmarks: pose(),
      positionOffset: [0, 0, 0],
      profile: getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm"),
      recordedRootMotionFrame: null,
      rootOrientation: uprightRootOrientation,
      shouldApplyLowerBody: true,
      visualRootDrop: 0,
      worldPose: pose(),
    });

    expect(result.status).toBe("fallback-demo-pose");
    expect(result.hipsFrameRuntime.hipsPositionOptions.avatarRootVisualLerp).toBeGreaterThan(0);
    expect(history).toHaveLength(0);
  });

  it("applies root orchestration and exposes step response when ready", () => {
    const root = new THREE.Object3D();
    const history: MovementRootMotionInputFrame[] = [];
    const result = applyMovementAvatarLocomotionFrameOrchestrationRuntime({
      avatarBaseY: -2.8,
      avatarRole: "player",
      avatarRoot: root,
      calibration: null,
      displayWorldPose: pose(),
      forceStandby: false,
      history,
      lowerBodyDrive: lowerBodyDrive(),
      lowerBodyTrackingReady: true,
      mirrorPlayerDisplay: false,
      playerSquatPresentationDepth: 0,
      poseLandmarks: pose(),
      positionOffset: [0.2, 0, -0.3],
      profile: getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm"),
      recordedRootMotionFrame: null,
      rootOrientation: uprightRootOrientation,
      shouldApplyLowerBody: true,
      visualRootDrop: 0,
      worldPose: pose(),
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.stepResponse).toBe(result.rootFrameOrchestrationRuntime.stepResponse);
    expect(result.hipsFrameRuntime.hipsPositionOptions.avatarRootVisualLerp).toBeGreaterThan(0);
    expect(history).toHaveLength(1);
  });
});
