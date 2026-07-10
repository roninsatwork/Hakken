import {
  describe,
  expect,
  it,
} from "vitest";
import { createMovementAvatarExerciseTransitionState } from "./movementAvatarExerciseTarget";
import {
  applyMovementAvatarFrameDecisionRefsRuntime,
  applyMovementAvatarFramePreparationOrchestrationRuntime,
  applyMovementAvatarFrameSetupRefsRuntime,
  applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime,
  applyMovementAvatarLowerBodyFrameStateRefsRuntime,
  type MovementAvatarLowerBodyFrameStateRuntime,
  resolveMovementAvatarFrameDecisionRuntime,
  resolveMovementAvatarFrameDecisionSnapshotRuntime,
  resolveMovementAvatarFrameSetupRuntime,
  resolveMovementAvatarLowerBodyFrameStateRuntime,
  resolveMovementAvatarRetargetSourceRuntimeModel,
  resolveMovementAvatarSetupRuntimeState,
} from "./movementAvatarFramePreparation";
import { type MovementAvatarPipelineDecision, resolveMovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { createMovementAvatarLowerBodyVisualState, createMovementAvatarPlayerLegRaiseHoldState } from "./movementAvatarRuntimeState";
import { createMovementAvatarSetupState } from "./movementAvatarSetup";
import type { MovementMotionFrame } from "./movementMotionFrame";
import { buildMovementRetargetSourceModel, type MovementRetargetSourceModel } from "./movementRetargeting";
import { buildMovementCalibration, type TrackingLandmark } from "./movementTrackingCalibration";

describe("movementAvatarSetupRuntime (merged)", () => {
  function corePose(): TrackingLandmark[] {
    const pose = Array.from({ length: 33 }, (_, index) => ({
      x: 0.45 + index * 0.002,
      y: 0.45,
      z: 0,
      visibility: 0.9,
    }));
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
    pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.8 };
    pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.8 };
    pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.8 };
    pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.8 };
    return pose;
  }

  describe("movementAvatarSetupRuntime", () => {
    it("advances live setup state and returns calibration metadata", () => {
      let setupState = createMovementAvatarSetupState();
      let target = resolveMovementAvatarSetupRuntimeState({
        isLivePlayer: true,
        manualCalibration: null,
        now: 1000,
        poseLandmarks: corePose(),
        previousState: setupState,
      });

      for (let index = 1; index < 6; index += 1) {
        setupState = target.nextState;
        target = resolveMovementAvatarSetupRuntimeState({
          isLivePlayer: true,
          manualCalibration: null,
          now: 1000 + index,
          poseLandmarks: corePose(),
          previousState: setupState,
        });
      }

      expect(target.autoCalibrationKind).toBe("full-body");
      expect(target.activeCalibration?.quality).toBeGreaterThan(0.8);
      expect(target.sourceFrame?.sourceOrigin).toBe("live-webcam");
      expect(target.sourceFrame?.startReadiness.canStartGame).toBe(true);
    });

    it("keeps recorded avatars setup-neutral", () => {
      const target = resolveMovementAvatarSetupRuntimeState({
        isLivePlayer: false,
        manualCalibration: null,
        poseLandmarks: corePose(),
        previousState: createMovementAvatarSetupState(),
      });

      expect(target.activeCalibration).toBeNull();
      expect(target.autoCalibrationKind).toBeNull();
      expect(target.sourceFrame).toBeNull();
    });

    it("prefers manual calibration and clears automatic samples", () => {
      const pose = corePose();
      const manualCalibration = buildMovementCalibration({ poseLandmarks: pose, now: 3000 });
      const target = resolveMovementAvatarSetupRuntimeState({
        isLivePlayer: true,
        manualCalibration,
        now: 3001,
        poseLandmarks: pose,
        previousState: {
          autoCalibration: {
            calibration: null,
            kind: "full-body",
            samples: [manualCalibration!],
          },
        },
      });

      expect(target.activeCalibration).toBe(manualCalibration);
      expect(target.autoCalibrationKind).toBeNull();
      expect(target.nextState.autoCalibration.samples).toEqual([]);
    });
  });
});

