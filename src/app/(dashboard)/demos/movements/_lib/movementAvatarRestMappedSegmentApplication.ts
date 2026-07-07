import * as THREE from "three";
import type {
  MovementAvatarRetargetBoneName,
  MovementAvatarRetargetRestBone,
  MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";

export type MovementAvatarRestMappedQuaternionTarget = {
  targetLocalQuaternion: THREE.Quaternion;
  targetWorldQuaternion: THREE.Quaternion;
};

export type MovementAvatarRestMappedWorldDirectionApplicationResult = {
  target: MovementAvatarRestMappedQuaternionTarget;
  finalLocalQuaternion: THREE.Quaternion;
};

export type MovementAvatarRestMappedWorldDirectionRestMapApplicationResult = {
  applied: boolean;
  finalLocalQuaternion: THREE.Quaternion | null;
  refreshedRestMap: boolean;
  restMap: MovementAvatarRetargetRestMap;
};

export type MovementAvatarRestMappedWorldDirectionLookupApplicationResult =
  MovementAvatarRestMappedWorldDirectionRestMapApplicationResult;

export function resolveMovementAvatarRestMappedQuaternionTarget({
  desiredWorldDirection,
  parentWorldQuaternion,
  restPose,
}: {
  desiredWorldDirection: THREE.Vector3;
  parentWorldQuaternion: THREE.Quaternion;
  restPose: MovementAvatarRetargetRestBone;
}): MovementAvatarRestMappedQuaternionTarget | null {
  if (desiredWorldDirection.lengthSq() < 0.000001) return null;

  const targetWorldOffset = new THREE.Quaternion().setFromUnitVectors(
    restPose.worldDirection,
    desiredWorldDirection.clone().normalize(),
  );
  const targetWorldQuaternion = targetWorldOffset.multiply(
    restPose.worldQuaternion.clone(),
  );
  const targetLocalQuaternion = parentWorldQuaternion
    .clone()
    .invert()
    .multiply(targetWorldQuaternion);

  return {
    targetLocalQuaternion,
    targetWorldQuaternion,
  };
}

export function applyMovementAvatarRestMappedWorldDirection({
  bone,
  desiredWorldDirection,
  restPose,
  slerp,
}: {
  bone: THREE.Object3D | null | undefined;
  desiredWorldDirection: THREE.Vector3;
  restPose: MovementAvatarRetargetRestBone | null | undefined;
  slerp: number;
}): MovementAvatarRestMappedWorldDirectionApplicationResult | null {
  if (!bone?.parent || !restPose) return null;

  const parentWorldQuaternion = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWorldQuaternion);
  const target = resolveMovementAvatarRestMappedQuaternionTarget({
    desiredWorldDirection,
    parentWorldQuaternion,
    restPose,
  });
  if (!target) return null;

  bone.quaternion.slerp(target.targetLocalQuaternion, slerp);
  bone.updateMatrixWorld(true);

  return {
    finalLocalQuaternion: bone.quaternion.clone(),
    target,
  };
}

export function applyMovementAvatarRestMappedWorldDirectionWithRestMap({
  bone,
  boneName,
  currentRestMap,
  desiredWorldDirection,
  refreshRestMap,
  rememberLastGood = false,
  slerp,
  storeLastGood,
}: {
  bone: THREE.Object3D | null | undefined;
  boneName: MovementAvatarRetargetBoneName;
  currentRestMap: MovementAvatarRetargetRestMap;
  desiredWorldDirection: THREE.Vector3;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  rememberLastGood?: boolean;
  slerp: number;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarRestMappedWorldDirectionRestMapApplicationResult {
  let restMap = currentRestMap;
  let restPose = restMap[boneName];
  let refreshedRestMap = false;

  if (!restPose) {
    restMap = refreshRestMap();
    restPose = restMap[boneName];
    refreshedRestMap = true;
  }

  const application = applyMovementAvatarRestMappedWorldDirection({
    bone,
    desiredWorldDirection,
    restPose,
    slerp,
  });

  if (!application) {
    return {
      applied: false,
      finalLocalQuaternion: null,
      refreshedRestMap,
      restMap,
    };
  }

  if (rememberLastGood) {
    storeLastGood?.(boneName, application.finalLocalQuaternion);
  }

  return {
    applied: true,
    finalLocalQuaternion: application.finalLocalQuaternion,
    refreshedRestMap,
    restMap,
  };
}

export function applyMovementAvatarRestMappedWorldDirectionWithLookup({
  boneName,
  canApply = true,
  currentRestMap,
  desiredWorldDirection,
  lookupBone,
  refreshRestMap,
  rememberLastGood = false,
  slerp,
  storeLastGood,
}: {
  boneName: MovementAvatarRetargetBoneName;
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  desiredWorldDirection: THREE.Vector3;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  rememberLastGood?: boolean;
  slerp: number;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarRestMappedWorldDirectionLookupApplicationResult {
  if (!canApply || desiredWorldDirection.lengthSq() < 0.000001) {
    return {
      applied: false,
      finalLocalQuaternion: null,
      refreshedRestMap: false,
      restMap: currentRestMap,
    };
  }

  return applyMovementAvatarRestMappedWorldDirectionWithRestMap({
    bone: lookupBone(boneName),
    boneName,
    currentRestMap,
    desiredWorldDirection,
    refreshRestMap,
    rememberLastGood,
    slerp,
    storeLastGood,
  });
}
