import type { MovementHandSide } from "./movementTypes";
import type { MovementBodyOrientationDecision } from "./movementBodyOrientation";
import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { MovementExerciseTransitionDecision } from "./movementExerciseTransition";
import type { MovementSupportContactDecision } from "./movementSupportContact";
import type { MovementSupportConstraintDecision } from "./movementSupportConstraint";
import type { MovementSupportIntentDecision } from "./movementSupportIntent";

export type TrackingLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type MovementHeadAngles = {
  pitch: number;
  yaw: number;
  roll: number;
  confidence: number;
  source: "face" | "pose" | "none";
};

export type MovementCalibration = {
  calibratedAt: number;
  headNeutral: MovementHeadAngles;
  headCenter?: { x: number; y: number; z: number };
  headScale?: number;
  hipCenter: { x: number; y: number; z: number };
  shoulderCenter?: { x: number; y: number; z: number };
  shoulderWidth: number;
  torsoHeight: number;
  floorY: number;
  quality: number;
};

export type MovementAvatarTrackingProfile = {
  headPitchOffset: number;
  headYawOffset: number;
  headRollOffset: number;
  minHeadPitch: number;
  maxHeadPitch: number;
  maxHeadYaw: number;
  maxHeadRoll: number;
  headSlerp: number;
  neckPitchShare: number;
  neckYawShare: number;
  neckRollShare: number;
  neckSlerp: number;
  legSlerp: number;
  footSlerp: number;
  armVisibility: number;
  floorCorrectionScale: number;
  floorCorrectionLimit: number;
  squatHipDropScale?: number;
  squatHipDropLimit?: number;
  squatLegBendBoost?: number;
  kneeRaiseUpperLegBoost?: number;
  kneeRaiseLowerLegBoost?: number;
};

export type MovementTrackingDebugState = {
  updatedAt: number;
  bodyOrientation?: MovementBodyOrientationDecision;
  bodySupport?: MovementSupportContactDecision;
  exercisePose?: MovementExercisePoseDecision;
  exerciseTransition?: MovementExerciseTransitionDecision;
  supportConstraint?: MovementSupportConstraintDecision;
  supportIntent?: MovementSupportIntentDecision;
  headRaw: MovementHeadAngles;
  headApplied: MovementHeadAngles;
  avatarVisual?: {
    averageLowerBodyDirectionError?: number;
    averageUpperBodyDirectionError?: number;
    comparedLowerBodySegments: number;
    comparedUpperBodySegments?: number;
    footing?: {
      floorY?: number;
      leftFootClearance?: number;
      leftFootY?: number;
      rightFootClearance?: number;
      rightFootY?: number;
    };
    segments: Record<string, {
      confidence?: number;
      direction: {
        x: number;
        y: number;
        z: number;
      };
      length: number;
      sourceDirection?: {
        x: number;
        y: number;
        z: number;
      };
      sourceError?: number;
    }>;
  };
  avatarRoot?: {
    appliedPitch?: number;
    appliedRoll?: number;
    appliedYaw: number;
    appliedX: number;
    appliedY?: number;
    appliedZ: number;
    jumpResponseOwner?: string;
    orientationOwner?: string;
    stepResponseOwner?: string;
    stepResponseSide?: string;
    targetHeightDrop?: number;
    targetJumpHeightOffset?: number;
    targetStepFootLiftOffset?: number;
    targetPitch?: number;
    targetRoll?: number;
    targetYaw: number;
    targetX: number;
    targetZ: number;
    source: string;
  };
  avatarHead?: {
    appliedLocalPitch: number;
    appliedLocalRoll: number;
    boneYaw: number;
    bonePitch: number;
    boneRoll: number;
    trackingPitch: number;
    trackingRoll: number;
    trackingYaw: number;
  };
  avatarHands?: Partial<Record<"left" | "right", {
    curlMagnitude: number;
    indexProximal?: { x: number; y: number; z: number };
    middleProximal?: { x: number; y: number; z: number };
    thumbProximal?: { x: number; y: number; z: number };
  }>>;
  avatarExpressions?: {
    aa: number | null;
    blinkLeft: number | null;
    blinkRight: number | null;
    happy: number | null;
  };
  avatarSpine?: Partial<Record<"hips" | "spine" | "chest" | "upperChest", {
    x: number;
    y: number;
    z: number;
  }>>;
  avatarLegRaise?: {
    appliedDepth: number;
    expiresInMs: number;
    holdActive: boolean;
    rawLeftDepth: number;
    rawRightDepth: number;
    side: "left" | "right" | null;
  };
  bodyConfidence: Record<string, number>;
  camera?: {
    aspectRatio?: number;
    deviceLabel?: string;
    frameRate?: number;
    trackHeight?: number;
    trackWidth?: number;
    videoHeight: number;
    videoWidth: number;
  };
  fallbacks: Record<string, string>;
  poseBounds?: {
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
    outOfFrameCount: number;
  };
  spineDrive?: {
    confidence: number;
    forwardLean: number;
    owner: string;
    sideBend: number;
    twist: number;
  };
  retarget?: {
    sourceQuality: number;
    squatDepth: number;
    hipDrop: number;
    leftKneeLift: number;
    rightKneeLift: number;
    lowerBodySegmentMotion: number;
    leftFootContact: boolean;
    rightFootContact: boolean;
    solvedSegments: number;
    totalSegments: number;
    appliedUpperBody: number;
    totalUpperBody: number;
    appliedLowerBody: number;
    totalLowerBody: number;
    visualRootDrop: number;
    plantedSquatIkDepth: number;
    footLockStrength: number;
    footLockCorrection: number;
    footLockDrift: number;
  };
  profileName?: string;
  calibrationQuality?: number;
};

export type MovementTrackingHealthLevel = "waiting" | "needs-attention" | "watch" | "ready";

export type MovementTrackingHealthSummary = {
  score: number;
  level: MovementTrackingHealthLevel;
  label: string;
  primaryAction: string;
  warnings: string[];
};

export type MovementTrackingHealthOptions = {
  now?: number;
  staleAfterMs?: number;
};

export type MovementTrackingSource = "pose" | "hand" | "synthetic" | "last-good";

export type MovementTrackingEndpointSelection = {
  target: TrackingLandmark | null;
  source: MovementTrackingSource;
  confidence: number;
};

export type MovementLowerBodyIntent = {
  squatDepth: number;
  leftKneeRaise: number;
  rightKneeRaise: number;
  squatSignals: {
    hipDrop: number;
    kneeBend: number;
    torsoDrop: number;
    headDrop: number;
  };
  confidence: number;
  label: "neutral" | "squat" | "left-knee-raise" | "right-knee-raise" | "mixed-lower-body";
};

export type MovementHeadMotionIntent = {
  lateral: number;
  vertical: number;
  depth: number;
  confidence: number;
  label: "neutral" | "side-left" | "side-right" | "forward" | "back" | "mixed-head";
};

export type MovementHandsForConfidence = Partial<
  Record<MovementHandSide, { landmarks?: TrackingLandmark[] } | null>
>;

const EMPTY_SQUAT_SIGNALS: MovementLowerBodyIntent["squatSignals"] = {
  hipDrop: 0,
  kneeBend: 0,
  torsoDrop: 0,
  headDrop: 0,
};

