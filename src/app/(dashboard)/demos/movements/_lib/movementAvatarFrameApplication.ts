import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";
import type { MovementAvatarArmApplicationMode } from "./movementAvatarArmApplication";
import { applyMovementAvatarBodyFrameOrchestrationRuntime } from "./movementAvatarBodyFrame";
import { applyMovementAvatarOptionalPostFrameDebugTelemetry, type MovementAvatarRetargetDebugRegistryWindow } from "./movementAvatarDebugTelemetry";
import {
  applyMovementAvatarFootingFrameOrchestrationRuntime,
  finalizeMovementAvatarFootingFrameWorldSnapshot,
} from "./movementAvatarFootingFrame";
import {
  applyMovementAvatarFramePreparationOrchestrationRuntime,
  applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime,
  type MovementAvatarFrameDecisionSnapshotRuntime,
  type MovementAvatarFramePreparationOrchestrationRuntime,
  type MovementAvatarLowerBodyFrameStateOrchestrationRuntime,
  resolveMovementAvatarFrameDecisionSnapshotRuntime,
} from "./movementAvatarFramePreparation";
import { applyMovementAvatarHeadFrameOrchestrationRuntime } from "./movementAvatarHeadFrame";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarRigMeasurements } from "./movementAvatarRestPose";
import { applyMovementAvatarLocomotionFrameOrchestrationRuntime, type MovementAvatarLocomotionFrameOrchestrationRuntime } from "./movementAvatarLocomotionFrame";
import { partialSupportContactLocks, supportContactAnchor } from "./movementAvatarSupportContactAnchors";
import { applyMovementAvatarSupportFrameOrchestrationRuntime } from "./movementAvatarSupportFrame";
import type { MovementMotionFrame } from "./movementMotionFrame";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import type { MovementRetargetFrame, MovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementRootMotionFrame } from "./movementRootMotion";
import type {
  MovementCalibration,
  MovementTrackingDebugState,
  TrackingLandmark,
} from "./movementTrackingCalibration";
import {
  applyVrmBlendshapeExpressionTargetsToManager,
  applyVrmHandsRotationTargetsToBones,
  type VrmBlendshapeCategory,
  type VrmExpressionTargetWriter,
  type VrmHandsPayload,
} from "./vrmRigging";

type MovementAvatarMutableRef<T> = {
  current: T;
};

// --- movementAvatarFrameWorldRuntime ---

export type MovementAvatarFrameWorldRuntime = {
  hasWorldLandmarks: boolean;
  lowerBodyZScale: number;
  visualTelemetryZScale: number;
  worldPoseForLocomotion: TrackingLandmark[] | null;
  worldPoseForSetup: TrackingLandmark[] | undefined;
};

export function resolveMovementAvatarFrameWorldRuntime({
  worldLandmarks,
}: {
  worldLandmarks?: TrackingLandmark[] | null;
}): MovementAvatarFrameWorldRuntime {
  const hasWorldLandmarks = Boolean(worldLandmarks);

  return {
    hasWorldLandmarks,
    lowerBodyZScale: hasWorldLandmarks ? 1 : 0.1,
    visualTelemetryZScale: hasWorldLandmarks ? 1 : 0.18,
    worldPoseForLocomotion: worldLandmarks ?? null,
    worldPoseForSetup: worldLandmarks ?? undefined,
  };
}

// --- movementAvatarFrameScenePreparationRuntime ---

export type MovementAvatarFrameScenePreparationRuntime = {
  fallbackSlerp: number;
  hipsNode: THREE.Object3D | null;
  updatedSceneMatrixWorld: boolean;
};

export function resolveMovementAvatarFrameScenePreparationRuntime({
  avatarRole,
  lookupBone,
  scene,
}: {
  avatarRole: "instructor" | "player";
  lookupBone: (boneName: "hips") => THREE.Object3D | null | undefined;
  scene?: Pick<THREE.Object3D, "updateMatrixWorld"> | null;
}): MovementAvatarFrameScenePreparationRuntime {
  scene?.updateMatrixWorld(true);

  return {
    fallbackSlerp: avatarRole === "player" ? 0.5 : 0.3,
    hipsNode: lookupBone("hips") ?? null,
    updatedSceneMatrixWorld: Boolean(scene),
  };
}

// --- movementAvatarEndFrameRuntime ---

export type MovementAvatarEndFrameRuntimeResult = {
  appliedExpressions: number;
  appliedHandRotations: number;
};

