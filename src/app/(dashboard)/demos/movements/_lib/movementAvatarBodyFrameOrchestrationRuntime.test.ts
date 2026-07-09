import { describe, expect, it, vi } from "vitest";
import { applyMovementAvatarBodyFrameOrchestrationRuntime } from "./movementAvatarBodyFrameOrchestrationRuntime";
import { resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime } from "./movementAvatarFrameTargetRetargetOrchestrationRuntime";
import { applyMovementAvatarUpperBodyFrameOrchestrationRuntime } from "./movementAvatarUpperBodyFrameOrchestrationRuntime";
import { applyMovementAvatarLowerBodyFrameOrchestrationRuntime } from "./movementAvatarLowerBodyFrameOrchestrationRuntime";

vi.mock("./movementAvatarFrameTargetRetargetOrchestrationRuntime", () => ({
  resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime: vi.fn(),
}));

vi.mock("./movementAvatarUpperBodyFrameOrchestrationRuntime", () => ({
  applyMovementAvatarUpperBodyFrameOrchestrationRuntime: vi.fn(),
}));

vi.mock("./movementAvatarLowerBodyFrameOrchestrationRuntime", () => ({
  applyMovementAvatarLowerBodyFrameOrchestrationRuntime: vi.fn(),
}));

describe("movementAvatarBodyFrameOrchestrationRuntime", () => {
  it("composes target retarget, upper-body, and lower-body frame handoffs", () => {
    const armTargetComposition = {
      armTargets: {},
    };
    const frameTargetRuntime = {
      lowerBodyTargetComposition: {
        aimTargets: {
          leftToe: "left-toe-aim",
        },
      },
    };
    const retargetFrameRuntimeAdapters = {
      applyPlantedSquatIk: vi.fn(),
      applyRetargetMappings: vi.fn(),
      getRestMap: vi.fn(),
    };
    vi.mocked(resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime).mockReturnValue({
      armTargetComposition,
      frameTargetRuntime,
      lowerBodyAimTargets: frameTargetRuntime.lowerBodyTargetComposition.aimTargets,
      retargetFrameRuntimeAdapters,
    } as never);
    vi.mocked(applyMovementAvatarUpperBodyFrameOrchestrationRuntime).mockReturnValue({
      retargetAppliedUpperBody: 3,
      upperBodyFrameRuntime: {
        retargetAppliedUpperBody: 3,
      },
    } as never);
    vi.mocked(applyMovementAvatarLowerBodyFrameOrchestrationRuntime).mockReturnValue({
      footOwner: "retarget-feet",
      lowerBodyFrameRuntime: {
        retargetAppliedLowerBody: 4,
      },
      lowerBodyOwner: "retarget-lower-body",
      plantedSquatIkDepth: 0.42,
      retargetAppliedLowerBody: 4,
    } as never);
    const leftLowerLeg = { rotation: { x: 1 } };
    const leftUpperLeg = { rotation: { x: 2 } };
    const rightLowerLeg = { rotation: { x: 3 } };
    const rightUpperLeg = { rotation: { x: 4 } };

    const result = applyMovementAvatarBodyFrameOrchestrationRuntime({
      activeSpineDrive: "active-spine-drive",
      avatarRole: "player",
      avatarRoot: "avatar-root",
      balancedPlantedSquatDepth: 0.2,
      boneEaseOptions: "bone-ease-options",
      currentRestMap: "current-rest-map",
      fallbackSlerp: 0.35,
      imageLandmarks: "image-landmarks",
      instructorSquatPresentationDepth: 0.1,
      lastGoodQuaternionRef: {
        current: "last-good-quaternions",
      },
      leftArmDecision: "left-arm-decision",
      lookupBone: "lookup-bone",
      lowerBodyDrive: "lower-body-drive",
      lowerBodySegmentMotion: 0.7,
      lowerBodyTarget: "lower-body-target",
      lowerBodyTrackingReady: true,
      playerRetargetLowerBodyMotion: "player-retarget-motion",
      playerSquatPresentationDepth: 0.3,
      profile: "profile",
      recordedLowerBodySourceReliable: true,
      retargetAvatarRestRef: {
        current: "rest-ref",
      },
      retargetFrame: "retarget-frame",
      rigHands: "rig-hands",
      riggedPose: {
        LeftLowerLeg: leftLowerLeg,
        LeftUpperLeg: leftUpperLeg,
        RightLowerLeg: rightLowerLeg,
        RightUpperLeg: rightUpperLeg,
      },
      rightArmDecision: "right-arm-decision",
      scene: "scene",
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: true,
      shouldHoldPlayerSquatPose: false,
      shouldUseRetargetedUpperBody: true,
      solverLandmarks: "solver-landmarks",
      squatFlexionBendBoost: 1.2,
      targetSolverLandmarks: "target-solver-landmarks",
      torsoTrackingReady: true,
      vrm: "vrm",
      zScale: 1,
    } as never);

    expect(resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
      currentRestMap: "current-rest-map",
      lastGood: "last-good-quaternions",
      lowerBodySegmentMotion: 0.7,
      shouldUseRetargetedUpperBody: true,
    }));
    expect(applyMovementAvatarUpperBodyFrameOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
      retargetFrameRuntimeAdapters,
    }));
    expect(applyMovementAvatarLowerBodyFrameOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
      currentFeetOwner: "neutral",
      currentLowerBodyOwner: "neutral",
      lowerBodyAimTargets: frameTargetRuntime.lowerBodyTargetComposition.aimTargets,
      retargetFrameRuntimeAdapters,
      solvedLowerBodySources: {},
    }));
    expect(result).toMatchObject({
      footOwner: "retarget-feet",
      frameTargetRuntime,
      lowerBodyOwner: "retarget-lower-body",
      plantedSquatIkDepth: 0.42,
      retargetAppliedLowerBody: 4,
      retargetAppliedUpperBody: 3,
    });
  });
});
