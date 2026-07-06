import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { MovementSupportConstraintDecision } from "./movementSupportConstraint";
import type { MovementSupportIntentDecision } from "./movementSupportIntent";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";

import { movementAvatarSupportPresentationNoneDecision as none } from "./movementAvatarSupportPresentationDecisionBuilders";
import { resolveMovementAvatarHandsFeetSupportPresentationPose } from "./movementAvatarHandsFeetSupportPresentationDecision";
import { resolveMovementAvatarHandsKneesSupportPresentationPose } from "./movementAvatarHandsKneesSupportPresentationDecision";
import { resolveMovementAvatarKneelingSupportPresentationPose } from "./movementAvatarKneelingSupportPresentationDecision";
import { resolveMovementAvatarProneSupportPresentationPose } from "./movementAvatarProneSupportPresentationDecision";
import { resolveMovementAvatarSeatedSupportPresentationPose } from "./movementAvatarSeatedSupportPresentationDecision";
import { resolveMovementAvatarSideBodySupportPresentationPose } from "./movementAvatarSideBodySupportPresentationDecision";
import { resolveMovementAvatarStandingSupportPresentationPose } from "./movementAvatarStandingSupportPresentationDecision";
import { resolveMovementAvatarSupineSupportPresentationPose } from "./movementAvatarSupineSupportPresentationDecision";

export function resolveMovementAvatarSupportPresentationPose({
  exercisePose,
  poseLandmarks,
  supportConstraint,
  supportIntent,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
  supportConstraint: MovementSupportConstraintDecision;
  supportIntent: MovementSupportIntentDecision;
}): MovementAvatarSupportPresentationDecision {
  if (supportIntent.key === "feet-floor") {
    return resolveMovementAvatarStandingSupportPresentationPose({ exercisePose, poseLandmarks }) ?? none();
  }

  if (supportConstraint.status === "active") return none();
  if (supportIntent.key === "unknown-support") return none("support-presentation-unknown");

  if (supportIntent.key === "seat-chair") {
    return resolveMovementAvatarSeatedSupportPresentationPose({ exercisePose, poseLandmarks });
  }

  if (supportIntent.key === "knees-floor") {
    return resolveMovementAvatarKneelingSupportPresentationPose({ exercisePose });
  }

  if (supportIntent.key === "hands-feet-floor") {
    return resolveMovementAvatarHandsFeetSupportPresentationPose({ exercisePose, poseLandmarks });
  }

  if (supportIntent.key === "hands-knees-floor") {
    return resolveMovementAvatarHandsKneesSupportPresentationPose({ exercisePose, poseLandmarks });
  }

  if (supportIntent.key === "back-floor") {
    return resolveMovementAvatarSupineSupportPresentationPose({ exercisePose, poseLandmarks });
  }

  if (supportIntent.key === "chest-floor") {
    return resolveMovementAvatarProneSupportPresentationPose({ exercisePose, poseLandmarks });
  }

  if (supportIntent.key === "side-body-floor") {
    return resolveMovementAvatarSideBodySupportPresentationPose({ exercisePose, poseLandmarks });
  }

  return none();
}
