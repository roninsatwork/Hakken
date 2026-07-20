import type { MovementDebugReplayFrame } from "./movementDebugReplay";
import type { MovementDeepCaptureFrameEvidence } from "./movementDeepCaptureContract";
import type {
  MovementHandsForConfidence,
  TrackingLandmark,
} from "./movementTrackingCalibration";

export type MovementSourceOrigin = "live-webcam" | "recorded-replay" | "synthetic-proof";

export type MovementSourceStatus =
  | "raw"
  | "smoothed"
  | "decoded"
  | "synthetic"
  | "held-last-good";

export type MovementBlendshape = {
  categoryName: string;
  score: number;
};

export type MovementCameraConfidenceState = "ready" | "partial" | "uncertain" | "lost";

export type MovementCameraMessageEvent =
  | "move-where-i-can-see-you"
  | "step-back"
  | "step-closer"
  | "show-your-hands"
  | "show-your-feet";

export type MovementCameraBodyPart =
  | "head"
  | "torso"
  | "leftArm"
  | "rightArm"
  | "leftHand"
  | "rightHand"
  | "leftLeg"
  | "rightLeg"
  | "leftFoot"
  | "rightFoot";

export type MovementCameraConfidence = {
  bodyPartConfidence: Record<MovementCameraBodyPart, number>;
  frameVisibility: number;
  isStale: boolean;
  messageEvents: MovementCameraMessageEvent[];
  reasons: string[];
  score: number;
  scoreAllowed: boolean;
  state: MovementCameraConfidenceState;
};

export type MovementCameraConfidenceRecoveryCue = {
  event?: MovementCameraMessageEvent;
  message: string;
  reasons: string[];
  state: MovementCameraConfidenceState;
};

export type MovementStartReadinessState =
  | "countdown"
  | "checking-visibility"
  | "calibrating"
  | "ready"
  | "blocked";

export type MovementStartPromptEvent =
  | "get-ready"
  | "walk-back-into-frame"
  | "show-your-whole-body"
  | "show-your-hands"
  | "show-your-feet"
  | "hold-still-for-calibration";

export type MovementStartReadiness = {
  blockedReasons: string[];
  calibrationQuality: number | null;
  canStartGame: boolean;
  canStartRecording: boolean;
  countdownMsRemaining: number;
  promptEvents: MovementStartPromptEvent[];
  requiredBodyParts: MovementCameraBodyPart[];
  state: MovementStartReadinessState;
  visibleBodyParts: MovementCameraBodyPart[];
};

export type MovementStartReadinessTarget = "game" | "recording";
export type MovementStartSpineReadinessStatus = "blocked" | "needs-attention" | "ready";

export type MovementStartGateDecision = {
  blockedReasons: string[];
  canStart: boolean;
  promptEvents: MovementStartPromptEvent[];
  readiness: MovementStartReadiness | null;
  state: MovementStartReadinessState | "missing-readiness";
  target: MovementStartReadinessTarget;
};

export type MovementSourceFrame = {
  camera?: MovementDebugReplayFrame["camera"];
  cameraConfidence: MovementCameraConfidence;
  capturedAt: number;
  frameId?: string;
  landmarks: {
    blendshapes?: MovementBlendshape[];
    deepCapture?: MovementDeepCaptureFrameEvidence;
    hands?: MovementHandsForConfidence;
    pose: TrackingLandmark[];
    worldPose: TrackingLandmark[];
  };
  movementId?: string;
  sessionId?: string;
  sourceOrigin: MovementSourceOrigin;
  sourceStatus: MovementSourceStatus;
  startReadiness: MovementStartReadiness;
};

export type MovementSourceFrameRequirements = {
  bodyParts?: MovementCameraBodyPart[];
  calibrationQuality?: number | null;
  countdownMsRemaining?: number;
  mode?: "full-body" | "upper-body";
};

export const MOVEMENT_START_MIN_CALIBRATION_QUALITY = 0.55;