export const DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE: MovementAvatarTrackingProfile = {
  // Mesh-aesthetic head-attitude trims. Not derivable from the rig: all four
  // VIPE skeletons measure identically, yet each mesh carries its face at a
  // slightly different pitch. Per-avatar overrides live in
  // movementAvatarProfiles.ts; anything unprofiled reads as untrimmed.
  headPitchOffset: 0,
  headYawOffset: 0,
  headRollOffset: 0,
  // Human-plausible head range of motion in radians.
  minHeadPitch: -0.45,
  maxHeadPitch: 0.85,
  maxHeadYaw: 1.3,
  maxHeadRoll: 0.75,
  // Smoothing, not geometry: one tuned value per bone group, shared by every
  // avatar (unified 2026-07-09 from the converged per-avatar hand tunings).
  headSlerp: 0.6,
  neckPitchShare: 0.28,
  neckYawShare: 0.18,
  neckRollShare: 0.18,
  neckSlerp: 0.26,
  legSlerp: 0.42,
  footSlerp: 0.34,
  // MediaPipe visibility gate for player arm readiness.
  armVisibility: 0.05,
  // Fallbacks for rigs without measurements; measured rigs derive these from
  // hip height (getCalibratedFloorCorrection) and leg length
  // (resolveMovementAvatarHipsPositionOptions).
  floorCorrectionScale: 1.6,
  floorCorrectionLimit: 0.35,
  squatHipDropScale: 0.38,
  squatHipDropLimit: 0.42,
  // Recorded-presentation pose emphasis.
  squatLegBendBoost: 0.32,
  kneeRaiseUpperLegBoost: 0.18,
  kneeRaiseLowerLegBoost: 0.08,
};

const MIN_CALIBRATION_QUALITY = 0.45;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function visibility(landmark?: TrackingLandmark | null) {
  return landmark?.visibility ?? 0.8;
}

function midpoint(a: TrackingLandmark, b: TrackingLandmark) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function distance2D(a: TrackingLandmark, b: TrackingLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleAtJoint(a: TrackingLandmark, joint: TrackingLandmark, b: TrackingLandmark) {
  const ax = a.x - joint.x;
  const ay = a.y - joint.y;
  const bx = b.x - joint.x;
  const by = b.y - joint.y;
  const aLength = Math.hypot(ax, ay);
  const bLength = Math.hypot(bx, by);
  if (aLength < 0.0001 || bLength < 0.0001) return Math.PI;

  return Math.acos(clamp((ax * bx + ay * by) / (aLength * bLength), -1, 1));
}

function estimatePoseHeadCenter(poseLandmarks: TrackingLandmark[]) {
  const nose = poseLandmarks[0];
  const leftEar = poseLandmarks[7];
  const rightEar = poseLandmarks[8];
  if (!nose || !leftEar || !rightEar) return null;

  return {
    x: average([nose.x, leftEar.x, rightEar.x]),
    y: average([nose.y, leftEar.y, rightEar.y]),
    z: average([nose.z ?? 0, leftEar.z ?? 0, rightEar.z ?? 0]),
    visibility: average([visibility(nose), visibility(leftEar), visibility(rightEar)]),
  };
}

function estimateHeadScale({
  poseLandmarks,
  faceLandmarks,
}: {
  poseLandmarks: TrackingLandmark[];
  faceLandmarks?: TrackingLandmark[] | null;
}) {
  const faceLeftEye = faceLandmarks?.[33];
  const faceRightEye = faceLandmarks?.[263];
  if (faceLeftEye && faceRightEye) return distance2D(faceLeftEye, faceRightEye);

  const leftEar = poseLandmarks[7];
  const rightEar = poseLandmarks[8];
  if (!leftEar || !rightEar) return 0;
  return distance2D(leftEar, rightEar);
}

function estimateHeadAnglesFromFace(faceLandmarks?: TrackingLandmark[] | null): MovementHeadAngles | null {
  if (!faceLandmarks || faceLandmarks.length < 264) return null;

  const nose = faceLandmarks[1] ?? faceLandmarks[4];
  const leftEye = faceLandmarks[33];
  const rightEye = faceLandmarks[263];

  if (!nose || !leftEye || !rightEye) return null;

  const eyeDistance = distance2D(leftEye, rightEye);
  if (eyeDistance < 0.001) return null;

  const eyeCenter = midpoint(leftEye, rightEye);
  // Coordinate reflection can reverse the horizontal eye ordering. Roll is an
  // anatomical tilt, so its denominator must be independent of screen order.
  const roll = -Math.atan2(rightEye.y - leftEye.y, Math.abs(rightEye.x - leftEye.x));
  const yaw = clamp(((nose.x - eyeCenter.x) / eyeDistance) * 1.4, -1.2, 1.2);
  const pitch = clamp(((nose.y - eyeCenter.y) / eyeDistance - 0.18) * 1.2, -1.2, 1.2);

  return {
    pitch,
    yaw,
    roll,
    confidence: 0.95,
    source: "face",
  };
}

function estimateHeadAnglesFromPose(poseLandmarks: TrackingLandmark[]): MovementHeadAngles {
  const leftEar = poseLandmarks[7];
  const rightEar = poseLandmarks[8];
  const nose = poseLandmarks[0];

  if (!leftEar || !rightEar || !nose) {
    return { pitch: 0, yaw: 0, roll: 0, confidence: 0, source: "none" };
  }

  const dx = Math.abs(rightEar.x - leftEar.x);
  const dy = -(rightEar.y - leftEar.y);
  const dz = (leftEar.z ?? 0) - (rightEar.z ?? 0);
  const headSize = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
  const earsY = (leftEar.y + rightEar.y) / 2;
  const normalizedY = (nose.y - earsY) / headSize;

  return {
    pitch: clamp(-(normalizedY - 0.2) * 2.0, -1.2, 1.2),
    yaw: clamp(Math.atan2(dz, dx || 0.001) * 1.5, -1.3, 1.3),
    roll: clamp(-Math.atan2(dy, dx || 0.001), -0.9, 0.9),
    confidence: clamp(average([visibility(leftEar), visibility(rightEar), visibility(nose)]), 0, 1),
    source: "pose",
  };
}

export function estimateMovementHeadAngles({
  poseLandmarks,
  faceLandmarks,
}: {
  poseLandmarks: TrackingLandmark[];
  faceLandmarks?: TrackingLandmark[] | null;
}): MovementHeadAngles {
  return estimateHeadAnglesFromFace(faceLandmarks) ?? estimateHeadAnglesFromPose(poseLandmarks);
}

export function getMovementBodyConfidence(
  poseLandmarks: TrackingLandmark[],
  hands: MovementHandsForConfidence = {},
) {
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];

  return {
    head: average([visibility(poseLandmarks[0]), visibility(poseLandmarks[7]), visibility(poseLandmarks[8])]),
    torso: average([
      visibility(leftShoulder),
      visibility(rightShoulder),
      visibility(leftHip),
      visibility(rightHip),
    ]),
    leftShoulder: visibility(leftShoulder),
    rightShoulder: visibility(rightShoulder),
    leftElbow: visibility(poseLandmarks[13]),
    rightElbow: visibility(poseLandmarks[14]),
    leftWrist: visibility(poseLandmarks[15]),
    rightWrist: visibility(poseLandmarks[16]),
    leftHand: hands.left?.landmarks?.[0] ? visibility(hands.left.landmarks[0]) : 0,
    rightHand: hands.right?.landmarks?.[0] ? visibility(hands.right.landmarks[0]) : 0,
    hips: average([visibility(leftHip), visibility(rightHip)]),
    leftKnee: visibility(poseLandmarks[25]),
    rightKnee: visibility(poseLandmarks[26]),
    leftAnkle: visibility(poseLandmarks[27]),
    rightAnkle: visibility(poseLandmarks[28]),
    leftFoot: average([visibility(poseLandmarks[29]), visibility(poseLandmarks[31])]),
    rightFoot: average([visibility(poseLandmarks[30]), visibility(poseLandmarks[32])]),
  };
}

