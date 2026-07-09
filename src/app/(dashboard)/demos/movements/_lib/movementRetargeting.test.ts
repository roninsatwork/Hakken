import { describe, expect, it } from "vitest";
import {
  averageMovementRetargetSourceModels,
  buildMovementRetargetSourceModel,
  getBalancedPlantedSquatDepth,
  getRecordedLowerBodySegmentMotionDepth,
  getRecordedSquatPresentationDepth,
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

function shiftLowerBodyVertically(pose: TrackingLandmark[], amount: number) {
  [23, 24, 25, 26, 27, 28, 29, 30, 31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, y: pose[index]!.y + amount };
  });
}

function scalePoseInFrame(
  pose: TrackingLandmark[],
  scale: number,
  origin = { x: 0.5, y: 0.28, z: 0 },
) {
  return pose.map((landmark) => ({
    ...landmark,
    x: origin.x + (landmark.x - origin.x) * scale,
    y: origin.y + (landmark.y - origin.y) * scale,
    z: origin.z + ((landmark.z ?? 0) - origin.z) * scale,
  }));
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

  it("averages neutral source models for calibration-stable lower-body retargeting", () => {
    const first = buildMovementRetargetSourceModel({
      now: 100,
      poseLandmarks: withCorePose(),
    });
    const secondPose = withCorePose();
    secondPose[23] = { ...secondPose[23]!, y: 0.69 };
    secondPose[24] = { ...secondPose[24]!, y: 0.69 };
    const second = buildMovementRetargetSourceModel({
      now: 200,
      poseLandmarks: secondPose,
    });

    const averaged = averageMovementRetargetSourceModels([first!, second!]);

    expect(averaged).toMatchObject({
      calibratedAt: 200,
      quality: expect.any(Number),
    });
    expect(averaged?.hipCenter.y).toBeCloseTo(0.685);
    expect(averaged?.segments.leftThigh?.direction.y).toBeGreaterThan(0.9);
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
    expect(getBalancedPlantedSquatDepth(frame)).toBe(frame.squatDepth);
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

  it("keeps standing neutral when the whole lower body shifts down in camera frame", () => {
    const calibration = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const shiftedStandingPose = withCorePose();
    shiftLowerBodyVertically(shiftedStandingPose, 0.09);

    const frame = solveMovementRetargetFrame({
      calibration,
      poseLandmarks: shiftedStandingPose,
    });

    expect(frame.hipDrop).toBe(0);
    expect(frame.squatDepth).toBe(0);
    expect(getBalancedPlantedSquatDepth(frame)).toBe(0);
  });

  it("keeps standing neutral when the user steps farther back in camera frame", () => {
    const calibrationPose = withCorePose();
    const calibration = buildMovementRetargetSourceModel({ poseLandmarks: calibrationPose });
    const farStandingPose = scalePoseInFrame(calibrationPose, 0.68);

    const frame = solveMovementRetargetFrame({
      calibration,
      poseLandmarks: farStandingPose,
    });

    expect(frame.hipDrop).toBeLessThan(0.05);
    expect(frame.kneeLift.left).toBe(0);
    expect(frame.kneeLift.right).toBe(0);
    expect(frame.squatDepth).toBe(0);
    expect(getBalancedPlantedSquatDepth(frame)).toBe(0);
  });

  it("still solves a smaller-in-frame planted squat after distance normalization", () => {
    const calibration = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const squatPose = withCorePose();
    squatPose[23] = { ...squatPose[23]!, y: 0.8 };
    squatPose[24] = { ...squatPose[24]!, y: 0.8 };
    squatPose[25] = { ...squatPose[25]!, y: 0.73 };
    squatPose[26] = { ...squatPose[26]!, y: 0.73 };
    const farSquatPose = scalePoseInFrame(squatPose, 0.68);

    const frame = solveMovementRetargetFrame({
      calibration,
      poseLandmarks: farSquatPose,
    });

    expect(frame.squatDepth).toBeGreaterThan(0.55);
    expect(frame.contacts.leftFoot).toBe(true);
    expect(frame.contacts.rightFoot).toBe(true);
    expect(getBalancedPlantedSquatDepth(frame)).toBe(frame.squatDepth);
  });

  it("does not report squat metrics from invisible lower-body landmarks", () => {
    const calibration = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const closeCroppedPose = withCorePose();
    [23, 24, 25, 26, 27, 28, 29, 30, 31, 32].forEach((index) => {
      closeCroppedPose[index] = {
        ...closeCroppedPose[index]!,
        y: closeCroppedPose[index]!.y + 1.4,
        visibility: 0.01,
      };
    });

    const frame = solveMovementRetargetFrame({
      calibration,
      poseLandmarks: closeCroppedPose,
    });

    expect(frame.debug.sourceQuality).toBeLessThan(0.35);
    expect(frame.hipDrop).toBe(0);
    expect(frame.squatDepth).toBe(0);
    expect(frame.contacts.leftFoot).toBe(false);
    expect(frame.contacts.rightFoot).toBe(false);
    expect(frame.debug.solvedSegments).not.toContain("leftThigh");
    expect(frame.debug.solvedSegments).not.toContain("rightThigh");
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
    expect(getBalancedPlantedSquatDepth(frame)).toBe(0);
  });

  it("does not apply planted squat presentation to uneven knee movement", () => {
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
    const unevenFrame = {
      ...frame,
      kneeLift: {
        left: 0.62,
        right: 0.08,
      },
    };

    expect(frame.contacts.leftFoot).toBe(true);
    expect(frame.contacts.rightFoot).toBe(true);
    expect(frame.squatDepth).toBeGreaterThan(0.5);
    expect(getBalancedPlantedSquatDepth(unevenFrame)).toBe(0);
  });

  it("keeps recorded squat presentation when feet are weak but hip and knees stay squatted", () => {
    const calibration = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const weakFeetSquatPose = withCorePose();
    weakFeetSquatPose[23] = { ...weakFeetSquatPose[23]!, y: 0.8 };
    weakFeetSquatPose[24] = { ...weakFeetSquatPose[24]!, y: 0.8 };
    weakFeetSquatPose[25] = { ...weakFeetSquatPose[25]!, y: 0.73 };
    weakFeetSquatPose[26] = { ...weakFeetSquatPose[26]!, y: 0.73 };
    [27, 28, 29, 30, 31, 32].forEach((index) => {
      weakFeetSquatPose[index] = { ...weakFeetSquatPose[index]!, visibility: 0.13 };
    });

    const frame = solveMovementRetargetFrame({
      calibration,
      poseLandmarks: weakFeetSquatPose,
    });

    expect(frame.contacts.leftFoot).toBe(false);
    expect(frame.contacts.rightFoot).toBe(false);
    expect(frame.squatDepth).toBeGreaterThan(0.55);
    expect(getBalancedPlantedSquatDepth(frame)).toBe(0);
    expect(getRecordedSquatPresentationDepth(frame)).toBeGreaterThan(0.55);
  });

  it("detects recorded side-leg motion even when squat and knee-lift signals stay neutral", () => {
    const calibration = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const sideLegPose = withCorePose();
    sideLegPose[26] = { ...sideLegPose[26]!, x: 0.72, y: 0.78 };
    sideLegPose[28] = { ...sideLegPose[28]!, x: 0.86, y: 0.9 };
    sideLegPose[30] = { ...sideLegPose[30]!, x: 0.88, y: 0.91 };
    sideLegPose[32] = { ...sideLegPose[32]!, x: 0.9, y: 0.92 };

    const frame = solveMovementRetargetFrame({
      calibration,
      poseLandmarks: sideLegPose,
    });

    expect(frame.squatDepth).toBe(0);
    expect(frame.kneeLift.left).toBe(0);
    expect(frame.kneeLift.right).toBe(0);
    expect(getRecordedLowerBodySegmentMotionDepth({ calibration, frame })).toBeGreaterThan(0.3);
  });

  describe("world-landmark segment solving", () => {
    // Metric hip-centred world pose matching withCorePose() proportions, standing upright.
    const makeWorldPose = (): TrackingLandmark[] => {
      const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.9 }));
      const set = (index: number, x: number, y: number, z = 0) => {
        world[index] = { x, y, z, visibility: 0.9 };
      };
      set(0, 0, -0.62);
      set(7, -0.09, -0.58);
      set(8, 0.09, -0.58);
      set(11, -0.18, -0.46);
      set(12, 0.18, -0.46);
      set(13, -0.24, -0.2);
      set(14, 0.24, -0.2);
      set(15, -0.27, 0.02);
      set(16, 0.27, 0.02);
      set(23, -0.09, 0);
      set(24, 0.09, 0);
      set(25, -0.1, 0.42);
      set(26, 0.1, 0.42);
      set(27, -0.1, 0.82);
      set(28, 0.1, 0.82);
      set(29, -0.11, 0.86, 0.03);
      set(30, 0.11, 0.86, 0.03);
      set(31, -0.1, 0.88, -0.08);
      set(32, 0.1, 0.88, -0.08);
      return world;
    };

    it("solves segment directions from world landmarks with real depth", () => {
      const calibration = buildMovementRetargetSourceModel({
        poseLandmarks: withCorePose(),
        worldPoseLandmarks: makeWorldPose(),
      });
      expect(calibration?.space).toBe("world");

      // Raise the right shin forward: knee stays, ankle moves toward the camera.
      const worldPose = makeWorldPose();
      worldPose[28] = { x: 0.1, y: 0.5, z: -0.35, visibility: 0.9 };

      const frame = solveMovementRetargetFrame({
        calibration,
        poseLandmarks: withCorePose(),
        worldPoseLandmarks: worldPose,
      });

      expect(frame.space).toBe("world");
      const shin = frame.segments.rightShin;
      expect(shin).toBeDefined();
      // The forward (negative z) component must dominate — image-space solving would flatten it.
      expect(Math.abs(shin!.direction.z)).toBeGreaterThan(0.6);
    });

    it("falls back to image segments when a frame lacks world landmarks", () => {
      const calibration = buildMovementRetargetSourceModel({
        poseLandmarks: withCorePose(),
        worldPoseLandmarks: makeWorldPose(),
      });

      const frame = solveMovementRetargetFrame({
        calibration,
        poseLandmarks: withCorePose(),
      });

      expect(frame.space).toBe("image");
      // Cross-space direction comparison must not report phantom motion.
      expect(getRecordedLowerBodySegmentMotionDepth({ calibration, frame })).toBe(0);
    });

    it("keeps image space when calibration was built without world landmarks", () => {
      const calibration = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
      expect(calibration?.space).toBe("image");

      const frame = solveMovementRetargetFrame({
        calibration,
        poseLandmarks: withCorePose(),
        worldPoseLandmarks: makeWorldPose(),
      });

      expect(frame.space).toBe("image");
    });
  });
});
