import * as THREE from "three";
import type { MovementAvatarArmDecision, MovementAvatarSpineApplyOptionsDecision } from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import type { MovementAvatarTrackingProfile } from "./movementTrackingCalibration";
import {
  applyMovementAvatarArmApplicationToVrmBones,
  type MovementAvatarArmApplicationResult,
} from "./movementAvatarArmApplication";
import {
  applyMovementAvatarSpinePoseApplicationToVrmBones,
  type MovementAvatarSpineSolverSources,
} from "./movementAvatarSpineApplication";
import type { VrmSolverLandmark } from "./vrmRigging";

export type MovementAvatarUpperBodyRuntimeArmTargets = {
  leftElbowTarget: VrmSolverLandmark | undefined;
  leftFrontBodyArmBias: number;
  leftWristTarget: VrmSolverLandmark | undefined;
  playerArmLandmarks: VrmSolverLandmark[];
  playerSafeArmZScale?: number;
  rightElbowTarget: VrmSolverLandmark | undefined;
  rightFrontBodyArmBias: number;
  rightWristTarget: VrmSolverLandmark | undefined;
};

export type MovementAvatarUpperBodyRuntimeApplication = {
  leftArm: MovementAvatarArmApplicationResult;
  recordedSpineRetargetCount: number;
  rightArm: MovementAvatarArmApplicationResult;
  spine: ReturnType<typeof applyMovementAvatarSpinePoseApplicationToVrmBones>;
};

export function applyMovementAvatarUpperBodyRuntimeToVrmBones({
  activeSpineDrive,
  armRelaxedSlerp,
  armTargets,
  armAvatarRole,
  avatarRole,
  fallbackZScale,
  handNeutralSlerp,
  lastGood,
  leftArmDecision,
  lookupBone,
  profile,
  rightArmDecision,
  shouldApplySolverTorso,
  shouldUseRetargetedUpperBody,
  sources,
  spineApplyOptions,
  torsoTrackingReady,
}: {
  activeSpineDrive: MovementAvatarPlayerSpineDrive;
  armRelaxedSlerp: number;
  armTargets: MovementAvatarUpperBodyRuntimeArmTargets;
  armAvatarRole?: "instructor" | "player";
  avatarRole: "instructor" | "player";
  fallbackZScale: number;
  handNeutralSlerp: number;
  lastGood: Record<string, THREE.Quaternion>;
  leftArmDecision: MovementAvatarArmDecision;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  profile?: MovementAvatarTrackingProfile;
  rightArmDecision: MovementAvatarArmDecision;
  shouldApplySolverTorso: boolean;
  shouldUseRetargetedUpperBody: boolean;
  sources: MovementAvatarSpineSolverSources;
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
  torsoTrackingReady: boolean;
}): MovementAvatarUpperBodyRuntimeApplication {
  const resolvedArmAvatarRole = armAvatarRole ?? avatarRole;
  const spine = applyMovementAvatarSpinePoseApplicationToVrmBones({
    activeSpineDrive,
    avatarRole,
    lookupBone,
    shouldApplySolverTorso,
    sources,
    spineApplyOptions,
    storeLastGood: (bone, quaternion) => {
      lastGood[bone] = quaternion;
    },
    torsoTrackingReady,
  });

  const rightArm = applyMovementAvatarArmApplicationToVrmBones({
    armDecision: rightArmDecision,
    armRelaxedSlerp,
    avatarRole: resolvedArmAvatarRole,
    elbowTarget: armTargets.rightElbowTarget,
    fallbackZScale,
    frontBias: armTargets.rightFrontBodyArmBias,
    handNeutralSlerp,
    lastGood,
    lookupBone,
    playerArmLandmarks: armTargets.playerArmLandmarks,
    profile,
    safeZScale: armTargets.playerSafeArmZScale,
    shouldUseRetargetedUpperBody,
    side: "right",
    wristTarget: armTargets.rightWristTarget,
  });

  const leftArm = applyMovementAvatarArmApplicationToVrmBones({
    armDecision: leftArmDecision,
    armRelaxedSlerp,
    avatarRole: resolvedArmAvatarRole,
    elbowTarget: armTargets.leftElbowTarget,
    fallbackZScale,
    frontBias: armTargets.leftFrontBodyArmBias,
    handNeutralSlerp,
    lastGood,
    lookupBone,
    playerArmLandmarks: armTargets.playerArmLandmarks,
    profile,
    safeZScale: armTargets.playerSafeArmZScale,
    shouldUseRetargetedUpperBody,
    side: "left",
    wristTarget: armTargets.leftWristTarget,
  });

  return {
    leftArm,
    recordedSpineRetargetCount: spineApplyOptions.shouldCountRecordedSpineRetarget ? 1 : 0,
    rightArm,
    spine,
  };
}