export type BuildMovementSourceFrameInput = {
  blendshapes?: MovementBlendshape[];
  camera?: MovementDebugReplayFrame["camera"];
  capturedAt?: number;
  deepCapture?: MovementDeepCaptureFrameEvidence;
  frameId?: string;
  hands?: MovementHandsForConfidence;
  movementId?: string;
  previousCapturedAt?: number;
  requirements?: MovementSourceFrameRequirements;
  sessionId?: string;
  sourceOrigin: MovementSourceOrigin;
  sourceStatus: MovementSourceStatus;
  staleAfterMs?: number;
  poseLandmarks: TrackingLandmark[];
  worldPoseLandmarks?: TrackingLandmark[];
};

const FULL_BODY_REQUIREMENTS: MovementCameraBodyPart[] = [
  "head",
  "torso",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
  "leftFoot",
  "rightFoot",
];

const UPPER_BODY_REQUIREMENTS: MovementCameraBodyPart[] = [
  "head",
  "torso",
  "leftArm",
  "rightArm",
];

const BODY_PART_LANDMARKS: Record<MovementCameraBodyPart, number[]> = {
  head: [0, 7, 8],
  torso: [11, 12, 23, 24],
  leftArm: [11, 13, 15],
  rightArm: [12, 14, 16],
  leftHand: [15, 17, 19, 21],
  rightHand: [16, 18, 20, 22],
  leftLeg: [23, 25, 27],
  rightLeg: [24, 26, 28],
  leftFoot: [27, 29, 31],
  rightFoot: [28, 30, 32],
};

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function confidenceForLandmark(landmark: TrackingLandmark | undefined) {
  if (!landmark) return 0;
  const visibility = landmark.visibility ?? 1;
  const inFrame =
    landmark.x >= 0.02 &&
    landmark.x <= 0.98 &&
    landmark.y >= 0.02 &&
    landmark.y <= 0.98;

  return clamp01(visibility) * (inFrame ? 1 : 0.25);
}

function isLandmarkGeometricallyInFrame(landmark: TrackingLandmark | undefined) {
  return Boolean(
    landmark &&
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    landmark.x >= 0.02 &&
    landmark.x <= 0.98 &&
    landmark.y >= 0.02 &&
    landmark.y <= 0.98
  );
}

function isBodyPartGeometricallyInFrame(
  poseLandmarks: TrackingLandmark[],
  part: MovementCameraBodyPart,
) {
  return BODY_PART_LANDMARKS[part].every((index) => (
    isLandmarkGeometricallyInFrame(poseLandmarks[index])
  ));
}

export const MOVEMENT_STRICT_WHOLE_BODY_MIN_VISIBILITY = 0.5;

export type MovementStrictWholeBodyVisibility = {
  missingBodyParts: MovementCameraBodyPart[];
  wholeBodyVisible: boolean;
};

// The pose model always emits all 33 landmarks, guessing in-frame positions
// for body parts the camera cannot actually see (for example the legs of a
// seated player). Geometry alone therefore cannot gate "whole body visible":
// each landmark must also carry real per-landmark visibility confidence.
// This check is additive and never stored in recordings, so replaying older
// packets keeps their original recorded readiness semantics.
export function resolveMovementStrictWholeBodyVisibility(
  poseLandmarks: TrackingLandmark[] | null | undefined,
  { minVisibility = MOVEMENT_STRICT_WHOLE_BODY_MIN_VISIBILITY }: { minVisibility?: number } = {},
): MovementStrictWholeBodyVisibility {
  if (!poseLandmarks || poseLandmarks.length === 0) {
    return { missingBodyParts: [...FULL_BODY_REQUIREMENTS], wholeBodyVisible: false };
  }
  const missingBodyParts = FULL_BODY_REQUIREMENTS.filter((part) => (
    !BODY_PART_LANDMARKS[part].every((index) => {
      const landmark = poseLandmarks[index];
      return (
        isLandmarkGeometricallyInFrame(landmark) &&
        clamp01(landmark?.visibility ?? 1) >= minVisibility
      );
    })
  ));
  return { missingBodyParts, wholeBodyVisible: missingBodyParts.length === 0 };
}

