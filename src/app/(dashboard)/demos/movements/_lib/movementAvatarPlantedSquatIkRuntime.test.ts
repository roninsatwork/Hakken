import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import {
  applyMovementAvatarPlantedSquatIkRuntimeFrame,
  applyMovementAvatarPlantedSquatIkRuntimeToVrmBones,
  applyMovementAvatarPlantedSquatIkRuntimeVrmFrame,
} from "./movementAvatarPlantedSquatIkRuntime";

function restMap(): MovementAvatarRetargetRestMap {
  return {
    leftLowerLeg: {
      worldDirection: new THREE.Vector3(0, -1, 0),
      worldQuaternion: new THREE.Quaternion(),
    },
    leftUpperLeg: {
      worldDirection: new THREE.Vector3(0, -1, 0),
      worldQuaternion: new THREE.Quaternion(),
    },
    rightLowerLeg: {
      worldDirection: new THREE.Vector3(0, -1, 0),
      worldQuaternion: new THREE.Quaternion(),
    },
    rightUpperLeg: {
      worldDirection: new THREE.Vector3(0, -1, 0),
      worldQuaternion: new THREE.Quaternion(),
    },
  };
}

describe("movementAvatarPlantedSquatIkRuntime", () => {
  it("skips low-depth planted squat IK without refreshing the rest map", () => {
    const existingRestMap = restMap();

    const result = applyMovementAvatarPlantedSquatIkRuntimeToVrmBones({
      avatarRole: "player",
      currentRestMap: existingRestMap,
      depth: 0.02,
      forward: new THREE.Vector3(0, 0, 1),
      lookupBone: () => null,
      refreshRestMap: () => {
        throw new Error("rest map should not refresh when planted squat IK is inactive");
      },
    });

    expect(result).toEqual({
      applied: 0,
      appliedDepth: 0,
      restMap: existingRestMap,
    });
  });

  it("applies active planted squat IK specs and threads the rest map", () => {
    const root = new THREE.Object3D();
    const rightUpperLeg = new THREE.Object3D();
    const rightLowerLeg = new THREE.Object3D();
    root.add(rightUpperLeg);
    root.add(rightLowerLeg);
    root.updateMatrixWorld(true);
    const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
      ["rightLowerLeg", rightLowerLeg],
      ["rightUpperLeg", rightUpperLeg],
    ]);

    const result = applyMovementAvatarPlantedSquatIkRuntimeToVrmBones({
      avatarRole: "player",
      currentRestMap: {},
      depth: 0.74,
      forward: new THREE.Vector3(0, 0, 1),
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      refreshRestMap: restMap,
    });

    expect(result.applied).toBe(2);
    expect(result.appliedDepth).toBeGreaterThan(0.7);
    expect(result.restMap.rightUpperLeg).toBeDefined();
    expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(rightLowerLeg.quaternion.w).toBeLessThan(1);
  });

  it("applies planted squat IK from the avatar root frame direction", () => {
    const avatarRoot = new THREE.Object3D();
    const rightUpperLeg = new THREE.Object3D();
    const rightLowerLeg = new THREE.Object3D();
    avatarRoot.add(rightUpperLeg);
    avatarRoot.add(rightLowerLeg);
    avatarRoot.rotation.y = Math.PI / 4;
    avatarRoot.updateMatrixWorld(true);
    const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
      ["rightLowerLeg", rightLowerLeg],
      ["rightUpperLeg", rightUpperLeg],
    ]);

    const result = applyMovementAvatarPlantedSquatIkRuntimeFrame({
      avatarRole: "player",
      avatarRoot,
      currentRestMap: {},
      depth: 0.74,
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      refreshRestMap: restMap,
    });

    expect(result.applied).toBe(2);
    expect(result.appliedDepth).toBeGreaterThan(0.7);
    expect(result.restMap.rightUpperLeg).toBeDefined();
    expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(rightLowerLeg.quaternion.w).toBeLessThan(1);
  });

  it("refreshes planted squat IK rest map from the VRM frame", () => {
    const avatarRoot = new THREE.Object3D();
    const rightUpperLeg = new THREE.Object3D();
    const rightLowerLeg = new THREE.Object3D();
    const rightFoot = new THREE.Object3D();
    avatarRoot.add(rightUpperLeg);
    avatarRoot.add(rightLowerLeg);
    avatarRoot.add(rightFoot);
    rightUpperLeg.position.set(0, 1, 0);
    rightLowerLeg.position.set(0, 0, 0);
    rightFoot.position.set(0, -1, 0);
    avatarRoot.updateMatrixWorld(true);
    const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
      ["rightFoot", rightFoot],
      ["rightLowerLeg", rightLowerLeg],
      ["rightUpperLeg", rightUpperLeg],
    ]);
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: (boneName: MovementAvatarRetargetBoneName) => bones.get(boneName) ?? null,
      },
      scene: avatarRoot,
    } as unknown as VRM;

    const result = applyMovementAvatarPlantedSquatIkRuntimeVrmFrame({
      avatarRole: "player",
      avatarRoot,
      currentRestMap: {},
      depth: 0.74,
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      vrm,
    });

    expect(result.applied).toBe(2);
    expect(result.restMap.rightUpperLeg).toBeDefined();
    expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(rightLowerLeg.quaternion.w).toBeLessThan(1);
  });
});
