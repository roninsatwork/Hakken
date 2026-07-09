import { describe, expect, it } from "vitest";
import { buildLiveMovementMotionFrame } from "./movementLiveMotionFrame";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import { buildMovementCalibration } from "./movementTrackingCalibration";

describe("movementLiveMotionFrame", () => {
  it("adapts live player input into the shared motion-frame contract", () => {
    const neutral = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const payload = {
      ...makeMovementAvatarProofMotionPayload("left-leg-raise"),
      blendshapes: [{ categoryName: "mouthSmileLeft", displayName: "mouthSmileLeft", index: 0, score: 0.6 }],
    };
    const motionFrame = buildLiveMovementMotionFrame({
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      capturedAt: 1234,
      isPlaying: true,
      motionRef: payload,
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    });

    expect(motionFrame).not.toBeNull();
    expect(motionFrame?.source.sourceOrigin).toBe("live-webcam");
    expect(motionFrame?.source.sourceStatus).toBe("smoothed");
    expect(motionFrame?.source.capturedAt).toBe(1234);
    expect(motionFrame?.mirrorMode).toBe("facing-player");
    expect(motionFrame?.source.landmarks.pose).not.toBe(payload.landmarks);
    expect(motionFrame?.source.landmarks.pose[0]?.x).toBe(payload.landmarks[0]?.x);
    expect(motionFrame?.source.landmarks.blendshapes).toEqual(payload.blendshapes);
    expect(motionFrame?.displayLandmarks.pose).not.toBe(payload.landmarks);
    expect(motionFrame?.displayLandmarks.pose[0]?.x).toBeCloseTo(1 - (payload.landmarks[0]?.x ?? 0));
    expect(motionFrame?.avatarDecision.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(true);
  });

  it("returns null until live pose evidence is available", () => {
    expect(buildLiveMovementMotionFrame({
      calibration: null,
      isPlaying: true,
      motionRef: null,
      retargetSourceModel: null,
    })).toBeNull();
  });

  it("passes previous live motion frames into shared readability holds", () => {
    const neutral = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const previousMotionFrame = buildLiveMovementMotionFrame({
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      capturedAt: 3000,
      isPlaying: true,
      motionRef: makeMovementAvatarProofMotionPayload("squat"),
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    });
    const weakPayload = {
      ...makeMovementAvatarProofMotionPayload("standing"),
      landmarks: neutral.map((landmark) => ({ ...landmark, visibility: 0.05 })),
    };
    const motionFrame = buildLiveMovementMotionFrame({
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      capturedAt: 3100,
      isPlaying: true,
      motionRef: weakPayload,
      previousMotionFrame,
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    });

    expect(previousMotionFrame?.readability.readableMovementStrength).toBeGreaterThan(0.1);
    expect(motionFrame?.readability.state).toBe("held");
    expect(motionFrame?.held).toEqual(["readability"]);
  });

  it("keeps live source landmarks independent from mirrored display landmarks", () => {
    const neutral = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const payload = makeMovementAvatarProofMotionPayload("left-leg-raise");
    const motionFrame = buildLiveMovementMotionFrame({
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      capturedAt: 5000,
      isPlaying: false,
      motionRef: payload,
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    });

    expect(motionFrame).not.toBeNull();
    expect(motionFrame?.source.landmarks.pose).not.toBe(payload.landmarks);
    expect(motionFrame?.source.landmarks.pose[25]?.x).toBe(payload.landmarks[25]?.x);
    expect(motionFrame?.displayLandmarks.pose).not.toBe(payload.landmarks);
    expect(motionFrame?.displayLandmarks.pose[26]?.x).toBeCloseTo(1 - (payload.landmarks[25]?.x ?? 0));
  });

  it("keeps live source world pose, hands, and blendshapes independent from display preparation", () => {
    const neutral = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const payload = {
      ...makeMovementAvatarProofMotionPayload("hands-front"),
      blendshapes: [{ categoryName: "mouthSmileLeft", displayName: "mouthSmileLeft", index: 0, score: 0.45 }],
    };
    const worldLandmarks = payload.landmarks.map((landmark) => ({ ...landmark, z: (landmark.z ?? 0) + 0.05 }));
    const payloadWithWorldPose = {
      ...payload,
      worldLandmarks,
    };
    const motionFrame = buildLiveMovementMotionFrame({
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      capturedAt: 5100,
      isPlaying: true,
      motionRef: payloadWithWorldPose,
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    });

    expect(motionFrame).not.toBeNull();
    expect(motionFrame?.source.landmarks.worldPose).not.toBe(worldLandmarks);
    expect(motionFrame?.source.landmarks.worldPose[0]?.z).toBe(worldLandmarks[0]?.z);
    expect(motionFrame?.source.landmarks.hands).toEqual(payload.hands);
    expect(motionFrame?.source.landmarks.blendshapes).toEqual(payload.blendshapes);
    expect(motionFrame?.displayLandmarks.worldPose).not.toBe(worldLandmarks);
    expect(motionFrame?.displayLandmarks.pose).not.toBe(payload.landmarks);
  });
});
