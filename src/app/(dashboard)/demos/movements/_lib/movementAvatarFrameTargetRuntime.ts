import {
  resolveMovementAvatarLowerBodyTargetSelectionComposition,
  type MovementAvatarLowerBodyTargetSelectionCompositionDecision,
} from "./movementAvatarLowerBodyTargetSelection";
import type { VrmSolverLandmark } from "./vrmRigging";

export type MovementAvatarFrameTargetRuntimeDecision = {
  lowerBodyTargetComposition: MovementAvatarLowerBodyTargetSelectionCompositionDecision;
};

export function resolveMovementAvatarFrameTargetRuntime({
  avatarRole,
  targetSolverLandmarks,
}: {
  avatarRole: "instructor" | "player";
  targetSolverLandmarks: VrmSolverLandmark[];
}): MovementAvatarFrameTargetRuntimeDecision {
  return {
    lowerBodyTargetComposition: resolveMovementAvatarLowerBodyTargetSelectionComposition({
      avatarRole,
      targetSolverLandmarks,
    }),
  };
}
