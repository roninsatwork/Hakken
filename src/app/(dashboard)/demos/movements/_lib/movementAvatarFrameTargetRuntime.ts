import {
  resolveMovementAvatarArmTargetComposition,
  type MovementAvatarArmTargetCompositionDecision,
} from "./movementAvatarArmTarget";
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
  armTargetComposition: MovementAvatarArmTargetCompositionDecision;
  lowerBodyTargetComposition: MovementAvatarLowerBodyTargetSelectionCompositionDecision;
};

export function resolveMovementAvatarFrameTargetRuntime({
  avatarRole,
  imageLandmarks,
  lowerBodyDrive,
  rigHands,
  solverLandmarks,
  targetSolverLandmarks,
}: {
  avatarRole: "instructor" | "player";
  imageLandmarks: VrmSolverLandmark[];
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  rigHands: VrmHandsPayload | undefined;
  solverLandmarks: VrmSolverLandmark[];
  targetSolverLandmarks: VrmSolverLandmark[];
}): MovementAvatarFrameTargetRuntimeDecision {
  return {
    armTargetComposition: resolveMovementAvatarArmTargetComposition({
      imageLandmarks,
      isPlayer: avatarRole === "player",
      lowerBodyDrive,
      rigHands,
      solverLandmarks,
      targetSolverLandmarks,
    }),
    lowerBodyTargetComposition: resolveMovementAvatarLowerBodyTargetSelectionComposition({
      avatarRole,
      targetSolverLandmarks,
    }),
  };
}