export function applyMovementAvatarEndFrameRuntime({
  blendshapes,
  expressionManager,
  hands,
  isPlayer,
  lookupBone,
  mirrorForDisplay,
}: {
  blendshapes?: VrmBlendshapeCategory[] | null;
  expressionManager: VrmExpressionTargetWriter | null | undefined;
  hands?: VrmHandsPayload | null;
  isPlayer: boolean;
  lookupBone: (vrmName: string) => THREE.Object3D | null | undefined;
  mirrorForDisplay: boolean;
}): MovementAvatarEndFrameRuntimeResult {
  const expressionApplication = applyVrmBlendshapeExpressionTargetsToManager({
    blendshapes,
    expressionManager,
  });
  const handApplication = applyVrmHandsRotationTargetsToBones({
    hands,
    isPlayer,
    lookupBone,
    mirrorForDisplay,
  });

  return {
    appliedExpressions: expressionApplication.applied,
    appliedHandRotations: handApplication.applied,
  };
}

// --- movementAvatarPostFrameDebugRuntime ---

export type MovementAvatarPostFrameDebugRuntimeResult = {
  applied: boolean;
  trackingDebugState: MovementTrackingDebugState | null;
};

export function applyMovementAvatarPostFrameDebugRuntime({
  avatarName,
  avatarRole,
  avatarRestMap,
  floorY,
  footLock,
  footWorldSnapshot,
  frameUpdatedAt,
  registryWindow = typeof window === "undefined"
    ? undefined
    : window as Window & MovementAvatarRetargetDebugRegistryWindow,
  retargetFrame,
  retargetSourceModel,
  rigMeasurements,
  sourceImageLandmarks,
  sourceWorldLandmarks,
  trackingDebugRef,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  avatarRestMap?: import("./movementAvatarRestPose").MovementAvatarRetargetRestMap | null;
  floorY?: number;
  footLock: Parameters<typeof applyMovementAvatarOptionalPostFrameDebugTelemetry>[0]["footLock"];
  footWorldSnapshot?: Parameters<typeof applyMovementAvatarOptionalPostFrameDebugTelemetry>[0]["footWorldSnapshot"];
  frameUpdatedAt: number;
  registryWindow?: (Window & MovementAvatarRetargetDebugRegistryWindow) | undefined;
  retargetFrame: MovementRetargetFrame;
  retargetSourceModel?: MovementRetargetSourceModel | null;
  rigMeasurements?: Partial<MovementAvatarRigMeasurements> | null;
  sourceImageLandmarks?: TrackingLandmark[] | null;
  sourceWorldLandmarks?: TrackingLandmark[] | null;
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
  vrm: VRM;
  zScale: number;
}): MovementAvatarPostFrameDebugRuntimeResult {
  if (!trackingDebugRef) {
    return {
      applied: false,
      trackingDebugState: null,
    };
  }

  const trackingDebugState = applyMovementAvatarOptionalPostFrameDebugTelemetry({
    avatarName,
    avatarRole,
    avatarRestMap,
    floorY,
    footLock,
    footWorldSnapshot,
    frameUpdatedAt,
    registryWindow,
    retargetFrame,
    retargetSourceModel,
    rigMeasurements,
    sourceImageLandmarks,
    sourceWorldLandmarks,
    state: trackingDebugRef.current,
    vrm,
    zScale,
  });
  trackingDebugRef.current = trackingDebugState;

  return {
    applied: true,
    trackingDebugState,
  };
}

// --- movementAvatarFinalFrameOrchestrationRuntime ---

export type MovementAvatarFinalFrameOrchestrationRuntimeResult = {
  endFrameRuntime: MovementAvatarEndFrameRuntimeResult;
  postFrameDebugRuntime: MovementAvatarPostFrameDebugRuntimeResult;
};

