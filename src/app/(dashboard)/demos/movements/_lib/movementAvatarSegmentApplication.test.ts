import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarBasisWorldDirection,
  resolveMovementAvatarRestMappedQuaternionTarget,
} from "./movementAvatarSegmentApplication";

describe("movement avatar segment application", () => {
  it("builds a local quaternion that rotates rest direction toward the desired world direction", () => {
    const target = resolveMovementAvatarRestMappedQuaternionTarget({
      desiredWorldDirection: new THREE.Vector3(1, 0, 0),
      parentWorldQuaternion: new THREE.Quaternion(),
      restPose: {
        worldDirection: new THREE.Vector3(0, 1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
    });

    expect(target).not.toBeNull();
    const appliedDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(target!.targetLocalQuaternion);
    expect(appliedDirection.x).toBeCloseTo(1);
    expect(appliedDirection.y).toBeCloseTo(0);
    expect(appliedDirection.z).toBeCloseTo(0);
  });

  it("accounts for parent world rotation when returning the local target", () => {
    const parentWorldQuaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    const target = resolveMovementAvatarRestMappedQuaternionTarget({
      desiredWorldDirection: new THREE.Vector3(1, 0, 0),
      parentWorldQuaternion,
      restPose: {
        worldDirection: new THREE.Vector3(0, 1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
    });

    expect(target).not.toBeNull();
    const worldDirection = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(target!.targetLocalQuaternion)
      .applyQuaternion(parentWorldQuaternion);
    expect(worldDirection.x).toBeCloseTo(1);
    expect(worldDirection.y).toBeCloseTo(0);
    expect(worldDirection.z).toBeCloseTo(0);
  });

  it("rejects empty desired directions", () => {
    const target = resolveMovementAvatarRestMappedQuaternionTarget({
      desiredWorldDirection: new THREE.Vector3(0, 0, 0),
      parentWorldQuaternion: new THREE.Quaternion(),
      restPose: {
        worldDirection: new THREE.Vector3(0, 1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
    });

    expect(target).toBeNull();
  });

  it("converts planted-IK basis directions into world directions", () => {
    const direction = resolveMovementAvatarBasisWorldDirection({
      basis: {
        down: 1,
        forward: 2,
        side: -2,
      },
      forward: new THREE.Vector3(0, 0, 1),
    });

    expect(direction?.x).toBeCloseTo(-2 / 3);
    expect(direction?.y).toBeCloseTo(-1 / 3);
    expect(direction?.z).toBeCloseTo(2 / 3);
    expect(resolveMovementAvatarBasisWorldDirection({
      basis: {
        down: 0,
        forward: 0,
        side: 0,
      },
      forward: new THREE.Vector3(0, 0, 1),
    })).toBeNull();
  });
});
