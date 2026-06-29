import { describe, expect, test } from "vitest";
import {
  calculateAngle,
  calculateHandAperture,
  calculateLandmarkMotion,
  calculateMovementSync,
  isZenExpressionActive,
  updateMovementScore,
  type ScoreLandmark,
} from "./movementScoring";

function visible(x: number, y: number, z = 0): ScoreLandmark {
  return { x, y, z, visibility: 1 };
}

function makeLandmarks(offset = 0) {
  const landmarks = Array.from({ length: 33 }, (_, index) => visible(index + offset, index % 3, 0));

  landmarks[11] = visible(0, 0);
  landmarks[12] = visible(2, 0);
  landmarks[13] = visible(0, 1);
  landmarks[14] = visible(2, 1);
  landmarks[15] = visible(0, 2);
  landmarks[16] = visible(2, 2);
  landmarks[23] = visible(0, 3);
  landmarks[24] = visible(2, 3);
  landmarks[25] = visible(0, 4);
  landmarks[26] = visible(2, 4);
  landmarks[27] = visible(0, 5);
  landmarks[28] = visible(2, 5);
  landmarks[29] = visible(0, 6);
  landmarks[30] = visible(2, 6);
  landmarks[31] = visible(0, 7);
  landmarks[32] = visible(2, 7);

  return landmarks;
}

function makeHand(distance: number) {
  const landmarks = Array.from({ length: 21 }, () => visible(0, 0));
  landmarks[8] = visible(distance, 0);
  landmarks[12] = visible(0, distance);
  landmarks[16] = visible(-distance, 0);
  landmarks[20] = visible(0, -distance);
  return landmarks;
}

describe("movement scoring", () => {
  test("calculates an angle in degrees", () => {
    expect(calculateAngle(visible(1, 0), visible(0, 0), visible(0, 1))).toBeCloseTo(90);
  });

  test("ignores hidden landmarks", () => {
    expect(calculateAngle({ ...visible(1, 0), visibility: 0.1 }, visible(0, 0), visible(0, 1))).toBeNull();
  });

  test("returns perfect sync for matching mirrored body landmarks", () => {
    const landmarks = makeLandmarks();

    const result = calculateMovementSync({
      playerLandmarks: landmarks,
      instructorLandmarks: landmarks,
    });

    expect(result.sync).toBe(100);
    expect(result.validAngles).toBeGreaterThan(0);
  });

  test("reports no player motion for identical tracking frames", () => {
    const landmarks = makeLandmarks();

    expect(calculateLandmarkMotion(landmarks, landmarks.map((landmark) => ({ ...landmark })))).toBe(0);
  });

  test("reports player motion when tracked joints move", () => {
    const previous = makeLandmarks();
    const current = makeLandmarks();
    current[15] = { ...current[15]!, x: current[15]!.x + 0.08 };
    current[16] = { ...current[16]!, x: current[16]!.x - 0.08 };

    expect(calculateLandmarkMotion(previous, current)).toBeGreaterThan(0.01);
  });

  test("adds hand aperture bonus when both mirrored hands match", () => {
    const lowVisibilityLandmarks = makeLandmarks().map((landmark) => ({ ...landmark, visibility: 0.1 }));
    const result = calculateMovementSync({
      playerLandmarks: lowVisibilityLandmarks,
      instructorLandmarks: lowVisibilityLandmarks,
      playerHands: { left: { landmarks: makeHand(0.2) }, right: { landmarks: makeHand(0.2) } },
      instructorHands: { left: { landmarks: makeHand(0.2) }, right: { landmarks: makeHand(0.2) } },
    });

    expect(result.sync).toBe(5);
  });

  test("detects zen expression from smile blendshapes", () => {
    expect(isZenExpressionActive([
      { categoryName: "mouthSmileLeft", score: 0.6 },
      { categoryName: "mouthSmileRight", score: 0.5 },
    ])).toBe(true);
  });

  test("updates combo score and feedback thresholds", () => {
    const result = updateMovementScore({ sync: 100, combo: 14, score: 100, isZenActive: false });

    expect(result.combo).toBe(15);
    expect(result.score).toBe(120);
    expect(result.feedbackText).toBe("PERFECT ALIGNMENT");
  });

  test("breaks combo below sync floor", () => {
    const result = updateMovementScore({ sync: 40, combo: 20, score: 100, isZenActive: false });

    expect(result.combo).toBe(0);
    expect(result.score).toBe(100);
    expect(result.shouldClearFeedback).toBe(true);
  });

  test("adds zen frame score and feedback", () => {
    const result = updateMovementScore({ sync: 100, combo: 44, score: 0, isZenActive: true });

    expect(result.combo).toBe(45);
    expect(result.score).toBe(55);
    expect(result.feedbackText).toBe("ZEN BONUS ACTIVE");
  });

  test("calculates hand aperture", () => {
    expect(calculateHandAperture(makeHand(0.25))).toBeCloseTo(0.25);
  });
});
