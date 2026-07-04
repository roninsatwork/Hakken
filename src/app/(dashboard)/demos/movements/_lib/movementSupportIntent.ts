import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type {
  MovementContactPoint,
  MovementSupportContactDecision,
  MovementSupportSurface,
} from "./movementSupportContact";

export type MovementSupportIntentKey =
  | "back-floor"
  | "chest-floor"
  | "feet-floor"
  | "hands-feet-floor"
  | "hands-knees-floor"
  | "knees-floor"
  | "seat-chair"
  | "side-body-floor"
  | "unknown-support";

export type MovementSupportConstraintStatus =
  | "active"
  | "diagnostic-only"
  | "missing";

export type MovementSupportIntentDecision = {
  anchorPoints: MovementContactPoint[];
  confidence: number;
  key: MovementSupportIntentKey;
  label: string;
  primarySurface: MovementSupportSurface;
  priority: number;
  status: MovementSupportConstraintStatus;
  summary: string;
};

function activePoints(bodySupport: MovementSupportContactDecision) {
  return bodySupport.contacts
    .filter((contact) => contact.state !== "rejected")
    .map((contact) => contact.point);
}

function hasEveryPoint(points: MovementContactPoint[], required: MovementContactPoint[]) {
  return required.every((point) => points.includes(point));
}

function pointsInOrder(points: MovementContactPoint[], ordered: MovementContactPoint[]) {
  return ordered.filter((point) => points.includes(point));
}

function buildIntent({
  anchorPoints,
  confidence,
  key,
  label,
  primarySurface,
  priority,
  status = "diagnostic-only",
  summary,
}: Omit<MovementSupportIntentDecision, "status"> & {
  status?: MovementSupportConstraintStatus;
}): MovementSupportIntentDecision {
  return {
    anchorPoints,
    confidence,
    key,
    label,
    primarySurface,
    priority,
    status,
    summary,
  };
}

export function resolveMovementSupportIntent({
  bodySupport,
  exercisePose,
}: {
  bodySupport: MovementSupportContactDecision;
  exercisePose: MovementExercisePoseDecision;
}): MovementSupportIntentDecision {
  const points = activePoints(bodySupport);

  if (points.includes("seat")) {
    return buildIntent({
      anchorPoints: ["seat"],
      confidence: bodySupport.confidence,
      key: "seat-chair",
      label: "Seat on chair",
      primarySurface: "chair",
      priority: 2,
      summary: "The pelvis/seat contact is inferred as chair support.",
    });
  }

  if (
    (
      exercisePose.poseKey === "yoga-plank-prep" ||
      exercisePose.poseKey === "yoga-down-dog-prep" ||
      exercisePose.poseKey === "bear-crawl-prep"
    ) &&
    hasEveryPoint(points, ["leftHand", "rightHand", "leftFoot", "rightFoot"])
  ) {
    return buildIntent({
      anchorPoints: ["leftHand", "rightHand", "leftFoot", "rightFoot"],
      confidence: bodySupport.confidence,
      key: "hands-feet-floor",
      label: "Hands and feet on floor",
      primarySurface: "floor",
      priority: 4,
      summary: "Both hands and both feet are available as floor support anchors.",
    });
  }

  if (hasEveryPoint(points, ["leftHand", "rightHand", "leftKnee", "rightKnee"])) {
    return buildIntent({
      anchorPoints: ["leftHand", "rightHand", "leftKnee", "rightKnee"],
      confidence: bodySupport.confidence,
      key: "hands-knees-floor",
      label: "Hands and knees on floor",
      primarySurface: "floor",
      priority: 3,
      summary: "Both hands and both knees are available as floor support anchors.",
    });
  }

  if (points.includes("sideBody")) {
    return buildIntent({
      anchorPoints: pointsInOrder(points, [
        "sideBody",
        "leftHip",
        "rightHip",
        "leftShoulder",
        "rightShoulder",
        "leftElbow",
        "rightElbow",
      ]),
      confidence: bodySupport.confidence,
      key: "side-body-floor",
      label: "Side body on floor",
      primarySurface: "floor",
      priority: 3,
      summary: "Side-body contact is inferred with hip, shoulder, and arm floor-plane anchors.",
    });
  }

  if (points.includes("back")) {
    return buildIntent({
      anchorPoints: pointsInOrder(points, [
        "back",
        "leftShoulder",
        "rightShoulder",
        "leftHip",
        "rightHip",
        "leftFoot",
        "rightFoot",
      ]),
      confidence: bodySupport.confidence,
      key: "back-floor",
      label: "Back on floor",
      primarySurface: "floor",
      priority: exercisePose.poseKey === "pilates-bridge-prep" ? 4 : 3,
      summary: "Back contact is inferred with shoulder, hip, and foot floor-plane anchors.",
    });
  }

  if (points.includes("chest")) {
    return buildIntent({
      anchorPoints: pointsInOrder(points, [
        "chest",
        "belly",
        "leftHip",
        "rightHip",
        "leftHand",
        "rightHand",
        "leftFoot",
        "rightFoot",
      ]),
      confidence: bodySupport.confidence,
      key: "chest-floor",
      label: "Chest on floor",
      primarySurface: "floor",
      priority: exercisePose.poseKey === "prone-back-extension-prep" ? 4 : 3,
      summary: "Chest and belly contact are inferred with hip, hand, and foot floor-plane anchors.",
    });
  }

  if (hasEveryPoint(points, ["leftFoot", "rightFoot"])) {
    return buildIntent({
      anchorPoints: ["leftFoot", "rightFoot"],
      confidence: bodySupport.confidence,
      key: "feet-floor",
      label: "Feet on floor",
      primarySurface: "floor",
      priority: exercisePose.poseKey === "standing-neutral" ? 1 : 2,
      status: exercisePose.status === "supported" ? "active" : "diagnostic-only",
      summary: "Both feet are available as floor support anchors.",
    });
  }

  if (hasEveryPoint(points, ["leftKnee", "rightKnee"])) {
    return buildIntent({
      anchorPoints: ["leftKnee", "rightKnee"],
      confidence: bodySupport.confidence,
      key: "knees-floor",
      label: "Knees on floor",
      primarySurface: "floor",
      priority: 2,
      summary: "Both knees are available as floor support anchors.",
    });
  }

  return buildIntent({
    anchorPoints: [],
    confidence: 0,
    key: "unknown-support",
    label: "Unknown support",
    primarySurface: bodySupport.primarySurface,
    priority: 0,
    status: "missing",
    summary: "No support constraint intent can be assigned to this frame.",
  });
}
