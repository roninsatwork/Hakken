import { describe, expect, it } from "vitest";
import {
  buildLiveMovementSourceFrame,
  buildSyntheticMovementSourceFrame,
} from "./movementSourceFrame";
import {
  buildMovementTruthSkeleton,
  getMovementTruthSkeletonRecoveryCue,
  summarizeMovementTruthSkeleton,
} from "./movementTruthSkeleton";
import type { MovementTruthSkeletonSegment } from "./movementTruthSkeleton";
import type { TrackingLandmark } from "./movementTrackingCalibration";

const makePose = (): TrackingLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.9,
  }));

function withCorePose() {
  const pose = makePose();
  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.9 };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  pose[13] = { x: 0.34, y: 0.56, z: 0, visibility: 0.9 };
  pose[14] = { x: 0.66, y: 0.56, z: 0, visibility: 0.9 };
  pose[15] = { x: 0.32, y: 0.68, z: 0, visibility: 0.9 };
  pose[16] = { x: 0.68, y: 0.68, z: 0, visibility: 0.9 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.85 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.85 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.8 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.8 };
  pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.8 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.8 };
  return pose;
}

function squatPose() {
  const pose = withCorePose();
  pose[23] = { ...pose[23]!, y: 0.8 };
  pose[24] = { ...pose[24]!, y: 0.8 };
  pose[25] = { ...pose[25]!, y: 0.73 };
  pose[26] = { ...pose[26]!, y: 0.73 };
  return pose;
}

function legRaisePose() {
  const pose = withCorePose();
  pose[25] = { ...pose[25]!, y: 0.54 };
  pose[27] = { ...pose[27]!, y: 0.67 };
  pose[29] = { ...pose[29]!, y: 0.69 };
  pose[31] = { ...pose[31]!, y: 0.69 };
  return pose;
}

function weakFeetPose() {
  const pose = withCorePose();
  [27, 28, 29, 30, 31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, visibility: 0.08 };
  });
  return pose;
}

function summarizeWithSegments(
  segments: Partial<Record<MovementTruthSkeletonSegment, number>>,
) {
  const sourceFrame = buildLiveMovementSourceFrame({
    capturedAt: 1000,
    poseLandmarks: withCorePose(),
  });
  const skeleton = buildMovementTruthSkeleton(sourceFrame);

  return summarizeMovementTruthSkeleton({
    ...skeleton,
    segmentConfidence: {
      ...skeleton.segmentConfidence,
      ...segments,
    },
  });
}

describe("movementTruthSkeleton", () => {
  it("builds inspectable source truth from a standing source frame", () => {
    const sourceFrame = buildLiveMovementSourceFrame({
      capturedAt: 1000,
      poseLandmarks: withCorePose(),
    });
    const skeleton = buildMovementTruthSkeleton(sourceFrame);

    expect(skeleton.sourceStatus).toBe("raw");
    expect(skeleton.centers.shoulder?.x).toBeCloseTo(0.5);
    expect(skeleton.centers.hip?.x).toBeCloseTo(0.5);
    expect(skeleton.bodyScale.shoulderWidth).toBeGreaterThan(0.2);
    expect(skeleton.bodyScale.torsoHeight).toBeGreaterThan(0.2);
    expect(skeleton.floorY).toBeCloseTo(0.97);
    expect(skeleton.segmentConfidence.leftThigh).toBeGreaterThan(0.8);
    expect(skeleton.segments.shoulders.start).toEqual(sourceFrame.landmarks.pose[11]);
    expect(skeleton.segments.shoulders.end).toEqual(sourceFrame.landmarks.pose[12]);
    expect(skeleton.segments.leftShin.start).toEqual(sourceFrame.landmarks.pose[25]);
    expect(skeleton.segments.leftShin.end).toEqual(sourceFrame.landmarks.pose[27]);
    expect(skeleton.segments.leftFoot.start).toEqual(sourceFrame.landmarks.pose[27]);
    expect(skeleton.segments.leftFoot.end?.x).toBeCloseTo(0.43);
    expect(skeleton.segments.leftFoot.confidence).toBe(skeleton.segmentConfidence.leftFoot);
    expect(skeleton.heldOrRejectedReasons).toEqual([]);

    expect(summarizeMovementTruthSkeleton(skeleton)).toMatchObject({
      state: "ready",
      weakestGroup: "feet",
    });
  });

  it("keeps broad lower-body source truth visible for squat and leg raise poses", () => {
    const squat = buildMovementTruthSkeleton(buildSyntheticMovementSourceFrame({
      capturedAt: 1000,
      poseLandmarks: squatPose(),
    }));
    const legRaise = buildMovementTruthSkeleton(buildSyntheticMovementSourceFrame({
      capturedAt: 1000,
      poseLandmarks: legRaisePose(),
    }));

    expect(squat.centers.hip?.y).toBeGreaterThan(0.75);
    expect(squat.segmentConfidence.leftShin).toBeGreaterThan(0.8);
    expect(legRaise.floorY).toBeCloseTo(0.97);
    expect(legRaise.segmentConfidence.leftShin).toBeGreaterThan(0.8);
  });

  it("preserves camera uncertainty reasons for weak-foot source frames", () => {
    const sourceFrame = buildLiveMovementSourceFrame({
      capturedAt: 1000,
      poseLandmarks: weakFeetPose(),
      requirements: { mode: "full-body" },
    });
    const skeleton = buildMovementTruthSkeleton(sourceFrame);

    expect(skeleton.bodyPartConfidence.leftFoot).toBeLessThan(0.35);
    expect(skeleton.segmentConfidence.leftFoot).toBeLessThan(0.2);
    expect(skeleton.segments.leftFoot.confidence).toBeLessThan(0.2);
    expect(summarizeMovementTruthSkeleton(skeleton)).toMatchObject({
      reasons: expect.arrayContaining(["feet-weak", "weak-feet"]),
      state: "blocked",
      weakestGroup: "feet",
    });
    expect(skeleton.heldOrRejectedReasons).toEqual(expect.arrayContaining([
      "feet-weak",
      "leftFoot-missing",
      "rightFoot-missing",
    ]));
  });

  it.each([
    [
      "torso",
      { shoulders: 0.18, hips: 0.22 },
      "Bring head, shoulders, and hips into view.",
    ],
    [
      "arms",
      {
        leftLowerArm: 0.14,
        leftUpperArm: 0.16,
        rightLowerArm: 0.18,
        rightUpperArm: 0.2,
      },
      "Keep hands and elbows in frame.",
    ],
    [
      "legs",
      {
        leftShin: 0.14,
        leftThigh: 0.18,
        rightShin: 0.16,
        rightThigh: 0.2,
      },
      "Keep hips, knees, and feet visible.",
    ],
    [
      "feet",
      { leftFoot: 0.12, rightFoot: 0.18 },
      "Step back until both feet are visible.",
    ],
  ] as const)("returns a %s recovery cue when that truth group is weakest", (
    group,
    segments,
    message,
  ) => {
    const summary = summarizeWithSegments(segments);

    expect(summary).toMatchObject({
      state: "blocked",
      weakestGroup: group,
    });
    expect(getMovementTruthSkeletonRecoveryCue(summary)).toEqual({
      group,
      message,
      state: "blocked",
    });
  });

  it("omits recovery cues when source truth is ready", () => {
    const summary = summarizeWithSegments({});

    expect(summary.state).toBe("ready");
    expect(getMovementTruthSkeletonRecoveryCue(summary)).toBeNull();
  });
});
