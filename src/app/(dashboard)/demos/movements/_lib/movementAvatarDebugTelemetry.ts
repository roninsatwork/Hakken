import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS,
  MOVEMENT_AVATAR_VISUAL_MAPPINGS,
} from "./movementAvatarRestPose";
import {
  appendMovementAvatarFootLockDebugLabel,
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
import type { MovementAvatarRootTransformApplication } from "./movementAvatarRootApplication";
import type { MovementAvatarRootTargetDecision } from "./movementAvatarRootTarget";
import {
  resolveMovementAvatarRetargetSegmentWorldDirection,
} from "./movementAvatarSegmentApplication";
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

export type MovementAvatarRetargetDebugRegistry = Record<
  "instructor" | "player",
  NonNullable<MovementTrackingDebugState["retarget"]> & {
    avatarName: string;
    frameUpdatedAt: number;
  }
>;

export type MovementAvatarRetargetDebugRegistryWindow = {
  __sonaeMovementRetargetDebug?: Partial<MovementAvatarRetargetDebugRegistry>;
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

function compactVector(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4)),
  };
}

export function buildMovementAvatarVisualTelemetry({
  retargetFrame,
  vrm,
  zScale,
}: {
  retargetFrame: MovementRetargetFrame;
  vrm: VRM;
  zScale: number;
}): MovementTrackingDebugState["avatarVisual"] {
  vrm.scene.updateMatrixWorld(true);

  const lowerBodySourceErrors: number[] = [];
  const upperBodySourceErrors: number[] = [];
  const segments = MOVEMENT_AVATAR_VISUAL_MAPPINGS.reduce<
    NonNullable<MovementTrackingDebugState["avatarVisual"]>["segments"]
  >((telemetry, mapping) => {
    const bone = vrm.humanoid.getNormalizedBoneNode(mapping.bone);
    const child = vrm.humanoid.getNormalizedBoneNode(mapping.child);
    if (!bone || !child) return telemetry;

    const boneWorldPosition = new THREE.Vector3();
    const childWorldPosition = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPosition);
    child.getWorldPosition(childWorldPosition);

    const avatarDirection = childWorldPosition.sub(boneWorldPosition);
    const length = avatarDirection.length();
    if (length <= 0.000001) return telemetry;

    avatarDirection.normalize();
    const sourceSegment = retargetFrame.segments[mapping.segment];
    const sourceDirection = resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping,
      retargetFrame,
      segmentApplicationDecision: {
        reason: "active",
        shouldApply: true,
        slerp: 0,
        zScale,
      },
    })?.desiredWorldDirection ?? null;
    const sourceError = sourceDirection
      ? 1 - THREE.MathUtils.clamp(avatarDirection.dot(sourceDirection), -1, 1)
      : undefined;

    if (typeof sourceError === "number" && sourceSegment && sourceSegment.confidence >= 0.3) {
      if (mapping.type === "leg" || mapping.type === "foot") {
        lowerBodySourceErrors.push(sourceError);
      } else {
        upperBodySourceErrors.push(sourceError);
      }
    }

    telemetry[mapping.segment] = {
      confidence: sourceSegment?.confidence,
      direction: compactVector(avatarDirection),
      length: Number(length.toFixed(4)),
      sourceDirection: sourceDirection ? compactVector(sourceDirection) : undefined,
      sourceError: typeof sourceError === "number" ? Number(sourceError.toFixed(4)) : undefined,
    };
    return telemetry;
  }, {});

  return {
    averageLowerBodyDirectionError: lowerBodySourceErrors.length
      ? Number((lowerBodySourceErrors.reduce((sum, value) => sum + value, 0) / lowerBodySourceErrors.length).toFixed(4))
      : undefined,
    averageUpperBodyDirectionError: upperBodySourceErrors.length
      ? Number((upperBodySourceErrors.reduce((sum, value) => sum + value, 0) / upperBodySourceErrors.length).toFixed(4))
      : undefined,
    comparedLowerBodySegments: lowerBodySourceErrors.length,
    comparedUpperBodySegments: upperBodySourceErrors.length,
    segments,
  };
}

