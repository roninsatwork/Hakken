import type * as THREE from "three";
import type {
  MovementAvatarArmDecision,
  MovementAvatarBoneEaseOptionsDecision,
} from "./movementAvatarPipeline";
import { resolveMovementAvatarSpineApplyOptions } from "./movementAvatarPipeline";
import type { MovementAvatarArmTargetCompositionDecision } from "./movementAvatarArmTarget";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import {
  MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS,
  type MovementAvatarRetargetBoneMapping,
} from "./movementAvatarRestPose";
import type { MovementAvatarTrackingProfile } from "./movementTrackingCalibration";
import {
  applyMovementAvatarUpperBodyRuntimeToVrmBones,
  type MovementAvatarUpperBodyRuntimeApplication,
} from "./movementAvatarUpperBodyRuntime";
import type { MovementAvatarSpineSolverSources } from "./movementAvatarSpineApplication";

export type MovementAvatarUpperBodyFrameRuntimeResult = {
  retargetAppliedUpperBody: number;
  upperBodyRuntimeApplication: MovementAvatarUpperBodyRuntimeApplication;
};

export function applyMovementAvatarUpperBodyFrameRuntime({
  activeSpineDrive,
  applyRetargetMappings,
  armTargetComposition,
  avatarRole,
  boneEaseOptions,
  fallbackZScale,
  lastGood,
  leftArmDecision,
  lookupBone,
  profile,
  rightArmDecision,
  shouldApplySolverTorso,
  shouldUseRetargetedUpperBody,
  sources,
  torsoTrackingReady,
}: {
  activeSpineDrive: MovementAvatarPlayerSpineDrive;
  applyRetargetMappings: (mappings: MovementAvatarRetargetBoneMapping[]) => { applied: number };
  armTargetComposition: MovementAvatarArmTargetCompositionDecision;
  avatarRole: "instructor" | "player";
  boneEaseOptions: Pick<
    MovementAvatarBoneEaseOptionsDecision,
    "armRelaxedSlerp" | "handNeutralSlerp"
  >;
  fallbackZScale: number;
  lastGood: Record<string, THREE.Quaternion>;
  leftArmDecision: MovementAvatarArmDecision;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  profile?: MovementAvatarTrackingProfile;
  rightArmDecision: MovementAvatarArmDecision;
  shouldApplySolverTorso: boolean;
  shouldUseRetargetedUpperBody: boolean;
  sources: MovementAvatarSpineSolverSources;
  torsoTrackingReady: boolean;
}): MovementAvatarUpperBodyFrameRuntimeResult {
  const upperBodyRuntimeApplication = applyMovementAvatarUpperBodyRuntimeToVrmBones({
    activeSpineDrive,
    armRelaxedSlerp: boneEaseOptions.armRelaxedSlerp,
    armTargets: {
      leftElbowTarget: armTargetComposition.leftElbowTarget,
      leftFrontBodyArmBias: armTargetComposition.leftFrontBodyArmBias,
      leftWristTarget: armTargetComposition.leftWristTarget,
      playerArmLandmarks: armTargetComposition.playerArmLandmarks,
      playerSafeArmZScale: armTargetComposition.playerSafeArmZScale,
      rightElbowTarget: armTargetComposition.rightElbowTarget,
      rightFrontBodyArmBias: armTargetComposition.rightFrontBodyArmBias,
      rightWristTarget: armTargetComposition.rightWristTarget,
    },
    avatarRole,
    fallbackZScale,
    handNeutralSlerp: boneEaseOptions.handNeutralSlerp,
    lastGood,
    leftArmDecision,
    lookupBone,
    profile,
    rightArmDecision,
    shouldApplySolverTorso,
    shouldUseRetargetedUpperBody,
    sources,
    spineApplyOptions: resolveMovementAvatarSpineApplyOptions({
      avatarRole,
      shouldApplySpine: activeSpineDrive.shouldApplySpine,
    }),
    torsoTrackingReady,
  });
  let retargetAppliedUpperBody = upperBodyRuntimeApplication.recordedSpineRetargetCount;

  if (shouldUseRetargetedUpperBody) {
    const upperBodyRetargetCounts = applyRetargetMappings(
      MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS,
    );
    retargetAppliedUpperBody += upperBodyRetargetCounts.applied;
  }

  return {
    retargetAppliedUpperBody,
    upperBodyRuntimeApplication,
  };
}
