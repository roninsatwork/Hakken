import { describe, expect, it } from "vitest";
import {
  isMovementAvatarLowerBodyTrackingReady,
  resolveMovementAvatarLowerBodyDrive,
} from "./movementAvatarLowerBody";
import type { MovementLowerBodyIntent } from "./movementTrackingCalibration";

const neutralIntent: MovementLowerBodyIntent = {
  confidence: 0.9,
  label: "neutral",
  leftKneeRaise: 0,
  rightKneeRaise: 0,
  squatDepth: 0,
  squatSignals: {
    headDrop: 0,
    hipDrop: 0,
    kneeBend: 0,
    torsoDrop: 0,
  },
};

const liveSquatIntent: MovementLowerBodyIntent = {
  confidence: 0.82,
  label: "squat",
  leftKneeRaise: 0.48,
  rightKneeRaise: 0.5,
  squatDepth: 0.58,
  squatSignals: {
    headDrop: 0,
    hipDrop: 0,
    kneeBend: 0.58,
    torsoDrop: 0,
  },
};

const leftLegRaiseIntent: MovementLowerBodyIntent = {
  confidence: 0.86,
  label: "left-knee-raise",
  leftKneeRaise: 0.72,
  rightKneeRaise: 0.04,
  squatDepth: 0,
  squatSignals: {
    headDrop: 0,
    hipDrop: 0,
    kneeBend: 0,
    torsoDrop: 0,
  },
};

describe("movement avatar lower-body drive", () => {
  it("keeps lower-body tracking ready for far-camera squat evidence", () => {
    expect(
      isMovementAvatarLowerBodyTrackingReady({
        bodyConfidence: {
          hips: 0.4,
          leftKnee: 0.4,
          rightKnee: 0.4,
          leftFoot: 0.32,
          rightFoot: 0.31,
        },
        isPlayer: true,
        lowerBodyIntent: {
          ...liveSquatIntent,
          confidence: 0.4,
        },
      }),
    ).toBe(true);
  });

  it("does not unlock lower-body tracking for weak neutral far-camera frames", () => {
    expect(
      isMovementAvatarLowerBodyTrackingReady({
        bodyConfidence: {
          hips: 0.4,
          leftKnee: 0.4,
          rightKnee: 0.4,
          leftFoot: 0.32,
          rightFoot: 0.31,
        },
        isPlayer: true,
        lowerBodyIntent: neutralIntent,
      }),
    ).toBe(false);
  });

  it("keeps lower-body tracking ready for far-camera single-leg evidence", () => {
    expect(
      isMovementAvatarLowerBodyTrackingReady({
        bodyConfidence: {
          hips: 0.4,
          leftKnee: 0.4,
          rightKnee: 0.4,
          leftFoot: 0.3,
          rightFoot: 0.31,
        },
        isPlayer: true,
        lowerBodyIntent: {
          ...leftLegRaiseIntent,
          confidence: 0.4,
        },
      }),
    ).toBe(true);
  });

  it("drives a player squat from live knee evidence without calibration or foot contact", () => {
    const drive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: false,
      isPlayer: true,
      lowerBodyIntent: liveSquatIntent,
      lowerBodyTrackingReady: true,
      retargetContactsBothFeet: false,
      retargetSquatDepth: 0,
    });

    expect(drive.shouldDrivePlayerSquat).toBe(true);
    expect(drive.shouldDrivePlayerLegRaise).toBe(false);
    expect(drive.shouldApplyLowerBody).toBe(true);
    expect(drive.shouldApplySolverTorso).toBe(true);
    expect(drive.playerLowerBodyState).toBe("planted-squat");
    expect(drive.liveSquatDepth).toBeCloseTo(0.58);
    expect(drive.groundedSquatDepth).toBe(0);
    expect(drive.playerSquatPresentationDepth).toBeCloseTo(0.58);
    expect(drive.visualRootDrop).toBeGreaterThan(0.6);
  });

  it("keeps the player neutral when visible lower-body intent is neutral", () => {
    const drive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: false,
      isPlayer: true,
      lowerBodyIntent: neutralIntent,
      lowerBodyTrackingReady: true,
      retargetContactsBothFeet: false,
      retargetSquatDepth: 0,
    });

    expect(drive.shouldDrivePlayerSquat).toBe(false);
    expect(drive.shouldDrivePlayerLegRaise).toBe(false);
    expect(drive.shouldApplyLowerBody).toBe(false);
    expect(drive.playerLowerBodyState).toBe("held");
    expect(drive.playerSquatPresentationDepth).toBe(0);
    expect(drive.visualRootDrop).toBe(0);
  });

  it("drives a single player leg raise without adding squat root drop", () => {
    const drive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: true,
      isPlayer: true,
      lowerBodyIntent: leftLegRaiseIntent,
      lowerBodyTrackingReady: true,
      retargetContactsBothFeet: false,
      retargetSquatDepth: 0,
    });

    expect(drive.shouldDrivePlayerSquat).toBe(false);
    expect(drive.shouldDrivePlayerLegRaise).toBe(true);
    expect(drive.playerLegRaiseSide).toBe("left");
    expect(drive.playerLegRaiseDepth).toBeCloseTo(0.72);
    expect(drive.playerLowerBodyState).toBe("left-leg-raise");
    expect(drive.playerSquatPresentationDepth).toBe(0);
    expect(drive.visualRootDrop).toBe(0);
  });

  it("uses recorded retarget depth for non-player avatars with both feet planted", () => {
    const drive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: true,
      isPlayer: false,
      lowerBodyIntent: neutralIntent,
      lowerBodyTrackingReady: true,
      retargetContactsBothFeet: true,
      retargetSquatDepth: 0.42,
    });

    expect(drive.shouldDrivePlayerSquat).toBe(false);
    expect(drive.shouldDrivePlayerLegRaise).toBe(false);
    expect(drive.shouldApplyLowerBody).toBe(true);
    expect(drive.groundedSquatDepth).toBeCloseTo(0.42);
    expect(drive.playerSquatPresentationDepth).toBeCloseTo(0.42);
    expect(drive.visualRootDrop).toBeGreaterThan(0.23);
  });
});
