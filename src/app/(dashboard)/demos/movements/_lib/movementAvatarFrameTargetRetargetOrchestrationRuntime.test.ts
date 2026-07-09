import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime } from "./movementAvatarFrameTargetRetargetOrchestrationRuntime";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import type { MovementRetargetFrame } from "./movementRetargeting";
import {
  createVrmImageSolverLandmarks,
  normalizeVrmLandmark,
  type VrmSolverLandmark,
} from "./vrmRigging";

function solverLandmarks(): VrmSolverLandmark[] {
  return makeMovementAvatarProofMotionPayload("standing").landmarks.map(normalizeVrmLandmark);
}

function lowerBodyDrive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
  return {
    groundedSquatDepth: 0,
    liveSquatDepth: 0,
    playerLegRaiseDepth: 0,
    playerLegRaiseSide: null,
    playerLowerBodyState: "neutral",
    playerSquatPresentationDepth: 0,
    shouldApplyLowerBody: true,
    shouldApplySolverTorso: true,
    shouldDrivePlayerLegRaise: false,
    shouldDrivePlayerSquat: false,
    visualRootDrop: 0,
    ...overrides,
  };
}

function retargetFrame(): MovementRetargetFrame {
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
  };
}

describe("movementAvatarFrameTargetRetargetOrchestrationRuntime", () => {
  it("composes target selections and retarget frame adapters together", () => {
    const imageLandmarks = solverLandmarks();
    const targetSolverLandmarks = createVrmImageSolverLandmarks(imageLandmarks);
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
    const currentRestMap: MovementAvatarRetargetRestMap = {};
    const lastGood: Record<string, THREE.Quaternion> = {};

    const runtime = resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime({
      avatarRole: "instructor",
      avatarRoot: scene,
      currentRestMap,
      instructorSquatPresentationDepth: 0.55,
      lastGood,
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      lowerBodySegmentMotion: 0.55,
      retargetFrame: retargetFrame(),
      targetSolverLandmarks,
      vrm,
    });

    expect(runtime.retargetFrameRuntimeAdapters.getRestMap()).toBe(currentRestMap);

    const retargetApplication = runtime.retargetFrameRuntimeAdapters.applyRetargetMappings([
      MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
      MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[1]!,
    ]);

    expect(retargetApplication.applied).toBeGreaterThan(0);
    expect(lastGood.rightUpperLeg).toBeInstanceOf(THREE.Quaternion);
    expect(runtime.retargetFrameRuntimeAdapters.getRestMap().rightUpperLeg).toBeDefined();
  });
});
