import * as THREE from "three";
import {
  buildMovementAvatarFrameTrackingDebugState,
  type MovementAvatarFrameTrackingDebugInput,
} from "./movementAvatarDebugTelemetry";
import type { MovementAvatarFrameTargetRuntimeDecision } from "./movementAvatarBodyFrame";
import {
  applyMovementAvatarHeadApplicationToVrmBones,
  type MovementAvatarHeadApplicationResult,
} from "./movementAvatarHeadApplication";
import {
  resolveMovementAvatarHeadTarget,
  type MovementAvatarHeadTargetDecision,
} from "./movementAvatarHeadTarget";
import type {
  MovementAvatarPipelineDecision,
  MovementAvatarPlayerLegRaiseHoldState,
} from "./movementAvatarPipeline";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type {
  MovementAvatarTrackingProfile,
  MovementCalibration,
  MovementHeadMotionIntent,
  MovementTrackingDebugState,
  TrackingLandmark,
} from "./movementTrackingCalibration";

type MovementAvatarMutableRef<T> = {
  current: T;
};

// --- movementAvatarHeadRuntime ---

export type MovementAvatarHeadRuntimeApplication =
  | {
    applied: false;
    reason: "missing-head-bone" | "missing-head-landmarks";
  }
  | {
    applied: true;
    headApplication: MovementAvatarHeadApplicationResult;
    headNode: THREE.Object3D;
    headTarget: MovementAvatarHeadTargetDecision;
  };

export type MovementAvatarHeadRuntimeDebugTelemetry = {
  appliedLocalPitch: number;
  appliedLocalRoll: number;
  appliedWorldPitch: number;
  appliedWorldRoll: number;
  appliedWorldYaw: number;
  bonePitch: number;
  boneRoll: number;
  boneYaw: number;
  trackingPitch: number;
  trackingRoll: number;
  trackingYaw: number;
};

export function buildMovementAvatarHeadRuntimeDebugTelemetry({
  headNode,
  headTarget,
}: {
  headNode: THREE.Object3D;
  headTarget: MovementAvatarHeadTargetDecision;
}): MovementAvatarHeadRuntimeDebugTelemetry {
  const { rawHead } = headTarget.rawHeadDecision;
  const worldQuaternion = new THREE.Quaternion();
  headNode.getWorldQuaternion(worldQuaternion);
  const worldRotation = new THREE.Euler().setFromQuaternion(worldQuaternion, "YXZ");

  return {
    appliedLocalPitch: headNode.rotation.x,
    appliedLocalRoll: headNode.rotation.z,
    appliedWorldPitch: worldRotation.x,
    appliedWorldRoll: worldRotation.z,
    appliedWorldYaw: worldRotation.y,
    boneYaw: headTarget.headDecision.headYaw,
    bonePitch: headTarget.headBonePitch,
    boneRoll: headTarget.headDecision.headRoll,
    trackingPitch: headTarget.headDecision.headPitch,
    trackingRoll: rawHead.roll,
    trackingYaw: rawHead.yaw,
  };
}

