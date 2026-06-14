import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementRetargetVector = {
  x: number;
  y: number;
  z: number;
};

export type MovementRetargetSegmentName =
  | "spine"
  | "leftUpperArm"
  | "leftLowerArm"
  | "rightUpperArm"
  | "rightLowerArm"
  | "leftThigh"
  | "leftShin"
  | "rightThigh"
  | "rightShin"
  | "leftFoot"
  | "rightFoot";

export type MovementRetargetSegment = {
  confidence: number;
  direction: MovementRetargetVector;
  length: number;
};

export type MovementRetargetSourceModel = {
  calibratedAt: number;
  floorY: number;
  hipCenter: MovementRetargetVector;
  neutralKneeLift: {
    left: number;
    right: number;
  };
  shoulderCenter: MovementRetargetVector;
  torsoHeight: number;
  quality: number;
  segments: Partial<Record<MovementRetargetSegmentName, MovementRetargetSegment>>;
};

export type MovementRetargetFrame = {
  contacts: {
    leftFoot: boolean;
    rightFoot: boolean;
  };
  debug: {
    heldSegments: MovementRetargetSegmentName[];
    solvedSegments: MovementRetargetSegmentName[];
    sourceQuality: number;
  };
  hipDrop: number;
  kneeLift: {
    left: number;
    right: number;
  };
  segments: Partial<Record<MovementRetargetSegmentName, MovementRetargetSegment>>;
  squatDepth: number;
};

const SEGMENT_LANDMARKS: Record<MovementRetargetSegmentName, [number, number]> = {
  spine: [23, 11],
  leftUpperArm: [11, 13],
  leftLowerArm: [13, 15],
  rightUpperArm: [12, 14],
  rightLowerArm: [14, 16],
  leftThigh: [23, 25],
  leftShin: [25, 27],
  rightThigh: [24, 26],
  rightShin: [26, 28],
  leftFoot: [29, 31],
  rightFoot: [30, 32],
};

const SEGMENT_NAMES = Object.keys(SEGMENT_LANDMARKS) as MovementRetargetSegmentName[];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function visibility(landmark?: TrackingLandmark | null) {
  return landmark?.visibility ?? 0.8;
}

