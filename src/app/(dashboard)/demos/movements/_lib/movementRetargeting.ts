import type { MovementMirrorMode } from "./movementMirrorMapping";
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

/**
 * Space the segment directions live in.
 * - "image": normalized screen landmarks; z is MediaPipe's relative image depth and
 *   must be damped with a small zScale before touching avatar bones.
 * - "world": MediaPipe metric world landmarks; z is real depth and applies at scale 1.
 */
export type MovementRetargetSpace = "image" | "world";

export type MovementRetargetSourceModel = {
  calibratedAt: number;
  floorY: number;
  hipCenter: MovementRetargetVector;
  neutralKneeLift: {
    left: number;
    right: number;
  };
  shoulderCenter: MovementRetargetVector;
  /** Space of `segments` directions. Absent means "image" (pre-world-landmark data). */
  space?: MovementRetargetSpace;
  torsoHeight: number;
  quality: number;
  segments: Partial<Record<MovementRetargetSegmentName, MovementRetargetSegment>>;
  worldTorsoHeight?: number;
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
  /**
   * The calibrated neutral spine direction in the same space as `segments`.
   * MediaPipe world landmarks are camera-axis-aligned, not gravity-aligned, so
   * appliers use this as the vertical reference to cancel camera tilt.
   * Absent when no calibration model exists or spaces mismatch.
   */
  neutralSpineDirection?: MovementRetargetVector;
  segments: Partial<Record<MovementRetargetSegmentName, MovementRetargetSegment>>;
  /** Space of `segments` directions. Absent means "image" (pre-world-landmark data). */
  space?: MovementRetargetSpace;
  squatDepth: number;
};

const MIRRORED_RETARGET_SEGMENT_PAIRS = [
  ["leftUpperArm", "rightUpperArm"],
  ["leftLowerArm", "rightLowerArm"],
  ["leftThigh", "rightThigh"],
  ["leftShin", "rightShin"],
  ["leftFoot", "rightFoot"],
] as const satisfies ReadonlyArray<readonly [MovementRetargetSegmentName, MovementRetargetSegmentName]>;

function mirrorRetargetVector(vector: MovementRetargetVector): MovementRetargetVector {
  return { ...vector, x: -vector.x };
}

function mirrorRetargetSegment(segment: MovementRetargetSegment): MovementRetargetSegment {
  return {
    ...segment,
    direction: mirrorRetargetVector(segment.direction),
  };
}

/**
 * Converts a neutral source model into the coordinate and anatomical space of
 * a mirrored presentation. The live player source remains raw so scoring can
 * retain anatomical truth; the avatar's display decision must use this mapped
 * neutral, otherwise a reflected display frame is solved against an
 * unreflected baseline and drives the avatar back to the player's raw side.
 */
export function mapMovementRetargetSourceModelForDisplay({
  mirrorMode,
  sourceModel,
}: {
  mirrorMode: MovementMirrorMode;
  sourceModel: MovementRetargetSourceModel | null;
}): MovementRetargetSourceModel | null {
  if (!sourceModel || mirrorMode === "same-side") return sourceModel;

  const segments = Object.fromEntries(Object.entries(sourceModel.segments).map(([name, segment]) => [
    name,
    segment ? mirrorRetargetSegment(segment) : segment,
  ])) as MovementRetargetSourceModel["segments"];

  MIRRORED_RETARGET_SEGMENT_PAIRS.forEach(([left, right]) => {
    const sourceLeft = sourceModel.segments[left];
    const sourceRight = sourceModel.segments[right];
    segments[left] = sourceRight ? mirrorRetargetSegment(sourceRight) : undefined;
    segments[right] = sourceLeft ? mirrorRetargetSegment(sourceLeft) : undefined;
  });

  return {
    ...sourceModel,
    hipCenter: { ...sourceModel.hipCenter, x: 1 - sourceModel.hipCenter.x },
    neutralKneeLift: {
      left: sourceModel.neutralKneeLift.right,
      right: sourceModel.neutralKneeLift.left,
    },
    segments,
    shoulderCenter: { ...sourceModel.shoulderCenter, x: 1 - sourceModel.shoulderCenter.x },
  };
}

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
const ARM_SEGMENT_NAMES: MovementRetargetSegmentName[] = [
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
];
const ARM_DISPLAY_PLANAR_RELIABILITY_MIN = 0.08;
const ARM_DISPLAY_PLANAR_RELIABILITY_MAX = 0.25;
const LOWER_BODY_MOTION_SEGMENTS: MovementRetargetSegmentName[] = [
  "leftThigh",
  "leftShin",
  "rightThigh",
  "rightShin",
];

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