export function applyMovementAvatarHeadRuntimeToVrmBones({
  avatarRole,
  avatarRootYaw,
  baseHeadPosition,
  calibration,
  faceLandmarks,
  headMotionIntent,
  lookupBone,
  mirrorHeadForDisplay,
  neckSlerp,
  poseLandmarks,
  preparedHeadTarget,
  profile,
  shouldApplyLowerBody,
  shouldApplySpine,
}: {
  avatarRole: "instructor" | "player";
  avatarRootYaw: number;
  baseHeadPosition: THREE.Vector3 | null | undefined;
  calibration: MovementCalibration | null;
  faceLandmarks?: TrackingLandmark[] | null;
  headMotionIntent?: MovementHeadMotionIntent;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  mirrorHeadForDisplay?: boolean;
  neckSlerp: number;
  poseLandmarks: TrackingLandmark[];
  preparedHeadTarget?: MovementAvatarHeadTargetDecision | null;
  profile?: MovementAvatarTrackingProfile;
  shouldApplyLowerBody: boolean;
  shouldApplySpine: boolean;
}): MovementAvatarHeadRuntimeApplication {
  const leftEar = poseLandmarks[7];
  const rightEar = poseLandmarks[8];
  const nose = poseLandmarks[0];
  if (!leftEar || !rightEar || !nose) {
    return {
      applied: false,
      reason: "missing-head-landmarks",
    };
  }

  const headNode = lookupBone("head");
  if (!headNode) {
    return {
      applied: false,
      reason: "missing-head-bone",
    };
  }

  const hasCurrentFaceHeadLandmarks = Boolean(
    faceLandmarks?.[1] && faceLandmarks[33] && faceLandmarks[263],
  );
  const headTarget = preparedHeadTarget && !hasCurrentFaceHeadLandmarks
    ? {
      ...preparedHeadTarget,
      headWorldYaw: avatarRootYaw + preparedHeadTarget.headDecision.headYaw,
    }
    : resolveMovementAvatarHeadTarget({
      avatarRole,
      avatarRootYaw,
      calibration,
      faceLandmarks,
      headMotionIntent,
      mirrorHeadForDisplay,
      poseLandmarks,
      profile,
      shouldApplyLowerBody,
      shouldApplySpine,
    });
  const headApplication = applyMovementAvatarHeadApplicationToVrmBones({
    baseHeadPosition,
    headApplicationPose: headTarget.applicationPose,
    headBonePitch: headTarget.headBonePitch,
    headPositionSlerp: headTarget.applyOptions.headPositionSlerp,
    headRoll: headTarget.headDecision.headRoll,
    headSlerp: headTarget.applyOptions.headSlerp,
    headWorldYaw: headTarget.headWorldYaw,
    lookupBone,
    neckSlerp,
    shouldApplyHeadMotion: headTarget.headDecision.shouldApplyHeadMotion,
    upperChestCompensationSlerp: headTarget.applyOptions.upperChestCompensationSlerp,
  });

  return {
    applied: true,
    headApplication,
    headNode,
    headTarget,
  };
}

// --- movementAvatarHeadFrameRuntime ---

export type MovementAvatarHeadFrameDebugInput = Omit<
  MovementAvatarFrameTrackingDebugInput,
  "appliedHead" | "avatarHead" | "headMotionIntent" | "headOwner" | "rawHead" | "updatedAt"
>;

export type MovementAvatarHeadFrameRuntimeResult = {
  headRuntimeApplication: MovementAvatarHeadRuntimeApplication;
  nextBaseHeadPosition: THREE.Vector3 | null;
  trackingDebugState: MovementTrackingDebugState | null;
};

export function applyMovementAvatarHeadFrameRuntime({
  debugInput,
  debugUpdatedAt,
  headInput,
}: {
  debugInput?: MovementAvatarHeadFrameDebugInput | null;
  debugUpdatedAt: number;
  headInput: Parameters<typeof applyMovementAvatarHeadRuntimeToVrmBones>[0];
}): MovementAvatarHeadFrameRuntimeResult {
  const headRuntimeApplication = applyMovementAvatarHeadRuntimeToVrmBones(headInput);
  if (!headRuntimeApplication.applied) {
    return {
      headRuntimeApplication,
      nextBaseHeadPosition: null,
      trackingDebugState: null,
    };
  }

  const { headApplication, headNode, headTarget } = headRuntimeApplication;
  const { appliedHead, headOwner } = headTarget.headDecision;
  const { headMotionIntent } = headTarget;
  const { rawHead } = headTarget.rawHeadDecision;

  return {
    headRuntimeApplication,
    nextBaseHeadPosition: headApplication.baseHeadPosition ?? null,
    trackingDebugState: debugInput
      ? buildMovementAvatarFrameTrackingDebugState({
          ...debugInput,
          updatedAt: debugUpdatedAt,
          appliedHead,
          avatarHead: { headNode, headTarget },
          headMotionIntent,
          headOwner,
          rawHead,
        })
      : null,
  };
}

// --- movementAvatarHeadFrameRefsRuntime ---

export type MovementAvatarHeadFrameRefsRuntimeResult = {
  appliedBaseHeadPosition: boolean;
  appliedTrackingDebugState: boolean;
};

export function applyMovementAvatarHeadFrameRefsRuntime({
  baseBonePositionRef,
  headFrameRuntime,
  trackingDebugRef,
}: {
  baseBonePositionRef: MovementAvatarMutableRef<Record<string, THREE.Vector3>>;
  headFrameRuntime: MovementAvatarHeadFrameRuntimeResult;
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
}): MovementAvatarHeadFrameRefsRuntimeResult {
  let appliedBaseHeadPosition = false;
  let appliedTrackingDebugState = false;

  if (headFrameRuntime.nextBaseHeadPosition) {
    baseBonePositionRef.current.head = headFrameRuntime.nextBaseHeadPosition;
    appliedBaseHeadPosition = true;
  }

  if (trackingDebugRef && headFrameRuntime.trackingDebugState) {
    trackingDebugRef.current = trackingDebugRef.current?.avatarRoot
      ? {
          ...headFrameRuntime.trackingDebugState,
          avatarRoot: trackingDebugRef.current.avatarRoot,
        }
      : headFrameRuntime.trackingDebugState;
    appliedTrackingDebugState = true;
  }

  return {
    appliedBaseHeadPosition,
    appliedTrackingDebugState,
  };
}