export function buildMovementCalibration({
  poseLandmarks,
  faceLandmarks,
  now = Date.now(),
}: {
  poseLandmarks: TrackingLandmark[];
  faceLandmarks?: TrackingLandmark[] | null;
  now?: number;
}): MovementCalibration | null {
  if (poseLandmarks.length < 33) return null;

  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const bodyConfidence = getMovementBodyConfidence(poseLandmarks);
  const coreQuality = average([
    bodyConfidence.torso,
    bodyConfidence.head,
    bodyConfidence.leftKnee,
    bodyConfidence.rightKnee,
  ]);

  if (coreQuality < MIN_CALIBRATION_QUALITY) return null;

  const shoulders = midpoint(leftShoulder, rightShoulder);
  const hips = midpoint(leftHip, rightHip);
  const headCenter = estimatePoseHeadCenter(poseLandmarks);
  const headScale = estimateHeadScale({ poseLandmarks, faceLandmarks });

  return {
    calibratedAt: now,
    headNeutral: estimateMovementHeadAngles({ poseLandmarks, faceLandmarks }),
    headCenter: headCenter
      ? { x: headCenter.x, y: headCenter.y, z: headCenter.z }
      : undefined,
    headScale,
    hipCenter: hips,
    shoulderCenter: shoulders,
    shoulderWidth: distance2D(leftShoulder, rightShoulder),
    torsoHeight: distance2D(shoulders, hips),
    floorY: Math.max(
      poseLandmarks[27]?.y ?? hips.y,
      poseLandmarks[28]?.y ?? hips.y,
      poseLandmarks[31]?.y ?? hips.y,
      poseLandmarks[32]?.y ?? hips.y,
    ),
    quality: clamp(coreQuality, 0, 1),
  };
}

export function buildUpperBodyMovementAutoCalibration({
  poseLandmarks,
  faceLandmarks,
  now = Date.now(),
}: {
  poseLandmarks: TrackingLandmark[];
  faceLandmarks?: TrackingLandmark[] | null;
  now?: number;
}): MovementCalibration | null {
  if (poseLandmarks.length < 33) return null;

  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const bodyConfidence = getMovementBodyConfidence(poseLandmarks);
  const shoulderConfidence = average([
    bodyConfidence.leftShoulder,
    bodyConfidence.rightShoulder,
  ]);
  const upperBodyQuality = average([bodyConfidence.head, shoulderConfidence]);
  if (shoulderConfidence < MIN_CALIBRATION_QUALITY || bodyConfidence.head < 0.35) return null;
  if (upperBodyQuality < MIN_CALIBRATION_QUALITY) return null;

  const shoulders = midpoint(leftShoulder, rightShoulder);
  const hips = midpoint(leftHip, rightHip);
  const headCenter = estimatePoseHeadCenter(poseLandmarks);
  const headScale = estimateHeadScale({ poseLandmarks, faceLandmarks });
  const torsoHeight = distance2D(shoulders, hips);
  const stackOffset = Math.abs(shoulders.x - hips.x) / Math.max(torsoHeight, 0.12);
  const shoulderTilt = Math.abs(rightShoulder.y - leftShoulder.y);
  const hipTilt = Math.abs(rightHip.y - leftHip.y);
  if (torsoHeight < 0.12 || stackOffset > 0.42 || shoulderTilt > 0.08 || hipTilt > 0.08) {
    return null;
  }

  const visibleFloorLandmarks = [
    poseLandmarks[27],
    poseLandmarks[28],
    poseLandmarks[31],
    poseLandmarks[32],
  ].filter((landmark): landmark is TrackingLandmark => Boolean(landmark && visibility(landmark) >= 0.3));
  const floorY = visibleFloorLandmarks.length > 0
    ? Math.max(...visibleFloorLandmarks.map((landmark) => landmark.y))
    : hips.y + Math.max(torsoHeight, 0.12) * 1.45;

  return {
    calibratedAt: now,
    headNeutral: estimateMovementHeadAngles({ poseLandmarks, faceLandmarks }),
    headCenter: headCenter
      ? { x: headCenter.x, y: headCenter.y, z: headCenter.z }
      : undefined,
    headScale,
    hipCenter: hips,
    shoulderCenter: shoulders,
    shoulderWidth: distance2D(leftShoulder, rightShoulder),
    torsoHeight,
    floorY,
    quality: clamp(upperBodyQuality, 0, 1),
  };
}

export function buildUprightMovementAutoCalibration({
  poseLandmarks,
  faceLandmarks,
  now = Date.now(),
}: {
  poseLandmarks: TrackingLandmark[];
  faceLandmarks?: TrackingLandmark[] | null;
  now?: number;
}): MovementCalibration | null {
  const calibration = buildMovementCalibration({ poseLandmarks, faceLandmarks, now });
  if (!calibration) return null;

  const bodyConfidence = getMovementBodyConfidence(poseLandmarks);
  const lowerBodyConfidence = average([
    bodyConfidence.hips,
    bodyConfidence.leftKnee,
    bodyConfidence.rightKnee,
    bodyConfidence.leftFoot,
    bodyConfidence.rightFoot,
  ]);
  const hipToFloor = calibration.floorY - calibration.hipCenter.y;
  const uprightRatio = hipToFloor / Math.max(calibration.torsoHeight, 0.12);

  if (lowerBodyConfidence < 0.55) return null;
  if (uprightRatio < 0.78) return null;

  return calibration;
}

export type MovementAutoCalibrationKind = "full-body" | "upper-body";

export type MovementAutoCalibrationState = {
  calibration: MovementCalibration | null;
  kind: MovementAutoCalibrationKind | null;
  samples: MovementCalibration[];
};

