import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createMovementAvatarFootLockState } from "./movementAvatarFootLock";
import { applyMovementAvatarFootingFrameRuntime } from "./movementAvatarFootingFrameRuntime";
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

const neutralHipsApplication: MovementAvatarHipsApplicationDecision = {
  shouldApplyFloorContactCorrection: false,
  shouldApplySquatDrop: false,
  squatDrop: 0,
};

function lowerBodyDrive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
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
    ...overrides,
  };
}

function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
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
    ...overrides,
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

describe("movementAvatarFootingFrameRuntime", () => {
  it("composes foot reads, hips writeback, foot lock, and step response", () => {
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

    const result = applyMovementAvatarFootingFrameRuntime({
      avatarRole: "player",
      avatarRoot,
      baseHipsPosition: null,
      floorY: -2.75,
      hipsApplication: {
        shouldApplyFloorContactCorrection: true,
        shouldApplySquatDrop: true,
        squatDrop: 0.4,
      },
      hipsNode,
      hipsPositionOptions,
      leftFoot,
      lowerBodyDrive: lowerBodyDrive(),
      lowerBodyTrackingReady: true,
      previousFootLockState: createMovementAvatarFootLockState(),
      retargetFrame: retargetFrame(),
      rightFoot,
      scene,
      shouldApplyLowerBody: true,
      shouldHoldPlayerSquatPose: false,
      stepResponse: {
        footLiftOffset: 0.2,
        landingCompression: 0,
        owner: "step-response-left-release",
        shouldApply: true,
        side: "left",
        slerp: 0.5,
        summary: "left foot lift",
      },
    });

    expect(result.footWorldSnapshot.left?.x).toBeCloseTo(0.8);
    expect(result.footWorldSnapshot.lowestFootY).toBeCloseTo(-2.6);
    expect(result.hipsRuntimeApplication.applied).toBe(true);
    expect(result.nextBaseHipsPosition?.y).toBe(1);
    expect(hipsNode.position.y).toBeLessThan(1);
    expect(result.footLockRuntimeApplication.shouldLock).toBe(true);
    expect(result.nextFootLockState.strength).toBeGreaterThan(0);
    expect(result.footLockDebug.strength).toBe(result.nextFootLockState.strength);
    expect(result.rootStepApplication.applied).toBe(true);
    expect(leftFoot.position.y).toBeGreaterThan(-0.4);
  });

  it("returns neutral applications when runtime objects are unavailable", () => {
    const previousFootLockState = createMovementAvatarFootLockState();

    const result = applyMovementAvatarFootingFrameRuntime({
      avatarRole: "player",
      avatarRoot: null,
      baseHipsPosition: new THREE.Vector3(0, 1, 0),
      floorY: -2.75,
      hipsApplication: neutralHipsApplication,
      hipsNode: null,
      hipsPositionOptions,
      leftFoot: null,
      lowerBodyDrive: lowerBodyDrive({ shouldDrivePlayerSquat: false }),
      lowerBodyTrackingReady: false,
      previousFootLockState,
      retargetFrame: retargetFrame({
        contacts: {
          leftFoot: false,
          rightFoot: false,
        },
      }),
      rightFoot: null,
      scene: null,
      shouldApplyLowerBody: false,
      shouldHoldPlayerSquatPose: false,
      stepResponse: inactiveStepResponse(),
    });

    expect(result.footWorldSnapshot).toEqual({
      left: null,
      lowestFootY: null,
      right: null,
    });
    expect(result.hipsRuntimeApplication.applied).toBe(false);
    expect(result.footLockRuntimeApplication.shouldLock).toBe(false);
    expect(result.nextFootLockState.strength).toBe(0);
    expect(result.rootStepApplication).toEqual({ applied: false });
  });
});
