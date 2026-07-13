import { type MovementAvatarExerciseTransitionState, resolveMovementAvatarExerciseTarget } from "./movementAvatarExerciseTarget";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import { type MovementAvatarMotionFrameInputDecision, resolveMovementAvatarMotionFrameInput } from "./movementAvatarMotionFrameInput";
import {
  resolveMovementAvatarEstablishedLegRetarget,
  type MovementAvatarLowerBodyVisualState,
  type MovementAvatarPipelineDecision,
  type MovementAvatarPlayerLegRaiseHoldDecision,
  type MovementAvatarPlayerLegRaiseHoldState,
} from "./movementAvatarPipeline";
import { type MovementAvatarLowerBodyRuntimeStateDecision, resolveMovementAvatarLowerBodyRuntimeState } from "./movementAvatarRuntimeState";
import {
  type MovementAvatarSetupState,
  type MovementAvatarSetupTarget,
  resolveMovementAvatarSetup,
} from "./movementAvatarSetup";
import { type MovementAvatarLowerBodyTargetDecision, resolveMovementAvatarLowerBodyTarget } from "./movementAvatarTarget";
import type { MovementExerciseTransitionDecision } from "./movementExerciseTransition";
import type { MovementMotionFrame } from "./movementMotionFrame";
import {
  buildMovementRetargetSourceModel,
  getBalancedPlantedSquatDepth,
  getRecordedSquatPresentationDepth,
  type MovementRetargetSourceModel,
} from "./movementRetargeting";
import type {
  MovementCalibration,
  MovementHandsForConfidence,
  TrackingLandmark,
} from "./movementTrackingCalibration";

type MovementAvatarMutableRef<T> = {
  current: T;
};

// --- movementAvatarSetupRuntime ---

export function resolveMovementAvatarSetupRuntimeState({
  faceLandmarks,
  hands,
  isLivePlayer,
  manualCalibration,
  now,
  poseLandmarks,
  previousState,
  worldPoseLandmarks,
}: {
  faceLandmarks?: TrackingLandmark[] | null;
  hands?: MovementHandsForConfidence;
  isLivePlayer: boolean;
  manualCalibration: MovementCalibration | null;
  now?: number;
  poseLandmarks: TrackingLandmark[];
  previousState: MovementAvatarSetupState;
  worldPoseLandmarks?: TrackingLandmark[];
}): MovementAvatarSetupTarget {
  return resolveMovementAvatarSetup({
    faceLandmarks,
    hands,
    isLivePlayer,
    manualCalibration,
    now,
    poseLandmarks,
    previousState,
    worldPoseLandmarks,
  });
}

// --- movementAvatarRetargetSourceRuntime ---

export function resolveMovementAvatarRetargetSourceRuntimeModel({
  currentModel,
  now = Date.now(),
  poseLandmarks,
  providedModel,
  worldPoseLandmarks,
}: {
  currentModel: MovementRetargetSourceModel | null;
  now?: number;
  poseLandmarks: TrackingLandmark[];
  providedModel: MovementRetargetSourceModel | null;
  worldPoseLandmarks?: TrackingLandmark[] | null;
}): MovementRetargetSourceModel | null {
  if (providedModel) return providedModel;
  if (currentModel) return currentModel;

  return buildMovementRetargetSourceModel({
    now,
    poseLandmarks,
    worldPoseLandmarks,
  });
}

// --- movementAvatarFrameSetupRuntime ---

export type MovementAvatarFrameSetupRuntimeDecision = {
  activeCalibration: MovementCalibration | null;
  autoCalibrationKind: ReturnType<typeof resolveMovementAvatarSetupRuntimeState>["autoCalibrationKind"];
  nextRetargetSourceModel: MovementRetargetSourceModel | null;
  nextSetupState: MovementAvatarSetupState;
};

