import type { MovementBodyOrientationDecision } from "./movementBodyOrientation";
import { resolveMovementExercisePose, type MovementExercisePoseDecision } from "./movementExercisePose";
import { resolveMovementSupportContacts, type MovementSupportContactDecision } from "./movementSupportContact";
import { resolveMovementSupportConstraint, type MovementSupportConstraintDecision } from "./movementSupportConstraint";
import { resolveMovementSupportIntent, type MovementSupportIntentDecision } from "./movementSupportIntent";
import {
  resolveMovementAvatarSupportContactLocks,
  type MovementAvatarSupportContactLockDecision,
} from "./movementAvatarSupportContactDecision";
import { resolveMovementAvatarSupportPresentationPose } from "./movementAvatarSupportPresentationDecision";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipelineTypes";
import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementAvatarPipelineSupportDecision = {
  bodySupport: MovementSupportContactDecision;
  exercisePose: MovementExercisePoseDecision;
  supportConstraint: MovementSupportConstraintDecision;
  supportContactLocks: MovementAvatarSupportContactLockDecision;
  supportIntent: MovementSupportIntentDecision;
  supportPresentation: MovementAvatarSupportPresentationDecision;
};

export function resolveMovementAvatarPipelineSupportDecision({
  bodyOrientation,
  poseLandmarks,
}: {
  bodyOrientation: MovementBodyOrientationDecision;
  poseLandmarks: TrackingLandmark[];
}): MovementAvatarPipelineSupportDecision {
  const bodySupport = resolveMovementSupportContacts({
    bodyOrientation,
    poseLandmarks,
  });
  const exercisePose = resolveMovementExercisePose({
    bodyOrientation,
    bodySupport,
    poseLandmarks,
  });
  const supportIntent = resolveMovementSupportIntent({
    bodySupport,
    exercisePose,
  });
  const supportConstraint = resolveMovementSupportConstraint({
    exercisePose,
    supportIntent,
  });
  const supportPresentation = resolveMovementAvatarSupportPresentationPose({
    exercisePose,
    poseLandmarks,
    supportConstraint,
    supportIntent,
  });
  const supportContactLocks = resolveMovementAvatarSupportContactLocks({
    exercisePose,
    supportConstraint,
    supportIntent,
  });

  return {
    bodySupport,
    exercisePose,
    supportConstraint,
    supportContactLocks,
    supportIntent,
    supportPresentation,
  };
}
