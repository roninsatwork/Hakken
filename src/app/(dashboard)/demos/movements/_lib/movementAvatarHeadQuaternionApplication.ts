import * as THREE from "three";
import type {
  MovementAvatarHeadApplicationPoseDecision,
  MovementAvatarHeadQuaternionTarget,
} from "./movementAvatarHeadApplicationTypes";

export function resolveMovementAvatarHeadQuaternionTarget({
  headBonePitch,
  headRoll,
  headWorldYaw,
  parentWorldQuaternion = null,
}: {
  headBonePitch: number;
  headRoll: number;
  headWorldYaw: number;
  parentWorldQuaternion?: THREE.Quaternion | null;
}): MovementAvatarHeadQuaternionTarget {
  const targetWorldQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(headBonePitch, headWorldYaw, headRoll, "YXZ"),
  );
  const targetLocalQuaternion = parentWorldQuaternion
    ? parentWorldQuaternion.clone().invert().multiply(targetWorldQuaternion)
    : null;

  return {
    targetLocalQuaternion,
    targetWorldQuaternion,
  };
}

export function resolveMovementAvatarNeckQuaternionTarget(
  neckRotation: NonNullable<MovementAvatarHeadApplicationPoseDecision["neckRotation"]>,
) {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      neckRotation.x,
      neckRotation.y,
      neckRotation.z,
      neckRotation.rotationOrder,
    ),
  );
}

export function applyMovementAvatarHeadQuaternionTarget({
  headBonePitch,
  headNode,
  headRoll,
  headWorldYaw,
  slerp,
}: {
  headBonePitch: number;
  headNode: THREE.Object3D | null | undefined;
  headRoll: number;
  headWorldYaw: number;
  slerp: number;
}) {
  if (!headNode) {
    return {
      applied: false,
    };
  }

  const parentWorldQuaternion = headNode.parent
    ? new THREE.Quaternion()
    : null;
  if (headNode.parent && parentWorldQuaternion) {
    headNode.parent.getWorldQuaternion(parentWorldQuaternion);
  }

  const target = resolveMovementAvatarHeadQuaternionTarget({
    headBonePitch,
    headRoll,
    headWorldYaw,
    parentWorldQuaternion,
  });
  headNode.quaternion.slerp(
    target.targetLocalQuaternion ?? target.targetWorldQuaternion,
    slerp,
  );

  return {
    applied: true,
    target,
  };
}

export function applyMovementAvatarNeckQuaternionTarget({
  neckNode,
  neckRotation,
  slerp,
}: {
  neckNode: THREE.Object3D | null | undefined;
  neckRotation: MovementAvatarHeadApplicationPoseDecision["neckRotation"];
  slerp: number;
}) {
  if (!neckNode || !neckRotation) {
    return {
      applied: false,
    };
  }

  const target = resolveMovementAvatarNeckQuaternionTarget(neckRotation);
  neckNode.quaternion.slerp(target, slerp);

  return {
    applied: true,
    target,
  };
}
