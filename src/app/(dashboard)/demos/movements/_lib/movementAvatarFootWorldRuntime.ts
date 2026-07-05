import type * as THREE from "three";

export type MovementAvatarFootWorldRuntimeSnapshot = {
  left: THREE.Vector3 | null;
  lowestFootY: number | null;
  right: THREE.Vector3 | null;
};

export function resolveMovementAvatarFootWorldRuntimeSnapshot({
  avatarRoot,
  leftFoot,
  rightFoot,
  scene,
  shouldRead = true,
}: {
  avatarRoot?: THREE.Object3D | null;
  leftFoot: THREE.Object3D | null | undefined;
  rightFoot: THREE.Object3D | null | undefined;
  scene?: THREE.Object3D | null;
  shouldRead?: boolean;
}): MovementAvatarFootWorldRuntimeSnapshot {
  if (!shouldRead || !leftFoot || !rightFoot) {
    return {
      left: null,
      lowestFootY: null,
      right: null,
    };
  }

  scene?.updateMatrixWorld(true);
  avatarRoot?.updateMatrixWorld(true);
  leftFoot.updateMatrixWorld(true);
  rightFoot.updateMatrixWorld(true);

  const left = leftFoot.getWorldPosition(leftFoot.position.clone());
  const right = rightFoot.getWorldPosition(rightFoot.position.clone());

  return {
    left,
    lowestFootY: Math.min(left.y, right.y),
    right,
  };
}