function hasCompleteFiniteLandmarkStructure(
  landmarks: TrackingLandmark[],
  requiredCount: number,
  requireDepth = false,
) {
  if (landmarks.length < requiredCount) return false;

  return landmarks.slice(0, requiredCount).every((landmark) => (
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    (!requireDepth || Number.isFinite(landmark.z))
  ));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function cloneTrackingLandmarks(landmarks: TrackingLandmark[] = []) {
  return landmarks.map((landmark) => ({ ...landmark }));
}

function cloneMovementHands(hands?: MovementHandsForConfidence): MovementHandsForConfidence | undefined {
  if (!hands) return undefined;

  return Object.fromEntries(
    Object.entries(hands).map(([side, hand]) => [
      side,
      hand ? { ...hand, landmarks: cloneTrackingLandmarks(hand.landmarks ?? []) } : hand,
    ]),
  ) as MovementHandsForConfidence;
}

function getPoseBounds(poseLandmarks: TrackingLandmark[]) {
  const visible = poseLandmarks.filter((landmark) => confidenceForLandmark(landmark) >= 0.2);
  if (visible.length === 0) return null;

  return {
    maxX: Math.max(...visible.map((landmark) => landmark.x)),
    maxY: Math.max(...visible.map((landmark) => landmark.y)),
    minX: Math.min(...visible.map((landmark) => landmark.x)),
    minY: Math.min(...visible.map((landmark) => landmark.y)),
  };
}

function resolveRequiredBodyParts(requirements?: MovementSourceFrameRequirements) {
  if (requirements?.bodyParts?.length) return requirements.bodyParts;
  return requirements?.mode === "upper-body" ? UPPER_BODY_REQUIREMENTS : FULL_BODY_REQUIREMENTS;
}

function hasTrustworthyRecordingAcquisitionEvidence({
  cameraConfidence,
  poseLandmarks,
  requirements,
  worldPoseLandmarks,
}: {
  cameraConfidence: MovementCameraConfidence;
  poseLandmarks: TrackingLandmark[];
  requirements?: MovementSourceFrameRequirements;
  worldPoseLandmarks: TrackingLandmark[];
}) {
  const requiredBodyParts = resolveRequiredBodyParts(requirements);
  const requiresFullBody = FULL_BODY_REQUIREMENTS.every((part) => requiredBodyParts.includes(part));

  return (
    requiresFullBody &&
    !cameraConfidence.isStale &&
    cameraConfidence.state !== "lost" &&
    cameraConfidence.bodyPartConfidence.head >= 0.3 &&
    cameraConfidence.bodyPartConfidence.torso >= 0.35 &&
    hasCompleteFiniteLandmarkStructure(poseLandmarks, 33) &&
    hasCompleteFiniteLandmarkStructure(worldPoseLandmarks, 33, true)
  );
}

const CAMERA_CONFIDENCE_EVENT_MESSAGES: Record<MovementCameraMessageEvent, string> = {
  "move-where-i-can-see-you": "Move where I can see you.",
  "show-your-feet": "Show both feet.",
  "show-your-hands": "Show your hands.",
  "step-back": "Step back so your whole body is visible.",
  "step-closer": "Step closer so movement stays readable.",
};

const CAMERA_CONFIDENCE_EVENT_PRIORITY: MovementCameraMessageEvent[] = [
  "move-where-i-can-see-you",
  "step-back",
  "step-closer",
  "show-your-feet",
  "show-your-hands",
];

export function getMovementCameraConfidenceRecoveryCue(
  cameraConfidence: MovementCameraConfidence,
): MovementCameraConfidenceRecoveryCue | null {
  const hasOnlyNonBlockingDistalWeakness =
    cameraConfidence.messageEvents.length === 0 &&
    cameraConfidence.reasons.every((reason) => reason === "hands-weak" || reason === "feet-weak");
  if (
    (cameraConfidence.state === "ready" && cameraConfidence.messageEvents.length === 0) ||
    hasOnlyNonBlockingDistalWeakness
  ) {
    return null;
  }

  const priorityEvent = CAMERA_CONFIDENCE_EVENT_PRIORITY.find((event) => (
    cameraConfidence.messageEvents.includes(event)
  ));
  if (priorityEvent) {
    return {
      event: priorityEvent,
      message: CAMERA_CONFIDENCE_EVENT_MESSAGES[priorityEvent],
      reasons: cameraConfidence.reasons,
      state: cameraConfidence.state,
    };
  }

  if (cameraConfidence.reasons.includes("head-weak") || cameraConfidence.reasons.includes("torso-weak")) {
    return {
      message: "Keep head, shoulders, and hips in view.",
      reasons: cameraConfidence.reasons,
      state: cameraConfidence.state,
    };
  }

  return {
    message: "Hold still where I can see you.",
    reasons: cameraConfidence.reasons,
    state: cameraConfidence.state,
  };
}

export function resolveMovementCameraConfidence({
  capturedAt = Date.now(),
  poseLandmarks,
  previousCapturedAt,
  staleAfterMs = 500,
}: {
  capturedAt?: number;
  poseLandmarks: TrackingLandmark[];
  previousCapturedAt?: number;
  staleAfterMs?: number;
}): MovementCameraConfidence {
  const bodyPartConfidence = Object.fromEntries(
    Object.entries(BODY_PART_LANDMARKS).map(([part, indexes]) => [
      part,
      average(indexes.map((index) => confidenceForLandmark(poseLandmarks[index]))),
    ]),
  ) as Record<MovementCameraBodyPart, number>;
  const frameVisibility = average(FULL_BODY_REQUIREMENTS.map((part) => bodyPartConfidence[part]));
  const bounds = getPoseBounds(poseLandmarks);
  const isStale =
    typeof previousCapturedAt === "number" &&
    capturedAt - previousCapturedAt > staleAfterMs;
  const reasons: string[] = [];
  const messageEvents: MovementCameraMessageEvent[] = [];

  if (isStale) reasons.push("tracking-stale");
  if (poseLandmarks.length < 17) reasons.push("pose-landmarks-missing");
  if (bodyPartConfidence.torso < 0.35) reasons.push("torso-weak");
  if (bodyPartConfidence.head < 0.3) reasons.push("head-weak");
  if (Math.min(bodyPartConfidence.leftHand, bodyPartConfidence.rightHand) < 0.35) {
    reasons.push("hands-weak");
    if (
      !isBodyPartGeometricallyInFrame(poseLandmarks, "leftHand") ||
      !isBodyPartGeometricallyInFrame(poseLandmarks, "rightHand")
    ) {
      messageEvents.push("show-your-hands");
    }
  }
  if (Math.min(bodyPartConfidence.leftFoot, bodyPartConfidence.rightFoot) < 0.35) {
    reasons.push("feet-weak");
    if (
      !isBodyPartGeometricallyInFrame(poseLandmarks, "leftFoot") ||
      !isBodyPartGeometricallyInFrame(poseLandmarks, "rightFoot")
    ) {
      messageEvents.push("show-your-feet");
    }
  }
  if (!bounds || frameVisibility < 0.3) {
    messageEvents.push("move-where-i-can-see-you");
  } else {
    const isCropped = bounds.minX <= 0.04 || bounds.maxX >= 0.96 || bounds.minY <= 0.04 || bounds.maxY >= 0.96;
    const bodyHeight = bounds.maxY - bounds.minY;
    if (isCropped) messageEvents.push("step-back");
    if (bodyHeight > 0 && bodyHeight < 0.34) messageEvents.push("step-closer");
  }

  const state: MovementCameraConfidenceState =
    isStale || poseLandmarks.length < 17 || frameVisibility < 0.18
      ? "lost"
      : bodyPartConfidence.torso < 0.35 || bodyPartConfidence.head < 0.3 || frameVisibility < 0.45
        ? "uncertain"
        : frameVisibility < 0.74 ||
            Math.min(bodyPartConfidence.leftFoot, bodyPartConfidence.rightFoot) < 0.35 ||
            Math.min(bodyPartConfidence.leftHand, bodyPartConfidence.rightHand) < 0.35
          ? "partial"
          : "ready";

  return {
    bodyPartConfidence,
    frameVisibility: clamp01(frameVisibility),
    isStale,
    messageEvents: unique(messageEvents),
    reasons,
    score: Math.round(clamp01(frameVisibility) * 100),
    scoreAllowed: state === "ready" || state === "partial",
    state,
  };
}

export function resolveMovementStartReadiness({
  cameraConfidence,
  poseLandmarks,
  recordingAcquisitionReady,
  requirements,
}: {
  cameraConfidence: MovementCameraConfidence;
  poseLandmarks?: TrackingLandmark[];
  recordingAcquisitionReady?: boolean;
  requirements?: MovementSourceFrameRequirements;
}): MovementStartReadiness {
  const requiredBodyParts = resolveRequiredBodyParts(requirements);
  const visibleBodyParts = requiredBodyParts.filter((part) => (
    poseLandmarks
      ? isBodyPartGeometricallyInFrame(poseLandmarks, part)
      : cameraConfidence.bodyPartConfidence[part] >= 0.45
  ));
  const missingBodyParts = requiredBodyParts.filter((part) => !visibleBodyParts.includes(part));
  const hasTrustworthyCentralPose =
    cameraConfidence.bodyPartConfidence.head >= 0.3 &&
    cameraConfidence.bodyPartConfidence.torso >= 0.35;
  const cameraIsBlocking =
    cameraConfidence.isStale ||
    cameraConfidence.state === "lost" ||
    !hasTrustworthyCentralPose;
  const countdownMsRemaining = Math.max(requirements?.countdownMsRemaining ?? 0, 0);
  const calibrationQuality = requirements?.calibrationQuality ?? null;
  const promptEvents: MovementStartPromptEvent[] = [];
  const blockedReasons: string[] = [];

  if (countdownMsRemaining > 0) {
    promptEvents.push(
      cameraConfidence.state === "ready" || cameraConfidence.state === "partial"
        ? "get-ready"
        : "walk-back-into-frame",
    );
    return {
      blockedReasons,
      calibrationQuality,
      canStartGame: false,
      canStartRecording: false,
      countdownMsRemaining,
      promptEvents,
      requiredBodyParts,
      state: "countdown",
      visibleBodyParts,
    };
  }

  if (missingBodyParts.length > 0 || cameraIsBlocking) {
    if (missingBodyParts.some((part) => part === "leftFoot" || part === "rightFoot" || part === "leftLeg" || part === "rightLeg")) {
      promptEvents.push("show-your-whole-body", "show-your-feet");
    }
    if (missingBodyParts.some((part) => part === "leftHand" || part === "rightHand" || part === "leftArm" || part === "rightArm")) {
      promptEvents.push("show-your-hands");
    }
    if (promptEvents.length === 0) promptEvents.push("walk-back-into-frame");
    blockedReasons.push(...missingBodyParts.map((part) => `${part}-missing`));
    if (cameraIsBlocking) {
      blockedReasons.push(`camera-${cameraConfidence.state}`);
    }

    return {
      blockedReasons: unique(blockedReasons),
      calibrationQuality,
      canStartGame: false,
      // Recording acquisition and Game entry are deliberately different
      // gates. Complete finite image/world pose evidence with trustworthy
      // central anatomy can begin retention while distal visibility remains
      // weak. Final commissioning and Deep Capture coverage stay fail-closed.
      canStartRecording: recordingAcquisitionReady === true &&
        (calibrationQuality === null || calibrationQuality >= MOVEMENT_START_MIN_CALIBRATION_QUALITY),
      countdownMsRemaining,
      promptEvents: unique(promptEvents),
      requiredBodyParts,
      state: "blocked",
      visibleBodyParts,
    };
  }

  if (
    calibrationQuality !== null &&
    calibrationQuality < MOVEMENT_START_MIN_CALIBRATION_QUALITY
  ) {
    return {
      blockedReasons: ["calibration-low-quality"],
      calibrationQuality,
      canStartGame: false,
      canStartRecording: false,
      countdownMsRemaining,
      promptEvents: ["hold-still-for-calibration"],
      requiredBodyParts,
      state: "calibrating",
      visibleBodyParts,
    };
  }

  return {
    blockedReasons,
    calibrationQuality,
    canStartGame: true,
    canStartRecording: recordingAcquisitionReady ?? true,
    countdownMsRemaining,
    promptEvents: [],
    requiredBodyParts,
    state: "ready",
    visibleBodyParts,
  };
}

export function resolveMovementStartGateDecision({
  readiness,
  spineReadinessStatus,
  target,
}: {
  readiness: MovementStartReadiness | null | undefined;
  spineReadinessStatus?: MovementStartSpineReadinessStatus | null;
  target: MovementStartReadinessTarget;
}): MovementStartGateDecision {
  if (!readiness) {
    return {
      blockedReasons: ["readiness-missing"],
      canStart: false,
      promptEvents: ["walk-back-into-frame"],
      readiness: null,
      state: "missing-readiness",
      target,
    };
  }

  const canStart = target === "game"
    ? readiness.canStartGame
    : readiness.canStartRecording;
  const shouldBlockForSpine = target === "game" &&
    (spineReadinessStatus === "blocked" || spineReadinessStatus === "needs-attention");

  return {
    blockedReasons: shouldBlockForSpine
      ? unique([
          ...readiness.blockedReasons,
          spineReadinessStatus === "blocked" ? "spine-blocked" : "spine-needs-attention",
        ])
      : readiness.blockedReasons,
    canStart: canStart && !shouldBlockForSpine,
    promptEvents: shouldBlockForSpine
      ? unique([...readiness.promptEvents, "hold-still-for-calibration"])
      : readiness.promptEvents,
    readiness,
    state: shouldBlockForSpine ? "blocked" : readiness.state,
    target,
  };
}

export function buildMovementSourceFrame({
  blendshapes,
  camera,
  capturedAt = Date.now(),
  deepCapture,
  frameId,
  hands,
  movementId,
  previousCapturedAt,
  requirements,
  sessionId,
  sourceOrigin,
  sourceStatus,
  staleAfterMs,
  poseLandmarks,
  worldPoseLandmarks = [],
}: BuildMovementSourceFrameInput): MovementSourceFrame {
  const sourcePoseLandmarks = cloneTrackingLandmarks(poseLandmarks);
  const sourceWorldPoseLandmarks = cloneTrackingLandmarks(worldPoseLandmarks);
  const cameraConfidence = resolveMovementCameraConfidence({
    capturedAt,
    poseLandmarks: sourcePoseLandmarks,
    previousCapturedAt,
    staleAfterMs,
  });
  const startReadiness = resolveMovementStartReadiness({
    cameraConfidence,
    poseLandmarks: sourcePoseLandmarks,
    recordingAcquisitionReady: hasTrustworthyRecordingAcquisitionEvidence({
      cameraConfidence,
      poseLandmarks: sourcePoseLandmarks,
      requirements,
      worldPoseLandmarks: sourceWorldPoseLandmarks,
    }),
    requirements,
  });

  return {
    camera,
    cameraConfidence,
    capturedAt,
    frameId,
    landmarks: {
      blendshapes: blendshapes?.map((blendshape) => ({ ...blendshape })),
      deepCapture,
      hands: cloneMovementHands(hands),
      pose: sourcePoseLandmarks,
      worldPose: sourceWorldPoseLandmarks,
    },
    movementId,
    sessionId,
    sourceOrigin,
    sourceStatus,
    startReadiness,
  };
}

export function buildLiveMovementSourceFrame(
  input: Omit<BuildMovementSourceFrameInput, "sourceOrigin" | "sourceStatus"> & {
    sourceStatus?: Extract<MovementSourceStatus, "raw" | "smoothed" | "held-last-good">;
  },
) {
  return buildMovementSourceFrame({
    ...input,
    sourceOrigin: "live-webcam",
    sourceStatus: input.sourceStatus ?? "raw",
  });
}

export function buildRecordedMovementSourceFrame(
  frame: MovementDebugReplayFrame,
  options: {
    frameId?: string;
    movementId?: string;
    previousCapturedAt?: number;
    requirements?: MovementSourceFrameRequirements;
    sessionId?: string;
    staleAfterMs?: number;
  } = {},
) {
  return buildMovementSourceFrame({
    camera: frame.camera,
    capturedAt: frame.capturedAt,
    frameId: options.frameId,
    movementId: options.movementId,
    previousCapturedAt: options.previousCapturedAt,
    requirements: options.requirements,
    sessionId: options.sessionId,
    sourceOrigin: "recorded-replay",
    sourceStatus: "decoded",
    staleAfterMs: options.staleAfterMs,
    poseLandmarks: frame.tracking.pose,
    worldPoseLandmarks: frame.tracking.worldPose,
  });
}

export function buildSyntheticMovementSourceFrame(
  input: Omit<BuildMovementSourceFrameInput, "sourceOrigin" | "sourceStatus">,
) {
  return buildMovementSourceFrame({
    ...input,
    sourceOrigin: "synthetic-proof",
    sourceStatus: "synthetic",
  });
}
