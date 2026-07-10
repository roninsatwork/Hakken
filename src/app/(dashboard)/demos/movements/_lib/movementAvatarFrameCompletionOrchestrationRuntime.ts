import { applyMovementAvatarFinalFrameOrchestrationRuntime } from "./movementAvatarFinalFrameOrchestrationRuntime";
import { applyMovementAvatarFootingFrameOrchestrationRuntime } from "./movementAvatarFootingFrame";
import { applyMovementAvatarHeadFrameOrchestrationRuntime } from "./movementAvatarHeadFrame";
import { applyMovementAvatarSupportFrameOrchestrationRuntime } from "./movementAvatarSupportFrame";
import {
  partialSupportContactLocks,
  supportContactAnchor,
} from "./movementAvatarSupportContactAnchors";

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

function activeTorsoFeetFloorContactLocks(
  contactLocks: MovementAvatarSupportFrameOrchestrationInput["contactLocks"],
) {
  if (contactLocks.owner !== "support-contact-locks-standing-foot-lock") return contactLocks;

  return partialSupportContactLocks({
    anchors: [
      supportContactAnchor("rightFoot", "right foot to floor", "floor", 0, 1),
      supportContactAnchor("leftFoot", "left foot to floor", "floor", 0, 1),
    ],
    maxCorrection: 0.9,
    owner: "support-contact-feet-floor-active-torso",
    rootCorrectionScale: 1,
    slerp: 1,
  });
}

export function applyMovementAvatarFrameCompletionOrchestrationRuntime(
  input: MovementAvatarFrameCompletionOrchestrationRuntimeInput,
): MovementAvatarFrameCompletionOrchestrationRuntimeResult {
  const floorY = -2.75 + input.calibratedFloorCorrection;
  const hasActiveSpineDrive = input.avatarDecision.spineDrive.shouldApplySpine;
  const supportPresentation =
    hasActiveSpineDrive || (input.lowerBodyTrackingReady && input.shouldApplyLowerBody)
    ? {
      ...input.supportPresentation,
      armSpecs: hasActiveSpineDrive ? [] : input.supportPresentation.armSpecs,
      specs: hasActiveSpineDrive || (input.lowerBodyTrackingReady && input.shouldApplyLowerBody)
        ? []
        : input.supportPresentation.specs,
      spineSpecs: hasActiveSpineDrive ? [] : input.supportPresentation.spineSpecs,
    }
    : input.supportPresentation;
  const contactLocks = hasActiveSpineDrive
    ? activeTorsoFeetFloorContactLocks(input.contactLocks)
    : input.contactLocks;
  const supportFrameOrchestrationRuntime = applyMovementAvatarSupportFrameOrchestrationRuntime({
    avatarRoot: input.avatarRoot,
    contactLocks,
    currentLowerBodyOwner: input.currentLowerBodyOwner,
    floorY,
    lookupBone: input.lookupBone,
    scene: input.scene,
    supportPresentation,
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
    shouldLockActiveTorso: input.avatarDecision.spineDrive.shouldApplySpine,
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
    armApplicationModes: input.armApplicationModes,
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
    floorY,
    footLock: footingRuntime.footLockDebug,
    footWorldSnapshot: footingRuntime.footWorldSnapshot,
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
