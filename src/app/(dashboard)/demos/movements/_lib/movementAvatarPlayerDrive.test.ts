import { describe, expect, it } from "vitest";
import { resolveMovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import { buildMovementCalibration } from "./movementTrackingCalibration";
import type { MovementLandmark } from "./movementTypes";

function visible(x: number, y: number, z = 0, visibility = 0.9): MovementLandmark {
  return { x, y, z, visibility };
}

function makeNeutralPose(visibility = 0.9) {
  const pose = Array.from({ length: 33 }, () => visible(0.5, 0.5, 0, visibility));
  pose[0] = visible(0.5, 0.25, 0, visibility);
  pose[7] = visible(0.46, 0.27, 0, visibility);
  pose[8] = visible(0.54, 0.27, 0, visibility);
  pose[11] = visible(0.39, 0.42, 0, visibility);
  pose[12] = visible(0.61, 0.42, 0, visibility);
  pose[23] = visible(0.43, 0.66, 0, visibility);
  pose[24] = visible(0.57, 0.66, 0, visibility);
  pose[25] = visible(0.43, 0.82, 0, visibility);
  pose[26] = visible(0.57, 0.82, 0, visibility);
  pose[27] = visible(0.43, 0.95, 0, visibility);
  pose[28] = visible(0.57, 0.95, 0, visibility);
  pose[31] = visible(0.42, 0.97, 0, visibility);
  pose[32] = visible(0.58, 0.97, 0, visibility);
  return pose;
}

describe("movement avatar player drive", () => {
  it("keeps player spine ownership active so neutral can return cleanly", () => {
    const neutralPose = makeNeutralPose();
    const calibration = buildMovementCalibration({ poseLandmarks: neutralPose });

    const drive = resolveMovementAvatarPlayerSpineDrive({
      calibration,
      isPlayer: true,
      poseLandmarks: neutralPose,
      torsoTrackingReady: true,
    });

    expect(drive.shouldApplySpine).toBe(true);
    expect(drive.owner).toBe("player-spine-neutral");
    expect(Math.abs(drive.rotations.chest.z)).toBeLessThan(0.001);
  });

  it("turns side-bend evidence into visible chest and spine rotation", () => {
    const neutralPose = makeNeutralPose();
    const calibration = buildMovementCalibration({ poseLandmarks: neutralPose });
    const sideBendPose = makeNeutralPose();
    sideBendPose[0] = visible(0.66, 0.25);
    sideBendPose[7] = visible(0.62, 0.27);
    sideBendPose[8] = visible(0.7, 0.27);
    sideBendPose[11] = visible(0.54, 0.42);
    sideBendPose[12] = visible(0.76, 0.42);

    const drive = resolveMovementAvatarPlayerSpineDrive({
      calibration,
      isPlayer: true,
      poseLandmarks: sideBendPose,
      torsoTrackingReady: true,
    });

    expect(drive.shouldApplySpine).toBe(true);
    expect(drive.owner).toBe("player-spine-model");
    expect(drive.sideBend).toBeGreaterThan(0.5);
    expect(Math.abs(drive.rotations.chest.z)).toBeGreaterThan(0.15);
    expect(Math.abs(drive.rotations.upperChest.z)).toBeGreaterThan(0.1);
  });

  it("holds player spine when calibration is missing", () => {
    const drive = resolveMovementAvatarPlayerSpineDrive({
      calibration: null,
      isPlayer: true,
      poseLandmarks: makeNeutralPose(),
      torsoTrackingReady: true,
    });

    expect(drive.shouldApplySpine).toBe(false);
    expect(drive.owner).toBe("player-spine-held");
  });
});
