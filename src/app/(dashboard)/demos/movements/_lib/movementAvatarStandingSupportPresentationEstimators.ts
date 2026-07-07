import type { TrackingLandmark } from "./movementTrackingCalibration";

function smoothstep(value: number, min: number, max: number) {
  if (max <= min) return value >= max ? 1 : 0;
  const t = Math.min(Math.max((value - min) / (max - min), 0), 1);
  return t * t * (3 - 2 * t);
}

export function estimateMovementAvatarStandingCenters(poseLandmarks?: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (
    !leftShoulder ||
    !rightShoulder ||
    !leftWrist ||
    !rightWrist ||
    !leftHip ||
    !rightHip ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) return null;

  return {
    ankleSpan: Math.abs(leftAnkle.x - rightAnkle.x),
    hipY: (leftHip.y + rightHip.y) / 2,
    kneeY: (leftKnee.y + rightKnee.y) / 2,
    leftAnkle,
    leftKnee,
    leftWrist,
    rightAnkle,
    rightKnee,
    rightWrist,
    shoulderY: (leftShoulder.y + rightShoulder.y) / 2,
    wristSpan: Math.abs(leftWrist.x - rightWrist.x),
    wristY: (leftWrist.y + rightWrist.y) / 2,
  };
}

export function estimateMovementAvatarStandingArmRaiseDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  return smoothstep(centers.shoulderY - centers.wristY, 0.08, 0.26);
}

export function estimateMovementAvatarStandingTwistDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0.7;

  const shoulderSkew = (leftShoulder.y - rightShoulder.y) + ((leftShoulder.z ?? 0) - (rightShoulder.z ?? 0));
  const hipSkew = (leftHip.y - rightHip.y) + ((leftHip.z ?? 0) - (rightHip.z ?? 0));
  return smoothstep(Math.abs(shoulderSkew - hipSkew), 0.06, 0.22);
}

export function estimateMovementAvatarForwardFoldDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const torsoDrop = centers.shoulderY - 0.42;
  const headDrop = nose.y - centers.shoulderY;
  const handDrop = centers.wristY - centers.hipY;
  return smoothstep((torsoDrop * 0.42) + (headDrop * 0.28) + (handDrop * 0.3), 0.08, 0.34);
}

export function estimateMovementAvatarHalfLiftDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const torsoDrop = centers.shoulderY - 0.42;
  const flatBack = Math.max(0, centers.hipY - centers.shoulderY);
  const handToShin = centers.wristY - centers.hipY;
  const headInLine = Math.max(0, centers.hipY - nose.y);
  return smoothstep((torsoDrop * 0.34) + (flatBack * 0.3) + (handToShin * 0.22) + (headInLine * 0.14), 0.12, 0.34);
}

export function estimateMovementAvatarChairPoseDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const hipDrop = centers.hipY - centers.shoulderY;
  const kneeDrop = centers.kneeY - centers.hipY;
  const armLift = centers.shoulderY - centers.wristY;
  return smoothstep((hipDrop * 0.42) + (kneeDrop * 0.36) + (armLift * 0.22), 0.18, 0.42);
}

export function estimateMovementAvatarForwardLungeDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const kneeAsymmetry = Math.abs(centers.leftKnee.y - centers.rightKnee.y);
  return smoothstep((centers.ankleSpan * 0.46) + (kneeAsymmetry * 0.34) + ((centers.kneeY - centers.hipY) * 0.2), 0.28, 0.7);
}

export function estimateMovementAvatarSideLungeDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const kneeAsymmetry = Math.abs(centers.leftKnee.y - centers.rightKnee.y);
  return smoothstep((centers.ankleSpan * 0.56) + (kneeAsymmetry * 0.32), 0.34, 0.78);
}

export function estimateMovementAvatarJumpingJackDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const armLift = centers.shoulderY - centers.wristY;
  return smoothstep((centers.ankleSpan * 0.48) + (centers.wristSpan * 0.34) + (armLift * 0.18), 0.42, 0.92);
}

export function estimateMovementAvatarWarriorOneDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const armLift = centers.shoulderY - centers.wristY;
  const kneeAsymmetry = Math.abs(centers.leftKnee.y - centers.rightKnee.y);
  return smoothstep((centers.ankleSpan * 0.5) + (armLift * 0.3) + (kneeAsymmetry * 0.2), 0.36, 0.82);
}

export function estimateMovementAvatarWarriorTwoDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const armSpan = centers.wristSpan;
  const stanceWidth = centers.ankleSpan;
  const armLevel = 1 - Math.min(Math.abs(centers.wristY - centers.shoulderY) / 0.16, 1);
  return smoothstep((stanceWidth * 0.5) + (armSpan * 0.35) + (armLevel * 0.15), 0.48, 0.92);
}

export function estimateMovementAvatarTrianglePose(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return { depth: 0.7, side: "left" as const };

  const leftIsLow = centers.leftWrist.y > centers.rightWrist.y;
  const wristDelta = Math.abs(centers.leftWrist.y - centers.rightWrist.y);
  const lowWristY = Math.max(centers.leftWrist.y, centers.rightWrist.y);
  const highWristY = Math.min(centers.leftWrist.y, centers.rightWrist.y);
  const fold = (wristDelta * 0.48) + ((lowWristY - centers.hipY) * 0.28) + ((centers.shoulderY - highWristY) * 0.24);
  return {
    depth: smoothstep(fold, 0.22, 0.58),
    side: leftIsLow ? "left" as const : "right" as const,
  };
}

export function estimateMovementAvatarTreePose(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return { depth: 0.7, side: "left" as const };

  const leftLift = Math.max(0, centers.rightAnkle.y - centers.leftAnkle.y);
  const rightLift = Math.max(0, centers.leftAnkle.y - centers.rightAnkle.y);
  const side = leftLift >= rightLift ? "left" as const : "right" as const;
  const liftedAnkle = side === "left" ? centers.leftAnkle : centers.rightAnkle;
  const plantedKnee = side === "left" ? centers.rightKnee : centers.leftKnee;
  const liftedKnee = side === "left" ? centers.leftKnee : centers.rightKnee;
  const footLift = plantedKnee.y - liftedAnkle.y;
  const kneeOpen = Math.abs(liftedKnee.x - liftedAnkle.x);
  return {
    depth: smoothstep((footLift * 0.72) + (kneeOpen * 0.28), 0.04, 0.24),
    side,
  };
}
