import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarHeadApplication,
  applyMovementAvatarHeadApplicationToVrmBones,
  applyMovementAvatarHeadQuaternionTarget,
  applyMovementAvatarHeadPositionOffsetToNode,
  applyMovementAvatarNeckQuaternionTarget,
  applyMovementAvatarUpperChestCompensation,
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

  it("applies head quaternion targets through a parent-relative bone write", () => {
    const parent = new THREE.Object3D();
    const head = new THREE.Object3D();
    parent.rotation.y = Math.PI / 4;
    parent.add(head);
    parent.updateMatrixWorld(true);

    const result = applyMovementAvatarHeadQuaternionTarget({
      headBonePitch: 0.2,
      headNode: head,
      headRoll: -0.1,
      headWorldYaw: 0.4,
      slerp: 1,
    });

    expect(result.applied).toBe(true);
    expect(result.target?.targetLocalQuaternion).not.toBeNull();
    expect(head.quaternion.angleTo(result.target!.targetLocalQuaternion!)).toBeCloseTo(0);
    expect(applyMovementAvatarHeadQuaternionTarget({
      headBonePitch: 0,
      headNode: null,
      headRoll: 0,
      headWorldYaw: 0,
      slerp: 1,
    })).toEqual({ applied: false });
  });

  it("applies neck quaternion targets through the supplied bone write", () => {
    const neck = new THREE.Object3D();
    const result = applyMovementAvatarNeckQuaternionTarget({
      neckNode: neck,
      neckRotation: {
        rotationOrder: "YXZ",
        x: 0.1,
        y: 0.2,
        z: -0.3,
      },
      slerp: 1,
    });

    expect(result.applied).toBe(true);
    expect(neck.quaternion.angleTo(result.target!)).toBeCloseTo(0);
    expect(applyMovementAvatarNeckQuaternionTarget({
      neckNode: neck,
      neckRotation: null,
      slerp: 1,
    })).toEqual({ applied: false });
  });

  it("applies head position offsets against a stable base position", () => {
    const headNode = new THREE.Object3D();
    headNode.position.set(0.1, 0.2, 0.3);

    const first = applyMovementAvatarHeadPositionOffsetToNode({
      basePosition: null,
      headNode,
      offset: { x: 0.04, y: -0.02, z: 0.01 },
      slerp: 0.5,
    });

    expect(first.applied).toBe(true);
    if (!first.applied) throw new Error("expected head position offset to apply");
    expect(first.basePosition).toEqual(new THREE.Vector3(0.1, 0.2, 0.3));
    expect(first.targetLocalPosition.x).toBeCloseTo(0.14);
    expect(first.targetLocalPosition.y).toBeCloseTo(0.18);
    expect(first.targetLocalPosition.z).toBeCloseTo(0.31);
    expect(headNode.position.x).toBeCloseTo(0.12);
    expect(headNode.position.y).toBeCloseTo(0.19);
    expect(headNode.position.z).toBeCloseTo(0.305);

    const second = applyMovementAvatarHeadPositionOffsetToNode({
      basePosition: first.basePosition,
      headNode,
      offset: { x: 0.04, y: -0.02, z: 0.01 },
      slerp: 1,
    });

    expect(second.applied).toBe(true);
    if (!second.applied) throw new Error("expected stored-base head position offset to apply");
    expect(second.basePosition).toBe(first.basePosition);
    expect(headNode.position.x).toBeCloseTo(0.14);
    expect(headNode.position.y).toBeCloseTo(0.18);
    expect(headNode.position.z).toBeCloseTo(0.31);
    expect(applyMovementAvatarHeadPositionOffsetToNode({
      basePosition: first.basePosition,
      headNode,
      offset: null,
      slerp: 1,
    })).toEqual({ applied: false });
  });

  it("executes upper-chest compensation through the supplied renderer callback", () => {
    const result = applyMovementAvatarUpperChestCompensation({
      apply: (compensation, slerp) => {
        expect(compensation).toEqual({ x: 0.1, y: 0.02, z: -0.03 });
        expect(slerp).toBe(0.25);
        return true;
      },
      compensation: { x: 0.1, y: 0.02, z: -0.03 },
      slerp: 0.25,
    });

    expect(result).toEqual({ applied: true });
    expect(applyMovementAvatarUpperChestCompensation({
      apply: () => true,
      compensation: null,
      slerp: 0.25,
    })).toEqual({ applied: false });
  });

  it("sequences full head, neck, offset, and upper-chest application", () => {
    const parent = new THREE.Object3D();
    const head = new THREE.Object3D();
    const neck = new THREE.Object3D();
    parent.add(head);
    parent.add(neck);
    parent.updateMatrixWorld(true);
    const compensationEvents: string[] = [];

    const result = applyMovementAvatarHeadApplication({
      applyUpperChestCompensation: (compensation, slerp) => {
        compensationEvents.push(`${compensation.x}:${slerp}`);
        return true;
      },
      baseHeadPosition: null,
      headApplicationPose: {
        headPositionOffset: { x: 0.02, y: -0.01, z: 0.03 },
        neckRotation: { rotationOrder: "YXZ", x: 0.1, y: 0.2, z: -0.1 },
        upperChestCompensation: { x: 0.04, y: 0, z: -0.02 },
      },
      headBonePitch: 0.2,
      headNode: head,
      headPositionSlerp: 1,
      headRoll: -0.05,
      headSlerp: 1,
      headWorldYaw: 0.3,
      neckNode: neck,
      neckSlerp: 1,
      shouldApplyHeadMotion: true,
      upperChestCompensationSlerp: 0.18,
    });

    expect(result.appliedHead).toBe(true);
    expect(result.appliedHeadPositionOffset).toBe(true);
    expect(result.appliedNeck).toBe(true);
    expect(result.appliedUpperChestCompensation).toBe(true);
    expect(result.baseHeadPosition).toEqual(new THREE.Vector3(0, 0, 0));
    expect(head.position).toEqual(new THREE.Vector3(0.02, -0.01, 0.03));
    expect(compensationEvents).toEqual(["0.04:0.18"]);
  });

  it("applies only the head quaternion when head motion extras are disabled", () => {
    const head = new THREE.Object3D();
    const neck = new THREE.Object3D();
    const compensationEvents: string[] = [];

    const result = applyMovementAvatarHeadApplication({
      applyUpperChestCompensation: () => {
        compensationEvents.push("compensation");
        return true;
      },
      baseHeadPosition: null,
      headApplicationPose: {
        headPositionOffset: { x: 0.02, y: -0.01, z: 0.03 },
        neckRotation: { rotationOrder: "YXZ", x: 0.1, y: 0.2, z: -0.1 },
        upperChestCompensation: { x: 0.04, y: 0, z: -0.02 },
      },
      headBonePitch: 0.2,
      headNode: head,
      headPositionSlerp: 1,
      headRoll: -0.05,
      headSlerp: 1,
      headWorldYaw: 0.3,
      neckNode: neck,
      neckSlerp: 1,
      shouldApplyHeadMotion: false,
      upperChestCompensationSlerp: 0.18,
    });

    expect(result).toMatchObject({
      appliedHead: true,
      appliedHeadPositionOffset: false,
      appliedNeck: false,
      appliedUpperChestCompensation: false,
      baseHeadPosition: null,
    });
    expect(neck.quaternion.equals(new THREE.Quaternion())).toBe(true);
    expect(compensationEvents).toEqual([]);
  });

  it("applies full head application directly through VRM bone lookup", () => {
    const parent = new THREE.Object3D();
    const head = new THREE.Object3D();
    const neck = new THREE.Object3D();
    const upperChest = new THREE.Object3D();
    parent.add(head);
    parent.add(neck);
    parent.add(upperChest);
    parent.updateMatrixWorld(true);
    const bones: Record<string, THREE.Object3D> = {
      head,
      neck,
      upperChest,
    };

    const result = applyMovementAvatarHeadApplicationToVrmBones({
      baseHeadPosition: null,
      headApplicationPose: {
        headPositionOffset: { x: 0.02, y: -0.01, z: 0.03 },
        neckRotation: { rotationOrder: "YXZ", x: 0.1, y: 0.2, z: -0.1 },
        upperChestCompensation: { x: 0.04, y: 0, z: -0.02 },
      },
      headBonePitch: 0.2,
      headPositionSlerp: 1,
      headRoll: -0.05,
      headSlerp: 1,
      headWorldYaw: 0.3,
      lookupBone: (boneName) => bones[boneName] ?? null,
      neckSlerp: 1,
      shouldApplyHeadMotion: true,
      upperChestCompensationSlerp: 1,
    });

    expect(result).toMatchObject({
      appliedHead: true,
      appliedHeadPositionOffset: true,
      appliedNeck: true,
      appliedUpperChestCompensation: true,
    });
    expect(head.position).toEqual(new THREE.Vector3(0.02, -0.01, 0.03));
    expect(neck.quaternion.w).toBeLessThan(1);
    expect(upperChest.quaternion.w).toBeLessThan(1);
  });
});
