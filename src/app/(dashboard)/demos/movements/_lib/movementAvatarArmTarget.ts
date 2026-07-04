import {
  resolveMovementAvatarArmTargets,
  type MovementAvatarArmTargetsDecision,
} from "./movementAvatarPipeline";
import {
  getVrmHandWristFallbackTarget,
  resolveVrmArmTargetLandmarks,
  type VrmHandsPayload,
  type VrmSolverLandmark,
} from "./vrmRigging";

type MovementAvatarArmTargetInput = Parameters<typeof resolveMovementAvatarArmTargets>[0];

export type MovementAvatarArmTargetCompositionDecision = {
  armTargets: MovementAvatarArmTargetsDecision;
  leftElbowTarget: VrmSolverLandmark | undefined;
  leftFrontBodyArmBias: number;
  leftWristTarget: VrmSolverLandmark | undefined;
  playerArmLandmarks: VrmSolverLandmark[];
  playerSafeArmZScale: number | undefined;
  rightElbowTarget: VrmSolverLandmark | undefined;
  rightFrontBodyArmBias: number;
  rightWristTarget: VrmSolverLandmark | undefined;
};

export function resolveMovementAvatarArmTargetComposition({
  imageLandmarks,
  isPlayer,
  lowerBodyDrive,
  rigHands,
  solverLandmarks,
  targetSolverLandmarks,
}: {
  imageLandmarks: VrmSolverLandmark[];
  isPlayer: boolean;
  lowerBodyDrive: MovementAvatarArmTargetInput["lowerBodyDrive"];
  rigHands: VrmHandsPayload | undefined;
  solverLandmarks: VrmSolverLandmark[];
  targetSolverLandmarks: VrmSolverLandmark[];
}): MovementAvatarArmTargetCompositionDecision {
  const playerArmLandmarks = resolveVrmArmTargetLandmarks({
    imageLandmarks,
    isPlayer,
    solverLandmarks,
  });
  const rightHandWristFallback = getVrmHandWristFallbackTarget(rigHands?.right, imageLandmarks);
  const leftHandWristFallback = getVrmHandWristFallbackTarget(rigHands?.left, imageLandmarks);
  const armTargets = resolveMovementAvatarArmTargets({
    handWristFallbacks: {
      left: leftHandWristFallback,
      right: rightHandWristFallback,
    },
    isPlayer,
    lowerBodyDrive,
    playerLandmarks: playerArmLandmarks,
    solverLandmarks: targetSolverLandmarks,
  });

  return {
    armTargets,
    leftElbowTarget: (armTargets.left.elbowTarget as VrmSolverLandmark | null) ?? playerArmLandmarks[13],
    leftFrontBodyArmBias: armTargets.left.frontBias,
    leftWristTarget:
      (armTargets.left.wristTarget as VrmSolverLandmark | null) ??
      (isPlayer ? playerArmLandmarks[15] : solverLandmarks[15]),
    playerArmLandmarks,
    playerSafeArmZScale: armTargets.right.safeZScale,
    rightElbowTarget: (armTargets.right.elbowTarget as VrmSolverLandmark | null) ?? playerArmLandmarks[14],
    rightFrontBodyArmBias: armTargets.right.frontBias,
    rightWristTarget:
      (armTargets.right.wristTarget as VrmSolverLandmark | null) ??
      (isPlayer ? playerArmLandmarks[16] : solverLandmarks[16]),
  };
}
