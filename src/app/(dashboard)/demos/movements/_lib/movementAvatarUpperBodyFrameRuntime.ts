import type * as THREE from "three";
import type {
  MovementAvatarArmDecision,
  MovementAvatarBoneEaseOptionsDecision,
} from "./movementAvatarPipeline";
import { resolveMovementAvatarSpineApplyOptions } from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import {
  MOVEMENT_AVATAR_LEFT_ARM_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_RIGHT_ARM_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_SPINE_RETARGET_MAPPINGS,
  type MovementAvatarRetargetBoneMapping,
} from "./movementAvatarRestPose";
import {
  applyMovementAvatarUpperBodyRuntimeToVrmBones,
  type MovementAvatarUpperBodyRuntimeApplication,
} from "./movementAvatarUpperBodyRuntime";

export type MovementAvatarUpperBodyFrameRuntimeResult = {
  retargetAppliedUpperBody: number;
  upperBodyRuntimeApplication: MovementAvatarUpperBodyRuntimeApplication;
};

export function applyMovementAvatarUpperBodyFrameRuntime({
  activeSpineDrive,
  applyRetargetMappings,
  avatarRole,
  boneEaseOptions,
  lastGood,
  leftArmDecision,
  lookupBone,
  rightArmDecision,
  shouldApplySolverTorso,
  torsoTrackingReady,
}: {
  activeSpineDrive: MovementAvatarPlayerSpineDrive;
  applyRetargetMappings: (mappings: MovementAvatarRetargetBoneMapping[]) => { applied: number };
  avatarRole: "instructor" | "player";
  boneEaseOptions: Pick<MovementAvatarBoneEaseOptionsDecision, "armRelaxedSlerp">;
  lastGood: Record<string, THREE.Quaternion>;
  leftArmDecision: MovementAvatarArmDecision;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  rightArmDecision: MovementAvatarArmDecision;
  shouldApplySolverTorso: boolean;
  torsoTrackingReady: boolean;
}): MovementAvatarUpperBodyFrameRuntimeResult {
  // The rest-mapped segment retarget owns arms and spine. Per-segment
  // confidence gates application; arms that could not solve fall back to
  // hold-last-good / relax inside the upper-body runtime.
  const leftArmRetarget = applyRetargetMappings(MOVEMENT_AVATAR_LEFT_ARM_RETARGET_MAPPINGS);
  const rightArmRetarget = applyRetargetMappings(MOVEMENT_AVATAR_RIGHT_ARM_RETARGET_MAPPINGS);

  const upperBodyRuntimeApplication = applyMovementAvatarUpperBodyRuntimeToVrmBones({
    activeSpineDrive,
    armRelaxedSlerp: boneEaseOptions.armRelaxedSlerp,
    avatarRole,
    lastGood,
    leftArmDecision,
    leftArmRetargetApplied: leftArmRetarget.applied > 0,
    lookupBone,
    rightArmDecision,
    rightArmRetargetApplied: rightArmRetarget.applied > 0,
    shouldApplySolverTorso,
    spineApplyOptions: resolveMovementAvatarSpineApplyOptions({
      avatarRole,
      shouldApplySpine: activeSpineDrive.shouldApplySpine,
    }),
    torsoTrackingReady,
  });

  // The spine segment refines the angle-based spine drive, so it must apply
  // after the spine pose application — not be overwritten by it.
  const spineRetarget = applyRetargetMappings(MOVEMENT_AVATAR_SPINE_RETARGET_MAPPINGS);

  return {
    retargetAppliedUpperBody:
      upperBodyRuntimeApplication.recordedSpineRetargetCount +
      leftArmRetarget.applied +
      rightArmRetarget.applied +
      spineRetarget.applied,
    upperBodyRuntimeApplication,
  };
}
