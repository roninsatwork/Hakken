import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyMovementAvatarPreBodyFrameOrchestrationRuntime } from "./movementAvatarPreBodyFrameOrchestrationRuntime";
import { applyMovementAvatarFramePreparationOrchestrationRuntime } from "./movementAvatarFramePreparationOrchestrationRuntime";
import { applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime } from "./movementAvatarLowerBodyFrameStateOrchestrationRuntime";
import { resolveMovementAvatarFrameDecisionSnapshotRuntime } from "./movementAvatarFrameDecisionSnapshotRuntime";
import { applyMovementAvatarLocomotionFrameOrchestrationRuntime } from "./movementAvatarLocomotionFrameOrchestrationRuntime";

vi.mock("./movementAvatarFramePreparationOrchestrationRuntime", () => ({
  applyMovementAvatarFramePreparationOrchestrationRuntime: vi.fn(),
}));

vi.mock("./movementAvatarLowerBodyFrameStateOrchestrationRuntime", () => ({
  applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime: vi.fn(),
}));

vi.mock("./movementAvatarFrameDecisionSnapshotRuntime", () => ({
  resolveMovementAvatarFrameDecisionSnapshotRuntime: vi.fn(),
}));

vi.mock("./movementAvatarLocomotionFrameOrchestrationRuntime", () => ({
  applyMovementAvatarLocomotionFrameOrchestrationRuntime: vi.fn(),
}));

function input() {
  return {
    avatarBaseY: -2.8,
    avatarRole: "player",
    avatarRoot: "avatar-root",
    displayWorldPose: "display-world-pose",
    exerciseTransitionStateRef: { current: "exercise-transition" },
    faceLandmarks: "face-landmarks",
    forceStandby: false,
    hands: "hands",
    history: "history",
    instructorLowerBodyStabilityRef: { current: "instructor-stability" },
    isLivePlayer: true,
    manualCalibration: "manual-calibration",
    mirrorPlayerDisplay: true,
    motionFrame: "motion-frame",
    now: () => 123,
    playerLegRaiseHoldRef: { current: "leg-raise-hold" },
    playerLowerBodyStabilityRef: { current: "player-stability" },
    poseLandmarks: "pose-landmarks",
    positionOffset: [0, 0, 0],
    profile: "profile",
    providedRetargetSourceModel: "retarget-source-model",
    recordedRootMotionFrame: "recorded-root-motion",
    retargetSourceModelRef: { current: "retarget-source-ref" },
    setupStateRef: { current: "setup-state" },
    trackingDebugRef: { current: null },
    worldPoseForLocomotion: "world-pose-locomotion",
    worldPoseForSetup: "world-pose-setup",
  } as never;
}

