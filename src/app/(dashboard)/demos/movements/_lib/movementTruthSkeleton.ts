import type {
  MovementCameraBodyPart,
  MovementSourceFrame,
  MovementSourceStatus,
} from "./movementSourceFrame";
import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementTruthSkeletonSegment =
  | "shoulders"
  | "hips"
  | "leftUpperArm"
  | "rightUpperArm"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftThigh"
  | "rightThigh"
  | "leftShin"
  | "rightShin"
  | "leftFoot"
  | "rightFoot";

export type MovementTruthSkeletonLineSegment = {
  confidence: number;
  end: TrackingLandmark | null;
  start: TrackingLandmark | null;
};

export type MovementTruthSkeleton = {
  bodyPartConfidence: Record<MovementCameraBodyPart, number>;
  bodyScale: {
    shoulderWidth: number;
    torsoHeight: number;
  };
  centers: {
    head: TrackingLandmark | null;
    hip: TrackingLandmark | null;
    shoulder: TrackingLandmark | null;
  };
  floorY: number | null;
  heldOrRejectedReasons: string[];
  segmentConfidence: Record<MovementTruthSkeletonSegment, number>;
  segments: Record<MovementTruthSkeletonSegment, MovementTruthSkeletonLineSegment>;
  sourceStatus: MovementSourceStatus;
};

export type MovementTruthSkeletonReadinessState = "blocked" | "partial" | "ready";
export type MovementTruthSkeletonReadinessGroup = "arms" | "feet" | "legs" | "torso";

export type MovementTruthSkeletonSummary = {
  groupConfidence: Record<MovementTruthSkeletonReadinessGroup, number>;
  reasons: string[];
  state: MovementTruthSkeletonReadinessState;
  weakestGroup: MovementTruthSkeletonReadinessGroup;
  weakestScore: number;
};

export type MovementTruthSkeletonRecoveryCue = {
  group: MovementTruthSkeletonReadinessGroup;
  message: string;
  state: Exclude<MovementTruthSkeletonReadinessState, "ready">;
};

type IndexedLandmark = TrackingLandmark | undefined;

