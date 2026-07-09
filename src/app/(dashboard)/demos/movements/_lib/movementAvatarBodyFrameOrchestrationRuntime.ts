import type * as THREE from "three";
import {
  resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime,
  type MovementAvatarFrameTargetRetargetOrchestrationRuntime,
} from "./movementAvatarFrameTargetRetargetOrchestrationRuntime";
import {
  applyMovementAvatarLowerBodyFrameOrchestrationRuntime,
  type MovementAvatarLowerBodyFrameOrchestrationRuntimeResult,
} from "./movementAvatarLowerBodyFrameOrchestrationRuntime";
import {
  applyMovementAvatarUpperBodyFrameOrchestrationRuntime,
  type MovementAvatarUpperBodyFrameOrchestrationRuntimeResult,
} from "./movementAvatarUpperBodyFrameOrchestrationRuntime";

type MovementAvatarFrameTargetRetargetInput =
  Parameters<typeof resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime>[0];
type MovementAvatarUpperBodyFrameOrchestrationInput =
  Parameters<typeof applyMovementAvatarUpperBodyFrameOrchestrationRuntime>[0];
type MovementAvatarLowerBodyFrameOrchestrationInput =
  Parameters<typeof applyMovementAvatarLowerBodyFrameOrchestrationRuntime>[0];

export type MovementAvatarBodyFrameOrchestrationRuntimeResult = {
  footOwner: string;
  frameTargetRuntime: MovementAvatarFrameTargetRetargetOrchestrationRuntime["frameTargetRuntime"];
  lowerBodyFrameOrchestrationRuntime: MovementAvatarLowerBodyFrameOrchestrationRuntimeResult;
  lowerBodyOwner: string;
  plantedSquatIkDepth: number;
  retargetAppliedLowerBody: number;
  retargetAppliedUpperBody: number;
  targetRetargetOrchestrationRuntime: MovementAvatarFrameTargetRetargetOrchestrationRuntime;
  upperBodyFrameOrchestrationRuntime: MovementAvatarUpperBodyFrameOrchestrationRuntimeResult;
};

