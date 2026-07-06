import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { MovementAvatarArmDecision } from "./movementAvatarPipeline";
import type { MovementAvatarArmTargetCompositionDecision } from "./movementAvatarArmTarget";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import { applyMovementAvatarUpperBodyFrameRuntime } from "./movementAvatarUpperBodyFrameRuntime";
import type { VrmSolverLandmark } from "./vrmRigging";

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

function armTargetComposition(): MovementAvatarArmTargetCompositionDecision {
  return {
    armTargets: {
      left: {
        elbowTarget: landmark(13),
        frontBias: -0.2,
        wristSource: "left-wrist",
        wristTarget: landmark(15),
      },
      right: {
        elbowTarget: landmark(14),
        frontBias: 0.2,
        safeZScale: 0.2,
        wristSource: "right-wrist",
        wristTarget: landmark(16),
      },
    },
    leftElbowTarget: landmark(13),
    leftFrontBodyArmBias: -0.2,
    leftWristTarget: landmark(15),
    playerArmLandmarks: landmarks(),
    playerSafeArmZScale: 0.2,
    rightElbowTarget: landmark(14),
    rightFrontBodyArmBias: 0.2,
    rightWristTarget: landmark(16),
  };
}

function spineDrive(overrides: Partial<MovementAvatarPlayerSpineDrive> = {}): MovementAvatarPlayerSpineDrive {
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
    ...overrides,
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

describe("movementAvatarUpperBodyFrameRuntime", () => {
  it("applies upper-body runtime without recorded retarget mappings for live player frames", () => {
    const boneMap = bones();
    const applyRetargetMappings = vi.fn(() => ({ applied: 2 }));

    const result = applyMovementAvatarUpperBodyFrameRuntime({
      activeSpineDrive: spineDrive(),
      applyRetargetMappings,
      armTargetComposition: armTargetComposition(),
      avatarRole: "player",
      boneEaseOptions: {
        armRelaxedSlerp: 0.35,
        handNeutralSlerp: 0.22,
      },
      fallbackZScale: 1,
      lastGood: {},
      leftArmDecision: armDecision("left"),
      lookupBone: (boneName) => boneMap.get(boneName) ?? null,
      rightArmDecision: armDecision("right"),
      shouldApplySolverTorso: true,
      shouldUseRetargetedUpperBody: false,
      sources: {},
      torsoTrackingReady: true,
    });

    expect(result.retargetAppliedUpperBody).toBe(0);
    expect(result.upperBodyRuntimeApplication.spine).toEqual({ applied: 4, mode: "active" });
    expect(result.upperBodyRuntimeApplication.rightArm.mode).toBe("tracked-aim");
    expect(applyRetargetMappings).not.toHaveBeenCalled();
  });

  it("adds recorded upper-body retarget mapping counts to the spine count", () => {
    const applyRetargetMappings = vi.fn(() => ({ applied: 2 }));

    const result = applyMovementAvatarUpperBodyFrameRuntime({
      activeSpineDrive: spineDrive({ shouldApplySpine: false }),
      applyRetargetMappings,
      armTargetComposition: armTargetComposition(),
      avatarRole: "instructor",
      boneEaseOptions: {
        armRelaxedSlerp: 0.35,
        handNeutralSlerp: 0.22,
      },
      fallbackZScale: 0.1,
      lastGood: {},
      leftArmDecision: armDecision("left"),
      lookupBone: () => null,
      rightArmDecision: armDecision("right"),
      shouldApplySolverTorso: true,
      shouldUseRetargetedUpperBody: true,
      sources: {},
      torsoTrackingReady: false,
    });

    expect(applyRetargetMappings).toHaveBeenCalledTimes(1);
    expect(result.upperBodyRuntimeApplication.recordedSpineRetargetCount).toBe(0);
    expect(result.retargetAppliedUpperBody).toBe(2);
    expect(result.upperBodyRuntimeApplication.rightArm.mode).toBe("retarget-skipped");
  });
});
