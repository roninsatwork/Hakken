import * as THREE from "three";
import type {
  MovementAvatarHeadApplicationPoseDecision,
  MovementAvatarHeadPositionOffsetNodeApplicationResult,
} from "./movementAvatarHeadApplicationTypes";

export function applyMovementAvatarHeadPositionOffsetToNode({
  basePosition,
  headNode,
  offset,
  slerp,
}: {
  basePosition: THREE.Vector3 | null | undefined;
  headNode: THREE.Object3D | null | undefined;
  offset: MovementAvatarHeadApplicationPoseDecision["headPositionOffset"];
  slerp: number;
}): MovementAvatarHeadPositionOffsetNodeApplicationResult {
  if (!headNode || !offset) {
    return {
      applied: false,
    };
  }

  const resolvedBasePosition = basePosition ?? headNode.position.clone();
  const targetLocalPosition = resolvedBasePosition.clone().add(
    movementAvatarHeadOffsetToVector(offset),
  );

  headNode.position.lerp(targetLocalPosition, slerp);

  return {
    applied: true,
    basePosition: resolvedBasePosition,
    targetLocalPosition,
  };
}

export function movementAvatarHeadOffsetToVector(
  offset: NonNullable<MovementAvatarHeadApplicationPoseDecision["headPositionOffset"]>,
) {
  return new THREE.Vector3(offset.x, offset.y, offset.z);
}
