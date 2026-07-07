import { describe, expect, it } from "vitest";
import { resolveMovementAvatarFrameDecisionSnapshotRuntime } from "./movementAvatarFrameDecisionSnapshotRuntime";
import type { MovementAvatarLowerBodyFrameStateRuntime } from "./movementAvatarLowerBodyFrameStateRuntime";
import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";

describe("movementAvatarFrameDecisionSnapshotRuntime", () => {
  it("collects avatar and lower-body frame decisions without reshaping them", () => {
    const retargetFrame = { squatDepth: 0.4 };
    const lowerBodyDrive = { shouldApplyLowerBody: true };
    const lowerBodyTarget = { shouldHoldPlayerSquatPose: true };
    const avatarDecision = {
      leftArm: { side: "left" },
      lowerBodySegmentMotion: 0.66,
      lowerBodySourceReliable: true,
      lowerBodyTrackingReady: false,
      retargetFrame,
      rightArm: { side: "right" },
      rootOrientation: { yaw: 0.25 },
      shouldUseRetargetedUpperBody: true,
      spineDrive: { mode: "solver" },
      torsoTrackingReady: true,
    } as unknown as MovementAvatarPipelineDecision;
    const lowerBodyFrameStateRuntime = {
      balancedPlantedSquatDepth: 0.2,
      instructorSquatPresentationDepth: 0.3,
      liveSquatDepth: 0.4,
      lowerBodyDrive,
      lowerBodyTarget,
      playerRetargetLowerBodyMotion: 0.5,
      playerSquatPresentationDepth: 0.6,
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: false,
      shouldHoldPlayerSquatPose: true,
      visualRootDrop: 0.7,
    } as unknown as MovementAvatarLowerBodyFrameStateRuntime;

    const snapshot = resolveMovementAvatarFrameDecisionSnapshotRuntime({
      avatarDecision,
      lowerBodyFrameStateRuntime,
    });

    expect(snapshot.retargetFrame).toBe(retargetFrame);
    expect(snapshot.lowerBodyDrive).toBe(lowerBodyDrive);
    expect(snapshot.lowerBodyTarget).toBe(lowerBodyTarget);
    expect(snapshot.recordedLowerBodySegmentMotion).toBe(0.66);
    expect(snapshot.shouldApplySolverTorso).toBe(false);
    expect(snapshot.visualRootDrop).toBe(0.7);
  });
});
