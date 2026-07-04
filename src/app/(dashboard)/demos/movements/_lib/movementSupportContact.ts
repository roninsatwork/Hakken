import type { MovementBodyOrientationDecision } from "./movementBodyOrientation";
import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementSupportSurface = "none" | "floor" | "chair" | "mat" | "unknown";

export type MovementContactPoint =
  | "leftFoot"
  | "rightFoot"
  | "leftHand"
  | "rightHand"
  | "leftKnee"
  | "rightKnee"
  | "leftHip"
  | "rightHip"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "seat"
  | "sideBody"
  | "back"
  | "belly"
  | "chest";

export type MovementSupportContact = {
  confidence: number;
  point: MovementContactPoint;
  state: "active" | "inferred" | "rejected";
  surface: MovementSupportSurface;
};

export type MovementSupportContactDecision = {
  confidence: number;
  contacts: MovementSupportContact[];
  primarySurface: MovementSupportSurface;
  reasons: string[];
  supportLabel: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function visibility(landmark?: TrackingLandmark | null) {
  return landmark?.visibility ?? 0.8;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function midpoint(a: TrackingLandmark, b: TrackingLandmark) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: average([visibility(a), visibility(b)]),
  };
}

function contact(
  point: MovementContactPoint,
  surface: MovementSupportSurface,
  confidence: number,
  state: MovementSupportContact["state"] = "active",
): MovementSupportContact {
  return {
    confidence: clamp(confidence),
    point,
    state,
    surface,
  };
}

function formatSupportLabel(decision: MovementSupportContactDecision) {
  if (decision.contacts.length === 0) return `${decision.primarySurface}:none`;

  const contacts = decision.contacts
    .filter((item) => item.state !== "rejected")
    .map((item) => `${item.point}:${item.state}:${item.confidence.toFixed(2)}`)
    .join(",");

  return `${decision.primarySurface}:${contacts || "none"}`;
}

function buildDecision({
  contacts,
  primarySurface,
  reasons,
}: {
  contacts: MovementSupportContact[];
  primarySurface: MovementSupportSurface;
  reasons: string[];
}): MovementSupportContactDecision {
  const activeContacts = contacts.filter((item) => item.state !== "rejected");
  const confidence = activeContacts.length > 0
    ? average(activeContacts.map((item) => item.confidence))
    : 0;
  const decision = {
    confidence: clamp(confidence),
    contacts,
    primarySurface,
    reasons,
    supportLabel: "",
  };

  return {
    ...decision,
    supportLabel: formatSupportLabel(decision),
  };
}

function footContacts(poseLandmarks: TrackingLandmark[]) {
  const leftFootConfidence = Math.max(
    visibility(poseLandmarks[27]),
    visibility(poseLandmarks[29]),
    visibility(poseLandmarks[31]),
  );
  const rightFootConfidence = Math.max(
    visibility(poseLandmarks[28]),
    visibility(poseLandmarks[30]),
    visibility(poseLandmarks[32]),
  );

  return [
    contact("leftFoot", "floor", leftFootConfidence),
    contact("rightFoot", "floor", rightFootConfidence),
  ];
}

function handContacts(poseLandmarks: TrackingLandmark[]) {
  return [
    contact("leftHand", "floor", visibility(poseLandmarks[15])),
    contact("rightHand", "floor", visibility(poseLandmarks[16])),
  ];
}

function kneeContacts(poseLandmarks: TrackingLandmark[]) {
  return [
    contact("leftKnee", "floor", visibility(poseLandmarks[25])),
    contact("rightKnee", "floor", visibility(poseLandmarks[26])),
  ];
}

function hipContacts(poseLandmarks: TrackingLandmark[], state: MovementSupportContact["state"] = "inferred") {
  return [
    contact("leftHip", "floor", visibility(poseLandmarks[23]), state),
    contact("rightHip", "floor", visibility(poseLandmarks[24]), state),
  ];
}

function shoulderContacts(poseLandmarks: TrackingLandmark[], state: MovementSupportContact["state"] = "inferred") {
  return [
    contact("leftShoulder", "floor", visibility(poseLandmarks[11]), state),
    contact("rightShoulder", "floor", visibility(poseLandmarks[12]), state),
  ];
}

