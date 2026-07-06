import { describe, expect, it } from "vitest";
import { getMovementAvatarTrackingProfile } from "./movementAvatarProfiles";
import { resolveMovementAvatarFloorRuntime } from "./movementAvatarFloorRuntime";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildMovementCalibration } from "./movementTrackingCalibration";
import type { VrmSolverLandmark } from "./vrmRigging";

function buildSolverPose(overrides: Record<number, Partial<VrmSolverLandmark>> = {}): VrmSolverLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    x: index / 100,
    y: index / 80,
    z: 0,
    visibility: 0.9,
    ...overrides[index],
  }));
}

describe("movementAvatarFloorRuntime", () => {
  it("samples the lowest visible foot landmark and applies calibrated floor correction", () => {
    const calibration = buildMovementCalibration({
      poseLandmarks: makeMovementAvatarProofMotionPayload("standing").landmarks,
    });
    const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
    const decision = resolveMovementAvatarFloorRuntime({
      calibration,
      poseLandmarks: buildSolverPose({
        27: { y: 0.8, visibility: 0.2 },
        28: { y: 1.1, visibility: 0.5 },
        31: { y: 0.9, visibility: 0.4 },
        32: { y: 1.05, visibility: 0.95 },
      }),
      profile,
      shouldUseCalibratedFloorCorrection: true,
    });

    expect(decision.currentFloorY).toBe(1.1);
    expect(decision.floorConfidence).toBe(0.95);
    expect(decision.calibratedFloorCorrection).toBeCloseTo(0.224);
  });

  it("keeps floor correction disabled when hips options do not request it", () => {
    const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
    const decision = resolveMovementAvatarFloorRuntime({
      calibration: null,
      poseLandmarks: buildSolverPose({
        27: { y: 1.1, visibility: 0.9 },
      }),
      profile,
      shouldUseCalibratedFloorCorrection: false,
    });

    expect(decision.currentFloorY).toBeGreaterThan(1);
    expect(decision.calibratedFloorCorrection).toBe(0);
  });

  it("keeps calibrated floor correction at zero when foot confidence is too low", () => {
    const calibration = buildMovementCalibration({
      poseLandmarks: makeMovementAvatarProofMotionPayload("standing").landmarks,
    });
    const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
    const decision = resolveMovementAvatarFloorRuntime({
      calibration,
      poseLandmarks: buildSolverPose({
        27: { y: 1.1, visibility: 0.1 },
        28: { y: 1.1, visibility: 0.2 },
        31: { y: 1.1, visibility: 0.1 },
        32: { y: 1.1, visibility: 0.2 },
      }),
      profile,
      shouldUseCalibratedFloorCorrection: true,
    });

    expect(decision.floorConfidence).toBe(0.2);
    expect(decision.calibratedFloorCorrection).toBe(0);
  });
});
