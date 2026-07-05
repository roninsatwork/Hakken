import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarRootStepFootLocalApplication,
  applyMovementAvatarRootStepResponseToFootObject,
  applyMovementAvatarRootTransformApplication,
  applyMovementAvatarRootTransformToObject,
  applyMovementAvatarRootStepFootApplication,
  normalizeMovementAvatarRootAngle,
  resolveMovementAvatarRootStepFootApplication,
  resolveMovementAvatarRootTransformApplication,
} from "./movementAvatarRootApplication";
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

describe("movement avatar root application", () => {
  it("interpolates root transform targets with the shared application contract", () => {
    const result = resolveMovementAvatarRootTransformApplication({
      current: {
        position: { x: 0, y: -3, z: 0 },
        rotation: { x: 0, y: Math.PI, z: 0 },
      },
      rootTarget: rootTarget(),
    });

    expect(result.rotation.x).toBeCloseTo(0.1);
    expect(result.rotation.y).toBeCloseTo(Math.PI + 0.11);
    expect(result.rotation.z).toBeCloseTo(-0.05);
    expect(result.position.x).toBeCloseTo(0.18);
    expect(result.position.y).toBeCloseTo(-2.5);
    expect(result.position.z).toBeCloseTo(-0.18);
    expect(result.appliedYaw).toBeCloseTo(0.11);
  });

  it("normalizes yaw around the shortest turn direction", () => {
    const result = resolveMovementAvatarRootTransformApplication({
      current: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: Math.PI + 3.05, z: 0 },
      },
      rootTarget: rootTarget({
        targetYaw: Math.PI - 3.05,
      }),
    });

    expect(normalizeMovementAvatarRootAngle((Math.PI - 3.05) - (Math.PI + 3.05))).toBeGreaterThan(0);
    expect(result.rotation.y).toBeGreaterThan(Math.PI + 3.05);
  });

  it("executes root transform applications through the supplied renderer callback", () => {
    const applied: Array<{ x: number; y: number; z: number }> = [];

    const result = applyMovementAvatarRootTransformApplication({
      application: {
        appliedYaw: 0.2,
        position: { x: 1, y: -2, z: 3 },
        rotation: { x: 0.1, y: 0.2, z: 0.3 },
      },
      apply: (application) => {
        applied.push(application.position);
        return true;
      },
    });

    expect(result).toEqual({ applied: true });
    expect(applied).toEqual([{ x: 1, y: -2, z: 3 }]);
    expect(applyMovementAvatarRootTransformApplication({
      application: {
        appliedYaw: 0,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
      apply: () => false,
    })).toEqual({ applied: false });
  });

  it("applies root transform applications directly to Three roots", () => {
    const root = new THREE.Object3D();
    const application = {
      appliedYaw: 0.2,
      position: { x: 1, y: -2, z: 3 },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
    };

    expect(applyMovementAvatarRootTransformToObject({
      application,
      root,
    })).toEqual({ applied: true });
    expect(root.rotation.x).toBeCloseTo(0.1);
    expect(root.rotation.y).toBeCloseTo(0.2);
    expect(root.rotation.z).toBeCloseTo(0.3);
    expect(root.position.x).toBeCloseTo(1);
    expect(root.position.y).toBeCloseTo(-2);
    expect(root.position.z).toBeCloseTo(3);
    expect(applyMovementAvatarRootTransformToObject({
      application,
      root: null,
    })).toEqual({ applied: false });
  });

  it("resolves root step foot targets from the shared step response", () => {
    const result = resolveMovementAvatarRootStepFootApplication({
      footWorldPosition: { x: 0.2, y: -2.1, z: 0.5 },
      stepResponse: {
        footLiftOffset: 0.16,
        landingCompression: 0,
        owner: "step-response-left-release",
        shouldApply: true,
        side: "left",
        slerp: 0.45,
        summary: "left foot lift",
      },
    });

    expect(result).toEqual({
      side: "left",
      slerp: 0.45,
      targetWorldPosition: {
        x: 0.2,
        y: expect.closeTo(-1.94),
        z: 0.5,
      },
    });
  });

  it("skips root step foot application when the response is inactive", () => {
    expect(resolveMovementAvatarRootStepFootApplication({
      footWorldPosition: { x: 0, y: 0, z: 0 },
      stepResponse: {
        footLiftOffset: 0,
        landingCompression: 0,
        owner: "step-response-none",
        shouldApply: false,
        side: null,
        slerp: 0,
        summary: "none",
      },
    })).toBeNull();
  });

  it("executes root step foot applications through the supplied renderer callback", () => {
    const visitedSides: string[] = [];

    const result = applyMovementAvatarRootStepFootApplication({
      application: {
        side: "left",
        slerp: 0.45,
        targetWorldPosition: { x: 0.2, y: -1.94, z: 0.5 },
      },
      apply: (application) => {
        visitedSides.push(application.side);
        return true;
      },
    });

    expect(result).toEqual({ applied: true });
    expect(visitedSides).toEqual(["left"]);
    expect(applyMovementAvatarRootStepFootApplication({
      application: null,
      apply: () => true,
    })).toEqual({ applied: false });
    expect(applyMovementAvatarRootStepFootApplication({
      application: {
        side: "right",
        slerp: 0.35,
        targetWorldPosition: { x: -0.2, y: -2, z: 0.4 },
      },
      apply: () => false,
    })).toEqual({ applied: false });
  });

  it("executes root step foot local applications after caller-supplied world-to-local conversion", () => {
    const visited: Array<{ side: string; localY: number }> = [];

    const result = applyMovementAvatarRootStepFootLocalApplication({
      application: {
        side: "right",
        slerp: 0.35,
        targetWorldPosition: { x: 0.1, y: -1.8, z: 0.4 },
      },
      apply: (application) => {
        visited.push({
          localY: application.targetLocalPosition.y,
          side: application.side,
        });
        return true;
      },
      toLocalPosition: (worldPosition) => ({
        ...worldPosition,
        y: worldPosition.y + 2,
      }),
    });

    expect(result).toEqual({ applied: true });
    expect(visited).toEqual([{ side: "right", localY: 0.19999999999999996 }]);
    expect(applyMovementAvatarRootStepFootLocalApplication({
      application: null,
      apply: () => true,
      toLocalPosition: () => ({ x: 0, y: 0, z: 0 }),
    })).toEqual({ applied: false });
    expect(applyMovementAvatarRootStepFootLocalApplication({
      application: {
        side: "left",
        slerp: 0.2,
        targetWorldPosition: { x: 0, y: 0, z: 0 },
      },
      apply: () => true,
      toLocalPosition: () => null,
    })).toEqual({ applied: false });
  });

  it("applies root step responses directly to Three foot objects", () => {
    const scene = new THREE.Object3D();
    const leftParent = new THREE.Object3D();
    const leftFoot = new THREE.Object3D();
    const rightFoot = new THREE.Object3D();
    scene.add(leftParent);
    leftParent.add(leftFoot);
    scene.add(rightFoot);
    leftFoot.position.set(0.2, -2.1, 0.5);

    const result = applyMovementAvatarRootStepResponseToFootObject({
      leftFoot,
      rightFoot,
      scene,
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

    expect(result).toEqual({ applied: true });
    expect(leftFoot.position.y).toBeCloseTo(-2);
    expect(applyMovementAvatarRootStepResponseToFootObject({
      leftFoot,
      rightFoot,
      scene,
      stepResponse: {
        footLiftOffset: 0,
        landingCompression: 0,
        owner: "step-response-none",
        shouldApply: false,
        side: null,
        slerp: 0,
        summary: "none",
      },
    })).toEqual({ applied: false });
    expect(applyMovementAvatarRootStepResponseToFootObject({
      leftFoot: new THREE.Object3D(),
      rightFoot,
      scene,
      stepResponse: {
        footLiftOffset: 0.2,
        landingCompression: 0,
        owner: "step-response-left-release",
        shouldApply: true,
        side: "left",
        slerp: 0.5,
        summary: "left foot lift",
      },
    })).toEqual({ applied: false });
  });
});
