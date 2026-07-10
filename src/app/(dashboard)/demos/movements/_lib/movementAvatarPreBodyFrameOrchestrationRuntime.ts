import {
  applyMovementAvatarFramePreparationOrchestrationRuntime,
  type MovementAvatarFramePreparationOrchestrationRuntime,
} from "./movementAvatarFramePreparationOrchestrationRuntime";
import {
  resolveMovementAvatarFrameDecisionSnapshotRuntime,
  type MovementAvatarFrameDecisionSnapshotRuntime,
} from "./movementAvatarFrameDecisionSnapshotRuntime";
import {
  applyMovementAvatarLocomotionFrameOrchestrationRuntime,
  type MovementAvatarLocomotionFrameOrchestrationRuntime,
} from "./movementAvatarLocomotionFrame";
import {
  applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime,
  type MovementAvatarLowerBodyFrameStateOrchestrationRuntime,
} from "./movementAvatarLowerBodyFrameStateOrchestrationRuntime";

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
