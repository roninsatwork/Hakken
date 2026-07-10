import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyMovementAvatarReadyFrameOrchestrationRuntime } from "./movementAvatarReadyFrameOrchestrationRuntime";
import { resolveMovementAvatarFrameWorldRuntime } from "./movementAvatarFrameWorldRuntime";
import { resolveMovementAvatarFrameScenePreparationRuntime } from "./movementAvatarFrameScenePreparationRuntime";
import { applyMovementAvatarPreBodyFrameOrchestrationRuntime } from "./movementAvatarPreBodyFrameOrchestrationRuntime";
import { applyMovementAvatarBodyFrameOrchestrationRuntime } from "./movementAvatarBodyFrame";
import { applyMovementAvatarFrameCompletionOrchestrationRuntime } from "./movementAvatarFrameCompletionOrchestrationRuntime";

vi.mock("./movementAvatarFrameWorldRuntime", () => ({
  resolveMovementAvatarFrameWorldRuntime: vi.fn(),
}));

vi.mock("./movementAvatarFrameScenePreparationRuntime", () => ({
  resolveMovementAvatarFrameScenePreparationRuntime: vi.fn(),
}));

vi.mock("./movementAvatarPreBodyFrameOrchestrationRuntime", () => ({
  applyMovementAvatarPreBodyFrameOrchestrationRuntime: vi.fn(),
}));

vi.mock("./movementAvatarBodyFrame", () => ({
  applyMovementAvatarBodyFrameOrchestrationRuntime: vi.fn(),
}));

vi.mock("./movementAvatarFrameCompletionOrchestrationRuntime", () => ({
  applyMovementAvatarFrameCompletionOrchestrationRuntime: vi.fn(),
}));

function input(
  overrides: Partial<Parameters<typeof applyMovementAvatarReadyFrameOrchestrationRuntime>[0]> = {},
): Parameters<typeof applyMovementAvatarReadyFrameOrchestrationRuntime>[0] {
  return {
    applyDemoFallbackPose: vi.fn(),
    avatarBaseY: -2.8,
    avatarName: "Player",
    avatarRole: "player",
    avatarRoot: {
      rotation: {
        y: 0.4,
      },
    },
    baseBonePositionRef: { current: {} },
    baseHipsPositionRef: { current: null },
    blendshapes: null,
    boneEaseOptions: "bone-ease-options",
    displayPreparedInput: "display-world-pose",
    exerciseTransitionStateRef: { current: "exercise-transition" },
    faceLandmarks: "face-landmarks",
    fallbackPoseSlerp: 0.35,
    forceStandby: false,
    imageLandmarks: "image-landmarks",
    instructorLowerBodyStabilityRef: { current: "instructor-state" },
    isPlayer: true,
    lastGoodQuaternionRef: { current: "last-good" },
    liveRootMotionHistory: "history",
    lookupBone: "lookup-bone",
    manualCalibration: "manual-calibration",
    mirrorPlayerDisplay: true,
    motionFrame: "motion-frame",
    playerLegRaiseHoldRef: { current: "leg-raise-state" },
    playerLowerBodyStabilityRef: { current: "player-state" },
    plantedFootLockRef: { current: "foot-lock" },
    positionOffset: [0, 0, 0],
    profile: {
      neckSlerp: 0.5,
      squatLegBendBoost: 1.2,
    },
    profileName: "default",
    providedRetargetSourceModel: "source-model",
    recordedRootMotionFrame: "recorded-root",
    retargetAvatarRestRef: { current: "rest-map" },
    retargetSourceModelRef: { current: "retarget-source-model" },
    riggedPose: "rigged-pose",
    rigHands: "rig-hands",
    scene: "scene",
    setupStateRef: { current: "setup-state" },
    solverLandmarks: "solver-landmarks",
    targetSolverLandmarks: "target-solver-landmarks",
    trackingDebugRef: { current: null },
    vrm: {
      expressionManager: "expression-manager",
    },
    worldLandmarks: "world-landmarks",
    ...overrides,
  } as Parameters<typeof applyMovementAvatarReadyFrameOrchestrationRuntime>[0];
}

