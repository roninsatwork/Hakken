import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import type { MovementRetargetFrame } from "./movementRetargeting";
import { applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones } from "./movementAvatarRetargetSegmentRuntime";

function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
  return {
    contacts: {
      leftFoot: false,
      rightFoot: true,
    },
    debug: {
      heldSegments: [],
      solvedSegments: ["rightThigh", "rightFoot"],
      sourceQuality: 0.9,
    },
    hipDrop: 0.4,
    kneeLift: {
      left: 0,
      right: 0.6,
    },
    segments: {
      rightFoot: {
        confidence: 0.95,
        direction: { x: 0.1, y: 0.2, z: -0.5 },
        length: 0.2,
      },
      rightThigh: {
        confidence: 0.95,
        direction: { x: 0.3, y: 0.7, z: -0.4 },
        length: 0.5,
      },
    },
    squatDepth: 0.55,
    ...overrides,
  };
}

function restMap(): MovementAvatarRetargetRestMap {
  return {
    rightFoot: {
      worldDirection: new THREE.Vector3(0, -1, 0),
      worldQuaternion: new THREE.Quaternion(),
    },
    rightUpperLeg: {
      worldDirection: new THREE.Vector3(0, -1, 0),
      worldQuaternion: new THREE.Quaternion(),
    },
  };
}

describe("movementAvatarRetargetSegmentRuntime", () => {
  it("applies active mappings and preserves recorded foot plant guards", () => {
    const root = new THREE.Object3D();
    const rightUpperLeg = new THREE.Object3D();
    const rightFoot = new THREE.Object3D();
    root.add(rightUpperLeg);
    root.add(rightFoot);
    root.updateMatrixWorld(true);
    const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
      ["rightFoot", rightFoot],
      ["rightUpperLeg", rightUpperLeg],
    ]);
    const stored: MovementAvatarRetargetBoneName[] = [];

    const result = applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones({
      avatarRole: "instructor",
      currentRestMap: {},
      hasWorldLandmarks: true,
      instructorSquatPresentationDepth: 0.55,
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      lowerBodySegmentMotion: 0.55,
      mappings: [
        MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
        MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[4]!,
      ],
      refreshRestMap: restMap,
      retargetFrame: retargetFrame(),
      shouldUseRetargetedUpperBody: false,
      storeLastGood: (boneName) => {
        stored.push(boneName);
      },
    });

    expect(result).toMatchObject({
      applied: 1,
      feet: 0,
      legs: 1,
    });
    expect(result.restMap.rightUpperLeg).toBeDefined();
    expect(stored).toEqual(["rightUpperLeg"]);
    expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(rightFoot.quaternion.w).toBe(1);
  });

  it("threads the existing rest map when nothing can be applied", () => {
    const existingRestMap = restMap();

    const result = applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones({
      avatarRole: "player",
      canApply: false,
      currentRestMap: existingRestMap,
      hasWorldLandmarks: false,
      instructorSquatPresentationDepth: 0,
      lookupBone: () => null,
      lowerBodySegmentMotion: 0,
      mappings: [MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!],
      refreshRestMap: () => {
        throw new Error("rest map should not refresh when application is disabled");
      },
      retargetFrame: retargetFrame({
        segments: {},
      }),
      shouldUseRetargetedUpperBody: false,
    });

    expect(result.applied).toBe(0);
    expect(result.restMap).toBe(existingRestMap);
  });
});
