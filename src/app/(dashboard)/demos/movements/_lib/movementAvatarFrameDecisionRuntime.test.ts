import { describe, expect, it } from "vitest";
import {
  createMovementAvatarExerciseTransitionState,
} from "./movementAvatarExerciseTarget";
import {
  resolveMovementAvatarFrameDecisionRuntime,
} from "./movementAvatarFrameDecisionRuntime";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
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
