import * as THREE from "three";
import type { MovementAvatarHeadApplicationPoseDecision } from "./movementAvatarPipeline";
import { applyVrmNamedRotationTargetToBones } from "./vrmRigging";

export type MovementAvatarHeadQuaternionTarget = {
  targetLocalQuaternion: THREE.Quaternion | null;
  targetWorldQuaternion: THREE.Quaternion;
};

export type MovementAvatarHeadPositionOffsetNodeApplicationResult =
  | { applied: false }
  | {
    applied: true;
    basePosition: THREE.Vector3;
    targetLocalPosition: THREE.Vector3;
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

export function applyMovementAvatarUpperChestCompensation({
  apply,
  compensation,
  slerp,
}: {
  apply: (
    compensation: NonNullable<MovementAvatarHeadApplicationPoseDecision["upperChestCompensation"]>,
    slerp: number,
  ) => boolean;
  compensation: MovementAvatarHeadApplicationPoseDecision["upperChestCompensation"];
  slerp: number;
}) {
  if (!compensation) {
    return {
      applied: false,
    };
  }

  return {
    applied: apply(compensation, slerp),
  };
}

export type MovementAvatarHeadApplicationResult = {
  appliedHead: boolean;
  appliedHeadPositionOffset: boolean;
  appliedNeck: boolean;
  appliedUpperChestCompensation: boolean;
  baseHeadPosition: THREE.Vector3 | null;
};

export function applyMovementAvatarHeadApplication({
  applyUpperChestCompensation,
  baseHeadPosition,
  headApplicationPose,
  headBonePitch,
  headNode,
  headPositionSlerp,
  headRoll,
  headSlerp,
  headWorldYaw,
  neckNode,
  neckSlerp,
  shouldApplyHeadMotion,
  upperChestCompensationSlerp,
}: {
  applyUpperChestCompensation: (
    compensation: NonNullable<MovementAvatarHeadApplicationPoseDecision["upperChestCompensation"]>,
    slerp: number,
  ) => boolean;
  baseHeadPosition: THREE.Vector3 | null | undefined;
  headApplicationPose: MovementAvatarHeadApplicationPoseDecision;
  headBonePitch: number;
  headNode: THREE.Object3D | null | undefined;
  headPositionSlerp: number;
  headRoll: number;
  headSlerp: number;
  headWorldYaw: number;
  neckNode: THREE.Object3D | null | undefined;
  neckSlerp: number;
  shouldApplyHeadMotion: boolean;
  upperChestCompensationSlerp: number;
}): MovementAvatarHeadApplicationResult {
  const headResult = applyMovementAvatarHeadQuaternionTarget({
    headBonePitch,
    headNode,
    headRoll,
    headWorldYaw,
    slerp: headSlerp,
  });

  if (!shouldApplyHeadMotion) {
    return {
      appliedHead: headResult.applied,
      appliedHeadPositionOffset: false,
      appliedNeck: false,
      appliedUpperChestCompensation: false,
      baseHeadPosition: baseHeadPosition ?? null,
    };
  }

  const neckResult = applyMovementAvatarNeckQuaternionTarget({
    neckNode,
    neckRotation: headApplicationPose.neckRotation,
    slerp: neckSlerp,
  });
  const positionResult = applyMovementAvatarHeadPositionOffsetToNode({
    basePosition: baseHeadPosition,
    headNode,
    offset: headApplicationPose.headPositionOffset,
    slerp: headPositionSlerp,
  });
  const upperChestResult = applyMovementAvatarUpperChestCompensation({
    apply: applyUpperChestCompensation,
    compensation: headApplicationPose.upperChestCompensation,
    slerp: upperChestCompensationSlerp,
  });

  return {
    appliedHead: headResult.applied,
    appliedHeadPositionOffset: positionResult.applied,
    appliedNeck: neckResult.applied,
    appliedUpperChestCompensation: upperChestResult.applied,
    baseHeadPosition: positionResult.applied
      ? positionResult.basePosition
      : baseHeadPosition ?? null,
  };
}

export function applyMovementAvatarHeadApplicationToVrmBones({
  baseHeadPosition,
  headApplicationPose,
  headBonePitch,
  headPositionSlerp,
  headRoll,
  headSlerp,
  headWorldYaw,
  lookupBone,
  neckSlerp,
  shouldApplyHeadMotion,
  upperChestCompensationSlerp,
}: {
  baseHeadPosition: THREE.Vector3 | null | undefined;
  headApplicationPose: MovementAvatarHeadApplicationPoseDecision;
  headBonePitch: number;
  headPositionSlerp: number;
  headRoll: number;
  headSlerp: number;
  headWorldYaw: number;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  neckSlerp: number;
  shouldApplyHeadMotion: boolean;
  upperChestCompensationSlerp: number;
}): MovementAvatarHeadApplicationResult {
  return applyMovementAvatarHeadApplication({
    applyUpperChestCompensation: (compensation, slerp) => applyVrmNamedRotationTargetToBones({
      bone: "upperChest",
      lookupBone,
      rotation: compensation,
      slerp,
    }).applied > 0,
    baseHeadPosition,
    headApplicationPose,
    headBonePitch,
    headNode: lookupBone("head"),
    headPositionSlerp,
    headRoll,
    headSlerp,
    headWorldYaw,
    neckNode: lookupBone("neck"),
    neckSlerp,
    shouldApplyHeadMotion,
    upperChestCompensationSlerp,
  });
}

export function movementAvatarHeadOffsetToVector(
  offset: NonNullable<MovementAvatarHeadApplicationPoseDecision["headPositionOffset"]>,
) {
  return new THREE.Vector3(offset.x, offset.y, offset.z);
}
