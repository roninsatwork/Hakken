import { describe, expect, it } from "vitest";
import {
  createMovementAvatarExerciseTransitionState,
} from "./movementAvatarExerciseTarget";
import { applyMovementAvatarFramePreparationOrchestrationRuntime } from "./movementAvatarFramePreparationOrchestrationRuntime";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { createMovementAvatarSetupState } from "./movementAvatarSetup";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import type { MovementMotionFrame } from "./movementMotionFrame";

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
