import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarPipelineDecision,
} from "./movementAvatarPipeline";
import { resolveMovementAvatarLowerBodyTarget } from "./movementAvatarTarget";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";

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
  pose[13] = { x: 0.34, y: 0.56, z: 0, visibility: 0.9 };
  pose[14] = { x: 0.66, y: 0.56, z: 0, visibility: 0.9 };
  pose[15] = { x: 0.32, y: 0.68, z: 0, visibility: 0.9 };
  pose[16] = { x: 0.68, y: 0.68, z: 0, visibility: 0.9 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.85 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.85 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.8 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.8 };
  pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.8 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.8 };
  return pose;
}

function squatPose() {
  const pose = withCorePose();
  pose[23] = { ...pose[23]!, y: 0.8 };
  pose[24] = { ...pose[24]!, y: 0.8 };
  pose[25] = { ...pose[25]!, y: 0.73 };
  pose[26] = { ...pose[26]!, y: 0.73 };
  return pose;
}

function sideBendPoseWithStraightLegs() {
  const pose = withCorePose();
  pose[0] = { ...pose[0]!, x: 0.62 };
  pose[7] = { ...pose[7]!, x: 0.58 };
  pose[8] = { ...pose[8]!, x: 0.66 };
  pose[11] = { ...pose[11]!, x: 0.5 };
  pose[12] = { ...pose[12]!, x: 0.74 };
  return pose;
}

function sideBendPoseWithLateralLegLift() {
  const pose = sideBendPoseWithStraightLegs();
  pose[25] = { ...pose[25]!, x: 0.28, y: 0.82 };
  pose[27] = { ...pose[27]!, x: 0.16, y: 0.84 };
  pose[29] = { ...pose[29]!, x: 0.13, y: 0.85 };
  pose[31] = { ...pose[31]!, x: 0.12, y: 0.86 };
  return pose;
}

function resolveDecision({
  avatarRole,
  pose,
}: {
  avatarRole: "instructor" | "player";
  pose: TrackingLandmark[];
}) {
  const neutralPose = withCorePose();
  return resolveMovementAvatarPipelineDecision({
    avatarRole,
    calibration: buildMovementCalibration({ poseLandmarks: neutralPose }),
    retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutralPose }),
    source: {
      poseLandmarks: pose,
    },
    sourceOrigin: avatarRole === "player" ? "studio" : "replay",
  });
}

