import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarFootLockRuntimeRootCorrection,
  resolveMovementAvatarFootLockRuntimeDecision,
} from "./movementAvatarFootLockRuntime";
import {
  createMovementAvatarFootLockState,
  resolveMovementAvatarFootLockApplication,
} from "./movementAvatarFootLock";
import { resolveMovementAvatarFootLockOptions } from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementRetargetFrame } from "./movementRetargeting";

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
    hipDrop: 0,
    kneeLift: {
      left: 0,
      right: 0,
    },
    segments: {},
    squatDepth: 0.4,
    ...overrides,
  };
}

describe("movementAvatarFootLockRuntime", () => {
  it("releases the current foot lock when runtime objects are unavailable", () => {
    const state = createMovementAvatarFootLockState();
    state.strength = 0.5;

    const decision = resolveMovementAvatarFootLockRuntimeDecision({
      avatarRole: "player",
      currentLeft: null,
      currentRight: new THREE.Vector3(0.4, -2.7, 0),
      hasAvatarRoot: true,
      lowerBodyDrive: lowerBodyDrive({ shouldDrivePlayerSquat: true }),
      lowerBodyTrackingReady: true,
      previousState: state,
      retargetFrame: retargetFrame(),
      shouldApplyLowerBody: true,
      shouldHoldPlayerSquatPose: false,
    });

    expect(decision.shouldLock).toBe(false);
    expect(decision.footLockDecision.shouldApplyCorrection).toBe(false);
    expect(decision.footLockDecision.nextState.strength).toBeLessThan(0.5);
  });

  it("does not lock a neutral player even when feet are available", () => {
    const decision = resolveMovementAvatarFootLockRuntimeDecision({
      avatarRole: "player",
      currentLeft: new THREE.Vector3(-0.4, -2.7, 0),
      currentRight: new THREE.Vector3(0.4, -2.7, 0),
      hasAvatarRoot: true,
      lowerBodyDrive: lowerBodyDrive(),
      lowerBodyTrackingReady: true,
      previousState: createMovementAvatarFootLockState(),
      retargetFrame: retargetFrame(),
      shouldApplyLowerBody: true,
      shouldHoldPlayerSquatPose: false,
    });

    expect(decision.shouldLock).toBe(false);
    expect(decision.footLockDecision.nextState.left).toBeNull();
    expect(decision.footLockDecision.nextState.right).toBeNull();
  });

  it("initializes foot anchors for a reliable player squat lock", () => {
    const left = new THREE.Vector3(-0.4, -2.7, 0);
    const right = new THREE.Vector3(0.4, -2.7, 0);
    const decision = resolveMovementAvatarFootLockRuntimeDecision({
      avatarRole: "player",
      currentLeft: left,
      currentRight: right,
      hasAvatarRoot: true,
      lowerBodyDrive: lowerBodyDrive({ shouldDrivePlayerSquat: true }),
      lowerBodyTrackingReady: true,
      previousState: createMovementAvatarFootLockState(),
      retargetFrame: retargetFrame(),
      shouldApplyLowerBody: true,
      shouldHoldPlayerSquatPose: false,
    });

    expect(decision.shouldLock).toBe(true);
    expect(decision.footLockDecision.nextState.left).toEqual(left);
    expect(decision.footLockDecision.nextState.right).toEqual(right);
    expect(decision.footLockDecision.nextState.strength).toBe(decision.options.initialStrength);
  });

  it("skips root correction when the avatar root is unavailable", () => {
    const options = resolveMovementAvatarFootLockOptions({ avatarRole: "player" });
    const decision = resolveMovementAvatarFootLockApplication({
      currentLeft: new THREE.Vector3(-0.5, -2.65, -0.2),
      currentRight: new THREE.Vector3(0.3, -2.65, -0.2),
      options,
      previousState: {
        correction: new THREE.Vector3(),
        left: new THREE.Vector3(-0.4, -2.7, 0),
        right: new THREE.Vector3(0.4, -2.7, 0),
        strength: 0.5,
      },
      shouldLock: true,
    });

    expect(applyMovementAvatarFootLockRuntimeRootCorrection({
      avatarRoot: null,
      footLockDecision: decision,
      options,
    })).toEqual({
      applied: false,
      correctionScale: 0,
    });
  });

  it("applies foot-lock correction to the avatar root and updates world matrices", () => {
    const options = resolveMovementAvatarFootLockOptions({ avatarRole: "player" });
    const avatarRoot = new THREE.Object3D();
    const decision = resolveMovementAvatarFootLockApplication({
      currentLeft: new THREE.Vector3(-0.5, -2.65, -0.2),
      currentRight: new THREE.Vector3(0.3, -2.65, -0.2),
      options,
      previousState: {
        correction: new THREE.Vector3(),
        left: new THREE.Vector3(-0.4, -2.7, 0),
        right: new THREE.Vector3(0.4, -2.7, 0),
        strength: 0.5,
      },
      shouldLock: true,
    });

    const result = applyMovementAvatarFootLockRuntimeRootCorrection({
      avatarRoot,
      footLockDecision: decision,
      options,
    });

    expect(result.applied).toBe(true);
    expect(avatarRoot.position.x).toBeCloseTo(
      decision.nextState.correction.x * result.correctionScale,
    );
    expect(avatarRoot.position.y).toBeCloseTo(
      decision.nextState.correction.y * result.correctionScale,
    );
    expect(avatarRoot.matrixWorldNeedsUpdate).toBe(false);
  });
});
