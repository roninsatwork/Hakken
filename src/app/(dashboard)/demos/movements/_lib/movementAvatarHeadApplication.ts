import * as THREE from "three";
import type { MovementAvatarHeadApplicationPoseDecision } from "./movementAvatarPipeline";

export type MovementAvatarHeadQuaternionTarget = {
  targetLocalQuaternion: THREE.Quaternion | null;
  targetWorldQuaternion: THREE.Quaternion;
};

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

export function movementAvatarHeadOffsetToVector(
  offset: NonNullable<MovementAvatarHeadApplicationPoseDecision["headPositionOffset"]>,
) {
  return new THREE.Vector3(offset.x, offset.y, offset.z);
}
