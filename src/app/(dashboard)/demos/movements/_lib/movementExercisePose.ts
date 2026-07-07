import type {
  MovementCoverageFamily,
  MovementSupportStatus,
} from "./movementCoverageRegistry";
import type { MovementBodyOrientationDecision } from "./movementBodyOrientation";
import type { MovementSupportContactDecision } from "./movementSupportContact";
import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementExerciseDiscipline =
  | "general"
  | "mobility"
  | "pilates"
  | "yoga";

export type MovementExercisePoseToleranceBand =
  | "diagnostic"
  | "moderate"
  | "strict"
  | "unsupported";

export type MovementExercisePoseKey =
  | "bear-crawl-prep"
  | "chair-seated"
  | "forward-lunge-prep"
  | "half-kneeling-floor"
  | "jumping-jack-prep"
  | "kneeling-floor"
  | "low-lunge-floor"
  | "pilates-clam-prep"
  | "pilates-dead-bug-prep"
  | "pilates-double-leg-stretch-prep"
  | "pilates-hollow-hold-prep"
  | "pilates-hundred-prep"
  | "pilates-bridge-prep"
  | "pilates-single-leg-stretch-prep"
  | "pilates-side-lying-leg-lift"
  | "pilates-swimming-prep"
  | "prone-mat"
  | "prone-back-extension-prep"
  | "quadruped-bird-dog-prep"
  | "seated-twist"
  | "seated-forward-fold"
  | "seated-leg-lift"
  | "side-lying-mat"
  | "side-lunge-prep"
  | "standing-arm-raise"
  | "standing-neutral"
  | "standing-twist"
  | "supine-mat"
  | "tabletop-all-fours"
  | "yoga-chair-prep"
  | "yoga-cat-prep"
  | "yoga-child-pose-prep"
  | "yoga-cow-prep"
  | "yoga-down-dog-prep"
  | "yoga-forward-fold-prep"
  | "yoga-half-lift-prep"
  | "yoga-plank-prep"
  | "yoga-tree-prep"
  | "yoga-triangle-prep"
  | "yoga-warrior-one-prep"
  | "yoga-warrior-two-prep"
  | "unknown";

export type MovementExercisePoseDecision = {
  confidence: number;
  coverageFamilies: MovementCoverageFamily[];
  disciplines: MovementExerciseDiscipline[];
  label: string;
  poseKey: MovementExercisePoseKey;
  programLabels: string[];
  qualityCue: string;
  qualityScore: number;
  status: MovementSupportStatus;
  summary: string;
  toleranceBand: MovementExercisePoseToleranceBand;
};

function buildExercisePoseDecision({
  confidence,
  coverageFamilies,
  disciplines,
  label,
  poseKey,
  programLabels,
  status = "diagnostic-only",
  summary,
}: Omit<MovementExercisePoseDecision, "qualityCue" | "qualityScore" | "status" | "toleranceBand"> & {
  status?: MovementSupportStatus;
}): MovementExercisePoseDecision {
  const quality = resolveMovementExercisePoseQuality({
    confidence,
    status,
  });

  return {
    confidence,
    coverageFamilies,
    disciplines,
    label,
    poseKey,
    programLabels,
    qualityCue: quality.cue,
    qualityScore: quality.score,
    status,
    summary,
    toleranceBand: quality.toleranceBand,
  };
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function resolveMovementExercisePoseQuality({
  confidence,
  status,
}: {
  confidence: number;
  status: MovementSupportStatus;
}): {
  cue: string;
  score: number;
  toleranceBand: MovementExercisePoseToleranceBand;
} {
  if (status === "unsupported") {
    return {
      cue: "Unsupported exercise shape.",
      score: 0,
      toleranceBand: "unsupported",
    };
  }

  const statusMultiplier = status === "supported"
    ? 1
    : status === "approximate" ? 0.86 : 0.72;
  const score = Math.round(clamp01(confidence) * statusMultiplier * 100);
  const toleranceBand = status === "supported"
    ? "strict"
    : status === "approximate" ? "moderate" : "diagnostic";
  const cue = toleranceBand === "strict"
    ? "Ready for strict posture matching."
    : toleranceBand === "moderate"
      ? "Use moderate tolerances while contact IK remains approximate."
      : "Use diagnostic tolerances until exact pose scoring is implemented.";

  return {
    cue,
    score,
    toleranceBand,
  };
}

function midpoint(a: TrackingLandmark, b: TrackingLandmark) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function distance2D(a?: TrackingLandmark | null, b?: TrackingLandmark | null) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getCoreCenters(poseLandmarks?: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  return {
    hipCenter: midpoint(leftHip, rightHip),
    shoulderCenter: midpoint(leftShoulder, rightShoulder),
  };
}

function getLimbCenters(poseLandmarks?: TrackingLandmark[]) {
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];

  if (!leftKnee || !rightKnee || !leftAnkle || !rightAnkle || !leftWrist || !rightWrist) return null;

  return {
    ankleCenter: midpoint(leftAnkle, rightAnkle),
    kneeCenter: midpoint(leftKnee, rightKnee),
    wristCenter: midpoint(leftWrist, rightWrist),
  };
}

function isYogaChairPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!centers || !limbs || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return false;

  const wristCenter = midpoint(leftWrist, rightWrist);
  const ankleSpan = Math.abs(leftAnkle.x - rightAnkle.x);
  return (
    ankleSpan > 0.2 &&
    ankleSpan < 0.44 &&
    centers.hipCenter.y > centers.shoulderCenter.y + 0.16 &&
    limbs.kneeCenter.y > centers.hipCenter.y + 0.1 &&
    wristCenter.y < centers.shoulderCenter.y - 0.08
  );
}

function isStandingArmRaise(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return false;

  const wristCenter = midpoint(leftWrist, rightWrist);
  const ankleSpan = Math.abs(leftAnkle.x - rightAnkle.x);
  return (
    ankleSpan < 0.42 &&
    centers.hipCenter.y < centers.shoulderCenter.y + 0.28 &&
    wristCenter.y < centers.shoulderCenter.y - 0.08
  );
}

function isStandingTwist(poseLandmarks?: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return false;

  const shoulderSkew = (leftShoulder.y - rightShoulder.y) + ((leftShoulder.z ?? 0) - (rightShoulder.z ?? 0));
  const hipSkew = (leftHip.y - rightHip.y) + ((leftHip.z ?? 0) - (rightHip.z ?? 0));
  return Math.abs(shoulderSkew - hipSkew) > 0.08;
}

function isYogaForwardFoldPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const nose = poseLandmarks?.[0];
  if (!centers || !leftWrist || !rightWrist || !nose) return false;

  const wristCenter = midpoint(leftWrist, rightWrist);
  return (
    centers.shoulderCenter.y > 0.5 &&
    nose.y > centers.shoulderCenter.y + 0.05 &&
    wristCenter.y > centers.hipCenter.y + 0.12
  );
}

function isYogaHalfLiftPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !limbs || !nose) return false;

  return (
    centers.shoulderCenter.y > 0.46 &&
    centers.shoulderCenter.y < centers.hipCenter.y - 0.06 &&
    nose.y < centers.hipCenter.y &&
    limbs.wristCenter.y > centers.hipCenter.y + 0.04 &&
    limbs.wristCenter.y < centers.hipCenter.y + 0.2
  );
}

function isYogaTreePrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  if (!centers || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle || !leftWrist || !rightWrist) return false;

  const wristCenter = midpoint(leftWrist, rightWrist);
  const handsRaisedForTree =
    wristCenter.y < centers.shoulderCenter.y - 0.08 &&
    Math.abs(leftWrist.x - rightWrist.x) < 0.18;
  const leftLegLifted =
    leftKnee.y < centers.hipCenter.y + 0.06 &&
    leftAnkle.y < rightKnee.y + 0.04 &&
    rightAnkle.y > centers.hipCenter.y + 0.18;
  const rightLegLifted =
    rightKnee.y < centers.hipCenter.y + 0.06 &&
    rightAnkle.y < leftKnee.y + 0.04 &&
    leftAnkle.y > centers.hipCenter.y + 0.18;
  return handsRaisedForTree && (leftLegLifted || rightLegLifted);
}

function isYogaTrianglePrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return false;

  const wristHeightDelta = Math.abs(leftWrist.y - rightWrist.y);
  const lowWristY = Math.max(leftWrist.y, rightWrist.y);
  const highWristY = Math.min(leftWrist.y, rightWrist.y);
  const ankleSpan = Math.abs(leftAnkle.x - rightAnkle.x);
  return (
    ankleSpan > 0.44 &&
    wristHeightDelta > 0.34 &&
    lowWristY > centers.hipCenter.y + 0.08 &&
    highWristY < centers.shoulderCenter.y - 0.04
  );
}

function isJumpingJackPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle || !leftKnee || !rightKnee) return false;

  const ankleSpan = Math.abs(leftAnkle.x - rightAnkle.x);
  const wristSpan = Math.abs(leftWrist.x - rightWrist.x);
  const kneeHeightDelta = Math.abs(leftKnee.y - rightKnee.y);
  const wristCenter = midpoint(leftWrist, rightWrist);
  return (
    ankleSpan > 0.52 &&
    wristSpan > 0.36 &&
    wristCenter.y < centers.shoulderCenter.y - 0.08 &&
    kneeHeightDelta < 0.06
  );
}

function isForwardLungePrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle || !leftKnee || !rightKnee) return false;

  const ankleSpan = Math.abs(leftAnkle.x - rightAnkle.x);
  const kneeHeightDelta = Math.abs(leftKnee.y - rightKnee.y);
  const wristCenter = midpoint(leftWrist, rightWrist);
  return (
    ankleSpan > 0.46 &&
    ankleSpan < 0.74 &&
    kneeHeightDelta > 0.08 &&
    wristCenter.y > centers.shoulderCenter.y + 0.08
  );
}

function isSideLungePrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  if (!centers || !leftAnkle || !rightAnkle || !leftKnee || !rightKnee || !leftWrist || !rightWrist) return false;

  const ankleSpan = Math.abs(leftAnkle.x - rightAnkle.x);
  const kneeHeightDelta = Math.abs(leftKnee.y - rightKnee.y);
  const wristCenter = midpoint(leftWrist, rightWrist);
  return (
    ankleSpan > 0.74 &&
    kneeHeightDelta > 0.07 &&
    wristCenter.y > centers.shoulderCenter.y + 0.12
  );
}

function isYogaWarriorOnePrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle || !leftKnee || !rightKnee) return false;

  const wristCenter = midpoint(leftWrist, rightWrist);
  const ankleSpan = Math.abs(leftAnkle.x - rightAnkle.x);
  const wristSpan = Math.abs(leftWrist.x - rightWrist.x);
  const kneeHeightDelta = Math.abs(leftKnee.y - rightKnee.y);
  return (
    ankleSpan > 0.48 &&
    wristSpan < 0.32 &&
    wristCenter.y < centers.shoulderCenter.y - 0.08 &&
    kneeHeightDelta > 0.04
  );
}

function isYogaWarriorTwoPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (
    !centers ||
    !leftWrist ||
    !rightWrist ||
    !leftShoulder ||
    !rightShoulder ||
    !leftAnkle ||
    !rightAnkle
  ) return false;

  const shoulderWidth = distance2D(leftShoulder, rightShoulder);
  const wristWidth = Math.abs(leftWrist.x - rightWrist.x);
  const ankleSpan = Math.abs(leftAnkle.x - rightAnkle.x);
  const wristLevelWithShoulders = Math.abs(midpoint(leftWrist, rightWrist).y - centers.shoulderCenter.y) < 0.08;
  return (
    ankleSpan > 0.48 &&
    wristWidth > shoulderWidth * 1.8 &&
    wristLevelWithShoulders
  );
}

function isSeatedTwist(poseLandmarks?: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return false;

  const shoulderSkew = (leftShoulder.y - rightShoulder.y) + ((leftShoulder.z ?? 0) - (rightShoulder.z ?? 0));
  const hipSkew = (leftHip.y - rightHip.y) + ((leftHip.z ?? 0) - (rightHip.z ?? 0));

  return Math.abs(shoulderSkew - hipSkew) > 0.08;
}

function isSeatedLegLift(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  if (!centers || !leftAnkle || !rightAnkle || !leftKnee || !rightKnee) return false;

  const leftLift = ((centers.hipCenter.y - leftKnee.y) * 0.35) + ((centers.hipCenter.y - leftAnkle.y) * 0.65);
  const rightLift = ((centers.hipCenter.y - rightKnee.y) * 0.35) + ((centers.hipCenter.y - rightAnkle.y) * 0.65);
  const kneeHeightDelta = Math.abs(leftKnee.y - rightKnee.y);
  const ankleHeightDelta = Math.abs(leftAnkle.y - rightAnkle.y);
  return (
    Math.abs(leftLift - rightLift) > 0.12 ||
    (kneeHeightDelta > 0.12 && ankleHeightDelta > 0.12)
  );
}

function isSeatedForwardFold(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  const limbs = getLimbCenters(poseLandmarks);
  if (!centers || !nose || !limbs) return false;

  const torsoHeight = Math.max(distance2D(centers.shoulderCenter, centers.hipCenter), 0.08);
  const headDrop = nose.y - centers.shoulderCenter.y;
  const shoulderToHipStack = centers.hipCenter.y - centers.shoulderCenter.y;
  const wristReach = limbs.wristCenter.y - centers.hipCenter.y;
  const relativeSeatedHinge =
    headDrop > torsoHeight * 0.28 &&
    shoulderToHipStack < 0.2 &&
    wristReach > -torsoHeight * 0.12;

  return (
    relativeSeatedHinge ||
    (
      nose.y > centers.shoulderCenter.y + 0.08 &&
      centers.shoulderCenter.y > 0.5 &&
      limbs.wristCenter.y > centers.hipCenter.y + 0.06
    )
  );
}

function isHalfKneeling(poseLandmarks?: TrackingLandmark[]) {
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return false;

  return (
    Math.abs(leftKnee.y - rightKnee.y) > 0.12 ||
    Math.abs(leftAnkle.y - rightAnkle.y) > 0.12
  );
}

function isLowLunge(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  if (!centers || !limbs || !isHalfKneeling(poseLandmarks)) return false;

  return (
    limbs.wristCenter.y > centers.hipCenter.y + 0.12 &&
    limbs.ankleCenter.y > centers.hipCenter.y + 0.12
  );
}

function isSupineBridgePrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  if (!centers) return false;

  return centers.shoulderCenter.y - centers.hipCenter.y > 0.045;
}

function isPilatesHundredPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  if (!centers || !limbs) return false;

  return (
    limbs.wristCenter.y < centers.hipCenter.y - 0.04 &&
    limbs.ankleCenter.y < centers.hipCenter.y + 0.02 &&
    limbs.kneeCenter.y < centers.hipCenter.y + 0.04
  );
}

function isPilatesSingleLegStretchPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!centers || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return false;

  const leftLift = ((centers.hipCenter.y - leftKnee.y) * 0.45) + ((centers.hipCenter.y - leftAnkle.y) * 0.55);
  const rightLift = ((centers.hipCenter.y - rightKnee.y) * 0.45) + ((centers.hipCenter.y - rightAnkle.y) * 0.55);
  return (
    Math.abs(leftAnkle.y - rightAnkle.y) > 0.18 &&
    Math.abs(leftLift - rightLift) > 0.1 &&
    Math.max(leftLift, rightLift) > 0.05
  );
}

function isPilatesDoubleLegStretchPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  if (!centers || !limbs || !leftWrist || !rightWrist) return false;

  const wristCenter = midpoint(leftWrist, rightWrist);
  return (
    limbs.ankleCenter.y < centers.hipCenter.y - 0.04 &&
    limbs.kneeCenter.y < centers.hipCenter.y - 0.03 &&
    wristCenter.x < centers.shoulderCenter.x - 0.08
  );
}

function isPilatesDeadBugPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return false;

  const leftArmOverhead = leftWrist.x < centers.shoulderCenter.x - 0.08;
  const rightArmOverhead = rightWrist.x < centers.shoulderCenter.x - 0.08;
  const leftLegLifted = leftAnkle.y < centers.hipCenter.y - 0.06;
  const rightLegLifted = rightAnkle.y < centers.hipCenter.y - 0.06;
  return (
    (leftArmOverhead && rightLegLifted && !rightArmOverhead) ||
    (rightArmOverhead && leftLegLifted && !leftArmOverhead)
  );
}

function isPilatesHollowHoldPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  if (!centers || !limbs) return false;

  return (
    limbs.wristCenter.y < centers.shoulderCenter.y - 0.12 &&
    limbs.ankleCenter.y < centers.hipCenter.y - 0.08 &&
    limbs.kneeCenter.y < centers.hipCenter.y - 0.04
  );
}

function isPilatesClamPrep(poseLandmarks?: TrackingLandmark[]) {
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return false;

  return (
    Math.abs(leftKnee.y - rightKnee.y) > 0.075 &&
    Math.abs(leftAnkle.y - rightAnkle.y) < 0.08
  );
}

function isProneBackExtensionPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return false;

  return (
    centers.hipCenter.y - centers.shoulderCenter.y > 0.08 &&
    centers.shoulderCenter.y - nose.y > 0.04
  );
}

function isPilatesSwimmingPrep(poseLandmarks?: TrackingLandmark[]) {
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return false;

  const leftArmReach = rightWrist.x - leftWrist.x;
  const rightLegReach = rightAnkle.x - leftAnkle.x;
  const rightArmReach = rightWrist.x - leftWrist.x;
  const leftLegReach = rightAnkle.x - leftAnkle.x;
  return (
    (leftArmReach > 0.18 && rightLegReach > 0.18 && leftWrist.y < rightWrist.y - 0.06 && rightAnkle.y < leftAnkle.y - 0.06) ||
    (rightArmReach > 0.18 && leftLegReach > 0.18 && rightWrist.y < leftWrist.y - 0.06 && leftAnkle.y < rightAnkle.y - 0.06)
  );
}

function isSideLyingLegLift(poseLandmarks?: TrackingLandmark[]) {
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return false;

  return (
    Math.abs(leftKnee.y - rightKnee.y) > 0.12 ||
    Math.abs(leftAnkle.y - rightAnkle.y) > 0.12
  );
}

function isQuadrupedBirdDogPrep(poseLandmarks?: TrackingLandmark[]) {
  const leftArmReach = distance2D(poseLandmarks?.[11], poseLandmarks?.[15]);
  const rightArmReach = distance2D(poseLandmarks?.[12], poseLandmarks?.[16]);
  const leftLegReach = distance2D(poseLandmarks?.[23], poseLandmarks?.[27]);
  const rightLegReach = distance2D(poseLandmarks?.[24], poseLandmarks?.[28]);

  return (
    (leftArmReach > 0.22 && rightLegReach > 0.28) ||
    (rightArmReach > 0.22 && leftLegReach > 0.28)
  );
}

function isQuadrupedChildPosePrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !limbs || !nose) return false;

  return (
    nose.y > centers.shoulderCenter.y + 0.08 &&
    centers.hipCenter.x > centers.shoulderCenter.x + 0.16 &&
    limbs.wristCenter.x < centers.shoulderCenter.x
  );
}

function isYogaCatPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return false;

  return nose.y > centers.shoulderCenter.y + 0.12;
}

function isYogaCowPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return false;

  return (
    nose.y < centers.shoulderCenter.y - 0.08 &&
    centers.hipCenter.y > centers.shoulderCenter.y + 0.06
  );
}

function isQuadrupedPlankPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  if (!centers || !limbs) return false;

  return (
    Math.abs(centers.shoulderCenter.y - centers.hipCenter.y) < 0.08 &&
    Math.abs(limbs.wristCenter.y - limbs.ankleCenter.y) < 0.08 &&
    limbs.kneeCenter.y < limbs.ankleCenter.y - 0.08
  );
}

function isBearCrawlPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  if (!centers || !limbs) return false;

  return (
    centers.hipCenter.y > centers.shoulderCenter.y + 0.05 &&
    Math.abs(limbs.wristCenter.y - limbs.ankleCenter.y) < 0.1 &&
    limbs.kneeCenter.y < limbs.ankleCenter.y - 0.1
  );
}

function isQuadrupedDownDogPrep(poseLandmarks?: TrackingLandmark[]) {
  const centers = getCoreCenters(poseLandmarks);
  const limbs = getLimbCenters(poseLandmarks);
  if (!centers || !limbs) return false;

  return (
    centers.hipCenter.y < centers.shoulderCenter.y - 0.08 &&
    Math.abs(limbs.wristCenter.y - limbs.ankleCenter.y) < 0.1 &&
    limbs.kneeCenter.y < limbs.ankleCenter.y - 0.04
  );
}