function midpoint(a: IndexedLandmark, b: IndexedLandmark): TrackingLandmark | null {
  if (!a || !b) return null;

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

function cloneLandmark(landmark: TrackingLandmark | null): TrackingLandmark | null {
  return landmark ? { ...landmark } : null;
}

function distance(a: TrackingLandmark | null, b: TrackingLandmark | null) {
  if (!a || !b) return 0;
  return Math.hypot(
    a.x - b.x,
    a.y - b.y,
    (a.z ?? 0) - (b.z ?? 0),
  );
}

function lineSegment(
  start: IndexedLandmark | null,
  end: IndexedLandmark | null,
  confidenceScore: number,
): MovementTruthSkeletonLineSegment {
  return {
    confidence: confidenceScore,
    end: cloneLandmark(end ?? null),
    start: cloneLandmark(start ?? null),
  };
}

function confidence(...landmarks: IndexedLandmark[]) {
  if (landmarks.length === 0 || landmarks.some((landmark) => !landmark)) return 0;
  return landmarks.reduce((sum, landmark) => sum + Math.min(Math.max(landmark?.visibility ?? 1, 0), 1), 0) / landmarks.length;
}

function maxVisibleY(...landmarks: IndexedLandmark[]) {
  const visible = landmarks.filter((landmark): landmark is TrackingLandmark => (
    Boolean(landmark) && (landmark?.visibility ?? 1) >= 0.2
  ));
  if (visible.length === 0) return null;
  return Math.max(...visible.map((landmark) => landmark.y));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupReadinessState(weakestScore: number): MovementTruthSkeletonReadinessState {
  if (weakestScore < 0.35) return "blocked";
  if (weakestScore < 0.65) return "partial";
  return "ready";
}

const TRUTH_SKELETON_RECOVERY_CUES: Record<MovementTruthSkeletonReadinessGroup, string> = {
  arms: "Keep hands and elbows in frame.",
  feet: "Step back until both feet are visible.",
  legs: "Keep hips, knees, and feet visible.",
  torso: "Bring head, shoulders, and hips into view.",
};

export function summarizeMovementTruthSkeleton(
  skeleton: MovementTruthSkeleton,
): MovementTruthSkeletonSummary {
  const groupConfidence = {
    arms: average([
      skeleton.segmentConfidence.leftUpperArm,
      skeleton.segmentConfidence.rightUpperArm,
      skeleton.segmentConfidence.leftLowerArm,
      skeleton.segmentConfidence.rightLowerArm,
    ]),
    feet: Math.min(
      skeleton.segmentConfidence.leftFoot,
      skeleton.segmentConfidence.rightFoot,
    ),
    legs: average([
      skeleton.segmentConfidence.leftThigh,
      skeleton.segmentConfidence.rightThigh,
      skeleton.segmentConfidence.leftShin,
      skeleton.segmentConfidence.rightShin,
    ]),
    torso: Math.min(
      skeleton.segmentConfidence.shoulders,
      skeleton.segmentConfidence.hips,
    ),
  };
  const [weakestGroup, weakestScore] = Object.entries(groupConfidence)
    .sort((a, b) => a[1] - b[1])[0] as [
      MovementTruthSkeletonSummary["weakestGroup"],
      number,
    ];

  return {
    groupConfidence,
    reasons: [
      ...skeleton.heldOrRejectedReasons,
      ...(weakestScore < 0.65 ? [`weak-${weakestGroup}`] : []),
    ],
    state: groupReadinessState(weakestScore),
    weakestGroup,
    weakestScore,
  };
}

export function getMovementTruthSkeletonRecoveryCue(
  summary: MovementTruthSkeletonSummary,
): MovementTruthSkeletonRecoveryCue | null {
  if (summary.state === "ready") return null;

  return {
    group: summary.weakestGroup,
    message: TRUTH_SKELETON_RECOVERY_CUES[summary.weakestGroup],
    state: summary.state,
  };
}

export function buildMovementTruthSkeleton(sourceFrame: MovementSourceFrame): MovementTruthSkeleton {
  const pose = sourceFrame.landmarks.pose;
  const nose = pose[0];
  const leftShoulder = pose[11];
  const rightShoulder = pose[12];
  const leftElbow = pose[13];
  const rightElbow = pose[14];
  const leftWrist = pose[15];
  const rightWrist = pose[16];
  const leftHip = pose[23];
  const rightHip = pose[24];
  const leftKnee = pose[25];
  const rightKnee = pose[26];
  const leftAnkle = pose[27];
  const rightAnkle = pose[28];
  const leftHeel = pose[29];
  const rightHeel = pose[30];
  const leftToe = pose[31];
  const rightToe = pose[32];
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);
  const leftFootCenter = midpoint(leftHeel, leftToe);
  const rightFootCenter = midpoint(rightHeel, rightToe);
  const floorY = maxVisibleY(leftAnkle, rightAnkle, leftHeel, rightHeel, leftToe, rightToe);
  const heldOrRejectedReasons = [
    ...sourceFrame.cameraConfidence.reasons,
    ...sourceFrame.startReadiness.blockedReasons,
  ];
  const segmentConfidence = {
    shoulders: confidence(leftShoulder, rightShoulder),
    hips: confidence(leftHip, rightHip),
    leftUpperArm: confidence(leftShoulder, leftElbow),
    rightUpperArm: confidence(rightShoulder, rightElbow),
    leftLowerArm: confidence(leftElbow, leftWrist),
    rightLowerArm: confidence(rightElbow, rightWrist),
    leftThigh: confidence(leftHip, leftKnee),
    rightThigh: confidence(rightHip, rightKnee),
    leftShin: confidence(leftKnee, leftAnkle),
    rightShin: confidence(rightKnee, rightAnkle),
    leftFoot: confidence(leftAnkle, leftHeel, leftToe),
    rightFoot: confidence(rightAnkle, rightHeel, rightToe),
  };

  return {
    bodyPartConfidence: sourceFrame.cameraConfidence.bodyPartConfidence,
    bodyScale: {
      shoulderWidth: distance(leftShoulder ?? null, rightShoulder ?? null),
      torsoHeight: distance(shoulderCenter, hipCenter),
    },
    centers: {
      head: nose ? { ...nose } : null,
      hip: hipCenter,
      shoulder: shoulderCenter,
    },
    floorY,
    heldOrRejectedReasons,
    segmentConfidence,
    segments: {
      hips: lineSegment(leftHip, rightHip, segmentConfidence.hips),
      leftFoot: lineSegment(leftAnkle, leftFootCenter, segmentConfidence.leftFoot),
      leftLowerArm: lineSegment(leftElbow, leftWrist, segmentConfidence.leftLowerArm),
      leftShin: lineSegment(leftKnee, leftAnkle, segmentConfidence.leftShin),
      leftThigh: lineSegment(leftHip, leftKnee, segmentConfidence.leftThigh),
      leftUpperArm: lineSegment(leftShoulder, leftElbow, segmentConfidence.leftUpperArm),
      rightFoot: lineSegment(rightAnkle, rightFootCenter, segmentConfidence.rightFoot),
      rightLowerArm: lineSegment(rightElbow, rightWrist, segmentConfidence.rightLowerArm),
      rightShin: lineSegment(rightKnee, rightAnkle, segmentConfidence.rightShin),
      rightThigh: lineSegment(rightHip, rightKnee, segmentConfidence.rightThigh),
      rightUpperArm: lineSegment(rightShoulder, rightElbow, segmentConfidence.rightUpperArm),
      shoulders: lineSegment(leftShoulder, rightShoulder, segmentConfidence.shoulders),
    },
    sourceStatus: sourceFrame.sourceStatus,
  };
}
