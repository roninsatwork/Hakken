import type { TrackingLandmark } from "./movementTrackingCalibration";

function smoothstep(value: number, min: number, max: number) {
  if (max <= min) return value >= max ? 1 : 0;
  const t = Math.min(Math.max((value - min) / (max - min), 0), 1);
  return t * t * (3 - 2 * t);
}

export function estimateMovementAvatarBridgeLiftDepth(poseLandmarks?: TrackingLandmark[]) {
  if (!poseLandmarks) return 0.7;
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0.7;

  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  return smoothstep(shoulderY - hipY, 0.045, 0.16);
}

export function estimateMovementAvatarPilatesHundredDepth(poseLandmarks?: TrackingLandmark[]) {
  if (!poseLandmarks) return 0.7;
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  const leftWrist = poseLandmarks[15];
  const rightWrist = poseLandmarks[16];
  const leftKnee = poseLandmarks[25];
  const rightKnee = poseLandmarks[26];
  const leftAnkle = poseLandmarks[27];
  const rightAnkle = poseLandmarks[28];
  if (
    !leftHip ||
    !rightHip ||
    !leftWrist ||
    !rightWrist ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) return 0.7;

  const hipY = (leftHip.y + rightHip.y) / 2;
  const wristLift = hipY - ((leftWrist.y + rightWrist.y) / 2);
  const kneeLift = hipY - ((leftKnee.y + rightKnee.y) / 2);
  const ankleLift = hipY - ((leftAnkle.y + rightAnkle.y) / 2);
  return smoothstep((wristLift * 0.35) + (kneeLift * 0.25) + (ankleLift * 0.4), 0.02, 0.16);
}

export function estimateMovementAvatarSingleLegStretchSide(poseLandmarks?: TrackingLandmark[]) {
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return null;

  const hipY = (leftHip.y + rightHip.y) / 2;
  const leftLift = ((hipY - leftKnee.y) * 0.45) + ((hipY - leftAnkle.y) * 0.55);
  const rightLift = ((hipY - rightKnee.y) * 0.45) + ((hipY - rightAnkle.y) * 0.55);
  return leftLift >= rightLift ? "left" as const : "right" as const;
}

export function estimateMovementAvatarSingleLegStretchDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return 0.7;

  const hipY = (leftHip.y + rightHip.y) / 2;
  const leftLift = ((hipY - leftKnee.y) * 0.45) + ((hipY - leftAnkle.y) * 0.55);
  const rightLift = ((hipY - rightKnee.y) * 0.45) + ((hipY - rightAnkle.y) * 0.55);
  return smoothstep(Math.abs(leftLift - rightLift), 0.08, 0.22);
}

export function estimateMovementAvatarDoubleLegStretchDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (
    !leftHip ||
    !rightHip ||
    !leftWrist ||
    !rightWrist ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) return 0.7;

  const hipY = (leftHip.y + rightHip.y) / 2;
  const wristReach = ((leftHip.x + rightHip.x) / 2) - ((leftWrist.x + rightWrist.x) / 2);
  const kneeLift = hipY - ((leftKnee.y + rightKnee.y) / 2);
  const ankleLift = hipY - ((leftAnkle.y + rightAnkle.y) / 2);
  return smoothstep((wristReach * 0.35) + (kneeLift * 0.25) + (ankleLift * 0.4), 0.08, 0.28);
}

export function estimateMovementAvatarDeadBugSide(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return null;

  const leftArmRightLeg = Math.max(0, centers.shoulderX - leftWrist.x) + Math.max(0, centers.hipY - rightAnkle.y);
  const rightArmLeftLeg = Math.max(0, centers.shoulderX - rightWrist.x) + Math.max(0, centers.hipY - leftAnkle.y);
  return leftArmRightLeg >= rightArmLeftLeg ? "leftArmRightLeg" as const : "rightArmLeftLeg" as const;
}

export function estimateMovementAvatarDeadBugDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return 0.7;

  const leftArmRightLeg = Math.max(0, centers.shoulderX - leftWrist.x) + Math.max(0, centers.hipY - rightAnkle.y);
  const rightArmLeftLeg = Math.max(0, centers.shoulderX - rightWrist.x) + Math.max(0, centers.hipY - leftAnkle.y);
  return smoothstep(Math.max(leftArmRightLeg, rightArmLeftLeg), 0.1, 0.36);
}

export function estimateMovementAvatarHollowHoldDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  if (!centers) return 0.7;

  const armLift = centers.shoulderY - centers.wristY;
  const legLift = centers.hipY - centers.ankleY;
  const kneeLift = centers.hipY - centers.kneeY;
  return smoothstep((armLift * 0.4) + (legLift * 0.42) + (kneeLift * 0.18), 0.08, 0.28);
}

export function estimateMovementAvatarProneExtensionDepth(poseLandmarks?: TrackingLandmark[]) {
  if (!poseLandmarks) return 0.7;
  const nose = poseLandmarks[0];
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  if (!nose || !leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0.7;

  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  const shoulderLift = hipY - shoulderY;
  const headLift = hipY - nose.y;
  return smoothstep((shoulderLift * 0.7) + (headLift * 0.3), 0.08, 0.28);
}

export function estimateMovementAvatarSwimmingDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return 0.7;

  const leftArmLift = rightWrist.y - leftWrist.y;
  const rightArmLift = leftWrist.y - rightWrist.y;
  const leftLegLift = rightAnkle.y - leftAnkle.y;
  const rightLegLift = leftAnkle.y - rightAnkle.y;
  return smoothstep(Math.max(
    (leftArmLift * 0.5) + (rightLegLift * 0.5),
    (rightArmLift * 0.5) + (leftLegLift * 0.5),
  ), 0.06, 0.18);
}

