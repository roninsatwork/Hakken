import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementRootMotionSource = "held" | "image-landmarks" | "unavailable" | "world-landmarks";

export type MovementRootMotionStepPhase = "landing" | "lifting" | "planted" | "swinging" | "unknown";

export type MovementRootMotionIntentKey =
  | "jump-flight"
  | "jump-landing"
  | "left-foot-landing"
  | "left-foot-pivot"
  | "left-foot-release"
  | "root-stationary"
  | "root-source-limited"
  | "root-travel"
  | "right-foot-landing"
  | "right-foot-pivot"
  | "right-foot-release"
  | "turn-and-travel"
  | "turn-on-spot"
  | "weight-transfer";

export type MovementRootMotionTravelDirection =
  | "backward"
  | "diagonal"
  | "forward"
  | "left"
  | "none"
  | "right";

export type MovementRootMotionFootSide = "both" | "left" | "none" | "right";

export type MovementRootMotionVector = {
  x: number;
  y: number;
  z: number;
};

export type MovementRootMotionFootFrame = {
  contact: boolean;
  stepPhase: MovementRootMotionStepPhase;
  worldPosition: MovementRootMotionVector | null;
};

export type MovementRootMotionFrame = {
  debug: {
    reasons: string[];
    source: MovementRootMotionSource;
  };
  feet: {
    left: MovementRootMotionFootFrame;
    right: MovementRootMotionFootFrame;
  };
  floor: {
    confidence: number;
    y: number;
  };
  frameIndex: number;
  headingConfidence: number;
  headingYaw: number;
  intent: MovementRootMotionIntent;
  rootPosition: MovementRootMotionVector;
  rootPositionConfidence: number;
};

export type MovementRootMotionIntent = {
  confidence: number;
  headingDelta: number;
  key: MovementRootMotionIntentKey;
  label: string;
  plantedFoot: MovementRootMotionFootSide;
  summary: string;
  swingFoot: MovementRootMotionFootSide;
  travelDirection: MovementRootMotionTravelDirection;
  travelDistance: number;
};

export type MovementRootMotionJumpResponseDecision = {
  heightOffset: number;
  landingCompression: number;
  lift: number;
  owner: string;
  shouldApply: boolean;
  slerp: number;
  summary: string;
};

export type MovementRootMotionStepResponseDecision = {
  footLiftOffset: number;
  landingCompression: number;
  owner: string;
  shouldApply: boolean;
  side: "left" | "right" | null;
  slerp: number;
  summary: string;
};

export type MovementRootMotionCalibration = {
  floorY: number;
  headingYaw: number;
  rootPosition: MovementRootMotionVector;
  source: MovementRootMotionSource;
};

export type MovementRootMotionInputFrame = {
  pose: TrackingLandmark[];
  worldPose?: TrackingLandmark[] | null;
};

export type MovementRootMotionAnalysis = {
  calibration: MovementRootMotionCalibration | null;
  frames: MovementRootMotionFrame[];
  summary: {
    averageHeadingConfidence: number;
    averageRootPositionConfidence: number;
    maxPathDistance: number;
    maxYawDelta: number;
    sourceLimitedFrameCount: number;
    worldLandmarkFrameCount: number;
  };
};

export const DEFAULT_MOVEMENT_ROOT_MOTION_HISTORY_LIMIT = 180;

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;
const LEFT_HEEL = 29;
const RIGHT_HEEL = 30;
const LEFT_TOE = 31;
const RIGHT_TOE = 32;

export function appendMovementRootMotionHistoryFrame({
  history,
  limit = DEFAULT_MOVEMENT_ROOT_MOTION_HISTORY_LIMIT,
  pose,
  worldPose,
}: {
  history: MovementRootMotionInputFrame[];
  limit?: number;
  pose: MovementRootMotionInputFrame["pose"];
  worldPose?: MovementRootMotionInputFrame["worldPose"];
}) {
  if (pose.length < 33) return null;

  history.push({
    pose,
    worldPose: worldPose && worldPose.length >= 33 ? worldPose : null,
  });

  if (history.length > limit) {
    history.splice(0, history.length - limit);
  }

  const analysis = buildMovementRootMotionAnalysis(history);
  return analysis.frames.at(-1) ?? null;
}