function midpoint(a: TrackingLandmark, b: TrackingLandmark): MovementRetargetVector {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function vectorLength(vector: MovementRetargetVector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalizeVector(vector: MovementRetargetVector): MovementRetargetVector {
  const length = vectorLength(vector);
  if (length <= 0.00001) return { x: 0, y: 0, z: 0 };
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function getSegment(
  poseLandmarks: TrackingLandmark[],
  name: MovementRetargetSegmentName,
  scale: number,
): MovementRetargetSegment | null {
  const [startIndex, endIndex] = SEGMENT_LANDMARKS[name];
  const start = poseLandmarks[startIndex];
  const end = poseLandmarks[endIndex];
  if (!start || !end) return null;

  const rawVector = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: (end.z ?? 0) - (start.z ?? 0),
  };
  const length = vectorLength(rawVector) / Math.max(scale, 0.001);

  if (length <= 0.00001) return null;

  return {
    confidence: Math.min(visibility(start), visibility(end)),
    direction: normalizeVector(rawVector),
    length,
  };
}

function getBodyQuality(poseLandmarks: TrackingLandmark[]) {
  const indices = [11, 12, 23, 24, 25, 26, 27, 28, 31, 32];
  const total = indices.reduce((sum, index) => sum + visibility(poseLandmarks[index]), 0);
  return total / indices.length;
}

function getCenters(poseLandmarks: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);
  const torsoHeight = Math.hypot(
    shoulderCenter.x - hipCenter.x,
    shoulderCenter.y - hipCenter.y,
    shoulderCenter.z - hipCenter.z,
  );

  return {
    hipCenter,
    shoulderCenter,
    torsoHeight,
  };
}

function getFloorY(poseLandmarks: TrackingLandmark[]) {
  return Math.max(
    poseLandmarks[27]?.y ?? 0,
    poseLandmarks[28]?.y ?? 0,
    poseLandmarks[31]?.y ?? 0,
    poseLandmarks[32]?.y ?? 0,
  );
}

function buildSegments(poseLandmarks: TrackingLandmark[], scale: number) {
  return SEGMENT_NAMES.reduce<MovementRetargetSourceModel["segments"]>((segments, name) => {
    const segment = getSegment(poseLandmarks, name, scale);
    if (segment) segments[name] = segment;
    return segments;
  }, {});
}

function getRawKneeLift({
  hipCenterY,
  knee,
  torsoHeight,
}: {
  hipCenterY: number;
  knee?: TrackingLandmark | null;
  torsoHeight: number;
}) {
  if (!knee || visibility(knee) < 0.3) return 0;

  const kneeLiftThreshold = hipCenterY + torsoHeight * 0.34;
  const kneeLiftWindow = torsoHeight * 0.72;
  return clamp((kneeLiftThreshold - knee.y) / kneeLiftWindow, 0, 1);
}

export function buildMovementRetargetSourceModel({
  now = Date.now(),
  poseLandmarks,
}: {
  now?: number;
  poseLandmarks: TrackingLandmark[];
}): MovementRetargetSourceModel | null {
  const centers = getCenters(poseLandmarks);
  if (!centers || centers.torsoHeight < 0.08) return null;

  const floorY = getFloorY(poseLandmarks);
  const quality = getBodyQuality(poseLandmarks);
  const hipToFloor = floorY - centers.hipCenter.y;
  const uprightRatio = hipToFloor / centers.torsoHeight;

  if (quality < 0.55) return null;
  if (uprightRatio < 0.78) return null;

  return {
    calibratedAt: now,
    floorY,
    hipCenter: centers.hipCenter,
    neutralKneeLift: {
      left: getRawKneeLift({
        hipCenterY: centers.hipCenter.y,
        knee: poseLandmarks[25],
        torsoHeight: centers.torsoHeight,
      }),
      right: getRawKneeLift({
        hipCenterY: centers.hipCenter.y,
        knee: poseLandmarks[26],
        torsoHeight: centers.torsoHeight,
      }),
    },
    quality,
    segments: buildSegments(poseLandmarks, centers.torsoHeight),
    shoulderCenter: centers.shoulderCenter,
    torsoHeight: centers.torsoHeight,
  };
}

export function solveMovementRetargetFrame({
  calibration,
  poseLandmarks,
}: {
  calibration: MovementRetargetSourceModel | null | undefined;
  poseLandmarks: TrackingLandmark[];
}): MovementRetargetFrame {
  const fallback: MovementRetargetFrame = {
    contacts: {
      leftFoot: false,
      rightFoot: false,
    },
    debug: {
      heldSegments: SEGMENT_NAMES,
      solvedSegments: [],
      sourceQuality: 0,
    },
    hipDrop: 0,
    kneeLift: {
      left: 0,
      right: 0,
    },
    segments: {},
    squatDepth: 0,
  };

  const centers = getCenters(poseLandmarks);
  if (!calibration || !centers) return fallback;

  const sourceQuality = getBodyQuality(poseLandmarks);
  const segments = buildSegments(poseLandmarks, calibration.torsoHeight);
  const solvedSegments = SEGMENT_NAMES.filter((name) => (segments[name]?.confidence ?? 0) >= 0.3);
  const heldSegments = SEGMENT_NAMES.filter((name) => !solvedSegments.includes(name));
  const hipDrop = clamp(
    (centers.hipCenter.y - calibration.hipCenter.y) / (calibration.torsoHeight * 0.62),
    0,
    1,
  );
  const leftKneeLift = clamp(
    getRawKneeLift({
      hipCenterY: calibration.hipCenter.y,
      knee: poseLandmarks[25],
      torsoHeight: calibration.torsoHeight,
    }) - calibration.neutralKneeLift.left,
    0,
    1,
  );
  const rightKneeLift = clamp(
    getRawKneeLift({
      hipCenterY: calibration.hipCenter.y,
      knee: poseLandmarks[26],
      torsoHeight: calibration.torsoHeight,
    }) - calibration.neutralKneeLift.right,
    0,
    1,
  );
  const symmetricKneeLift = Math.abs(leftKneeLift - rightKneeLift) < 0.16
    ? Math.min(leftKneeLift, rightKneeLift)
    : 0;
  const kneeBendDepth = clamp((symmetricKneeLift - 0.04) / 0.18, 0, 1);
  const hipSquatDepth = clamp((hipDrop - 0.24) / 0.38, 0, 1);
  const squatDepth = Math.max(hipSquatDepth, kneeBendDepth);
  const isSymmetricSquat = squatDepth > 0.25 && Math.abs(leftKneeLift - rightKneeLift) < 0.2;
  const footContactWindow = calibration.torsoHeight * 0.22;
  const leftFootY = Math.max(
    poseLandmarks[27]?.y ?? 0,
    poseLandmarks[31]?.y ?? 0,
  );
  const rightFootY = Math.max(
    poseLandmarks[28]?.y ?? 0,
    poseLandmarks[32]?.y ?? 0,
  );
  const leftFootConfidence = Math.max(visibility(poseLandmarks[27]), visibility(poseLandmarks[31]));
  const rightFootConfidence = Math.max(visibility(poseLandmarks[28]), visibility(poseLandmarks[32]));

  return {
    contacts: {
      leftFoot: leftFootConfidence >= 0.35 &&
        (
          isSymmetricSquat ||
          (leftFootY >= calibration.floorY - footContactWindow && leftKneeLift < 0.5)
        ),
      rightFoot: rightFootConfidence >= 0.35 &&
        (
          isSymmetricSquat ||
          (rightFootY >= calibration.floorY - footContactWindow && rightKneeLift < 0.5)
        ),
    },
    debug: {
      heldSegments,
      solvedSegments,
      sourceQuality,
    },
    hipDrop,
    kneeLift: {
      left: leftKneeLift,
      right: rightKneeLift,
    },
    segments,
    squatDepth,
  };
}
