import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS,
} from "./movementAvatarRestPose";
import {
  buildMovementAvatarRetargetDebug,
  formatMovementAvatarRetargetDebugLabel,
  resolveMovementAvatarTrackingFallbackLabels,
  type MovementAvatarRetargetDebugLabelInput,
  type MovementAvatarTrackingFallbackLabelsDecision,
} from "./movementAvatarPipeline";
import { buildMovementAvatarSpineRuntimeDebugTelemetry } from "./movementAvatarSpineApplication";
import { buildMovementAvatarHeadRuntimeDebugTelemetry } from "./movementAvatarHeadRuntime";
import { buildMovementAvatarFootLockRuntimeDebugTelemetry } from "./movementAvatarFootLockRuntime";
import { buildMovementAvatarLegRaiseRuntimeDebugInput } from "./movementAvatarRuntimeState";
import type {
  MovementRetargetFrame,
  MovementRetargetSourceModel,
} from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

export type MovementAvatarTrackingFallbackContext = {
  exercisePose: string;
  exerciseTransition: string;
  motionFrameInput: string;
  orientation: string;
  support: string;
  supportConstraint: string;
  supportContact: string;
  supportIntent: string;
  supportPresentation: string;
  retarget: string;
};

type MovementAvatarTrackingFallbackLabelInput = Parameters<typeof resolveMovementAvatarTrackingFallbackLabels>[0];
type MovementAvatarTrackingDebugStateInput = Parameters<typeof buildMovementAvatarTrackingDebugState>[0];
type MovementAvatarLegRaiseDebugInput = Parameters<typeof buildMovementAvatarLegRaiseRuntimeDebugInput>[0];

export type MovementAvatarFrameTrackingDebugInput = {
  activeCalibrationQuality?: number;
  activeSpineDrive: Parameters<typeof buildMovementAvatarSpineRuntimeDebugTelemetry>[0];
  appliedHead: MovementAvatarTrackingDebugStateInput["appliedHead"];
  armTargets: MovementAvatarTrackingFallbackLabelInput["armTargets"];
  autoCalibrationKind: MovementAvatarTrackingFallbackLabelInput["autoCalibrationKind"];
  avatarHead: Parameters<typeof buildMovementAvatarHeadRuntimeDebugTelemetry>[0];
  avatarRole: MovementAvatarTrackingFallbackLabelInput["avatarRole"];
  bodyConfidence: MovementAvatarTrackingFallbackLabelInput["bodyConfidence"];
  exercisePose: MovementAvatarTrackingDebugStateInput["exercisePose"];
  exerciseTransition: MovementAvatarTrackingDebugStateInput["exerciseTransition"];
  feetOwner: MovementAvatarTrackingFallbackLabelInput["feetOwner"];
  footLock: Parameters<typeof buildMovementAvatarFootLockRuntimeDebugTelemetry>[0];
  hasActiveCalibration: MovementAvatarTrackingFallbackLabelInput["hasActiveCalibration"];
  hasManualCalibration: MovementAvatarTrackingFallbackLabelInput["hasManualCalibration"];
  headMotionIntent: MovementAvatarTrackingFallbackLabelInput["headMotionIntent"];
  headOwner: MovementAvatarTrackingFallbackLabelInput["headOwner"];
  leftArmTrackingReady: MovementAvatarTrackingFallbackLabelInput["leftArmTrackingReady"];
  leftFootSource: MovementAvatarTrackingFallbackLabelInput["leftFootSource"];
  leftKneeSource: MovementAvatarTrackingFallbackLabelInput["leftKneeSource"];
  legRaise: MovementAvatarLegRaiseDebugInput;
  lowerBodyIntent: MovementAvatarTrackingFallbackLabelInput["lowerBodyIntent"];
  lowerBodyOwner: MovementAvatarTrackingFallbackLabelInput["lowerBodyOwner"];
  lowerBodyTrackingReady: MovementAvatarTrackingFallbackLabelInput["lowerBodyTrackingReady"];
  motionFrameInputOwner: string;
  orientation: Parameters<typeof buildMovementAvatarTrackingFallbackContext>[0]["orientation"];
  profileName: string;
  rawHead: MovementAvatarTrackingFallbackLabelInput["rawHead"] & MovementAvatarTrackingDebugStateInput["rawHead"];
  retarget: Omit<Parameters<typeof buildMovementAvatarRuntimeRetargetDebug>[0], "footLock" | "totalLowerBody" | "totalUpperBody">;
  rightArmTrackingReady: MovementAvatarTrackingFallbackLabelInput["rightArmTrackingReady"];
  rightFootSource: MovementAvatarTrackingFallbackLabelInput["rightFootSource"];
  rightKneeSource: MovementAvatarTrackingFallbackLabelInput["rightKneeSource"];
  shouldApplyLowerBody: MovementAvatarTrackingFallbackLabelInput["shouldApplyLowerBody"];
  support: Parameters<typeof buildMovementAvatarTrackingFallbackContext>[0]["support"];
  supportConstraint: MovementAvatarTrackingDebugStateInput["supportConstraint"];
  supportContact: Parameters<typeof buildMovementAvatarTrackingFallbackContext>[0]["supportContact"];
  supportIntent: MovementAvatarTrackingDebugStateInput["supportIntent"];
  supportPresentation: Parameters<typeof buildMovementAvatarTrackingFallbackContext>[0]["supportPresentation"];
  torsoOwner: MovementAvatarTrackingFallbackLabelInput["torsoOwner"];
  updatedAt: number;
};

