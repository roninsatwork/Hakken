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
    headDrop: 0.26,
    hipDrop: 0.28,
    kneeBend: 0.58,
    torsoDrop: 0.24,
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
      retargetHipDrop: 0,
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
    expect(drive.visualRootDrop).toBeGreaterThan(0.9);
    expect(drive.visualRootDrop).toBeLessThan(1.1);
  });

  it("uses continuous source hip drop for a planted retargeted player squat", () => {
    const drive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: true,
      isPlayer: true,
      lowerBodyIntent: liveSquatIntent,
      lowerBodyTrackingReady: true,
      retargetContactsBothFeet: true,
      retargetHipDrop: 0.13,
      retargetSquatDepth: 0.68,
    });

    expect(drive.shouldDrivePlayerSquat).toBe(true);
    expect(drive.groundedSquatDepth).toBeCloseTo(0.68);
    expect(drive.playerSquatPresentationDepth).toBeCloseTo(0.13);
    expect(drive.visualRootDrop).toBeCloseTo(0.0728);
  });

  it("does not drive a player squat from knee noise without body-drop evidence", () => {
    const drive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: true,
      isPlayer: true,
      lowerBodyIntent: {
        ...liveSquatIntent,
        squatSignals: {
          headDrop: 0.04,
          hipDrop: 0.03,
          kneeBend: 0.58,
          torsoDrop: 0.05,
        },
      },
      lowerBodyTrackingReady: true,
      retargetContactsBothFeet: true,
      retargetHipDrop: 0.07,
      retargetSquatDepth: 0,
    });

    expect(drive.shouldDrivePlayerSquat).toBe(false);
    expect(drive.shouldApplyLowerBody).toBe(true);
    expect(drive.playerLowerBodyState).toBe("neutral");
    expect(drive.playerSquatPresentationDepth).toBe(0);
    expect(drive.visualRootDrop).toBe(0);
  });

  it("keeps the player neutral when visible lower-body intent is neutral", () => {
    const drive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: false,
      isPlayer: true,
      lowerBodyIntent: neutralIntent,
      lowerBodyTrackingReady: true,
      retargetContactsBothFeet: false,
      retargetHipDrop: 0,
      retargetSquatDepth: 0,
    });

    expect(drive.shouldDrivePlayerSquat).toBe(false);
    expect(drive.shouldDrivePlayerLegRaise).toBe(false);
    expect(drive.shouldApplyLowerBody).toBe(false);
    expect(drive.playerLowerBodyState).toBe("held");
    expect(drive.playerSquatPresentationDepth).toBe(0);
    expect(drive.visualRootDrop).toBe(0);
  });

  it("does not bounce the player root from static planted-foot retarget noise", () => {
    const drive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: true,
      isPlayer: true,
      lowerBodyIntent: neutralIntent,
      lowerBodyTrackingReady: true,
      retargetContactsBothFeet: true,
      retargetHipDrop: 0.14,
      retargetSquatDepth: 0.11,
    });

    expect(drive.shouldDrivePlayerSquat).toBe(false);
    expect(drive.shouldApplyLowerBody).toBe(true);
    expect(drive.playerLowerBodyState).toBe("neutral");
    expect(drive.liveSquatDepth).toBeCloseTo(0.11);
    expect(drive.groundedSquatDepth).toBeCloseTo(0.11);
    expect(drive.playerSquatPresentationDepth).toBe(0);
    expect(drive.visualRootDrop).toBe(0);
  });

  it("does not drive a squat from borderline recovery intent without planted retarget evidence", () => {
    const drive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: true,
      isPlayer: true,
      lowerBodyIntent: {
        ...liveSquatIntent,
        squatDepth: 0.26,
        squatSignals: {
          headDrop: 0.34,
          hipDrop: 0.11,
          kneeBend: 0.04,
          torsoDrop: 0.36,
        },
      },
      lowerBodyTrackingReady: true,
      retargetContactsBothFeet: true,
      retargetHipDrop: 0.11,
      retargetSquatDepth: 0,
    });

    expect(drive.shouldDrivePlayerSquat).toBe(false);
    expect(drive.shouldApplyLowerBody).toBe(true);
    expect(drive.playerLowerBodyState).toBe("neutral");
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
      retargetHipDrop: 0,
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
      retargetHipDrop: 0.42,
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
