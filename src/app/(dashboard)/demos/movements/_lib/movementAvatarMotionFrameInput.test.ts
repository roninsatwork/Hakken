import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarMotionFrameInput,
  shouldHoldMovementAvatarLastPose,
  shouldWaitForMovementAvatarSourceSync,
} from "./movementAvatarMotionFrameInput";
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
  it("holds the last rendered pose across transient active-playback gaps", () => {
    expect(shouldHoldMovementAvatarLastPose({ isPlaying: true, motionFrame: null })).toBe(true);
    expect(shouldHoldMovementAvatarLastPose({ isPlaying: false, motionFrame: null })).toBe(false);
  });

  it("skips only the id-less live-webcam timestamp race, and keeps frame-id sync strict everywhere", () => {
    const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const input = baseInput(poseLandmarks);
    const buildFrame = (
      sourceOrigin: "live-webcam" | "recorded-replay",
      capturedAt: number,
      frameId?: string,
    ) =>
      resolveMovementMotionFrame({
        ...input,
        avatarRole: "player",
        mirrorMode: "facing-player",
        sourceFrame: buildMovementSourceFrame({
          capturedAt,
          frameId,
          poseLandmarks,
          sourceOrigin,
          sourceStatus: "raw",
        }),
      });

    // Real live webcam has NO frame ids. The newest landmark (200) is ahead of
    // the motion frame built one tick behind (100). This must NOT freeze.
    const liveFrame = buildFrame("live-webcam", 100);
    expect(shouldWaitForMovementAvatarSourceSync({
      motionFrame: liveFrame,
      motionRefCapturedAt: 200,
    })).toBe(false);

    // The mounted Game proof drives RECORDED data through the live adapter:
    // source is live-webcam but frames carry ids. Frame-id sync must stay
    // strict so the deterministic proof keeps exact frame identity.
    const proofFrame = buildFrame("live-webcam", 100, "rec:104");
    expect(shouldWaitForMovementAvatarSourceSync({
      motionFrame: proofFrame,
      motionRefFrameId: "rec:105",
    })).toBe(true);
    expect(shouldWaitForMovementAvatarSourceSync({
      motionFrame: proofFrame,
      motionRefFrameId: "rec:104",
    })).toBe(false);

    // Recorded playback (no ids) with a timestamp mismatch still waits.
    const recordedFrame = buildFrame("recorded-replay", 100);
    expect(shouldWaitForMovementAvatarSourceSync({
      motionFrame: recordedFrame,
      motionRefCapturedAt: 200,
    })).toBe(true);
  });

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
