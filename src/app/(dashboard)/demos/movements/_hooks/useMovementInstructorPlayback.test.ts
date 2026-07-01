import { describe, expect, it } from "vitest";
import {
  buildInstructorRetargetAnalysis,
  buildInstructorRetargetSourceModel,
} from "./useMovementInstructorPlayback";
import type { MovementInstructorMotionFrame } from "./useMovementInstructorPlayback";

const makePose = () =>
  Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.9,
  }));

function withCorePose() {
  const pose = makePose();
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.9 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.9 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.9 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.9 };
  pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.9 };
  pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.9 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.9 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.9 };
  return pose;
}

describe("buildInstructorRetargetSourceModel", () => {
  it("chooses the most neutral knee baseline instead of the first valid frame", () => {
    const crouchedPose = withCorePose();
    crouchedPose[25] = { ...crouchedPose[25]!, y: 0.68 };
    crouchedPose[26] = { ...crouchedPose[26]!, y: 0.68 };

    const uprightPose = withCorePose();
    const model = buildInstructorRetargetSourceModel([
      { landmarks: crouchedPose },
      { landmarks: uprightPose },
    ] satisfies MovementInstructorMotionFrame[]);

    expect(model).not.toBeNull();
    if (!model) throw new Error("Expected an instructor retarget source model.");

    expect(model.calibratedAt).toBe(1);
    expect(model.neutralKneeLift.left).toBe(0);
    expect(model.neutralKneeLift.right).toBe(0);
  });

  it("mirrors front-facing instructor frames before building the retarget baseline", () => {
    const pose = withCorePose();
    pose[23] = { ...pose[23]!, x: 0.58 };
    pose[24] = { ...pose[24]!, x: 0.42 };
    pose[25] = { ...pose[25]!, x: 0.56 };
    pose[26] = { ...pose[26]!, x: 0.44 };
    pose[27] = { ...pose[27]!, x: 0.55 };
    pose[28] = { ...pose[28]!, x: 0.45 };
    pose[31] = { ...pose[31]!, x: 0.54 };
    pose[32] = { ...pose[32]!, x: 0.46 };

    const model = buildInstructorRetargetSourceModel([
      { landmarks: pose },
    ] satisfies MovementInstructorMotionFrame[]);

    expect(model).not.toBeNull();
    expect(model?.segments.leftThigh?.direction.x).toBeLessThan(0);
    expect(model?.segments.rightThigh?.direction.x).toBeGreaterThan(0);
  });

  it("finds the strongest single-knee lift frame in a recording", () => {
    const uprightPose = withCorePose();
    const squatPose = withCorePose();
    squatPose[23] = { ...squatPose[23]!, y: 0.8 };
    squatPose[24] = { ...squatPose[24]!, y: 0.8 };
    squatPose[25] = { ...squatPose[25]!, y: 0.74 };
    squatPose[26] = { ...squatPose[26]!, y: 0.74 };

    const kneeLiftPose = withCorePose();
    kneeLiftPose[25] = { ...kneeLiftPose[25]!, y: 0.54 };
    kneeLiftPose[27] = { ...kneeLiftPose[27]!, y: 0.68 };
    kneeLiftPose[29] = { ...kneeLiftPose[29]!, y: 0.7 };
    kneeLiftPose[31] = { ...kneeLiftPose[31]!, y: 0.7 };

    const frames = [
      { landmarks: uprightPose },
      { landmarks: squatPose },
      { landmarks: kneeLiftPose },
    ] satisfies MovementInstructorMotionFrame[];
    const sourceModel = buildInstructorRetargetSourceModel(frames);
    const analysis = buildInstructorRetargetAnalysis(frames, sourceModel);

    expect(analysis.peakSquat?.frameIndex).toBe(1);
    expect(analysis.peakSquat?.balancedPlantedSquatDepth).toBeGreaterThan(0.5);
    expect(analysis.peakSingleKneeLift?.frameIndex).toBe(2);
    expect(analysis.peakSingleKneeLift?.balancedPlantedSquatDepth).toBe(0);
    expect(analysis.peakRightKneeLift?.rightKneeLift).toBeGreaterThan(0.6);
    expect(analysis.peakLeftKneeLift?.leftKneeLift).toBeLessThan(0.2);
  });

  it("drives planted full-body squat only on the recorded squat frame", () => {
    const uprightPose = withCorePose();
    const fullBodySquatPose = withCorePose();
    fullBodySquatPose[23] = { ...fullBodySquatPose[23]!, y: 0.82 };
    fullBodySquatPose[24] = { ...fullBodySquatPose[24]!, y: 0.82 };
    fullBodySquatPose[25] = { ...fullBodySquatPose[25]!, y: 0.74 };
    fullBodySquatPose[26] = { ...fullBodySquatPose[26]!, y: 0.74 };

    const leftKneeLiftPose = withCorePose();
    leftKneeLiftPose[25] = { ...leftKneeLiftPose[25]!, y: 0.54 };
    leftKneeLiftPose[27] = { ...leftKneeLiftPose[27]!, y: 0.68 };
    leftKneeLiftPose[29] = { ...leftKneeLiftPose[29]!, y: 0.7 };
    leftKneeLiftPose[31] = { ...leftKneeLiftPose[31]!, y: 0.7 };

    const rightKneeLiftPose = withCorePose();
    rightKneeLiftPose[26] = { ...rightKneeLiftPose[26]!, y: 0.54 };
    rightKneeLiftPose[28] = { ...rightKneeLiftPose[28]!, y: 0.68 };
    rightKneeLiftPose[30] = { ...rightKneeLiftPose[30]!, y: 0.7 };
    rightKneeLiftPose[32] = { ...rightKneeLiftPose[32]!, y: 0.7 };

    const frames = [
      { landmarks: uprightPose },
      { landmarks: fullBodySquatPose },
      { landmarks: leftKneeLiftPose },
      { landmarks: rightKneeLiftPose },
    ] satisfies MovementInstructorMotionFrame[];
    const sourceModel = buildInstructorRetargetSourceModel(frames);
    const analysis = buildInstructorRetargetAnalysis(frames, sourceModel);

    expect(analysis.peakSquat?.frameIndex).toBe(1);
    expect(analysis.peakSquat?.balancedPlantedSquatDepth).toBeGreaterThan(0.75);
    expect(analysis.peakSingleKneeLift?.frameIndex).not.toBe(1);
    expect(analysis.peakSingleKneeLift?.balancedPlantedSquatDepth).toBe(0);
    expect(analysis.peakLeftKneeLift?.balancedPlantedSquatDepth).toBe(0);
    expect(analysis.peakRightKneeLift?.balancedPlantedSquatDepth).toBe(0);
  });

  it("ignores weak startup frames when choosing peak squat", () => {
    const uprightPose = withCorePose();
    const weakStartupSquat = withCorePose();
    weakStartupSquat[23] = { ...weakStartupSquat[23]!, y: 0.88, visibility: 0.42 };
    weakStartupSquat[24] = { ...weakStartupSquat[24]!, y: 0.88, visibility: 0.42 };
    weakStartupSquat[25] = { ...weakStartupSquat[25]!, y: 0.84, visibility: 0.42 };
    weakStartupSquat[26] = { ...weakStartupSquat[26]!, y: 0.84, visibility: 0.42 };
    weakStartupSquat[27] = { ...weakStartupSquat[27]!, visibility: 0.42 };
    weakStartupSquat[28] = { ...weakStartupSquat[28]!, visibility: 0.42 };
    weakStartupSquat[31] = { ...weakStartupSquat[31]!, visibility: 0.42 };
    weakStartupSquat[32] = { ...weakStartupSquat[32]!, visibility: 0.42 };

    const validSquat = withCorePose();
    validSquat[23] = { ...validSquat[23]!, y: 0.8 };
    validSquat[24] = { ...validSquat[24]!, y: 0.8 };
    validSquat[25] = { ...validSquat[25]!, y: 0.74 };
    validSquat[26] = { ...validSquat[26]!, y: 0.74 };

    const frames = [
      { landmarks: uprightPose },
      { landmarks: weakStartupSquat },
      { landmarks: validSquat },
    ] satisfies MovementInstructorMotionFrame[];
    const sourceModel = buildInstructorRetargetSourceModel(frames);
    const analysis = buildInstructorRetargetAnalysis(frames, sourceModel);

    expect(analysis.peakSquat?.frameIndex).toBe(2);
    expect(analysis.peakSquat?.sourceQuality).toBeGreaterThan(0.7);
  });
});
