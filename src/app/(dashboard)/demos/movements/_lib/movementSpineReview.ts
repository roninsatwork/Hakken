import { getFrameLandmarks } from "./movementFrameCodec";
import { buildMovementSpineModel, type MovementSpineModel } from "./movementSpineMetrics";
import type { MovementFrame } from "./movementTypes";

export type MovementSpineReviewMoment = {
  frameIndex: number;
  label: string;
  valueLabel: string;
  cue: string;
};

export type MovementSpineReview = {
  bestStack: MovementSpineReviewMoment | null;
  deepestBend: MovementSpineReviewMoment | null;
  largestRotation: MovementSpineReviewMoment | null;
  largestAsymmetry: MovementSpineReviewMoment | null;
  averageStackScore: number;
  averageSymmetryScore: number;
  trackedFrameCount: number;
};

type IndexedSpineModel = {
  frameIndex: number;
  model: MovementSpineModel;
};

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDegrees(radians: number) {
  return `${Math.round(Math.abs((radians * 180) / Math.PI))} deg`;
}

function maxBy<T>(items: T[], score: (item: T) => number) {
  return items.reduce<T | null>((best, item) => {
    if (!best) return item;
    return score(item) > score(best) ? item : best;
  }, null);
}

function getBendScore(model: MovementSpineModel) {
  return Math.max(
    Math.abs(model.headPelvisOffset),
    Math.abs(model.ribcagePelvisOffset) * 1.4,
    Math.max(0, 0.24 - Math.abs(model.torsoLean)),
  );
}

export function analyzeMovementSpineFrames(frames: MovementFrame[]): MovementSpineReview {
  const models = frames
    .map((frame, frameIndex): IndexedSpineModel | null => {
      const model = buildMovementSpineModel(getFrameLandmarks(frame));
      if (!model || model.confidence < 0.25) return null;
      return { frameIndex, model };
    })
    .filter((item): item is IndexedSpineModel => Boolean(item));

  if (models.length === 0) {
    return {
      bestStack: null,
      deepestBend: null,
      largestRotation: null,
      largestAsymmetry: null,
      averageStackScore: 0,
      averageSymmetryScore: 0,
      trackedFrameCount: 0,
    };
  }

  const bestStack = maxBy(models, ({ model }) => model.neutralStackScore);
  const deepestBend = maxBy(models, ({ model }) => getBendScore(model));
  const largestRotation = maxBy(models, ({ model }) => Math.abs(model.shoulderHipRotation));
  const largestAsymmetry = maxBy(models, ({ model }) =>
    Math.max(Math.abs(model.shoulderTilt), Math.abs(model.hipTilt)),
  );
  const averageStackScore = models.reduce((sum, { model }) => sum + model.neutralStackScore, 0) / models.length;
  const averageSymmetryScore = models.reduce((sum, { model }) => sum + model.symmetryScore, 0) / models.length;

  return {
    bestStack: bestStack
      ? {
          frameIndex: bestStack.frameIndex,
          label: "Best spine stack",
          valueLabel: formatPercent(bestStack.model.neutralStackScore),
          cue: "Use this moment as the tall reference shape.",
        }
      : null,
    deepestBend: deepestBend
      ? {
          frameIndex: deepestBend.frameIndex,
          label: "Deepest bend",
          valueLabel: formatPercent(Math.min(100, getBendScore(deepestBend.model) * 420)),
          cue: "Check the head, ribs, and pelvis stay organized through the bend.",
        }
      : null,
    largestRotation: largestRotation
      ? {
          frameIndex: largestRotation.frameIndex,
          label: "Largest rotation",
          valueLabel: formatDegrees(largestRotation.model.shoulderHipRotation),
          cue: "Look for ribcage movement without the pelvis rushing after it.",
        }
      : null,
    largestAsymmetry: largestAsymmetry
      ? {
          frameIndex: largestAsymmetry.frameIndex,
          label: "Largest asymmetry",
          valueLabel: formatPercent(
            Math.min(
              100,
              Math.max(
                Math.abs(largestAsymmetry.model.shoulderTilt),
                Math.abs(largestAsymmetry.model.hipTilt),
              ) * 900,
            ),
          ),
          cue: largestAsymmetry.model.coachingCue,
        }
      : null,
    averageStackScore: Math.round(averageStackScore),
    averageSymmetryScore: Math.round(averageSymmetryScore),
    trackedFrameCount: models.length,
  };
}