export function resolveMovementAutoCalibrationState({
  faceLandmarks,
  maxRejectedSampleHistory = 3,
  maxSampleHistory = 10,
  minSamples = 6,
  now = Date.now(),
  poseLandmarks,
  state,
}: {
  faceLandmarks?: TrackingLandmark[] | null;
  maxRejectedSampleHistory?: number;
  maxSampleHistory?: number;
  minSamples?: number;
  now?: number;
  poseLandmarks: TrackingLandmark[];
  state: MovementAutoCalibrationState;
}): MovementAutoCalibrationState {
  if (state.calibration) return state;

  const fullBodyAutoCalibrationSample = buildUprightMovementAutoCalibration({
    poseLandmarks,
    faceLandmarks,
    now,
  });
  const upperBodyAutoCalibrationSample =
    fullBodyAutoCalibrationSample ??
    buildUpperBodyMovementAutoCalibration({
      poseLandmarks,
      faceLandmarks,
      now,
    });
  const autoCalibrationSample = fullBodyAutoCalibrationSample ?? upperBodyAutoCalibrationSample;

  if (!autoCalibrationSample) {
    const samples = state.samples.slice(-maxRejectedSampleHistory);
    return {
      calibration: null,
      kind: samples.length === 0 ? null : state.kind,
      samples,
    };
  }

  const samples = [...state.samples, autoCalibrationSample].slice(-maxSampleHistory);
  const kind = fullBodyAutoCalibrationSample ? "full-body" : "upper-body";

  return {
    calibration: samples.length >= minSamples
      ? averageMovementCalibrations(samples)
      : null,
    kind: samples.length >= minSamples ? kind : state.kind,
    samples,
  };
}

export function averageMovementCalibrations(
  samples: MovementCalibration[],
): MovementCalibration | null {
  if (samples.length === 0) return null;

  return {
    calibratedAt: samples[samples.length - 1]?.calibratedAt ?? Date.now(),
    headNeutral: {
      pitch: average(samples.map((sample) => sample.headNeutral.pitch)),
      yaw: average(samples.map((sample) => sample.headNeutral.yaw)),
      roll: average(samples.map((sample) => sample.headNeutral.roll)),
      confidence: average(samples.map((sample) => sample.headNeutral.confidence)),
      source: samples.some((sample) => sample.headNeutral.source === "face") ? "face" : "pose",
    },
    headCenter: samples.some((sample) => sample.headCenter)
      ? {
          x: average(samples.map((sample) => sample.headCenter?.x ?? 0)),
          y: average(samples.map((sample) => sample.headCenter?.y ?? 0)),
          z: average(samples.map((sample) => sample.headCenter?.z ?? 0)),
        }
      : undefined,
    headScale: average(samples.map((sample) => sample.headScale ?? 0)),
    hipCenter: {
      x: average(samples.map((sample) => sample.hipCenter.x)),
      y: average(samples.map((sample) => sample.hipCenter.y)),
      z: average(samples.map((sample) => sample.hipCenter.z)),
    },
    shoulderCenter: samples.some((sample) => sample.shoulderCenter)
      ? {
          x: average(samples.map((sample) => sample.shoulderCenter?.x ?? 0)),
          y: average(samples.map((sample) => sample.shoulderCenter?.y ?? 0)),
          z: average(samples.map((sample) => sample.shoulderCenter?.z ?? 0)),
        }
      : undefined,
    shoulderWidth: average(samples.map((sample) => sample.shoulderWidth)),
    torsoHeight: average(samples.map((sample) => sample.torsoHeight)),
    floorY: average(samples.map((sample) => sample.floorY)),
    quality: average(samples.map((sample) => sample.quality)),
  };
}

export function applyHeadCalibration({
  rawHead,
  calibration,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
}: {
  rawHead: MovementHeadAngles;
  calibration?: MovementCalibration | null;
  profile?: MovementAvatarTrackingProfile;
}): MovementHeadAngles {
  const neutral = calibration?.headNeutral;

  return {
    pitch: clamp(
      rawHead.pitch - (neutral?.pitch ?? 0) + profile.headPitchOffset,
      profile.minHeadPitch,
      profile.maxHeadPitch,
    ),
    yaw: clamp(
      rawHead.yaw - (neutral?.yaw ?? 0) + profile.headYawOffset,
      -profile.maxHeadYaw,
      profile.maxHeadYaw,
    ),
    roll: clamp(
      rawHead.roll - (neutral?.roll ?? 0) + profile.headRollOffset,
      -profile.maxHeadRoll,
      profile.maxHeadRoll,
    ),
    confidence: rawHead.confidence,
    source: rawHead.source,
  };
}

export function getNeutralMovementHeadAngles(
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
): MovementHeadAngles {
  return {
    pitch: clamp(profile.headPitchOffset, profile.minHeadPitch, profile.maxHeadPitch),
    yaw: clamp(profile.headYawOffset, -profile.maxHeadYaw, profile.maxHeadYaw),
    roll: clamp(profile.headRollOffset, -profile.maxHeadRoll, profile.maxHeadRoll),
    confidence: 1,
    source: "none",
  };
}

export function selectMovementTrackingEndpoint({
  poseTarget,
  secondaryTarget,
  secondarySource = "hand",
  poseVisibilityThreshold = 0.2,
  secondaryVisibilityThreshold = 0.15,
  preferSecondaryWhenPoseBelow = 0.55,
}: {
  poseTarget?: TrackingLandmark | null;
  secondaryTarget?: TrackingLandmark | null;
  secondarySource?: Exclude<MovementTrackingSource, "pose" | "last-good">;
  poseVisibilityThreshold?: number;
  secondaryVisibilityThreshold?: number;
  preferSecondaryWhenPoseBelow?: number;
}): MovementTrackingEndpointSelection {
  const poseConfidence = poseTarget ? visibility(poseTarget) : 0;
  const secondaryConfidence = secondaryTarget ? visibility(secondaryTarget) : 0;
  const hasPose = Boolean(poseTarget && poseConfidence >= poseVisibilityThreshold);
  const hasSecondary = Boolean(
    secondaryTarget && secondaryConfidence >= secondaryVisibilityThreshold,
  );

  if (hasSecondary && (!hasPose || poseConfidence < preferSecondaryWhenPoseBelow)) {
    return {
      target: secondaryTarget ?? null,
      source: secondarySource,
      confidence: secondaryConfidence,
    };
  }

  if (hasPose) {
    return {
      target: poseTarget ?? null,
      source: "pose",
      confidence: poseConfidence,
    };
  }

  if (hasSecondary) {
    return {
      target: secondaryTarget ?? null,
      source: secondarySource,
      confidence: secondaryConfidence,
    };
  }

  return {
    target: null,
    source: "last-good",
    confidence: Math.max(poseConfidence, secondaryConfidence),
  };
}

export function getCalibratedFloorCorrection({
  calibration,
  currentFloorY,
  floorConfidence,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  rigMeasurements = null,
}: {
  calibration?: MovementCalibration | null;
  currentFloorY?: number | null;
  floorConfidence: number;
  profile?: MovementAvatarTrackingProfile;
  rigMeasurements?: { hipHeight: number } | null;
}) {
  if (!calibration || currentFloorY === undefined || currentFloorY === null) return 0;
  if (floorConfidence < 0.35) return 0;

  // The scale converts a normalized-image floor drift into avatar-world
  // units: the source's calibrated hip-to-floor span corresponds to the
  // rig's hip height. The hand-authored profile knobs remain the fallback
  // for rigs without measurements or degenerate calibrations (hips near
  // the floor at calibration time would blow the ratio up).
  const hipToFloor = calibration.floorY - calibration.hipCenter.y;
  const canDerive = rigMeasurements !== null && hipToFloor > 0.2;
  const scale = canDerive
    ? rigMeasurements.hipHeight / hipToFloor
    : profile.floorCorrectionScale;
  const limit = canDerive
    ? rigMeasurements.hipHeight * 0.4
    : profile.floorCorrectionLimit;

  return clamp(
    (currentFloorY - calibration.floorY) * scale,
    -limit,
    limit,
  );
}

