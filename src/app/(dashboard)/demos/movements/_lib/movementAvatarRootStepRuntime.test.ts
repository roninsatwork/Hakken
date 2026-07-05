import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarRootStepRuntimeResponse } from "./movementAvatarRootStepRuntime";

describe("movementAvatarRootStepRuntime", () => {
  it("applies active root step responses to the selected foot", () => {
    const scene = new THREE.Object3D();
    const leftParent = new THREE.Object3D();
    const leftFoot = new THREE.Object3D();
    const rightFoot = new THREE.Object3D();
    scene.add(leftParent);
    leftParent.add(leftFoot);
    scene.add(rightFoot);
    leftFoot.position.set(0.2, -2.1, 0.5);

    const result = applyMovementAvatarRootStepRuntimeResponse({
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
  });

  it("returns a neutral result when the step response is inactive", () => {
    expect(applyMovementAvatarRootStepRuntimeResponse({
      leftFoot: new THREE.Object3D(),
      rightFoot: new THREE.Object3D(),
      scene: new THREE.Object3D(),
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
  });
});
