import type { MovementLandmark, MovementSpineGoal } from "./movementTypes";

export type MovementSpinePoint = {
  x: number;
  y: number;
  z: number;
  confidence: number;
};

export type MovementSpineModel = {
  confidence: number;
  headCenter: MovementSpinePoint;
  shoulderCenter: MovementSpinePoint;
  ribcageCenter: MovementSpinePoint;
  pelvisCenter: MovementSpinePoint;
  shoulderTilt: number;
  hipTilt: number;
  headPelvisOffset: number;
  ribcagePelvisOffset: number;
  torsoLean: number;
  torsoSideBend: number;
  shoulderHipRotation: number;
  neutralStackScore: number;
  symmetryScore: number;
  coachingCue: string;
};

export type MovementSpineComparison = {
  score: number;
  cue: string;
};

const MIN_SPINE_CONFIDENCE = 0.2;
const IDEAL_TORSO_LENGTH = 0.22;

type WeightedScore = {
  score: number;
  weight: number;
};

function visibility(landmark: MovementLandmark | undefined) {
  return Math.max(0, Math.min(1, landmark?.visibility ?? 0));
}

function pointFromLandmark(landmark: MovementLandmark | undefined): MovementSpinePoint {
  return {
    x: landmark?.x ?? 0.5,
    y: landmark?.y ?? 0.5,
    z: landmark?.z ?? 0,
    confidence: visibility(landmark),
  };
}

function midpoint(a: MovementSpinePoint, b: MovementSpinePoint): MovementSpinePoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    confidence: (a.confidence + b.confidence) / 2,
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function scoreFromMagnitude(value: number, tolerance: number) {
  if (tolerance <= 0) return 0;
  return clamp01(1 - Math.abs(value) / tolerance);
}

function weightedAverage(scores: WeightedScore[]) {
  const totalWeight = scores.reduce((sum, score) => sum + score.weight, 0);
  if (totalWeight <= 0) return 0;

  return scores.reduce((sum, score) => sum + score.score * score.weight, 0) / totalWeight;
}

function compareMetric(playerValue: number, instructorValue: number, tolerance: number, weight: number): WeightedScore {
  return {
    score: scoreFromMagnitude(playerValue - instructorValue, tolerance),
    weight,
  };
}

function neutralScoreMetric(score: number, weight: number): WeightedScore {
  return {
    score: clamp01(score / 100),
    weight,
  };
}