function getFloorRelativeSquatDepth({
  calibration,
  currentFloorY,
  currentTorsoScale,
  floorConfidence,
  hips,
  torsoScale,
}: {
  calibration: MovementCalibration;
  currentFloorY: number;
  currentTorsoScale: number;
  floorConfidence: number;
  hips: { x: number; y: number; z: number };
  torsoScale: number;
}) {
  const absoluteHipDrop = clamp((hips.y - calibration.hipCenter.y) / (torsoScale * 0.62), 0, 1);
  if (floorConfidence < 0.35) return absoluteHipDrop;

  const calibratedHipToFloor = calibration.floorY - calibration.hipCenter.y;
  const currentHipToFloor = currentFloorY - hips.y;
  const floorDistanceDrop = clamp((calibratedHipToFloor - currentHipToFloor) / (torsoScale * 0.8), 0, 1);
  const calibratedHipToFloorRatio = calibratedHipToFloor / Math.max(torsoScale, 0.001);
  const currentHipToFloorRatio = currentHipToFloor / Math.max(currentTorsoScale, 0.001);
  const bodyRatioDrop = clamp((calibratedHipToFloorRatio - currentHipToFloorRatio) / 0.76, 0, 1);

  return Math.min(floorDistanceDrop, bodyRatioDrop);
}

function lateralSingleLegRaiseDepth({
  ankle,
  hip,
  isLeft,
  knee,
  kneeAngle,
  torsoScale,
}: {
  ankle?: TrackingLandmark;
  hip: TrackingLandmark;
  isLeft: boolean;
  knee: TrackingLandmark;
  kneeAngle: number;
  torsoScale: number;
}) {
  if (kneeAngle < 2.45) return 0;

  const direction = isLeft ? -1 : 1;
  const kneeOffset = (knee.x - hip.x) * direction;
  const ankleOffset = ankle ? (ankle.x - hip.x) * direction : kneeOffset;
  const sideOffset = Math.max(kneeOffset, ankleOffset);
  return clamp((sideOffset - torsoScale * 0.16) / (torsoScale * 0.48), 0, 1);
}

