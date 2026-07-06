import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarFrameSetupRuntime,
} from "./movementAvatarFrameSetupRuntime";
import { createMovementAvatarSetupState } from "./movementAvatarSetup";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function landmark(x: number, y: number, visibility = 0.9): TrackingLandmark {
  return {
    x,
    y,
    z: 0,
    visibility,
  };
}

function buildStandingPose(): TrackingLandmark[] {
  const pose = Array.from({ length: 33 }, (_, index) => landmark(index / 100, 0.5));

  pose[11] = landmark(0.4, 0.2);
  pose[12] = landmark(0.6, 0.2);
  pose[23] = landmark(0.42, 0.5);
  pose[24] = landmark(0.58, 0.5);
  pose[25] = landmark(0.44, 0.75);
  pose[26] = landmark(0.56, 0.75);
  pose[27] = landmark(0.44, 1);
  pose[28] = landmark(0.56, 1);
  pose[31] = landmark(0.45, 1.03);
  pose[32] = landmark(0.55, 1.03);

  return pose;
}

const providedRetargetSourceModel = {
  calibratedAt: 5,
  floorY: 1,
  hipCenter: {
    x: 0.5,
    y: 0.5,
    z: 0,
  },
  neutralKneeLift: {
    left: 0,
    right: 0,
  },
  quality: 1,
  segments: {},
  shoulderCenter: {
    x: 0.5,
    y: 0.2,
    z: 0,
  },
  torsoHeight: 0.3,
} satisfies MovementRetargetSourceModel;

describe("movementAvatarFrameSetupRuntime", () => {
  it("resolves live setup state while preserving a provided retarget source model", () => {
    const decision = resolveMovementAvatarFrameSetupRuntime({
      currentRetargetSourceModel: null,
      isLivePlayer: true,
      manualCalibration: null,
      now: 100,
      poseLandmarks: buildStandingPose(),
      previousSetupState: createMovementAvatarSetupState(),
      providedRetargetSourceModel,
    });

    expect(decision.nextSetupState.autoCalibration.samples.length).toBeGreaterThan(0);
    expect(decision.nextRetargetSourceModel).toBe(providedRetargetSourceModel);
  });

  it("resets instructor setup while still allowing retarget fallback calibration", () => {
    const decision = resolveMovementAvatarFrameSetupRuntime({
      currentRetargetSourceModel: null,
      isLivePlayer: false,
      manualCalibration: null,
      now: 200,
      poseLandmarks: buildStandingPose(),
      previousSetupState: createMovementAvatarSetupState(),
      providedRetargetSourceModel: null,
    });

    expect(decision.activeCalibration).toBeNull();
    expect(decision.autoCalibrationKind).toBeNull();
    expect(decision.nextSetupState).toEqual(createMovementAvatarSetupState());
    expect(decision.nextRetargetSourceModel).toMatchObject({
      calibratedAt: 200,
      floorY: 1.03,
    });
  });
});
