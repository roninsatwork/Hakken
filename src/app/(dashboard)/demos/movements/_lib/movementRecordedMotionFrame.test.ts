import { describe, expect, it } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildRecordedMovementMotionFrame } from "./movementRecordedMotionFrame";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";

describe("movementRecordedMotionFrame", () => {
  it("adapts recorded instructor input into the shared motion-frame contract", () => {
    const neutral = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const payload = {
      ...makeMovementAvatarProofMotionPayload("squat"),
      blendshapes: [{ categoryName: "mouthSmileRight", displayName: "mouthSmileRight", index: 1, score: 0.55 }],
    };
    const motionFrame = buildRecordedMovementMotionFrame({
      capturedAt: 2345,
      isPlaying: true,
      motionRef: payload,
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    });

    expect(motionFrame).not.toBeNull();
    expect(motionFrame?.source.sourceOrigin).toBe("recorded-replay");
    expect(motionFrame?.source.sourceStatus).toBe("decoded");
    expect(motionFrame?.source.capturedAt).toBe(2345);
    expect(motionFrame?.mirrorMode).toBe("facing-player");
    expect(motionFrame?.source.landmarks.pose).toBe(payload.landmarks);
    expect(motionFrame?.source.landmarks.pose[0]?.x).toBe(payload.landmarks[0]?.x);
    expect(motionFrame?.source.landmarks.blendshapes).toBe(payload.blendshapes);
    expect(motionFrame?.displayLandmarks.pose).not.toBe(payload.landmarks);
    expect(motionFrame?.displayLandmarks.pose[0]?.x).toBeCloseTo(1 - (payload.landmarks[0]?.x ?? 0));
    expect(motionFrame?.avatarDecision.retargetFrame.squatDepth).toBeGreaterThan(0);
  });

  it("returns null until recorded pose evidence is available", () => {
    expect(buildRecordedMovementMotionFrame({
      isPlaying: true,
      motionRef: null,
      retargetSourceModel: null,
    })).toBeNull();
  });

  it("passes previous recorded motion frames into shared readability holds", () => {
    const neutral = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const previousMotionFrame = buildRecordedMovementMotionFrame({
      capturedAt: 4000,
      isPlaying: true,
      motionRef: makeMovementAvatarProofMotionPayload("squat"),
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    });
    const weakPayload = {
      ...makeMovementAvatarProofMotionPayload("standing"),
      landmarks: neutral.map((landmark) => ({ ...landmark, visibility: 0.05 })),
    };
    const motionFrame = buildRecordedMovementMotionFrame({
      capturedAt: 4100,
      isPlaying: true,
      motionRef: weakPayload,
      previousMotionFrame,
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    });

    expect(previousMotionFrame?.readability.readableMovementStrength).toBeGreaterThan(0.1);
    expect(motionFrame?.readability.state).toBe("held");
    expect(motionFrame?.held).toEqual(["readability"]);
  });
});
