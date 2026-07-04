import { describe, expect, it } from "vitest";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import {
  createMovementAvatarExerciseTransitionState,
  resolveMovementAvatarExerciseTarget,
} from "./movementAvatarExerciseTarget";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";

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

describe("movement avatar exercise target", () => {
  it("keeps exercise transition state outside renderer-local pose refs", () => {
    let state = createMovementAvatarExerciseTransitionState();
    const standing = resolveMovementAvatarExerciseTarget({
      decision: resolveDecision(makeMovementAvatarProofMotionPayload("standing").landmarks),
      previousState: state,
    });
    state = standing.nextState;
    const seated = resolveMovementAvatarExerciseTarget({
      decision: resolveDecision(makeMovementAvatarProofMotionPayload("seated").landmarks),
      previousState: state,
    });
    state = seated.nextState;
    const standingAgain = resolveMovementAvatarExerciseTarget({
      decision: resolveDecision(makeMovementAvatarProofMotionPayload("standing").landmarks),
      previousState: state,
    });

    expect(standing.exerciseTransition.key).toBe("stable-upright");
    expect(seated.exerciseTransition.key).toBe("standing-to-seated");
    expect(seated.previousPose?.poseKey).toBe("standing-neutral");
    expect(standingAgain.exerciseTransition.key).toBe("seated-to-standing");
    expect(standingAgain.previousPose?.poseKey).toBe("chair-seated");
  });
});
