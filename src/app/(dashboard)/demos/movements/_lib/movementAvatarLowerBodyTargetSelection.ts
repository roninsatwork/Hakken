import {
  resolveMovementAvatarLowerBodyTargetSelections,
  type MovementAvatarLowerBodyTargetSelectionsDecision,
} from "./movementAvatarPipeline";
import type { VrmSolverLandmark } from "./vrmRigging";

export type MovementAvatarLowerBodyTargetSelectionCompositionDecision = {
  leftAnkleTarget: VrmSolverLandmark | undefined;
  leftKneeTarget: VrmSolverLandmark | undefined;
  leftToeTarget: VrmSolverLandmark | undefined;
  rightAnkleTarget: VrmSolverLandmark | undefined;
  rightKneeTarget: VrmSolverLandmark | undefined;
  rightToeTarget: VrmSolverLandmark | undefined;
  selections: MovementAvatarLowerBodyTargetSelectionsDecision;
};

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

  return {
    leftAnkleTarget: (selections.leftAnkle.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[27],
    leftKneeTarget: (selections.leftKnee.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[25],
    leftToeTarget: (selections.leftToe.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[31],
    rightAnkleTarget: (selections.rightAnkle.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[28],
    rightKneeTarget: (selections.rightKnee.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[26],
    rightToeTarget: (selections.rightToe.target as VrmSolverLandmark | null) ?? targetSolverLandmarks[32],
    selections,
  };
}
