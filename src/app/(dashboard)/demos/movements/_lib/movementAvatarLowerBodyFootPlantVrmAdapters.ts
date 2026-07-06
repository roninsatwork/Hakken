import type * as THREE from "three";
import {
  applyMovementAvatarInstructorFootPlantPose,
  applyMovementAvatarInstructorFootPlantRequests,
} from "./movementAvatarLowerBodyAimApplication";
import { applyMovementAvatarLowerBodyRotationSpecsToVrmBones } from "./movementAvatarLowerBodyRotationVrmAdapters";
import type {
  MovementAvatarInstructorFootPlantContacts,
  MovementAvatarInstructorFootPlantPoseResult,
  MovementAvatarInstructorFootPlantRequestsToVrmBonesResult,
  MovementAvatarInstructorFootPlantSide,
} from "./movementAvatarLowerBodyApplicationTypes";

export function applyMovementAvatarInstructorFootPlantPoseToVrmBones({
  currentFeetOwner,
  isPlayer,
  lookupBone,
  side,
  slerp,
}: {
  currentFeetOwner: string;
  isPlayer: boolean;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  side: MovementAvatarInstructorFootPlantSide;
  slerp?: number;
}): MovementAvatarInstructorFootPlantPoseResult {
  return applyMovementAvatarInstructorFootPlantPose({
    applyRotation: (spec) => {
      const result = applyMovementAvatarLowerBodyRotationSpecsToVrmBones({
        lookupBone,
        specs: [spec],
      });

      return result.applied > 0;
    },
    currentFeetOwner,
    isPlayer,
    side,
    slerp,
  });
}

export function applyMovementAvatarInstructorFootPlantRequestsToVrmBones({
  contacts,
  currentFeetOwner,
  isPlayer,
  lookupBone,
  sides,
  slerp,
}: {
  contacts?: MovementAvatarInstructorFootPlantContacts;
  currentFeetOwner: string;
  isPlayer: boolean;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  sides: MovementAvatarInstructorFootPlantSide[];
  slerp?: number;
}): MovementAvatarInstructorFootPlantRequestsToVrmBonesResult {
  let feetOwner = currentFeetOwner;
  const result = applyMovementAvatarInstructorFootPlantRequests({
    apply: (side) => {
      const poseResult = applyMovementAvatarInstructorFootPlantPoseToVrmBones({
        currentFeetOwner: feetOwner,
        isPlayer,
        lookupBone,
        side,
        slerp,
      });
      feetOwner = poseResult.feetOwner;
      return poseResult.applied;
    },
    contacts,
    sides,
  });

  return {
    applied: result.applied,
    feetOwner,
  };
}
