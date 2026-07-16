import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarPlayerSpineDrive,
  resolveMovementAvatarRecordedSpineDrive,
} from "./movementAvatarPlayerDrive";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import {
  buildMovementCalibration,
  buildUpperBodyMovementAutoCalibration,
} from "./movementTrackingCalibration";
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

function makeCloseCroppedPose() {
  const pose = makeNeutralPose();
  [23, 24, 25, 26, 27, 28, 29, 30, 31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, visibility: 0.01 };
  });
  return pose;
}

function makeOppositePose(source: MovementLandmark[]) {
  const opposite = source.map((landmark) => ({ ...landmark, x: 1 - landmark.x }));
  for (const [left, right] of [[7, 8], [11, 12], [23, 24], [25, 26], [27, 28], [31, 32]]) {
    opposite[left] = { ...source[right]!, x: 1 - source[right]!.x };
    opposite[right] = { ...source[left]!, x: 1 - source[left]!.x };
  }
  return opposite;
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

  it("turns side-bend evidence into visible chest and spine rotation with level hips", () => {
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
    expect(drive.rotations.hips.z).toBe(0);
    expect(drive.rotations.chest.z).toBeGreaterThan(0);
    expect(Math.abs(drive.rotations.spine.z)).toBeGreaterThan(0.5);
    expect(Math.abs(drive.rotations.chest.z)).toBeGreaterThan(0.7);
    expect(Math.abs(drive.rotations.upperChest.z)).toBeGreaterThan(0.6);
  });

  it("reverses only lateral spine axes for opposite anatomical mapping", () => {
    const neutralPose = makeNeutralPose();
    const calibration = buildMovementCalibration({ poseLandmarks: neutralPose });
    const sideBendPose = makeNeutralPose();
    sideBendPose[0] = visible(0.66, 0.25);
    sideBendPose[7] = visible(0.62, 0.27);
    sideBendPose[8] = visible(0.7, 0.27);
    sideBendPose[11] = visible(0.54, 0.42);
    sideBendPose[12] = visible(0.76, 0.42);

    const identity = resolveMovementAvatarPlayerSpineDrive({
      anatomicalMapping: "identity",
      calibration,
      isPlayer: true,
      poseLandmarks: sideBendPose,
      torsoTrackingReady: true,
    });
    const opposite = resolveMovementAvatarPlayerSpineDrive({
      anatomicalMapping: "opposite",
      calibration,
      isPlayer: true,
      poseLandmarks: sideBendPose,
      torsoTrackingReady: true,
    });

    expect(opposite.sideBend).toBeCloseTo(-identity.sideBend);
    expect(opposite.twist).toBeCloseTo(-identity.twist);
    expect(opposite.forwardLean).toBeCloseTo(identity.forwardLean);
    expect(opposite.rotations.chest.x).toBeCloseTo(identity.rotations.chest.x);
    expect(opposite.rotations.chest.y).toBeCloseTo(-identity.rotations.chest.y);
    expect(opposite.rotations.chest.z).toBeCloseTo(-identity.rotations.chest.z);
  });

  it("gives instructor and opposite-player full-body spine paths the same final rotations", () => {
    const neutralPose = makeNeutralPose();
    const instructorCalibration = buildMovementRetargetSourceModel({ poseLandmarks: neutralPose })!;
    const instructorPose = makeNeutralPose();
    instructorPose[0] = visible(0.61, 0.28, 0.03);
    instructorPose[11] = visible(0.47, 0.43, -0.04);
    instructorPose[12] = visible(0.73, 0.4, 0.05);
    instructorPose[23] = visible(0.45, 0.67, -0.01);
    instructorPose[24] = visible(0.59, 0.65, 0.02);
    const playerPose = makeOppositePose(instructorPose);
    const playerCalibration = {
      ...instructorCalibration,
      hipCenter: { ...instructorCalibration.hipCenter, x: 1 - instructorCalibration.hipCenter.x },
      shoulderCenter: {
        ...instructorCalibration.shoulderCenter,
        x: 1 - instructorCalibration.shoulderCenter.x,
      },
    };

    const instructor = resolveMovementAvatarRecordedSpineDrive({
      kneeLift: { left: 0.08, right: 0 },
      poseLandmarks: instructorPose,
      retargetCalibration: instructorCalibration,
      torsoTrackingReady: true,
    });
    const player = resolveMovementAvatarPlayerSpineDrive({
      anatomicalMapping: "opposite",
      calibration: buildMovementCalibration({ poseLandmarks: playerPose }),
      isPlayer: true,
      kneeLift: { left: 0, right: 0.08 },
      poseLandmarks: playerPose,
      retargetCalibration: playerCalibration,
      torsoTrackingReady: true,
    });

    expect(player.owner).toBe("player-spine-model");
    expect(instructor.owner).toBe("recorded-spine-model");
    expect(player.forwardLean).toBeCloseTo(instructor.forwardLean, 5);
    expect(player.sideBend).toBeCloseTo(instructor.sideBend, 5);
    expect(player.twist).toBeCloseTo(instructor.twist, 5);
    for (const bone of ["hips", "spine", "chest", "upperChest"] as const) {
      expect(player.rotations[bone].x).toBeCloseTo(instructor.rotations[bone].x, 5);
      expect(player.rotations[bone].y).toBeCloseTo(instructor.rotations[bone].y, 5);
      expect(player.rotations[bone].z).toBeCloseTo(instructor.rotations[bone].z, 5);
    }
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

  it("holds side-bend motion until calibration is available", () => {
    const sideBendPose = makeNeutralPose();
    sideBendPose[0] = visible(0.66, 0.25);
    sideBendPose[7] = visible(0.62, 0.27);
    sideBendPose[8] = visible(0.7, 0.27);
    sideBendPose[11] = visible(0.54, 0.42);
    sideBendPose[12] = visible(0.76, 0.42);

    const drive = resolveMovementAvatarPlayerSpineDrive({
      calibration: null,
      isPlayer: true,
      poseLandmarks: sideBendPose,
      torsoTrackingReady: true,
    });

    expect(drive.shouldApplySpine).toBe(false);
    expect(drive.owner).toBe("player-spine-held");
    expect(drive.sideBend).toBe(0);
    expect(drive.rotations.hips.z).toBe(0);
    expect(drive.rotations.spine.z).toBe(0);
  });

  it("uses head and shoulders for close-cropped player spine motion when hips are unreliable", () => {
    const neutralPose = makeCloseCroppedPose();
    const calibration = buildUpperBodyMovementAutoCalibration({ poseLandmarks: neutralPose });
    const sideBendPose = makeCloseCroppedPose();
    sideBendPose[0] = visible(0.65, 0.25);
    sideBendPose[7] = visible(0.61, 0.27);
    sideBendPose[8] = visible(0.69, 0.27);
    sideBendPose[11] = visible(0.53, 0.42);
    sideBendPose[12] = visible(0.75, 0.42);

    const drive = resolveMovementAvatarPlayerSpineDrive({
      calibration,
      isPlayer: true,
      poseLandmarks: sideBendPose,
      torsoTrackingReady: true,
    });

    expect(drive.shouldApplySpine).toBe(true);
    expect(drive.owner).toBe("player-upper-body-model");
    expect(drive.sideBend).toBeGreaterThan(0.35);
    expect(drive.rotations.chest.z).toBeGreaterThan(0);
    expect(Math.abs(drive.rotations.chest.z)).toBeGreaterThan(0.14);
  });

  it("turns recorded replay side-bend evidence into spine rotation", () => {
    const neutralPose = makeNeutralPose();
    const retargetCalibration = buildMovementRetargetSourceModel({ poseLandmarks: neutralPose });
    const sideBendPose = makeNeutralPose();
    sideBendPose[0] = visible(0.66, 0.25);
    sideBendPose[7] = visible(0.62, 0.27);
    sideBendPose[8] = visible(0.7, 0.27);
    sideBendPose[11] = visible(0.54, 0.42);
    sideBendPose[12] = visible(0.76, 0.42);
    sideBendPose[23] = visible(0.43, 0.66);
    sideBendPose[24] = visible(0.57, 0.66);

    const drive = resolveMovementAvatarRecordedSpineDrive({
      poseLandmarks: sideBendPose,
      retargetCalibration,
      torsoTrackingReady: true,
    });

    expect(drive.shouldApplySpine).toBe(true);
    expect(drive.owner).toBe("recorded-spine-model");
    expect(drive.sideBend).toBeGreaterThan(0.5);
    expect(drive.rotations.chest.z).toBeGreaterThan(0.95);
    expect(drive.rotations.chest.z).toBeLessThan(1.02);
  });

  it("uses metric world torso direction when image depth has the opposite hinge sign", () => {
    const neutralPose = makeNeutralPose();
    const neutralWorldPose = makeNeutralPose();
    [23, 24].forEach((index) => {
      neutralWorldPose[index] = visible(neutralWorldPose[index]!.x, 0, 0);
    });
    [11, 12].forEach((index) => {
      neutralWorldPose[index] = visible(neutralWorldPose[index]!.x, -0.4, 0);
    });
    const retargetCalibration = buildMovementRetargetSourceModel({
      poseLandmarks: neutralPose,
      worldPoseLandmarks: neutralWorldPose,
    });
    const hingedImagePose = makeNeutralPose();
    const hingedWorldPose = structuredClone(neutralWorldPose);
    [11, 12].forEach((index) => {
      hingedImagePose[index] = { ...hingedImagePose[index]!, z: -0.2 };
      hingedWorldPose[index] = { ...hingedWorldPose[index]!, z: -0.2 };
    });

    const drive = resolveMovementAvatarRecordedSpineDrive({
      poseLandmarks: hingedImagePose,
      retargetCalibration,
      torsoTrackingReady: true,
      worldPoseLandmarks: hingedWorldPose,
    });

    expect(drive.forwardLean).toBeGreaterThan(0.4);
    expect(drive.rotations.chest.x).toBeLessThan(0);
  });

  it("keeps modest recorded replay side-bend visible without overdriving it", () => {
    const neutralPose = makeNeutralPose();
    const retargetCalibration = buildMovementRetargetSourceModel({ poseLandmarks: neutralPose });
    const sideBendPose = makeNeutralPose();
    sideBendPose[11] = visible(0.36, 0.42);
    sideBendPose[12] = visible(0.58, 0.42);

    const drive = resolveMovementAvatarRecordedSpineDrive({
      poseLandmarks: sideBendPose,
      retargetCalibration,
      torsoTrackingReady: true,
    });

    expect(drive.shouldApplySpine).toBe(true);
    expect(drive.owner).toBe("recorded-spine-model");
    expect(drive.sideBend).toBeLessThan(-0.15);
    expect(Math.abs(drive.rotations.chest.z)).toBeGreaterThan(0.15);
    expect(Math.abs(drive.rotations.chest.z)).toBeLessThan(0.33);
  });

  it("caps large recorded replay side-bend so leg-heavy frames do not overfold the torso", () => {
    const neutralPose = makeNeutralPose();
    const retargetCalibration = buildMovementRetargetSourceModel({ poseLandmarks: neutralPose });
    const sideBendPose = makeNeutralPose();
    sideBendPose[11] = visible(0.34, 0.42);
    sideBendPose[12] = visible(0.56, 0.42);

    const drive = resolveMovementAvatarRecordedSpineDrive({
      kneeLift: { left: 0.16, right: 0 },
      poseLandmarks: sideBendPose,
      retargetCalibration,
      torsoTrackingReady: true,
    });

    expect(drive.shouldApplySpine).toBe(true);
    expect(drive.owner).toBe("recorded-spine-model");
    expect(drive.sideBend).toBeLessThan(-0.25);
    expect(drive.sideBend).toBeGreaterThan(-0.4);
    expect(Math.abs(drive.rotations.chest.z)).toBeGreaterThan(0.1);
    expect(Math.abs(drive.rotations.chest.z)).toBeLessThan(0.13);
  });

});
