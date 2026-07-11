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

function faceLandmarks() {
  const face = Array.from({ length: 264 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  face[1] = { x: 0.58, y: 0.48, z: 0, visibility: 0.9 };
  face[33] = { x: 0.42, y: 0.45, z: 0, visibility: 0.9 };
  face[263] = { x: 0.58, y: 0.45, z: 0, visibility: 0.9 };
  return face;
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

  it("keeps moderate pose-only player head noise facing forward", () => {
    const pose = withCorePose();
    pose[7] = { ...pose[7]!, z: 0.02 };
    pose[8] = { ...pose[8]!, z: -0.02 };

    const target = resolveMovementAvatarHeadTarget({
      avatarRole: "player",
      avatarRootYaw: 0,
      calibration: neutralCalibration,
      headMotionIntent: neutralHeadIntent,
      poseLandmarks: pose,
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    });

    expect(target.rawHeadDecision.rawHead.source).toBe("pose");
    expect(Math.abs(target.rawHeadDecision.rawHead.yaw)).toBeGreaterThan(0.35);
    expect(Math.abs(target.headDecision.headYaw)).toBeLessThan(0.03);
  });

  it("preserves strong pose-only player head yaw while spine is actively driven", () => {
    const pose = withCorePose();
    pose[7] = { ...pose[7]!, z: 0.08 };
    pose[8] = { ...pose[8]!, z: -0.08 };

    const target = resolveMovementAvatarHeadTarget({
      avatarRole: "player",
      avatarRootYaw: 0,
      calibration: neutralCalibration,
      headMotionIntent: neutralHeadIntent,
      mirrorHeadForDisplay: false,
      poseLandmarks: pose,
      shouldApplyLowerBody: false,
      shouldApplySpine: true,
    });

    expect(target.rawHeadDecision.rawHead.source).toBe("pose");
    expect(Math.abs(target.rawHeadDecision.rawHead.yaw)).toBeGreaterThan(0.65);
    expect(Math.abs(target.headDecision.headYaw)).toBeGreaterThan(0.35);
    expect(Math.sign(target.headDecision.headYaw)).toBe(Math.sign(target.rawHeadDecision.rawHead.yaw));
  });

  it("preserves strong recorded pose-only head yaw for replay proof", () => {
    const pose = withCorePose();
    pose[7] = { ...pose[7]!, z: 0.08 };
    pose[8] = { ...pose[8]!, z: -0.08 };

    const target = resolveMovementAvatarHeadTarget({
      avatarRole: "instructor",
      avatarRootYaw: 0,
      calibration: neutralCalibration,
      headMotionIntent: neutralHeadIntent,
      poseLandmarks: pose,
      shouldApplyLowerBody: false,
      shouldApplySpine: true,
    });

    expect(target.rawHeadDecision.rawHead.source).toBe("pose");
    expect(Math.abs(target.rawHeadDecision.rawHead.yaw)).toBeGreaterThan(0.65);
    expect(Math.abs(target.headDecision.headYaw)).toBeGreaterThan(0.35);
    expect(Math.sign(target.headDecision.headYaw)).toBe(Math.sign(target.rawHeadDecision.rawHead.yaw));
  });

  it("uses the same active-spine pose-head transform for instructor and player", () => {
    const pose = withCorePose();
    pose[0] = { ...pose[0]!, x: 0.56, y: 0.35 };
    pose[7] = { ...pose[7]!, y: 0.27, z: 0.08 };
    pose[8] = { ...pose[8]!, y: 0.34, z: -0.08 };
    const common = {
      avatarRootYaw: 0,
      calibration: neutralCalibration,
      headMotionIntent: neutralHeadIntent,
      mirrorHeadForDisplay: false,
      poseLandmarks: pose,
      shouldApplyLowerBody: false,
      shouldApplySpine: true,
    };

    const instructor = resolveMovementAvatarHeadTarget({ avatarRole: "instructor", ...common });
    const player = resolveMovementAvatarHeadTarget({ avatarRole: "player", ...common });

    expect(player.headDecision.appliedHead.pitch).toBeCloseTo(instructor.headDecision.appliedHead.pitch, 5);
    expect(player.headDecision.appliedHead.yaw).toBeCloseTo(instructor.headDecision.appliedHead.yaw, 5);
    expect(player.headDecision.appliedHead.roll).toBeCloseTo(instructor.headDecision.appliedHead.roll, 5);
  });

  it("keeps recorded pose-only pitch and roll visually close to the source", () => {
    const pose = withCorePose();
    pose[0] = { ...pose[0]!, x: 0.56, y: 0.35 };
    pose[7] = { ...pose[7]!, y: 0.27 };
    pose[8] = { ...pose[8]!, y: 0.34 };

    const target = resolveMovementAvatarHeadTarget({
      avatarRole: "instructor",
      avatarRootYaw: 0,
      calibration: null,
      headMotionIntent: neutralHeadIntent,
      poseLandmarks: pose,
      shouldApplyLowerBody: false,
      shouldApplySpine: true,
    });

    const raw = target.rawHeadDecision.rawHead;
    expect(Math.abs(target.headDecision.appliedHead.pitch)).toBeGreaterThan(
      Math.abs(raw.pitch) * 0.7,
    );
    expect(Math.abs(target.headDecision.appliedHead.roll)).toBeGreaterThan(
      Math.abs(raw.roll) * 0.65,
    );
  });

  it("preserves pose-only player head pitch for look up and down", () => {
    const pose = withCorePose();
    pose[0] = { ...pose[0]!, y: 0.36 };

    const target = resolveMovementAvatarHeadTarget({
      avatarRole: "player",
      avatarRootYaw: 0,
      calibration: neutralCalibration,
      headMotionIntent: neutralHeadIntent,
      poseLandmarks: pose,
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    });

    expect(target.rawHeadDecision.rawHead.source).toBe("pose");
    expect(Math.abs(target.rawHeadDecision.rawHead.pitch)).toBeGreaterThan(0.3);
    expect(Math.abs(target.headDecision.headPitch)).toBeGreaterThan(0.19);
    expect(Math.sign(target.headBonePitch)).toBe(-Math.sign(target.headDecision.headPitch));
  });

  it("still lets face landmarks drive player head motion", () => {
    const target = resolveMovementAvatarHeadTarget({
      avatarRole: "player",
      avatarRootYaw: 0,
      calibration: neutralCalibration,
      faceLandmarks: faceLandmarks(),
      headMotionIntent: neutralHeadIntent,
      poseLandmarks: withCorePose(),
      shouldApplyLowerBody: false,
      shouldApplySpine: false,
    });

    expect(target.rawHeadDecision.rawHead.source).toBe("face");
    expect(Math.abs(target.headDecision.headYaw)).toBeGreaterThan(0.2);
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