function visibility(landmark?: TrackingLandmark | null) {
  return landmark?.visibility ?? 0.8;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function vectorLength(vector: MovementRootMotionVector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function horizontalDistance(vector: MovementRootMotionVector) {
  return Math.hypot(vector.x, vector.z);
}

function midpoint(
  left: TrackingLandmark,
  right: TrackingLandmark,
): MovementRootMotionVector {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: ((left.z ?? 0) + (right.z ?? 0)) / 2,
  };
}

function subtract(
  left: MovementRootMotionVector,
  right: MovementRootMotionVector,
): MovementRootMotionVector {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function getUsableLandmarks(frame: MovementRootMotionInputFrame) {
  if (frame.worldPose && frame.worldPose.length >= 33) {
    return {
      landmarks: frame.worldPose,
      source: "world-landmarks" as const,
    };
  }

  if (frame.pose.length >= 33) {
    return {
      landmarks: frame.pose,
      source: "image-landmarks" as const,
    };
  }

  return {
    landmarks: [],
    source: "unavailable" as const,
  };
}

function getBodyCenters(landmarks: TrackingLandmark[]) {
  const leftShoulder = landmarks[LEFT_SHOULDER];
  const rightShoulder = landmarks[RIGHT_SHOULDER];
  const leftHip = landmarks[LEFT_HIP];
  const rightHip = landmarks[RIGHT_HIP];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  return {
    hipCenter: midpoint(leftHip, rightHip),
    shoulderCenter: midpoint(leftShoulder, rightShoulder),
  };
}

function getHeadingYaw(landmarks: TrackingLandmark[]) {
  const leftShoulder = landmarks[LEFT_SHOULDER];
  const rightShoulder = landmarks[RIGHT_SHOULDER];
  const leftHip = landmarks[LEFT_HIP];
  const rightHip = landmarks[RIGHT_HIP];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const shoulderSide = {
    x: rightShoulder.x - leftShoulder.x,
    y: rightShoulder.y - leftShoulder.y,
    z: (rightShoulder.z ?? 0) - (leftShoulder.z ?? 0),
  };
  const hipSide = {
    x: rightHip.x - leftHip.x,
    y: rightHip.y - leftHip.y,
    z: (rightHip.z ?? 0) - (leftHip.z ?? 0),
  };
  const side = {
    x: (shoulderSide.x + hipSide.x) / 2,
    y: (shoulderSide.y + hipSide.y) / 2,
    z: (shoulderSide.z + hipSide.z) / 2,
  };
  const sideLength = Math.hypot(side.x, side.z);
  if (sideLength < 0.0001) return null;

  const confidence = clamp(
    average([
      visibility(leftShoulder),
      visibility(rightShoulder),
      visibility(leftHip),
      visibility(rightHip),
    ]) * clamp(sideLength / 0.18),
  );

  return {
    confidence,
    yaw: Math.atan2(side.z, side.x),
  };
}

function getFloorY(landmarks: TrackingLandmark[], source: MovementRootMotionSource) {
  const values = [
    landmarks[LEFT_ANKLE]?.y,
    landmarks[RIGHT_ANKLE]?.y,
    landmarks[LEFT_HEEL]?.y,
    landmarks[RIGHT_HEEL]?.y,
    landmarks[LEFT_TOE]?.y,
    landmarks[RIGHT_TOE]?.y,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) return 0;
  return source === "world-landmarks" ? Math.min(...values) : Math.max(...values);
}

function getFootPosition(landmarks: TrackingLandmark[], side: "left" | "right") {
  const ankle = landmarks[side === "left" ? LEFT_ANKLE : RIGHT_ANKLE];
  const heel = landmarks[side === "left" ? LEFT_HEEL : RIGHT_HEEL];
  const toe = landmarks[side === "left" ? LEFT_TOE : RIGHT_TOE];
  if (!ankle && !heel && !toe) return null;

  const points = [ankle, heel, toe].filter((point): point is TrackingLandmark => Boolean(point));
  return {
    confidence: average(points.map(visibility)),
    position: {
      x: average(points.map((point) => point.x)),
      y: average(points.map((point) => point.y)),
      z: average(points.map((point) => point.z ?? 0)),
    },
  };
}

function getFootFrame({
  floorY,
  landmarks,
  previous,
  side,
  source,
}: {
  floorY: number;
  landmarks: TrackingLandmark[];
  previous?: MovementRootMotionFootFrame;
  side: "left" | "right";
  source: MovementRootMotionSource;
}): MovementRootMotionFootFrame {
  const foot = getFootPosition(landmarks, side);
  if (!foot || foot.confidence < 0.25) {
    return {
      contact: false,
      stepPhase: "unknown",
      worldPosition: null,
    };
  }

  const floorDistance = Math.abs(foot.position.y - floorY);
  const contact = foot.confidence >= 0.45 && floorDistance < (source === "world-landmarks" ? 0.12 : 0.045);
  const travel = previous?.worldPosition
    ? vectorLength(subtract(foot.position, previous.worldPosition))
    : 0;
  const wasContact = previous?.contact ?? contact;
  let stepPhase: MovementRootMotionStepPhase = contact ? "planted" : "unknown";

  if (wasContact && !contact) stepPhase = "lifting";
  else if (!wasContact && !contact && travel > 0.025) stepPhase = "swinging";
  else if (!wasContact && contact) stepPhase = "landing";

  return {
    contact,
    stepPhase,
    worldPosition: foot.position,
  };
}

function unwrapAngle(angle: number, reference: number) {
  let unwrapped = angle;
  while (unwrapped - reference > Math.PI) unwrapped -= Math.PI * 2;
  while (unwrapped - reference < -Math.PI) unwrapped += Math.PI * 2;
  return unwrapped;
}

function normalizeAngle(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function footSideFromBooleans(left: boolean, right: boolean): MovementRootMotionFootSide {
  if (left && right) return "both";
  if (left) return "left";
  if (right) return "right";
  return "none";
}

function travelDirectionForDelta(delta: MovementRootMotionVector): MovementRootMotionTravelDirection {
  const absX = Math.abs(delta.x);
  const absZ = Math.abs(delta.z);
  if (Math.hypot(delta.x, delta.z) < 0.035) return "none";
  if (absX > absZ * 1.35) return delta.x >= 0 ? "right" : "left";
  if (absZ > absX * 1.35) return delta.z >= 0 ? "forward" : "backward";
  return "diagonal";
}

function buildRootMotionIntent({
  frame,
  previousFrame,
}: {
  frame: Omit<MovementRootMotionFrame, "intent">;
  previousFrame?: MovementRootMotionFrame;
}): MovementRootMotionIntent {
  const delta = previousFrame
    ? subtract(frame.rootPosition, previousFrame.rootPosition)
    : { x: 0, y: 0, z: 0 };
  const travelDistance = previousFrame ? horizontalDistance(delta) : 0;
  const headingDelta = previousFrame ? normalizeAngle(frame.headingYaw - previousFrame.headingYaw) : 0;
  const turnAmount = Math.abs(headingDelta);
  const plantedFoot = footSideFromBooleans(frame.feet.left.contact, frame.feet.right.contact);
  const swingFoot = footSideFromBooleans(!frame.feet.left.contact, !frame.feet.right.contact);
  const travelDirection = travelDirectionForDelta(delta);
  const confidence = clamp(Math.min(frame.headingConfidence, frame.rootPositionConfidence || frame.headingConfidence));

  if (frame.debug.source !== "world-landmarks" || frame.rootPositionConfidence < 0.35) {
    return {
      confidence,
      headingDelta,
      key: "root-source-limited",
      label: "Source-limited root motion",
      plantedFoot,
      summary: "Saved landmarks do not provide reliable world-space root travel for this frame.",
      swingFoot,
      travelDirection: "none",
      travelDistance,
    };
  }

  const leftLifting = frame.feet.left.stepPhase === "lifting";
  const rightLifting = frame.feet.right.stepPhase === "lifting";
  const leftLanding = frame.feet.left.stepPhase === "landing";
  const rightLanding = frame.feet.right.stepPhase === "landing";
  const bothAirborne = !frame.feet.left.contact && !frame.feet.right.contact;
  const bothLanding = leftLanding && rightLanding;
  const hasTravel = travelDistance >= 0.16;
  const hasTurn = turnAmount >= 0.35;

  if (bothLanding) {
    return {
      confidence,
      headingDelta,
      key: "jump-landing",
      label: "Jump landing",
      plantedFoot,
      summary: "Both feet replanted after an airborne support phase.",
      swingFoot: "none",
      travelDirection,
      travelDistance,
    };
  }

  if (bothAirborne) {
    return {
      confidence,
      headingDelta,
      key: "jump-flight",
      label: "Jump flight",
      plantedFoot: "none",
      summary: "Both feet are away from floor contact, indicating a jump or hop flight phase.",
      swingFoot: "both",
      travelDirection,
      travelDistance,
    };
  }

  if (hasTravel && hasTurn) {
    return {
      confidence,
      headingDelta,
      key: "turn-and-travel",
      label: "Turn and travel",
      plantedFoot,
      summary: "The body changed heading while the root travelled across the floor.",
      swingFoot,
      travelDirection,
      travelDistance,
    };
  }

  if (hasTurn) {
    if (frame.feet.left.contact && !frame.feet.right.contact) {
      return {
        confidence,
        headingDelta,
        key: "left-foot-pivot",
        label: "Left-foot pivot",
        plantedFoot: "left",
        summary: "The left foot stayed planted while the body rotated around it.",
        swingFoot: "right",
        travelDirection,
        travelDistance,
      };
    }

    if (frame.feet.right.contact && !frame.feet.left.contact) {
      return {
        confidence,
        headingDelta,
        key: "right-foot-pivot",
        label: "Right-foot pivot",
        plantedFoot: "right",
        summary: "The right foot stayed planted while the body rotated around it.",
        swingFoot: "left",
        travelDirection,
        travelDistance,
      };
    }

    return {
      confidence,
      headingDelta,
      key: "turn-on-spot",
      label: "Turn on spot",
      plantedFoot,
      summary: "The body rotated while the root stayed near the same floor location.",
      swingFoot,
      travelDirection,
      travelDistance,
    };
  }

  if (leftLifting || rightLifting) {
    const side = leftLifting ? "left" : "right";
    return {
      confidence,
      headingDelta,
      key: side === "left" ? "left-foot-release" : "right-foot-release",
      label: side === "left" ? "Left foot release" : "Right foot release",
      plantedFoot: side === "left" ? (frame.feet.right.contact ? "right" : "none") : (frame.feet.left.contact ? "left" : "none"),
      summary: `${side === "left" ? "Left" : "Right"} foot lifted away from floor contact.`,
      swingFoot: side,
      travelDirection,
      travelDistance,
    };
  }

  if (leftLanding || rightLanding) {
    const side = leftLanding ? "left" : "right";
    return {
      confidence,
      headingDelta,
      key: side === "left" ? "left-foot-landing" : "right-foot-landing",
      label: side === "left" ? "Left foot landing" : "Right foot landing",
      plantedFoot,
      summary: `${side === "left" ? "Left" : "Right"} foot replanted on the floor.`,
      swingFoot: side === "left" ? (frame.feet.left.contact ? "none" : "left") : (frame.feet.right.contact ? "none" : "right"),
      travelDirection,
      travelDistance,
    };
  }

  if (hasTravel) {
    return {
      confidence,
      headingDelta,
      key: "root-travel",
      label: "Root travel",
      plantedFoot,
      summary: "The body root travelled across the floor.",
      swingFoot,
      travelDirection,
      travelDistance,
    };
  }

  if (travelDistance >= 0.05 && plantedFoot === "both") {
    return {
      confidence,
      headingDelta,
      key: "weight-transfer",
      label: "Weight transfer",
      plantedFoot,
      summary: "The body shifted weight while both feet stayed planted.",
      swingFoot: "none",
      travelDirection,
      travelDistance,
    };
  }

  return {
    confidence,
    headingDelta,
    key: "root-stationary",
    label: "Stationary root",
    plantedFoot,
    summary: "The body root stayed near the calibrated floor location.",
    swingFoot,
    travelDirection: "none",
    travelDistance,
  };
}

export function resolveMovementRootMotionJumpResponse(
  intent: MovementRootMotionIntent,
): MovementRootMotionJumpResponseDecision {
  if (intent.key === "jump-flight") {
    const lift = clamp(0.08 + intent.travelDistance * 0.18, 0.08, 0.16) * clamp(intent.confidence, 0.35, 1);
    return {
      heightOffset: lift,
      landingCompression: 0,
      lift,
      owner: "jump-response-flight",
      shouldApply: true,
      slerp: 0.24,
      summary: "Both-feet airborne intent lifts the avatar root for visible jump flight.",
    };
  }

  if (intent.key === "jump-landing") {
    const landingCompression = 0.055 * clamp(intent.confidence, 0.35, 1);
    return {
      heightOffset: -landingCompression,
      landingCompression,
      lift: 0,
      owner: "jump-response-landing",
      shouldApply: true,
      slerp: 0.36,
      summary: "Both-feet landing intent compresses the avatar root for visible impact.",
    };
  }

  return {
    heightOffset: 0,
    landingCompression: 0,
    lift: 0,
    owner: "jump-response-none",
    shouldApply: false,
    slerp: 0,
    summary: "No jump flight or landing response is needed for this root-motion intent.",
  };
}

export function resolveMovementRootMotionStepResponse(
  intent: MovementRootMotionIntent,
): MovementRootMotionStepResponseDecision {
  const releaseSide = intent.key === "left-foot-release"
    ? "left" as const
    : intent.key === "right-foot-release" ? "right" as const : null;
  if (releaseSide) {
    const footLiftOffset = clamp(0.035 + intent.travelDistance * 0.12, 0.035, 0.085) * clamp(intent.confidence, 0.35, 1);
    return {
      footLiftOffset,
      landingCompression: 0,
      owner: `step-response-${releaseSide}-release`,
      shouldApply: true,
      side: releaseSide,
      slerp: 0.22,
      summary: `${releaseSide === "left" ? "Left" : "Right"} foot release gets a conservative swing-foot lift hint.`,
    };
  }

  const landingSide = intent.key === "left-foot-landing"
    ? "left" as const
    : intent.key === "right-foot-landing" ? "right" as const : null;
  if (landingSide) {
    const landingCompression = 0.025 * clamp(intent.confidence, 0.35, 1);
    return {
      footLiftOffset: -landingCompression,
      landingCompression,
      owner: `step-response-${landingSide}-landing`,
      shouldApply: true,
      side: landingSide,
      slerp: 0.28,
      summary: `${landingSide === "left" ? "Left" : "Right"} foot landing gets a conservative replant compression hint.`,
    };
  }

  return {
    footLiftOffset: 0,
    landingCompression: 0,
    owner: "step-response-none",
    shouldApply: false,
    side: null,
    slerp: 0,
    summary: "No step release or landing response is needed for this root-motion intent.",
  };
}

function buildCalibration(
  frames: MovementRootMotionInputFrame[],
): MovementRootMotionCalibration | null {
  for (const frame of frames) {
    const { landmarks, source } = getUsableLandmarks(frame);
    if (landmarks.length < 33) continue;

    const centers = getBodyCenters(landmarks);
    const heading = getHeadingYaw(landmarks);
    if (!centers || !heading || heading.confidence < 0.3) continue;

    return {
      floorY: getFloorY(landmarks, source),
      headingYaw: heading.yaw,
      rootPosition: centers.hipCenter,
      source,
    };
  }

  return null;
}

function fallbackFrame(frameIndex: number): MovementRootMotionFrame {
  return {
    debug: {
      reasons: ["no usable saved pose landmarks"],
      source: "unavailable",
    },
    feet: {
      left: {
        contact: false,
        stepPhase: "unknown",
        worldPosition: null,
      },
      right: {
        contact: false,
        stepPhase: "unknown",
        worldPosition: null,
      },
    },
    floor: {
      confidence: 0,
      y: 0,
    },
    frameIndex,
    headingConfidence: 0,
    headingYaw: 0,
    intent: {
      confidence: 0,
      headingDelta: 0,
      key: "root-source-limited",
      label: "Source-limited root motion",
      plantedFoot: "none",
      summary: "Saved landmarks do not provide reliable world-space root travel for this frame.",
      swingFoot: "none",
      travelDirection: "none",
      travelDistance: 0,
    },
    rootPosition: { x: 0, y: 0, z: 0 },
    rootPositionConfidence: 0,
  };
}

export function buildMovementRootMotionAnalysis(
  frames: MovementRootMotionInputFrame[],
): MovementRootMotionAnalysis {
  const calibration = buildCalibration(frames);
  let previousHeading = calibration?.headingYaw ?? 0;
  let previousLeftFoot: MovementRootMotionFootFrame | undefined;
  let previousRightFoot: MovementRootMotionFootFrame | undefined;
  let previousRootFrame: MovementRootMotionFrame | undefined;

  const rootFrames = frames.map<MovementRootMotionFrame>((frame, frameIndex) => {
    const { landmarks, source } = getUsableLandmarks(frame);
    if (!calibration || landmarks.length < 33) return fallbackFrame(frameIndex);

    const reasons: string[] = [];
    const centers = getBodyCenters(landmarks);
    const heading = getHeadingYaw(landmarks);
    const unwrappedHeading = heading ? unwrapAngle(heading.yaw, previousHeading) : previousHeading;
    const headingYaw = normalizeAngle(unwrappedHeading - calibration.headingYaw);
    const headingConfidence = heading?.confidence ?? 0;
    const detectedFloorY = getFloorY(landmarks, source);
    const floorY = source === "world-landmarks" ? calibration.floorY : detectedFloorY;
    const floorConfidence = average([
      visibility(landmarks[LEFT_ANKLE]),
      visibility(landmarks[RIGHT_ANKLE]),
      visibility(landmarks[LEFT_TOE]),
      visibility(landmarks[RIGHT_TOE]),
    ]);
    const leftFoot = getFootFrame({
      floorY,
      landmarks,
      previous: previousLeftFoot,
      side: "left",
      source,
    });
    const rightFoot = getFootFrame({
      floorY,
      landmarks,
      previous: previousRightFoot,
      side: "right",
      source,
    });
    const hasWorldLandmarks = source === "world-landmarks";
    const rootPosition = centers
      ? subtract(centers.hipCenter, calibration.rootPosition)
      : { x: 0, y: 0, z: 0 };
    const rootPositionConfidence = centers && hasWorldLandmarks
      ? clamp(average([
          visibility(landmarks[LEFT_HIP]),
          visibility(landmarks[RIGHT_HIP]),
          floorConfidence,
        ]))
      : 0;

    if (!hasWorldLandmarks) {
      reasons.push("image landmarks can show pose and limited heading but do not prove floor path");
    }
    if (!heading || headingConfidence < 0.3) {
      reasons.push("body heading is weak or unavailable");
    }
    if (!centers) {
      reasons.push("hip center is unavailable");
    }
    if (rootPositionConfidence <= 0) {
      reasons.push("root X/Z path held because world landmark confidence is unavailable");
    }

    previousHeading = unwrappedHeading;
    previousLeftFoot = leftFoot;
    previousRightFoot = rightFoot;

    const rootFrameWithoutIntent: Omit<MovementRootMotionFrame, "intent"> = {
      debug: {
        reasons,
        source,
      },
      feet: {
        left: leftFoot,
        right: rightFoot,
      },
      floor: {
        confidence: floorConfidence,
        y: floorY,
      },
      frameIndex,
      headingConfidence,
      headingYaw,
      rootPosition,
      rootPositionConfidence,
    };
    const rootFrame = {
      ...rootFrameWithoutIntent,
      intent: buildRootMotionIntent({
        frame: rootFrameWithoutIntent,
        previousFrame: previousRootFrame,
      }),
    };
    previousRootFrame = rootFrame;

    return rootFrame;
  });

  const worldLandmarkFrameCount = rootFrames.filter((frame) => frame.debug.source === "world-landmarks").length;
  const sourceLimitedFrameCount = rootFrames.filter((frame) => (
    frame.debug.source !== "world-landmarks" || frame.rootPositionConfidence <= 0
  )).length;
  const maxPathDistance = rootFrames.reduce((maxDistance, frame) => (
    Math.max(maxDistance, Math.hypot(frame.rootPosition.x, frame.rootPosition.z))
  ), 0);
  const maxYawDelta = rootFrames.reduce((maxYaw, frame) => (
    Math.max(maxYaw, Math.abs(frame.headingYaw))
  ), 0);

  return {
    calibration,
    frames: rootFrames,
    summary: {
      averageHeadingConfidence: average(rootFrames.map((frame) => frame.headingConfidence)),
      averageRootPositionConfidence: average(rootFrames.map((frame) => frame.rootPositionConfidence)),
      maxPathDistance,
      maxYawDelta,
      sourceLimitedFrameCount,
      worldLandmarkFrameCount,
    },
  };
}
