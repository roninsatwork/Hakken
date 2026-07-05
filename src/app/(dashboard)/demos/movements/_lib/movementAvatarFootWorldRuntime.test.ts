import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { resolveMovementAvatarFootWorldRuntimeSnapshot } from "./movementAvatarFootWorldRuntime";

describe("movementAvatarFootWorldRuntime", () => {
  it("returns an empty snapshot when feet are missing or reads are disabled", () => {
    expect(resolveMovementAvatarFootWorldRuntimeSnapshot({
      leftFoot: null,
      rightFoot: new THREE.Object3D(),
    })).toEqual({
      left: null,
      lowestFootY: null,
      right: null,
    });

    expect(resolveMovementAvatarFootWorldRuntimeSnapshot({
      leftFoot: new THREE.Object3D(),
      rightFoot: new THREE.Object3D(),
      shouldRead: false,
    })).toEqual({
      left: null,
      lowestFootY: null,
      right: null,
    });
  });

  it("reads cloned world positions and lowest foot height from parented feet", () => {
    const scene = new THREE.Object3D();
    const avatarRoot = new THREE.Object3D();
    const leftFoot = new THREE.Object3D();
    const rightFoot = new THREE.Object3D();
    scene.add(avatarRoot);
    avatarRoot.position.set(1, -2, 0.5);
    avatarRoot.add(leftFoot);
    avatarRoot.add(rightFoot);
    leftFoot.position.set(-0.2, -0.4, 0.1);
    rightFoot.position.set(0.2, -0.6, -0.1);

    const snapshot = resolveMovementAvatarFootWorldRuntimeSnapshot({
      avatarRoot,
      leftFoot,
      rightFoot,
      scene,
    });

    expect(snapshot.left?.x).toBeCloseTo(0.8);
    expect(snapshot.left?.y).toBeCloseTo(-2.4);
    expect(snapshot.right?.x).toBeCloseTo(1.2);
    expect(snapshot.right?.y).toBeCloseTo(-2.6);
    expect(snapshot.lowestFootY).toBeCloseTo(-2.6);
    expect(snapshot.left).not.toBe(leftFoot.position);
    expect(snapshot.right).not.toBe(rightFoot.position);
  });
});
