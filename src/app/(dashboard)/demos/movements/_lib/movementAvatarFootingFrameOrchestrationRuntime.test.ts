import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createMovementAvatarFootLockState } from "./movementAvatarFootLock";
import { applyMovementAvatarFootingFrameOrchestrationRuntime } from "./movementAvatarFootingFrameOrchestrationRuntime";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type {
  MovementAvatarHipsApplicationDecision,
  MovementAvatarHipsPositionOptionsDecision,
} from "./movementAvatarPipeline";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementRootMotionStepResponseDecision } from "./movementRootMotion";

const hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision = {
  avatarRootVisualLerp: 0.28,
  floorContactCorrectionScale: 0.7,
  rootLerp: 0.5,
  shouldUseCalibratedFloorCorrection: true,
  squatHipDropLimit: 0.88,
  squatHipDropScale: 0.78,
};

const hipsApplication: MovementAvatarHipsApplicationDecision = {
  shouldApplyFloorContactCorrection: true,
  shouldApplySquatDrop: true,
  squatDrop: 0.4,
};

function lowerBodyDrive(): MovementAvatarLowerBodyDrive {
  return {
    groundedSquatDepth: 0,
    liveSquatDepth: 0.4,
    playerLegRaiseDepth: 0,
    playerLegRaiseSide: null,
    playerLowerBodyState: "planted-squat",
    playerSquatPresentationDepth: 0.4,
    shouldApplyLowerBody: true,
    shouldApplySolverTorso: true,
    shouldDrivePlayerLegRaise: false,
    shouldDrivePlayerSquat: true,
    visualRootDrop: 0.2,
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
      solvedSegments: [],
      sourceQuality: 0.9,
    },
    hipDrop: 0.2,
    kneeLift: {
      left: 0,
      right: 0,
    },
    segments: {},
    squatDepth: 0.4,
  };
}

function inactiveStepResponse(): MovementRootMotionStepResponseDecision {
  return {
    footLiftOffset: 0,
    landingCompression: 0,
    owner: "step-response-none",
    shouldApply: false,
    side: null,
    slerp: 0,
    summary: "none",
  };
}

describe("movementAvatarFootingFrameOrchestrationRuntime", () => {
  it("looks up foot bones, applies footing, and threads refs", () => {
    const scene = new THREE.Object3D();
    const avatarRoot = new THREE.Object3D();
    const leftFoot = new THREE.Object3D();
    const rightFoot = new THREE.Object3D();
    const hipsNode = {
      position: new THREE.Vector3(0, 1, 0),
    };
    scene.add(avatarRoot);
    avatarRoot.position.set(1, -2, 0.5);
    avatarRoot.add(leftFoot);
    avatarRoot.add(rightFoot);
    leftFoot.position.set(-0.2, -0.4, 0.1);
    rightFoot.position.set(0.2, -0.6, -0.1);
    const baseHipsPositionRef = {
      current: null as THREE.Vector3 | null,
    };
    const plantedFootLockRef = {
      current: createMovementAvatarFootLockState(),
    };
    const lookups: string[] = [];

    const result = applyMovementAvatarFootingFrameOrchestrationRuntime({
      avatarRole: "player",
      avatarRoot,
      baseHipsPositionRef,
      floorY: -2.75,
      hipsApplication,
      hipsNode,
      hipsPositionOptions,
      lookupBone: (bone) => {
        lookups.push(bone);
        if (bone === "leftFoot") return leftFoot;
        if (bone === "rightFoot") return rightFoot;
        return null;
      },
      lowerBodyDrive: lowerBodyDrive(),
      lowerBodyTrackingReady: true,
      plantedFootLockRef,
      retargetFrame: retargetFrame(),
      scene,
      shouldApplyLowerBody: true,
      shouldHoldPlayerSquatPose: false,
      stepResponse: inactiveStepResponse(),
    });

    expect(lookups).toEqual(["leftFoot", "rightFoot"]);
    expect(result.footingRuntime.footWorldSnapshot.left?.x).toBeCloseTo(0.8);
    expect(baseHipsPositionRef.current?.y).toBe(1);
    expect(plantedFootLockRef.current.strength).toBeGreaterThan(0);
    expect(result.footLockCorrection).toBe(result.footingRuntime.footLockRuntimeApplication.appliedCorrection);
    expect(result.footLockDrift).toBe(result.footingRuntime.footLockRuntimeApplication.drift);
    expect(result.footLockState).toBe(result.footingRuntime.nextFootLockState);
  });
});