// --- movementAvatarHeadFrameDebugRuntime ---

export type MovementAvatarHeadFrameDebugRuntimeInput = {
  activeCalibrationQuality?: MovementAvatarHeadFrameDebugInput["activeCalibrationQuality"];
  activeSpineDrive: MovementAvatarHeadFrameDebugInput["activeSpineDrive"];
  armApplicationModes: MovementAvatarHeadFrameDebugInput["armApplicationModes"];
  autoCalibrationKind: MovementAvatarHeadFrameDebugInput["autoCalibrationKind"];
  avatarRole: MovementAvatarHeadFrameDebugInput["avatarRole"];
  bodyConfidence: MovementAvatarHeadFrameDebugInput["bodyConfidence"];
  exercisePose: MovementAvatarHeadFrameDebugInput["exercisePose"];
  exerciseTransition: MovementAvatarHeadFrameDebugInput["exerciseTransition"];
  footLockCorrection: number;
  footLockDrift: number;
  footLockState: MovementAvatarHeadFrameDebugInput["footLock"]["state"];
  footOwner: MovementAvatarHeadFrameDebugInput["feetOwner"];
  hasActiveCalibration: boolean;
  hasManualCalibration: boolean;
  isEnabled: boolean;
  leftFootSource: MovementAvatarHeadFrameDebugInput["leftFootSource"];
  leftKneeSource: MovementAvatarHeadFrameDebugInput["leftKneeSource"];
  legRaiseHoldDecision: MovementAvatarHeadFrameDebugInput["legRaise"]["holdDecision"];
  liveSquatDepth: number;
  lowerBodyDrive: MovementAvatarHeadFrameDebugInput["legRaise"]["lowerBodyDrive"];
  lowerBodyIntent: MovementAvatarHeadFrameDebugInput["lowerBodyIntent"];
  lowerBodyOwner: MovementAvatarHeadFrameDebugInput["lowerBodyOwner"];
  lowerBodyTrackingReady: boolean;
  motionFrameInputOwner: string;
  now: number;
  orientation: MovementAvatarHeadFrameDebugInput["orientation"];
  plantedSquatIkDepth: number;
  playerLegRaiseHoldState: MovementAvatarHeadFrameDebugInput["legRaise"]["playerLegRaiseHoldState"];
  profileName: string;
  retargetAppliedLowerBody: number;
  retargetAppliedUpperBody: number;
  retargetFrame: MovementAvatarHeadFrameDebugInput["retarget"]["retargetFrame"];
  retargetSourceModel: MovementAvatarHeadFrameDebugInput["retarget"]["retargetSourceModel"];
  rightFootSource: MovementAvatarHeadFrameDebugInput["rightFootSource"];
  rightKneeSource: MovementAvatarHeadFrameDebugInput["rightKneeSource"];
  shouldApplyLowerBody: boolean;
  support: MovementAvatarHeadFrameDebugInput["support"];
  supportConstraint: MovementAvatarHeadFrameDebugInput["supportConstraint"];
  supportContact: MovementAvatarHeadFrameDebugInput["supportContact"];
  supportIntent: MovementAvatarHeadFrameDebugInput["supportIntent"];
  supportPresentation: MovementAvatarHeadFrameDebugInput["supportPresentation"];
  torsoOwner: MovementAvatarHeadFrameDebugInput["torsoOwner"];
  visualRootDrop: number;
};

