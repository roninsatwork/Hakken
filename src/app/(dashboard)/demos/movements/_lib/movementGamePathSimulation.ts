import type {
  MovementDebugReplayFrame,
  MovementDebugReplayRetarget,
  MovementDebugReplaySession,
} from "./movementDebugReplay";
import {
  buildMovementAvatarRetargetDebug,
  resolveMovementAvatarInactiveLowerBodyDecision,
  resolveMovementAvatarLowerBodyApplicationStage,
  resolveMovementAvatarLowerBodyVisualDecision,
  resolveMovementAvatarPlayerSourceOwnerDecision,
  resolveMovementAvatarStudioDecision,
  type MovementAvatarLowerBodyVisualState,
  type MovementAvatarPipelineDecision,
} from "./movementAvatarPipeline";
import {
  averageMovementRetargetSourceModels,
  buildMovementRetargetSourceModel,
  getRecordedSquatPresentationDepth,
  type MovementRetargetSourceModel,
} from "./movementRetargeting";
import {
  averageMovementCalibrations,
  buildMovementCalibration,
  buildUprightMovementAutoCalibration,
  type MovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

export type MovementGamePathDecision = MovementAvatarPipelineDecision & {
  retarget: MovementDebugReplayRetarget;
};

export type MovementGamePathSimulation = {
  calibration: MovementCalibration | null;
  decisions: Array<MovementGamePathDecision | undefined>;
  retargetSourceModel: MovementRetargetSourceModel | null;
};

function isNonNull<T>(value: T | null | undefined): value is T {
  return Boolean(value);
}

function toTrackingLandmarks(frame: MovementDebugReplayFrame): TrackingLandmark[] | null {
  return frame.tracking.pose.length >= 33 ? frame.tracking.pose : null;
}

function buildSimulationCalibration(landmarkFrames: TrackingLandmark[][]) {
  const uprightSamples = landmarkFrames
    .map((poseLandmarks) => buildUprightMovementAutoCalibration({ poseLandmarks }))
    .filter(isNonNull);

  if (uprightSamples.length > 0) {
    return averageMovementCalibrations(uprightSamples);
  }

  return averageMovementCalibrations(
    landmarkFrames
      .map((poseLandmarks) => buildMovementCalibration({ poseLandmarks }))
      .filter(isNonNull),
  );
}

function resolveGamePathAppliedOwners({
  decision,
  lowerBodyVisualState,
}: {
  decision: MovementAvatarPipelineDecision;
  lowerBodyVisualState: MovementAvatarLowerBodyVisualState;
}) {
  const playerSquatPresentationDepth = lowerBodyVisualState.squatPresentationDepth;
  const recordedSquatPresentationDepth = getRecordedSquatPresentationDepth(decision.retargetFrame);
  const instructorLowerBodyMotion = Math.max(
    recordedSquatPresentationDepth,
    decision.lowerBodySegmentMotion,
    decision.retargetFrame.kneeLift.left,
    decision.retargetFrame.kneeLift.right,
  );
  const shouldHoldPlayerSquatPose =
    decision.shouldApplyLowerBody &&
    playerSquatPresentationDepth > 0.18;
  const playerSourceOwner = resolveMovementAvatarPlayerSourceOwnerDecision({
    avatarRole: "player",
    decision,
    playerSquatPresentationDepth,
    shouldHoldPlayerSquatPose,
  });

  if ((decision.lowerBodyTrackingReady || shouldHoldPlayerSquatPose) && decision.shouldApplyLowerBody) {
    const stageDecision = resolveMovementAvatarLowerBodyApplicationStage({
      avatarRole: "player",
      instructorLowerBodyMotion,
      lowerBodyDrive: decision.lowerBodyDrive,
      playerRetargetLowerBodyMotion: playerSourceOwner.playerRetargetLowerBodyMotion,
      retargetSourceQuality: decision.retargetFrame.debug.sourceQuality,
      sourceOwnerDecision: playerSourceOwner.lowerBodyOwnerDecision,
      shouldHoldPlayerSquatPose,
    });

    if (stageDecision.stage !== "retarget") {
      return {
        feetOwner: stageDecision.feetOwner,
        lowerOwner: stageDecision.lowerBodyOwner,
      };
    }
  } else {
    const inactiveDecision = resolveMovementAvatarInactiveLowerBodyDecision({
      avatarRole: "player",
      lowerBodySourceReliable: decision.lowerBodySourceReliable,
    });

    return {
      feetOwner: inactiveDecision.feetOwner ?? decision.feetOwner,
      lowerOwner: inactiveDecision.lowerBodyOwner ?? decision.lowerOwner,
    };
  }

  return {
    feetOwner: decision.feetOwner,
    lowerOwner: decision.lowerOwner,
  };
}

export function buildMovementGamePathSimulation(
  session: MovementDebugReplaySession,
): MovementGamePathSimulation {
  const frameLandmarks = session.samples.map(toTrackingLandmarks);
  const landmarkFrames = frameLandmarks.filter((landmarks): landmarks is TrackingLandmark[] => Boolean(landmarks));
  if (landmarkFrames.length === 0) {
    return {
      calibration: null,
      decisions: session.samples.map(() => undefined),
      retargetSourceModel: null,
    };
  }

  const calibration = buildSimulationCalibration(landmarkFrames);
  const retargetSourceModel = averageMovementRetargetSourceModels(
    landmarkFrames
      .map((poseLandmarks) => buildMovementRetargetSourceModel({ poseLandmarks }))
      .filter(isNonNull),
  );

  let lowerBodyVisualState: MovementAvatarLowerBodyVisualState = {
    squatPresentationDepth: 0,
    visualRootDrop: 0,
  };

  const decisions = frameLandmarks.map((poseLandmarks) => {
    if (!poseLandmarks) return undefined;

    const decision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks },
    });
    const visualDecision = resolveMovementAvatarLowerBodyVisualDecision({
      avatarRole: "player",
      lowerBodyDrive: decision.lowerBodyDrive,
      previousState: lowerBodyVisualState,
      recordedSquatPresentationDepth: getRecordedSquatPresentationDepth(decision.retargetFrame),
    });
    lowerBodyVisualState = visualDecision.state;
    const appliedOwners = resolveGamePathAppliedOwners({
      decision,
      lowerBodyVisualState,
    });
    const retarget = buildMovementAvatarRetargetDebug({
      retargetFrame: decision.retargetFrame,
      retargetSourceModel,
      visualRootDrop: decision.lowerBodyDrive.visualRootDrop,
    });

    return {
      ...decision,
      feetOwner: appliedOwners.feetOwner,
      lowerOwner: appliedOwners.lowerOwner,
      retarget,
    };
  });

  return {
    calibration,
    decisions,
    retargetSourceModel,
  };
}
