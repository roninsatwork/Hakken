import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import {
  getMovementCaptureFullBodyVisibility,
  shouldRecordMovementCaptureFrame,
} from "./useMovementCapture";

function makeLandmarks(visibility = 0): NormalizedLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility,
  }));
}

function setBodyVisibility(landmarks: NormalizedLandmark[], visibility: number) {
  [11, 12, 23, 24, 25, 26, 31, 32].forEach((index) => {
    landmarks[index] = {
      ...landmarks[index],
      visibility,
    };
  });
}

describe("movement capture quality", () => {
  it("scores full body visibility from shoulders, hips, knees, and feet", () => {
    const landmarks = makeLandmarks();
    setBodyVisibility(landmarks, 0.8);

    expect(getMovementCaptureFullBodyVisibility(landmarks)).toBeCloseTo(0.8);
  });

  it("records frames when enough body landmarks are visible", () => {
    const landmarks = makeLandmarks();
    setBodyVisibility(landmarks, 0.45);

    expect(shouldRecordMovementCaptureFrame(landmarks)).toBe(true);
  });

  it("records when feet are weak but hips and knees are usable", () => {
    const landmarks = makeLandmarks();
    [11, 12, 23, 24].forEach((index) => {
      landmarks[index] = {
        ...landmarks[index],
        visibility: 0.9,
      };
    });
    [25, 26].forEach((index) => {
      landmarks[index] = {
        ...landmarks[index],
        visibility: 0.35,
      };
    });
    [31, 32].forEach((index) => {
      landmarks[index] = {
        ...landmarks[index],
        visibility: 0.1,
      };
    });

    expect(shouldRecordMovementCaptureFrame(landmarks)).toBe(true);
  });

  it("does not record frames when only the upper body is visible", () => {
    const landmarks = makeLandmarks();
    [11, 12, 23, 24].forEach((index) => {
      landmarks[index] = {
        ...landmarks[index],
        visibility: 0.9,
      };
    });

    expect(getMovementCaptureFullBodyVisibility(landmarks)).toBeCloseTo(0.45);
    expect(shouldRecordMovementCaptureFrame(landmarks)).toBe(false);
  });
});
