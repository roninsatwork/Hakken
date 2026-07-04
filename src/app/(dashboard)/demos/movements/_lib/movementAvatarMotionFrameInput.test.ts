import { describe, expect, it } from "vitest";
import { resolveMovementAvatarMotionFrameInput } from "./movementAvatarMotionFrameInput";
import {
  resolveMovementAvatarReplayDecision,
  resolveMovementAvatarStudioDecision,
} from "./movementAvatarPipeline";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import { buildMovementSourceFrame } from "./movementSourceFrame";
import { resolveMovementMotionFrame } from "./movementMotionFrame";

function baseInput(poseLandmarks: TrackingLandmark[]) {
  return {
    calibration: buildMovementCalibration({ poseLandmarks }),
    retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks }),
  };
}

describe("movement avatar motion-frame input", () => {
  it("prefers shared MovementMotionFrame decisions over renderer fallback decisions", () => {
    const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const input = baseInput(poseLandmarks);
    const fallbackDecision = resolveMovementAvatarReplayDecision({
      ...input,
      avatarRole: "instructor",
      source: { poseLandmarks },
    });
    const motionFrame = resolveMovementMotionFrame({
      ...input,
      avatarRole: "player",
      mirrorMode: "facing-player",
      sourceFrame: buildMovementSourceFrame({
        poseLandmarks,
        sourceOrigin: "live-webcam",
        sourceStatus: "raw",
      }),
    });

    const selected = resolveMovementAvatarMotionFrameInput({
      fallbackDecision,
      motionFrame,
    });

    expect(selected.owner).toBe("movement-motion-frame");
    expect(selected.decision).toBe(motionFrame.avatarDecision);
    expect(selected.decision).not.toBe(fallbackDecision);
  });

  it("uses renderer fallback while routes are not yet wired to provide a motion frame", () => {
    const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const fallbackDecision = resolveMovementAvatarStudioDecision({
      ...baseInput(poseLandmarks),
      avatarRole: "player",
      source: { poseLandmarks },
    });

    const selected = resolveMovementAvatarMotionFrameInput({
      fallbackDecision,
      motionFrame: null,
    });

    expect(selected.owner).toBe("renderer-fallback");
    expect(selected.decision).toBe(fallbackDecision);
  });
});