export function resolveMovementAvatarFrameSetupRuntime({
  currentRetargetSourceModel,
  faceLandmarks,
  hands,
  isLivePlayer,
  manualCalibration,
  now,
  poseLandmarks,
  previousSetupState,
  providedRetargetSourceModel,
  worldPoseLandmarks,
}: {
  currentRetargetSourceModel: MovementRetargetSourceModel | null;
  faceLandmarks?: TrackingLandmark[] | null;
  hands?: MovementHandsForConfidence;
  isLivePlayer: boolean;
  manualCalibration: MovementCalibration | null;
  now?: number;
  poseLandmarks: TrackingLandmark[];
  previousSetupState: MovementAvatarSetupState;
  providedRetargetSourceModel: MovementRetargetSourceModel | null;
  worldPoseLandmarks?: TrackingLandmark[];
}): MovementAvatarFrameSetupRuntimeDecision {
  const setupTarget = resolveMovementAvatarSetupRuntimeState({
    faceLandmarks,
    hands,
    isLivePlayer,
    manualCalibration,
    now,
    poseLandmarks,
    previousState: previousSetupState,
    worldPoseLandmarks,
  });

  return {
    activeCalibration: setupTarget.activeCalibration,
    autoCalibrationKind: setupTarget.autoCalibrationKind,
    nextRetargetSourceModel: resolveMovementAvatarRetargetSourceRuntimeModel({
      currentModel: currentRetargetSourceModel,
      now,
      poseLandmarks,
      providedModel: providedRetargetSourceModel,
      worldPoseLandmarks,
    }),
    nextSetupState: setupTarget.nextState,
  };
}

// --- movementAvatarFrameSetupRefsRuntime ---

export function applyMovementAvatarFrameSetupRefsRuntime({
  frameSetupRuntime,
  retargetSourceModelRef,
  setupStateRef,
}: {
  frameSetupRuntime: MovementAvatarFrameSetupRuntimeDecision;
  retargetSourceModelRef: MovementAvatarMutableRef<MovementAvatarFrameSetupRuntimeDecision["nextRetargetSourceModel"]>;
  setupStateRef: MovementAvatarMutableRef<MovementAvatarFrameSetupRuntimeDecision["nextSetupState"]>;
}) {
  setupStateRef.current = frameSetupRuntime.nextSetupState;
  retargetSourceModelRef.current = frameSetupRuntime.nextRetargetSourceModel;

  return {
    activeCalibration: frameSetupRuntime.activeCalibration,
    autoCalibrationKind: frameSetupRuntime.autoCalibrationKind,
  };
}

// --- movementAvatarFrameDecisionRuntime ---

export type MovementAvatarFrameDecisionRuntime = {
  avatarDecision: MovementAvatarPipelineDecision | null;
  exerciseTransition: MovementExerciseTransitionDecision | null;
  motionFrameInput: MovementAvatarMotionFrameInputDecision;
  nextExerciseTransitionState: MovementAvatarExerciseTransitionState;
};

export function resolveMovementAvatarFrameDecisionRuntime({
  motionFrame,
  previousExerciseTransitionState,
}: {
  motionFrame: MovementMotionFrame | null;
  previousExerciseTransitionState: MovementAvatarExerciseTransitionState;
}): MovementAvatarFrameDecisionRuntime {
  const motionFrameInput = resolveMovementAvatarMotionFrameInput({
    motionFrame,
    requiresMotionFrame: true,
  });
  const avatarDecision = motionFrameInput.decision;
  if (!avatarDecision) {
    return {
      avatarDecision: null,
      exerciseTransition: null,
      motionFrameInput,
      nextExerciseTransitionState: previousExerciseTransitionState,
    };
  }

  const exerciseTarget = resolveMovementAvatarExerciseTarget({
    decision: avatarDecision,
    previousState: previousExerciseTransitionState,
  });

  return {
    avatarDecision,
    exerciseTransition: exerciseTarget.exerciseTransition,
    motionFrameInput,
    nextExerciseTransitionState: exerciseTarget.nextState,
  };
}

// --- movementAvatarFrameDecisionRefsRuntime ---

export type MovementAvatarFrameDecisionRefsRuntime =
  | {
    status: "fallback-demo-pose";
  }
  | {
    avatarDecision: NonNullable<MovementAvatarFrameDecisionRuntime["avatarDecision"]>;
    exerciseTransition: NonNullable<MovementAvatarFrameDecisionRuntime["exerciseTransition"]>;
    motionFrameInput: MovementAvatarFrameDecisionRuntime["motionFrameInput"];
    status: "ready";
  };

export function applyMovementAvatarFrameDecisionRefsRuntime({
  exerciseTransitionStateRef,
  frameDecisionRuntime,
}: {
  exerciseTransitionStateRef: MovementAvatarMutableRef<MovementAvatarExerciseTransitionState>;
  frameDecisionRuntime: MovementAvatarFrameDecisionRuntime;
}): MovementAvatarFrameDecisionRefsRuntime {
  exerciseTransitionStateRef.current = frameDecisionRuntime.nextExerciseTransitionState;

  if (!frameDecisionRuntime.avatarDecision || !frameDecisionRuntime.exerciseTransition) {
    return {
      status: "fallback-demo-pose",
    };
  }

  return {
    avatarDecision: frameDecisionRuntime.avatarDecision,
    exerciseTransition: frameDecisionRuntime.exerciseTransition,
    motionFrameInput: frameDecisionRuntime.motionFrameInput,
    status: "ready",
  };
}