describe("movementAvatarRetargetSourceRuntime (merged)", () => {
  function corePose(): TrackingLandmark[] {
    const pose = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.9,
    }));
    pose[0] = { x: 0.5, y: 0.12, z: 0, visibility: 0.95 };
    pose[11] = { x: 0.38, y: 0.3, z: 0, visibility: 0.95 };
    pose[12] = { x: 0.62, y: 0.3, z: 0, visibility: 0.95 };
    pose[23] = { x: 0.42, y: 0.55, z: 0, visibility: 0.95 };
    pose[24] = { x: 0.58, y: 0.55, z: 0, visibility: 0.95 };
    pose[25] = { x: 0.42, y: 0.72, z: 0, visibility: 0.9 };
    pose[26] = { x: 0.58, y: 0.72, z: 0, visibility: 0.9 };
    pose[27] = { x: 0.42, y: 0.92, z: 0, visibility: 0.9 };
    pose[28] = { x: 0.58, y: 0.92, z: 0, visibility: 0.9 };
    pose[29] = { x: 0.41, y: 0.94, z: 0.02, visibility: 0.9 };
    pose[30] = { x: 0.59, y: 0.94, z: 0.02, visibility: 0.9 };
    pose[31] = { x: 0.41, y: 0.96, z: 0, visibility: 0.9 };
    pose[32] = { x: 0.59, y: 0.96, z: 0, visibility: 0.9 };
    return pose;
  }

  function sourceModel(now = 100): MovementRetargetSourceModel {
    const model = buildMovementRetargetSourceModel({
      now,
      poseLandmarks: corePose(),
    });

    if (!model) {
      throw new Error("Expected test pose to produce a retarget source model.");
    }

    return model;
  }

  describe("movementAvatarRetargetSourceRuntime", () => {
    it("uses a provided recorded/replay model before cached or live fallback models", () => {
      const providedModel = sourceModel(200);
      const cachedModel = sourceModel(100);

      const result = resolveMovementAvatarRetargetSourceRuntimeModel({
        currentModel: cachedModel,
        poseLandmarks: corePose(),
        providedModel,
      });

      expect(result).toBe(providedModel);
    });

    it("keeps the cached runtime model when no provided model exists", () => {
      const cachedModel = sourceModel(100);

      const result = resolveMovementAvatarRetargetSourceRuntimeModel({
        currentModel: cachedModel,
        poseLandmarks: corePose(),
        providedModel: null,
      });

      expect(result).toBe(cachedModel);
    });

    it("builds a live fallback model only when no provided or cached model exists", () => {
      const result = resolveMovementAvatarRetargetSourceRuntimeModel({
        currentModel: null,
        now: 300,
        poseLandmarks: corePose(),
        providedModel: null,
      });

      expect(result?.calibratedAt).toBe(300);
      expect(result?.quality).toBeGreaterThan(0.55);
    });
  });
});

