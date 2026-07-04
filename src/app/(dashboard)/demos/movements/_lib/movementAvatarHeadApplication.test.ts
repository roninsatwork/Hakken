import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  movementAvatarHeadOffsetToVector,
  resolveMovementAvatarHeadQuaternionTarget,
  resolveMovementAvatarNeckQuaternionTarget,
} from "./movementAvatarHeadApplication";

describe("movement avatar head application", () => {
  it("returns world and parent-relative local head quaternion targets", () => {
    const parentWorldQuaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 4,
    );
    const target = resolveMovementAvatarHeadQuaternionTarget({
      headBonePitch: 0.2,
      headRoll: -0.1,
      headWorldYaw: 0.4,
      parentWorldQuaternion,
    });

    const reconstructedWorld = parentWorldQuaternion.clone().multiply(target.targetLocalQuaternion!);

    expect(reconstructedWorld.x).toBeCloseTo(target.targetWorldQuaternion.x);
    expect(reconstructedWorld.y).toBeCloseTo(target.targetWorldQuaternion.y);
    expect(reconstructedWorld.z).toBeCloseTo(target.targetWorldQuaternion.z);
    expect(reconstructedWorld.w).toBeCloseTo(target.targetWorldQuaternion.w);
  });

  it("uses world target directly when there is no parent", () => {
    const target = resolveMovementAvatarHeadQuaternionTarget({
      headBonePitch: 0.2,
      headRoll: -0.1,
      headWorldYaw: 0.4,
    });

    expect(target.targetLocalQuaternion).toBeNull();
    expect(target.targetWorldQuaternion.length()).toBeCloseTo(1);
  });

  it("converts neck rotation and head offset to Three.js values", () => {
    const neck = resolveMovementAvatarNeckQuaternionTarget({
      rotationOrder: "YXZ",
      x: 0.1,
      y: 0.2,
      z: -0.3,
    });
    const offset = movementAvatarHeadOffsetToVector({
      x: 0.01,
      y: -0.02,
      z: 0.03,
    });

    expect(neck.length()).toBeCloseTo(1);
    expect(offset.x).toBe(0.01);
    expect(offset.y).toBe(-0.02);
    expect(offset.z).toBe(0.03);
  });
});