export function applyMovementAvatarFinalFrameOrchestrationRuntime({
  avatarName,
  avatarRole,
  avatarRestMap,
  blendshapes,
  expressionManager,
  floorY,
  footLock,
  footWorldSnapshot,
  frameUpdatedAt,
  hands,
  isPlayer,
  lookupBone,
  mirrorForDisplay,
  retargetFrame,
  retargetSourceModel,
  rigMeasurements,
  sourceImageLandmarks,
  sourceWorldLandmarks,
  trackingDebugRef,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  avatarRestMap?: import("./movementAvatarRestPose").MovementAvatarRetargetRestMap | null;
  blendshapes?: VrmBlendshapeCategory[] | null;
  expressionManager: VrmExpressionTargetWriter | null | undefined;
  floorY?: number;
  footLock: Parameters<typeof applyMovementAvatarPostFrameDebugRuntime>[0]["footLock"];
  footWorldSnapshot?: Parameters<typeof applyMovementAvatarPostFrameDebugRuntime>[0]["footWorldSnapshot"];
  frameUpdatedAt: number;
  hands?: VrmHandsPayload | null;
  isPlayer: boolean;
  lookupBone: (vrmName: string) => THREE.Object3D | null | undefined;
  mirrorForDisplay: boolean;
  retargetFrame: MovementRetargetFrame;
  retargetSourceModel?: MovementRetargetSourceModel | null;
  rigMeasurements?: Partial<MovementAvatarRigMeasurements> | null;
  sourceImageLandmarks?: TrackingLandmark[] | null;
  sourceWorldLandmarks?: TrackingLandmark[] | null;
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
  vrm: VRM;
  zScale: number;
}): MovementAvatarFinalFrameOrchestrationRuntimeResult {
  const postFrameDebugRuntime = applyMovementAvatarPostFrameDebugRuntime({
    avatarName,
    avatarRole,
    avatarRestMap,
    floorY,
    footLock,
    footWorldSnapshot,
    frameUpdatedAt,
    retargetFrame,
    retargetSourceModel,
    rigMeasurements,
    sourceImageLandmarks,
    sourceWorldLandmarks,
    trackingDebugRef,
    vrm,
    zScale,
  });
  const endFrameRuntime = applyMovementAvatarEndFrameRuntime({
    blendshapes,
    expressionManager,
    hands,
    isPlayer,
    lookupBone,
    mirrorForDisplay,
  });

  return {
    endFrameRuntime,
    postFrameDebugRuntime,
  };
}

// --- movementAvatarFrameCompletionOrchestrationRuntime ---

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

export function filterMovementAvatarSupportArmSpecsForRetargetOwners({
  armApplicationModes,
  armSpecs,
}: {
  armApplicationModes: { left: MovementAvatarArmApplicationMode; right: MovementAvatarArmApplicationMode };
  armSpecs: MovementAvatarSupportPresentationDecision["armSpecs"];
}) {
  return armSpecs.filter((spec) => {
    const side = spec.bone.startsWith("left") ? "left" : "right";
    return armApplicationModes[side] !== "retargeted";
  });
}

