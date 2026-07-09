import type { VRM } from "@pixiv/three-vrm";
import { applyMovementAvatarBodyFrameOrchestrationRuntime } from "./movementAvatarBodyFrameOrchestrationRuntime";
import { applyMovementAvatarFrameCompletionOrchestrationRuntime } from "./movementAvatarFrameCompletionOrchestrationRuntime";
import { resolveMovementAvatarFrameScenePreparationRuntime } from "./movementAvatarFrameScenePreparationRuntime";
import { resolveMovementAvatarFrameWorldRuntime } from "./movementAvatarFrameWorldRuntime";
import { applyMovementAvatarPreBodyFrameOrchestrationRuntime } from "./movementAvatarPreBodyFrameOrchestrationRuntime";
import type { MovementCalibration, MovementTrackingDebugState } from "./movementTrackingCalibration";
import type { MovementRetargetSourceModel } from "./movementRetargeting";

type MovementAvatarBodyFrameInput = Parameters<typeof applyMovementAvatarBodyFrameOrchestrationRuntime>[0];
type MovementAvatarCompletionInput = Parameters<typeof applyMovementAvatarFrameCompletionOrchestrationRuntime>[0];
type MovementAvatarFrameWorldRuntime = ReturnType<typeof resolveMovementAvatarFrameWorldRuntime>;
type MovementAvatarFrameScenePreparationRuntime =
  ReturnType<typeof resolveMovementAvatarFrameScenePreparationRuntime>;
type MovementAvatarPreBodyReadyRuntime = Extract<
  ReturnType<typeof applyMovementAvatarPreBodyFrameOrchestrationRuntime>,
  { status: "ready" }
>;

type MovementAvatarMutableRef<T> = {
  current: T;
};

export type MovementAvatarReadyFrameApplicationRuntime = {
  bodyFrameOrchestrationRuntime: ReturnType<typeof applyMovementAvatarBodyFrameOrchestrationRuntime>;
  completionFrameOrchestrationRuntime: ReturnType<typeof applyMovementAvatarFrameCompletionOrchestrationRuntime>;
};

