import { applyMovementAvatarFinalFrameOrchestrationRuntime } from "./movementAvatarFinalFrameOrchestrationRuntime";
import { applyMovementAvatarFootingFrameOrchestrationRuntime } from "./movementAvatarFootingFrameOrchestrationRuntime";
import { applyMovementAvatarHeadFrameOrchestrationRuntime } from "./movementAvatarHeadFrameOrchestrationRuntime";
import { applyMovementAvatarSupportFrameOrchestrationRuntime } from "./movementAvatarSupportFrameOrchestrationRuntime";

type MovementAvatarSupportFrameOrchestrationInput =
  Parameters<typeof applyMovementAvatarSupportFrameOrchestrationRuntime>[0];
type MovementAvatarFootingFrameOrchestrationInput =
  Parameters<typeof applyMovementAvatarFootingFrameOrchestrationRuntime>[0];
type MovementAvatarHeadFrameOrchestrationInput =
  Parameters<typeof applyMovementAvatarHeadFrameOrchestrationRuntime>[0];
type MovementAvatarFinalFrameOrchestrationInput =
  Parameters<typeof applyMovementAvatarFinalFrameOrchestrationRuntime>[0];

export type MovementAvatarFrameCompletionOrchestrationRuntimeInput =
  Omit<MovementAvatarSupportFrameOrchestrationInput, "floorY"> &
  Omit<MovementAvatarFootingFrameOrchestrationInput, "floorY"> &
  Omit<
    MovementAvatarHeadFrameOrchestrationInput,
    "debugUpdatedAt" | "footLockCorrection" | "footLockDrift" | "footLockState" | "lowerBodyOwner" |
    "supportContactTelemetry"
  > &
  Omit<MovementAvatarFinalFrameOrchestrationInput, "footLock" | "frameUpdatedAt"> & {
    calibratedFloorCorrection: number;
    getNow?: () => number;
  };

export type MovementAvatarFrameCompletionOrchestrationRuntimeResult = {
  finalFrameOrchestrationRuntime: ReturnType<typeof applyMovementAvatarFinalFrameOrchestrationRuntime>;
  footingFrameOrchestrationRuntime: ReturnType<typeof applyMovementAvatarFootingFrameOrchestrationRuntime>;
  headFrameOrchestrationRuntime: ReturnType<typeof applyMovementAvatarHeadFrameOrchestrationRuntime>;
  lowerBodyOwner: string;
  supportFrameOrchestrationRuntime: ReturnType<typeof applyMovementAvatarSupportFrameOrchestrationRuntime>;
};

function resolveMovementAvatarFrameCompletionNow(getNow: (() => number) | undefined) {
  return getNow ? getNow() : performance.now();
}

export function applyMovementAvatarFrameCompletionOrchestrationRuntime(
  input: MovementAvatarFrameCompletionOrchestrationRuntimeInput,
): MovementAvatarFrameCompletionOrchestrationRuntimeResult {
  const floorY = -2.75 + input.calibratedFloorCorrection;
  const supportFrameOrchestrationRuntime = applyMovementAvatarSupportFrameOrchestrationRuntime({
    avatarRoot: input.avatarRoot,
    contactLocks: input.contactLocks,
    currentLowerBodyOwner: input.currentLowerBodyOwner,
    floorY,
    lookupBone: input.lookupBone,
    scene: input.scene,
    supportPresentation: input.supportPresentation,
  });
  const { lowerBodyOwner, supportContactTelemetry } = supportFrameOrchestrationRuntime;

  const footingFrameOrchestrationRuntime = applyMovementAvatarFootingFrameOrchestrationRuntime({
    avatarRole: input.avatarRole,
    avatarRoot: input.avatarRoot,
    baseHipsPositionRef: input.baseHipsPositionRef,
    floorY,
    hipsApplication: input.hipsApplication,
    hipsNode: input.hipsNode,
    hipsPositionOptions: input.hipsPositionOptions,
    lookupBone: input.lookupBone,
    lowerBodyDrive: input.lowerBodyDrive,
    lowerBodyTrackingReady: input.lowerBodyTrackingReady,
    plantedFootLockRef: input.plantedFootLockRef,
    retargetFrame: input.retargetFrame,
    scene: input.scene,
    shouldApplyLowerBody: input.shouldApplyLowerBody,
    shouldHoldPlayerSquatPose: input.shouldHoldPlayerSquatPose,
    stepResponse: input.stepResponse,
  });
  const {
    footLockCorrection,
    footLockDrift,
    footLockState,
    footingRuntime,
  } = footingFrameOrchestrationRuntime;

  const headFrameOrchestrationRuntime = applyMovementAvatarHeadFrameOrchestrationRuntime({
    activeCalibration: input.activeCalibration,
    autoCalibrationKind: input.autoCalibrationKind,
    avatarDecision: input.avatarDecision,
    avatarRole: input.avatarRole,
    avatarRootYaw: input.avatarRootYaw,
    baseBonePositionRef: input.baseBonePositionRef,
    debugUpdatedAt: resolveMovementAvatarFrameCompletionNow(input.getNow),
    exerciseTransition: input.exerciseTransition,
    faceLandmarks: input.faceLandmarks,
    footLockCorrection,
    footLockDrift,
    footLockState,
    footOwner: input.footOwner,
    frameTargetRuntime: input.frameTargetRuntime,
    hasManualCalibration: input.hasManualCalibration,
    legRaiseHoldDecision: input.legRaiseHoldDecision,
    liveSquatDepth: input.liveSquatDepth,
    lookupBone: input.lookupBone,
    lowerBodyDrive: input.lowerBodyDrive,
    lowerBodyOwner,
    motionFrameInputOwner: input.motionFrameInputOwner,
    neckSlerp: input.neckSlerp,
    plantedSquatIkDepth: input.plantedSquatIkDepth,
    playerLegRaiseHoldState: input.playerLegRaiseHoldState,
    poseLandmarks: input.poseLandmarks,
    profile: input.profile,
    profileName: input.profileName,
    retargetAppliedLowerBody: input.retargetAppliedLowerBody,
    retargetAppliedUpperBody: input.retargetAppliedUpperBody,
    retargetSourceModel: input.retargetSourceModel,
    shouldApplyLowerBody: input.shouldApplyLowerBody,
    supportContactTelemetry,
    trackingDebugRef: input.trackingDebugRef,
    visualRootDrop: input.visualRootDrop,
  });

  const finalFrameOrchestrationRuntime = applyMovementAvatarFinalFrameOrchestrationRuntime({
    avatarName: input.avatarName,
    avatarRole: input.avatarRole,
    blendshapes: input.blendshapes,
    expressionManager: input.expressionManager,
    footLock: footingRuntime.footLockDebug,
    frameUpdatedAt: resolveMovementAvatarFrameCompletionNow(input.getNow),
    hands: input.hands,
    isPlayer: input.isPlayer,
    lookupBone: input.lookupBone,
    mirrorForDisplay: input.mirrorForDisplay,
    retargetFrame: input.retargetFrame,
    trackingDebugRef: input.trackingDebugRef,
    vrm: input.vrm,
    zScale: input.zScale,
  });

  return {
    finalFrameOrchestrationRuntime,
    footingFrameOrchestrationRuntime,
    headFrameOrchestrationRuntime,
    lowerBodyOwner,
    supportFrameOrchestrationRuntime,
  };
}
