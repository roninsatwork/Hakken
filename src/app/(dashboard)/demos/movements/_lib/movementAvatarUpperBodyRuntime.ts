import * as THREE from "three";
import type { MovementAvatarArmDecision, MovementAvatarSpineApplyOptionsDecision } from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import {
  applyMovementAvatarArmApplicationToVrmBones,
  type MovementAvatarArmApplicationResult,
} from "./movementAvatarArmApplication";
import {
  applyMovementAvatarSpinePoseApplicationToVrmBones,
  type MovementAvatarSpineSolverSources,
} from "./movementAvatarSpineApplication";

export type MovementAvatarUpperBodyRuntimeApplication = {
  leftArm: MovementAvatarArmApplicationResult;
  recordedSpineRetargetCount: number;
  rightArm: MovementAvatarArmApplicationResult;
  spine: ReturnType<typeof applyMovementAvatarSpinePoseApplicationToVrmBones>;
};

export function applyMovementAvatarUpperBodyRuntimeToVrmBones({
  activeSpineDrive,
  armRelaxedSlerp,
  avatarRole,
  lastGood,
  leftArmDecision,
  leftArmRetargetApplied,
  lookupBone,
  rightArmDecision,
  rightArmRetargetApplied,
  shouldApplySolverTorso,
  sources,
  spineApplyOptions,
  torsoTrackingReady,
}: {
  activeSpineDrive: MovementAvatarPlayerSpineDrive;
  armRelaxedSlerp: number;
  avatarRole: "instructor" | "player";
  lastGood: Record<string, THREE.Quaternion>;
  leftArmDecision: MovementAvatarArmDecision;
  leftArmRetargetApplied: boolean;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  rightArmDecision: MovementAvatarArmDecision;
  rightArmRetargetApplied: boolean;
  shouldApplySolverTorso: boolean;
  sources: MovementAvatarSpineSolverSources;
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
  torsoTrackingReady: boolean;
}): MovementAvatarUpperBodyRuntimeApplication {
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
    lastGood,
    lookupBone,
    retargetApplied: rightArmRetargetApplied,
    side: "right",
  });

  const leftArm = applyMovementAvatarArmApplicationToVrmBones({
    armDecision: leftArmDecision,
    armRelaxedSlerp,
    lastGood,
    lookupBone,
    retargetApplied: leftArmRetargetApplied,
    side: "left",
  });

  return {
    leftArm,
    recordedSpineRetargetCount: spineApplyOptions.shouldCountRecordedSpineRetarget ? 1 : 0,
    rightArm,
    spine,
  };
}
