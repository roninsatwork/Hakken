import {
  resolveMovementAvatarPipelineDecision,
  type MovementAvatarPipelineDecision,
  type MovementAvatarPipelineInput,
} from "./movementAvatarPipeline";
import type { MovementMirrorMode } from "./movementMirrorMapping";
import type { MovementSourceFrame } from "./movementSourceFrame";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import {
  buildMovementTruthSkeleton,
  type MovementTruthSkeleton,
} from "./movementTruthSkeleton";

export type MovementMotionFrame = {
  avatarDecision: MovementAvatarPipelineDecision;
  displayLandmarks: {
    pose: TrackingLandmark[];
    worldPose: TrackingLandmark[];
  };
  mirrorMode: MovementMirrorMode;
  source: MovementSourceFrame;
  truthSkeleton: MovementTruthSkeleton;
};

export type ResolveMovementMotionFrameInput = Omit<MovementAvatarPipelineInput, "source" | "sourceOrigin"> & {
  displayPoseLandmarks?: TrackingLandmark[];
  displayWorldPoseLandmarks?: TrackingLandmark[];
  mirrorMode: MovementMirrorMode;
  sourceFrame: MovementSourceFrame;
};

export function resolveMovementMotionFrame({
  displayPoseLandmarks,
  displayWorldPoseLandmarks,
  mirrorMode,
  sourceFrame,
  ...pipelineInput
}: ResolveMovementMotionFrameInput): MovementMotionFrame {
  const poseLandmarks = displayPoseLandmarks ?? sourceFrame.landmarks.pose;
  const worldPoseLandmarks = displayWorldPoseLandmarks ?? sourceFrame.landmarks.worldPose;
  const avatarDecision = resolveMovementAvatarPipelineDecision({
    ...pipelineInput,
    source: {
      hands: sourceFrame.landmarks.hands,
      poseLandmarks,
    },
    sourceOrigin: sourceFrame.sourceOrigin === "recorded-replay" ? "replay" : "studio",
  });

  return {
    avatarDecision,
    displayLandmarks: {
      pose: poseLandmarks,
      worldPose: worldPoseLandmarks,
    },
    mirrorMode,
    source: sourceFrame,
    truthSkeleton: buildMovementTruthSkeleton(sourceFrame),
  };
}