// --- movementAvatarLowerBodyFrameStateRuntime ---

export type MovementAvatarLowerBodyFrameStateRuntime = {
  balancedPlantedSquatDepth: number;
  instructorSquatPresentationDepth: number;
  liveSquatDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyRuntimeStateDecision: MovementAvatarLowerBodyRuntimeStateDecision;
  lowerBodyTarget: MovementAvatarLowerBodyTargetDecision;
  playerRetargetLowerBodyMotion: number;
  playerSquatPresentationDepth: number;
  recordedSquatPresentationDepth: number;
  shouldApplyLowerBody: boolean;
  shouldApplySolverTorso: boolean;
  shouldHoldPlayerSquatPose: boolean;
  visualRootDrop: number;
};

export function resolveMovementAvatarLowerBodyFrameStateRuntime({
  avatarDecision,
  avatarRole,
  instructorLowerBodyVisualState,
  now,
  playerLegRaiseHoldState,
  playerLowerBodyVisualState,
}: {
  avatarDecision: MovementAvatarPipelineDecision;
  avatarRole: "instructor" | "player";
  instructorLowerBodyVisualState: MovementAvatarLowerBodyVisualState;
  now: number;
  playerLegRaiseHoldState: MovementAvatarPlayerLegRaiseHoldState;
  playerLowerBodyVisualState: MovementAvatarLowerBodyVisualState;
}): MovementAvatarLowerBodyFrameStateRuntime {
  const recordedSquatPresentationDepth = getRecordedSquatPresentationDepth(avatarDecision.retargetFrame);
  const baseLowerBodyRuntimeStateDecision = resolveMovementAvatarLowerBodyRuntimeState({
    avatarRole,
    instructorLowerBodyVisualState,
    lowerBodyDrive: avatarDecision.lowerBodyDrive,
    now,
    playerLegRaiseHoldState,
    playerLowerBodyVisualState,
    recordedSquatPresentationDepth,
  });
  const previousVisualState = avatarRole === "player"
    ? playerLowerBodyVisualState
    : instructorLowerBodyVisualState;
  const lowerBodyVisualState = {
    ...baseLowerBodyRuntimeStateDecision.lowerBodyVisualDecision.state,
    hasEstablishedLegRetarget: resolveMovementAvatarEstablishedLegRetarget({
      applicableLegs: avatarDecision.retargetApplicableLegs,
      applicableThighs: avatarDecision.retargetApplicableThighs,
      previousState: previousVisualState,
      sourceQuality: avatarDecision.retargetFrame.debug.sourceQuality,
    }),
  };
  const lowerBodyVisualDecision = {
    ...baseLowerBodyRuntimeStateDecision.lowerBodyVisualDecision,
    state: lowerBodyVisualState,
  };
  const lowerBodyRuntimeStateDecision = {
    ...baseLowerBodyRuntimeStateDecision,
    lowerBodyVisualDecision,
    nextInstructorLowerBodyVisualState: avatarRole === "instructor"
      ? lowerBodyVisualState
      : baseLowerBodyRuntimeStateDecision.nextInstructorLowerBodyVisualState,
    nextPlayerLowerBodyVisualState: avatarRole === "player"
      ? lowerBodyVisualState
      : baseLowerBodyRuntimeStateDecision.nextPlayerLowerBodyVisualState,
  };
  const lowerBodyDrive = lowerBodyRuntimeStateDecision.lowerBodyDrive;
  const lowerBodyTarget = resolveMovementAvatarLowerBodyTarget({
    avatarRole,
    decision: avatarDecision,
    lowerBodyVisualState: lowerBodyVisualDecision.state,
  });

  return {
    balancedPlantedSquatDepth: getBalancedPlantedSquatDepth(avatarDecision.retargetFrame),
    instructorSquatPresentationDepth: lowerBodyVisualDecision.instructorSquatPresentationDepth,
    liveSquatDepth: lowerBodyDrive.liveSquatDepth,
    lowerBodyDrive,
    lowerBodyRuntimeStateDecision,
    lowerBodyTarget,
    playerRetargetLowerBodyMotion: lowerBodyTarget.playerSourceOwner.playerRetargetLowerBodyMotion,
    playerSquatPresentationDepth: lowerBodyVisualDecision.playerSquatPresentationDepth,
    recordedSquatPresentationDepth,
    shouldApplyLowerBody: lowerBodyDrive.shouldApplyLowerBody,
    shouldApplySolverTorso: lowerBodyDrive.shouldApplySolverTorso,
    shouldHoldPlayerSquatPose: lowerBodyTarget.shouldHoldPlayerSquatPose,
    visualRootDrop: lowerBodyVisualDecision.visualRootDrop,
  };
}

