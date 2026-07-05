import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones } from "./movementAvatarInactiveLowerBodyRuntime";

function lowerBodyBones() {
  return new Map<string, THREE.Object3D>([
    ["leftFoot", new THREE.Object3D()],
    ["leftLowerLeg", new THREE.Object3D()],
    ["leftUpperLeg", new THREE.Object3D()],
    ["rightFoot", new THREE.Object3D()],
    ["rightLowerLeg", new THREE.Object3D()],
    ["rightUpperLeg", new THREE.Object3D()],
  ]);
}

describe("movementAvatarInactiveLowerBodyRuntime", () => {
  it("marks unreliable recorded lower body as source-limited while easing neutral bones", () => {
    const bones = lowerBodyBones();

    const result = applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
      avatarRole: "instructor",
      lookupBone: (bone) => bones.get(bone) ?? null,
      lowerBodyNeutralSlerp: 1,
      lowerBodySourceReliable: false,
    });

    expect(result).toEqual({
      appliedNeutralRotations: 6,
      feetOwner: "recorded-source-limited",
      lowerBodyOwner: "recorded-source-limited",
    });
    expect(bones.get("rightUpperLeg")?.quaternion.w).toBe(1);
  });

  it("keeps owners unchanged for reliable or player inactive paths", () => {
    const instructorResult = applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
      avatarRole: "instructor",
      lookupBone: () => null,
      lowerBodyNeutralSlerp: 0.3,
      lowerBodySourceReliable: true,
    });
    const playerResult = applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
      avatarRole: "player",
      lookupBone: () => null,
      lowerBodyNeutralSlerp: 0.3,
      lowerBodySourceReliable: false,
    });

    expect(instructorResult).toEqual({
      appliedNeutralRotations: 0,
      feetOwner: null,
      lowerBodyOwner: null,
    });
    expect(playerResult).toEqual({
      appliedNeutralRotations: 0,
      feetOwner: null,
      lowerBodyOwner: null,
    });
  });
});
