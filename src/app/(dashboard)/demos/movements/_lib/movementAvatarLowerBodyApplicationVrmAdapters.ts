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
        // Neutral/planted ownership is an exact shared local target. Easing
        // from role-specific retarget quaternions left the two avatars on
        // different world-space foot arcs even though both had entered the
        // same neutral stage.
        slerp: 1,
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
        slerp: plan.squatFlexionSlerp,
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
        // Contact is a final support boundary, not a presentation blend. A
        // partial slerp leaves the toe arc above the calibrated floor.
        slerp: 1,
      });
      feetOwner = plantResult.feetOwner;
    },
  });

  return {
    ...result,
    feetOwner,
  };
}
