import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarActiveSpinePoseApplication,
  applyMovementAvatarSpineNeutralPoseApplication,
  applyMovementAvatarSpinePoseApplicationToVrmBones,
  applyMovementAvatarSpineRotationSpecs,
  applyMovementAvatarSpineSolverPoseApplication,
  applyMovementAvatarSpineSolverSpecs,
  mirrorMovementAvatarSpineSolverRotation,
} from "./movementAvatarSpineApplication";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";

function spineApplyOptions() {
  return {
    activeDrive: {
      chest: 0.3,
      hips: 0.1,
      spine: 0.2,
      upperChest: 0.4,
    },
    shouldCountRecordedSpineRetarget: false,
    solver: {
      chest: 0.35,
      hips: 0.15,
      spine: 0.25,
      upperChest: 0.45,
    },
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

describe("movement avatar spine application", () => {
  it("executes spine rotation specs through the supplied renderer callback", () => {
    const appliedBones: string[] = [];

    const result = applyMovementAvatarSpineRotationSpecs({
      apply: (spec) => {
        appliedBones.push(spec.bone);
      },
      specs: [
        { bone: "hips", rotation: { x: 0, y: 0, z: 0 }, slerp: 0.12 },
        { bone: "spine", rotation: { x: 0.2, y: 0.03, z: 0.01 }, slerp: 0.44 },
        { bone: "chest", rotation: { x: 0.3, y: 0.02, z: 0.12 }, slerp: 0.42 },
      ],
    });

    expect(result.applied).toBe(3);
    expect(appliedBones).toEqual(["hips", "spine", "chest"]);
  });

  it("mirrors recorded torso solver rotations without changing pitch or yaw", () => {
    expect(mirrorMovementAvatarSpineSolverRotation({
      rotationOrder: "XYZ",
      x: 0.2,
      y: -0.1,
      z: 0.45,
    })).toEqual({
      rotationOrder: "XYZ",
      x: 0.2,
      y: -0.1,
      z: -0.45,
    });
    expect(mirrorMovementAvatarSpineSolverRotation(null)).toBeUndefined();
  });

  it("resolves solver source rotations before renderer writes", () => {
    const requests: Array<{
      bone: string;
      rotationZ: number | undefined;
      source: string;
      wasMirrored: boolean;
    }> = [];

    const result = applyMovementAvatarSpineSolverSpecs({
      apply: (request) => {
        requests.push({
          bone: request.bone,
          rotationZ: request.rotation?.z,
          source: request.source,
          wasMirrored: request.wasMirrored,
        });
      },
      sources: {
        hips: { x: 0.1, y: 0.2, z: 0.3 },
        spine: { x: -0.1, y: -0.2, z: -0.4 },
      },
      specs: [
        {
          bone: "hips",
          limits: { x: 0.35, y: 0.75, z: 0.45 },
          mirrorZ: false,
          scale: 1,
          slerp: 0.34,
          source: "hips",
        },
        {
          bone: "chest",
          limits: { x: 0.35, y: 0.5, z: 0.35 },
          mirrorZ: true,
          scale: 0.35,
          slerp: 0.36,
          source: "spine",
        },
      ],
    });

    expect(result.applied).toBe(2);
    expect(requests).toEqual([
      { bone: "hips", rotationZ: 0.3, source: "hips", wasMirrored: false },
      { bone: "chest", rotationZ: 0.4, source: "spine", wasMirrored: true },
    ]);
  });

  it("resolves and executes active spine pose application", () => {
    const applied: string[] = [];

    const result = applyMovementAvatarActiveSpinePoseApplication({
      applyRotation: (spec) => {
        applied.push(`${spec.bone}:${spec.slerp}`);
      },
      spineApplyOptions: spineApplyOptions(),
      spineDrive: spineDrive(),
    });

    expect(result.applied).toBe(4);
    expect(applied).toEqual([
      "hips:0.1",
      "spine:0.2",
      "chest:0.3",
      "upperChest:0.4",
    ]);
  });

  it("resolves and executes spine solver pose application", () => {
    const applied: Array<{ bone: string; rotationZ: number | undefined; wasMirrored: boolean }> = [];

    const result = applyMovementAvatarSpineSolverPoseApplication({
      applyRotation: (request) => {
        applied.push({
          bone: request.bone,
          rotationZ: request.rotation?.z,
          wasMirrored: request.wasMirrored,
        });
      },
      avatarRole: "instructor",
      sources: {
        hips: { x: 0.1, y: 0, z: 0.3 },
        spine: { x: 0.2, y: 0, z: -0.4 },
      },
      spineApplyOptions: spineApplyOptions(),
    });

    expect(result.applied).toBe(4);
    expect(applied).toEqual([
      { bone: "hips", rotationZ: -0.3, wasMirrored: true },
      { bone: "spine", rotationZ: 0.4, wasMirrored: true },
      { bone: "chest", rotationZ: 0.4, wasMirrored: true },
      { bone: "upperChest", rotationZ: 0.4, wasMirrored: true },
    ]);
  });

  it("resolves and executes neutral spine pose application", () => {
    const appliedBones: string[] = [];

    const result = applyMovementAvatarSpineNeutralPoseApplication({
      applyRotation: (spec) => {
        appliedBones.push(spec.bone);
      },
    });

    expect(result.applied).toBe(4);
    expect(appliedBones).toEqual(["hips", "spine", "chest", "upperChest"]);
  });

  it("applies active spine poses directly to VRM bones", () => {
    const bones = {
      chest: new THREE.Object3D(),
      hips: new THREE.Object3D(),
      spine: new THREE.Object3D(),
      upperChest: new THREE.Object3D(),
    };

    const result = applyMovementAvatarSpinePoseApplicationToVrmBones({
      activeSpineDrive: spineDrive(),
      avatarRole: "player",
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      shouldApplySolverTorso: true,
      sources: {},
      spineApplyOptions: spineApplyOptions(),
      torsoTrackingReady: true,
    });

    expect(result).toEqual({ applied: 4, mode: "active" });
    expect(bones.hips.quaternion.w).toBeLessThan(1);
    expect(bones.upperChest.quaternion.w).toBeLessThan(1);
  });

  it("applies solver spine poses directly to VRM bones and stores last-good rotations", () => {
    const bones = {
      chest: new THREE.Object3D(),
      hips: new THREE.Object3D(),
      spine: new THREE.Object3D(),
      upperChest: new THREE.Object3D(),
    };
    const stored: string[] = [];

    const result = applyMovementAvatarSpinePoseApplicationToVrmBones({
      activeSpineDrive: {
        ...spineDrive(),
        shouldApplySpine: false,
      },
      avatarRole: "instructor",
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      shouldApplySolverTorso: true,
      sources: {
        hips: { x: 0.1, y: 0, z: 0.3 },
        spine: { x: 0.2, y: 0, z: -0.4 },
      },
      spineApplyOptions: spineApplyOptions(),
      storeLastGood: (bone) => {
        stored.push(bone);
      },
      torsoTrackingReady: true,
    });

    expect(result).toEqual({ applied: 4, mode: "solver" });
    expect(stored).toEqual(["hips", "spine", "chest", "upperChest"]);
    expect(bones.chest.quaternion.w).toBeLessThan(1);
  });

  it("falls back to neutral spine pose application when active and solver spine are unavailable", () => {
    const bones = {
      chest: new THREE.Object3D(),
      hips: new THREE.Object3D(),
      spine: new THREE.Object3D(),
      upperChest: new THREE.Object3D(),
    };

    const result = applyMovementAvatarSpinePoseApplicationToVrmBones({
      activeSpineDrive: {
        ...spineDrive(),
        shouldApplySpine: false,
      },
      avatarRole: "player",
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      shouldApplySolverTorso: false,
      sources: {},
      spineApplyOptions: spineApplyOptions(),
      torsoTrackingReady: false,
    });

    expect(result).toEqual({ applied: 4, mode: "neutral" });
    expect(bones.spine.quaternion.w).toBeLessThan(1);
  });
});