export function resolveMovementExercisePose({
  bodyOrientation,
  bodySupport,
  poseLandmarks,
}: {
  bodyOrientation: MovementBodyOrientationDecision;
  bodySupport: MovementSupportContactDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementExercisePoseDecision {
  if (bodyOrientation.orientation === "upright") {
    if (isYogaTreePrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "yoga"],
        disciplines: ["yoga", "mobility"],
        label: "Tree prep",
        poseKey: "yoga-tree-prep",
        programLabels: ["Yoga tree prep", "Standing balance"],
        summary: "Upright one-foot balance geometry is detected; exact foot-to-leg contact and balance IK are still diagnostic.",
      });
    }

    if (isJumpingJackPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "jump-hop"],
        disciplines: ["general", "mobility"],
        label: "Jumping-jack prep",
        poseKey: "jumping-jack-prep",
        programLabels: ["Jumping jack prep", "Grounded star-shape reach"],
        summary: "Wide grounded star-shape geometry is detected; airborne jump phase and landing recovery remain diagnostic.",
      });
    }

    if (isYogaChairPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "yoga", "squat-knee-lift"],
        disciplines: ["yoga", "mobility"],
        label: "Chair-pose prep",
        poseKey: "yoga-chair-prep",
        programLabels: ["Yoga chair pose prep", "Standing squat reach"],
        summary: "Upright squat-depth geometry with raised arms is detected; exact chair-pose balance and knee tracking remain approximate.",
      });
    }

    if (isForwardLungePrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "lunges"],
        disciplines: ["general", "mobility"],
        label: "Forward-lunge prep",
        poseKey: "forward-lunge-prep",
        programLabels: ["Forward lunge prep", "Standing split-stance lunge"],
        summary: "Asymmetric standing lunge geometry is detected; travelling lunge steps and foot-plant recovery remain diagnostic.",
      });
    }

    if (isSideLungePrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "lunges", "pivot-weight-transfer"],
        disciplines: ["general", "mobility"],
        label: "Side-lunge prep",
        poseKey: "side-lunge-prep",
        programLabels: ["Side lunge prep", "Lateral weight-shift lunge"],
        summary: "Wide lateral lunge geometry is detected; exact planted-foot weight transfer and recovery remain diagnostic.",
      });
    }

    if (isYogaWarriorOnePrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "yoga", "lunges"],
        disciplines: ["yoga", "mobility"],
        label: "Warrior I prep",
        poseKey: "yoga-warrior-one-prep",
        programLabels: ["Yoga warrior I prep", "Standing lunge reach"],
        summary: "Wide standing lunge geometry with overhead arms is detected; exact foot angle and hip-square scoring remain diagnostic.",
      });
    }

    if (isYogaTrianglePrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "yoga", "upper-body-standing"],
        disciplines: ["yoga", "mobility"],
        label: "Triangle prep",
        poseKey: "yoga-triangle-prep",
        programLabels: ["Yoga triangle prep", "Wide-stance side reach"],
        summary: "Wide-stance triangle-style arm line is detected; exact hip hinge and side-bend scoring remain diagnostic.",
      });
    }

    if (isYogaWarriorTwoPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "yoga", "lunges"],
        disciplines: ["yoga", "mobility"],
        label: "Warrior II prep",
        poseKey: "yoga-warrior-two-prep",
        programLabels: ["Yoga warrior II prep", "Wide-stance lunge reach"],
        summary: "Wide standing base with arms extended at shoulder height is detected; exact foot angle and lunge-depth IK remain diagnostic.",
      });
    }

    if (isYogaHalfLiftPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "yoga", "upper-body-standing"],
        disciplines: ["yoga", "mobility"],
        label: "Half-lift prep",
        poseKey: "yoga-half-lift-prep",
        programLabels: ["Yoga half lift prep", "Standing flat-back hinge"],
        summary: "Standing flat-back hinge geometry is detected; exact hamstring hinge and hand-to-shin contact remain diagnostic.",
      });
    }

    if (isYogaForwardFoldPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "yoga", "upper-body-standing"],
        disciplines: ["yoga", "mobility"],
        label: "Forward-fold prep",
        poseKey: "yoga-forward-fold-prep",
        programLabels: ["Yoga forward fold prep", "Standing roll-down"],
        summary: "Standing forward-fold geometry is detected; exact hamstring hinge and hand-to-floor contact remain diagnostic.",
      });
    }

    if (isStandingTwist(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "upper-body-standing"],
        disciplines: ["general", "mobility", "yoga"],
        label: "Standing twist",
        poseKey: "standing-twist",
        programLabels: ["Standing spinal twist", "Mountain-pose twist"],
        summary: "Upright shoulder-to-hip twist is detected; exact thoracic rotation and foot pressure remain diagnostic.",
      });
    }

    if (isStandingArmRaise(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: bodyOrientation.confidence,
        coverageFamilies: ["upright", "upper-body-standing"],
        disciplines: ["general", "mobility", "yoga"],
        label: "Standing arm raise",
        poseKey: "standing-arm-raise",
        programLabels: ["Standing arm raise", "Mountain-pose overhead reach"],
        summary: "Upright overhead arm reach is detected; exact shoulder flexion and rib control remain diagnostic.",
      });
    }

    return buildExercisePoseDecision({
      confidence: bodyOrientation.confidence,
      coverageFamilies: ["upright"],
      disciplines: ["general"],
      label: "Standing neutral",
      poseKey: "standing-neutral",
      programLabels: ["Standing neutral", "Mountain-pose baseline"],
      status: "supported",
      summary: "Upright standing remains on the supported posture path.",
    });
  }

  if (bodyOrientation.orientation === "seated") {
    if (isSeatedForwardFold(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["sitting", "props-contact", "yoga"],
        disciplines: ["general", "mobility", "yoga"],
        label: "Seated forward fold",
        poseKey: "seated-forward-fold",
        programLabels: ["Seated forward fold", "Chair hamstring reach"],
        summary: "Seated forward-fold geometry is detected; exact pelvis hinge and chair contact remain approximate.",
      });
    }

    if (isSeatedTwist(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["sitting", "props-contact", "yoga"],
        disciplines: ["general", "mobility", "yoga"],
        label: "Seated twist",
        poseKey: "seated-twist",
        programLabels: ["Seated spinal twist", "Chair seated twist"],
        summary: "Seated support with visible shoulder/hip twist is detected; exact chair/pelvis IK is still approximate.",
      });
    }

    if (isSeatedLegLift(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["sitting", "props-contact", "squat-knee-lift"],
        disciplines: ["general", "mobility"],
        label: "Seated leg lift",
        poseKey: "seated-leg-lift",
        programLabels: ["Seated leg lift", "Chair knee extension"],
        summary: "Seated asymmetric leg lift is detected; exact knee-extension IK and chair contact remain approximate.",
      });
    }

    return buildExercisePoseDecision({
      confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
      coverageFamilies: ["sitting", "props-contact"],
      disciplines: ["general", "mobility"],
      label: "Chair seated",
      poseKey: "chair-seated",
      programLabels: ["Chair seated posture", "Seated mobility setup"],
      summary: "Seated geometry and inferred chair contact are detected; chair IK is still diagnostic.",
    });
  }

  if (bodyOrientation.orientation === "kneeling") {
    if (isLowLunge(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["kneeling", "lunges", "yoga"],
        disciplines: ["general", "yoga", "mobility"],
        label: "Low-lunge floor",
        poseKey: "low-lunge-floor",
        programLabels: ["Yoga low lunge", "Floor-supported lunge setup"],
        summary: "Asymmetric knee/foot support with low hands is detected; travelling lunge IK and hand/foot locks are still diagnostic.",
      });
    }

    if (isHalfKneeling(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["kneeling", "lunges", "yoga"],
        disciplines: ["general", "yoga", "mobility"],
        label: "Half-kneeling floor",
        poseKey: "half-kneeling-floor",
        programLabels: ["Half-kneeling mobility", "Yoga low-lunge setup"],
        summary: "Asymmetric kneeling support is detected; exact knee/foot floor locks are still approximate.",
      });
    }

    return buildExercisePoseDecision({
      confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
      coverageFamilies: ["kneeling", "yoga"],
      disciplines: ["general", "yoga", "mobility"],
      label: "Kneeling floor",
      poseKey: "kneeling-floor",
      programLabels: ["Kneeling floor posture", "Yoga hero-pose setup"],
      summary: "Kneeling support is detected; knee contact constraints are still diagnostic.",
    });
  }

  if (bodyOrientation.orientation === "quadruped") {
    if (isQuadrupedDownDogPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["quadruped", "yoga"],
        disciplines: ["yoga", "mobility"],
        label: "Down-dog prep",
        poseKey: "yoga-down-dog-prep",
        programLabels: ["Yoga downward-dog prep", "Pike floor support"],
        summary: "Hands-and-feet floor support with raised hips is detected; exact hand/foot locks remain approximate.",
      });
    }

    if (isBearCrawlPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["quadruped", "rolling-crawling"],
        disciplines: ["general", "mobility"],
        label: "Bear-crawl prep",
        poseKey: "bear-crawl-prep",
        programLabels: ["Bear crawl prep", "Hands-and-feet crawl setup"],
        summary: "Bent-knee hands-and-feet floor support is detected; crawling limb sequencing is still diagnostic.",
      });
    }

    if (isQuadrupedPlankPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["quadruped", "yoga", "pilates"],
        disciplines: ["yoga", "pilates", "mobility"],
        label: "Plank prep",
        poseKey: "yoga-plank-prep",
        programLabels: ["Yoga plank prep", "Pilates plank setup"],
        summary: "Hands-and-feet plank geometry is detected; exact wrist/foot floor constraints remain approximate.",
      });
    }

    if (isQuadrupedChildPosePrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["quadruped", "yoga"],
        disciplines: ["yoga", "mobility"],
        label: "Child-pose prep",
        poseKey: "yoga-child-pose-prep",
        programLabels: ["Yoga child pose prep", "Resting floor fold"],
        summary: "Folded hands-and-knees floor work is detected; exact hip/hand/knee contact remains approximate.",
      });
    }

    if (isYogaCatPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["quadruped", "yoga"],
        disciplines: ["yoga", "mobility"],
        label: "Cat prep",
        poseKey: "yoga-cat-prep",
        programLabels: ["Yoga cat prep", "All-fours spinal flexion"],
        summary: "Hands-and-knees cat-pose spine flexion is detected; exact spinal segmentation remains diagnostic.",
      });
    }

    if (isYogaCowPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["quadruped", "yoga"],
        disciplines: ["yoga", "mobility"],
        label: "Cow prep",
        poseKey: "yoga-cow-prep",
        programLabels: ["Yoga cow prep", "All-fours spinal extension"],
        summary: "Hands-and-knees cow-pose spine extension is detected; exact spinal segmentation remains diagnostic.",
      });
    }

    if (isQuadrupedBirdDogPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["quadruped", "yoga", "pilates"],
        disciplines: ["yoga", "pilates", "mobility"],
        label: "Bird-dog prep",
        poseKey: "quadruped-bird-dog-prep",
        programLabels: ["Yoga bird-dog prep", "Pilates quadruped reach"],
        summary: "Opposite arm/leg reach is detected from all-fours; limb contact/reach IK is still diagnostic.",
      });
    }

    return buildExercisePoseDecision({
      confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
      coverageFamilies: ["quadruped", "yoga", "pilates"],
      disciplines: ["yoga", "pilates", "mobility"],
      label: "Tabletop all-fours",
      poseKey: "tabletop-all-fours",
      programLabels: ["Yoga tabletop", "Pilates all-fours"],
      summary: "Hands-and-knees tabletop is detected; full wrist/knee floor constraints are still diagnostic.",
    });
  }

  if (
    bodyOrientation.orientation === "sideLyingLeft" ||
    bodyOrientation.orientation === "sideLyingRight"
  ) {
    if (isPilatesClamPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates"],
        disciplines: ["pilates", "mobility"],
        label: "Clam prep",
        poseKey: "pilates-clam-prep",
        programLabels: ["Pilates clam prep", "Side-lying hip rotation"],
        summary: "Side-lying bent-knee separation is detected; exact hip external-rotation IK remains approximate.",
      });
    }

    if (isSideLyingLegLift(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates"],
        disciplines: ["pilates", "mobility"],
        label: "Side-lying leg lift",
        poseKey: "pilates-side-lying-leg-lift",
        programLabels: ["Pilates side-lying leg lift", "Side-lying hip abduction"],
        summary: "A separated top-leg line is detected during side-lying mat work; leg-lift IK is still diagnostic.",
      });
    }

    return buildExercisePoseDecision({
      confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
      coverageFamilies: ["lying-floor-work", "pilates", "yoga"],
      disciplines: ["pilates", "yoga", "mobility"],
      label: "Side-lying mat",
      poseKey: "side-lying-mat",
      programLabels: ["Pilates side-lying series", "Yoga side-lying restorative"],
      summary: "Side-lying mat work is detected; horizontal body contact remains diagnostic.",
    });
  }

  if (bodyOrientation.orientation === "supine") {
    if (isPilatesDeadBugPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates"],
        disciplines: ["pilates", "mobility"],
        label: "Dead bug prep",
        poseKey: "pilates-dead-bug-prep",
        programLabels: ["Pilates dead bug prep", "Supine opposite arm-leg reach"],
        summary: "Supine opposite arm-and-leg reach is detected; exact alternating core-control IK remains approximate.",
      });
    }

    if (isPilatesHollowHoldPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates"],
        disciplines: ["pilates", "mobility"],
        label: "Hollow-hold prep",
        poseKey: "pilates-hollow-hold-prep",
        programLabels: ["Pilates hollow hold prep", "Supine hollow-body hold"],
        summary: "Supine hollow-body arm and leg lift is detected; exact abdominal curl and low-back contact remain approximate.",
      });
    }

    if (isPilatesDoubleLegStretchPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates"],
        disciplines: ["pilates", "mobility"],
        label: "Double-leg stretch prep",
        poseKey: "pilates-double-leg-stretch-prep",
        programLabels: ["Pilates double-leg stretch prep", "Supine two-leg reach"],
        summary: "Supine two-leg reach with overhead arms is detected; exact abdominal curl and limb IK remain approximate.",
      });
    }

    if (isPilatesSingleLegStretchPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates"],
        disciplines: ["pilates", "mobility"],
        label: "Single-leg stretch prep",
        poseKey: "pilates-single-leg-stretch-prep",
        programLabels: ["Pilates single-leg stretch prep", "Supine alternating leg reach"],
        summary: "Supine asymmetric leg reach is detected; exact abdominal curl and hand-to-shin contact remain approximate.",
      });
    }

    if (isPilatesHundredPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates"],
        disciplines: ["pilates", "mobility"],
        label: "Hundred prep",
        poseKey: "pilates-hundred-prep",
        programLabels: ["Pilates hundred prep", "Supine abdominal prep"],
        summary: "Supine arms/legs lifted for Pilates hundred prep are detected; exact abdominal/limb contact remains approximate.",
      });
    }

    if (isSupineBridgePrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates", "yoga"],
        disciplines: ["pilates", "yoga", "mobility"],
        label: "Bridge prep",
        poseKey: "pilates-bridge-prep",
        programLabels: ["Pilates bridge prep", "Yoga bridge-pose prep"],
        summary: "Raised hips are detected in supine mat work; bridge spine/foot constraints are still diagnostic.",
      });
    }

    return buildExercisePoseDecision({
      confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
      coverageFamilies: ["lying-floor-work", "yoga", "pilates"],
      disciplines: ["yoga", "pilates", "mobility"],
      label: "Supine mat",
      poseKey: "supine-mat",
      programLabels: ["Yoga savasana candidate", "Pilates supine mat work"],
      summary: "Back-supported floor work is detected; supine limb pose solving is still diagnostic.",
    });
  }

  if (bodyOrientation.orientation === "prone") {
    if (isPilatesSwimmingPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates"],
        disciplines: ["pilates", "mobility"],
        label: "Swimming prep",
        poseKey: "pilates-swimming-prep",
        programLabels: ["Pilates swimming prep", "Prone opposite arm-leg reach"],
        summary: "Prone opposite arm/leg reach is detected; exact swimming alternation and limb-contact timing remain approximate.",
      });
    }

    if (isProneBackExtensionPrep(poseLandmarks)) {
      return buildExercisePoseDecision({
        confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
        coverageFamilies: ["lying-floor-work", "pilates", "yoga"],
        disciplines: ["pilates", "yoga", "mobility"],
        label: "Prone back extension prep",
        poseKey: "prone-back-extension-prep",
        programLabels: ["Pilates prone back extension", "Yoga cobra prep"],
        summary: "Lifted head and chest are detected in prone mat work; back-extension IK is still diagnostic.",
      });
    }

    return buildExercisePoseDecision({
      confidence: Math.min(bodyOrientation.confidence, bodySupport.confidence),
      coverageFamilies: ["lying-floor-work", "yoga", "pilates"],
      disciplines: ["yoga", "pilates", "mobility"],
      label: "Prone mat",
      poseKey: "prone-mat",
      programLabels: ["Yoga prone backbend prep", "Pilates prone mat work"],
      summary: "Chest-supported floor work is detected; prone limb pose solving is still diagnostic.",
    });
  }

  return buildExercisePoseDecision({
    confidence: bodyOrientation.confidence,
    coverageFamilies: [bodyOrientation.coverageFamily],
    disciplines: ["general"],
    label: "Unknown movement pose",
    poseKey: "unknown",
    programLabels: ["Unknown movement pose"],
    status: "unsupported",
    summary: "No named movement-program pose can be assigned to this frame yet.",
  });
}
