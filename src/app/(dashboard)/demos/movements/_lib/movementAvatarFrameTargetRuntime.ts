import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import {
  resolveMovementAvatarLowerBodyTargetSelectionComposition,
  type MovementAvatarLowerBodyTargetSelectionCompositionDecision,
} from "./movementAvatarLowerBodyTargetSelection";
import type {
  VrmHandsPayload,
  VrmSolverLandmark,
} from "./vrmRigging";

export type MovementAvatarFrameTargetRuntimeDecision = {
  lowerBodyTargetComposition: MovementAvatarLowerBodyTargetSelectionCompositionDecision;
};

export function resolveMovementAvatarFrameTargetRuntime({
  armAvatarRole,
  avatarRole,
  imageLandmarks,
  lowerBodyDrive,
  rigHands,
  solverLandmarks,
  targetSolverLandmarks,
}: {
  armAvatarRole?: "instructor" | "player";
  avatarRole: "instructor" | "player";
  imageLandmarks: VrmSolverLandmark[];
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  rigHands: VrmHandsPayload | undefined;
  solverLandmarks: VrmSolverLandmark[];
  targetSolverLandmarks: VrmSolverLandmark[];
}): MovementAvatarFrameTargetRuntimeDecision {
  const resolvedArmAvatarRole = armAvatarRole ?? avatarRole;

  return {
    lowerBodyTargetComposition: resolveMovementAvatarLowerBodyTargetSelectionComposition({
      avatarRole,
      targetSolverLandmarks,
    }),
  };
}
