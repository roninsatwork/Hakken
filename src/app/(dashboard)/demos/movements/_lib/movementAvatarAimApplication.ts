import * as THREE from "three";

export type MovementAvatarAimLandmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

export type MovementAvatarAimVectorApplicationResult = {
  finalLocalQuaternion: THREE.Quaternion;
  shouldStoreLastGood: boolean;
  status: "applied" | "fallback" | "held-last-good";
};

export type MovementAvatarAimVectorObjectApplicationResult = {
  applied: boolean;
  status: MovementAvatarAimVectorApplicationResult["status"] | "skipped";
};

export function applyMovementAvatarAimVector({
  bone,
  child,
  fallbackEuler,
  frontBias = 0,
  ignoreVisibility = false,
  lastGoodQuaternion,
  minVectorLengthSq = 0.0001,
  slerp,
  start,
  storeVisibilityThreshold = 0.6,
  target,
  visibilityThreshold = 0.2,
  zScale,
}: {
  bone: THREE.Object3D | null | undefined;
  child: THREE.Object3D | null | undefined;
  fallbackEuler?: THREE.Euler | null;
  frontBias?: number;
  ignoreVisibility?: boolean;
  lastGoodQuaternion?: THREE.Quaternion | null;
  minVectorLengthSq?: number;
  slerp: number;
  start?: MovementAvatarAimLandmark | null;
  storeVisibilityThreshold?: number;
  target?: MovementAvatarAimLandmark | null;
  visibilityThreshold?: number;
  zScale: number;
}): MovementAvatarAimVectorApplicationResult | null {
  if (!bone || !child || !start || !target) return null;

  if (
    !ignoreVisibility &&
    (start.visibility < visibilityThreshold || target.visibility < visibilityThreshold)
  ) {
    if (lastGoodQuaternion) {
      bone.quaternion.copy(lastGoodQuaternion);
      bone.updateMatrixWorld(true);
      return {
        finalLocalQuaternion: bone.quaternion.clone(),
        shouldStoreLastGood: false,
        status: "held-last-good",
      };
    }

    if (fallbackEuler) {
      bone.rotation.copy(fallbackEuler);
      bone.updateMatrixWorld(true);
      return {
        finalLocalQuaternion: bone.quaternion.clone(),
        shouldStoreLastGood: false,
        status: "fallback",
      };
    }

    return null;
  }

  const boneWorldPosition = new THREE.Vector3();
  bone.getWorldPosition(boneWorldPosition);

  const childWorldPosition = new THREE.Vector3();
  child.getWorldPosition(childWorldPosition);

  const currentDirection = childWorldPosition.clone().sub(boneWorldPosition);
  if (currentDirection.lengthSq() < 0.000001) return null;

  const rawDirection = new THREE.Vector3(
    target.x - start.x,
    -(target.y - start.y),
    -((target.z - start.z) * zScale) + frontBias,
  );
  if (rawDirection.lengthSq() < minVectorLengthSq) return null;

  const desiredDirection = rawDirection.normalize();
  const quaternionOffset = new THREE.Quaternion().setFromUnitVectors(
    currentDirection.normalize(),
    desiredDirection,
  );
  const currentWorldQuaternion = new THREE.Quaternion();
  bone.getWorldQuaternion(currentWorldQuaternion);
  const targetWorldQuaternion = quaternionOffset.multiply(currentWorldQuaternion);

  if (!bone.parent) return null;

  const parentWorldQuaternion = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWorldQuaternion);
  const localQuaternion = parentWorldQuaternion
    .invert()
    .multiply(targetWorldQuaternion);
  bone.quaternion.slerp(localQuaternion, slerp);
  bone.updateMatrixWorld(true);

  return {
    finalLocalQuaternion: bone.quaternion.clone(),
    shouldStoreLastGood: ignoreVisibility ||
      (start.visibility > storeVisibilityThreshold &&
        target.visibility > storeVisibilityThreshold),
    status: "applied",
  };
}

export function applyMovementAvatarAimVectorToObjects({
  boneName,
  childName,
  fallbackEuler,
  frontBias,
  getLastGoodQuaternion,
  ignoreVisibility,
  lookupBone,
  minVectorLengthSq,
  slerp,
  start,
  storeLastGoodQuaternion,
  storeVisibilityThreshold,
  target,
  visibilityThreshold,
  zScale,
}: {
  boneName: string;
  childName: string;
  fallbackEuler?: THREE.Euler | null;
  frontBias?: number;
  getLastGoodQuaternion?: (boneName: string) => THREE.Quaternion | null | undefined;
  ignoreVisibility?: boolean;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  minVectorLengthSq?: number;
  slerp: number;
  start?: MovementAvatarAimLandmark | null;
  storeLastGoodQuaternion?: (boneName: string, quaternion: THREE.Quaternion) => void;
  storeVisibilityThreshold?: number;
  target?: MovementAvatarAimLandmark | null;
  visibilityThreshold?: number;
  zScale: number;
}): MovementAvatarAimVectorObjectApplicationResult {
  const application = applyMovementAvatarAimVector({
    bone: lookupBone(boneName),
    child: lookupBone(childName),
    fallbackEuler,
    frontBias,
    ignoreVisibility,
    lastGoodQuaternion: getLastGoodQuaternion?.(boneName) ?? null,
    minVectorLengthSq,
    slerp,
    start,
    storeVisibilityThreshold,
    target,
    visibilityThreshold,
    zScale,
  });

  if (!application) {
    return {
      applied: false,
      status: "skipped",
    };
  }

  if (application.shouldStoreLastGood) {
    storeLastGoodQuaternion?.(boneName, application.finalLocalQuaternion);
  }

  return {
    applied: true,
    status: application.status,
  };
}
