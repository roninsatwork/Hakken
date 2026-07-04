import { describe, expect, it } from "vitest";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import {
  buildLiveMovementSourceFrame,
  buildSyntheticMovementSourceFrame,
} from "./movementSourceFrame";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import { resolveMovementMotionFrame } from "./movementMotionFrame";

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
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility: 0.9 };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility: 0.9 };
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

describe("movementMotionFrame", () => {
  it("resolves a motion frame from a source frame through the current avatar pipeline", () => {
    const neutral = withCorePose();
    const active = squatPose();
    const sourceFrame = buildLiveMovementSourceFrame({
      capturedAt: 1000,
      poseLandmarks: active,
    });
    const motionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "same-side",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame,
    });

    expect(motionFrame.source).toBe(sourceFrame);
    expect(motionFrame.mirrorMode).toBe("same-side");
    expect(motionFrame.displayLandmarks.pose).toBe(active);
    expect(motionFrame.truthSkeleton.sourceStatus).toBe("raw");
    expect(motionFrame.truthSkeleton.centers.hip?.x).toBeCloseTo(0.5);
    expect(motionFrame.avatarDecision.lowerBodyIntent.label).toBe("squat");
    expect(motionFrame.avatarDecision.bodyConfidence.torso).toBeGreaterThan(0.8);
  });

  it("keeps source truth separate from display-adapted landmarks", () => {
    const sourcePose = withCorePose();
    const displayPose = sourcePose.map((landmark) => ({
      ...landmark,
      x: 1 - landmark.x,
    }));
    const sourceFrame = buildSyntheticMovementSourceFrame({
      capturedAt: 2000,
      poseLandmarks: sourcePose,
    });
    const motionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: sourcePose }),
      displayPoseLandmarks: displayPose,
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: sourcePose }),
      sourceFrame,
    });

    expect(motionFrame.source.landmarks.pose).toBe(sourcePose);
    expect(motionFrame.displayLandmarks.pose).toBe(displayPose);
    expect(motionFrame.mirrorMode).toBe("facing-player");
  });
});
