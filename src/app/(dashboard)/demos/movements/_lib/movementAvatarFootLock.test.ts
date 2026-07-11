import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarFootLockRootCorrection,
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

  it("executes root correction through the supplied renderer callback", () => {
    const decision = resolveMovementAvatarFootLockApplication({
      currentLeft: new THREE.Vector3(-0.5, -2.65, -0.2),
      currentRight: new THREE.Vector3(0.3, -2.65, -0.2),
      options,
      previousState: lockedState(),
      shouldLock: true,
    });
    const applied: Array<{ scale: number; verticalScale: number; x: number }> = [];

    const result = applyMovementAvatarFootLockRootCorrection({
      apply: (correction, correctionScale, verticalCorrectionScale) => {
        applied.push({
          scale: correctionScale,
          verticalScale: verticalCorrectionScale,
          x: correction.x,
        });
        return true;
      },
      decision,
      options,
    });

    expect(result.applied).toBe(true);
    expect(result.correctionScale).toBeCloseTo(decision.nextState.strength * options.correctionScale);
    expect(result.verticalCorrectionScale).toBeCloseTo(
      decision.nextState.strength * options.verticalCorrectionScale,
    );
    expect(applied).toEqual([{
      scale: expect.closeTo(result.correctionScale),
      verticalScale: expect.closeTo(result.verticalCorrectionScale),
      x: expect.closeTo(0.075),
    }]);
    expect(applyMovementAvatarFootLockRootCorrection({
      apply: () => true,
      decision: {
        ...decision,
        shouldApplyCorrection: false,
      },
      options,
    })).toEqual({
      applied: false,
      correctionScale: 0,
      verticalCorrectionScale: 0,
    });
  });

  it("keeps planted feet near their vertical anchors during a large root drop", () => {
    const previousState = {
      ...lockedState(),
      strength: 1,
    };
    const decision = resolveMovementAvatarFootLockApplication({
      currentLeft: new THREE.Vector3(-0.5, -2.95, -0.2),
      currentRight: new THREE.Vector3(0.3, -2.95, -0.2),
      options,
      previousState,
      shouldLock: true,
    });
    const applied = new THREE.Vector3();

    applyMovementAvatarFootLockRootCorrection({
      apply: (correction, correctionScale, verticalCorrectionScale) => {
        applied.set(
          correction.x * correctionScale,
          correction.y * verticalCorrectionScale,
          correction.z * correctionScale,
        );
        return true;
      },
      decision,
      options,
    });

    expect(applied.y).toBeGreaterThan(0.2);
    expect(Math.abs(applied.x)).toBeLessThan(0.04);
    expect(Math.abs(applied.z)).toBeLessThan(0.04);
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

    expect(decision.drift).toBeGreaterThan(options.maxLateralDriftBeforeReset);
    expect(decision.nextState.left).toEqual(left);
    expect(decision.nextState.right).toEqual(right);
    expect(decision.nextState.strength).toBe(options.initialStrength);
    expect(decision.appliedCorrection).toBe(0);
    expect(decision.shouldApplyCorrection).toBe(false);
  });

  it("does not release planted anchors for vertical squat drift alone", () => {
    const decision = resolveMovementAvatarFootLockApplication({
      currentLeft: new THREE.Vector3(-0.4, -3.4, 0),
      currentRight: new THREE.Vector3(0.4, -3.4, 0),
      options,
      previousState: {
        ...lockedState(),
        strength: 1,
      },
      shouldLock: true,
    });

    expect(decision.drift).toBeGreaterThan(options.maxLateralDriftBeforeReset);
    expect(decision.shouldApplyCorrection).toBe(true);
    expect(decision.nextState.left?.y).toBeCloseTo(-2.7);
    expect(decision.nextState.right?.y).toBeCloseTo(-2.7);
  });

});