describe("movementAvatarFrameSetupRuntime (merged)", () => {
  function landmark(x: number, y: number, visibility = 0.9): TrackingLandmark {
    return {
      x,
      y,
      z: 0,
      visibility,
    };
  }

  function buildStandingPose(): TrackingLandmark[] {
    const pose = Array.from({ length: 33 }, (_, index) => landmark(index / 100, 0.5));

    pose[11] = landmark(0.4, 0.2);
    pose[12] = landmark(0.6, 0.2);
    pose[23] = landmark(0.42, 0.5);
    pose[24] = landmark(0.58, 0.5);
    pose[25] = landmark(0.44, 0.75);
    pose[26] = landmark(0.56, 0.75);
    pose[27] = landmark(0.44, 1);
    pose[28] = landmark(0.56, 1);
    pose[31] = landmark(0.45, 1.03);
    pose[32] = landmark(0.55, 1.03);

    return pose;
  }

  const providedRetargetSourceModel = {
    calibratedAt: 5,
    floorY: 1,
    hipCenter: {
      x: 0.5,
      y: 0.5,
      z: 0,
    },
    neutralKneeLift: {
      left: 0,
      right: 0,
    },
    quality: 1,
    segments: {},
    shoulderCenter: {
      x: 0.5,
      y: 0.2,
      z: 0,
    },
    torsoHeight: 0.3,
  } satisfies MovementRetargetSourceModel;

  describe("movementAvatarFrameSetupRuntime", () => {
    it("resolves live setup state while preserving a provided retarget source model", () => {
      const decision = resolveMovementAvatarFrameSetupRuntime({
        currentRetargetSourceModel: null,
        isLivePlayer: true,
        manualCalibration: null,
        now: 100,
        poseLandmarks: buildStandingPose(),
        previousSetupState: createMovementAvatarSetupState(),
        providedRetargetSourceModel,
      });

      expect(decision.nextSetupState.autoCalibration.samples.length).toBeGreaterThan(0);
      expect(decision.nextRetargetSourceModel).toBe(providedRetargetSourceModel);
    });

    it("resets instructor setup while still allowing retarget fallback calibration", () => {
      const decision = resolveMovementAvatarFrameSetupRuntime({
        currentRetargetSourceModel: null,
        isLivePlayer: false,
        manualCalibration: null,
        now: 200,
        poseLandmarks: buildStandingPose(),
        previousSetupState: createMovementAvatarSetupState(),
        providedRetargetSourceModel: null,
      });

      expect(decision.activeCalibration).toBeNull();
      expect(decision.autoCalibrationKind).toBeNull();
      expect(decision.nextSetupState).toEqual(createMovementAvatarSetupState());
      expect(decision.nextRetargetSourceModel).toMatchObject({
        calibratedAt: 200,
        floorY: 1.03,
      });
    });
  });
});

describe("movementAvatarFrameSetupRefsRuntime (merged)", () => {
  describe("movementAvatarFrameSetupRefsRuntime", () => {
    it("applies setup and retarget source model refs from the frame setup runtime", () => {
      const nextSetupState = { marker: "setup" };
      const nextRetargetSourceModel = { marker: "model" };
      const setupStateRef = {
        current: null,
      };
      const retargetSourceModelRef = {
        current: null,
      };

      const result = applyMovementAvatarFrameSetupRefsRuntime({
        frameSetupRuntime: {
          activeCalibration: { quality: 0.8 },
          autoCalibrationKind: "upright",
          nextRetargetSourceModel,
          nextSetupState,
        } as never,
        retargetSourceModelRef: retargetSourceModelRef as never,
        setupStateRef: setupStateRef as never,
      });

      expect(setupStateRef.current).toBe(nextSetupState);
      expect(retargetSourceModelRef.current).toBe(nextRetargetSourceModel);
      expect(result).toEqual({
        activeCalibration: { quality: 0.8 },
        autoCalibrationKind: "upright",
      });
    });

    it("allows the retarget source model ref to be cleared", () => {
      const setupStateRef = {
        current: null,
      };
      const retargetSourceModelRef = {
        current: { marker: "previous" },
      };

      applyMovementAvatarFrameSetupRefsRuntime({
        frameSetupRuntime: {
          activeCalibration: null,
          autoCalibrationKind: null,
          nextRetargetSourceModel: null,
          nextSetupState: { marker: "setup" },
        } as never,
        retargetSourceModelRef: retargetSourceModelRef as never,
        setupStateRef: setupStateRef as never,
      });

      expect(retargetSourceModelRef.current).toBeNull();
    });
  });
});