export function getMovementLowerBodyIntent({
  poseLandmarks,
  calibration,
}: {
  poseLandmarks: TrackingLandmark[];
  calibration?: MovementCalibration | null;
}): MovementLowerBodyIntent {
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftKnee = poseLandmarks[25];
  const rightKnee = poseLandmarks[26];
  const leftAnkle = poseLandmarks[27];
  const rightAnkle = poseLandmarks[28];

  const estimateUncalibratedLowerBodyIntent = (): MovementLowerBodyIntent => {
    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return {
        squatDepth: 0,
        leftKneeRaise: 0,
        rightKneeRaise: 0,
        squatSignals: EMPTY_SQUAT_SIGNALS,
        confidence: 0,
        label: "neutral",
      };
    }

    const hipConfidence = average([visibility(leftHip), visibility(rightHip)]);
    const kneeConfidence = average([visibility(leftKnee), visibility(rightKnee)]);
    const ankleConfidence = average([visibility(leftAnkle), visibility(rightAnkle)]);
    const shoulderConfidence = leftShoulder && rightShoulder
      ? average([visibility(leftShoulder), visibility(rightShoulder)])
      : 0;
    const confidence = clamp(average([hipConfidence, kneeConfidence, ankleConfidence]), 0, 1);
    if (confidence < 0.35) {
      return {
        squatDepth: 0,
        leftKneeRaise: 0,
        rightKneeRaise: 0,
        squatSignals: EMPTY_SQUAT_SIGNALS,
        confidence,
        label: "neutral",
      };
    }

    const leftKneeAngle = angleAtJoint(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = angleAtJoint(rightHip, rightKnee, rightAnkle);
    const kneeAngleDifference = Math.abs(leftKneeAngle - rightKneeAngle);
    const averageKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    const kneeBendDepth = kneeAngleDifference < 0.5
      ? clamp((2.62 - averageKneeAngle) / 1.2, 0, 1)
      : 0;
    const hips = midpoint(leftHip, rightHip);
    const shoulders = leftShoulder && rightShoulder && shoulderConfidence >= 0.35
      ? midpoint(leftShoulder, rightShoulder)
      : null;
    const ankles = midpoint(leftAnkle, rightAnkle);
    const currentTorsoScale = shoulders
      ? Math.max(distance2D(shoulders, hips), 0.12)
      : Math.max(distance2D(hips, ankles) * 0.62, 0.12);
    const kneeRaiseThreshold = hips.y + currentTorsoScale * 0.34;
    const kneeRaiseWindow = currentTorsoScale * 0.72;
    const leftKneeRaise = visibility(leftKnee) >= 0.3
      ? clamp((kneeRaiseThreshold - leftKnee.y) / kneeRaiseWindow, 0, 1)
      : 0;
    const rightKneeRaise = visibility(rightKnee) >= 0.3
      ? clamp((kneeRaiseThreshold - rightKnee.y) / kneeRaiseWindow, 0, 1)
      : 0;
    const leftSideRaise = visibility(leftKnee) >= 0.3
      ? lateralSingleLegRaiseDepth({
          ankle: leftAnkle,
          hip: leftHip,
          isLeft: true,
          knee: leftKnee,
          kneeAngle: leftKneeAngle,
          torsoScale: currentTorsoScale,
        })
      : 0;
    const rightSideRaise = visibility(rightKnee) >= 0.3
      ? lateralSingleLegRaiseDepth({
          ankle: rightAnkle,
          hip: rightHip,
          isLeft: false,
          knee: rightKnee,
          kneeAngle: rightKneeAngle,
          torsoScale: currentTorsoScale,
        })
      : 0;
    const leftLegRaise = Math.max(leftKneeRaise, leftSideRaise);
    const rightLegRaise = Math.max(rightKneeRaise, rightSideRaise);
    const strongestKneeRaise = Math.max(leftLegRaise, rightLegRaise);
    const kneeRaiseDifference = Math.abs(leftLegRaise - rightLegRaise);
    const clearSingleKneeRaise = strongestKneeRaise > 0.45 && kneeRaiseDifference > 0.32;
    const squatDepth = clearSingleKneeRaise ? 0 : kneeBendDepth;
    const label =
      clearSingleKneeRaise
        ? leftLegRaise > rightLegRaise
          ? "left-knee-raise"
          : "right-knee-raise"
        : leftLegRaise > 0.32 && rightLegRaise > 0.32
          ? "mixed-lower-body"
          : leftLegRaise > 0.32
            ? "left-knee-raise"
            : rightLegRaise > 0.32
              ? "right-knee-raise"
              : squatDepth > 0.18
                ? "squat"
                : "neutral";

    return {
      squatDepth: label === "squat" ? squatDepth : 0,
      leftKneeRaise: leftLegRaise,
      rightKneeRaise: rightLegRaise,
      squatSignals: {
        hipDrop: 0,
        kneeBend: kneeBendDepth,
        torsoDrop: 0,
        headDrop: 0,
      },
      confidence,
      label,
    };
  };

  if (!calibration || !leftHip || !rightHip || !leftKnee || !rightKnee) {
    return estimateUncalibratedLowerBodyIntent();
  }

  const hips = midpoint(leftHip, rightHip);
  const shoulders = leftShoulder && rightShoulder ? midpoint(leftShoulder, rightShoulder) : null;
  const currentTorsoScale = shoulders
    ? Math.max(distance2D(shoulders, hips), 0.12)
    : Math.max(calibration.torsoHeight, 0.12);
  const torsoScale = Math.max(calibration.torsoHeight, 0.12);
  const hipConfidence = average([visibility(leftHip), visibility(rightHip)]);
  const kneeConfidence = average([visibility(leftKnee), visibility(rightKnee)]);
  const ankleConfidence = average([visibility(leftAnkle), visibility(rightAnkle)]);
  const footConfidence = Math.max(
    visibility(poseLandmarks[27]),
    visibility(poseLandmarks[28]),
    visibility(poseLandmarks[31]),
    visibility(poseLandmarks[32]),
  );
  const confidence = clamp(average([hipConfidence, kneeConfidence, ankleConfidence]), 0, 1);

  if (confidence < 0.35 || calibration.quality < 0.45) {
    return estimateUncalibratedLowerBodyIntent();
  }

  const currentFloorY = Math.max(
    poseLandmarks[27]?.y ?? calibration.floorY,
    poseLandmarks[28]?.y ?? calibration.floorY,
    poseLandmarks[31]?.y ?? calibration.floorY,
    poseLandmarks[32]?.y ?? calibration.floorY,
  );
  const rawSquatDepth = getFloorRelativeSquatDepth({
    calibration,
    currentFloorY,
    currentTorsoScale,
    floorConfidence: footConfidence,
    hips,
    torsoScale,
  });
  const shoulderDrop = shoulders && calibration.shoulderCenter
    ? shoulders.y - calibration.shoulderCenter.y
    : 0;
  const headCenter = estimatePoseHeadCenter(poseLandmarks);
  const headDrop = headCenter && calibration.headCenter
    ? headCenter.y - calibration.headCenter.y
    : 0;
  const torsoDropDepth = clamp(shoulderDrop / (torsoScale * 0.55), 0, 1);
  const headDropDepth = clamp(headDrop / (torsoScale * 0.8), 0, 1);
  const kneeRaiseThreshold = hips.y + currentTorsoScale * 0.34;
  const kneeRaiseWindow = currentTorsoScale * 0.72;
  const leftKneeRaise = visibility(leftKnee) >= 0.3
    ? clamp((kneeRaiseThreshold - leftKnee.y) / kneeRaiseWindow, 0, 1)
    : 0;
  const rightKneeRaise = visibility(rightKnee) >= 0.3
    ? clamp((kneeRaiseThreshold - rightKnee.y) / kneeRaiseWindow, 0, 1)
    : 0;
  const leftKneeAngle = leftAnkle ? angleAtJoint(leftHip, leftKnee, leftAnkle) : Math.PI;
  const rightKneeAngle = rightAnkle ? angleAtJoint(rightHip, rightKnee, rightAnkle) : Math.PI;
  const leftSideRaise = visibility(leftKnee) >= 0.3
    ? lateralSingleLegRaiseDepth({
        ankle: leftAnkle,
        hip: leftHip,
        isLeft: true,
        knee: leftKnee,
        kneeAngle: leftKneeAngle,
        torsoScale: currentTorsoScale,
      })
    : 0;
  const rightSideRaise = visibility(rightKnee) >= 0.3
    ? lateralSingleLegRaiseDepth({
        ankle: rightAnkle,
        hip: rightHip,
        isLeft: false,
        knee: rightKnee,
        kneeAngle: rightKneeAngle,
        torsoScale: currentTorsoScale,
      })
    : 0;
  const leftLegRaise = Math.max(leftKneeRaise, leftSideRaise);
  const rightLegRaise = Math.max(rightKneeRaise, rightSideRaise);
  const strongestKneeRaise = Math.max(leftLegRaise, rightLegRaise);
  const kneeRaiseDifference = Math.abs(leftLegRaise - rightLegRaise);
  const clearSingleKneeRaise = strongestKneeRaise > 0.45 && kneeRaiseDifference > 0.32;
  const kneeAngleDifference = Math.abs(leftKneeAngle - rightKneeAngle);
  const averageKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
  const kneeBendDepth = kneeAngleDifference < 0.5
    ? clamp((2.62 - averageKneeAngle) / 1.2, 0, 1)
    : 0;
  const squatSignals = {
    hipDrop: rawSquatDepth,
    kneeBend: kneeBendDepth,
    torsoDrop: torsoDropDepth,
    headDrop: headDropDepth,
  };
  const lowerBodySquatEvidence = Math.max(rawSquatDepth, kneeBendDepth);
  const postureDropDepth = Math.max(torsoDropDepth, headDropDepth);
  const hasSquatLegEvidence =
    rawSquatDepth > 0.12 ||
    (kneeBendDepth > 0.22 && postureDropDepth > 0.18);
  const compositeSquatDepth = clamp(
    lowerBodySquatEvidence * 0.82 +
      (hasSquatLegEvidence ? postureDropDepth * 0.42 : 0),
    0,
    1,
  );
  const squatDepth = hasSquatLegEvidence
    ? Math.max(
        rawSquatDepth,
        kneeBendDepth,
        compositeSquatDepth,
      )
    : 0;
  const label =
    squatDepth > 0.22 && !clearSingleKneeRaise
      ? "squat"
      : clearSingleKneeRaise
        ? leftLegRaise > rightLegRaise
          ? "left-knee-raise"
          : "right-knee-raise"
      : leftLegRaise > 0.32 && rightLegRaise > 0.32
        ? "mixed-lower-body"
        : leftLegRaise > 0.32
          ? "left-knee-raise"
          : rightLegRaise > 0.32
            ? "right-knee-raise"
            : squatDepth > 0.16
              ? "squat"
              : "neutral";

  return {
    squatDepth: label === "squat" ? squatDepth : 0,
    leftKneeRaise: leftLegRaise,
    rightKneeRaise: rightLegRaise,
    squatSignals,
    confidence,
    label,
  };
}

