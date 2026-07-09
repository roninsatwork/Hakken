import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { MovementAvatarArmDecision } from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import { applyMovementAvatarUpperBodyFrameOrchestrationRuntime } from "./movementAvatarUpperBodyFrameOrchestrationRuntime";
import type { VrmRiggedPose } from "./vrmRigging";

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

describe("movementAvatarUpperBodyFrameOrchestrationRuntime", () => {
  it("wires retarget adapters, last-good ref, and rigged-pose sources", () => {
    const spine = new THREE.Object3D();
    const chest = new THREE.Object3D();
    const hips = new THREE.Object3D();
    const boneMap = new Map<string, THREE.Object3D>([
      ["chest", chest],
      ["hips", hips],
      ["spine", spine],
    ]);
    const applyRetargetMappings = vi.fn(() => ({
      applied: 2,
      arms: 2,
      feet: 0,
      legs: 0,
      restMap: {},
      spine: 0,
    }));
    const lastGoodQuaternionRef = {
      current: {} as Record<string, THREE.Quaternion>,
    };
    const riggedPose: VrmRiggedPose = {
      Hips: {
        rotation: { x: 0.1, y: 0, z: 0 },
      },
      Spine: { x: 0.2, y: 0, z: 0 },
    };

    const result = applyMovementAvatarUpperBodyFrameOrchestrationRuntime({
      activeSpineDrive: spineDrive(),
      avatarRole: "instructor",
      boneEaseOptions: {
        armRelaxedSlerp: 0.35,
      },
      lastGoodQuaternionRef,
      leftArmDecision: armDecision("left"),
      lookupBone: (boneName) => boneMap.get(boneName) ?? null,
      retargetFrameRuntimeAdapters: {
        applyRetargetMappings,
      },
      riggedPose,
      rightArmDecision: armDecision("right"),
      shouldApplySolverTorso: true,
      torsoTrackingReady: true,
    });

    // One call per mapping group: left arm, right arm, spine.
    expect(applyRetargetMappings).toHaveBeenCalledTimes(3);
    expect(result.retargetAppliedUpperBody).toBe(7);
    expect(result.upperBodyFrameRuntime.retargetAppliedUpperBody).toBe(7);
    expect(result.upperBodyFrameRuntime.upperBodyRuntimeApplication.recordedSpineRetargetCount).toBe(1);
    expect(result.upperBodyFrameRuntime.upperBodyRuntimeApplication.spine.applied).toBeGreaterThan(0);
  });
});
