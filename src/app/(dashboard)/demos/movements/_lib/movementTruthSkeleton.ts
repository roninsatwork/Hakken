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
  sourceStatus: MovementSourceStatus;
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

function distance(a: TrackingLandmark | null, b: TrackingLandmark | null) {
  if (!a || !b) return 0;
  return Math.hypot(
    a.x - b.x,
    a.y - b.y,
    (a.z ?? 0) - (b.z ?? 0),
  );
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
  const floorY = maxVisibleY(leftAnkle, rightAnkle, leftHeel, rightHeel, leftToe, rightToe);
  const heldOrRejectedReasons = [
    ...sourceFrame.cameraConfidence.reasons,
    ...sourceFrame.startReadiness.blockedReasons,
  ];

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
    segmentConfidence: {
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
    },
    sourceStatus: sourceFrame.sourceStatus,
  };
}
