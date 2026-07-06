import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import { resolveMovementAvatarAthleticStandingSupportPresentationPose } from "./movementAvatarAthleticStandingSupportPresentationDecision";
import { resolveMovementAvatarStandingFoldSupportPresentationPose } from "./movementAvatarStandingFoldSupportPresentationDecision";
import { resolveMovementAvatarYogaStandingSupportPresentationPose } from "./movementAvatarYogaStandingSupportPresentationDecision";

export function resolveMovementAvatarStandingSupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision | null {
  return (
    resolveMovementAvatarStandingFoldSupportPresentationPose({ exercisePose, poseLandmarks })
    ?? resolveMovementAvatarAthleticStandingSupportPresentationPose({ exercisePose, poseLandmarks })
    ?? resolveMovementAvatarYogaStandingSupportPresentationPose({ exercisePose, poseLandmarks })
  );
}