export function applyMovementAvatarReadyFrameApplicationRuntime({
  avatarName,
  avatarRole,
  avatarRoot,
  baseBonePositionRef,
  baseHipsPositionRef,
  blendshapes,
  boneEaseOptions,
  faceLandmarks,
  frameWorldRuntime,
  imageLandmarks,
  isPlayer,
  lastGoodQuaternionRef,
  lookupBone,
  manualCalibration,
  mirrorPlayerDisplay,
  plantedFootLockRef,
  playerLegRaiseHoldRef,
  preBodyFrameOrchestrationRuntime,
  profile,
  profileName,
  retargetAvatarRestRef,
  retargetSourceModelRef,
  rigHands,
  scene,
  scenePreparationRuntime,
  solverLandmarks,
  targetSolverLandmarks,
  trackingDebugRef,
  vrm,
}: {
  avatarName: MovementAvatarCompletionInput["avatarName"];
  avatarRole: MovementAvatarBodyFrameInput["avatarRole"] & MovementAvatarCompletionInput["avatarRole"];
  avatarRoot: MovementAvatarBodyFrameInput["avatarRoot"] & MovementAvatarCompletionInput["avatarRoot"];
  baseBonePositionRef: MovementAvatarCompletionInput["baseBonePositionRef"];
  baseHipsPositionRef: MovementAvatarCompletionInput["baseHipsPositionRef"];
  blendshapes: MovementAvatarCompletionInput["blendshapes"];
  boneEaseOptions: MovementAvatarBodyFrameInput["boneEaseOptions"];
  faceLandmarks: MovementAvatarCompletionInput["faceLandmarks"];
  frameWorldRuntime: MovementAvatarFrameWorldRuntime;
  imageLandmarks: MovementAvatarBodyFrameInput["imageLandmarks"] & MovementAvatarCompletionInput["poseLandmarks"];
  isPlayer: boolean;
  lastGoodQuaternionRef: MovementAvatarBodyFrameInput["lastGoodQuaternionRef"];
  lookupBone: MovementAvatarBodyFrameInput["lookupBone"] & MovementAvatarCompletionInput["lookupBone"];
  manualCalibration: MovementCalibration | null;
  mirrorPlayerDisplay: MovementAvatarCompletionInput["mirrorForDisplay"];
  plantedFootLockRef: MovementAvatarCompletionInput["plantedFootLockRef"];
  playerLegRaiseHoldRef: MovementAvatarMutableRef<MovementAvatarCompletionInput["playerLegRaiseHoldState"]>;
  preBodyFrameOrchestrationRuntime: MovementAvatarPreBodyReadyRuntime;
  profile: MovementAvatarBodyFrameInput["profile"] & MovementAvatarCompletionInput["profile"];
  profileName: MovementAvatarCompletionInput["profileName"];
  retargetAvatarRestRef: MovementAvatarBodyFrameInput["retargetAvatarRestRef"];
  retargetSourceModelRef: MovementAvatarMutableRef<MovementRetargetSourceModel | null>;
  rigHands: MovementAvatarBodyFrameInput["rigHands"] & MovementAvatarCompletionInput["hands"];
  scene: MovementAvatarBodyFrameInput["scene"] & MovementAvatarCompletionInput["scene"];
  scenePreparationRuntime: MovementAvatarFrameScenePreparationRuntime;
  solverLandmarks: MovementAvatarBodyFrameInput["solverLandmarks"];
  targetSolverLandmarks: MovementAvatarBodyFrameInput["targetSolverLandmarks"];
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
  vrm: VRM;
}): MovementAvatarReadyFrameApplicationRuntime {
  const {
    decisionSnapshotRuntime,
    framePreparationRuntime,
    locomotionFrameOrchestrationRuntime,
    lowerBodyFrameStateOrchestrationRuntime,
  } = preBodyFrameOrchestrationRuntime;
  const {
    activeSpineDrive,
    balancedPlantedSquatDepth,
    instructorSquatPresentationDepth,
    leftArmDecision,
    liveSquatDepth,
    lowerBodyDrive,
    lowerBodyTarget,
    lowerBodyTrackingReady,
    playerRetargetLowerBodyMotion,
    playerSquatPresentationDepth,
    recordedLowerBodySegmentMotion,
    recordedLowerBodySourceReliable,
    retargetFrame,
    rightArmDecision,
    shouldApplyLowerBody,
    shouldApplySolverTorso,
    shouldHoldPlayerSquatPose,
    shouldUseRetargetedUpperBody,
    torsoTrackingReady,
    visualRootDrop,
  } = decisionSnapshotRuntime;
  const {
    activeCalibration,
    avatarDecision,
    autoCalibrationKind,
    exerciseTransition,
    motionFrameInput,
  } = framePreparationRuntime;
  const armAvatarRole = motionFrameInput.sourceOrigin === "recorded-replay"
    ? "instructor"
    : avatarRole;
  const { legRaiseHoldDecision } = lowerBodyFrameStateOrchestrationRuntime;
  const {
    calibratedFloorCorrection,
    hipsFrameRuntime: { hipsApplication, hipsPositionOptions },
    stepResponse,
  } = locomotionFrameOrchestrationRuntime;
  const { fallbackSlerp, hipsNode } = scenePreparationRuntime;

  const bodyFrameOrchestrationRuntime = applyMovementAvatarBodyFrameOrchestrationRuntime({
    activeSpineDrive,
    armAvatarRole,
    avatarRole,
    avatarRoot,
    balancedPlantedSquatDepth,
    boneEaseOptions,
    currentRestMap: retargetAvatarRestRef.current,
    fallbackSlerp,
    imageLandmarks,
    instructorSquatPresentationDepth,
    lastGoodQuaternionRef,
    leftArmDecision,
    lookupBone,
    lowerBodyDrive,
    lowerBodySegmentMotion: recordedLowerBodySegmentMotion,
    lowerBodyTarget,
    lowerBodyTrackingReady,
    playerRetargetLowerBodyMotion,
    playerSquatPresentationDepth,
    profile,
    recordedLowerBodySourceReliable,
    retargetAvatarRestRef,
    retargetFrame,
    rigHands,
    rightArmDecision,
    scene,
    shouldApplyLowerBody,
    shouldApplySolverTorso,
    shouldHoldPlayerSquatPose,
    shouldUseRetargetedUpperBody,
    solverLandmarks,
    squatFlexionBendBoost: profile.squatLegBendBoost,
    targetSolverLandmarks,
    torsoTrackingReady,
    vrm,
    zScale: frameWorldRuntime.lowerBodyZScale,
  });
  const {
    footOwner,
    frameTargetRuntime,
    lowerBodyOwner,
    plantedSquatIkDepth,
    retargetAppliedLowerBody,
    retargetAppliedUpperBody,
  } = bodyFrameOrchestrationRuntime;

  const completionFrameOrchestrationRuntime = applyMovementAvatarFrameCompletionOrchestrationRuntime({
    activeCalibration,
    autoCalibrationKind,
    avatarDecision,
    avatarName,
    avatarRole,
    avatarRoot,
    avatarRootYaw: avatarRoot?.rotation.y ?? 0,
    baseBonePositionRef,
    baseHipsPositionRef,
    blendshapes,
    calibratedFloorCorrection,
    contactLocks: avatarDecision.supportContactLocks,
    currentLowerBodyOwner: lowerBodyOwner,
    exerciseTransition,
    expressionManager: vrm.expressionManager,
    faceLandmarks,
    footOwner,
    frameTargetRuntime,
    hands: rigHands,
    hasManualCalibration: Boolean(manualCalibration),
    hipsApplication,
    hipsNode,
    hipsPositionOptions,
    isPlayer,
    legRaiseHoldDecision,
    liveSquatDepth,
    lookupBone,
    lowerBodyDrive,
    lowerBodyTrackingReady,
    mirrorForDisplay: mirrorPlayerDisplay,
    motionFrameInputOwner: motionFrameInput.owner,
    neckSlerp: profile.neckSlerp,
    plantedFootLockRef,
    plantedSquatIkDepth,
    playerLegRaiseHoldState: playerLegRaiseHoldRef.current,
    poseLandmarks: imageLandmarks,
    profile,
    profileName,
    retargetAppliedLowerBody,
    retargetAppliedUpperBody,
    retargetFrame,
    retargetSourceModel: retargetSourceModelRef.current,
    scene,
    shouldApplyLowerBody,
    shouldHoldPlayerSquatPose,
    stepResponse,
    supportPresentation: avatarDecision.supportPresentation,
    trackingDebugRef,
    visualRootDrop,
    vrm,
    zScale: frameWorldRuntime.visualTelemetryZScale,
  });

  return {
    bodyFrameOrchestrationRuntime,
    completionFrameOrchestrationRuntime,
  };
}
