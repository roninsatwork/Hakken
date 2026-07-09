import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { MovementAvatarArmDecision } from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import type { MovementAvatarRetargetBoneMapping } from "./movementAvatarRestPose";
import { applyMovementAvatarUpperBodyFrameRuntime } from "./movementAvatarUpperBodyFrameRuntime";

function armDecision(side: "left" | "right"): MovementAvatarArmDecision {
  return {
    endpointConfidence: 0.9,
    isTrackingReady: true,
    side,
    unreadyFallback: "relax",
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
  root.updateMatrixWorld(true);

  return boneMap;
}

describe("movementAvatarUpperBodyFrameRuntime", () => {
  it("retargets both arms and the spine, marking arms as retarget-owned", () => {
    const boneMap = bones();
    const applyRetargetMappings = vi.fn((mappings: MovementAvatarRetargetBoneMapping[]) => ({
      applied: mappings.length,
    }));

    const result = applyMovementAvatarUpperBodyFrameRuntime({
      activeSpineDrive: spineDrive(),
      applyRetargetMappings,
      avatarRole: "player",
      boneEaseOptions: {
        armRelaxedSlerp: 0.35,
      },
      lastGood: {},
      leftArmDecision: armDecision("left"),
      lookupBone: (boneName) => boneMap.get(boneName) ?? null,
      rightArmDecision: armDecision("right"),
      shouldApplySolverTorso: true,
      sources: {},
      torsoTrackingReady: true,
    });

    // Left arm, right arm, and spine mapping groups each apply once.
    expect(applyRetargetMappings).toHaveBeenCalledTimes(3);
    const mappedSegments = applyRetargetMappings.mock.calls
      .flatMap(([mappings]) => mappings.map((mapping) => mapping.segment));
    expect(mappedSegments.sort()).toEqual([
      "leftLowerArm",
      "leftUpperArm",
      "rightLowerArm",
      "rightUpperArm",
      "spine",
    ]);
    expect(result.retargetAppliedUpperBody).toBe(5);
    expect(result.upperBodyRuntimeApplication.spine).toEqual({ applied: 4, mode: "active" });
    expect(result.upperBodyRuntimeApplication.leftArm.mode).toBe("retargeted");
    expect(result.upperBodyRuntimeApplication.rightArm.mode).toBe("retargeted");
  });

  it("falls back per arm when its retarget mappings could not apply", () => {
    const applyRetargetMappings = vi.fn((mappings: MovementAvatarRetargetBoneMapping[]) => ({
      applied: mappings.some((mapping) => mapping.segment.startsWith("left")) ? 0 : mappings.length,
    }));

    const result = applyMovementAvatarUpperBodyFrameRuntime({
      activeSpineDrive: spineDrive({ shouldApplySpine: false }),
      applyRetargetMappings,
      avatarRole: "instructor",
      boneEaseOptions: {
        armRelaxedSlerp: 0.35,
      },
      lastGood: {},
      leftArmDecision: armDecision("left"),
      lookupBone: () => null,
      rightArmDecision: armDecision("right"),
      shouldApplySolverTorso: true,
      sources: {},
      torsoTrackingReady: false,
    });

    expect(result.upperBodyRuntimeApplication.leftArm.mode).toBe("hold-last-good");
    expect(result.upperBodyRuntimeApplication.rightArm.mode).toBe("retargeted");
    // right arm (2) + spine mapping (1) applied.
    expect(result.retargetAppliedUpperBody).toBe(3);
  });
});
