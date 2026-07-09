import { describe, expect, it } from "vitest";
import { resolveMovementAvatarHipsFrameRuntime } from "./movementAvatarHipsFrameRuntime";
import { getMovementAvatarTrackingProfile } from "./movementAvatarProfiles";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
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

function lowerBodyDrive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
  return {
    groundedSquatDepth: 0,
    liveSquatDepth: 0,
    playerLegRaiseDepth: 0,
    playerLegRaiseSide: null,
    playerLowerBodyState: "neutral",
    playerSquatPresentationDepth: 0,
    shouldApplyLowerBody: true,
    shouldApplySolverTorso: true,
    shouldDrivePlayerLegRaise: false,
    shouldDrivePlayerSquat: false,
    visualRootDrop: 0,
    ...overrides,
  };
}

describe("movementAvatarHipsFrameRuntime", () => {
  it("resolves player squat hips and calibrated floor correction together", () => {
    const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
    const runtime = resolveMovementAvatarHipsFrameRuntime({
      avatarRole: "player",
      calibration: buildMovementCalibration({
        poseLandmarks: makeMovementAvatarProofMotionPayload("standing").landmarks,
      }),
      lowerBodyDrive: lowerBodyDrive({
        shouldDrivePlayerSquat: true,
      }),
      lowerBodyTrackingReady: true,
      playerSquatPresentationDepth: 0.5,
      poseLandmarks: buildSolverPose({
        27: { y: 0.8, visibility: 0.2 },
        28: { y: 1.1, visibility: 0.5 },
        31: { y: 0.9, visibility: 0.4 },
        32: { y: 1.05, visibility: 0.95 },
      }),
      profile,
      rigMeasurements: null,
      shouldApplyLowerBody: true,
    });

    expect(runtime.hipsPositionOptions.shouldUseCalibratedFloorCorrection).toBe(true);
    expect(runtime.floorRuntime.calibratedFloorCorrection).toBeCloseTo(0.224);
    expect(runtime.hipsApplication.shouldApplySquatDrop).toBe(true);
    expect(runtime.hipsApplication.squatDrop).toBeCloseTo(0.39);
  });

  it("keeps instructor floor correction disabled while still resolving hips options", () => {
    const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
    const runtime = resolveMovementAvatarHipsFrameRuntime({
      avatarRole: "instructor",
      calibration: null,
      lowerBodyDrive: lowerBodyDrive(),
      lowerBodyTrackingReady: true,
      playerSquatPresentationDepth: 0.5,
      poseLandmarks: buildSolverPose({
        27: { y: 1.1, visibility: 0.9 },
      }),
      profile,
      rigMeasurements: null,
      shouldApplyLowerBody: true,
    });

    expect(runtime.hipsPositionOptions.shouldUseCalibratedFloorCorrection).toBe(false);
    expect(runtime.floorRuntime.calibratedFloorCorrection).toBe(0);
    expect(runtime.hipsApplication.shouldApplyFloorContactCorrection).toBe(true);
  });
});