export function estimateMovementAvatarSideLegLiftDepth(poseLandmarks?: TrackingLandmark[]) {
  if (!poseLandmarks) return 0.7;
  const leftKnee = poseLandmarks[25];
  const rightKnee = poseLandmarks[26];
  const leftAnkle = poseLandmarks[27];
  const rightAnkle = poseLandmarks[28];
  if (!leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return 0.7;

  const rightLift = ((leftKnee.y - rightKnee.y) * 0.4) + ((leftAnkle.y - rightAnkle.y) * 0.6);
  const leftLift = ((rightKnee.y - leftKnee.y) * 0.4) + ((rightAnkle.y - leftAnkle.y) * 0.6);
  return smoothstep(Math.max(rightLift, leftLift), 0.08, 0.28);
}

export function estimateMovementAvatarClamDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return 0.7;

  const kneeOpen = Math.abs(leftKnee.y - rightKnee.y);
  const ankleOpen = Math.abs(leftAnkle.y - rightAnkle.y);
  return smoothstep(kneeOpen - (ankleOpen * 0.45), 0.04, 0.2);
}

export function getMovementAvatarFloorCenters(poseLandmarks?: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (
    !leftShoulder ||
    !rightShoulder ||
    !leftHip ||
    !rightHip ||
    !leftWrist ||
    !rightWrist ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) return null;

  return {
    ankleX: (leftAnkle.x + rightAnkle.x) / 2,
    ankleY: (leftAnkle.y + rightAnkle.y) / 2,
    hipX: (leftHip.x + rightHip.x) / 2,
    hipY: (leftHip.y + rightHip.y) / 2,
    kneeY: (leftKnee.y + rightKnee.y) / 2,
    shoulderX: (leftShoulder.x + rightShoulder.x) / 2,
    shoulderY: (leftShoulder.y + rightShoulder.y) / 2,
    wristX: (leftWrist.x + rightWrist.x) / 2,
    wristY: (leftWrist.y + rightWrist.y) / 2,
  };
}

export function estimateMovementAvatarPlankLineDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  if (!centers) return 0.7;

  const hipShoulderAlignment = 1 - Math.min(Math.abs(centers.hipY - centers.shoulderY) / 0.2, 1);
  const handFootAlignment = 1 - Math.min(Math.abs(centers.wristY - centers.ankleY) / 0.18, 1);
  const hipBetweenHandsAndFeet = centers.hipX > centers.wristX && centers.hipX < centers.ankleX + 0.08;
  return Math.max(0, Math.min(1, ((hipShoulderAlignment * 0.55) + (handFootAlignment * 0.45)) * (hipBetweenHandsAndFeet ? 1 : 0.75)));
}

export function estimateMovementAvatarDownDogPikeDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  if (!centers) return 0.7;

  const supportY = (centers.wristY + centers.ankleY) / 2;
  const hipLift = supportY - centers.hipY;
  const shoulderBelowHip = centers.shoulderY - centers.hipY;
  return smoothstep((hipLift * 0.7) + (shoulderBelowHip * 0.3), 0.12, 0.38);
}

export function estimateMovementAvatarBearCrawlDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  if (!centers) return 0.7;

  const kneeBend = centers.ankleY - centers.kneeY;
  const hipDrop = centers.hipY - centers.shoulderY;
  return smoothstep((kneeBend * 0.7) + (hipDrop * 0.3), 0.12, 0.34);
}

export function estimateMovementAvatarChildFoldDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const hipBehindShoulders = centers.hipX - centers.shoulderX;
  const headDrop = nose.y - centers.shoulderY;
  const handsForward = centers.shoulderX - centers.wristX;
  return smoothstep((hipBehindShoulders * 0.45) + (headDrop * 0.35) + (handsForward * 0.2), 0.12, 0.36);
}

export function estimateMovementAvatarCatDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const headDrop = nose.y - centers.shoulderY;
  const backRound = Math.max(0, centers.shoulderY - centers.hipY + 0.06);
  return smoothstep((headDrop * 0.76) + (backRound * 0.24), 0.08, 0.28);
}

export function estimateMovementAvatarCowDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const headLift = centers.shoulderY - nose.y;
  const hipDrop = centers.hipY - centers.shoulderY;
  return smoothstep((headLift * 0.62) + (hipDrop * 0.38), 0.08, 0.3);
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

export function estimateMovementAvatarSeatedForwardFoldDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const headDrop = nose.y - centers.shoulderY;
  const torsoDrop = centers.shoulderY - 0.42;
  const handDrop = centers.wristY - centers.hipY;
  return smoothstep((headDrop * 0.38) + (torsoDrop * 0.34) + (handDrop * 0.28), 0.08, 0.3);
}

export function estimateMovementAvatarSeatedLegLift(poseLandmarks?: TrackingLandmark[]) {
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
    return { depth: 0, side: null as "left" | "right" | null };
  }

  const hipY = (leftHip.y + rightHip.y) / 2;
  const leftLift = ((hipY - leftKnee.y) * 0.35) + ((hipY - leftAnkle.y) * 0.65);
  const rightLift = ((hipY - rightKnee.y) * 0.35) + ((hipY - rightAnkle.y) * 0.65);
  const side = leftLift >= rightLift ? "left" as const : "right" as const;
  return {
    depth: smoothstep(Math.abs(leftLift - rightLift), 0.08, 0.26),
    side,
  };
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