export function getMovementHeadMotionIntent({
  poseLandmarks,
  faceLandmarks,
  calibration,
}: {
  poseLandmarks: TrackingLandmark[];
  faceLandmarks?: TrackingLandmark[] | null;
  calibration?: MovementCalibration | null;
}): MovementHeadMotionIntent {
  const headCenter = estimatePoseHeadCenter(poseLandmarks);
  const neutralHeadCenter = calibration?.headCenter;

  if (!calibration || !headCenter || !neutralHeadCenter) {
    return {
      lateral: 0,
      vertical: 0,
      depth: 0,
      confidence: 0,
      label: "neutral",
    };
  }

  const shoulderScale = Math.max(calibration.shoulderWidth, 0.16);
  const currentHeadScale = estimateHeadScale({ poseLandmarks, faceLandmarks });
  const neutralHeadScale = Math.max(calibration.headScale ?? 0, 0.04);
  const confidence = clamp(headCenter.visibility, 0, 1);

  if (confidence < 0.35 || calibration.quality < 0.45) {
    return {
      lateral: 0,
      vertical: 0,
      depth: 0,
      confidence,
      label: "neutral",
    };
  }

  const lateral = clamp((headCenter.x - neutralHeadCenter.x) / (shoulderScale * 0.65), -1, 1);
  const vertical = clamp((headCenter.y - neutralHeadCenter.y) / (shoulderScale * 0.75), -1, 1);
  const depth = clamp(((currentHeadScale / neutralHeadScale) - 1) * 2.4, -1, 1);
  const strongestPlanar = Math.max(Math.abs(lateral), Math.abs(depth));
  const label =
    Math.abs(lateral) > 0.28 && Math.abs(depth) > 0.28
      ? "mixed-head"
      : lateral > 0.25
        ? "side-right"
        : lateral < -0.25
          ? "side-left"
          : depth > 0.22
            ? "forward"
            : depth < -0.22
              ? "back"
              : strongestPlanar > 0.18
                ? "mixed-head"
                : "neutral";

  return {
    lateral,
    vertical,
    depth,
    confidence,
    label,
  };
}

export function selectMovementKneeTarget({
  hip,
  knee,
  ankle,
  side,
  minBend = 0.04,
  visibilityThreshold = 0.25,
}: {
  hip?: TrackingLandmark | null;
  knee?: TrackingLandmark | null;
  ankle?: TrackingLandmark | null;
  side: MovementHandSide;
  minBend?: number;
  visibilityThreshold?: number;
}): MovementTrackingEndpointSelection {
  const hipConfidence = hip ? visibility(hip) : 0;
  const kneeConfidence = knee ? visibility(knee) : 0;
  const ankleConfidence = ankle ? visibility(ankle) : 0;
  const hasKnee = Boolean(knee && kneeConfidence >= visibilityThreshold);
  const hasChain = Boolean(
    hip &&
      ankle &&
      hipConfidence >= visibilityThreshold &&
      ankleConfidence >= visibilityThreshold,
  );

  if (!hasKnee && !hasChain) {
    return {
      target: null,
      source: "last-good",
      confidence: Math.max(hipConfidence, kneeConfidence, ankleConfidence),
    };
  }

  const chainMidpoint = hip && ankle ? midpoint(hip, ankle) : null;
  const sideDirection = side === "left" ? -1 : 1;
  const minimumKneeX = chainMidpoint ? chainMidpoint.x + sideDirection * minBend : undefined;

  if (hasKnee && knee) {
    const shouldCorrect =
      minimumKneeX !== undefined &&
      ((side === "left" && knee.x > minimumKneeX) ||
        (side === "right" && knee.x < minimumKneeX));

    if (!shouldCorrect) {
      return {
        target: knee,
        source: "pose",
        confidence: kneeConfidence,
      };
    }

    return {
      target: {
        ...knee,
        x: minimumKneeX,
        visibility: knee.visibility,
      },
      source: "synthetic",
      confidence: kneeConfidence,
    };
  }

  if (chainMidpoint && hip && ankle) {
    return {
      target: {
        x: chainMidpoint.x + sideDirection * minBend,
        y: chainMidpoint.y,
        z: chainMidpoint.z,
        visibility: Math.min(hipConfidence, ankleConfidence) * 0.8,
      },
      source: "synthetic",
      confidence: Math.min(hipConfidence, ankleConfidence) * 0.8,
    };
  }

  return {
    target: null,
    source: "last-good",
    confidence: Math.max(hipConfidence, kneeConfidence, ankleConfidence),
  };
}

export function getMovementTrackingHealthWarnings(
  debugState: MovementTrackingDebugState | null | undefined,
  options: MovementTrackingHealthOptions = {},
) {
  if (!debugState) return ["Waiting for tracking data"];

  const warnings: string[] = [];
  const confidence = debugState.bodyConfidence;
  const staleAfterMs = options.staleAfterMs ?? 1200;
  const leftArmConfidence = Math.max(confidence.leftWrist ?? 0, confidence.leftHand ?? 0);
  const rightArmConfidence = Math.max(confidence.rightWrist ?? 0, confidence.rightHand ?? 0);
  const hipConfidence = confidence.hips ?? 0;
  const lowerBodyConfidence = Math.max(
    hipConfidence,
    confidence.leftKnee ?? 0,
    confidence.rightKnee ?? 0,
    confidence.leftFoot ?? 0,
    confidence.rightFoot ?? 0,
  );
  const distalLowerBodyConfidence = Math.max(
    confidence.leftKnee ?? 0,
    confidence.rightKnee ?? 0,
    confidence.leftFoot ?? 0,
    confidence.rightFoot ?? 0,
  );
  const isCloseCroppedBody =
    (confidence.head ?? 0) >= 0.8 &&
    Math.min(confidence.leftShoulder ?? 0, confidence.rightShoulder ?? 0) >= 0.65 &&
    lowerBodyConfidence < 0.12 &&
    Math.max(leftArmConfidence, rightArmConfidence) < 0.2;
  const hasWeakKneeAndFootTracking =
    hipConfidence >= 0.45 &&
    distalLowerBodyConfidence < 0.35;
  const leftFootConfidence = confidence.leftFoot ?? 0;
  const rightFootConfidence = confidence.rightFoot ?? 0;

  if (options.now !== undefined && options.now - debugState.updatedAt > staleAfterMs) {
    warnings.push("Tracking data is stale");
  }

  if (debugState.calibrationQuality === undefined) {
    warnings.push("Calibration is missing");
  } else if (debugState.calibrationQuality < 0.55) {
    warnings.push("Calibration quality is low");
  }

  if (debugState.headRaw.source !== "face") {
    warnings.push("Head is using pose tracking");
  }

  if (debugState.headApplied.pitch >= 0.72 || debugState.headApplied.pitch <= -0.38) {
    warnings.push("Head pitch is near clamp");
  }

  if (Math.abs(debugState.headApplied.yaw) >= 1.1) {
    warnings.push("Head yaw is near clamp");
  }

  if (Math.abs(debugState.headApplied.roll) >= 0.62) {
    warnings.push("Head roll is near clamp");
  }

  if ((confidence.torso ?? 0) < 0.55) {
    warnings.push("Torso confidence is low");
  }

  if (isCloseCroppedBody) {
    warnings.push("Body is too close to camera");
  }

  if (hasWeakKneeAndFootTracking) {
    warnings.push("Knee and foot tracking is weak");
  }

  if ((confidence.leftWrist ?? 0) < 0.35 && (confidence.leftHand ?? 0) < 0.35) {
    warnings.push("Left arm endpoint is weak");
  }

  if ((confidence.rightWrist ?? 0) < 0.35 && (confidence.rightHand ?? 0) < 0.35) {
    warnings.push("Right arm endpoint is weak");
  }

  if (debugState.fallbacks.leftArm === "last-good") {
    warnings.push("Left arm is holding last good pose");
  }

  if (debugState.fallbacks.rightArm === "last-good") {
    warnings.push("Right arm is holding last good pose");
  }

  if (
    rightArmConfidence >= 0.35 &&
    rightArmConfidence < 0.65 &&
    leftArmConfidence - rightArmConfidence >= 0.28
  ) {
    warnings.push("Right arm confidence trails left");
  }

  if (
    leftArmConfidence >= 0.35 &&
    leftArmConfidence < 0.65 &&
    rightArmConfidence - leftArmConfidence >= 0.28
  ) {
    warnings.push("Left arm confidence trails right");
  }

  if ((confidence.leftFoot ?? 0) < 0.35) {
    warnings.push("Left foot confidence is low");
  }

  if ((confidence.rightFoot ?? 0) < 0.35) {
    warnings.push("Right foot confidence is low");
  }

  if (debugState.fallbacks.leftFoot === "last-good") {
    warnings.push("Left foot is holding last good pose");
  }

  if (debugState.fallbacks.rightFoot === "last-good") {
    warnings.push("Right foot is holding last good pose");
  }

  if (
    rightFootConfidence >= 0.35 &&
    rightFootConfidence < 0.65 &&
    leftFootConfidence - rightFootConfidence >= 0.28
  ) {
    warnings.push("Right foot confidence trails left");
  }

  if (
    leftFootConfidence >= 0.35 &&
    leftFootConfidence < 0.65 &&
    rightFootConfidence - leftFootConfidence >= 0.28
  ) {
    warnings.push("Left foot confidence trails right");
  }

  if (debugState.fallbacks.floor === "fixed-floor") {
    warnings.push("Floor is using fixed fallback");
  }

  if (debugState.fallbacks.leftKnee === "synthetic" || debugState.fallbacks.rightKnee === "synthetic") {
    warnings.push("Knee guard is correcting pose");
  }

  if (debugState.fallbacks.head === "last-good") {
    warnings.push("Head is holding last good pose");
  }

  return warnings.length > 0 ? warnings : ["Tracking health looks good"];
}

