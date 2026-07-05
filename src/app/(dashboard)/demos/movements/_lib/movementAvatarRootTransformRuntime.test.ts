import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarRootTransformRuntime } from "./movementAvatarRootTransformRuntime";
import type { MovementAvatarRootTargetDecision } from "./movementAvatarRootTarget";

function rootTarget(overrides: Partial<MovementAvatarRootTargetDecision> = {}): MovementAvatarRootTargetDecision {
  return {
    jumpResponse: {
      heightOffset: 0,
      landingCompression: 0,
      lift: 0,
      owner: "jump-response-none",
      shouldApply: false,
      slerp: 0,
      summary: "none",
    },
    rootHeadingYaw: 0,
    rootHeightLerp: 0.5,
    rootOrientationSlerp: 0.25,
    source: "world-landmarks",
    stepResponse: {
      footLiftOffset: 0,
      landingCompression: 0,
      owner: "step-response-none",
      shouldApply: false,
      side: null,
      slerp: 0,
      summary: "none",
    },
    targetHeightDrop: 0,
    targetJumpHeightOffset: 0,
    targetPitch: 0.4,
    targetRoll: -0.2,
    targetX: 1,
    targetY: -2,
    targetYaw: Math.PI + 0.5,
    targetZ: -1,
    ...overrides,
  };
}

describe("movementAvatarRootTransformRuntime", () => {
  it("resolves and applies root transform targets to a Three root", () => {
    const root = new THREE.Object3D();
    root.position.set(0, -3, 0);
    root.rotation.set(0, Math.PI, 0);

    const runtime = applyMovementAvatarRootTransformRuntime({
      root,
      rootTarget: rootTarget(),
    });

    expect(runtime.result).toEqual({ applied: true });
    expect(runtime.application?.rotation.x).toBeCloseTo(0.1);
    expect(runtime.application?.rotation.y).toBeCloseTo(Math.PI + 0.11);
    expect(runtime.application?.position.y).toBeCloseTo(-2.5);
    expect(root.rotation.x).toBeCloseTo(runtime.application!.rotation.x);
    expect(root.position.y).toBeCloseTo(runtime.application!.position.y);
  });

  it("returns a no-op result when root is unavailable", () => {
    expect(applyMovementAvatarRootTransformRuntime({
      root: null,
      rootTarget: rootTarget(),
    })).toEqual({
      application: null,
      result: { applied: false },
    });
  });
});