export function resolveMovementAvatarStandingFeetFloorContactLocks({
  contactLocks,
  lowerBodyDrive,
  retargetContacts,
  shouldApply,
}: {
  contactLocks: MovementAvatarSupportFrameOrchestrationInput["contactLocks"];
  lowerBodyDrive: Pick<MovementAvatarLowerBodyDrive, "playerLegRaiseSide" | "shouldDrivePlayerLegRaise">;
  retargetContacts?: MovementRetargetFrame["contacts"];
  shouldApply: boolean;
}) {
  if (!shouldApply || contactLocks.owner !== "support-contact-locks-standing-foot-lock") {
    return contactLocks;
  }

  // An explicit no-contact frame is not a standing support frame. This occurs
  // during low-confidence startup as well as true airborne motion. Applying
  // the floor-safety IK here makes independently calibrated instructor/player
  // roots bend their legs differently before contact evidence exists.
  if (retargetContacts && !retargetContacts.leftFoot && !retargetContacts.rightFoot) {
    return partialSupportContactLocks({
      anchors: [],
      owner: "support-contact-feet-floor-no-source-contact",
    });
  }

  const raisedSide = retargetContacts?.leftFoot && retargetContacts.rightFoot
    ? null
    : retargetContacts?.leftFoot && !retargetContacts.rightFoot
      ? "right"
      : retargetContacts?.rightFoot && !retargetContacts.leftFoot
        ? "left"
        : lowerBodyDrive.shouldDrivePlayerLegRaise
          ? lowerBodyDrive.playerLegRaiseSide
          : null;
  const anchors = raisedSide === "left"
    ? [supportContactAnchor("rightFoot", "right planted foot to floor", "floor", 0, 1)]
    : raisedSide === "right"
      ? [supportContactAnchor("leftFoot", "left planted foot to floor", "floor", 0, 1)]
      : [
          supportContactAnchor("rightFoot", "right foot to floor", "floor", 0, 1),
          supportContactAnchor("leftFoot", "left foot to floor", "floor", 0, 1),
        ];

  return partialSupportContactLocks({
    anchors,
    boneCorrectionScale: 1,
    maxCorrection: 0.9,
    maxBoneCorrection: 0.45,
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
  const unownedArmSpecs = filterMovementAvatarSupportArmSpecsForRetargetOwners({
    armApplicationModes: input.armApplicationModes,
    armSpecs: input.supportPresentation.armSpecs,
  });
  const supportPresentation =
    hasActiveSpineDrive || (input.lowerBodyTrackingReady && input.shouldApplyLowerBody)
    ? {
      ...input.supportPresentation,
      armSpecs: hasActiveSpineDrive ? [] : unownedArmSpecs,
      specs: hasActiveSpineDrive || (input.lowerBodyTrackingReady && input.shouldApplyLowerBody)
        ? []
        : input.supportPresentation.specs,
      spineSpecs: hasActiveSpineDrive ? [] : input.supportPresentation.spineSpecs,
    }
    : {
      ...input.supportPresentation,
      armSpecs: unownedArmSpecs,
    };
  const contactLocks = hasActiveSpineDrive
    ? resolveMovementAvatarStandingFeetFloorContactLocks({
        contactLocks: input.contactLocks,
        lowerBodyDrive: input.lowerBodyDrive,
        retargetContacts: input.retargetFrame.contacts,
        shouldApply: true,
      })
    : resolveMovementAvatarStandingFeetFloorContactLocks({
        contactLocks: input.contactLocks,
        lowerBodyDrive: input.lowerBodyDrive,
        retargetContacts: input.retargetFrame.contacts,
        shouldApply: input.shouldApplyLowerBody,
      });
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
    // The legacy lock yields because support contact corrects after hips.
    shouldYieldToSupportContact: Boolean(input.avatarRoot && input.scene && contactLocks.shouldApply),
    stepResponse: input.stepResponse,
  });
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
  const finalFootingFrameOrchestrationRuntime = finalizeMovementAvatarFootingFrameWorldSnapshot({
    avatarRoot: input.avatarRoot,
    footingFrameOrchestrationRuntime,
    lookupBone: input.lookupBone,
    scene: input.scene,
  });
  const {
    footLockCorrection,
    footLockDrift,
    footLockState,
    footingRuntime,
  } = finalFootingFrameOrchestrationRuntime;

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
    frameDeltaSeconds: input.frameDeltaSeconds,
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
    motionFrameHeadTarget: input.motionFrameHeadTarget,
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
    avatarRestMap: input.avatarRestMap,
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
    retargetSourceModel: input.retargetSourceModel,
    rigMeasurements: input.rigMeasurements,
    sourceImageLandmarks: input.poseLandmarks,
    sourceWorldLandmarks: input.sourceWorldLandmarks,
    trackingDebugRef: input.trackingDebugRef,
    vrm: input.vrm,
    zScale: input.zScale,
  });

  return {
    finalFrameOrchestrationRuntime,
    footingFrameOrchestrationRuntime: finalFootingFrameOrchestrationRuntime,
    headFrameOrchestrationRuntime,
    lowerBodyOwner,
    supportFrameOrchestrationRuntime,
  };
}

// --- movementAvatarPreBodyFrameOrchestrationRuntime ---

type MovementAvatarFramePreparationInput =
  Parameters<typeof applyMovementAvatarFramePreparationOrchestrationRuntime>[0];
type MovementAvatarLowerBodyFrameStateInput =
  Parameters<typeof applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime>[0];
type MovementAvatarLocomotionFrameInput =
  Parameters<typeof applyMovementAvatarLocomotionFrameOrchestrationRuntime>[0];

type MovementAvatarReadyFramePreparationRuntime = Extract<
  MovementAvatarFramePreparationOrchestrationRuntime,
  { status: "ready" }
>;
type MovementAvatarReadyLocomotionFrameRuntime = Extract<
  MovementAvatarLocomotionFrameOrchestrationRuntime,
  { status: "ready" }
>;

export type MovementAvatarPreBodyFrameOrchestrationRuntime =
  | {
    framePreparationRuntime: MovementAvatarFramePreparationOrchestrationRuntime;
    status: "fallback-demo-pose";
  }
  | {
    framePreparationRuntime: MovementAvatarReadyFramePreparationRuntime;
    locomotionFrameOrchestrationRuntime: MovementAvatarLocomotionFrameOrchestrationRuntime;
    status: "fallback-demo-pose";
  }
  | {
    decisionSnapshotRuntime: MovementAvatarFrameDecisionSnapshotRuntime;
    framePreparationRuntime: MovementAvatarReadyFramePreparationRuntime;
    locomotionFrameOrchestrationRuntime: MovementAvatarReadyLocomotionFrameRuntime;
    lowerBodyFrameStateOrchestrationRuntime: MovementAvatarLowerBodyFrameStateOrchestrationRuntime;
    status: "ready";
  };

