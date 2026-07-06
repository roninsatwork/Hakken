import type { MovementAvatarLowerBodyTargetSelectionsDecision } from "./movementAvatarPipeline";
import type { MovementAvatarLegacyLowerBodyAimTargets } from "./movementAvatarLowerBodyApplicationTypes";
import {
  selectMovementKneeTarget,
  selectMovementTrackingEndpoint,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import type { VrmSolverLandmark } from "./vrmRigging";

export type MovementAvatarLowerBodyTargetSelectionCompositionDecision = {
  aimTargets: MovementAvatarLegacyLowerBodyAimTargets;
  leftAnkleTarget: VrmSolverLandmark | undefined;
  leftKneeTarget: VrmSolverLandmark | undefined;
  leftToeTarget: VrmSolverLandmark | undefined;
  rightAnkleTarget: VrmSolverLandmark | undefined;
  rightKneeTarget: VrmSolverLandmark | undefined;
  rightToeTarget: VrmSolverLandmark | undefined;
  selections: MovementAvatarLowerBodyTargetSelectionsDecision;
};

export function resolveMovementAvatarLowerBodyTargetSelections({
  avatarRole,
  landmarks,
}: {
  avatarRole: "instructor" | "player";
  landmarks: TrackingLandmark[];
}): MovementAvatarLowerBodyTargetSelectionsDecision {
  const endpointVisibilityThreshold = avatarRole === "player" ? 0.18 : 0.2;

  return {
    endpointVisibilityThreshold,
    rightKnee: selectMovementKneeTarget({
      hip: landmarks[24],
      knee: landmarks[26],
      ankle: landmarks[28],
      side: "right",
    }),
    leftKnee: selectMovementKneeTarget({
      hip: landmarks[23],
      knee: landmarks[25],
      ankle: landmarks[27],
      side: "left",
    }),
    rightAnkle: selectMovementTrackingEndpoint({
      poseTarget: landmarks[28],
      poseVisibilityThreshold: endpointVisibilityThreshold,
    }),
    leftAnkle: selectMovementTrackingEndpoint({
      poseTarget: landmarks[27],
      poseVisibilityThreshold: endpointVisibilityThreshold,
    }),
    rightToe: selectMovementTrackingEndpoint({
      poseTarget: landmarks[32],
      poseVisibilityThreshold: endpointVisibilityThreshold,
    }),
    leftToe: selectMovementTrackingEndpoint({
      poseTarget: landmarks[31],
      poseVisibilityThreshold: endpointVisibilityThreshold,
    }),
  };
}

export function resolveMovementAvatarLowerBodyTargetSelectionComposition({
  avatarRole,
  targetSolverLandmarks,
}: {
  avatarRole: "instructor" | "player";
  targetSolverLandmarks: VrmSolverLandmark[];
}): MovementAvatarLowerBodyTargetSelectionCompositionDecision {
  const selections = resolveMovementAvatarLowerBodyTargetSelections({
    avatarRole,
    landmarks: targetSolverLandmarks,
  });
  const leftAnkleTarget = (selections.leftAnkle.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[27];
  const leftKneeTarget = (selections.leftKnee.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[25];
  const leftToeTarget = (selections.leftToe.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[31];
  const rightAnkleTarget = (selections.rightAnkle.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[28];
  const rightKneeTarget = (selections.rightKnee.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[26];
  const rightToeTarget = (selections.rightToe.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[32];

  return {
    aimTargets: {
      leftAnkle: leftAnkleTarget,
      leftKnee: leftKneeTarget,
      leftToe: leftToeTarget,
      rightAnkle: rightAnkleTarget,
      rightKnee: rightKneeTarget,
      rightToe: rightToeTarget,
    },
    leftAnkleTarget,
    leftKneeTarget,
    leftToeTarget,
    rightAnkleTarget,
    rightKneeTarget,
    rightToeTarget,
    selections,
  };
}