describe("movementAvatarFrameDecisionRuntime (merged)", () => {
  function resolveDecision(pose: TrackingLandmark[]) {
    const neutralPose = makeMovementAvatarProofMotionPayload("standing").landmarks;
    return resolveMovementAvatarPipelineDecision({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutralPose }),
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutralPose }),
      source: {
        poseLandmarks: pose,
      },
      sourceOrigin: "studio",
    });
  }

  function motionFrameForPose(pose: TrackingLandmark[]): MovementMotionFrame {
    return {
      avatarDisplayDecision: resolveDecision(pose),
    } as MovementMotionFrame;
  }

  describe("movementAvatarFrameDecisionRuntime", () => {
    it("returns presentation standby without advancing exercise state when motion frame is missing", () => {
      const previousState = createMovementAvatarExerciseTransitionState();
      const decision = resolveMovementAvatarFrameDecisionRuntime({
        motionFrame: null,
        previousExerciseTransitionState: previousState,
      });

      expect(decision.avatarDecision).toBeNull();
      expect(decision.exerciseTransition).toBeNull();
      expect(decision.motionFrameInput.owner).toBe("presentation-standby");
      expect(decision.nextExerciseTransitionState).toBe(previousState);
    });

    it("advances exercise transition state from the supplied motion frame decision", () => {
      let state = createMovementAvatarExerciseTransitionState();
      const standing = resolveMovementAvatarFrameDecisionRuntime({
        motionFrame: motionFrameForPose(makeMovementAvatarProofMotionPayload("standing").landmarks),
        previousExerciseTransitionState: state,
      });
      state = standing.nextExerciseTransitionState;
      const seated = resolveMovementAvatarFrameDecisionRuntime({
        motionFrame: motionFrameForPose(makeMovementAvatarProofMotionPayload("seated").landmarks),
        previousExerciseTransitionState: state,
      });

      expect(standing.motionFrameInput.owner).toBe("movement-motion-frame");
      expect(standing.exerciseTransition?.key).toBe("stable-upright");
      expect(seated.exerciseTransition?.key).toBe("standing-to-seated");
      expect(seated.nextExerciseTransitionState.previousPose?.poseKey).toBe("chair-seated");
    });
  });
});

describe("movementAvatarFrameDecisionRefsRuntime (merged)", () => {
  describe("movementAvatarFrameDecisionRefsRuntime", () => {
    it("applies the next exercise transition state before falling back without an avatar decision", () => {
      const nextExerciseTransitionState = { marker: "next-state" };
      const exerciseTransitionStateRef = {
        current: { marker: "previous" },
      };

      const result = applyMovementAvatarFrameDecisionRefsRuntime({
        exerciseTransitionStateRef: exerciseTransitionStateRef as never,
        frameDecisionRuntime: {
          avatarDecision: null,
          exerciseTransition: null,
          motionFrameInput: { owner: "presentation-standby" },
          nextExerciseTransitionState,
        } as never,
      });

      expect(exerciseTransitionStateRef.current).toBe(nextExerciseTransitionState);
      expect(result).toEqual({
        status: "fallback-demo-pose",
      });
    });

    it("falls back when the exercise transition is missing", () => {
      const exerciseTransitionStateRef = {
        current: null,
      };

      expect(applyMovementAvatarFrameDecisionRefsRuntime({
        exerciseTransitionStateRef: exerciseTransitionStateRef as never,
        frameDecisionRuntime: {
          avatarDecision: { bodyConfidence: {} },
          exerciseTransition: null,
          motionFrameInput: { owner: "movement-motion-frame" },
          nextExerciseTransitionState: { marker: "next" },
        } as never,
      })).toEqual({
        status: "fallback-demo-pose",
      });
    });

    it("returns ready frame decision values after applying the next exercise state", () => {
      const avatarDecision = { bodyConfidence: {} };
      const exerciseTransition = { key: "stable-upright" };
      const motionFrameInput = { owner: "movement-motion-frame" };
      const nextExerciseTransitionState = { marker: "next-state" };
      const exerciseTransitionStateRef = {
        current: null,
      };

      expect(applyMovementAvatarFrameDecisionRefsRuntime({
        exerciseTransitionStateRef: exerciseTransitionStateRef as never,
        frameDecisionRuntime: {
          avatarDecision,
          exerciseTransition,
          motionFrameInput,
          nextExerciseTransitionState,
        } as never,
      })).toEqual({
        avatarDecision,
        exerciseTransition,
        motionFrameInput,
        status: "ready",
      });
      expect(exerciseTransitionStateRef.current).toBe(nextExerciseTransitionState);
    });
  });
});