function sideBodyContacts(
  side: "left" | "right",
  poseLandmarks: TrackingLandmark[],
  confidence: number,
) {
  const sideContacts = side === "left"
    ? [
        contact("leftHip", "floor", visibility(poseLandmarks[23]), "inferred" as const),
        contact("leftShoulder", "floor", visibility(poseLandmarks[11]), "inferred" as const),
        contact("leftElbow", "floor", visibility(poseLandmarks[13]), "inferred" as const),
      ]
    : [
        contact("rightHip", "floor", visibility(poseLandmarks[24]), "inferred" as const),
        contact("rightShoulder", "floor", visibility(poseLandmarks[12]), "inferred" as const),
        contact("rightElbow", "floor", visibility(poseLandmarks[14]), "inferred" as const),
      ];

  return [
    contact("sideBody", "floor", confidence, "inferred"),
    ...sideContacts,
  ];
}

export function resolveMovementSupportContacts({
  bodyOrientation,
  poseLandmarks,
}: {
  bodyOrientation: MovementBodyOrientationDecision;
  poseLandmarks: TrackingLandmark[];
}): MovementSupportContactDecision {
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  const hips = leftHip && rightHip ? midpoint(leftHip, rightHip) : null;

  if (bodyOrientation.orientation === "upright") {
    return buildDecision({
      contacts: footContacts(poseLandmarks),
      primarySurface: "floor",
      reasons: ["upright body is supported by feet"],
    });
  }

  if (bodyOrientation.orientation === "seated") {
    return buildDecision({
      contacts: [
        contact("seat", "chair", hips?.visibility ?? bodyOrientation.confidence, "inferred"),
        ...footContacts(poseLandmarks),
      ],
      primarySurface: "chair",
      reasons: ["seated body needs an explicit seat support model before avatar animation"],
    });
  }

  if (bodyOrientation.orientation === "kneeling") {
    return buildDecision({
      contacts: kneeContacts(poseLandmarks),
      primarySurface: "floor",
      reasons: ["kneeling body is supported by knees"],
    });
  }

  if (bodyOrientation.orientation === "quadruped") {
    return buildDecision({
      contacts: [
        ...handContacts(poseLandmarks),
        ...kneeContacts(poseLandmarks),
        ...footContacts(poseLandmarks),
      ],
      primarySurface: "floor",
      reasons: ["quadruped body is supported by hands plus knees and/or feet"],
    });
  }

  if (
    bodyOrientation.orientation === "sideLyingLeft" ||
    bodyOrientation.orientation === "sideLyingRight"
  ) {
    return buildDecision({
      contacts: sideBodyContacts(
        bodyOrientation.orientation === "sideLyingLeft" ? "left" : "right",
        poseLandmarks,
        bodyOrientation.confidence,
      ),
      primarySurface: "floor",
      reasons: ["side-lying body uses side hip, shoulder, and arm body-plane floor anchors"],
    });
  }

  if (bodyOrientation.orientation === "supine") {
    return buildDecision({
      contacts: [
        contact("back", "floor", bodyOrientation.confidence, "inferred"),
        ...shoulderContacts(poseLandmarks),
        ...hipContacts(poseLandmarks),
        ...footContacts(poseLandmarks),
      ],
      primarySurface: "floor",
      reasons: ["supine body uses back, shoulder, hip, and foot floor anchors"],
    });
  }

  if (bodyOrientation.orientation === "prone") {
    return buildDecision({
      contacts: [
        contact("chest", "floor", bodyOrientation.confidence, "inferred"),
        contact("belly", "floor", bodyOrientation.confidence * 0.9, "inferred"),
        ...hipContacts(poseLandmarks),
        ...handContacts(poseLandmarks),
        ...footContacts(poseLandmarks),
      ],
      primarySurface: "floor",
      reasons: ["prone body uses chest, belly, hip, hand, and foot floor anchors"],
    });
  }

  return buildDecision({
    contacts: [],
    primarySurface: "unknown",
    reasons: ["support contacts are unavailable for this body orientation"],
  });
}