export function buildMovementAvatarRuntimeRetargetDebug({
  appliedLowerBody,
  appliedUpperBody,
  footLock,
  liveSquatDepth,
  plantedSquatIkDepth,
  retargetFrame,
  retargetSourceModel,
  totalLowerBody,
  totalUpperBody,
  visualRootDrop,
}: {
  appliedLowerBody: number;
  appliedUpperBody: number;
  footLock: {
    correction: number;
    drift: number;
    strength: number;
  };
  liveSquatDepth: number;
  plantedSquatIkDepth: number;
  retargetFrame: MovementRetargetFrame;
  retargetSourceModel: MovementRetargetSourceModel | null;
  totalLowerBody: number;
  totalUpperBody: number;
  visualRootDrop: number;
}): NonNullable<MovementTrackingDebugState["retarget"]> {
  return {
    ...buildMovementAvatarRetargetDebug({
      appliedLowerBody,
      appliedUpperBody,
      plantedSquatIkDepth,
      retargetFrame,
      retargetSourceModel,
      visualRootDrop,
    }),
    footLockCorrection: footLock.correction,
    footLockDrift: footLock.drift,
    footLockStrength: footLock.strength,
    squatDepth: liveSquatDepth,
    totalLowerBody,
    totalUpperBody,
  };
}

export function buildMovementAvatarTrackingFallbackContext({
  exercisePose,
  exerciseTransition,
  motionFrameInput,
  orientation,
  retarget,
  support,
  supportConstraint,
  supportContact,
  supportIntent,
  supportPresentation,
}: {
  exercisePose: {
    label: string;
    status: string;
  };
  exerciseTransition: {
    label: string;
  };
  motionFrameInput: string;
  orientation: {
    orientation: string;
    status: string;
  };
  retarget: MovementAvatarRetargetDebugLabelInput;
  support: {
    supportLabel: string;
  };
  supportConstraint: {
    owner: string;
    status: string;
  };
  supportContact: {
    anchorCount: number;
    correction: number;
    owner: string;
  };
  supportIntent: {
    label: string;
    status: string;
  };
  supportPresentation: {
    owner: string;
  };
}): MovementAvatarTrackingFallbackContext {
  return {
    orientation: `${orientation.orientation} ${orientation.status}`,
    support: support.supportLabel,
    supportContact: `${supportContact.owner} anchors ${supportContact.anchorCount} corr ${supportContact.correction.toFixed(3)}`,
    supportConstraint: `${supportConstraint.owner} ${supportConstraint.status}`,
    supportIntent: `${supportIntent.label} ${supportIntent.status}`,
    supportPresentation: supportPresentation.owner,
    exercisePose: `${exercisePose.label} ${exercisePose.status}`,
    exerciseTransition: exerciseTransition.label,
    motionFrameInput,
    retarget: formatMovementAvatarRetargetDebugLabel(retarget),
  };
}

