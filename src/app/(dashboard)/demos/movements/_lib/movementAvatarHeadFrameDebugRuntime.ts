import type { MovementAvatarHeadFrameDebugInput } from "./movementAvatarHeadFrameRuntime";

export type MovementAvatarHeadFrameDebugRuntimeInput = {
  activeCalibrationQuality?: MovementAvatarHeadFrameDebugInput["activeCalibrationQuality"];
  activeSpineDrive: MovementAvatarHeadFrameDebugInput["activeSpineDrive"];
  armTargets: MovementAvatarHeadFrameDebugInput["armTargets"];
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
  leftArmTrackingReady: boolean;
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
  rightArmTrackingReady: boolean;
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
  armTargets,
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
  leftArmTrackingReady,
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
  rightArmTrackingReady,
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
    armTargets,
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
    leftArmTrackingReady,
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
    rightArmTrackingReady,
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
