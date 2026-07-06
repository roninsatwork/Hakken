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
  applyMovementAvatarSolvedLowerBodyPoseApplicationToVrmBones,
  applyMovementAvatarSquatFlexionPoseApplicationToVrmBones,
} from "./movementAvatarLowerBodyRotationVrmAdapters";
import { applyMovementAvatarInstructorFootPlantRequestsToVrmBones } from "./movementAvatarLowerBodyFootPlantVrmAdapters";
import type { MovementAvatarLowerBodyRigRotationSources } from "./movementAvatarLowerBodyRotationApplication";
import type {
  MovementAvatarInstructorFootPlantContacts,
  MovementAvatarLowerBodyNonRetargetApplicationResult,
  MovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBonesResult,
} from "./movementAvatarLowerBodyApplicationTypes";

export function applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones({
  applyPlantedSquatIk,
  currentFeetOwner,
  isPlayer,
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
        lookupBone,
        side,
        slerp: singleLegRaiseSlerp,
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
  lookupBone,
  plan,
  singleLegRaiseSlerp,
  solvedLowerBodySlerp,
  solvedLowerBodySources,
  squatFlexionBendBoost,
  squatFlexionSlerp,
  storeLastGood,
}: {
  applyPlantedSquatIk: (depth: number) => number;
  contacts?: MovementAvatarInstructorFootPlantContacts;
  currentFeetOwner: string;
  isPlayer: boolean;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  plan: MovementAvatarLowerBodyRetargetApplicationPlan;
  singleLegRaiseSlerp: number;
  solvedLowerBodySlerp: number;
  solvedLowerBodySources: MovementAvatarLowerBodyRigRotationSources;
  squatFlexionBendBoost?: number;
  squatFlexionSlerp: number;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
}): MovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBonesResult {
  let feetOwner = currentFeetOwner;
  const result = applyMovementAvatarLowerBodyRetargetPostPlanApplication({
    applyLegRaise: (side, depth) => {
      applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones({
        depth,
        lookupBone,
        side,
        slerp: singleLegRaiseSlerp,
      });
    },
    applyPlantedSquatIk,
    applySolvedLowerBody: (depth) => {
      applyMovementAvatarSolvedLowerBodyPoseApplicationToVrmBones({
        depth,
        lookupBone,
        slerp: solvedLowerBodySlerp,
        sources: solvedLowerBodySources,
        storeLastGood,
      });
    },
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