export function buildMovementAvatarTrackingDebugState({
  appliedHead,
  avatarHead,
  avatarLegRaise,
  bodyConfidence,
  calibrationQuality,
  exercisePose,
  exerciseTransition,
  fallbackContext,
  fallbackLabels,
  profileName,
  rawHead,
  retargetDebug,
  spineDrive,
  supportConstraint,
  supportIntent,
  updatedAt,
}: {
  appliedHead: MovementTrackingDebugState["headApplied"];
  avatarHead: {
    appliedLocalPitch: number;
    bonePitch: number;
    boneYaw: number;
    trackingPitch: number;
    trackingYaw: number;
  };
  avatarLegRaise: {
    appliedDepth: number;
    expiresAt: number;
    holdActive: boolean;
    now: number;
    rawLeftDepth: number;
    rawRightDepth: number;
    side: "left" | "right" | null;
  };
  bodyConfidence: MovementTrackingDebugState["bodyConfidence"];
  calibrationQuality?: MovementTrackingDebugState["calibrationQuality"];
  exercisePose: NonNullable<MovementTrackingDebugState["exercisePose"]>;
  exerciseTransition: NonNullable<MovementTrackingDebugState["exerciseTransition"]>;
  fallbackContext: MovementAvatarTrackingFallbackContext;
  fallbackLabels: MovementAvatarTrackingFallbackLabelsDecision;
  profileName: string;
  rawHead: MovementTrackingDebugState["headRaw"];
  retargetDebug: NonNullable<MovementTrackingDebugState["retarget"]>;
  spineDrive: NonNullable<MovementTrackingDebugState["spineDrive"]>;
  supportConstraint: NonNullable<MovementTrackingDebugState["supportConstraint"]>;
  supportIntent: NonNullable<MovementTrackingDebugState["supportIntent"]>;
  updatedAt: number;
}): MovementTrackingDebugState {
  return {
    updatedAt,
    headRaw: rawHead,
    headApplied: appliedHead,
    avatarHead: {
      appliedLocalPitch: Number(avatarHead.appliedLocalPitch.toFixed(4)),
      boneYaw: Number(avatarHead.boneYaw.toFixed(4)),
      bonePitch: Number(avatarHead.bonePitch.toFixed(4)),
      trackingPitch: Number(avatarHead.trackingPitch.toFixed(4)),
      trackingYaw: Number(avatarHead.trackingYaw.toFixed(4)),
    },
    avatarLegRaise: {
      appliedDepth: Number(avatarLegRaise.appliedDepth.toFixed(4)),
      expiresInMs: Number(Math.max(0, avatarLegRaise.expiresAt - avatarLegRaise.now).toFixed(0)),
      holdActive: avatarLegRaise.holdActive,
      rawLeftDepth: Number(avatarLegRaise.rawLeftDepth.toFixed(4)),
      rawRightDepth: Number(avatarLegRaise.rawRightDepth.toFixed(4)),
      side: avatarLegRaise.side,
    },
    bodyConfidence,
    exercisePose,
    exerciseTransition,
    supportConstraint,
    supportIntent,
    spineDrive,
    fallbacks: {
      baseline: fallbackLabels.baseline,
      head: fallbackLabels.head,
      headMotion: fallbackLabels.headMotion,
      spine: fallbackLabels.spine,
      armDepth: fallbackLabels.armDepth,
      rightArm: fallbackLabels.rightArm,
      leftArm: fallbackLabels.leftArm,
      rightKnee: fallbackLabels.rightKnee,
      leftKnee: fallbackLabels.leftKnee,
      rightFoot: fallbackLabels.rightFoot,
      leftFoot: fallbackLabels.leftFoot,
      floor: fallbackLabels.floor,
      orientation: fallbackContext.orientation,
      support: fallbackContext.support,
      supportContact: fallbackContext.supportContact,
      supportConstraint: fallbackContext.supportConstraint,
      supportIntent: fallbackContext.supportIntent,
      supportPresentation: fallbackContext.supportPresentation,
      exercisePose: fallbackContext.exercisePose,
      exerciseTransition: fallbackContext.exerciseTransition,
      motionFrameInput: fallbackContext.motionFrameInput,
      lowerBody: fallbackLabels.lowerBody,
      owners: fallbackLabels.owners,
      retarget: fallbackContext.retarget,
    },
    retarget: retargetDebug,
    profileName,
    calibrationQuality,
  };
}