export function resolveMovementAvatarHeadFrameDebugRuntime({
  activeCalibrationQuality,
  activeSpineDrive,
  armApplicationModes,
  autoCalibrationKind,
  avatarRole,
  bodyConfidence,
  exercisePose,
  exerciseTransition,
  footLockCorrection,
  footLockDrift,
  footLockState,
  footOwner,
  hasActiveCalibration,
  hasManualCalibration,
  isEnabled,
  leftFootSource,
  leftKneeSource,
  legRaiseHoldDecision,
  liveSquatDepth,
  lowerBodyDrive,
  lowerBodyIntent,
  lowerBodyOwner,
  lowerBodyTrackingReady,
  motionFrameInputOwner,
  now,
  orientation,
  plantedSquatIkDepth,
  playerLegRaiseHoldState,
  profileName,
  retargetAppliedLowerBody,
  retargetAppliedUpperBody,
  retargetFrame,
  retargetSourceModel,
  rightFootSource,
  rightKneeSource,
  shouldApplyLowerBody,
  support,
  supportConstraint,
  supportContact,
  supportIntent,
  supportPresentation,
  torsoOwner,
  visualRootDrop,
}: MovementAvatarHeadFrameDebugRuntimeInput): MovementAvatarHeadFrameDebugInput | null {
  if (!isEnabled) return null;

  return {
    activeCalibrationQuality,
    activeSpineDrive,
    armApplicationModes,
    autoCalibrationKind,
    avatarRole,
    bodyConfidence,
    exercisePose,
    exerciseTransition,
    feetOwner: footOwner,
    footLock: {
      correction: footLockCorrection,
      drift: footLockDrift,
      state: footLockState,
    },
    hasActiveCalibration,
    hasManualCalibration,
    leftFootSource,
    leftKneeSource,
    legRaise: {
      holdDecision: legRaiseHoldDecision,
      lowerBodyDrive,
      lowerBodyIntent,
      now,
      playerLegRaiseHoldState,
    },
    lowerBodyIntent,
    lowerBodyOwner,
    lowerBodyTrackingReady,
    motionFrameInputOwner,
    orientation,
    profileName,
    retarget: {
      appliedLowerBody: retargetAppliedLowerBody,
      appliedUpperBody: retargetAppliedUpperBody,
      liveSquatDepth,
      plantedSquatIkDepth,
      retargetFrame,
      retargetSourceModel,
      visualRootDrop,
    },
    rightFootSource,
    rightKneeSource,
    shouldApplyLowerBody,
    support,
    supportConstraint,
    supportContact,
    supportIntent,
    supportPresentation,
    torsoOwner,
  };
}

// --- movementAvatarHeadFrameOrchestrationRuntime ---

type MovementAvatarHeadRuntimeInput = Parameters<typeof applyMovementAvatarHeadFrameRuntime>[0]["headInput"];

export type MovementAvatarHeadFrameOrchestrationRuntimeResult = {
  headFrameRefsRuntime: MovementAvatarHeadFrameRefsRuntimeResult;
  headFrameRuntime: MovementAvatarHeadFrameRuntimeResult;
};

