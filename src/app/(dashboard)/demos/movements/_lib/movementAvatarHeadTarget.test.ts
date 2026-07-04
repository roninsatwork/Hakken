import { describe, expect, it } from "vitest";
import { resolveMovementAvatarHeadTarget } from "./movementAvatarHeadTarget";
import type {
  MovementCalibration,
  MovementHeadMotionIntent,
  TrackingLandmark,
} from "./movementTrackingCalibration";

const neutralHeadIntent: MovementHeadMotionIntent = {
  confidence: 0.9,
  depth: 0,
  label: "neutral",
  lateral: 0,
  vertical: 0,
};

const neutralCalibration: MovementCalibration = {
  calibratedAt: 1,
  floorY: 0.96,
  headCenter: { x: 0.5, y: 0.28, z: 0 },
  headNeutral: {
    confidence: 0.95,
    pitch: 0,
    roll: 0,
    source: "face",
    yaw: 0,
  },
  hipCenter: { x: 0.5, y: 0.66, z: 0 },
  quality: 0.95,
  shoulderCenter: { x: 0.5, y: 0.42, z: 0 },
  shoulderWidth: 0.22,
  torsoHeight: 0.24,
};

function withCorePose() {
  const pose = Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.9,
  })) satisfies TrackingLandmark[];
  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.9 };
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility: 0.9 };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility: 0.9 };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  return pose;
}

describe("movement avatar head target", () => {
  it("keeps head world yaw relative to the supplied avatar root yaw", () => {
    const target = resolveMovementAvatarHeadTarget({
      avatarRole: "instructor",
      avatarRootYaw: Math.PI / 2,
      calibration: null,
      headMotionIntent: neutralHeadIntent,
      poseLandmarks: withCorePose(),
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    });

    expect(target.headWorldYaw).toBeCloseTo(Math.PI / 2 + target.headDecision.headYaw, 5);
    expect(target.rawHeadDecision.rawHead.source).not.toBe("none");
  });

  it("keeps live player vertical head offset in the shared target decision", () => {
    const target = resolveMovementAvatarHeadTarget({
      avatarRole: "player",
      avatarRootYaw: Math.PI,
      calibration: neutralCalibration,
      headMotionIntent: {
        ...neutralHeadIntent,
        vertical: 0.7,
      },
      poseLandmarks: withCorePose(),
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    });

    expect(target.headDecision.shouldApplyPlayerHeadMotion).toBe(true);
    expect(target.applicationPose.headPositionOffset?.y).toBeLessThan(0);
    expect(target.applyOptions.headSlerp).toBeGreaterThan(0);
  });

  it("does not apply live-only head position offsets to recorded instructor targets", () => {
    const target = resolveMovementAvatarHeadTarget({
      avatarRole: "instructor",
      avatarRootYaw: Math.PI,
      calibration: null,
      headMotionIntent: {
        ...neutralHeadIntent,
        vertical: 0.7,
      },
      poseLandmarks: withCorePose(),
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    });

    expect(target.headDecision.shouldApplyPlayerHeadMotion).toBe(false);
    expect(target.applicationPose.headPositionOffset).toBeNull();
  });
});
