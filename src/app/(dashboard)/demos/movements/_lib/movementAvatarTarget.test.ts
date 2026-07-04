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

    expect(target.stageDecision?.stage).toBe("player-squat");
    expect(target.lowerBodyOwner).toContain("squat");
    expect(target.shouldHoldPlayerSquatPose).toBe(true);
    expect(target.playerSourceOwner.playerRetargetLowerBodyMotion).toBeGreaterThan(0.4);
  });

  it("keeps quiet player lower-body frames neutral before renderer application", () => {
    const decision = resolveDecision({
      avatarRole: "player",
      pose: withCorePose(),
    });
    const target = resolveMovementAvatarLowerBodyTarget({
      avatarRole: "player",
      decision,
      lowerBodyVisualState: {
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      },
    });

    expect(target.stageDecision?.stage ?? "inactive").toMatch(/player-neutral|inactive/);
    expect(target.lowerBodyOwner).toMatch(/neutral/);
    expect(target.shouldHoldPlayerSquatPose).toBe(false);
  });

  it("keeps recorded neutral instructor ownership explicit for replay parity", () => {
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

    expect(target.stageDecision?.stage).toBe("recorded-neutral");
    expect(target.lowerBodyOwner).toBe("recorded-neutral");
    expect(target.feetOwner).toBe("neutral");
    expect(target.instructorLowerBodyMotion).toBeLessThan(0.08);
  });
});
