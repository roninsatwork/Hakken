import type * as THREE from "three";
import {
  applyMovementAvatarHeadQuaternionTarget,
  applyMovementAvatarNeckQuaternionTarget,
} from "./movementAvatarHeadQuaternionApplication";
import { applyMovementAvatarHeadPositionOffsetToNode } from "./movementAvatarHeadPositionApplication";
import type {
  MovementAvatarHeadApplicationPoseDecision,
  MovementAvatarHeadApplicationResult,
} from "./movementAvatarHeadApplicationTypes";

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
  if (!shouldApplyHeadMotion) {
    const headResult = applyMovementAvatarHeadQuaternionTarget({
      headBonePitch,
      headNode,
      headRoll,
      headWorldYaw,
      slerp: headSlerp,
    });
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
  // Neck and upper chest are parents of the head. Apply them first so the
  // final head-local solve uses the parent transforms rendered this frame.
  const headResult = applyMovementAvatarHeadQuaternionTarget({
    headBonePitch,
    headNode,
    headRoll,
    headWorldYaw,
    slerp: headSlerp,
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