function confidenceValue(
  confidence: Record<string, number>,
  key: string,
) {
  return clamp(confidence[key] ?? 0, 0, 1);
}

function fallbackConfidence(source: string | undefined, liveConfidence: number) {
  if (source === "last-good") return Math.min(liveConfidence, 0.35);
  if (source === "synthetic") return Math.max(Math.min(liveConfidence, 0.72), 0.45);
  return liveConfidence;
}

function healthLabel(level: MovementTrackingHealthLevel) {
  if (level === "ready") return "Ready";
  if (level === "watch") return "Watch";
  if (level === "needs-attention") return "Needs attention";
  return "Waiting";
}

function getMovementTrackingPrimaryAction(warnings: string[]) {
  if (warnings.includes("Waiting for tracking data")) return "Wait for tracking data";
  if (warnings.includes("Tracking data is stale")) return "Restart camera tracking";
  if (warnings.includes("Calibration is missing")) return "Run calibration";
  if (warnings.includes("Calibration quality is low")) return "Recalibrate neutral stance";
  if (warnings.includes("Body is too close to camera")) return "Step back until hands, hips, and feet are visible";
  if (warnings.includes("Knee and foot tracking is weak")) return "Improve knee and foot tracking";
  if (warnings.includes("Head is holding last good pose")) return "Reacquire face tracking";
  if (warnings.includes("Head is using pose tracking")) return "Tune face/head tracking";
  if (warnings.includes("Head pitch is near clamp")) return "Tune head pitch offset";
  if (warnings.includes("Head yaw is near clamp")) return "Tune head yaw offset";
  if (warnings.includes("Head roll is near clamp")) return "Tune head roll offset";
  if (warnings.includes("Torso confidence is low")) return "Recalibrate torso stance";
  if (warnings.includes("Right arm is holding last good pose")) return "Reacquire right arm tracking";
  if (warnings.includes("Left arm is holding last good pose")) return "Reacquire left arm tracking";
  if (warnings.includes("Right arm endpoint is weak")) return "Tune right arm endpoint";
  if (warnings.includes("Left arm endpoint is weak")) return "Tune left arm endpoint";
  if (warnings.includes("Right arm confidence trails left")) return "Tune right arm balance";
  if (warnings.includes("Left arm confidence trails right")) return "Tune left arm balance";
  if (warnings.includes("Knee guard is correcting pose")) return "Check knee/leg constraints";
  if (warnings.includes("Floor is using fixed fallback")) return "Tune floor calibration";
  if (warnings.includes("Right foot is holding last good pose")) return "Reacquire right foot tracking";
  if (warnings.includes("Left foot is holding last good pose")) return "Reacquire left foot tracking";
  if (warnings.includes("Right foot confidence is low")) return "Tune right foot tracking";
  if (warnings.includes("Left foot confidence is low")) return "Tune left foot tracking";
  if (warnings.includes("Right foot confidence trails left")) return "Tune right foot balance";
  if (warnings.includes("Left foot confidence trails right")) return "Tune left foot balance";
  return "Tracking ready";
}

export function getMovementTrackingHealthSummary(
  debugState: MovementTrackingDebugState | null | undefined,
  options: MovementTrackingHealthOptions = {},
): MovementTrackingHealthSummary {
  const warnings = getMovementTrackingHealthWarnings(debugState, options);

  if (!debugState) {
    return {
      score: 0,
      level: "waiting",
      label: healthLabel("waiting"),
      primaryAction: getMovementTrackingPrimaryAction(warnings),
      warnings,
    };
  }

  const confidence = debugState.bodyConfidence;
  const headSourceMultiplier = debugState.headRaw.source === "face" ? 1 : 0.72;
  const headScore = clamp(debugState.headRaw.confidence * headSourceMultiplier, 0, 1);
  const leftArmScore = Math.max(
    confidenceValue(confidence, "leftWrist"),
    confidenceValue(confidence, "leftHand"),
  );
  const rightArmScore = Math.max(
    confidenceValue(confidence, "rightWrist"),
    confidenceValue(confidence, "rightHand"),
  );
  const leftKneeScore = fallbackConfidence(
    debugState.fallbacks.leftKnee,
    confidenceValue(confidence, "leftKnee"),
  );
  const rightKneeScore = fallbackConfidence(
    debugState.fallbacks.rightKnee,
    confidenceValue(confidence, "rightKnee"),
  );

  const weightedScore =
    headScore * 0.22 +
    confidenceValue(confidence, "torso") * 0.18 +
    leftArmScore * 0.14 +
    rightArmScore * 0.14 +
    confidenceValue(confidence, "leftFoot") * 0.09 +
    confidenceValue(confidence, "rightFoot") * 0.09 +
    leftKneeScore * 0.05 +
    rightKneeScore * 0.05 +
    clamp(debugState.calibrationQuality ?? 0, 0, 1) * 0.04;

  const rawScore = Math.round(clamp(weightedScore, 0, 1) * 100);
  const isStale = warnings.includes("Tracking data is stale");
  const score = isStale ? Math.min(rawScore, 50) : rawScore;
  const level: MovementTrackingHealthLevel =
    isStale
      ? "needs-attention"
      : score >= 80 && warnings.length === 1 && warnings[0] === "Tracking health looks good"
        ? "ready"
        : score >= 62
          ? "watch"
          : "needs-attention";

  return {
    score,
    level,
    label: healthLabel(level),
    primaryAction: getMovementTrackingPrimaryAction(warnings),
    warnings,
  };
}
