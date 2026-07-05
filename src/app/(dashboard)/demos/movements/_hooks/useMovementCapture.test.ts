import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import {
  getMovementCaptureFullBodyVisibility,
  resolveMovementCaptureStartReadiness,
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

  it("uses shared full-body start readiness before capture begins", () => {
    const ready = makeLandmarks();
    setBodyVisibility(ready, 0.8);
    [0, 7, 8, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28].forEach((index) => {
      ready[index] = {
        ...ready[index],
        visibility: 0.8,
      };
    });

    const weakFeet = makeLandmarks();
    [0, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26].forEach((index) => {
      weakFeet[index] = {
        ...weakFeet[index],
        visibility: 0.8,
      };
    });
    [27, 28, 29, 30, 31, 32].forEach((index) => {
      weakFeet[index] = {
        ...weakFeet[index],
        visibility: 0.08,
      };
    });

    expect(resolveMovementCaptureStartReadiness(ready).canStartRecording).toBe(true);
    const blocked = resolveMovementCaptureStartReadiness(weakFeet);
    expect(blocked.canStartRecording).toBe(false);
    expect(blocked.promptEvents).toContain("show-your-feet");
  });
});
