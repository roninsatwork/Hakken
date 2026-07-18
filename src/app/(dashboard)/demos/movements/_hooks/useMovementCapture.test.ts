import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import {
  getMovementCaptureFullBodyVisibility,
  resolveMovementCaptureStartReadiness,
  shouldRecordMovementCaptureFrame,
  shouldRetainMovementCaptureFrame,
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

  it("retains weak or occluded frames after recording has started", () => {
    const upperBodyOnly = makeLandmarks();
    [11, 12, 23, 24].forEach((index) => {
      upperBodyOnly[index] = {
        ...upperBodyOnly[index],
        visibility: 0.9,
      };
    });

    expect(shouldRecordMovementCaptureFrame(upperBodyOnly)).toBe(false);
    expect(shouldRetainMovementCaptureFrame({
      isRecording: true,
      landmarks: upperBodyOnly,
    })).toBe(true);
    expect(shouldRetainMovementCaptureFrame({
      isRecording: false,
      landmarks: upperBodyOnly,
    })).toBe(false);
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

    expect(resolveMovementCaptureStartReadiness({
      capturedAt: 1,
      landmarks: ready,
      worldLandmarks: ready,
    }).canStartRecording).toBe(true);
    const blocked = resolveMovementCaptureStartReadiness({
      capturedAt: 1,
      landmarks: weakFeet,
      worldLandmarks: [],
    });
    expect(blocked.canStartRecording).toBe(false);
    expect(blocked.promptEvents).toContain("show-your-feet");
  });

  it("starts evidence acquisition when distal visibility is weak but image/world pose structure is complete", () => {
    const pose = makeLandmarks(0.05);
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 23, 24].forEach((index) => {
      pose[index] = {
        ...pose[index],
        visibility: 0.9,
      };
    });
    const worldPose = makeLandmarks(0.05).map((landmark, index) => ({
      ...landmark,
      x: index * 0.01,
      y: index * 0.02,
      z: index * -0.01,
    }));

    const recovered = resolveMovementCaptureStartReadiness({
      capturedAt: 1,
      landmarks: pose,
      worldLandmarks: worldPose,
    });

    expect(pose.filter((landmark) => (landmark.visibility ?? 0) >= 0.2)).toHaveLength(13);
    expect(recovered.canStartRecording).toBe(true);
    expect(recovered.canStartGame).toBe(false);
    expect(recovered.state).toBe("blocked");
    expect(recovered.blockedReasons).toEqual(expect.arrayContaining([
      "leftArm-missing",
      "rightArm-missing",
      "leftLeg-missing",
      "rightLeg-missing",
      "leftFoot-missing",
      "rightFoot-missing",
      "camera-uncertain",
    ]));
  });

  it("does not recover recording readiness from incomplete or invented pose evidence", () => {
    const pose = makeLandmarks(0.05);
    [0, 7, 8, 11, 12, 23, 24].forEach((index) => {
      pose[index] = { ...pose[index], visibility: 0.9 };
    });
    const completeWorldPose = makeLandmarks(0.9);

    expect(resolveMovementCaptureStartReadiness({
      capturedAt: 1,
      landmarks: pose,
      worldLandmarks: [],
    }).canStartRecording).toBe(false);

    const invalidPose = pose.map((landmark) => ({ ...landmark }));
    invalidPose[31] = { ...invalidPose[31], x: Number.NaN };
    expect(resolveMovementCaptureStartReadiness({
      capturedAt: 1,
      landmarks: invalidPose,
      worldLandmarks: completeWorldPose,
    }).canStartRecording).toBe(false);
  });
});
