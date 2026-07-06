import type * as THREE from "three";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type {
  MovementAvatarBoneEaseOptionsDecision,
  MovementAvatarLegacyLowerBodyAimOptionsDecision,
} from "./movementAvatarPipeline";
import { applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones } from "./movementAvatarInactiveLowerBodyRuntime";
import {
  applyMovementAvatarLegacyLowerBodyAimRequestsToVrmBones,
  applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones,
  applyMovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBones,
  applyMovementAvatarLowerBodyRetargetSegmentCounts,
  resolveMovementAvatarLowerBodyApplicationPlan,
  resolveMovementAvatarLowerBodyRetargetAimRequests,
  resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput,
  type MovementAvatarLegacyLowerBodyAimTargets,
  type MovementAvatarLowerBodyRetargetSegmentCounts,
  type MovementAvatarLowerBodyRigRotationSources,
} from "./movementAvatarLowerBodyApplication";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  type MovementAvatarRetargetBoneMapping,
} from "./movementAvatarRestPose";
import type { MovementAvatarLowerBodyTargetDecision } from "./movementAvatarTarget";
import type { MovementRetargetFrame } from "./movementRetargeting";

export type MovementAvatarLowerBodyFrameRuntimeResult = {
  footOwner: string;
  lowerBodyOwner: string;
  plantedSquatIkDepth: number;
  retargetAppliedFeet: number;
  retargetAppliedLegs: number;
  retargetAppliedLowerBody: number;
};

