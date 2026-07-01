import { describe, expect, it } from "vitest";
import { analyzeMovementSpineFrames } from "./movementSpineReview";
import type { MovementFrame, MovementLandmark } from "./movementTypes";

function visible(x: number, y: number, z = 0, visibility = 0.9): MovementLandmark {
  return { x, y, z, visibility };
}

function makeNeutralPose(): MovementFrame {
  const pose = Array.from({ length: 33 }, () => visible(0.5, 0.5));
  pose[0] = visible(0.5, 0.25);
  pose[7] = visible(0.46, 0.27);
  pose[8] = visible(0.54, 0.27);
  pose[11] = visible(0.39, 0.42);
  pose[12] = visible(0.61, 0.42);
  pose[23] = visible(0.43, 0.66);
  pose[24] = visible(0.57, 0.66);
  return pose;
}

function makeForwardBendPose(): MovementFrame {
  const pose = makeNeutralPose() as MovementLandmark[];
  pose[0] = visible(0.63, 0.35);
  pose[7] = visible(0.59, 0.36);
  pose[8] = visible(0.67, 0.36);
  pose[11] = visible(0.54, 0.52);
  pose[12] = visible(0.76, 0.52);
  return pose;
}

function makeRotationPose(): MovementFrame {
  const pose = makeNeutralPose() as MovementLandmark[];
  pose[11] = visible(0.39, 0.42, 0.12);
  pose[12] = visible(0.61, 0.42, -0.12);
  pose[23] = visible(0.43, 0.66, -0.02);
  pose[24] = visible(0.57, 0.66, 0.02);
  return pose;
}

function makeAsymmetricPose(): MovementFrame {
  const pose = makeNeutralPose() as MovementLandmark[];
  pose[11] = visible(0.39, 0.38);
  pose[12] = visible(0.61, 0.48);
  return pose;
}

describe("movement spine review", () => {
  it("identifies explainable peak spine moments", () => {
    const review = analyzeMovementSpineFrames([
      makeNeutralPose(),
      makeForwardBendPose(),
      makeRotationPose(),
      makeAsymmetricPose(),
    ]);

    expect(review.trackedFrameCount).toBe(4);
    expect(review.bestStack?.frameIndex).toBe(0);
    expect(review.deepestBend?.frameIndex).toBe(1);
    expect(review.largestRotation?.frameIndex).toBe(2);
    expect(review.largestAsymmetry?.frameIndex).toBe(3);
    expect(review.averageStackScore).toBeGreaterThan(0);
    expect(review.averageSymmetryScore).toBeGreaterThan(0);
  });

  it("returns empty review data when no usable frames are available", () => {
    const review = analyzeMovementSpineFrames([]);

    expect(review.trackedFrameCount).toBe(0);
    expect(review.bestStack).toBeNull();
    expect(review.averageStackScore).toBe(0);
  });
});