function safeDistance(a: MovementSpinePoint, b: MovementSpinePoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

function lineTilt(left: MovementSpinePoint, right: MovementSpinePoint) {
  return right.y - left.y;
}

function horizontalAngle(left: MovementSpinePoint, right: MovementSpinePoint) {
  return Math.atan2(right.z - left.z, right.x - left.x);
}

function selectHeadPoint(landmarks: MovementLandmark[]) {
  const nose = pointFromLandmark(landmarks[0]);
  const leftEar = pointFromLandmark(landmarks[7]);
  const rightEar = pointFromLandmark(landmarks[8]);

  if (leftEar.confidence >= MIN_SPINE_CONFIDENCE && rightEar.confidence >= MIN_SPINE_CONFIDENCE) {
    return midpoint(leftEar, rightEar);
  }

  return nose;
}

function getCoachingCue(args: {
  confidence: number;
  headPelvisOffset: number;
  ribcagePelvisOffset: number;
  shoulderTilt: number;
  hipTilt: number;
  torsoLean: number;
}) {
  if (args.confidence < 0.35) return "Bring shoulders and hips into view.";
  if (Math.abs(args.headPelvisOffset) > 0.1) return "Stack head over hips.";
  if (Math.abs(args.ribcagePelvisOffset) > 0.09) return "Keep ribs over pelvis.";
  if (Math.abs(args.shoulderTilt) > 0.07) return "Level the shoulders.";
  if (Math.abs(args.hipTilt) > 0.07) return "Balance the hips.";
  if (args.torsoLean > -0.1) return "Return to tall spine.";
  return "Tall spine.";
}

export function buildMovementSpineModel(landmarks: MovementLandmark[] | null | undefined): MovementSpineModel | null {
  if (!landmarks || landmarks.length < 33) return null;

  const headCenter = selectHeadPoint(landmarks);
  const leftShoulder = pointFromLandmark(landmarks[11]);
  const rightShoulder = pointFromLandmark(landmarks[12]);
  const leftHip = pointFromLandmark(landmarks[23]);
  const rightHip = pointFromLandmark(landmarks[24]);
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const pelvisCenter = midpoint(leftHip, rightHip);
  const ribcageCenter = midpoint(shoulderCenter, pelvisCenter);
  const confidence =
    (headCenter.confidence +
      leftShoulder.confidence +
      rightShoulder.confidence +
      leftHip.confidence +
      rightHip.confidence) /
    5;

  const shoulderTilt = lineTilt(leftShoulder, rightShoulder);
  const hipTilt = lineTilt(leftHip, rightHip);
  const headPelvisOffset = headCenter.x - pelvisCenter.x;
  const ribcagePelvisOffset = ribcageCenter.x - pelvisCenter.x;
  const torsoLean = shoulderCenter.y - pelvisCenter.y;
  const torsoSideBend = shoulderCenter.x - pelvisCenter.x;
  const shoulderHipRotation = horizontalAngle(leftShoulder, rightShoulder) - horizontalAngle(leftHip, rightHip);
  const torsoLength = safeDistance(shoulderCenter, pelvisCenter);

  const stackScore =
    (scoreFromMagnitude(headPelvisOffset, 0.14) +
      scoreFromMagnitude(ribcagePelvisOffset, 0.1) +
      scoreFromMagnitude(shoulderTilt, 0.1) +
      scoreFromMagnitude(hipTilt, 0.1) +
      scoreFromMagnitude(torsoLength - IDEAL_TORSO_LENGTH, 0.18)) /
    5;
  const symmetryScore =
    (scoreFromMagnitude(shoulderTilt, 0.1) +
      scoreFromMagnitude(hipTilt, 0.1) +
      scoreFromMagnitude(shoulderHipRotation, 0.65)) /
    3;
  const neutralStackScore = Math.round(clamp01(stackScore * confidence) * 100);
  const roundedSymmetryScore = Math.round(clamp01(symmetryScore * confidence) * 100);

  return {
    confidence,
    headCenter,
    shoulderCenter,
    ribcageCenter,
    pelvisCenter,
    shoulderTilt,
    hipTilt,
    headPelvisOffset,
    ribcagePelvisOffset,
    torsoLean,
    torsoSideBend,
    shoulderHipRotation,
    neutralStackScore,
    symmetryScore: roundedSymmetryScore,
    coachingCue: getCoachingCue({
      confidence,
      headPelvisOffset,
      ribcagePelvisOffset,
      shoulderTilt,
      hipTilt,
      torsoLean,
    }),
  };
}

export function compareMovementSpineModels(
  player: MovementSpineModel | null | undefined,
  instructor: MovementSpineModel | null | undefined,
  spineGoal?: MovementSpineGoal | null,
): MovementSpineComparison {
  if (!player || !instructor) {
    return {
      score: 0,
      cue: "Waiting for spine tracking.",
    };
  }

  const confidence = Math.min(player.confidence, instructor.confidence);
  const shapeMatch = getGoalShapeMatch(player, instructor, spineGoal);

  const score = Math.round(clamp01(shapeMatch * confidence) * 100);
  return {
    score,
    cue: getGoalCue({ player, score, spineGoal }),
  };
}

function getGoalShapeMatch(
  player: MovementSpineModel,
  instructor: MovementSpineModel,
  spineGoal?: MovementSpineGoal | null,
) {
  switch (spineGoal) {
    case "neutralStack":
      return weightedAverage([
        compareMetric(player.headPelvisOffset, instructor.headPelvisOffset, 0.14, 2),
        compareMetric(player.ribcagePelvisOffset, instructor.ribcagePelvisOffset, 0.1, 2),
        compareMetric(player.shoulderTilt, instructor.shoulderTilt, 0.1, 1),
        compareMetric(player.hipTilt, instructor.hipTilt, 0.1, 1),
        neutralScoreMetric(player.neutralStackScore, 2),
      ]);
    case "hipHinge":
      return weightedAverage([
        compareMetric(player.torsoLean, instructor.torsoLean, 0.18, 2),
        compareMetric(player.ribcagePelvisOffset, instructor.ribcagePelvisOffset, 0.12, 2),
        compareMetric(player.headPelvisOffset, instructor.headPelvisOffset, 0.18, 1),
        compareMetric(player.hipTilt, instructor.hipTilt, 0.12, 1),
        compareMetric(player.shoulderTilt, instructor.shoulderTilt, 0.14, 0.5),
      ]);
    case "rollDown":
      return weightedAverage([
        compareMetric(player.torsoLean, instructor.torsoLean, 0.2, 2),
        compareMetric(player.headPelvisOffset, instructor.headPelvisOffset, 0.16, 2),
        compareMetric(player.ribcagePelvisOffset, instructor.ribcagePelvisOffset, 0.14, 1.5),
        compareMetric(player.shoulderTilt, instructor.shoulderTilt, 0.14, 0.5),
        compareMetric(player.hipTilt, instructor.hipTilt, 0.14, 0.5),
      ]);
    case "thoracicRotation":
      return weightedAverage([
        compareMetric(player.shoulderHipRotation, instructor.shoulderHipRotation, 0.55, 3),
        compareMetric(player.ribcagePelvisOffset, instructor.ribcagePelvisOffset, 0.14, 1),
        compareMetric(player.hipTilt, instructor.hipTilt, 0.1, 1),
        compareMetric(player.shoulderTilt, instructor.shoulderTilt, 0.14, 0.5),
        neutralScoreMetric(player.neutralStackScore, 0.75),
      ]);
    case "sideBend":
      return weightedAverage([
        compareMetric(player.torsoSideBend, instructor.torsoSideBend, 0.14, 3),
        compareMetric(player.shoulderTilt, instructor.shoulderTilt, 0.12, 1),
        compareMetric(player.hipTilt, instructor.hipTilt, 0.1, 1),
        compareMetric(player.headPelvisOffset, instructor.headPelvisOffset, 0.18, 1),
      ]);
    case "extension":
      return weightedAverage([
        compareMetric(player.torsoLean, instructor.torsoLean, 0.18, 2),
        compareMetric(player.ribcagePelvisOffset, instructor.ribcagePelvisOffset, 0.12, 2),
        compareMetric(player.headPelvisOffset, instructor.headPelvisOffset, 0.16, 1),
        compareMetric(player.hipTilt, instructor.hipTilt, 0.12, 1),
      ]);
    case "squatWithStack":
      return weightedAverage([
        compareMetric(player.headPelvisOffset, instructor.headPelvisOffset, 0.14, 2),
        compareMetric(player.ribcagePelvisOffset, instructor.ribcagePelvisOffset, 0.1, 2),
        compareMetric(player.hipTilt, instructor.hipTilt, 0.1, 1),
        compareMetric(player.shoulderTilt, instructor.shoulderTilt, 0.12, 0.5),
        compareMetric(player.torsoLean, instructor.torsoLean, 0.22, 0.75),
        neutralScoreMetric(player.neutralStackScore, 2),
      ]);
    default:
      return weightedAverage([
        compareMetric(player.headPelvisOffset, instructor.headPelvisOffset, 0.16, 1),
        compareMetric(player.ribcagePelvisOffset, instructor.ribcagePelvisOffset, 0.12, 1),
        compareMetric(player.shoulderTilt, instructor.shoulderTilt, 0.12, 1),
        compareMetric(player.hipTilt, instructor.hipTilt, 0.12, 1),
        compareMetric(player.torsoLean, instructor.torsoLean, 0.18, 1),
      ]);
  }
}

function getGoalCue(args: {
  player: MovementSpineModel;
  score: number;
  spineGoal?: MovementSpineGoal | null;
}) {
  if (args.score >= 75) return "Spine shape matches.";
  if (args.player.confidence < 0.35) return args.player.coachingCue;

  switch (args.spineGoal) {
    case "hipHinge":
      return "Let the hips lead while the spine stays long.";
    case "rollDown":
      return "Move through the spine with control.";
    case "thoracicRotation":
      return "Rotate through the upper back.";
    case "sideBend":
      return "Lengthen through the side bend.";
    case "extension":
      return "Open the chest with a supported pelvis.";
    case "squatWithStack":
      return "Keep tall spine as the knees bend.";
    default:
      return args.player.coachingCue;
  }
}
