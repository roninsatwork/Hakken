import type { MovementDebugReplayFrame } from "./movementDebugReplay";
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

export type MovementSourceFrame = {
  camera?: MovementDebugReplayFrame["camera"];
  cameraConfidence: MovementCameraConfidence;
  capturedAt: number;
  frameId?: string;
  landmarks: {
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

export type BuildMovementSourceFrameInput = {
  camera?: MovementDebugReplayFrame["camera"];
  capturedAt?: number;
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

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
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
    messageEvents.push("show-your-hands");
  }
  if (Math.min(bodyPartConfidence.leftFoot, bodyPartConfidence.rightFoot) < 0.35) {
    reasons.push("feet-weak");
    messageEvents.push("show-your-feet");
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
  requirements,
}: {
  cameraConfidence: MovementCameraConfidence;
  requirements?: MovementSourceFrameRequirements;
}): MovementStartReadiness {
  const requiredBodyParts = resolveRequiredBodyParts(requirements);
  const visibleBodyParts = requiredBodyParts.filter((part) => (
    cameraConfidence.bodyPartConfidence[part] >= 0.45
  ));
  const missingBodyParts = requiredBodyParts.filter((part) => !visibleBodyParts.includes(part));
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

  if (missingBodyParts.length > 0 || cameraConfidence.state === "lost" || cameraConfidence.state === "uncertain") {
    if (missingBodyParts.some((part) => part === "leftFoot" || part === "rightFoot" || part === "leftLeg" || part === "rightLeg")) {
      promptEvents.push("show-your-whole-body", "show-your-feet");
    }
    if (missingBodyParts.some((part) => part === "leftHand" || part === "rightHand" || part === "leftArm" || part === "rightArm")) {
      promptEvents.push("show-your-hands");
    }
    if (promptEvents.length === 0) promptEvents.push("walk-back-into-frame");
    blockedReasons.push(...missingBodyParts.map((part) => `${part}-missing`));
    if (cameraConfidence.state === "lost" || cameraConfidence.state === "uncertain") {
      blockedReasons.push(`camera-${cameraConfidence.state}`);
    }

    return {
      blockedReasons: unique(blockedReasons),
      calibrationQuality,
      canStartGame: false,
      canStartRecording: false,
      countdownMsRemaining,
      promptEvents: unique(promptEvents),
      requiredBodyParts,
      state: "blocked",
      visibleBodyParts,
    };
  }

  if (calibrationQuality !== null && calibrationQuality < 0.55) {
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
    canStartRecording: true,
    countdownMsRemaining,
    promptEvents: [],
    requiredBodyParts,
    state: "ready",
    visibleBodyParts,
  };
}

export function buildMovementSourceFrame({
  camera,
  capturedAt = Date.now(),
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
  const cameraConfidence = resolveMovementCameraConfidence({
    capturedAt,
    poseLandmarks,
    previousCapturedAt,
    staleAfterMs,
  });
  const startReadiness = resolveMovementStartReadiness({
    cameraConfidence,
    requirements,
  });

  return {
    camera,
    cameraConfidence,
    capturedAt,
    frameId,
    landmarks: {
      hands,
      pose: poseLandmarks,
      worldPose: worldPoseLandmarks,
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
