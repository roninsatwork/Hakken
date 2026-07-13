import type {
  MovementDebugReplayFrame,
  MovementDebugReplayRetarget,
  MovementDebugReplaySession,
} from "./movementDebugReplay";
import {
  buildMovementAvatarRetargetDebug,
  resolveMovementAvatarEstablishedLegRetarget,
  resolveMovementAvatarLowerBodyVisualDecision,
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
import type { MovementExerciseTransitionDecision } from "./movementExerciseTransition";
import {
  buildMovementRootMotionAnalysis,
  type MovementRootMotionAnalysis,
  type MovementRootMotionFrame,
} from "./movementRootMotion";
import {
  buildRecordedMovementSourceFrame,
  type MovementSourceFrame,
} from "./movementSourceFrame";
import {
  mirrorMovementLandmarksForDisplay,
  type MovementMirrorMode,
} from "./movementMirrorMapping";
import {
  resolveMovementMotionFrame,
  type MovementMotionFrame,
} from "./movementMotionFrame";
import {
  type MovementGameplayEventFrame,
} from "./movementGameplayEvents";
import {
  resolveMovementMatchScoringGameplaySummary,
} from "./movementGameplayScoring";
import {
  resolveMovementAvatarLowerBodyTarget,
  type MovementAvatarLowerBodyTargetDecision,
} from "./movementAvatarTarget";
import {
  createMovementAvatarExerciseTransitionState,
  resolveMovementAvatarExerciseTarget,
  type MovementAvatarExerciseTransitionState,
} from "./movementAvatarExerciseTarget";

export type MovementGamePathDecision = MovementAvatarPipelineDecision & {
  exerciseTransition: MovementExerciseTransitionDecision;
  lowerBodyTarget: MovementAvatarLowerBodyTargetDecision;
  retarget: MovementDebugReplayRetarget;
  rootMotion: MovementRootMotionFrame;
};

export type MovementGamePathSimulation = {
  calibration: MovementCalibration | null;
  decisions: Array<MovementGamePathDecision | undefined>;
  gameplayEvents: Array<MovementGameplayEventFrame | undefined>;
  mirrorMode: MovementMirrorMode;
  motionFrames: Array<MovementMotionFrame | undefined>;
  retargetSourceModel: MovementRetargetSourceModel | null;
  rootMotion: MovementRootMotionAnalysis;
  sourceFrames: Array<MovementSourceFrame | null>;
};

function isNonNull<T>(value: T | null | undefined): value is T {
  return Boolean(value);
}

function toTrackingLandmarks(frame: MovementDebugReplayFrame): TrackingLandmark[] | null {
  return frame.tracking.pose.length >= 33 ? frame.tracking.pose : null;
}

type PreparedGamePathFrame = {
  pose: TrackingLandmark[];
  sourceFrame: MovementSourceFrame;
  worldPose: TrackingLandmark[] | null;
};

const GAME_PATH_MIRROR_MODE: MovementMirrorMode = "facing-player";

function preparePlayerGamePathFrame(frame: MovementDebugReplayFrame): PreparedGamePathFrame | null {
  const sourceFrame = buildRecordedMovementSourceFrame(frame);
  const pose = toTrackingLandmarks(frame);
  if (!pose) return null;

  const hasWorldPose = sourceFrame.landmarks.worldPose.length >= 33;

  return {
    sourceFrame,
    pose: mirrorMovementLandmarksForDisplay(pose, {
      mapX: (x) => 1 - x,
      mirrorMode: GAME_PATH_MIRROR_MODE,
    }),
    worldPose: hasWorldPose
      ? mirrorMovementLandmarksForDisplay(sourceFrame.landmarks.worldPose, {
          mapX: (x) => -x,
          mirrorMode: GAME_PATH_MIRROR_MODE,
        })
      : null,
  };
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

function resolveGamePathLowerBodyTarget({
  decision,
  lowerBodyVisualState,
}: {
  decision: MovementAvatarPipelineDecision;
  lowerBodyVisualState: MovementAvatarLowerBodyVisualState;
}) {
  return resolveMovementAvatarLowerBodyTarget({
    avatarRole: "player",
    decision,
    lowerBodyVisualState,
  });
}

export function buildMovementGamePathSimulation(
  session: MovementDebugReplaySession,
): MovementGamePathSimulation {
  const preparedFrames = session.samples.map(preparePlayerGamePathFrame);
  const sourceFrames = preparedFrames.map((frame) => frame?.sourceFrame ?? null);
  const frameLandmarks = preparedFrames.map((frame) => frame?.pose ?? null);
  const rootMotion = buildMovementRootMotionAnalysis(
    preparedFrames.map((frame) => ({
      pose: frame?.pose ?? [],
      worldPose: frame?.worldPose ?? null,
    })),
  );
  const landmarkFrames = frameLandmarks.filter((landmarks): landmarks is TrackingLandmark[] => Boolean(landmarks));
  if (landmarkFrames.length === 0) {
    return {
      calibration: null,
      decisions: session.samples.map(() => undefined),
      gameplayEvents: session.samples.map(() => undefined),
      mirrorMode: GAME_PATH_MIRROR_MODE,
      motionFrames: session.samples.map(() => undefined),
      retargetSourceModel: null,
      rootMotion,
      sourceFrames,
    };
  }

  const calibration = buildSimulationCalibration(landmarkFrames);
  const retargetSourceModel = averageMovementRetargetSourceModels(
    preparedFrames
      .map((frame) => frame?.pose
        ? buildMovementRetargetSourceModel({
            poseLandmarks: frame.pose,
            worldPoseLandmarks: frame.worldPose ?? null,
          })
        : null)
      .filter(isNonNull),
  );

  let lowerBodyVisualState: MovementAvatarLowerBodyVisualState = {
    hasEstablishedLegRetarget: false,
    squatPresentationDepth: 0,
    visualRootDrop: 0,
  };
  let exerciseTransitionState: MovementAvatarExerciseTransitionState = createMovementAvatarExerciseTransitionState();
  const motionFrames: Array<MovementMotionFrame | undefined> = [];
  const gameplayEvents: Array<MovementGameplayEventFrame | undefined> = [];
  let gameplayStreak = 0;

  const decisions = frameLandmarks.map((poseLandmarks, frameIndex) => {
    const sourceFrame = preparedFrames[frameIndex]?.sourceFrame;
    if (!poseLandmarks || !sourceFrame) {
      gameplayStreak = 0;
      gameplayEvents.push(undefined);
      motionFrames.push(undefined);
      return undefined;
    }

    const motionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration,
      displayPoseLandmarks: poseLandmarks,
      displayWorldPoseLandmarks: preparedFrames[frameIndex]?.worldPose ?? [],
      mirrorMode: GAME_PATH_MIRROR_MODE,
      retargetSourceModel,
      sourceFrame,
    });
    motionFrames.push(motionFrame);
    const { gameplayEventFrame } = resolveMovementMatchScoringGameplaySummary({
      playerMotionFrame: motionFrame,
      previousPlayerMotionFrame: motionFrames[frameIndex - 1] ?? null,
      streak: gameplayStreak,
    });
    gameplayStreak = gameplayEventFrame.nextStreak;
    gameplayEvents.push(gameplayEventFrame);
    const decision = motionFrame.avatarDisplayDecision;
    const visualDecision = resolveMovementAvatarLowerBodyVisualDecision({
      avatarRole: "player",
      lowerBodyDrive: decision.lowerBodyDrive,
      previousState: lowerBodyVisualState,
      recordedSquatPresentationDepth: getRecordedSquatPresentationDepth(decision.retargetFrame),
    });
    lowerBodyVisualState = {
      ...visualDecision.state,
      hasEstablishedLegRetarget: resolveMovementAvatarEstablishedLegRetarget({
        applicableLegs: decision.retargetApplicableLegs,
        applicableThighs: decision.retargetApplicableThighs,
        previousState: lowerBodyVisualState,
        sourceQuality: decision.retargetFrame.debug.sourceQuality,
      }),
    };
    const lowerBodyTarget = resolveGamePathLowerBodyTarget({
      decision,
      lowerBodyVisualState,
    });
    const retarget = buildMovementAvatarRetargetDebug({
      retargetFrame: decision.retargetFrame,
      retargetSourceModel,
      visualRootDrop: decision.lowerBodyDrive.visualRootDrop,
    });
    const exerciseTarget = resolveMovementAvatarExerciseTarget({
      decision,
      previousState: exerciseTransitionState,
    });
    exerciseTransitionState = exerciseTarget.nextState;

    return {
      ...decision,
      exerciseTransition: exerciseTarget.exerciseTransition,
      feetOwner: lowerBodyTarget.feetOwner,
      lowerBodyTarget,
      lowerOwner: lowerBodyTarget.lowerBodyOwner,
      retarget,
      rootMotion: rootMotion.frames[frameIndex]!,
    };
  });

  return {
    calibration,
    decisions,
    gameplayEvents,
    mirrorMode: GAME_PATH_MIRROR_MODE,
    motionFrames,
    retargetSourceModel,
    rootMotion,
    sourceFrames,
  };
}