describe("movement avatar target", () => {
  it("keeps player squat target ownership outside the renderer", () => {
    const decision = resolveDecision({
      avatarRole: "player",
      pose: squatPose(),
    });
    const target = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "player",
      decision,
      lowerBodyVisualState: {
        squatPresentationDepth: 0.42,
        visualRootDrop: 0.2,
      },
    });

    expect(target.stageDecision?.stage).toBe("retarget");
    expect(target.lowerBodyOwner).toBe("player-retarget");
    expect(target.shouldHoldPlayerSquatPose).toBe(true);
    expect(target.playerSourceOwner.playerRetargetLowerBodyMotion).toBeGreaterThan(0.4);
  });

  it("keeps complete quiet player lower-body frames on recorded retarget", () => {
    const decision = resolveDecision({
      avatarRole: "player",
      pose: withCorePose(),
    });
    const target = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "player",
      decision,
      lowerBodyVisualState: {
        hasEstablishedLegRetarget: true,
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      },
    });

    expect(target.stageDecision?.stage).toBe("retarget");
    expect(target.lowerBodyOwner).toBe("player-retarget");
    expect(target.feetOwner).toBe("neutral");
    expect(target.shouldHoldPlayerSquatPose).toBe(false);
  });

  it("keeps a bilateral partial player leg target active during a readiness dip", () => {
    const readyDecision = resolveDecision({
      avatarRole: "player",
      pose: withCorePose(),
    });
    const decision = {
      ...readyDecision,
      lowerBodySegmentMotion: 0.14,
      lowerBodyTrackingReady: false,
      lowerOwner: "retarget-partial-fallback",
      rawLowerBodyTrackingReady: false,
      retargetApplicableLegs: 2,
      retargetApplicableThighs: 2,
      retargetSolvedLegs: 2,
      retargetFrame: {
        ...readyDecision.retargetFrame,
        debug: {
          ...readyDecision.retargetFrame.debug,
          sourceQuality: 0.5,
        },
      },
    };
    const target = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "player",
      decision,
      lowerBodyVisualState: {
        hasEstablishedLegRetarget: true,
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      },
    });

    expect(decision.retargetApplicableLegs).toBe(2);
    expect(target.stageDecision?.stage).toBe("retarget");
    expect(target.lowerBodyOwner).toBe("retarget-partial-fallback");
  });

  it("does not acquire partial leg retarget before a complete solve establishes ownership", () => {
    const readyDecision = resolveDecision({
      avatarRole: "player",
      pose: withCorePose(),
    });
    const target = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "player",
      decision: {
        ...readyDecision,
        lowerBodySegmentMotion: 0.14,
        lowerBodyTrackingReady: false,
        lowerOwner: "retarget-partial-fallback",
        rawLowerBodyTrackingReady: false,
        retargetApplicableLegs: 2,
        retargetApplicableThighs: 2,
        retargetSolvedLegs: 2,
        retargetFrame: {
          ...readyDecision.retargetFrame,
          debug: {
            ...readyDecision.retargetFrame.debug,
            sourceQuality: 0.5,
          },
        },
      },
      lowerBodyVisualState: {
        hasEstablishedLegRetarget: false,
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      },
    });

    expect(target.stageDecision).toBeNull();
  });

  it("acquires a three-segment partial target when the recorded legs are clearly moving", () => {
    const readyDecision = resolveDecision({
      avatarRole: "player",
      pose: withCorePose(),
    });
    const target = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "player",
      decision: {
        ...readyDecision,
        lowerBodySegmentMotion: 0.24,
        lowerBodyTrackingReady: false,
        lowerOwner: "retarget-partial-fallback",
        rawLowerBodyTrackingReady: false,
        retargetApplicableLegs: 3,
        retargetApplicableThighs: 2,
        retargetSolvedLegs: 3,
        retargetFrame: {
          ...readyDecision.retargetFrame,
          debug: {
            ...readyDecision.retargetFrame.debug,
            sourceQuality: 0.5,
          },
        },
      },
      lowerBodyVisualState: {
        hasEstablishedLegRetarget: false,
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      },
    });

    expect(target.stageDecision?.stage).toBe("retarget");
  });

  it("keeps complete feet-floor side-bend legs on continuous retarget across the old threshold", () => {
    const decision = resolveDecision({
      avatarRole: "player",
      pose: sideBendPoseWithStraightLegs(),
    });
    const noisySideBendDecision = {
      ...decision,
      lowerBodySegmentMotion: 0.48,
      playerRetargetLowerBodyMotion: 0.48,
    };
    const targetAboveThreshold = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "player",
      decision: noisySideBendDecision,
      lowerBodyVisualState: {
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      },
    });
    const targetBelowThreshold = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "player",
      decision: {
        ...noisySideBendDecision,
        spineDrive: {
          ...noisySideBendDecision.spineDrive,
          sideBend: Math.sign(noisySideBendDecision.spineDrive.sideBend) * 0.11,
        },
      },
      lowerBodyVisualState: {
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      },
    });

    expect(noisySideBendDecision.supportIntent.key).toBe("feet-floor");
    expect(Math.abs(noisySideBendDecision.spineDrive.sideBend)).toBeGreaterThan(0.12);
    expect(noisySideBendDecision.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(noisySideBendDecision.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(false);
    expect(targetAboveThreshold.stageDecision?.stage).toBe("retarget");
    expect(targetAboveThreshold.lowerBodyOwner).toBe("player-retarget");
    expect(targetAboveThreshold.playerSourceOwner.playerRetargetLowerBodyMotion).toBeGreaterThan(0.4);
    expect(targetBelowThreshold.stageDecision?.stage).toBe("retarget");
    expect(targetBelowThreshold.lowerBodyOwner).toBe("player-retarget");
  });

  it("does not neutralize a visible lateral leg lift during a side bend", () => {
    const decision = resolveDecision({
      avatarRole: "player",
      pose: sideBendPoseWithLateralLegLift(),
    });
    const target = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "player",
      decision,
      lowerBodyVisualState: {
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      },
    });

    expect(decision.supportIntent.key).toBe("feet-floor");
    expect(Math.abs(decision.spineDrive.sideBend)).toBeGreaterThan(0.12);
    expect(decision.retargetFrame.contacts.leftFoot).toBe(false);
    expect(decision.lowerBodySegmentMotion).toBeGreaterThan(0.32);
    expect(target.stageDecision?.stage).not.toBe("player-neutral");
    expect(target.stageDecision?.canUsePlayerRetargetLegRaise).toBe(true);
    expect(target.feetOwner).toBe("recorded-retarget");
    expect(target.playerSourceOwner.playerRetargetLowerBodyMotion).toBeGreaterThan(0.32);
  });

  it("keeps complete recorded instructor legs on retarget below the motion threshold", () => {
    const decision = resolveDecision({
      avatarRole: "instructor",
      pose: withCorePose(),
    });
    const target = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "instructor",
      decision,
      lowerBodyVisualState: {
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      },
    });

    expect(target.stageDecision?.stage).toBe("retarget");
    expect(target.stageDecision?.lowerBodyOwner).toBe("recorded-retarget");
    expect(target.stageDecision?.feetOwner).toBe("recorded-retarget");
    expect(target.instructorLowerBodyMotion).toBeLessThan(0.08);
  });
});