export function applyMovementAvatarLowerBodyFrameRuntime({
  applyPlantedSquatIk,
  applyRetargetMappings,
  avatarRole,
  balancedPlantedSquatDepth,
  boneEaseOptions,
  currentFeetOwner,
  currentLowerBodyOwner,
  fallbackSlerp,
  getLastGoodQuaternion,
  instructorSquatPresentationDepth,
  lookupBone,
  lowerBodyAimOptions,
  lowerBodyAimTargets,
  lowerBodyDrive,
  lowerBodySegmentMotion,
  lowerBodyTarget,
  lowerBodyTrackingReady,
  playerRetargetLowerBodyMotion,
  playerSquatPresentationDepth,
  recordedLowerBodySourceReliable,
  retargetFrame,
  shouldApplyLowerBody,
  shouldHoldPlayerSquatPose,
  solvedLowerBodySources,
  squatFlexionBendBoost,
  storeLastGoodQuaternion,
  targetSolverLandmarks,
  updateWorldMatrix,
  zScale,
}: {
  applyPlantedSquatIk: (depth: number) => number;
  applyRetargetMappings: (mappings: MovementAvatarRetargetBoneMapping[]) => MovementAvatarLowerBodyRetargetSegmentCounts;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  boneEaseOptions: Pick<
    MovementAvatarBoneEaseOptionsDecision,
    "lowerBodyNeutralSlerp" | "singleLegRaiseSlerp" | "solvedLowerBodySlerp" | "squatFlexionSlerp"
  >;
  currentFeetOwner: string;
  currentLowerBodyOwner: string;
  fallbackSlerp: number;
  getLastGoodQuaternion?: (boneName: string) => THREE.Quaternion | null | undefined;
  instructorSquatPresentationDepth: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  lowerBodyAimOptions: MovementAvatarLegacyLowerBodyAimOptionsDecision;
  lowerBodyAimTargets: MovementAvatarLegacyLowerBodyAimTargets;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodySegmentMotion: number;
  lowerBodyTarget: MovementAvatarLowerBodyTargetDecision;
  lowerBodyTrackingReady: boolean;
  playerRetargetLowerBodyMotion: number;
  playerSquatPresentationDepth: number;
  recordedLowerBodySourceReliable: boolean;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose: boolean;
  solvedLowerBodySources: MovementAvatarLowerBodyRigRotationSources;
  squatFlexionBendBoost?: number;
  storeLastGoodQuaternion?: (boneName: string, quaternion: THREE.Quaternion) => void;
  targetSolverLandmarks: Array<{ x: number; y: number; z: number; visibility: number } | null | undefined>;
  updateWorldMatrix: () => void;
  zScale: number;
}): MovementAvatarLowerBodyFrameRuntimeResult {
  let footOwner = currentFeetOwner;
  let lowerBodyOwner = currentLowerBodyOwner;
  let plantedSquatIkDepth = 0;
  let retargetAppliedFeet = 0;
  let retargetAppliedLegs = 0;
  let retargetAppliedLowerBody = 0;
  const isPlayer = avatarRole === "player";

  if ((lowerBodyTrackingReady || shouldHoldPlayerSquatPose) && shouldApplyLowerBody) {
    const lowerBodyApplicationPlan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive,
      lowerBodyTarget,
    });

    const nonRetargetLowerBodyApplication = applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones({
      applyPlantedSquatIk,
      currentFeetOwner: footOwner,
      isPlayer,
      lookupBone,
      lowerBodyNeutralSlerp: boneEaseOptions.lowerBodyNeutralSlerp,
      plan: lowerBodyApplicationPlan,
      singleLegRaiseSlerp: boneEaseOptions.singleLegRaiseSlerp,
      squatFlexionBendBoost,
      squatFlexionSlerp: boneEaseOptions.squatFlexionSlerp,
    });
    if (nonRetargetLowerBodyApplication.handled) {
      lowerBodyOwner = nonRetargetLowerBodyApplication.lowerBodyOwner ?? lowerBodyOwner;
      footOwner = nonRetargetLowerBodyApplication.feetOwner ?? footOwner;
      if (nonRetargetLowerBodyApplication.plantedSquatIkDepth !== null) {
        plantedSquatIkDepth = nonRetargetLowerBodyApplication.plantedSquatIkDepth;
      }
    } else if (lowerBodyApplicationPlan.mode === "retarget") {
      updateWorldMatrix();
      const lowerBodyRetargetCounts = applyRetargetMappings(MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS);
      const retargetCountApplication = applyMovementAvatarLowerBodyRetargetSegmentCounts({
        current: {
          feet: retargetAppliedFeet,
          legs: retargetAppliedLegs,
          lowerBody: retargetAppliedLowerBody,
        },
        segmentCounts: lowerBodyRetargetCounts,
      });
      retargetAppliedLowerBody = retargetCountApplication.lowerBody;
      retargetAppliedLegs = retargetCountApplication.legs;
      retargetAppliedFeet = retargetCountApplication.feet;
      if (retargetCountApplication.footOwnerOverride) {
        footOwner = retargetCountApplication.footOwnerOverride;
      }

      const retargetDecisionApplication = resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput({
        appliedFootSegments: retargetAppliedFeet,
        appliedLegSegments: retargetAppliedLegs,
        appliedLowerBodySegments: retargetAppliedLowerBody,
        avatarRole,
        balancedPlantedSquatDepth,
        instructorSquatPresentationDepth,
        lowerBodyDrive,
        lowerBodySegmentMotion,
        lowerBodyTrackingReady,
        playerRetargetLowerBodyMotion,
        retargetFrame,
        shouldApplyLowerBody,
        shouldHoldPlayerSquatPose,
        playerSquatPresentationDepth,
        stageDecision: lowerBodyApplicationPlan.stageDecision,
      });
      lowerBodyOwner = retargetDecisionApplication.lowerBodyOwner;
      const { retargetApplicationPlan } = retargetDecisionApplication;

      applyMovementAvatarLegacyLowerBodyAimRequestsToVrmBones({
        fallbackSlerp,
        getLastGoodQuaternion,
        lookupBone,
        requests: resolveMovementAvatarLowerBodyRetargetAimRequests({
          options: lowerBodyAimOptions,
          retargetApplicationPlan,
          targets: lowerBodyAimTargets,
          targetSolverLandmarks,
        }),
        storeLastGoodQuaternion,
        zScale,
      });
      footOwner = retargetDecisionApplication.feetOwner;

      const retargetPostPlanApplication = applyMovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBones({
        applyPlantedSquatIk,
        contacts: retargetFrame.contacts,
        currentFeetOwner: footOwner,
        isPlayer,
        lookupBone,
        plan: retargetApplicationPlan,
        singleLegRaiseSlerp: boneEaseOptions.singleLegRaiseSlerp,
        solvedLowerBodySlerp: boneEaseOptions.solvedLowerBodySlerp,
        solvedLowerBodySources,
        squatFlexionBendBoost,
        squatFlexionSlerp: boneEaseOptions.squatFlexionSlerp,
        storeLastGood: storeLastGoodQuaternion,
      });
      plantedSquatIkDepth = retargetPostPlanApplication.plantedSquatIkDepth;
      footOwner = retargetPostPlanApplication.feetOwner;
    }
  } else {
    const inactiveLowerBodyApplication = applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
      avatarRole,
      lookupBone,
      lowerBodyNeutralSlerp: boneEaseOptions.lowerBodyNeutralSlerp,
      lowerBodySourceReliable: recordedLowerBodySourceReliable,
    });
    if (inactiveLowerBodyApplication.lowerBodyOwner) {
      lowerBodyOwner = inactiveLowerBodyApplication.lowerBodyOwner;
    }
    if (inactiveLowerBodyApplication.feetOwner) {
      footOwner = inactiveLowerBodyApplication.feetOwner;
    }
  }

  return {
    footOwner,
    lowerBodyOwner,
    plantedSquatIkDepth,
    retargetAppliedFeet,
    retargetAppliedLegs,
    retargetAppliedLowerBody,
  };
}