export function applyMovementAvatarPreBodyFrameOrchestrationRuntime({
  avatarBaseY,
  avatarRole,
  avatarRoot,
  displayWorldPose,
  exerciseTransitionStateRef,
  faceLandmarks,
  forceStandby,
  hands,
  history,
  instructorLowerBodyStabilityRef,
  isLivePlayer,
  manualCalibration,
  mirrorPlayerDisplay,
  motionFrame,
  now = () => performance.now(),
  playerLegRaiseHoldRef,
  playerLowerBodyStabilityRef,
  poseLandmarks,
  positionOffset,
  profile,
  providedRetargetSourceModel,
  recordedRootMotionFrame,
  rigMeasurements,
  rootCommandYRef,
  retargetSourceModelRef,
  setupStateRef,
  trackingDebugRef,
  worldPoseForLocomotion,
  worldPoseForSetup,
}: {
  avatarBaseY: MovementAvatarLocomotionFrameInput["avatarBaseY"];
  avatarRole: MovementAvatarLowerBodyFrameStateInput["avatarRole"];
  avatarRoot: MovementAvatarLocomotionFrameInput["avatarRoot"];
  displayWorldPose: MovementAvatarLocomotionFrameInput["displayWorldPose"];
  exerciseTransitionStateRef: MovementAvatarFramePreparationInput["exerciseTransitionStateRef"];
  faceLandmarks: MovementAvatarFramePreparationInput["faceLandmarks"];
  forceStandby: MovementAvatarLocomotionFrameInput["forceStandby"];
  hands: MovementAvatarFramePreparationInput["hands"];
  history: MovementAvatarLocomotionFrameInput["history"];
  instructorLowerBodyStabilityRef: MovementAvatarLowerBodyFrameStateInput["instructorLowerBodyStabilityRef"];
  isLivePlayer: MovementAvatarFramePreparationInput["isLivePlayer"];
  manualCalibration: MovementAvatarFramePreparationInput["manualCalibration"];
  mirrorPlayerDisplay: MovementAvatarLocomotionFrameInput["mirrorPlayerDisplay"];
  motionFrame: MovementAvatarFramePreparationInput["motionFrame"];
  now?: () => number;
  playerLegRaiseHoldRef: MovementAvatarLowerBodyFrameStateInput["playerLegRaiseHoldRef"];
  playerLowerBodyStabilityRef: MovementAvatarLowerBodyFrameStateInput["playerLowerBodyStabilityRef"];
  poseLandmarks: MovementAvatarFramePreparationInput["poseLandmarks"] &
    MovementAvatarLocomotionFrameInput["poseLandmarks"];
  positionOffset: MovementAvatarLocomotionFrameInput["positionOffset"];
  profile: MovementAvatarLocomotionFrameInput["profile"];
  providedRetargetSourceModel: MovementAvatarFramePreparationInput["providedRetargetSourceModel"];
  recordedRootMotionFrame: MovementAvatarLocomotionFrameInput["recordedRootMotionFrame"];
  rigMeasurements: MovementAvatarLocomotionFrameInput["rigMeasurements"];
  rootCommandYRef?: MovementAvatarLocomotionFrameInput["rootCommandYRef"];
  retargetSourceModelRef: MovementAvatarFramePreparationInput["retargetSourceModelRef"];
  setupStateRef: MovementAvatarFramePreparationInput["setupStateRef"];
  trackingDebugRef: MovementAvatarLocomotionFrameInput["trackingDebugRef"];
  worldPoseForLocomotion: MovementAvatarLocomotionFrameInput["worldPose"];
  worldPoseForSetup: MovementAvatarFramePreparationInput["worldPoseLandmarks"];
}): MovementAvatarPreBodyFrameOrchestrationRuntime {
  const framePreparationRuntime = applyMovementAvatarFramePreparationOrchestrationRuntime({
    exerciseTransitionStateRef,
    faceLandmarks,
    hands,
    isLivePlayer,
    manualCalibration,
    motionFrame,
    poseLandmarks,
    providedRetargetSourceModel,
    retargetSourceModelRef,
    setupStateRef,
    worldPoseLandmarks: worldPoseForSetup,
  });
  if (framePreparationRuntime.status === "fallback-demo-pose") {
    return {
      framePreparationRuntime,
      status: "fallback-demo-pose",
    };
  }

  const lowerBodyFrameStateOrchestrationRuntime = applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime({
    avatarDecision: framePreparationRuntime.avatarDecision,
    avatarRole,
    instructorLowerBodyStabilityRef,
    now: now(),
    playerLegRaiseHoldRef,
    playerLowerBodyStabilityRef,
  });
  const { lowerBodyFrameStateRuntime } = lowerBodyFrameStateOrchestrationRuntime;
  const decisionSnapshotRuntime = resolveMovementAvatarFrameDecisionSnapshotRuntime({
    avatarDecision: framePreparationRuntime.avatarDecision,
    lowerBodyFrameStateRuntime,
  });
  const locomotionFrameOrchestrationRuntime = applyMovementAvatarLocomotionFrameOrchestrationRuntime({
    avatarBaseY,
    avatarRole,
    avatarRoot,
    calibration: framePreparationRuntime.activeCalibration,
    displayWorldPose,
    forceStandby,
    history,
    lowerBodyDrive: decisionSnapshotRuntime.lowerBodyDrive,
    lowerBodyTrackingReady: decisionSnapshotRuntime.lowerBodyTrackingReady,
    mirrorPlayerDisplay,
    playerSquatPresentationDepth: decisionSnapshotRuntime.playerSquatPresentationDepth,
    poseLandmarks,
    positionOffset,
    profile,
    recordedRootMotionFrame,
    rigMeasurements,
    rootCommandYRef,
    rootOrientation: decisionSnapshotRuntime.rootOrientation,
    shouldApplyLowerBody: decisionSnapshotRuntime.shouldApplyLowerBody,
    trackingDebugRef,
    visualRootDrop: decisionSnapshotRuntime.visualRootDrop,
    worldPose: worldPoseForLocomotion,
  });

  if (locomotionFrameOrchestrationRuntime.status === "fallback-demo-pose") {
    return {
      framePreparationRuntime,
      locomotionFrameOrchestrationRuntime,
      status: "fallback-demo-pose",
    };
  }

  return {
    decisionSnapshotRuntime,
    framePreparationRuntime,
    locomotionFrameOrchestrationRuntime,
    lowerBodyFrameStateOrchestrationRuntime,
    status: "ready",
  };
}

