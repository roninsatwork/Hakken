import { describe, expect, it } from "vitest";
import {
  buildMovementRetargetSourceModel,
  solveMovementRetargetFrame,
} from "./movementRetargeting";
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

describe("movementRetargeting", () => {
  it("builds a neutral source body model from an upright full-body frame", () => {
    const calibration = buildMovementRetargetSourceModel({
      now: 1234,
      poseLandmarks: withCorePose(),
    });

    expect(calibration).toMatchObject({
      calibratedAt: 1234,
      floorY: 0.97,
      quality: expect.any(Number),
    });
    expect(calibration?.quality).toBeGreaterThan(0.8);
    expect(calibration?.segments.leftThigh?.length).toBeGreaterThan(0);
    expect(calibration?.segments.rightShin?.confidence).toBeGreaterThan(0.7);
  });

  it("rejects a crouched frame as a neutral source body model", () => {
    const pose = withCorePose();
    pose[23] = { ...pose[23]!, y: 0.88 };
    pose[24] = { ...pose[24]!, y: 0.88 };
    pose[25] = { ...pose[25]!, y: 0.94 };
    pose[26] = { ...pose[26]!, y: 0.94 };

    expect(buildMovementRetargetSourceModel({ poseLandmarks: pose })).toBeNull();
  });

  it("solves normalized squat depth without releasing foot contacts", () => {
    const calibration = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const squatPose = withCorePose();
    squatPose[23] = { ...squatPose[23]!, y: 0.8 };
    squatPose[24] = { ...squatPose[24]!, y: 0.8 };
    squatPose[25] = { ...squatPose[25]!, y: 0.73 };
    squatPose[26] = { ...squatPose[26]!, y: 0.73 };

    const frame = solveMovementRetargetFrame({
      calibration,
      poseLandmarks: squatPose,
    });

    expect(frame.squatDepth).toBeGreaterThan(0.55);
    expect(frame.contacts.leftFoot).toBe(true);
    expect(frame.contacts.rightFoot).toBe(true);
    expect(frame.debug.solvedSegments).toContain("leftThigh");
  });

  it("does not turn mild hip drift into a committed squat", () => {
    const calibration = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const mildDriftPose = withCorePose();
    mildDriftPose[23] = { ...mildDriftPose[23]!, y: 0.73 };
    mildDriftPose[24] = { ...mildDriftPose[24]!, y: 0.73 };

    const frame = solveMovementRetargetFrame({
      calibration,
      poseLandmarks: mildDriftPose,
    });

    expect(frame.hipDrop).toBeGreaterThan(0.2);
    expect(frame.squatDepth).toBeLessThan(0.3);
  });

  it("solves a single-knee lift and releases that foot contact", () => {
    const calibration = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const kneeLiftPose = withCorePose();
    kneeLiftPose[25] = { ...kneeLiftPose[25]!, y: 0.54 };
    kneeLiftPose[27] = { ...kneeLiftPose[27]!, y: 0.67 };
    kneeLiftPose[29] = { ...kneeLiftPose[29]!, y: 0.69 };
    kneeLiftPose[31] = { ...kneeLiftPose[31]!, y: 0.69 };

    const frame = solveMovementRetargetFrame({
      calibration,
      poseLandmarks: kneeLiftPose,
    });

    expect(frame.kneeLift.left).toBeGreaterThan(0.6);
    expect(frame.kneeLift.right).toBe(0);
    expect(frame.contacts.leftFoot).toBe(false);
    expect(frame.contacts.rightFoot).toBe(true);
    expect(frame.squatDepth).toBe(0);
  });
});