export function applyMovementAvatarHeadFrameOrchestrationRuntime({
  activeCalibration,
  armApplicationModes,
  autoCalibrationKind,
  avatarDecision,
  avatarRole,
  avatarRootYaw,
  baseBonePositionRef,
  debugUpdatedAt,
  exerciseTransition,
  faceLandmarks,
  frameTargetRuntime,
  footLockCorrection,
  footLockDrift,
  footLockState,
  footOwner,
  legRaiseHoldDecision,
  liveSquatDepth,
  lookupBone,
  lowerBodyDrive,
  lowerBodyOwner,
  motionFrameHeadTarget,
  motionFrameInputOwner,
  neckSlerp,
  plantedSquatIkDepth,
  playerLegRaiseHoldState,
  poseLandmarks,
  profile,
  profileName,
  retargetAppliedLowerBody,
  retargetAppliedUpperBody,
  retargetSourceModel,
  shouldApplyLowerBody,
  supportContactTelemetry,
  trackingDebugRef,
  hasManualCalibration,
  visualRootDrop,
}: {
  activeCalibration: MovementCalibration | null;
  armApplicationModes: MovementAvatarHeadFrameDebugRuntimeInput["armApplicationModes"];
  autoCalibrationKind: MovementAvatarHeadFrameDebugRuntimeInput["autoCalibrationKind"];
  avatarDecision: MovementAvatarPipelineDecision;
  avatarRole: "instructor" | "player";
  avatarRootYaw: number;
  baseBonePositionRef: MovementAvatarMutableRef<Record<string, THREE.Vector3>>;
  debugUpdatedAt: number;
  exerciseTransition: MovementAvatarHeadFrameDebugRuntimeInput["exerciseTransition"];
  faceLandmarks?: TrackingLandmark[] | null;
  frameTargetRuntime: MovementAvatarFrameTargetRuntimeDecision;
  footLockCorrection: number;
  footLockDrift: number;
  footLockState: MovementAvatarHeadFrameDebugRuntimeInput["footLockState"];
  footOwner: MovementAvatarHeadFrameDebugRuntimeInput["footOwner"];
  hasManualCalibration: boolean;
  legRaiseHoldDecision: MovementAvatarHeadFrameDebugRuntimeInput["legRaiseHoldDecision"];
  liveSquatDepth: number;
  lookupBone: MovementAvatarHeadRuntimeInput["lookupBone"];
  lowerBodyDrive: MovementAvatarHeadFrameDebugRuntimeInput["lowerBodyDrive"];
  lowerBodyOwner: MovementAvatarHeadFrameDebugRuntimeInput["lowerBodyOwner"];
  motionFrameHeadTarget?: MovementAvatarHeadTargetDecision;
  motionFrameInputOwner: MovementAvatarHeadFrameDebugRuntimeInput["motionFrameInputOwner"];
  neckSlerp: number;
  plantedSquatIkDepth: number;
  playerLegRaiseHoldState: MovementAvatarPlayerLegRaiseHoldState;
  poseLandmarks: MovementAvatarHeadRuntimeInput["poseLandmarks"];
  profile: MovementAvatarTrackingProfile;
  profileName: string;
  retargetAppliedLowerBody: number;
  retargetAppliedUpperBody: number;
  retargetSourceModel: MovementRetargetSourceModel | null;
  shouldApplyLowerBody: boolean;
  supportContactTelemetry: MovementAvatarHeadFrameDebugRuntimeInput["supportContact"];
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
  visualRootDrop: number;
}): MovementAvatarHeadFrameOrchestrationRuntimeResult {
  const { lowerBodyTargetComposition } = frameTargetRuntime;
  const { selections: lowerBodyTargetSelections } = lowerBodyTargetComposition;
  const activeSpineDrive = avatarDecision.spineDrive;
  const debugInput = resolveMovementAvatarHeadFrameDebugRuntime({
    activeCalibrationQuality: activeCalibration?.quality,
    activeSpineDrive,
    armApplicationModes,
    autoCalibrationKind,
    avatarRole,
    bodyConfidence: avatarDecision.bodyConfidence,
    exercisePose: avatarDecision.exercisePose,
    exerciseTransition,
    footLockCorrection,
    footLockDrift,
    footLockState,
    footOwner,
    hasActiveCalibration: Boolean(activeCalibration),
    hasManualCalibration,
    isEnabled: Boolean(trackingDebugRef),
    leftFootSource: lowerBodyTargetSelections.leftToe.source,
    leftKneeSource: lowerBodyTargetSelections.leftKnee.source,
    legRaiseHoldDecision,
    liveSquatDepth,
    lowerBodyDrive,
    lowerBodyIntent: avatarDecision.lowerBodyIntent,
    lowerBodyOwner,
    lowerBodyTrackingReady: avatarDecision.lowerBodyTrackingReady,
    motionFrameInputOwner,
    now: debugUpdatedAt,
    orientation: avatarDecision.bodyOrientation,
    plantedSquatIkDepth,
    playerLegRaiseHoldState,
    profileName,
    retargetAppliedLowerBody,
    retargetAppliedUpperBody,
    retargetFrame: avatarDecision.retargetFrame,
    retargetSourceModel,
    rightFootSource: lowerBodyTargetSelections.rightToe.source,
    rightKneeSource: lowerBodyTargetSelections.rightKnee.source,
    shouldApplyLowerBody,
    support: avatarDecision.bodySupport,
    supportConstraint: avatarDecision.supportConstraint,
    supportContact: supportContactTelemetry,
    supportIntent: avatarDecision.supportIntent,
    supportPresentation: avatarDecision.supportPresentation,
    torsoOwner: avatarDecision.torsoOwner,
    visualRootDrop,
  });
  const headFrameRuntime = applyMovementAvatarHeadFrameRuntime({
    debugInput,
    debugUpdatedAt,
    headInput: {
      avatarRole,
      avatarRootYaw,
      baseHeadPosition: baseBonePositionRef.current.head,
      calibration: activeCalibration,
      faceLandmarks,
      lookupBone,
      mirrorHeadForDisplay: avatarRole === "player",
      neckSlerp,
      poseLandmarks,
      preparedHeadTarget: motionFrameHeadTarget,
      profile,
      shouldApplyLowerBody,
      shouldApplySpine: activeSpineDrive.shouldApplySpine,
    },
  });
  const headFrameRefsRuntime = applyMovementAvatarHeadFrameRefsRuntime({
    baseBonePositionRef,
    headFrameRuntime,
    trackingDebugRef,
  });

  return {
    headFrameRefsRuntime,
    headFrameRuntime,
  };
}