// --- movementAvatarReadyFrameApplicationRuntime ---

type MovementAvatarBodyFrameInput = Parameters<typeof applyMovementAvatarBodyFrameOrchestrationRuntime>[0];
type MovementAvatarCompletionInput = Parameters<typeof applyMovementAvatarFrameCompletionOrchestrationRuntime>[0];
type MovementAvatarPreBodyReadyRuntime = Extract<
  ReturnType<typeof applyMovementAvatarPreBodyFrameOrchestrationRuntime>,
  { status: "ready" }
>;

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
  frameDeltaSeconds,
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
  rigMeasurements,
  rigHands,
  scene,
  scenePreparationRuntime,
  sourceWorldLandmarks,
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
  frameDeltaSeconds?: number;
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
  rigMeasurements?: Partial<MovementAvatarRigMeasurements> | null;
  rigHands: VrmHandsPayload | null | undefined;
  scene: MovementAvatarBodyFrameInput["scene"] & MovementAvatarCompletionInput["scene"];
  scenePreparationRuntime: MovementAvatarFrameScenePreparationRuntime;
  sourceWorldLandmarks?: TrackingLandmark[] | null;
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
    frameDeltaSeconds,
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
    frameDeltaSeconds,
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
    motionFrameHeadTarget: motionFrameInput.headTarget,
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
    rigMeasurements,
    scene,
    shouldApplyLowerBody,
    shouldHoldPlayerSquatPose,
    stepResponse,
    supportPresentation: avatarDecision.supportPresentation,
    avatarRestMap: retargetAvatarRestRef.current,
    sourceWorldLandmarks,
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

// --- movementAvatarReadyFrameOrchestrationRuntime ---

type MovementAvatarFrameWorldInput = Parameters<typeof resolveMovementAvatarFrameWorldRuntime>[0];
type MovementAvatarFrameScenePreparationInput =
  Parameters<typeof resolveMovementAvatarFrameScenePreparationRuntime>[0];
type MovementAvatarPreBodyInput = Parameters<typeof applyMovementAvatarPreBodyFrameOrchestrationRuntime>[0];
type MovementAvatarReadyFrameApplicationInput =
  Parameters<typeof applyMovementAvatarReadyFrameApplicationRuntime>[0];

