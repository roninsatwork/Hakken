import type { MovementBodyOrientationDecision } from "./movementBodyOrientation";
import { resolveMovementExercisePose, type MovementExercisePoseDecision } from "./movementExercisePose";
import { resolveMovementSupportContacts, type MovementSupportContactDecision } from "./movementSupportContact";
import { resolveMovementSupportConstraint, type MovementSupportConstraintDecision } from "./movementSupportConstraint";
import { resolveMovementSupportIntent, type MovementSupportIntentDecision } from "./movementSupportIntent";
import {
  resolveMovementAvatarSupportContactLocks,
  type MovementAvatarSupportContactLockDecision,
} from "./movementAvatarSupportContactDecision";
import {
  hasDeepKneelingSupportBase,
  hasWideSeatedSupportBase,
} from "./movementAvatarPipelineSupportEvidence";
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
  preferFeetFloorForActiveLowerBody = false,
  poseLandmarks,
}: {
  bodyOrientation: MovementBodyOrientationDecision;
  preferFeetFloorForActiveLowerBody?: boolean;
  poseLandmarks: TrackingLandmark[];
}): MovementAvatarPipelineSupportDecision {
  const initialBodySupport = resolveMovementSupportContacts({
    bodyOrientation,
    poseLandmarks,
  });
  const initialExercisePose = resolveMovementExercisePose({
    bodyOrientation,
    bodySupport: initialBodySupport,
    poseLandmarks,
  });
  const shouldUseStandingSupport =
    preferFeetFloorForActiveLowerBody &&
    (
      (
        bodyOrientation.orientation === "seated" &&
        initialExercisePose.poseKey === "chair-seated" &&
        !hasWideSeatedSupportBase(poseLandmarks)
      ) ||
      (
        bodyOrientation.orientation === "kneeling" &&
        initialExercisePose.poseKey === "kneeling-floor" &&
        !hasDeepKneelingSupportBase(poseLandmarks)
      )
    );
  const supportBodyOrientation = shouldUseStandingSupport
    ? {
        ...bodyOrientation,
        coverageFamily: "upright" as const,
        orientation: "upright" as const,
        reasons: [
          ...bodyOrientation.reasons,
          "active standing lower-body evidence keeps inferred chair support on foot anchors",
        ],
      }
    : bodyOrientation;
  const bodySupport = shouldUseStandingSupport
    ? resolveMovementSupportContacts({
        bodyOrientation: supportBodyOrientation,
        poseLandmarks,
      })
    : initialBodySupport;
  const exercisePose = shouldUseStandingSupport
    ? resolveMovementExercisePose({
        bodyOrientation: supportBodyOrientation,
        bodySupport,
        poseLandmarks,
      })
    : initialExercisePose;
  const supportIntent = resolveMovementSupportIntent({ bodySupport, exercisePose });
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
