import { describe, expect, it } from "vitest";
import { resolveMovementAvatarMotionFrameInput } from "./movementAvatarMotionFrameInput";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipelineDecision";

type MovementAvatarPipelineDecisionInput = Parameters<typeof resolveMovementAvatarPipelineDecision>[0];

const resolveMovementAvatarReplayDecision = (
  input: Omit<MovementAvatarPipelineDecisionInput, "sourceOrigin">,
) => resolveMovementAvatarPipelineDecision({ ...input, sourceOrigin: "replay" });

const resolveMovementAvatarStudioDecision = (
  input: Omit<MovementAvatarPipelineDecisionInput, "sourceOrigin">,
) => resolveMovementAvatarPipelineDecision({ ...input, sourceOrigin: "studio" });
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
    expect(selected.sourceOrigin).toBe("live-webcam");
    expect(selected.decision).toBe(motionFrame.avatarDisplayDecision);
    expect(selected.headTarget).toBe(motionFrame.avatarDisplayHeadTarget);
    expect(selected.decision).not.toBe(fallbackDecision);
  });

  it("does not resolve renderer fallback decisions when a shared motion frame is present", () => {
    const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const input = baseInput(poseLandmarks);
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
    let fallbackCalls = 0;

    const selected = resolveMovementAvatarMotionFrameInput({
      getFallbackDecision: () => {
        fallbackCalls += 1;
        return resolveMovementAvatarReplayDecision({
          ...input,
          avatarRole: "instructor",
          source: { poseLandmarks },
        });
      },
      motionFrame,
    });

    expect(selected.owner).toBe("movement-motion-frame");
    expect(selected.decision).toBe(motionFrame.avatarDisplayDecision);
    expect(fallbackCalls).toBe(0);
  });

  it("uses the display avatar decision for renderer application when source and display decisions differ", () => {
    const sourcePose = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const displayPose = makeMovementAvatarProofMotionPayload("squat").landmarks;
    const input = baseInput(sourcePose);
    const motionFrame = resolveMovementMotionFrame({
      ...input,
      avatarRole: "player",
      displayPoseLandmarks: displayPose,
      mirrorMode: "facing-player",
      sourceFrame: buildMovementSourceFrame({
        poseLandmarks: sourcePose,
        sourceOrigin: "live-webcam",
        sourceStatus: "raw",
      }),
    });

    const selected = resolveMovementAvatarMotionFrameInput({
      motionFrame,
      requiresMotionFrame: true,
    });

    expect(motionFrame.avatarDecision.lowerBodyIntent.label).toBe("neutral");
    expect(motionFrame.avatarDisplayDecision.lowerBodyIntent.label).toBe("squat");
    expect(selected.decision).toBe(motionFrame.avatarDisplayDecision);
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

  it("lazily resolves renderer fallback while routes are not yet wired to provide a motion frame", () => {
    const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const fallbackDecision = resolveMovementAvatarStudioDecision({
      ...baseInput(poseLandmarks),
      avatarRole: "player",
      source: { poseLandmarks },
    });
    let fallbackCalls = 0;

    const selected = resolveMovementAvatarMotionFrameInput({
      getFallbackDecision: () => {
        fallbackCalls += 1;
        return fallbackDecision;
      },
      motionFrame: null,
    });

    expect(selected.owner).toBe("renderer-fallback");
    expect(selected.decision).toBe(fallbackDecision);
    expect(fallbackCalls).toBe(1);
  });

  it("prefers an explicit renderer fallback over lazy fallback resolution", () => {
    const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const fallbackDecision = resolveMovementAvatarStudioDecision({
      ...baseInput(poseLandmarks),
      avatarRole: "player",
      source: { poseLandmarks },
    });
    let fallbackCalls = 0;

    const selected = resolveMovementAvatarMotionFrameInput({
      fallbackDecision,
      getFallbackDecision: () => {
        fallbackCalls += 1;
        return resolveMovementAvatarReplayDecision({
          ...baseInput(poseLandmarks),
          avatarRole: "instructor",
          source: { poseLandmarks },
        });
      },
      motionFrame: null,
    });

    expect(selected.owner).toBe("renderer-fallback");
    expect(selected.decision).toBe(fallbackDecision);
    expect(fallbackCalls).toBe(0);
  });

  it("throws when an unwired route has no renderer fallback decision", () => {
    expect(() => resolveMovementAvatarMotionFrameInput({
      motionFrame: null,
    })).toThrow("Movement avatar fallback decision is required when motion frame is absent.");
  });

  it("uses presentation standby instead of renderer fallback when a wired route has no current motion frame yet", () => {
    const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
    let fallbackCalls = 0;

    const selected = resolveMovementAvatarMotionFrameInput({
      getFallbackDecision: () => {
        fallbackCalls += 1;
        return resolveMovementAvatarStudioDecision({
          ...baseInput(poseLandmarks),
          avatarRole: "player",
          source: { poseLandmarks },
        });
      },
      motionFrame: null,
      requiresMotionFrame: true,
    });

    expect(selected.owner).toBe("presentation-standby");
    expect(selected.decision).toBeNull();
    expect(fallbackCalls).toBe(0);
  });
});
