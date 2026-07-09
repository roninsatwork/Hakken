import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { MovementAvatarArmDecision } from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import { applyMovementAvatarUpperBodyRuntimeToVrmBones } from "./movementAvatarUpperBodyRuntime";

function armDecision(
  side: "left" | "right",
  overrides: Partial<MovementAvatarArmDecision> = {},
): MovementAvatarArmDecision {
  return {
    endpointConfidence: 0.9,
    isTrackingReady: true,
    side,
    unreadyFallback: "relax",
    ...overrides,
  };
}

function spineDrive(): MovementAvatarPlayerSpineDrive {
  return {
    confidence: 0.9,
    forwardLean: 0.2,
    owner: "player-spine-model",
    rotations: {
      chest: { x: 0.3, y: 0, z: 0.03 },
      hips: { x: 0.1, y: 0, z: 0.01 },
      spine: { x: 0.2, y: 0, z: 0.02 },
      upperChest: { x: 0.4, y: 0, z: 0.04 },
    },
    shouldApplySpine: true,
    sideBend: 0.1,
    twist: 0.2,
  };
}

function spineApplyOptions(shouldCountRecordedSpineRetarget = false) {
  return {
    activeDrive: {
      chest: 1,
      hips: 1,
      spine: 1,
      upperChest: 1,
    },
    shouldCountRecordedSpineRetarget,
    solver: {
      chest: 0.35,
      hips: 0.15,
      spine: 0.25,
      upperChest: 0.45,
    },
  };
}

function bones() {
  const root = new THREE.Object3D();
  const boneMap = new Map<string, THREE.Object3D>();
  [
    "chest",
    "hips",
    "leftHand",
    "leftLowerArm",
    "leftUpperArm",
    "rightHand",
    "rightLowerArm",
    "rightUpperArm",
    "spine",
    "upperChest",
  ].forEach((boneName) => {
    const bone = new THREE.Object3D();
    boneMap.set(boneName, bone);
    root.add(bone);
  });
  boneMap.get("leftLowerArm")?.position.set(0, -1, 0);
  boneMap.get("leftHand")?.position.set(0, -1, 0);
  boneMap.get("rightLowerArm")?.position.set(0, -1, 0);
  boneMap.get("rightHand")?.position.set(0, -1, 0);
  root.updateMatrixWorld(true);

  return boneMap;
}

describe("movementAvatarUpperBodyRuntime", () => {
  it("applies spine and leaves retargeted arms untouched", () => {
    const boneMap = bones();
    const lastGood: Record<string, THREE.Quaternion> = {};

    const result = applyMovementAvatarUpperBodyRuntimeToVrmBones({
      activeSpineDrive: spineDrive(),
      armRelaxedSlerp: 0.35,
      avatarRole: "player",
      lastGood,
      leftArmDecision: armDecision("left"),
      leftArmRetargetApplied: true,
      lookupBone: (boneName) => boneMap.get(boneName) ?? null,
      rightArmDecision: armDecision("right"),
      rightArmRetargetApplied: true,
      shouldApplySolverTorso: true,
      sources: {},
      spineApplyOptions: spineApplyOptions(),
      torsoTrackingReady: true,
    });

    expect(result.spine).toEqual({ applied: 4, mode: "active" });
    expect(result.rightArm).toEqual({ handled: false, mode: "retargeted" });
    expect(result.leftArm).toEqual({ handled: false, mode: "retargeted" });
    expect(result.recordedSpineRetargetCount).toBe(0);
    expect(boneMap.get("upperChest")?.quaternion.w).toBeLessThan(1);
    // Retargeted arms must not be perturbed by the fallback application.
    expect(boneMap.get("leftUpperArm")?.quaternion.w).toBe(1);
    expect(boneMap.get("rightUpperArm")?.quaternion.w).toBe(1);
  });

  it("holds the last good arm pose when the retarget misses but tracking is ready", () => {
    const boneMap = bones();
    const storedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.8));
    const lastGood: Record<string, THREE.Quaternion> = {
      leftLowerArm: storedQuaternion.clone(),
      leftUpperArm: storedQuaternion.clone(),
    };

    const result = applyMovementAvatarUpperBodyRuntimeToVrmBones({
      activeSpineDrive: spineDrive(),
      armRelaxedSlerp: 0.35,
      avatarRole: "player",
      lastGood,
      leftArmDecision: armDecision("left"),
      leftArmRetargetApplied: false,
      lookupBone: (boneName) => boneMap.get(boneName) ?? null,
      rightArmDecision: armDecision("right", {
        isTrackingReady: false,
        unreadyFallback: "relax",
      }),
      rightArmRetargetApplied: false,
      shouldApplySolverTorso: true,
      sources: {},
      spineApplyOptions: spineApplyOptions(true),
      torsoTrackingReady: false,
    });

    expect(result.recordedSpineRetargetCount).toBe(1);
    expect(result.leftArm).toEqual({ handled: true, mode: "hold-last-good" });
    expect(result.rightArm).toEqual({ handled: true, mode: "relax" });
    expect(boneMap.get("leftUpperArm")?.quaternion.w).toBeLessThan(1);
  });
});
