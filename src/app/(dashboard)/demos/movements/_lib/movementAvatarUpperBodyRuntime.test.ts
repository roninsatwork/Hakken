import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { MovementAvatarArmDecision } from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import type { VrmSolverLandmark } from "./vrmRigging";
import { applyMovementAvatarUpperBodyRuntimeToVrmBones } from "./movementAvatarUpperBodyRuntime";

function landmark(index: number): VrmSolverLandmark {
  return {
    visibility: 0.9,
    x: index,
    y: index + 0.1,
    z: index + 0.2,
  };
}

function landmarks() {
  return Array.from({ length: 33 }, (_, index) => landmark(index));
}

function armDecision(side: "left" | "right"): MovementAvatarArmDecision {
  return {
    endpointConfidence: 0.9,
    isTrackingReady: true,
    side,
    unreadyFallback: "relax",
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
  it("applies active spine and tracked arms through one runtime boundary", () => {
    const boneMap = bones();
    const lastGood: Record<string, THREE.Quaternion> = {};

    const result = applyMovementAvatarUpperBodyRuntimeToVrmBones({
      activeSpineDrive: spineDrive(),
      armRelaxedSlerp: 0.35,
      armTargets: {
        leftElbowTarget: landmark(13),
        leftFrontBodyArmBias: -0.2,
        leftWristTarget: landmark(15),
        playerArmLandmarks: landmarks(),
        playerSafeArmZScale: 0.2,
        rightElbowTarget: landmark(14),
        rightFrontBodyArmBias: 0.2,
        rightWristTarget: landmark(16),
      },
      avatarRole: "player",
      fallbackZScale: 1,
      handNeutralSlerp: 0.22,
      lastGood,
      leftArmDecision: armDecision("left"),
      lookupBone: (boneName) => boneMap.get(boneName) ?? null,
      rightArmDecision: armDecision("right"),
      shouldApplySolverTorso: true,
      shouldUseRetargetedUpperBody: false,
      sources: {},
      spineApplyOptions: spineApplyOptions(),
      torsoTrackingReady: true,
    });

    expect(result.spine).toEqual({ applied: 4, mode: "active" });
    expect(result.rightArm.mode).toBe("tracked-aim");
    expect(result.leftArm.mode).toBe("tracked-aim");
    expect(result.recordedSpineRetargetCount).toBe(0);
    expect(boneMap.get("upperChest")?.quaternion.w).toBeLessThan(1);
    expect(Object.keys(lastGood).sort()).toEqual([
      "leftUpperArm",
      "rightUpperArm",
    ]);
  });

  it("reports recorded spine retarget count while local arms are skipped", () => {
    const result = applyMovementAvatarUpperBodyRuntimeToVrmBones({
      activeSpineDrive: {
        ...spineDrive(),
        shouldApplySpine: false,
      },
      armRelaxedSlerp: 0.35,
      armTargets: {
        leftElbowTarget: landmark(13),
        leftFrontBodyArmBias: -0.2,
        leftWristTarget: landmark(15),
        playerArmLandmarks: landmarks(),
        playerSafeArmZScale: 0.2,
        rightElbowTarget: landmark(14),
        rightFrontBodyArmBias: 0.2,
        rightWristTarget: landmark(16),
      },
      avatarRole: "instructor",
      fallbackZScale: 0.1,
      handNeutralSlerp: 0.22,
      lastGood: {},
      leftArmDecision: armDecision("left"),
      lookupBone: () => null,
      rightArmDecision: armDecision("right"),
      shouldApplySolverTorso: true,
      shouldUseRetargetedUpperBody: true,
      sources: {},
      spineApplyOptions: spineApplyOptions(true),
      torsoTrackingReady: false,
    });

    expect(result.recordedSpineRetargetCount).toBe(1);
    expect(result.rightArm).toMatchObject({
      appliedAimRequests: 0,
      handled: false,
      mode: "retarget-skipped",
    });
    expect(result.leftArm.mode).toBe("retarget-skipped");
  });
});