export function buildMovementAvatarFrameTrackingDebugState({
  activeCalibrationQuality,
  activeSpineDrive,
  appliedHead,
  armTargets,
  autoCalibrationKind,
  avatarHead,
  avatarRole,
  bodyConfidence,
  exercisePose,
  exerciseTransition,
  feetOwner,
  footLock,
  hasActiveCalibration,
  hasManualCalibration,
  headMotionIntent,
  headOwner,
  leftArmTrackingReady,
  leftFootSource,
  leftKneeSource,
  legRaise,
  lowerBodyIntent,
  lowerBodyOwner,
  lowerBodyTrackingReady,
  motionFrameInputOwner,
  orientation,
  profileName,
  rawHead,
  retarget,
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
  updatedAt,
}: MovementAvatarFrameTrackingDebugInput): MovementTrackingDebugState {
  const fallbackLabels = resolveMovementAvatarTrackingFallbackLabels({
    activeSpineOwner: activeSpineDrive.owner,
    armTargets,
    autoCalibrationKind,
    avatarRole,
    bodyConfidence,
    feetOwner,
    hasActiveCalibration,
    hasManualCalibration,
    headMotionIntent,
    headOwner,
    leftArmTrackingReady,
    leftFootSource,
    leftKneeSource,
    lowerBodyIntent,
    lowerBodyOwner,
    lowerBodyTrackingReady,
    rawHead,
    rightArmTrackingReady,
    rightFootSource,
    rightKneeSource,
    shouldApplyLowerBody,
    torsoOwner,
  });
  const footLockDebug = buildMovementAvatarFootLockRuntimeDebugTelemetry(footLock);
  const retargetDebug = buildMovementAvatarRuntimeRetargetDebug({
    ...retarget,
    footLock: footLockDebug,
    totalLowerBody: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS.length,
    totalUpperBody: MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS.length,
  });

  return buildMovementAvatarTrackingDebugState({
    updatedAt,
    rawHead,
    appliedHead,
    avatarHead: buildMovementAvatarHeadRuntimeDebugTelemetry(avatarHead),
    avatarLegRaise: buildMovementAvatarLegRaiseRuntimeDebugInput(legRaise),
    bodyConfidence,
    exercisePose,
    exerciseTransition,
    supportConstraint,
    supportIntent,
    spineDrive: buildMovementAvatarSpineRuntimeDebugTelemetry(activeSpineDrive),
    fallbackLabels,
    fallbackContext: buildMovementAvatarTrackingFallbackContext({
      exercisePose,
      exerciseTransition,
      motionFrameInput: motionFrameInputOwner,
      orientation,
      retarget: retargetDebug,
      support,
      supportConstraint,
      supportContact,
      supportIntent,
      supportPresentation,
    }),
    retargetDebug,
    profileName,
    calibrationQuality: activeCalibrationQuality,
  });
}