export function buildMovementAvatarRootDebug({
  orientationOwner,
  rootApplication,
  rootTarget,
}: {
  orientationOwner: string;
  rootApplication: MovementAvatarRootTransformApplication;
  rootTarget: MovementAvatarRootTargetDecision;
}): NonNullable<MovementTrackingDebugState["avatarRoot"]> {
  return {
    appliedPitch: Number(rootApplication.rotation.x.toFixed(4)),
    appliedRoll: Number(rootApplication.rotation.z.toFixed(4)),
    appliedYaw: Number(rootApplication.appliedYaw.toFixed(4)),
    appliedX: Number(rootApplication.position.x.toFixed(4)),
    appliedY: Number(rootApplication.position.y.toFixed(4)),
    appliedZ: Number(rootApplication.position.z.toFixed(4)),
    jumpResponseOwner: rootTarget.jumpResponse.owner,
    orientationOwner,
    stepResponseOwner: rootTarget.stepResponse.owner,
    stepResponseSide: rootTarget.stepResponse.side ?? "none",
    targetHeightDrop: Number(rootTarget.targetHeightDrop.toFixed(4)),
    targetJumpHeightOffset: Number(rootTarget.targetJumpHeightOffset.toFixed(4)),
    targetStepFootLiftOffset: Number(
      (rootTarget.stepResponse.shouldApply ? rootTarget.stepResponse.footLiftOffset : 0).toFixed(4),
    ),
    targetPitch: Number(rootTarget.targetPitch.toFixed(4)),
    targetRoll: Number(rootTarget.targetRoll.toFixed(4)),
    targetYaw: Number(rootTarget.rootHeadingYaw.toFixed(4)),
    targetX: Number(rootTarget.targetX.toFixed(4)),
    targetZ: Number(rootTarget.targetZ.toFixed(4)),
    source: rootTarget.source,
  };
}

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

export function applyMovementAvatarFootLockDebugToTrackingState({
  footLock,
  state,
}: {
  footLock: {
    correction: number;
    drift: number;
    strength: number;
  };
  state: MovementTrackingDebugState;
}): MovementTrackingDebugState {
  const retargetLabel = state.fallbacks.retarget;
  if (!retargetLabel) return state;

  return {
    ...state,
    fallbacks: {
      ...state.fallbacks,
      retarget: appendMovementAvatarFootLockDebugLabel(retargetLabel, footLock),
    },
    retarget: state.retarget
      ? {
        ...state.retarget,
        footLockCorrection: footLock.correction,
        footLockDrift: footLock.drift,
        footLockStrength: footLock.strength,
      }
      : state.retarget,
  };
}

export function applyMovementAvatarPostFrameDebugTelemetry({
  avatarName,
  avatarRole,
  footLock,
  frameUpdatedAt,
  registryWindow,
  retargetFrame,
  state,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  footLock: {
    correction: number;
    drift: number;
    strength: number;
  };
  frameUpdatedAt: number;
  registryWindow?: MovementAvatarRetargetDebugRegistryWindow;
  retargetFrame: MovementRetargetFrame;
  state: MovementTrackingDebugState;
  vrm: VRM;
  zScale: number;
}): MovementTrackingDebugState {
  let nextState: MovementTrackingDebugState = {
    ...state,
    avatarVisual: buildMovementAvatarVisualTelemetry({
      retargetFrame,
      vrm,
      zScale,
    }),
  };

  if (nextState.fallbacks.retarget) {
    nextState = applyMovementAvatarFootLockDebugToTrackingState({
      footLock,
      state: nextState,
    });
  }

  if (registryWindow && nextState.retarget) {
    writeMovementAvatarRetargetDebugRegistry({
      avatarName,
      avatarRole,
      frameUpdatedAt,
      registryWindow,
      retarget: nextState.retarget,
    });
  }

  return nextState;
}

export function applyMovementAvatarOptionalPostFrameDebugTelemetry({
  avatarName,
  avatarRole,
  footLock,
  frameUpdatedAt,
  registryWindow,
  retargetFrame,
  state,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  footLock: {
    correction: number;
    drift: number;
    strength: number;
  };
  frameUpdatedAt: number;
  registryWindow?: MovementAvatarRetargetDebugRegistryWindow;
  retargetFrame: MovementRetargetFrame;
  state: MovementTrackingDebugState | null | undefined;
  vrm: VRM | null | undefined;
  zScale: number;
}): MovementTrackingDebugState | null {
  if (!state || !vrm) return state ?? null;

  return applyMovementAvatarPostFrameDebugTelemetry({
    avatarName,
    avatarRole,
    footLock,
    frameUpdatedAt,
    registryWindow,
    retargetFrame,
    state,
    vrm,
    zScale,
  });
}

export function writeMovementAvatarRetargetDebugRegistry({
  avatarName,
  avatarRole,
  frameUpdatedAt,
  registryWindow,
  retarget,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  frameUpdatedAt: number;
  registryWindow: MovementAvatarRetargetDebugRegistryWindow;
  retarget: NonNullable<MovementTrackingDebugState["retarget"]>;
}) {
  registryWindow.__sonaeMovementRetargetDebug = {
    ...registryWindow.__sonaeMovementRetargetDebug,
    [avatarRole]: {
      ...retarget,
      avatarName,
      frameUpdatedAt,
    },
  };

  return registryWindow.__sonaeMovementRetargetDebug;
}