describe("movementAvatarPreBodyFrameOrchestrationRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fallback when frame preparation cannot produce a decision", () => {
    const framePreparationRuntime = {
      activeCalibration: null,
      autoCalibrationKind: "none",
      status: "fallback-demo-pose",
    };
    vi.mocked(applyMovementAvatarFramePreparationOrchestrationRuntime).mockReturnValue(framePreparationRuntime as never);

    expect(applyMovementAvatarPreBodyFrameOrchestrationRuntime(input())).toEqual({
      framePreparationRuntime,
      status: "fallback-demo-pose",
    });
    expect(applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime).not.toHaveBeenCalled();
    expect(applyMovementAvatarLocomotionFrameOrchestrationRuntime).not.toHaveBeenCalled();
  });

  it("returns fallback after locomotion standby while preserving prep and locomotion results", () => {
    const framePreparationRuntime = {
      activeCalibration: "active-calibration",
      avatarDecision: "avatar-decision",
      autoCalibrationKind: "upright",
      exerciseTransition: "exercise-transition",
      motionFrameInput: "motion-frame-input",
      status: "ready",
    };
    const lowerBodyFrameStateOrchestrationRuntime = {
      legRaiseHoldDecision: "leg-raise-hold-decision",
      lowerBodyFrameStateRuntime: "lower-body-frame-state",
    };
    const decisionSnapshotRuntime = {
      lowerBodyDrive: "lower-body-drive",
      lowerBodyTrackingReady: true,
      playerSquatPresentationDepth: 0.4,
      rootOrientation: "root-orientation",
      shouldApplyLowerBody: true,
      visualRootDrop: 0.2,
    };
    const locomotionFrameOrchestrationRuntime = {
      calibratedFloorCorrection: 0,
      hipsFrameRuntime: "hips-frame",
      status: "fallback-demo-pose",
    };
    vi.mocked(applyMovementAvatarFramePreparationOrchestrationRuntime).mockReturnValue(framePreparationRuntime as never);
    vi.mocked(applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime)
      .mockReturnValue(lowerBodyFrameStateOrchestrationRuntime as never);
    vi.mocked(resolveMovementAvatarFrameDecisionSnapshotRuntime).mockReturnValue(decisionSnapshotRuntime as never);
    vi.mocked(applyMovementAvatarLocomotionFrameOrchestrationRuntime)
      .mockReturnValue(locomotionFrameOrchestrationRuntime as never);

    const result = applyMovementAvatarPreBodyFrameOrchestrationRuntime(input());

    expect(applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
      avatarDecision: "avatar-decision",
      now: 123,
    }));
    expect(applyMovementAvatarLocomotionFrameOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
      calibration: "active-calibration",
      lowerBodyDrive: "lower-body-drive",
      rootOrientation: "root-orientation",
      worldPose: "world-pose-locomotion",
    }));
    expect(result).toEqual({
      framePreparationRuntime,
      locomotionFrameOrchestrationRuntime,
      status: "fallback-demo-pose",
    });
  });

  it("returns ready frame handoffs for body and completion orchestration", () => {
    const framePreparationRuntime = {
      activeCalibration: "active-calibration",
      avatarDecision: "avatar-decision",
      autoCalibrationKind: "upright",
      exerciseTransition: "exercise-transition",
      motionFrameInput: "motion-frame-input",
      status: "ready",
    };
    const lowerBodyFrameStateOrchestrationRuntime = {
      legRaiseHoldDecision: "leg-raise-hold-decision",
      lowerBodyFrameStateRuntime: "lower-body-frame-state",
    };
    const decisionSnapshotRuntime = {
      lowerBodyDrive: "lower-body-drive",
      lowerBodyTrackingReady: true,
      playerSquatPresentationDepth: 0.4,
      rootOrientation: "root-orientation",
      shouldApplyLowerBody: true,
      visualRootDrop: 0.2,
    };
    const locomotionFrameOrchestrationRuntime = {
      calibratedFloorCorrection: 0.12,
      hipsFrameRuntime: {
        hipsApplication: "hips-application",
        hipsPositionOptions: "hips-position-options",
      },
      status: "ready",
      stepResponse: "step-response",
    };
    vi.mocked(applyMovementAvatarFramePreparationOrchestrationRuntime).mockReturnValue(framePreparationRuntime as never);
    vi.mocked(applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime)
      .mockReturnValue(lowerBodyFrameStateOrchestrationRuntime as never);
    vi.mocked(resolveMovementAvatarFrameDecisionSnapshotRuntime).mockReturnValue(decisionSnapshotRuntime as never);
    vi.mocked(applyMovementAvatarLocomotionFrameOrchestrationRuntime)
      .mockReturnValue(locomotionFrameOrchestrationRuntime as never);

    expect(applyMovementAvatarPreBodyFrameOrchestrationRuntime(input())).toEqual({
      decisionSnapshotRuntime,
      framePreparationRuntime,
      locomotionFrameOrchestrationRuntime,
      lowerBodyFrameStateOrchestrationRuntime,
      status: "ready",
    });
  });
});