describe("movementAvatarReadyFrameOrchestrationRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveMovementAvatarFrameWorldRuntime).mockReturnValue({
      hasWorldLandmarks: true,
      lowerBodyZScale: 1,
      visualTelemetryZScale: 1,
      worldPoseForLocomotion: "world-pose-locomotion",
      worldPoseForSetup: "world-pose-setup",
    } as never);
    vi.mocked(resolveMovementAvatarFrameScenePreparationRuntime).mockReturnValue({
      hipsNode: "hips-node",
      updatedSceneMatrixWorld: true,
    } as never);
  });

  it("applies demo fallback and stops before body/completion when pre-body falls back", () => {
    const frameInput = input();
    vi.mocked(applyMovementAvatarPreBodyFrameOrchestrationRuntime).mockReturnValue({
      framePreparationRuntime: "prep-fallback",
      status: "fallback-demo-pose",
    } as never);

    const result = applyMovementAvatarReadyFrameOrchestrationRuntime(frameInput);

    expect(frameInput.applyDemoFallbackPose).toHaveBeenCalledWith(0.35);
    expect(applyMovementAvatarBodyFrameOrchestrationRuntime).not.toHaveBeenCalled();
    expect(applyMovementAvatarFrameCompletionOrchestrationRuntime).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "fallback-demo-pose",
    });
  });

  it("threads ready frame stages through body and completion orchestration", () => {
    const frameInput = input();
    vi.mocked(applyMovementAvatarPreBodyFrameOrchestrationRuntime).mockReturnValue({
      decisionSnapshotRuntime: {
        activeSpineDrive: "active-spine",
        balancedPlantedSquatDepth: 0.1,
        instructorSquatPresentationDepth: 0.2,
        leftArmDecision: "left-arm",
        liveSquatDepth: 0.3,
        lowerBodyDrive: "lower-body-drive",
        lowerBodyTarget: "lower-body-target",
        lowerBodyTrackingReady: true,
        playerRetargetLowerBodyMotion: "player-retarget",
        playerSquatPresentationDepth: 0.4,
        recordedLowerBodySegmentMotion: 0.5,
        recordedLowerBodySourceReliable: true,
        retargetFrame: "retarget-frame",
        rightArmDecision: "right-arm",
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldHoldPlayerSquatPose: false,
        torsoTrackingReady: true,
        visualRootDrop: 0.6,
      },
      framePreparationRuntime: {
        activeCalibration: "active-calibration",
        avatarDecision: {
          supportContactLocks: "support-locks",
          supportPresentation: "support-presentation",
        },
        autoCalibrationKind: "upright",
        exerciseTransition: "exercise-transition",
        motionFrameInput: {
          owner: "motion-owner",
        },
      },
      locomotionFrameOrchestrationRuntime: {
        calibratedFloorCorrection: 0.1,
        hipsFrameRuntime: {
          hipsApplication: "hips-application",
          hipsPositionOptions: "hips-options",
        },
        status: "ready",
        stepResponse: "step-response",
      },
      lowerBodyFrameStateOrchestrationRuntime: {
        legRaiseHoldDecision: "leg-raise-decision",
      },
      status: "ready",
    } as never);
    vi.mocked(applyMovementAvatarBodyFrameOrchestrationRuntime).mockReturnValue({
      footOwner: "feet",
      frameTargetRuntime: "frame-target",
      lowerBodyOwner: "lower-body",
      plantedSquatIkDepth: 0.7,
      retargetAppliedLowerBody: 4,
      retargetAppliedUpperBody: 3,
      upperBodyFrameOrchestrationRuntime: {
        upperBodyFrameRuntime: {
          upperBodyRuntimeApplication: {
            leftArm: { handled: false, mode: "retargeted" },
            rightArm: { handled: false, mode: "retargeted" },
          },
        },
      },
    } as never);
    vi.mocked(applyMovementAvatarFrameCompletionOrchestrationRuntime).mockReturnValue({
      final: true,
    } as never);

    const result = applyMovementAvatarReadyFrameOrchestrationRuntime(frameInput);

    expect(applyMovementAvatarPreBodyFrameOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
      worldPoseForLocomotion: "world-pose-locomotion",
      worldPoseForSetup: "world-pose-setup",
    }));
    expect(applyMovementAvatarBodyFrameOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
      currentRestMap: "rest-map",
    }));
    expect(applyMovementAvatarFrameCompletionOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
      avatarName: "Player",
      currentLowerBodyOwner: "lower-body",
      footOwner: "feet",
    }));
    expect(result.status).toBe("ready");
  });
});
