import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarFootingFrameRefsRuntime } from "./movementAvatarFootingFrameRefsRuntime";

describe("movementAvatarFootingFrameRefsRuntime", () => {
  it("applies base hips and planted foot-lock refs while returning drift telemetry", () => {
    const nextBaseHipsPosition = new THREE.Vector3(1, 2, 3);
    const nextFootLockState = {
      correction: new THREE.Vector3(0.1, 0, -0.1),
      left: null,
      right: null,
      strength: 0.8,
    };
    const baseHipsPositionRef = {
      current: null,
    };
    const plantedFootLockRef = {
      current: {
        correction: new THREE.Vector3(),
        left: null,
        right: null,
        strength: 0,
      },
    };

    const result = applyMovementAvatarFootingFrameRefsRuntime({
      baseHipsPositionRef,
      footingRuntime: {
        footLockRuntimeApplication: {
          appliedCorrection: 0.24,
          drift: 0.42,
        },
        nextBaseHipsPosition,
        nextFootLockState,
      } as never,
      plantedFootLockRef,
    });

    expect(baseHipsPositionRef.current).toBe(nextBaseHipsPosition);
    expect(plantedFootLockRef.current).toBe(nextFootLockState);
    expect(result).toEqual({
      footLockCorrection: 0.24,
      footLockDrift: 0.42,
    });
  });

  it("allows the next base hips position to clear", () => {
    const baseHipsPositionRef = {
      current: new THREE.Vector3(1, 2, 3),
    };
    const nextFootLockState = {
      correction: new THREE.Vector3(),
      left: null,
      right: null,
      strength: 0,
    };
    const plantedFootLockRef = {
      current: nextFootLockState,
    };

    applyMovementAvatarFootingFrameRefsRuntime({
      baseHipsPositionRef,
      footingRuntime: {
        footLockRuntimeApplication: {
          appliedCorrection: 0,
          drift: 0,
        },
        nextBaseHipsPosition: null,
        nextFootLockState,
      } as never,
      plantedFootLockRef,
    });

    expect(baseHipsPositionRef.current).toBeNull();
  });
});