describe("movementAvatarLowerBodyFrameStateRuntime (merged)", () => {
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

  describe("movementAvatarLowerBodyFrameStateRuntime", () => {
    it("collects player lower-body hold, visual, and target decisions for a squat frame", () => {
      const runtime = resolveMovementAvatarLowerBodyFrameStateRuntime({
        avatarDecision: resolveDecision({
          avatarRole: "player",
          pose: squatPose(),
        }),
        avatarRole: "player",
        instructorLowerBodyVisualState: createMovementAvatarLowerBodyVisualState(),
        now: 100,
        playerLegRaiseHoldState: createMovementAvatarPlayerLegRaiseHoldState(),
        playerLowerBodyVisualState: {
          squatPresentationDepth: 0.42,
          visualRootDrop: 0.2,
        },
      });

      expect(runtime.shouldApplyLowerBody).toBe(true);
      expect(runtime.shouldApplySolverTorso).toBe(true);
      expect(runtime.liveSquatDepth).toBeGreaterThan(0.12);
      expect(runtime.playerSquatPresentationDepth).toBeGreaterThan(0.18);
      expect(runtime.shouldHoldPlayerSquatPose).toBe(true);
      expect(runtime.lowerBodyTarget.stageDecision?.stage).toBe("player-squat");
      expect(runtime.playerRetargetLowerBodyMotion).toBeGreaterThan(0.4);
    });

    it("keeps instructor visual state separate from player visual state", () => {
      const playerVisualState = {
        squatPresentationDepth: 0.2,
        visualRootDrop: 0.1,
      };
      const runtime = resolveMovementAvatarLowerBodyFrameStateRuntime({
        avatarDecision: resolveDecision({
          avatarRole: "instructor",
          pose: withCorePose(),
        }),
        avatarRole: "instructor",
        instructorLowerBodyVisualState: createMovementAvatarLowerBodyVisualState(),
        now: 100,
        playerLegRaiseHoldState: {
          depth: 0.3,
          expiresAt: 140,
          side: "right",
        },
        playerLowerBodyVisualState: playerVisualState,
      });

      expect(runtime.lowerBodyRuntimeStateDecision.nextPlayerLowerBodyVisualState).toBe(playerVisualState);
      expect(runtime.lowerBodyRuntimeStateDecision.nextInstructorLowerBodyVisualState).not.toBe(playerVisualState);
      expect(runtime.lowerBodyTarget.stageDecision?.stage).toBe("recorded-neutral");
      expect(runtime.visualRootDrop).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("movementAvatarLowerBodyFrameStateRefsRuntime (merged)", () => {
  describe("movementAvatarLowerBodyFrameStateRefsRuntime", () => {
    it("applies the next lower-body frame-state refs and returns the leg-raise hold decision", () => {
      const legRaiseHoldDecision = {
        lowerBodyDrive: { marker: "drive" },
        state: { depth: 0.62, expiresAt: 240, side: "left" },
        wasHeld: true,
      };
      const nextPlayerLegRaiseHoldState = {
        depth: 0.62,
        expiresAt: 240,
        side: "left",
      };
      const nextPlayerLowerBodyVisualState = {
        squatPresentationDepth: 0.35,
        visualRootDrop: 0.12,
      };
      const nextInstructorLowerBodyVisualState = {
        squatPresentationDepth: 0.18,
        visualRootDrop: 0.04,
      };
      const playerLegRaiseHoldRef = {
        current: { depth: 0, expiresAt: 0, side: null },
      };
      const playerLowerBodyStabilityRef = {
        current: { squatPresentationDepth: 0, visualRootDrop: 0 },
      };
      const instructorLowerBodyStabilityRef = {
        current: { squatPresentationDepth: 0, visualRootDrop: 0 },
      };

      const result = applyMovementAvatarLowerBodyFrameStateRefsRuntime({
        instructorLowerBodyStabilityRef: instructorLowerBodyStabilityRef as never,
        lowerBodyFrameStateRuntime: {
          lowerBodyRuntimeStateDecision: {
            legRaiseHoldDecision,
            nextInstructorLowerBodyVisualState,
            nextPlayerLegRaiseHoldState,
            nextPlayerLowerBodyVisualState,
          },
        } as never,
        playerLegRaiseHoldRef: playerLegRaiseHoldRef as never,
        playerLowerBodyStabilityRef: playerLowerBodyStabilityRef as never,
      });

      expect(playerLegRaiseHoldRef.current).toBe(nextPlayerLegRaiseHoldState);
      expect(playerLowerBodyStabilityRef.current).toBe(nextPlayerLowerBodyVisualState);
      expect(instructorLowerBodyStabilityRef.current).toBe(nextInstructorLowerBodyVisualState);
      expect(result).toEqual({
        legRaiseHoldDecision,
      });
    });
  });
});

describe("movementAvatarLowerBodyFrameStateOrchestrationRuntime (merged)", () => {
  const makePose = (): TrackingLandmark[] =>
    Array.from({ length: 33 }, (_, index) => ({
      visibility: 0.9,
      x: 0.45 + index * 0.002,
      y: 0.45,
      z: 0,
    }));

  function corePose() {
    const pose = makePose();
    pose[0] = { visibility: 0.9, x: 0.5, y: 0.28, z: 0 };
    pose[11] = { visibility: 0.9, x: 0.38, y: 0.44, z: 0 };
    pose[12] = { visibility: 0.9, x: 0.62, y: 0.44, z: 0 };
    pose[23] = { visibility: 0.9, x: 0.42, y: 0.68, z: 0 };
    pose[24] = { visibility: 0.9, x: 0.58, y: 0.68, z: 0 };
    pose[25] = { visibility: 0.85, x: 0.44, y: 0.82, z: 0 };
    pose[26] = { visibility: 0.85, x: 0.56, y: 0.82, z: 0 };
    pose[27] = { visibility: 0.8, x: 0.44, y: 0.94, z: 0 };
    pose[28] = { visibility: 0.8, x: 0.56, y: 0.94, z: 0 };
    pose[31] = { visibility: 0.8, x: 0.43, y: 0.97, z: 0 };
    pose[32] = { visibility: 0.8, x: 0.57, y: 0.97, z: 0 };
    return pose;
  }

  function squatPose() {
    const pose = corePose();
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
    const neutralPose = corePose();
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

  describe("movementAvatarLowerBodyFrameStateOrchestrationRuntime", () => {
    it("reads lower-body frame-state refs, applies next refs, and returns the hold decision", () => {
      const playerLegRaiseHoldRef = {
        current: createMovementAvatarPlayerLegRaiseHoldState(),
      };
      const playerLowerBodyStabilityRef = {
        current: {
          squatPresentationDepth: 0.42,
          visualRootDrop: 0.2,
        },
      };
      const instructorLowerBodyStabilityRef = {
        current: createMovementAvatarLowerBodyVisualState(),
      };

      const result = applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime({
        avatarDecision: resolveDecision({
          avatarRole: "player",
          pose: squatPose(),
        }),
        avatarRole: "player",
        instructorLowerBodyStabilityRef,
        now: 100,
        playerLegRaiseHoldRef,
        playerLowerBodyStabilityRef,
      });

      const nextState = result.lowerBodyFrameStateRuntime.lowerBodyRuntimeStateDecision;
      expect(playerLegRaiseHoldRef.current).toBe(nextState.nextPlayerLegRaiseHoldState);
      expect(playerLowerBodyStabilityRef.current).toBe(nextState.nextPlayerLowerBodyVisualState);
      expect(instructorLowerBodyStabilityRef.current).toBe(nextState.nextInstructorLowerBodyVisualState);
      expect(result.legRaiseHoldDecision).toBe(nextState.legRaiseHoldDecision);
      expect(result.lowerBodyFrameStateRuntime.shouldApplyLowerBody).toBe(true);
    });
  });
});

describe("movementAvatarFrameDecisionSnapshotRuntime (merged)", () => {
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
});

describe("movementAvatarFramePreparationOrchestrationRuntime (merged)", () => {
  function resolveDecision(pose: TrackingLandmark[]) {
    const neutralPose = makeMovementAvatarProofMotionPayload("standing").landmarks;
    return resolveMovementAvatarPipelineDecision({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutralPose }),
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutralPose }),
      source: {
        poseLandmarks: pose,
      },
      sourceOrigin: "studio",
    });
  }

  function motionFrameForPose(pose: TrackingLandmark[]): MovementMotionFrame {
    return {
      avatarDisplayDecision: resolveDecision(pose),
    } as MovementMotionFrame;
  }

  describe("movementAvatarFramePreparationOrchestrationRuntime", () => {
    it("updates setup refs before returning fallback when motion frame is missing", () => {
      const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
      const setupStateRef = {
        current: createMovementAvatarSetupState(),
      };
      const retargetSourceModelRef = {
        current: null,
      };
      const exerciseTransitionStateRef = {
        current: createMovementAvatarExerciseTransitionState(),
      };

      const result = applyMovementAvatarFramePreparationOrchestrationRuntime({
        exerciseTransitionStateRef,
        faceLandmarks: null,
        hands: undefined,
        isLivePlayer: true,
        manualCalibration: null,
        motionFrame: null,
        poseLandmarks,
        providedRetargetSourceModel: null,
        retargetSourceModelRef,
        setupStateRef,
        worldPoseLandmarks: undefined,
      });

      expect(result.status).toBe("fallback-demo-pose");
      expect(setupStateRef.current).toBe(result.frameSetupRuntime.nextSetupState);
      expect(retargetSourceModelRef.current).toBe(result.frameSetupRuntime.nextRetargetSourceModel);
      expect(result.frameDecisionRuntime.motionFrameInput.owner).toBe("presentation-standby");
    });

    it("returns ready frame values after applying setup and exercise refs", () => {
      const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
      const setupStateRef = {
        current: createMovementAvatarSetupState(),
      };
      const retargetSourceModelRef = {
        current: null,
      };
      const exerciseTransitionStateRef = {
        current: createMovementAvatarExerciseTransitionState(),
      };

      const result = applyMovementAvatarFramePreparationOrchestrationRuntime({
        exerciseTransitionStateRef,
        faceLandmarks: null,
        hands: undefined,
        isLivePlayer: true,
        manualCalibration: null,
        motionFrame: motionFrameForPose(poseLandmarks),
        poseLandmarks,
        providedRetargetSourceModel: null,
        retargetSourceModelRef,
        setupStateRef,
        worldPoseLandmarks: undefined,
      });

      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      expect(result.motionFrameInput.owner).toBe("movement-motion-frame");
      expect(result.exerciseTransition.key).toBe("stable-upright");
      expect(exerciseTransitionStateRef.current).toBe(result.frameDecisionRuntime.nextExerciseTransitionState);
      expect(setupStateRef.current).toBe(result.frameSetupRuntime.nextSetupState);
    });
  });
});
