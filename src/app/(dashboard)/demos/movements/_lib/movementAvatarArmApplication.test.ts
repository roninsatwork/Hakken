import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { MovementAvatarArmDecision } from "./movementAvatarPipeline";
import {
  applyMovementAvatarArmApplication,
  applyMovementAvatarArmApplicationToVrmBones,
} from "./movementAvatarArmApplication";

function armDecision(overrides: Partial<MovementAvatarArmDecision> = {}): MovementAvatarArmDecision {
  return {
    endpointConfidence: 0.9,
    isTrackingReady: true,
    side: "left",
    unreadyFallback: "relax",
    ...overrides,
  };
}

describe("applyMovementAvatarArmApplication", () => {
  it("leaves retargeted arms alone", () => {
    const calls: string[] = [];

    const result = applyMovementAvatarArmApplication({
      armDecision: armDecision(),
      holdLastGood: () => calls.push("hold"),
      relax: () => calls.push("relax"),
      retargetApplied: true,
      side: "left",
    });

    expect(result).toEqual({ handled: false, mode: "retargeted" });
    expect(calls).toEqual([]);
  });

  it("holds the last good pose when the retarget misses but tracking is ready", () => {
    const calls: string[] = [];

    const result = applyMovementAvatarArmApplication({
      armDecision: armDecision(),
      holdLastGood: () => calls.push("hold"),
      relax: () => calls.push("relax"),
      retargetApplied: false,
      side: "left",
    });

    expect(result).toEqual({ handled: true, mode: "hold-last-good" });
    expect(calls).toEqual(["hold"]);
  });

  it("holds the last good pose for the hold-last-good unready fallback", () => {
    const calls: string[] = [];

    const result = applyMovementAvatarArmApplication({
      armDecision: armDecision({
        isTrackingReady: false,
        unreadyFallback: "hold-last-good",
      }),
      holdLastGood: () => calls.push("hold"),
      relax: () => calls.push("relax"),
      retargetApplied: false,
      side: "right",
    });

    expect(result).toEqual({ handled: true, mode: "hold-last-good" });
    expect(calls).toEqual(["hold"]);
  });

  it("relaxes the arm when tracking is unready with the relax fallback", () => {
    const calls: string[] = [];

    const result = applyMovementAvatarArmApplication({
      armDecision: armDecision({ isTrackingReady: false }),
      holdLastGood: () => calls.push("hold"),
      relax: () => calls.push("relax"),
      retargetApplied: false,
      side: "right",
    });

    expect(result).toEqual({ handled: true, mode: "relax" });
    expect(calls).toEqual(["relax"]);
  });
});

describe("applyMovementAvatarArmApplicationToVrmBones", () => {
  function bones() {
    const root = new THREE.Object3D();
    const boneMap = new Map<string, THREE.Object3D>();
    ["leftHand", "leftLowerArm", "leftUpperArm", "rightHand", "rightLowerArm", "rightUpperArm"]
      .forEach((boneName) => {
        const bone = new THREE.Object3D();
        boneMap.set(boneName, bone);
        root.add(bone);
      });
    root.updateMatrixWorld(true);
    return boneMap;
  }

  it("applies the stored last-good quaternions to the arm bones", () => {
    const boneMap = bones();
    const stored = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.7));

    const result = applyMovementAvatarArmApplicationToVrmBones({
      armDecision: armDecision(),
      armRelaxedSlerp: 0.3,
      lastGood: {
        leftLowerArm: stored.clone(),
        leftUpperArm: stored.clone(),
      },
      lookupBone: (boneName) => boneMap.get(boneName) ?? null,
      retargetApplied: false,
      side: "left",
    });

    expect(result.mode).toBe("hold-last-good");
    // Hold eases toward the stored pose rather than snapping.
    const upperArm = boneMap.get("leftUpperArm")!;
    expect(upperArm.quaternion.w).toBeLessThan(1);
    expect(upperArm.quaternion.angleTo(stored)).toBeLessThan(0.7);
  });

  it("eases toward the relaxed pose when tracking is unready", () => {
    const boneMap = bones();

    const result = applyMovementAvatarArmApplicationToVrmBones({
      armDecision: armDecision({ isTrackingReady: false }),
      armRelaxedSlerp: 0.5,
      lastGood: {},
      lookupBone: (boneName) => boneMap.get(boneName) ?? null,
      retargetApplied: false,
      side: "right",
    });

    expect(result.mode).toBe("relax");
    expect(boneMap.get("rightUpperArm")?.quaternion.w).toBeLessThan(1);
  });
});
