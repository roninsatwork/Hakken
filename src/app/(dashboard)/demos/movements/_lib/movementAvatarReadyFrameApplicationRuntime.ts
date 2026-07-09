import type { VRM } from "@pixiv/three-vrm";
import { applyMovementAvatarBodyFrameOrchestrationRuntime } from "./movementAvatarBodyFrameOrchestrationRuntime";
import { applyMovementAvatarFrameCompletionOrchestrationRuntime } from "./movementAvatarFrameCompletionOrchestrationRuntime";
import { resolveMovementAvatarFrameScenePreparationRuntime } from "./movementAvatarFrameScenePreparationRuntime";
import { resolveMovementAvatarFrameWorldRuntime } from "./movementAvatarFrameWorldRuntime";
import { applyMovementAvatarPreBodyFrameOrchestrationRuntime } from "./movementAvatarPreBodyFrameOrchestrationRuntime";
import type { MovementCalibration, MovementTrackingDebugState } from "./movementTrackingCalibration";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { VrmHandsPayload } from "./vrmRigging";

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
  imageLandmarks: MovementAvatarCompletionInput["poseLandmarks"];
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
  rigHands: VrmHandsPayload | null | undefined;
  scene: MovementAvatarBodyFrameInput["scene"] & MovementAvatarCompletionInput["scene"];
  scenePreparationRuntime: MovementAvatarFrameScenePreparationRuntime;
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
  const { legRaiseHoldDecision } = lowerBodyFrameStateOrchestrationRuntime;
  const {
    calibratedFloorCorrection,
    hipsFrameRuntime: { hipsApplication, hipsPositionOptions },
    stepResponse,
  } = locomotionFrameOrchestrationRuntime;
  const { hipsNode } = scenePreparationRuntime;

  const bodyFrameOrchestrationRuntime = applyMovementAvatarBodyFrameOrchestrationRuntime({
    activeSpineDrive,
    avatarRole,
    avatarRoot,
    balancedPlantedSquatDepth,
    boneEaseOptions,
    currentRestMap: retargetAvatarRestRef.current,
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
    rightArmDecision,
    scene,
    shouldApplyLowerBody,
    shouldApplySolverTorso,
    shouldHoldPlayerSquatPose,
    squatFlexionBendBoost: profile.squatLegBendBoost,
    targetSolverLandmarks,
    torsoTrackingReady,
    vrm,
  });
  const {
    footOwner,
    frameTargetRuntime,
    lowerBodyOwner,
    plantedSquatIkDepth,
    retargetAppliedLowerBody,
    retargetAppliedUpperBody,
  } = bodyFrameOrchestrationRuntime;

  const upperBodyArmApplication =
    bodyFrameOrchestrationRuntime.upperBodyFrameOrchestrationRuntime.upperBodyFrameRuntime.upperBodyRuntimeApplication;

  const completionFrameOrchestrationRuntime = applyMovementAvatarFrameCompletionOrchestrationRuntime({
    activeCalibration,
    armApplicationModes: {
      left: upperBodyArmApplication.leftArm.mode,
      right: upperBodyArmApplication.rightArm.mode,
    },
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
    hands: rigHands ?? undefined,
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