export type MovementAvatarReadyFrameOrchestrationRuntime =
  | {
    frameWorldRuntime: ReturnType<typeof resolveMovementAvatarFrameWorldRuntime>;
    preBodyFrameOrchestrationRuntime: ReturnType<typeof applyMovementAvatarPreBodyFrameOrchestrationRuntime>;
    scenePreparationRuntime: ReturnType<typeof resolveMovementAvatarFrameScenePreparationRuntime>;
    status: "fallback-demo-pose";
  }
  | {
    bodyFrameOrchestrationRuntime: MovementAvatarReadyFrameApplicationRuntime["bodyFrameOrchestrationRuntime"];
    completionFrameOrchestrationRuntime: MovementAvatarReadyFrameApplicationRuntime["completionFrameOrchestrationRuntime"];
    frameWorldRuntime: ReturnType<typeof resolveMovementAvatarFrameWorldRuntime>;
    preBodyFrameOrchestrationRuntime: Extract<
      ReturnType<typeof applyMovementAvatarPreBodyFrameOrchestrationRuntime>,
      { status: "ready" }
    >;
    scenePreparationRuntime: ReturnType<typeof resolveMovementAvatarFrameScenePreparationRuntime>;
    status: "ready";
  };

export function applyMovementAvatarReadyFrameOrchestrationRuntime({
  applyDemoFallbackPose,
  avatarBaseY,
  avatarName,
  avatarRole,
  avatarRoot,
  baseBonePositionRef,
  baseHipsPositionRef,
  blendshapes,
  boneEaseOptions,
  displayPreparedInput,
  exerciseTransitionStateRef,
  faceLandmarks,
  frameDeltaSeconds,
  fallbackPoseSlerp = 0.35,
  forceStandby,
  imageLandmarks,
  instructorLowerBodyStabilityRef,
  isPlayer,
  lastGoodQuaternionRef,
  liveRootMotionHistory,
  lookupBone,
  manualCalibration,
  mirrorPlayerDisplay,
  motionFrame,
  playerLegRaiseHoldRef,
  playerLowerBodyStabilityRef,
  plantedFootLockRef,
  positionOffset,
  profile,
  profileName,
  providedRetargetSourceModel,
  recordedRootMotionFrame,
  retargetAvatarRestRef,
  rigMeasurements,
  rootCommandYRef,
  retargetSourceModelRef,
  rigHands,
  scene,
  setupStateRef,
  targetSolverLandmarks,
  trackingDebugRef,
  vrm,
  worldLandmarks,
}: {
  applyDemoFallbackPose: (factor?: number) => unknown;
  avatarBaseY: MovementAvatarPreBodyInput["avatarBaseY"];
  avatarName: MovementAvatarReadyFrameApplicationInput["avatarName"];
  avatarRole: MovementAvatarReadyFrameApplicationInput["avatarRole"];
  avatarRoot: MovementAvatarReadyFrameApplicationInput["avatarRoot"] & MovementAvatarPreBodyInput["avatarRoot"];
  baseBonePositionRef: MovementAvatarReadyFrameApplicationInput["baseBonePositionRef"];
  baseHipsPositionRef: MovementAvatarReadyFrameApplicationInput["baseHipsPositionRef"];
  blendshapes: MovementAvatarReadyFrameApplicationInput["blendshapes"];
  boneEaseOptions: MovementAvatarReadyFrameApplicationInput["boneEaseOptions"];
  displayPreparedInput: Pick<MovementAvatarPreBodyInput, "displayWorldPose">["displayWorldPose"];
  exerciseTransitionStateRef: MovementAvatarPreBodyInput["exerciseTransitionStateRef"];
  faceLandmarks: MovementAvatarPreBodyInput["faceLandmarks"];
  frameDeltaSeconds?: number;
  fallbackPoseSlerp?: number;
  forceStandby: MovementAvatarPreBodyInput["forceStandby"];
  imageLandmarks: MovementAvatarPreBodyInput["poseLandmarks"] &
    MovementAvatarReadyFrameApplicationInput["imageLandmarks"];
  instructorLowerBodyStabilityRef: MovementAvatarPreBodyInput["instructorLowerBodyStabilityRef"];
  isPlayer: boolean;
  lastGoodQuaternionRef: MovementAvatarReadyFrameApplicationInput["lastGoodQuaternionRef"];
  liveRootMotionHistory: MovementAvatarPreBodyInput["history"];
  lookupBone: MovementAvatarReadyFrameApplicationInput["lookupBone"] &
    MovementAvatarFrameScenePreparationInput["lookupBone"];
  manualCalibration: MovementCalibration | null;
  mirrorPlayerDisplay: MovementAvatarPreBodyInput["mirrorPlayerDisplay"];
  motionFrame: MovementMotionFrame | null;
  playerLegRaiseHoldRef: MovementAvatarPreBodyInput["playerLegRaiseHoldRef"];
  playerLowerBodyStabilityRef: MovementAvatarPreBodyInput["playerLowerBodyStabilityRef"];
  plantedFootLockRef: MovementAvatarReadyFrameApplicationInput["plantedFootLockRef"];
  positionOffset: MovementAvatarPreBodyInput["positionOffset"];
  profile: MovementAvatarReadyFrameApplicationInput["profile"] & MovementAvatarPreBodyInput["profile"];
  profileName: MovementAvatarReadyFrameApplicationInput["profileName"];
  providedRetargetSourceModel: MovementRetargetSourceModel | null;
  recordedRootMotionFrame: MovementRootMotionFrame | null;
  retargetAvatarRestRef: MovementAvatarReadyFrameApplicationInput["retargetAvatarRestRef"];
  retargetSourceModelRef: MovementAvatarMutableRef<MovementRetargetSourceModel | null>;
  rigMeasurements: MovementAvatarPreBodyInput["rigMeasurements"];
  rootCommandYRef?: MovementAvatarPreBodyInput["rootCommandYRef"];
  rigHands: MovementAvatarReadyFrameApplicationInput["rigHands"];
  scene: MovementAvatarFrameScenePreparationInput["scene"] &
    MovementAvatarReadyFrameApplicationInput["scene"];
  setupStateRef: MovementAvatarPreBodyInput["setupStateRef"];
  targetSolverLandmarks: MovementAvatarReadyFrameApplicationInput["targetSolverLandmarks"];
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
  vrm: VRM;
  worldLandmarks: MovementAvatarFrameWorldInput["worldLandmarks"];
}): MovementAvatarReadyFrameOrchestrationRuntime {
  const frameWorldRuntime = resolveMovementAvatarFrameWorldRuntime({ worldLandmarks });
  const scenePreparationRuntime = resolveMovementAvatarFrameScenePreparationRuntime({
    avatarRole,
    lookupBone,
    scene,
  });
  const preBodyFrameOrchestrationRuntime = applyMovementAvatarPreBodyFrameOrchestrationRuntime({
    avatarBaseY,
    avatarRole,
    avatarRoot,
    displayWorldPose: displayPreparedInput,
    exerciseTransitionStateRef,
    faceLandmarks,
    forceStandby,
    hands: rigHands ?? undefined,
    history: liveRootMotionHistory,
    instructorLowerBodyStabilityRef,
    isLivePlayer: isPlayer,
    manualCalibration,
    mirrorPlayerDisplay,
    motionFrame,
    playerLegRaiseHoldRef,
    playerLowerBodyStabilityRef,
    poseLandmarks: imageLandmarks,
    positionOffset,
    profile,
    providedRetargetSourceModel,
    recordedRootMotionFrame,
    retargetSourceModelRef,
    rigMeasurements,
    rootCommandYRef,
    setupStateRef,
    trackingDebugRef,
    worldPoseForLocomotion: frameWorldRuntime.worldPoseForLocomotion,
    worldPoseForSetup: frameWorldRuntime.worldPoseForSetup,
  });

  if (preBodyFrameOrchestrationRuntime.status === "fallback-demo-pose") {
    applyDemoFallbackPose(fallbackPoseSlerp);
    return {
      frameWorldRuntime,
      preBodyFrameOrchestrationRuntime,
      scenePreparationRuntime,
      status: "fallback-demo-pose",
    };
  }

  const {
    bodyFrameOrchestrationRuntime,
    completionFrameOrchestrationRuntime,
  } = applyMovementAvatarReadyFrameApplicationRuntime({
    avatarName,
    avatarRole,
    avatarRoot,
    baseBonePositionRef,
    baseHipsPositionRef,
    blendshapes,
    boneEaseOptions,
    faceLandmarks,
    frameDeltaSeconds,
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
    rigMeasurements,
    rigHands,
    scene,
    scenePreparationRuntime,
    sourceWorldLandmarks: displayPreparedInput,
    targetSolverLandmarks,
    trackingDebugRef,
    vrm,
  });

  return {
    bodyFrameOrchestrationRuntime,
    completionFrameOrchestrationRuntime,
    frameWorldRuntime,
    preBodyFrameOrchestrationRuntime,
    scenePreparationRuntime,
    status: "ready",
  };
}
