import type * as THREE from "three";
import type { MovementAvatarFrameTargetRuntimeDecision } from "./movementAvatarFrameTargetRuntime";
import {
  resolveMovementAvatarHeadFrameDebugRuntime,
  type MovementAvatarHeadFrameDebugRuntimeInput,
} from "./movementAvatarHeadFrameDebugRuntime";
import {
  applyMovementAvatarHeadFrameRuntime,
  type MovementAvatarHeadFrameRuntimeResult,
} from "./movementAvatarHeadFrameRuntime";
import {
  applyMovementAvatarHeadFrameRefsRuntime,
  type MovementAvatarHeadFrameRefsRuntimeResult,
} from "./movementAvatarHeadFrameRefsRuntime";
import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import type { MovementAvatarPlayerLegRaiseHoldState } from "./movementAvatarPipeline";
import type {
  MovementAvatarTrackingProfile,
  MovementCalibration,
  MovementTrackingDebugState,
  TrackingLandmark,
} from "./movementTrackingCalibration";
import type { MovementRetargetSourceModel } from "./movementRetargeting";

type MovementAvatarMutableRef<T> = {
  current: T;
};

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
      mirrorHeadForDisplay: motionFrameInputOwner !== "movement-motion-frame",
      neckSlerp,
      poseLandmarks,
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
