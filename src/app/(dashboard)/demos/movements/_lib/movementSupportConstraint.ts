import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { MovementSupportIntentDecision } from "./movementSupportIntent";

export type MovementSupportConstraintLayer =
  | "body-plane-floor-contact"
  | "foot-floor-lock"
  | "hand-floor-lock"
  | "knee-floor-lock"
  | "pelvis-chair-support"
  | "root-height"
  | "root-tilt"
  | "support-anchor-correction"
  | "wrist-support";

export type MovementSupportConstraintStatus =
  | "active"
  | "missing"
  | "partial-contact-correction"
  | "partial-root-only";

export type MovementSupportConstraintDecision = {
  activeLayers: MovementSupportConstraintLayer[];
  confidence: number;
  missingLayers: MovementSupportConstraintLayer[];
  owner: string;
  status: MovementSupportConstraintStatus;
  summary: string;
};

function buildConstraint({
  activeLayers,
  confidence,
  missingLayers,
  owner,
  status,
  summary,
}: MovementSupportConstraintDecision): MovementSupportConstraintDecision {
  return {
    activeLayers,
    confidence,
    missingLayers,
    owner,
    status,
    summary,
  };
}

export function resolveMovementSupportConstraint({
  exercisePose,
  supportIntent,
}: {
  exercisePose: MovementExercisePoseDecision;
  supportIntent: MovementSupportIntentDecision;
}): MovementSupportConstraintDecision {
  if (supportIntent.key === "feet-floor") {
    return buildConstraint({
      activeLayers: ["foot-floor-lock"],
      confidence: supportIntent.confidence,
      missingLayers: [],
      owner: "support-feet-floor",
      status: "active",
      summary: "Standing foot-floor support can use the existing foot-lock layer.",
    });
  }

  if (supportIntent.key === "seat-chair") {
    return buildConstraint({
      activeLayers: ["root-height", "support-anchor-correction"],
      confidence: supportIntent.confidence,
      missingLayers: ["pelvis-chair-support"],
      owner: "support-seat-chair-contact-correction",
      status: "partial-contact-correction",
      summary: "Seated support lowers the avatar root and can correct the hips toward a virtual seat plane; exact chair/pelvis IK is not implemented yet.",
    });
  }

  if (supportIntent.key === "knees-floor") {
    return buildConstraint({
      activeLayers: ["root-height", "support-anchor-correction"],
      confidence: supportIntent.confidence,
      missingLayers: ["knee-floor-lock"],
      owner: "support-knees-floor-contact-correction",
      status: "partial-contact-correction",
      summary: "Kneeling support lowers the avatar root and can correct knee anchors toward the floor; exact knee-floor locking is not implemented yet.",
    });
  }

  if (supportIntent.key === "hands-knees-floor") {
    return buildConstraint({
      activeLayers: ["root-height", "root-tilt", "support-anchor-correction"],
      confidence: supportIntent.confidence,
      missingLayers: ["hand-floor-lock", "knee-floor-lock", "wrist-support"],
      owner: "support-hands-knees-contact-correction",
      status: "partial-contact-correction",
      summary: "All-fours support can tilt/lower the root and correct hand/knee anchors toward the floor; exact hand, wrist, and knee constraints are not implemented yet.",
    });
  }

  if (supportIntent.key === "hands-feet-floor") {
    return buildConstraint({
      activeLayers: ["root-height", "root-tilt", "support-anchor-correction"],
      confidence: supportIntent.confidence,
      missingLayers: ["hand-floor-lock", "foot-floor-lock", "wrist-support"],
      owner: "support-hands-feet-contact-correction",
      status: "partial-contact-correction",
      summary: "Hands-and-feet support can tilt/lower the root and correct hand/foot anchors toward the floor; exact wrist, hand, and foot locks are not implemented yet.",
    });
  }

  if (
    supportIntent.key === "back-floor" ||
    supportIntent.key === "chest-floor" ||
    supportIntent.key === "side-body-floor"
  ) {
    return buildConstraint({
      activeLayers: ["root-height", "root-tilt", "body-plane-floor-contact", "support-anchor-correction"],
      confidence: supportIntent.confidence,
      missingLayers: [],
      owner: `support-${supportIntent.key}-contact-correction`,
      status: "partial-contact-correction",
      summary: `${exercisePose.label} can tilt/lower the avatar root and correct multiple body-plane anchors toward the floor; exact per-limb/body IK remains approximate.`,
    });
  }

  return buildConstraint({
    activeLayers: [],
    confidence: 0,
    missingLayers: [
      "body-plane-floor-contact",
      "foot-floor-lock",
      "hand-floor-lock",
      "knee-floor-lock",
      "pelvis-chair-support",
    ],
    owner: "support-unknown",
    status: "missing",
    summary: "No support constraint can be applied to this frame yet.",
  });
}