// --- movementAvatarLowerBodyFrameStateRefsRuntime ---

export type MovementAvatarLowerBodyFrameStateRefsRuntime = {
  legRaiseHoldDecision: MovementAvatarPlayerLegRaiseHoldDecision;
};

export function applyMovementAvatarLowerBodyFrameStateRefsRuntime({
  instructorLowerBodyStabilityRef,
  lowerBodyFrameStateRuntime,
  playerLegRaiseHoldRef,
  playerLowerBodyStabilityRef,
}: {
  instructorLowerBodyStabilityRef: MovementAvatarMutableRef<MovementAvatarLowerBodyVisualState>;
  lowerBodyFrameStateRuntime: MovementAvatarLowerBodyFrameStateRuntime;
  playerLegRaiseHoldRef: MovementAvatarMutableRef<MovementAvatarPlayerLegRaiseHoldState>;
  playerLowerBodyStabilityRef: MovementAvatarMutableRef<MovementAvatarLowerBodyVisualState>;
}): MovementAvatarLowerBodyFrameStateRefsRuntime {
  const lowerBodyRuntimeStateDecision = lowerBodyFrameStateRuntime.lowerBodyRuntimeStateDecision;
  playerLegRaiseHoldRef.current = lowerBodyRuntimeStateDecision.nextPlayerLegRaiseHoldState;
  playerLowerBodyStabilityRef.current = lowerBodyRuntimeStateDecision.nextPlayerLowerBodyVisualState;
  instructorLowerBodyStabilityRef.current = lowerBodyRuntimeStateDecision.nextInstructorLowerBodyVisualState;

  return {
    legRaiseHoldDecision: lowerBodyRuntimeStateDecision.legRaiseHoldDecision,
  };
}

// --- movementAvatarLowerBodyFrameStateOrchestrationRuntime ---

type MovementAvatarLowerBodyFrameStateRuntimeInput =
  Parameters<typeof resolveMovementAvatarLowerBodyFrameStateRuntime>[0];

export type MovementAvatarLowerBodyFrameStateOrchestrationRuntime = {
  legRaiseHoldDecision: MovementAvatarLowerBodyFrameStateRefsRuntime["legRaiseHoldDecision"];
  lowerBodyFrameStateRuntime: MovementAvatarLowerBodyFrameStateRuntime;
};

export function applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime({
  instructorLowerBodyStabilityRef,
  playerLegRaiseHoldRef,
  playerLowerBodyStabilityRef,
  ...input
}: Omit<
  MovementAvatarLowerBodyFrameStateRuntimeInput,
  "instructorLowerBodyVisualState" | "playerLegRaiseHoldState" | "playerLowerBodyVisualState"
> & {
  instructorLowerBodyStabilityRef: MovementAvatarMutableRef<
    MovementAvatarLowerBodyFrameStateRuntimeInput["instructorLowerBodyVisualState"]
  >;
  playerLegRaiseHoldRef: MovementAvatarMutableRef<
    MovementAvatarLowerBodyFrameStateRuntimeInput["playerLegRaiseHoldState"]
  >;
  playerLowerBodyStabilityRef: MovementAvatarMutableRef<
    MovementAvatarLowerBodyFrameStateRuntimeInput["playerLowerBodyVisualState"]
  >;
}): MovementAvatarLowerBodyFrameStateOrchestrationRuntime {
  const lowerBodyFrameStateRuntime = resolveMovementAvatarLowerBodyFrameStateRuntime({
    ...input,
    instructorLowerBodyVisualState: instructorLowerBodyStabilityRef.current,
    playerLegRaiseHoldState: playerLegRaiseHoldRef.current,
    playerLowerBodyVisualState: playerLowerBodyStabilityRef.current,
  });
  const { legRaiseHoldDecision } = applyMovementAvatarLowerBodyFrameStateRefsRuntime({
    instructorLowerBodyStabilityRef,
    lowerBodyFrameStateRuntime,
    playerLegRaiseHoldRef,
    playerLowerBodyStabilityRef,
  });

  return {
    legRaiseHoldDecision,
    lowerBodyFrameStateRuntime,
  };
}