function vectorDot(left: MovementRetargetVector, right: MovementRetargetVector) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
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
  directionLandmarks: TrackingLandmark[] = poseLandmarks,
): MovementRetargetSegment | null {
  const [startIndex, endIndex] = SEGMENT_LANDMARKS[name];
  const start = directionLandmarks[startIndex];
  const end = directionLandmarks[endIndex];
  const confidenceStart = poseLandmarks[startIndex];
  const confidenceEnd = poseLandmarks[endIndex];
  if (!start || !end || !confidenceStart || !confidenceEnd) return null;

  const rawVector = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: (end.z ?? 0) - (start.z ?? 0),
  };
  const length = vectorLength(rawVector) / Math.max(scale, 0.001);

  if (length <= 0.00001) return null;

  return {
    confidence: Math.min(visibility(confidenceStart), visibility(confidenceEnd)),
    direction: normalizeVector(rawVector),
    length,
  };
}

function getBodyQuality(poseLandmarks: TrackingLandmark[]) {
  const indices = [11, 12, 23, 24, 25, 26, 27, 28, 31, 32];
  const total = indices.reduce((sum, index) => sum + visibility(poseLandmarks[index]), 0);
  return total / indices.length;
}

function averageVisibility(poseLandmarks: TrackingLandmark[], indices: number[]) {
  return average(indices.map((index) => visibility(poseLandmarks[index])));
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

function getFloorRelativeHipDrop({
  calibration,
  centers,
  footConfidence,
  poseLandmarks,
}: {
  calibration: MovementRetargetSourceModel;
  centers: NonNullable<ReturnType<typeof getCenters>>;
  footConfidence: number;
  poseLandmarks: TrackingLandmark[];
}) {
  const absoluteHipDrop = clamp(
    (centers.hipCenter.y - calibration.hipCenter.y) / (calibration.torsoHeight * 0.62),
    0,
    1,
  );

  if (footConfidence < 0.35) return absoluteHipDrop;

  const calibratedHipToFloor = calibration.floorY - calibration.hipCenter.y;
  const currentHipToFloor = getFloorY(poseLandmarks) - centers.hipCenter.y;
  const floorDistanceDrop = clamp(
    (calibratedHipToFloor - currentHipToFloor) / (calibration.torsoHeight * 0.8),
    0,
    1,
  );
  const calibratedHipToFloorRatio = calibratedHipToFloor / Math.max(calibration.torsoHeight, 0.001);
  const currentHipToFloorRatio = currentHipToFloor / Math.max(centers.torsoHeight, 0.001);
  const bodyRatioDrop = clamp(
    (calibratedHipToFloorRatio - currentHipToFloorRatio) / 0.76,
    0,
    1,
  );

  return Math.min(floorDistanceDrop, bodyRatioDrop);
}

function buildSegments(
  poseLandmarks: TrackingLandmark[],
  scale: number,
  directionLandmarks: TrackingLandmark[] = poseLandmarks,
) {
  return SEGMENT_NAMES.reduce<MovementRetargetSourceModel["segments"]>((segments, name) => {
    const segment = getSegment(poseLandmarks, name, scale, directionLandmarks);
    if (segment) segments[name] = segment;
    return segments;
  }, {});
}

/**
 * MediaPipe world landmarks preserve useful limb depth, but their camera-plane
 * arm angle can drift away from the pose landmarks that the user actually sees.
 * World arm depth can switch which elbow appears to move during turns. Keep
 * each articulated arm in one coherent display-anatomical space instead of
 * mixing metric upper-arm depth with image-depth forearms, which creates a
 * false elbow bend. Other body segments continue to use metric world depth.
 */
function buildWorldSegmentsWithDisplayAlignedArms(
  poseLandmarks: TrackingLandmark[],
  worldScale: number,
  worldPoseLandmarks: TrackingLandmark[],
) {
  const worldSegments = buildSegments(poseLandmarks, worldScale, worldPoseLandmarks);
  const poseCenters = getCenters(poseLandmarks);
  if (!poseCenters) return worldSegments;

  const displaySegments = buildSegments(poseLandmarks, poseCenters.torsoHeight);
  ARM_SEGMENT_NAMES.forEach((name) => {
    const worldSegment = worldSegments[name];
    const displaySegment = displaySegments[name];
    if (!worldSegment || !displaySegment) return;

    const displayPlanarLength = Math.hypot(
      displaySegment.direction.x,
      displaySegment.direction.y,
    );
    if (displayPlanarLength <= 0.00001) return;

    const alignedDepth = clamp(displaySegment.direction.z * 0.18, -1, 1);
    const planarScale = Math.sqrt(Math.max(0, 1 - alignedDepth * alignedDepth));
    const displayAlignedDirection = normalizeVector({
      x: (displaySegment.direction.x / displayPlanarLength) * planarScale,
      y: (displaySegment.direction.y / displayPlanarLength) * planarScale,
      z: alignedDepth,
    });
    const linearDisplayReliability = clamp(
      (displayPlanarLength - ARM_DISPLAY_PLANAR_RELIABILITY_MIN) /
        (ARM_DISPLAY_PLANAR_RELIABILITY_MAX - ARM_DISPLAY_PLANAR_RELIABILITY_MIN),
      0,
      1,
    );
    const displayReliability =
      linearDisplayReliability * linearDisplayReliability * (3 - 2 * linearDisplayReliability);

    // When an arm points almost directly into the camera, its image-plane
    // vector approaches zero. Normalizing that tiny vector amplifies a
    // sub-pixel sign change into a 90-180 degree forearm flip. Blend toward
    // metric world depth through that foreshortened region; return smoothly
    // to display anatomy once the planar direction is readable again.
    worldSegments[name] = {
      ...worldSegment,
      direction: normalizeVector({
        x: worldSegment.direction.x * (1 - displayReliability) +
          displayAlignedDirection.x * displayReliability,
        y: worldSegment.direction.y * (1 - displayReliability) +
          displayAlignedDirection.y * displayReliability,
        z: worldSegment.direction.z * (1 - displayReliability) +
          displayAlignedDirection.z * displayReliability,
      }),
    };
  });

  return worldSegments;
}

const MIN_WORLD_TORSO_HEIGHT = 0.05;

function getUsableWorldPose(worldPoseLandmarks?: TrackingLandmark[] | null) {
  if (!worldPoseLandmarks || worldPoseLandmarks.length < 33) return null;

  const centers = getCenters(worldPoseLandmarks);
  if (!centers || centers.torsoHeight < MIN_WORLD_TORSO_HEIGHT) return null;

  return {
    torsoHeight: centers.torsoHeight,
    worldPoseLandmarks,
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageVector(vectors: MovementRetargetVector[]): MovementRetargetVector {
  return {
    x: average(vectors.map((vector) => vector.x)),
    y: average(vectors.map((vector) => vector.y)),
    z: average(vectors.map((vector) => vector.z)),
  };
}

function averageSegment(
  segments: MovementRetargetSegment[],
): MovementRetargetSegment | null {
  if (segments.length === 0) return null;

  return {
    confidence: average(segments.map((segment) => segment.confidence)),
    direction: normalizeVector(averageVector(segments.map((segment) => segment.direction))),
    length: average(segments.map((segment) => segment.length)),
  };
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

function getLowerBodySegmentMotionDepth({
  calibration,
  segments,
  segmentsSpace = "image",
}: {
  calibration: MovementRetargetSourceModel;
  segments: MovementRetargetFrame["segments"];
  segmentsSpace?: MovementRetargetSpace;
}) {
  if ((calibration.space ?? "image") !== segmentsSpace) return 0;

  return LOWER_BODY_MOTION_SEGMENTS.reduce((maxMotion, name) => {
    const neutralSegment = calibration.segments[name];
    const frameSegment = segments[name];
    if (!neutralSegment || !frameSegment) return maxMotion;
    if (Math.min(neutralSegment.confidence, frameSegment.confidence) < 0.3) return maxMotion;

    const dot = clamp(vectorDot(neutralSegment.direction, frameSegment.direction), -1, 1);
    const angle = Math.acos(dot);
    const motion = clamp((angle - 0.12) / 0.75, 0, 1);
    return Math.max(maxMotion, motion);
  }, 0);
}

export function buildMovementRetargetSourceModel({
  now = Date.now(),
  poseLandmarks,
  worldPoseLandmarks,
}: {
  now?: number;
  poseLandmarks: TrackingLandmark[];
  worldPoseLandmarks?: TrackingLandmark[] | null;
}): MovementRetargetSourceModel | null {
  const centers = getCenters(poseLandmarks);
  if (!centers || centers.torsoHeight < 0.08) return null;

  const floorY = getFloorY(poseLandmarks);
  const quality = getBodyQuality(poseLandmarks);
  const hipToFloor = floorY - centers.hipCenter.y;
  const uprightRatio = hipToFloor / centers.torsoHeight;

  if (quality < 0.55) return null;
  if (uprightRatio < 0.78) return null;

  const usableWorldPose = getUsableWorldPose(worldPoseLandmarks);

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
    segments: usableWorldPose
      ? buildWorldSegmentsWithDisplayAlignedArms(
          poseLandmarks,
          usableWorldPose.torsoHeight,
          usableWorldPose.worldPoseLandmarks,
        )
      : buildSegments(poseLandmarks, centers.torsoHeight),
    shoulderCenter: centers.shoulderCenter,
    space: usableWorldPose ? "world" : "image",
    torsoHeight: centers.torsoHeight,
    worldTorsoHeight: usableWorldPose?.torsoHeight,
  };
}

export function averageMovementRetargetSourceModels(
  inputModels: MovementRetargetSourceModel[],
): MovementRetargetSourceModel | null {
  if (inputModels.length === 0) return null;

  const space = inputModels[0].space ?? "image";
  const models = inputModels.filter((model) => (model.space ?? "image") === space);

  const averagedSegments = SEGMENT_NAMES.reduce<MovementRetargetSourceModel["segments"]>(
    (segments, name) => {
      const segment = averageSegment(
        models
          .map((model) => model.segments[name])
          .filter((segment): segment is MovementRetargetSegment => Boolean(segment)),
      );

      if (segment) segments[name] = segment;
      return segments;
    },
    {},
  );

  const worldTorsoHeights = models
    .map((model) => model.worldTorsoHeight)
    .filter((value): value is number => typeof value === "number");

  return {
    calibratedAt: models[models.length - 1]?.calibratedAt ?? Date.now(),
    floorY: average(models.map((model) => model.floorY)),
    hipCenter: averageVector(models.map((model) => model.hipCenter)),
    neutralKneeLift: {
      left: average(models.map((model) => model.neutralKneeLift.left)),
      right: average(models.map((model) => model.neutralKneeLift.right)),
    },
    quality: average(models.map((model) => model.quality)),
    segments: averagedSegments,
    shoulderCenter: averageVector(models.map((model) => model.shoulderCenter)),
    space,
    torsoHeight: average(models.map((model) => model.torsoHeight)),
    worldTorsoHeight: worldTorsoHeights.length > 0 ? average(worldTorsoHeights) : undefined,
  };
}

export function solveMovementRetargetFrame({
  calibration,
  poseLandmarks,
  worldPoseLandmarks,
}: {
  calibration: MovementRetargetSourceModel | null | undefined;
  poseLandmarks: TrackingLandmark[];
  worldPoseLandmarks?: TrackingLandmark[] | null;
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
    space: "image",
    squatDepth: 0,
  };

  const centers = getCenters(poseLandmarks);
  if (!centers) return fallback;

  // Segment directions do not need a calibration model — only the scalar
  // heuristics below do. Without a model (e.g. an upper-body-only webcam
  // framing where the upright/floor gates block model building), the frame
  // still solves segments so arms and spine can follow.
  const usableWorldPose = !calibration || (calibration.space ?? "image") === "world"
    ? getUsableWorldPose(worldPoseLandmarks)
    : null;
  const segmentSpace: MovementRetargetSpace = usableWorldPose ? "world" : "image";
  const sourceQuality = getBodyQuality(poseLandmarks);
  const segments = usableWorldPose
    ? buildWorldSegmentsWithDisplayAlignedArms(
        poseLandmarks,
        calibration?.worldTorsoHeight ?? usableWorldPose.torsoHeight,
        usableWorldPose.worldPoseLandmarks,
      )
    : buildSegments(poseLandmarks, calibration?.torsoHeight ?? centers.torsoHeight);

  if (!calibration) {
    const solvedWithoutCalibration = SEGMENT_NAMES.filter(
      (name) => (segments[name]?.confidence ?? 0) >= 0.3,
    );

    return {
      ...fallback,
      debug: {
        heldSegments: SEGMENT_NAMES.filter((name) => !solvedWithoutCalibration.includes(name)),
        solvedSegments: solvedWithoutCalibration,
        sourceQuality,
      },
      segments,
      space: segmentSpace,
    };
  }
  const solvedSegments = SEGMENT_NAMES.filter((name) => (segments[name]?.confidence ?? 0) >= 0.3);
  const heldSegments = SEGMENT_NAMES.filter((name) => !solvedSegments.includes(name));
  const hipConfidence = averageVisibility(poseLandmarks, [23, 24]);
  const kneeConfidence = averageVisibility(poseLandmarks, [25, 26]);
  const footConfidence = averageVisibility(poseLandmarks, [27, 28, 31, 32]);
  const canTrustHipMotion = hipConfidence >= 0.35;
  const canTrustSquatMotion =
    canTrustHipMotion &&
    (kneeConfidence >= 0.3 || footConfidence >= 0.35);
  const hipDrop = canTrustHipMotion
    ? getFloorRelativeHipDrop({
        calibration,
        centers,
        footConfidence,
        poseLandmarks,
      })
    : 0;
  const leftKneeLift = clamp(
    getRawKneeLift({
      hipCenterY: centers.hipCenter.y,
      knee: poseLandmarks[25],
      torsoHeight: centers.torsoHeight,
    }) - calibration.neutralKneeLift.left,
    0,
    1,
  );
  const rightKneeLift = clamp(
    getRawKneeLift({
      hipCenterY: centers.hipCenter.y,
      knee: poseLandmarks[26],
      torsoHeight: centers.torsoHeight,
    }) - calibration.neutralKneeLift.right,
    0,
    1,
  );
  const lowerBodySegmentMotionDepth = getLowerBodySegmentMotionDepth({
    calibration,
    segments,
    segmentsSpace: segmentSpace,
  });
  const symmetricKneeLift = Math.abs(leftKneeLift - rightKneeLift) < 0.16
    ? Math.min(leftKneeLift, rightKneeLift)
    : 0;
  const kneeBendDepth = clamp((symmetricKneeLift - 0.04) / 0.18, 0, 1);
  const hipSquatDepth = clamp((hipDrop - 0.24) / 0.38, 0, 1);
  const hasLowerBodySquatMotion = lowerBodySegmentMotionDepth > 0.08 || kneeBendDepth > 0.08;
  const squatDepth = canTrustSquatMotion && hipSquatDepth > 0.08 && hasLowerBodySquatMotion
    ? Math.max(hipSquatDepth, kneeBendDepth)
    : 0;
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
    neutralSpineDirection: (calibration.space ?? "image") === segmentSpace
      ? calibration.segments.spine?.direction
      : undefined,
    segments,
    space: segmentSpace,
    squatDepth,
  };
}

/**
 * zScale to convert this frame's segment directions into avatar world space.
 * World-space directions carry real metric depth; image-space z must stay damped.
 */
export function getMovementRetargetSegmentZScale(
  frame: Pick<MovementRetargetFrame, "space">,
  imageZScale: number,
) {
  return (frame.space ?? "image") === "world" ? 1 : imageZScale;
}

export function getBalancedPlantedSquatDepth(frame: MovementRetargetFrame) {
  if (!frame.contacts.leftFoot || !frame.contacts.rightFoot) return 0;
  if (Math.abs(frame.kneeLift.left - frame.kneeLift.right) >= 0.2) return 0;
  if (frame.hipDrop <= 0.12) return 0;
  return frame.squatDepth;
}

export function getRecordedSquatPresentationDepth(frame: MovementRetargetFrame) {
  const plantedDepth = getBalancedPlantedSquatDepth(frame);
  if (plantedDepth > 0) return plantedDepth;

  const symmetricKnees = Math.abs(frame.kneeLift.left - frame.kneeLift.right) < 0.2;
  const strongSquatEvidence =
    frame.debug.sourceQuality >= 0.45 &&
    frame.hipDrop > 0.2 &&
    frame.squatDepth > 0.24 &&
    symmetricKnees;

  return strongSquatEvidence ? frame.squatDepth : 0;
}

export function getRecordedLowerBodySegmentMotionDepth({
  calibration,
  frame,
}: {
  calibration: MovementRetargetSourceModel | null | undefined;
  frame: MovementRetargetFrame;
}) {
  if (!calibration) return 0;

  return getLowerBodySegmentMotionDepth({
    calibration,
    segments: frame.segments,
    segmentsSpace: frame.space ?? "image",
  });
}
