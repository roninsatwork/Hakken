import { describe, expect, it } from "vitest";
import {
  applyHeadCalibration,
  averageMovementCalibrations,
  buildMovementCalibration,
  estimateMovementHeadAngles,
  getCalibratedFloorCorrection,
  getMovementBodyConfidence,
  getMovementTrackingHealthWarnings,
  getMovementTrackingHealthSummary,
  getNeutralMovementHeadAngles,
  selectMovementKneeTarget,
  selectMovementTrackingEndpoint,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

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
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.85 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.85 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.8 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.8 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.8 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.8 };
  return pose;
}

describe("movementTrackingCalibration", () => {
  it("prefers face landmarks for head angles when they are available", () => {
    const face = Array.from({ length: 264 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    face[1] = { x: 0.54, y: 0.48, z: 0 };
    face[33] = { x: 0.4, y: 0.45, z: 0 };
    face[263] = { x: 0.6, y: 0.45, z: 0 };

    const angles = estimateMovementHeadAngles({ poseLandmarks: withCorePose(), faceLandmarks: face });

    expect(angles.source).toBe("face");
    expect(angles.yaw).toBeGreaterThan(0);
  });

  it("builds a calibration sample from high-quality body landmarks", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose(), now: 1234 });

    expect(calibration).toMatchObject({
      calibratedAt: 1234,
      quality: expect.any(Number),
      shoulderWidth: expect.any(Number),
      torsoHeight: expect.any(Number),
      floorY: 0.97,
    });
    expect(calibration?.quality).toBeGreaterThan(0.8);
  });

  it("rejects calibration when core tracking confidence is too low", () => {
    const pose = withCorePose().map((landmark) => ({ ...landmark, visibility: 0.1 }));

    expect(buildMovementCalibration({ poseLandmarks: pose })).toBeNull();
  });

  it("averages calibration samples and neutralizes head pitch", () => {
    const first = buildMovementCalibration({ poseLandmarks: withCorePose(), now: 1 });
    const second = buildMovementCalibration({ poseLandmarks: withCorePose(), now: 2 });
    const calibration = averageMovementCalibrations([first, second].filter(Boolean) as NonNullable<typeof first>[]);

    expect(calibration?.calibratedAt).toBe(2);

    const applied = applyHeadCalibration({
      rawHead: {
        pitch: calibration?.headNeutral.pitch ?? 0,
        yaw: calibration?.headNeutral.yaw ?? 0,
        roll: calibration?.headNeutral.roll ?? 0,
        confidence: 0.9,
        source: "pose",
      },
      calibration,
    });

    expect(applied.pitch).toBeCloseTo(0);
    expect(applied.yaw).toBeCloseTo(0);
    expect(applied.roll).toBeCloseTo(0);
  });

  it("builds a neutral camera-facing head pose from avatar profile offsets", () => {
    const neutral = getNeutralMovementHeadAngles({
      headPitchOffset: 2,
      headYawOffset: -2,
      headRollOffset: 0.2,
      minHeadPitch: -0.4,
      maxHeadPitch: 0.8,
      maxHeadYaw: 1.1,
      maxHeadRoll: 0.7,
      headSlerp: 0.8,
      neckPitchShare: 0.2,
      neckYawShare: 0.2,
      neckRollShare: 0.2,
      neckSlerp: 0.3,
      upperArmSlerp: 0.7,
      lowerArmSlerp: 0.8,
      legSlerp: 0.6,
      footSlerp: 0.5,
      armStoreVisibility: 0.3,
      legStoreVisibility: 0.4,
      armVisibility: 0.1,
      legVisibility: 0.1,
      footVisibility: 0.1,
      floorCorrectionScale: 1,
      floorCorrectionLimit: 0.2,
    });

    expect(neutral).toEqual({
      pitch: 0.8,
      yaw: -1.1,
      roll: 0.2,
      confidence: 1,
      source: "none",
    });
  });

  it("reports body-part confidence for limbs and hands", () => {
    const confidence = getMovementBodyConfidence(withCorePose(), {
      left: { landmarks: [{ x: 0.3, y: 0.4, visibility: 0.7 }] },
      right: { landmarks: [{ x: 0.7, y: 0.4, visibility: 0.6 }] },
    });

    expect(confidence.leftHand).toBe(0.7);
    expect(confidence.rightHand).toBe(0.6);
    expect(confidence.torso).toBeGreaterThan(0.8);
  });

  it("prefers a secondary hand target when pose wrist confidence is weak", () => {
    const selection = selectMovementTrackingEndpoint({
      poseTarget: { x: 0.4, y: 0.4, visibility: 0.25 },
      secondaryTarget: { x: 0.45, y: 0.42, visibility: 0.9 },
    });

    expect(selection).toMatchObject({
      source: "hand",
      confidence: 0.9,
      target: { x: 0.45, y: 0.42 },
    });
  });

  it("uses pose target when pose confidence is strong", () => {
    const selection = selectMovementTrackingEndpoint({
      poseTarget: { x: 0.4, y: 0.4, visibility: 0.85 },
      secondaryTarget: { x: 0.45, y: 0.42, visibility: 0.9 },
    });

    expect(selection.source).toBe("pose");
    expect(selection.target).toMatchObject({ x: 0.4, y: 0.4 });
  });

  it("reports last-good when no live target is trustworthy", () => {
    const selection = selectMovementTrackingEndpoint({
      poseTarget: { x: 0.4, y: 0.4, visibility: 0.05 },
      secondaryTarget: { x: 0.45, y: 0.42, visibility: 0.04 },
    });

    expect(selection).toMatchObject({
      source: "last-good",
      target: null,
    });
  });

  it("returns a bounded floor correction from calibration drift", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });

    expect(getCalibratedFloorCorrection({
      calibration,
      currentFloorY: 1.1,
      floorConfidence: 0.9,
    })).toBeCloseTo(0.208);
    expect(getCalibratedFloorCorrection({
      calibration,
      currentFloorY: 1.4,
      floorConfidence: 0.9,
    })).toBe(0.35);
    expect(getCalibratedFloorCorrection({
      calibration,
      currentFloorY: 1.1,
      floorConfidence: 0.1,
    })).toBe(0);
  });

  it("uses avatar profile floor scale and limit for floor correction", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });

    expect(getCalibratedFloorCorrection({
      calibration,
      currentFloorY: 1.2,
      floorConfidence: 0.9,
      profile: {
        headPitchOffset: 0,
        headYawOffset: 0,
        headRollOffset: 0,
        minHeadPitch: -0.4,
        maxHeadPitch: 0.8,
        maxHeadYaw: 1,
        maxHeadRoll: 1,
        headSlerp: 0.8,
        neckPitchShare: 0.2,
        neckYawShare: 0.2,
        neckRollShare: 0.2,
        neckSlerp: 0.3,
        upperArmSlerp: 0.7,
        lowerArmSlerp: 0.8,
        legSlerp: 0.6,
        footSlerp: 0.5,
        armStoreVisibility: 0.3,
        legStoreVisibility: 0.4,
        armVisibility: 0.1,
        legVisibility: 0.1,
        footVisibility: 0.1,
        floorCorrectionScale: 3,
        floorCorrectionLimit: 0.2,
      },
    })).toBe(0.2);
  });

  it("uses a strong live knee target when the knee bends plausibly", () => {
    const selection = selectMovementKneeTarget({
      hip: { x: -0.2, y: 0.1, visibility: 0.9 },
      knee: { x: -0.28, y: 0.4, visibility: 0.8 },
      ankle: { x: -0.18, y: 0.8, visibility: 0.9 },
      side: "left",
    });

    expect(selection.source).toBe("pose");
    expect(selection.target).toMatchObject({ x: -0.28 });
  });

  it("corrects a knee that collapses inward across the hip-to-ankle line", () => {
    const selection = selectMovementKneeTarget({
      hip: { x: -0.2, y: 0.1, visibility: 0.9 },
      knee: { x: -0.1, y: 0.4, visibility: 0.8 },
      ankle: { x: -0.18, y: 0.8, visibility: 0.9 },
      side: "left",
      minBend: 0.04,
    });

    expect(selection.source).toBe("synthetic");
    expect(selection.target?.x).toBeCloseTo(-0.23);
  });

  it("synthesizes a knee when hip and ankle are good but the knee is weak", () => {
    const selection = selectMovementKneeTarget({
      hip: { x: 0.2, y: 0.1, visibility: 0.9 },
      knee: { x: 0.2, y: 0.4, visibility: 0.05 },
      ankle: { x: 0.18, y: 0.8, visibility: 0.8 },
      side: "right",
      minBend: 0.04,
    });

    expect(selection.source).toBe("synthetic");
    expect(selection.target).toMatchObject({
      x: 0.23,
      y: 0.45,
    });
  });

  it("falls back to last-good when a knee chain is not trustworthy", () => {
    const selection = selectMovementKneeTarget({
      hip: { x: 0.2, y: 0.1, visibility: 0.1 },
      knee: { x: 0.2, y: 0.4, visibility: 0.05 },
      ankle: null,
      side: "right",
    });

    expect(selection.source).toBe("last-good");
    expect(selection.target).toBeNull();
  });

  it("summarizes weak tracking signals for manual tuning", () => {
    const warnings = getMovementTrackingHealthWarnings({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.5, source: "pose" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.5, source: "pose" },
      bodyConfidence: {
        torso: 0.4,
        leftWrist: 0.2,
        leftHand: 0.1,
        rightWrist: 0.8,
        rightHand: 0.8,
        leftFoot: 0.2,
        rightFoot: 0.9,
      },
      fallbacks: {
        leftKnee: "synthetic",
        rightKnee: "pose",
        head: "pose",
      },
      calibrationQuality: 0.8,
    });

    expect(warnings).toEqual([
      "Head is using pose tracking",
      "Torso confidence is low",
      "Left arm endpoint is weak",
      "Left foot confidence is low",
      "Knee guard is correcting pose",
    ]);
  });

  it("reports healthy tracking when confidence and sources look good", () => {
    const warnings = getMovementTrackingHealthWarnings({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.8,
        leftHand: 0.8,
        rightWrist: 0.8,
        rightHand: 0.8,
        leftFoot: 0.8,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(warnings).toEqual(["Tracking health looks good"]);
  });

  it("scores ready tracking when calibrated whole-body confidence is strong", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.95, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.95, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.85,
        leftHand: 0.8,
        rightWrist: 0.84,
        rightHand: 0.8,
        leftKnee: 0.88,
        rightKnee: 0.86,
        leftFoot: 0.82,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(summary).toMatchObject({
      level: "ready",
      label: "Ready",
      primaryAction: "Tracking ready",
      warnings: ["Tracking health looks good"],
    });
    expect(summary.score).toBeGreaterThanOrEqual(80);
  });

  it("scores weak tracking as needing attention for manual tuning", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.5, source: "pose" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.5, source: "pose" },
      bodyConfidence: {
        torso: 0.45,
        leftWrist: 0.2,
        leftHand: 0.2,
        rightWrist: 0.3,
        rightHand: 0.25,
        leftKnee: 0.25,
        rightKnee: 0.2,
        leftFoot: 0.25,
        rightFoot: 0.3,
      },
      fallbacks: {
        leftKnee: "synthetic",
        rightKnee: "last-good",
        head: "pose",
      },
      calibrationQuality: 0.8,
    });

    expect(summary.level).toBe("needs-attention");
    expect(summary.label).toBe("Needs attention");
    expect(summary.score).toBeLessThan(62);
    expect(summary.primaryAction).toBe("Tune face/head tracking");
    expect(summary.warnings).toContain("Head is using pose tracking");
    expect(summary.warnings).toContain("Right arm endpoint is weak");
  });

  it("prioritizes missing calibration before limb tuning", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.8,
        leftHand: 0.8,
        rightWrist: 0.2,
        rightHand: 0.2,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.8,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
    });

    expect(summary.primaryAction).toBe("Run calibration");
    expect(summary.warnings).toContain("Calibration is missing");
    expect(summary.warnings).toContain("Right arm endpoint is weak");
  });

  it("prioritizes weak calibration when live tracking is otherwise healthy", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.8,
        leftHand: 0.8,
        rightWrist: 0.8,
        rightHand: 0.8,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.8,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.4,
    });

    expect(summary.primaryAction).toBe("Recalibrate neutral stance");
    expect(summary.warnings).toContain("Calibration quality is low");
  });

  it("flags stale tracking data and caps readiness even when the last frame looked good", () => {
    const summary = getMovementTrackingHealthSummary(
      {
        updatedAt: 1000,
        headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.95, source: "face" },
        headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.95, source: "face" },
        bodyConfidence: {
          torso: 0.95,
          leftWrist: 0.95,
          leftHand: 0.95,
          rightWrist: 0.95,
          rightHand: 0.95,
          leftKnee: 0.95,
          rightKnee: 0.95,
          leftFoot: 0.95,
          rightFoot: 0.95,
        },
        fallbacks: {
          leftKnee: "pose",
          rightKnee: "pose",
          head: "face",
        },
        calibrationQuality: 0.95,
      },
      { now: 2501, staleAfterMs: 1200 },
    );

    expect(summary.level).toBe("needs-attention");
    expect(summary.score).toBe(50);
    expect(summary.primaryAction).toBe("Restart camera tracking");
    expect(summary.warnings).toContain("Tracking data is stale");
  });

  it("prioritizes right arm tuning when the head and torso are healthy", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.8,
        leftHand: 0.8,
        rightWrist: 0.2,
        rightHand: 0.2,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.8,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(summary.primaryAction).toBe("Tune right arm endpoint");
    expect(summary.warnings).toContain("Right arm endpoint is weak");
  });

  it("prioritizes right arm balance when it trails the left without being fully lost", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.9,
        leftHand: 0.88,
        rightWrist: 0.52,
        rightHand: 0.5,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.8,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftArm: "pose",
        rightArm: "pose",
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(summary.primaryAction).toBe("Tune right arm balance");
    expect(summary.warnings).toContain("Right arm confidence trails left");
  });

  it("prioritizes reacquiring the right arm when it is holding last good pose", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.9,
        leftHand: 0.88,
        rightWrist: 0.55,
        rightHand: 0.54,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.8,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftArm: "pose",
        rightArm: "last-good",
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(summary.primaryAction).toBe("Reacquire right arm tracking");
    expect(summary.warnings).toContain("Right arm is holding last good pose");
  });

  it("prioritizes floor calibration when the avatar is using fixed floor fallback", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.85,
        leftHand: 0.82,
        rightWrist: 0.84,
        rightHand: 0.81,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.8,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftArm: "pose",
        rightArm: "pose",
        leftFoot: "pose",
        rightFoot: "pose",
        floor: "fixed-floor",
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(summary.primaryAction).toBe("Tune floor calibration");
    expect(summary.warnings).toContain("Floor is using fixed fallback");
  });

  it("prioritizes reacquiring the right foot when it is holding last good pose", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.85,
        leftHand: 0.82,
        rightWrist: 0.84,
        rightHand: 0.81,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.8,
        rightFoot: 0.5,
      },
      fallbacks: {
        leftArm: "pose",
        rightArm: "pose",
        leftFoot: "pose",
        rightFoot: "last-good",
        floor: "calibrated-floor",
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(summary.primaryAction).toBe("Reacquire right foot tracking");
    expect(summary.warnings).toContain("Right foot is holding last good pose");
  });

  it("prioritizes right foot balance when it trails the left without being fully lost", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.85,
        leftHand: 0.82,
        rightWrist: 0.84,
        rightHand: 0.81,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.86,
        rightFoot: 0.52,
      },
      fallbacks: {
        leftArm: "pose",
        rightArm: "pose",
        leftFoot: "pose",
        rightFoot: "pose",
        floor: "calibrated-floor",
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(summary.primaryAction).toBe("Tune right foot balance");
    expect(summary.warnings).toContain("Right foot confidence trails left");
  });

  it("prioritizes head pitch tuning when applied pitch is near its clamp", () => {
    const summary = getMovementTrackingHealthSummary({
      updatedAt: 1,
      headRaw: { pitch: 0.8, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0.78, yaw: 0, roll: 0, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.8,
        leftHand: 0.8,
        rightWrist: 0.8,
        rightHand: 0.8,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.8,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(summary.primaryAction).toBe("Tune head pitch offset");
    expect(summary.warnings).toContain("Head pitch is near clamp");
  });

  it("reports head yaw and roll clamp pressure for avatar profile tuning", () => {
    const warnings = getMovementTrackingHealthWarnings({
      updatedAt: 1,
      headRaw: { pitch: 0, yaw: 1.2, roll: -0.7, confidence: 0.9, source: "face" },
      headApplied: { pitch: 0, yaw: 1.12, roll: -0.65, confidence: 0.9, source: "face" },
      bodyConfidence: {
        torso: 0.9,
        leftWrist: 0.8,
        leftHand: 0.8,
        rightWrist: 0.8,
        rightHand: 0.8,
        leftKnee: 0.9,
        rightKnee: 0.9,
        leftFoot: 0.8,
        rightFoot: 0.8,
      },
      fallbacks: {
        leftKnee: "pose",
        rightKnee: "pose",
        head: "face",
      },
      calibrationQuality: 0.9,
    });

    expect(warnings).toContain("Head yaw is near clamp");
    expect(warnings).toContain("Head roll is near clamp");
  });
});
