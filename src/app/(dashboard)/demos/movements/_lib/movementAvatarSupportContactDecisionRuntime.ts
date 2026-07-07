import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { MovementSupportConstraintDecision } from "./movementSupportConstraint";
import type { MovementSupportIntentDecision } from "./movementSupportIntent";
import type { MovementAvatarSupportContactLockDecision } from "./movementAvatarSupportContactDecisionTypes";
import {
  inactiveSupportContactLocks,
  partialSupportContactLocks,
  supportContactAnchor,
  supportContactAnchorsForPoints,
} from "./movementAvatarSupportContactAnchors";

export function resolveMovementAvatarSupportContactLocks({
  exercisePose,
  supportConstraint,
  supportIntent,
}: {
  exercisePose: MovementExercisePoseDecision;
  supportConstraint: MovementSupportConstraintDecision;
  supportIntent: MovementSupportIntentDecision;
}): MovementAvatarSupportContactLockDecision {
  if (supportConstraint.status === "active" || supportIntent.key === "feet-floor") {
    return inactiveSupportContactLocks("support-contact-locks-standing-foot-lock");
  }

  if (!supportConstraint.activeLayers.includes("support-anchor-correction")) {
    return inactiveSupportContactLocks("support-contact-locks-unavailable");
  }

  if (supportIntent.key === "seat-chair") {
    return partialSupportContactLocks({
      anchors: [
        supportContactAnchor("hips", "pelvis to virtual seat", "chair", 0.62, 1.2),
        supportContactAnchor("rightFoot", "right foot to floor", "floor", 0.02, 0.45),
        supportContactAnchor("leftFoot", "left foot to floor", "floor", 0.02, 0.45),
      ],
      boneCorrectionScale: 0.035,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.025,
      owner: "support-contact-seat-chair",
      slerp: 0.1,
    });
  }

  if (supportIntent.key === "knees-floor") {
    return partialSupportContactLocks({
      anchors: [
        supportContactAnchor("rightLowerLeg", "right knee to floor", "floor", 0.04, 1),
        supportContactAnchor("leftLowerLeg", "left knee to floor", "floor", 0.04, 1),
        supportContactAnchor("rightFoot", "right foot to floor", "floor", 0.02, 0.4),
        supportContactAnchor("leftFoot", "left foot to floor", "floor", 0.02, 0.4),
      ],
      boneCorrectionScale: 0.04,
      maxBoneCorrection: 0.03,
      owner: "support-contact-knees-floor",
    });
  }

  if (supportIntent.key === "hands-knees-floor") {
    return partialSupportContactLocks({
      anchors: [
        supportContactAnchor("rightHand", "right hand to floor", "floor", 0.03, 0.85),
        supportContactAnchor("leftHand", "left hand to floor", "floor", 0.03, 0.85),
        supportContactAnchor("rightLowerLeg", "right knee to floor", "floor", 0.04, 1),
        supportContactAnchor("leftLowerLeg", "left knee to floor", "floor", 0.04, 1),
      ],
      boneCorrectionScale: 0.05,
      maxCorrection: 0.18,
      maxBoneCorrection: 0.035,
      owner: "support-contact-hands-knees-floor",
      rootCorrectionScale: 0.94,
      slerp: 0.11,
    });
  }

  if (supportIntent.key === "hands-feet-floor") {
    return partialSupportContactLocks({
      anchors: [
        supportContactAnchor("rightHand", "right hand to floor", "floor", 0.03, 0.9),
        supportContactAnchor("leftHand", "left hand to floor", "floor", 0.03, 0.9),
        supportContactAnchor("rightFoot", "right foot to floor", "floor", 0.02, 1),
        supportContactAnchor("leftFoot", "left foot to floor", "floor", 0.02, 1),
      ],
      boneCorrectionScale: 0.05,
      maxCorrection: 0.18,
      maxBoneCorrection: 0.035,
      owner: "support-contact-hands-feet-floor",
      rootCorrectionScale: 0.92,
      slerp: 0.11,
    });
  }

  if (supportIntent.key === "back-floor") {
    if (exercisePose.poseKey === "pilates-bridge-prep") {
      return partialSupportContactLocks({
        anchors: [
          supportContactAnchor("spine", "upper back to floor", "floor", 0.1, 1),
          supportContactAnchor("chest", "shoulders to floor", "floor", 0.12, 0.85),
          supportContactAnchor("leftFoot", "left bridge foot to floor", "floor", 0.02, 1),
          supportContactAnchor("rightFoot", "right bridge foot to floor", "floor", 0.02, 1),
        ],
        boneCorrectionScale: 0.08,
        maxCorrection: 0.14,
        maxBoneCorrection: 0.055,
        owner: "support-contact-bridge-floor",
        rootCorrectionScale: 0.82,
        slerp: 0.1,
      });
    }

    const fallbackAnchors = [
      supportContactAnchor("hips", "hips/back to floor", "floor", 0.08, 1),
      supportContactAnchor("spine", "spine to floor", "floor", 0.1, 0.8),
      supportContactAnchor("chest", "upper back to floor", "floor", 0.12, 0.7),
    ];

    return partialSupportContactLocks({
      anchors: supportContactAnchorsForPoints(supportIntent.anchorPoints, fallbackAnchors),
      boneCorrectionScale: 0.08,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.055,
      owner: "support-contact-back-floor",
      rootCorrectionScale: 0.88,
      slerp: 0.1,
    });
  }

  if (supportIntent.key === "chest-floor") {
    if (exercisePose.poseKey === "prone-back-extension-prep") {
      return partialSupportContactLocks({
        anchors: [
          supportContactAnchor("spine", "belly to floor", "floor", 0.1, 0.85),
          supportContactAnchor("hips", "front hips to floor", "floor", 0.08, 0.9),
          supportContactAnchor("leftHand", "left cobra hand to floor", "floor", 0.03, 0.85),
          supportContactAnchor("rightHand", "right cobra hand to floor", "floor", 0.03, 0.85),
          supportContactAnchor("leftFoot", "left prone foot to floor", "floor", 0.02, 0.5),
          supportContactAnchor("rightFoot", "right prone foot to floor", "floor", 0.02, 0.5),
        ],
        boneCorrectionScale: 0.075,
        maxCorrection: 0.14,
        maxBoneCorrection: 0.05,
        owner: "support-contact-prone-extension-floor",
        rootCorrectionScale: 0.84,
        slerp: 0.1,
      });
    }

    const fallbackAnchors = [
      supportContactAnchor("chest", "chest to floor", "floor", 0.08, 1),
      supportContactAnchor("hips", "front hips to floor", "floor", 0.08, 0.85),
      supportContactAnchor("spine", "belly to floor", "floor", 0.1, 0.65),
    ];

    return partialSupportContactLocks({
      anchors: supportContactAnchorsForPoints(supportIntent.anchorPoints, fallbackAnchors),
      boneCorrectionScale: 0.08,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.055,
      owner: "support-contact-chest-floor",
      rootCorrectionScale: 0.88,
      slerp: 0.1,
    });
  }

  if (supportIntent.key === "side-body-floor") {
    const fallbackAnchors = [
      supportContactAnchor("hips", "side hip to floor", "floor", 0.08, 1),
      supportContactAnchor("chest", "side ribs to floor", "floor", 0.1, 0.75),
      supportContactAnchor("leftUpperArm", "lower arm side support", "floor", 0.08, 0.45),
    ];

    return partialSupportContactLocks({
      anchors: supportContactAnchorsForPoints(supportIntent.anchorPoints, fallbackAnchors),
      boneCorrectionScale: 0.075,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.05,
      owner: "support-contact-side-body-floor",
      rootCorrectionScale: 0.86,
      slerp: 0.1,
    });
  }

  return inactiveSupportContactLocks("support-contact-locks-unknown");
}
