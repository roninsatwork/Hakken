import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createMovementAvatarRetargetFrameRuntimeAdapters } from "./movementAvatarRetargetFrameRuntime";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  type MovementAvatarRetargetBoneName,
} from "./movementAvatarRestPose";
import type { MovementRetargetFrame } from "./movementRetargeting";

function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
  return {
    contacts: {
      leftFoot: true,
      rightFoot: true,
    },
    debug: {
      heldSegments: [],
      solvedSegments: ["rightThigh", "rightShin"],
      sourceQuality: 0.9,
    },
    hipDrop: 0.4,
    kneeLift: {
      left: 0,
      right: 0.6,
    },
    segments: {
      rightShin: {
        confidence: 0.95,
        direction: { x: 0.1, y: -0.6, z: -0.2 },
        length: 0.5,
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

describe("movementAvatarRetargetFrameRuntime", () => {
  it("threads rest-map and last-good state through frame retarget adapters", () => {
    const scene = new THREE.Object3D();
    const rightUpperLeg = new THREE.Object3D();
    const rightLowerLeg = new THREE.Object3D();
    const rightFoot = new THREE.Object3D();
    scene.add(rightUpperLeg);
    scene.add(rightLowerLeg);
    scene.add(rightFoot);
    rightUpperLeg.position.set(0, 1, 0);
    rightLowerLeg.position.set(0, 0, 0);
    rightFoot.position.set(0, -1, 0);
    scene.updateMatrixWorld(true);
    const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
      ["rightFoot", rightFoot],
      ["rightLowerLeg", rightLowerLeg],
      ["rightUpperLeg", rightUpperLeg],
    ]);
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: (boneName: MovementAvatarRetargetBoneName) => bones.get(boneName) ?? null,
      },
      scene,
    } as unknown as VRM;
    const lastGood: Record<string, THREE.Quaternion> = {};

    const adapters = createMovementAvatarRetargetFrameRuntimeAdapters({
      avatarRole: "instructor",
      avatarRoot: scene,
      currentRestMap: {},
      instructorSquatPresentationDepth: 0.55,
      lastGood,
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      lowerBodySegmentMotion: 0.55,
      retargetFrame: retargetFrame(),
      shouldUseRetargetedUpperBody: false,
      vrm,
    });

    const retargetApplication = adapters.applyRetargetMappings([
      MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
      MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[1]!,
    ]);
    const afterRetarget = adapters.getRestMap();
    const plantedDepth = adapters.applyPlantedSquatIk(0.74);

    expect(retargetApplication.applied).toBeGreaterThan(0);
    expect(afterRetarget.rightUpperLeg).toBeDefined();
    expect(lastGood.rightUpperLeg).toBeInstanceOf(THREE.Quaternion);
    expect(plantedDepth).toBeGreaterThan(0.7);
    expect(adapters.getRestMap().rightUpperLeg).toBeDefined();
    expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
  });
});