// --- movementAvatarFrameDecisionSnapshotRuntime ---

export type MovementAvatarFrameDecisionSnapshotRuntime = {
  activeSpineDrive: MovementAvatarPipelineDecision["spineDrive"];
  balancedPlantedSquatDepth: MovementAvatarLowerBodyFrameStateRuntime["balancedPlantedSquatDepth"];
  instructorSquatPresentationDepth: MovementAvatarLowerBodyFrameStateRuntime["instructorSquatPresentationDepth"];
  leftArmDecision: MovementAvatarPipelineDecision["leftArm"];
  liveSquatDepth: MovementAvatarLowerBodyFrameStateRuntime["liveSquatDepth"];
  lowerBodyDrive: MovementAvatarLowerBodyFrameStateRuntime["lowerBodyDrive"];
  lowerBodyTarget: MovementAvatarLowerBodyFrameStateRuntime["lowerBodyTarget"];
  lowerBodyTrackingReady: MovementAvatarPipelineDecision["lowerBodyTrackingReady"];
  playerRetargetLowerBodyMotion: MovementAvatarLowerBodyFrameStateRuntime["playerRetargetLowerBodyMotion"];
  playerSquatPresentationDepth: MovementAvatarLowerBodyFrameStateRuntime["playerSquatPresentationDepth"];
  recordedLowerBodySegmentMotion: MovementAvatarPipelineDecision["lowerBodySegmentMotion"];
  recordedLowerBodySourceReliable: MovementAvatarPipelineDecision["lowerBodySourceReliable"];
  retargetFrame: MovementAvatarPipelineDecision["retargetFrame"];
  rightArmDecision: MovementAvatarPipelineDecision["rightArm"];
  rootOrientation: MovementAvatarPipelineDecision["rootOrientation"];
  shouldApplyLowerBody: MovementAvatarLowerBodyFrameStateRuntime["shouldApplyLowerBody"];
  shouldApplySolverTorso: MovementAvatarLowerBodyFrameStateRuntime["shouldApplySolverTorso"];
  shouldHoldPlayerSquatPose: MovementAvatarLowerBodyFrameStateRuntime["shouldHoldPlayerSquatPose"];
  torsoTrackingReady: MovementAvatarPipelineDecision["torsoTrackingReady"];
  visualRootDrop: MovementAvatarLowerBodyFrameStateRuntime["visualRootDrop"];
};

export function resolveMovementAvatarFrameDecisionSnapshotRuntime({
  avatarDecision,
  lowerBodyFrameStateRuntime,
}: {
  avatarDecision: MovementAvatarPipelineDecision;
  lowerBodyFrameStateRuntime: MovementAvatarLowerBodyFrameStateRuntime;
}): MovementAvatarFrameDecisionSnapshotRuntime {
  return {
    activeSpineDrive: avatarDecision.spineDrive,
    balancedPlantedSquatDepth: lowerBodyFrameStateRuntime.balancedPlantedSquatDepth,
    instructorSquatPresentationDepth: lowerBodyFrameStateRuntime.instructorSquatPresentationDepth,
    leftArmDecision: avatarDecision.leftArm,
    liveSquatDepth: lowerBodyFrameStateRuntime.liveSquatDepth,
    lowerBodyDrive: lowerBodyFrameStateRuntime.lowerBodyDrive,
    lowerBodyTarget: lowerBodyFrameStateRuntime.lowerBodyTarget,
    lowerBodyTrackingReady: avatarDecision.lowerBodyTrackingReady,
    playerRetargetLowerBodyMotion: lowerBodyFrameStateRuntime.playerRetargetLowerBodyMotion,
    playerSquatPresentationDepth: lowerBodyFrameStateRuntime.playerSquatPresentationDepth,
    recordedLowerBodySegmentMotion: avatarDecision.lowerBodySegmentMotion,
    recordedLowerBodySourceReliable: avatarDecision.lowerBodySourceReliable,
    retargetFrame: avatarDecision.retargetFrame,
    rightArmDecision: avatarDecision.rightArm,
    rootOrientation: avatarDecision.rootOrientation,
    shouldApplyLowerBody: lowerBodyFrameStateRuntime.shouldApplyLowerBody,
    shouldApplySolverTorso: lowerBodyFrameStateRuntime.shouldApplySolverTorso,
    shouldHoldPlayerSquatPose: lowerBodyFrameStateRuntime.shouldHoldPlayerSquatPose,
    torsoTrackingReady: avatarDecision.torsoTrackingReady,
    visualRootDrop: lowerBodyFrameStateRuntime.visualRootDrop,
  };
}

