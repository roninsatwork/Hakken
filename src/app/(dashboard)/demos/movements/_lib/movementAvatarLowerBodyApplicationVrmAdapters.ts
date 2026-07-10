import type * as THREE from "three";
import {
  applyMovementAvatarLowerBodyNonRetargetApplicationPlan,
  applyMovementAvatarLowerBodyRetargetPostPlanApplication,
  applyMovementAvatarLowerBodySquatPoseApplication,
} from "./movementAvatarLowerBodyApplicationExecution";
import type {
  MovementAvatarLowerBodyApplicationPlan,
  MovementAvatarLowerBodyRetargetApplicationPlan,
} from "./movementAvatarLowerBodyApplicationPlan";
import {
  applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones,
  applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones,
  applyMovementAvatarSquatFlexionPoseApplicationToVrmBones,
} from "./movementAvatarLowerBodyRotationVrmAdapters";
import { applyMovementAvatarInstructorFootPlantRequestsToVrmBones } from "./movementAvatarLowerBodyFootPlantVrmAdapters";
import type {
  MovementAvatarInstructorFootPlantContacts,
  MovementAvatarLowerBodyNonRetargetApplicationResult,
  MovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBonesResult,
} from "./movementAvatarLowerBodyApplicationTypes";

export function applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones({
  applyPlantedSquatIk,
  currentFeetOwner,
  isPlayer,
  kneeRaiseLowerLegBoost,
  kneeRaiseUpperLegBoost,
  lookupBone,
  plan,
  singleLegRaiseSlerp,
  squatFlexionBendBoost,
  squatFlexionSlerp,
  lowerBodyNeutralSlerp,
}: {
  applyPlantedSquatIk: (depth: number) => number;
  currentFeetOwner: string;
  isPlayer: boolean;
  kneeRaiseLowerLegBoost?: number;
  kneeRaiseUpperLegBoost?: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  plan: MovementAvatarLowerBodyApplicationPlan;
  singleLegRaiseSlerp: number;
  squatFlexionBendBoost?: number;
  squatFlexionSlerp: number;
  lowerBodyNeutralSlerp: number;
}): MovementAvatarLowerBodyNonRetargetApplicationResult {
  return applyMovementAvatarLowerBodyNonRetargetApplicationPlan({
    applyLegRaise: (side, depth) => {
      applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones({
        depth,
        lowerLegBoost: kneeRaiseLowerLegBoost,
        lookupBone,
        side,
        slerp: singleLegRaiseSlerp,
        upperLegBoost: kneeRaiseUpperLegBoost,
      });
    },
    applyNeutral: () => {
      applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones({
        lookupBone,
        slerp: lowerBodyNeutralSlerp,
      });
    },
    applySquat: (depth) => applyMovementAvatarLowerBodySquatPoseApplication({
      applyPlantedSquatIk,
      applySquatFlexion: (squatDepth) => {
        applyMovementAvatarSquatFlexionPoseApplicationToVrmBones({
          bendBoost: squatFlexionBendBoost,
          depth: squatDepth,
          lookupBone,
          slerp: squatFlexionSlerp,
        });
      },
      depth,
    }).plantedSquatIkDepth,
    plan,
    plantInstructorFeet: (sides) => {
      applyMovementAvatarInstructorFootPlantRequestsToVrmBones({
        currentFeetOwner,
        isPlayer,
        lookupBone,
        sides,
      });
    },
  });
}

export function applyMovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBones({
  applyPlantedSquatIk,
  contacts,
  currentFeetOwner,
  isPlayer,
  kneeRaiseLowerLegBoost,
  kneeRaiseUpperLegBoost,
  lookupBone,
  plan,
  singleLegRaiseSlerp,
  squatFlexionBendBoost,
  squatFlexionSlerp,
}: {
  applyPlantedSquatIk: (depth: number) => number;
  contacts?: MovementAvatarInstructorFootPlantContacts;
  currentFeetOwner: string;
  isPlayer: boolean;
  kneeRaiseLowerLegBoost?: number;
  kneeRaiseUpperLegBoost?: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  plan: MovementAvatarLowerBodyRetargetApplicationPlan;
  singleLegRaiseSlerp: number;
  squatFlexionBendBoost?: number;
  squatFlexionSlerp: number;
}): MovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBonesResult {
  let feetOwner = currentFeetOwner;
  const result = applyMovementAvatarLowerBodyRetargetPostPlanApplication({
    applyLegRaise: (side, depth) => {
      applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones({
        depth,
        lowerLegBoost: kneeRaiseLowerLegBoost,
        lookupBone,
        side,
        slerp: singleLegRaiseSlerp,
        upperLegBoost: kneeRaiseUpperLegBoost,
      });
    },
    applyPlantedSquatIk,
    applySquatFlexion: (depth) => {
      applyMovementAvatarSquatFlexionPoseApplicationToVrmBones({
        bendBoost: squatFlexionBendBoost,
        depth,
        lookupBone,
        slerp: squatFlexionSlerp,
      });
    },
    plan,
    plantInstructorFeet: (sides) => {
      const plantResult = applyMovementAvatarInstructorFootPlantRequestsToVrmBones({
        contacts,
        currentFeetOwner: feetOwner,
        isPlayer,
        lookupBone,
        sides,
      });
      feetOwner = plantResult.feetOwner;
    },
  });

  return {
    ...result,
    feetOwner,
  };
}
