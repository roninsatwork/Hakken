import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createMovementAvatarFootLockState,
  resolveMovementAvatarFootLockApplication,
  type MovementAvatarFootLockState,
} from "./movementAvatarFootLock";
import { resolveMovementAvatarFootLockOptions } from "./movementAvatarPipeline";

const options = resolveMovementAvatarFootLockOptions({ avatarRole: "player" });

function lockedState(): MovementAvatarFootLockState {
  return {
    correction: new THREE.Vector3(),
    left: new THREE.Vector3(-0.4, -2.7, 0),
    right: new THREE.Vector3(0.4, -2.7, 0),
    strength: 0.5,
  };
}

describe("movement avatar foot lock", () => {
  it("releases strength and clears anchors when lock is inactive", () => {
    const decision = resolveMovementAvatarFootLockApplication({
      currentLeft: null,
      currentRight: null,
      options,
      previousState: {
        ...lockedState(),
        strength: 0.03,
      },
      shouldLock: false,
    });

    expect(decision.nextState.strength).toBeLessThan(0.03);
    expect(decision.nextState.left).toBeNull();
    expect(decision.nextState.right).toBeNull();
    expect(decision.shouldApplyCorrection).toBe(false);
  });

  it("initializes anchors from current feet before applying correction", () => {
    const left = new THREE.Vector3(-0.4, -2.7, 0);
    const right = new THREE.Vector3(0.4, -2.7, 0);
    const decision = resolveMovementAvatarFootLockApplication({
      currentLeft: left,
      currentRight: right,
      options,
      previousState: createMovementAvatarFootLockState(),
      shouldLock: true,
    });

    expect(decision.nextState.left).toEqual(left);
    expect(decision.nextState.right).toEqual(right);
    expect(decision.nextState.strength).toBe(options.initialStrength);
    expect(decision.appliedCorrection).toBe(0);
    expect(decision.shouldApplyCorrection).toBe(false);
  });

  it("returns clamped root correction while anchors stay planted", () => {
    const decision = resolveMovementAvatarFootLockApplication({
      currentLeft: new THREE.Vector3(-0.5, -2.65, -0.2),
      currentRight: new THREE.Vector3(0.3, -2.65, -0.2),
      options,
      previousState: lockedState(),
      shouldLock: true,
    });

    expect(decision.nextState.correction.x).toBeCloseTo(0.075);
    expect(decision.nextState.correction.y).toBeCloseTo(-0.05);
    expect(decision.nextState.correction.z).toBeCloseTo(0.075);
    expect(decision.appliedCorrection).toBeGreaterThan(0);
    expect(decision.shouldApplyCorrection).toBe(true);
  });

  it("resets anchors instead of applying correction when drift is too large", () => {
    const left = new THREE.Vector3(-2, -2.7, 0);
    const right = new THREE.Vector3(2, -2.7, 0);
    const decision = resolveMovementAvatarFootLockApplication({
      currentLeft: left,
      currentRight: right,
      options,
      previousState: lockedState(),
      shouldLock: true,
    });

    expect(decision.drift).toBeGreaterThan(options.maxDriftBeforeReset);
    expect(decision.nextState.left).toEqual(left);
    expect(decision.nextState.right).toEqual(right);
    expect(decision.nextState.strength).toBe(options.initialStrength);
    expect(decision.appliedCorrection).toBe(0);
    expect(decision.shouldApplyCorrection).toBe(false);
  });
});