// --- movementAvatarFramePreparationOrchestrationRuntime ---

type MovementAvatarFrameSetupRuntimeInput = Parameters<typeof resolveMovementAvatarFrameSetupRuntime>[0];
type MovementAvatarFrameDecisionRuntimeInput = Parameters<typeof resolveMovementAvatarFrameDecisionRuntime>[0];

export type MovementAvatarFramePreparationOrchestrationRuntime =
  | {
    activeCalibration: MovementAvatarFrameSetupRuntimeDecision["activeCalibration"];
    autoCalibrationKind: MovementAvatarFrameSetupRuntimeDecision["autoCalibrationKind"];
    frameDecisionRuntime: MovementAvatarFrameDecisionRuntime;
    frameSetupRuntime: MovementAvatarFrameSetupRuntimeDecision;
    status: "fallback-demo-pose";
  }
  | {
    activeCalibration: MovementAvatarFrameSetupRuntimeDecision["activeCalibration"];
    autoCalibrationKind: MovementAvatarFrameSetupRuntimeDecision["autoCalibrationKind"];
    avatarDecision: NonNullable<MovementAvatarFrameDecisionRuntime["avatarDecision"]>;
    exerciseTransition: NonNullable<MovementAvatarFrameDecisionRuntime["exerciseTransition"]>;
    frameDecisionRuntime: MovementAvatarFrameDecisionRuntime;
    frameSetupRuntime: MovementAvatarFrameSetupRuntimeDecision;
    motionFrameInput: MovementAvatarFrameDecisionRuntime["motionFrameInput"];
    status: "ready";
  };

export function applyMovementAvatarFramePreparationOrchestrationRuntime({
  exerciseTransitionStateRef,
  motionFrame,
  retargetSourceModelRef,
  setupStateRef,
  ...setupInput
}: Omit<
  MovementAvatarFrameSetupRuntimeInput,
  "currentRetargetSourceModel" | "previousSetupState"
> & Pick<MovementAvatarFrameDecisionRuntimeInput, "motionFrame"> & {
  exerciseTransitionStateRef: MovementAvatarMutableRef<
    MovementAvatarFrameDecisionRuntimeInput["previousExerciseTransitionState"]
  >;
  retargetSourceModelRef: MovementAvatarMutableRef<
    MovementAvatarFrameSetupRuntimeInput["currentRetargetSourceModel"]
  >;
  setupStateRef: MovementAvatarMutableRef<MovementAvatarFrameSetupRuntimeInput["previousSetupState"]>;
}): MovementAvatarFramePreparationOrchestrationRuntime {
  const frameSetupRuntime = resolveMovementAvatarFrameSetupRuntime({
    ...setupInput,
    currentRetargetSourceModel: retargetSourceModelRef.current,
    previousSetupState: setupStateRef.current,
  });
  const { activeCalibration, autoCalibrationKind } = applyMovementAvatarFrameSetupRefsRuntime({
    frameSetupRuntime,
    retargetSourceModelRef,
    setupStateRef,
  });
  const frameDecisionRuntime = resolveMovementAvatarFrameDecisionRuntime({
    motionFrame,
    previousExerciseTransitionState: exerciseTransitionStateRef.current,
  });
  const frameDecisionRefsRuntime = applyMovementAvatarFrameDecisionRefsRuntime({
    exerciseTransitionStateRef,
    frameDecisionRuntime,
  });

  if (frameDecisionRefsRuntime.status === "fallback-demo-pose") {
    return {
      activeCalibration,
      autoCalibrationKind,
      frameDecisionRuntime,
      frameSetupRuntime,
      status: "fallback-demo-pose",
    };
  }

  return {
    activeCalibration,
    autoCalibrationKind,
    avatarDecision: frameDecisionRefsRuntime.avatarDecision,
    exerciseTransition: frameDecisionRefsRuntime.exerciseTransition,
    frameDecisionRuntime,
    frameSetupRuntime,
    motionFrameInput: frameDecisionRefsRuntime.motionFrameInput,
    status: "ready",
  };
}
