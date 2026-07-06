import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type {
  MovementCalibration,
  MovementHeadMotionIntent,
  TrackingLandmark,
} from "./movementTrackingCalibration";
import {
  applyMovementAvatarHeadRuntimeToVrmBones,
  buildMovementAvatarHeadRuntimeDebugTelemetry,
} from "./movementAvatarHeadRuntime";

const neutralHeadIntent: MovementHeadMotionIntent = {
  confidence: 0.9,
  depth: 0,
  label: "neutral",
  lateral: 0,
  vertical: 0,
};

const neutralCalibration: MovementCalibration = {
  calibratedAt: 1,
  floorY: 0.96,
  headCenter: { x: 0.5, y: 0.28, z: 0 },
  headNeutral: {
    confidence: 0.95,
    pitch: 0,
    roll: 0,
    source: "face",
    yaw: 0,
  },
  hipCenter: { x: 0.5, y: 0.66, z: 0 },
  quality: 0.95,
  shoulderCenter: { x: 0.5, y: 0.42, z: 0 },
  shoulderWidth: 0.22,
  torsoHeight: 0.24,
};

function poseLandmarks(): TrackingLandmark[] {
  const pose = Array.from({ length: 33 }, (_, index) => ({
    visibility: 0.9,
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
  }));
  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.9 };
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility: 0.9 };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility: 0.9 };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  return pose;
}

describe("movementAvatarHeadRuntime", () => {
  it("skips when required head landmarks or head bone are unavailable", () => {
    expect(applyMovementAvatarHeadRuntimeToVrmBones({
      avatarRole: "player",
      avatarRootYaw: 0,
      baseHeadPosition: null,
      calibration: null,
      lookupBone: () => new THREE.Object3D(),
      neckSlerp: 0.25,
      poseLandmarks: [],
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    })).toEqual({
      applied: false,
      reason: "missing-head-landmarks",
    });

    expect(applyMovementAvatarHeadRuntimeToVrmBones({
      avatarRole: "player",
      avatarRootYaw: 0,
      baseHeadPosition: null,
      calibration: null,
      lookupBone: () => null,
      neckSlerp: 0.25,
      poseLandmarks: poseLandmarks(),
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    })).toEqual({
      applied: false,
      reason: "missing-head-bone",
    });
  });

  it("resolves and applies player head motion while preserving the stable base position", () => {
    const parent = new THREE.Object3D();
    const head = new THREE.Object3D();
    const neck = new THREE.Object3D();
    const upperChest = new THREE.Object3D();
    head.position.set(0.1, 0.2, 0.3);
    parent.add(head);
    parent.add(neck);
    parent.add(upperChest);
    parent.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Object3D>([
      ["head", head],
      ["neck", neck],
      ["upperChest", upperChest],
    ]);

    const result = applyMovementAvatarHeadRuntimeToVrmBones({
      avatarRole: "player",
      avatarRootYaw: Math.PI / 4,
      baseHeadPosition: null,
      calibration: neutralCalibration,
      headMotionIntent: {
        ...neutralHeadIntent,
        vertical: 0.7,
      },
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      neckSlerp: 1,
      poseLandmarks: poseLandmarks(),
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    });

    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error("expected head runtime to apply");
    expect(result.headTarget.headDecision.shouldApplyPlayerHeadMotion).toBe(true);
    expect(result.headApplication.baseHeadPosition).toEqual(new THREE.Vector3(0.1, 0.2, 0.3));
    expect(head.position.y).not.toBe(0.2);
    expect(head.quaternion.w).toBeLessThan(1);
  });

  it("builds avatar head debug telemetry from the applied head node and target", () => {
    const head = new THREE.Object3D();
    head.rotation.x = 0.1234;

    const result = applyMovementAvatarHeadRuntimeToVrmBones({
      avatarRole: "player",
      avatarRootYaw: 0,
      baseHeadPosition: null,
      calibration: neutralCalibration,
      headMotionIntent: {
        ...neutralHeadIntent,
        lateral: 0.35,
        vertical: 0.4,
      },
      lookupBone: (boneName) => boneName === "head" ? head : new THREE.Object3D(),
      neckSlerp: 1,
      poseLandmarks: poseLandmarks(),
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    });

    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error("expected head runtime to apply");

    const telemetry = buildMovementAvatarHeadRuntimeDebugTelemetry({
      headNode: result.headNode,
      headTarget: result.headTarget,
    });

    expect(telemetry).toEqual({
      appliedLocalPitch: result.headNode.rotation.x,
      boneYaw: result.headTarget.headDecision.headYaw,
      bonePitch: result.headTarget.headBonePitch,
      trackingPitch: result.headTarget.headDecision.headPitch,
      trackingYaw: result.headTarget.rawHeadDecision.rawHead.yaw,
    });
  });
});