export function applyMovementAvatarBodyFrameOrchestrationRuntime({
  activeSpineDrive,
  armAvatarRole,
  avatarRole,
  avatarRoot,
  balancedPlantedSquatDepth,
  boneEaseOptions,
  currentRestMap,
  fallbackSlerp,
  hasWorldLandmarks,
  imageLandmarks,
  instructorSquatPresentationDepth,
  lastGoodQuaternionRef,
  leftArmDecision,
  lookupBone,
  lowerBodyDrive,
  lowerBodySegmentMotion,
  lowerBodyTarget,
  lowerBodyTrackingReady,
  playerRetargetLowerBodyMotion,
  playerSquatPresentationDepth,
  profile,
  recordedLowerBodySourceReliable,
  retargetAvatarRestRef,
  retargetFrame,
  rigHands,
  riggedPose,
  rightArmDecision,
  scene,
  shouldApplyLowerBody,
  shouldApplySolverTorso,
  shouldHoldPlayerSquatPose,
  shouldUseRetargetedUpperBody,
  solverLandmarks,
  squatFlexionBendBoost,
  targetSolverLandmarks,
  torsoTrackingReady,
  vrm,
  zScale,
}: {
  activeSpineDrive: MovementAvatarUpperBodyFrameOrchestrationInput["activeSpineDrive"];
  armAvatarRole?: MovementAvatarFrameTargetRetargetInput["avatarRole"];
  avatarRole: MovementAvatarFrameTargetRetargetInput["avatarRole"];
  avatarRoot: MovementAvatarFrameTargetRetargetInput["avatarRoot"];
  balancedPlantedSquatDepth: MovementAvatarLowerBodyFrameOrchestrationInput["balancedPlantedSquatDepth"];
  boneEaseOptions: MovementAvatarUpperBodyFrameOrchestrationInput["boneEaseOptions"] &
    MovementAvatarLowerBodyFrameOrchestrationInput["boneEaseOptions"];
  currentRestMap: MovementAvatarFrameTargetRetargetInput["currentRestMap"];
  fallbackSlerp: MovementAvatarLowerBodyFrameOrchestrationInput["fallbackSlerp"];
  hasWorldLandmarks: boolean;
  imageLandmarks: MovementAvatarFrameTargetRetargetInput["imageLandmarks"];
  instructorSquatPresentationDepth: number;
  lastGoodQuaternionRef: MovementAvatarUpperBodyFrameOrchestrationInput["lastGoodQuaternionRef"];
  leftArmDecision: MovementAvatarUpperBodyFrameOrchestrationInput["leftArmDecision"];
  lookupBone: MovementAvatarUpperBodyFrameOrchestrationInput["lookupBone"];
  lowerBodyDrive: MovementAvatarFrameTargetRetargetInput["lowerBodyDrive"];
  lowerBodySegmentMotion: MovementAvatarFrameTargetRetargetInput["lowerBodySegmentMotion"];
  lowerBodyTarget: MovementAvatarLowerBodyFrameOrchestrationInput["lowerBodyTarget"];
  lowerBodyTrackingReady: MovementAvatarLowerBodyFrameOrchestrationInput["lowerBodyTrackingReady"];
  playerRetargetLowerBodyMotion: MovementAvatarLowerBodyFrameOrchestrationInput["playerRetargetLowerBodyMotion"];
  playerSquatPresentationDepth: MovementAvatarLowerBodyFrameOrchestrationInput["playerSquatPresentationDepth"];
  profile: NonNullable<MovementAvatarFrameTargetRetargetInput["profile"]>;
  recordedLowerBodySourceReliable: MovementAvatarLowerBodyFrameOrchestrationInput["recordedLowerBodySourceReliable"];
  retargetAvatarRestRef: MovementAvatarLowerBodyFrameOrchestrationInput["retargetAvatarRestRef"];
  retargetFrame: MovementAvatarFrameTargetRetargetInput["retargetFrame"];
  rigHands: MovementAvatarFrameTargetRetargetInput["rigHands"];
  riggedPose: MovementAvatarUpperBodyFrameOrchestrationInput["riggedPose"];
  rightArmDecision: MovementAvatarUpperBodyFrameOrchestrationInput["rightArmDecision"];
  scene: Pick<THREE.Object3D, "updateMatrixWorld">;
  shouldApplyLowerBody: MovementAvatarLowerBodyFrameOrchestrationInput["shouldApplyLowerBody"];
  shouldApplySolverTorso: MovementAvatarUpperBodyFrameOrchestrationInput["shouldApplySolverTorso"];
  shouldHoldPlayerSquatPose: MovementAvatarLowerBodyFrameOrchestrationInput["shouldHoldPlayerSquatPose"];
  shouldUseRetargetedUpperBody: boolean;
  solverLandmarks: MovementAvatarFrameTargetRetargetInput["solverLandmarks"];
  squatFlexionBendBoost: MovementAvatarLowerBodyFrameOrchestrationInput["squatFlexionBendBoost"];
  targetSolverLandmarks: MovementAvatarFrameTargetRetargetInput["targetSolverLandmarks"];
  torsoTrackingReady: MovementAvatarUpperBodyFrameOrchestrationInput["torsoTrackingReady"];
  vrm: MovementAvatarFrameTargetRetargetInput["vrm"];
  zScale: MovementAvatarLowerBodyFrameOrchestrationInput["zScale"];
}): MovementAvatarBodyFrameOrchestrationRuntimeResult {
  const targetRetargetOrchestrationRuntime = resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime({
    armAvatarRole,
    avatarRole,
    avatarRoot,
    currentRestMap,
    hasWorldLandmarks,
    imageLandmarks,
    instructorSquatPresentationDepth,
    lastGood: lastGoodQuaternionRef.current,
    lookupBone,
    lowerBodyDrive,
    lowerBodySegmentMotion,
    profile,
    retargetFrame,
    rigHands,
    shouldUseRetargetedUpperBody,
    solverLandmarks,
    targetSolverLandmarks,
    vrm,
  });
  const {
    armTargetComposition,
    frameTargetRuntime,
    lowerBodyAimTargets,
    retargetFrameRuntimeAdapters,
  } = targetRetargetOrchestrationRuntime;

  const upperBodyFrameOrchestrationRuntime = applyMovementAvatarUpperBodyFrameOrchestrationRuntime({
    activeSpineDrive,
    armTargetComposition,
    armAvatarRole,
    avatarRole,
    boneEaseOptions,
    hasWorldLandmarks,
    lastGoodQuaternionRef,
    leftArmDecision,
    lookupBone,
    profile,
    retargetFrameRuntimeAdapters,
    riggedPose,
    rightArmDecision,
    shouldApplySolverTorso,
    shouldUseRetargetedUpperBody,
    torsoTrackingReady,
  });

  const lowerBodyFrameOrchestrationRuntime = applyMovementAvatarLowerBodyFrameOrchestrationRuntime({
    avatarRole,
    balancedPlantedSquatDepth,
    boneEaseOptions,
    currentFeetOwner: "neutral",
    currentLowerBodyOwner: "neutral",
    fallbackSlerp,
    instructorSquatPresentationDepth,
    lastGoodQuaternionRef,
    lookupBone,
    lowerBodyAimTargets,
    lowerBodyDrive,
    lowerBodySegmentMotion,
    lowerBodyTarget,
    lowerBodyTrackingReady,
    playerRetargetLowerBodyMotion,
    playerSquatPresentationDepth,
    profile,
    recordedLowerBodySourceReliable,
    retargetAvatarRestRef,
    retargetFrame,
    retargetFrameRuntimeAdapters,
    scene,
    shouldApplyLowerBody,
    shouldHoldPlayerSquatPose,
    solvedLowerBodySources: {
      LeftLowerLeg: riggedPose.LeftLowerLeg,
      LeftUpperLeg: riggedPose.LeftUpperLeg,
      RightLowerLeg: riggedPose.RightLowerLeg,
      RightUpperLeg: riggedPose.RightUpperLeg,
    },
    squatFlexionBendBoost,
    targetSolverLandmarks,
    zScale,
  });

  return {
    footOwner: lowerBodyFrameOrchestrationRuntime.footOwner,
    frameTargetRuntime,
    lowerBodyFrameOrchestrationRuntime,
    lowerBodyOwner: lowerBodyFrameOrchestrationRuntime.lowerBodyOwner,
    plantedSquatIkDepth: lowerBodyFrameOrchestrationRuntime.plantedSquatIkDepth,
    retargetAppliedLowerBody: lowerBodyFrameOrchestrationRuntime.retargetAppliedLowerBody,
    retargetAppliedUpperBody: upperBodyFrameOrchestrationRuntime.retargetAppliedUpperBody,
    targetRetargetOrchestrationRuntime,
    upperBodyFrameOrchestrationRuntime,
  };
}
