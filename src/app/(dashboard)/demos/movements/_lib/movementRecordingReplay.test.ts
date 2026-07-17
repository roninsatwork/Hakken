import { describe, expect, it } from "vitest";
import { buildMovementReplaySessionFromRecording } from "./movementRecordingReplay";
import type { MovementFrame } from "./movementTypes";

function landmarks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    visibility: 0.9,
    x: index * 0.01,
    y: index * 0.02,
    z: index * -0.005,
  }));
}

describe("movement recording replay", () => {
  it("preserves complete pose, hand, face, timing, and input-contract evidence", () => {
    const frame: MovementFrame = {
      acquisitionProfileId: "movement-player-input-v1",
      blendshapes: [{ categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", index: 0, score: 0.8 }],
      camera: { facingMode: "user", frameHeight: 720, frameWidth: 1280 },
      capturedAt: 10_000,
      faceLandmarks: landmarks(3),
      hands: {
        left: { landmarks: landmarks(21), worldLandmarks: landmarks(21) },
        right: null,
      },
      landmarks: landmarks(33),
      sourceTimestampMs: 1_000,
      timestamp: 1_000,
      worldLandmarks: landmarks(33),
    };
    const session = buildMovementReplaySessionFromRecording({
      _id: "movement-id",
      createdAt: 9_000,
      poseData: "storage-id",
      title: "Complete movement",
    }, [frame], 30, {
      channelSummary: {
        blendshapes: { complete: true, presentFrames: 1, totalFrames: 1 },
        camera: { complete: true, presentFrames: 1, totalFrames: 1 },
        face: { complete: true, presentFrames: 1, totalFrames: 1 },
        hands: { complete: true, presentFrames: 1, totalFrames: 1 },
        pose: { complete: true, presentFrames: 1, totalFrames: 1 },
        worldPose: { complete: true, presentFrames: 1, totalFrames: 1 },
      },
      inputContract: {
        detector: {
          faceModelUrl: "face",
          handConfidence: 0.6,
          handModelUrl: "hand",
          id: "mediapipe-vision-v1",
          poseConfidence: 0.7,
          poseModelUrl: "pose",
          wasmUrl: "wasm",
        },
        filters: {
          hand: { beta: 0.08, frequency: 60, landmarkCount: 21, minCutoff: 1.6 },
          pose: { beta: 0.1, frequency: 60, landmarkCount: 33, minCutoff: 0.05 },
        },
        id: "movement-player-input-v1",
        setup: { prefixFrameCount: 60, sampleLimit: 12 },
      },
      setupPrefix: { complete: false, frameIndexes: [0], requiredFrameCount: 60 },
    });

    expect(session.inputContract?.id).toBe("movement-player-input-v1");
    expect(session.setupPrefix?.requiredFrameCount).toBe(60);
    expect(session.channelSummary?.hands.complete).toBe(true);
    expect(session.samples[0]?.capturedAt).toBe(10_000);
    expect(session.samples[0]?.tracking.pose).toHaveLength(33);
    expect(session.samples[0]?.tracking.worldPose).toHaveLength(33);
    expect(session.samples[0]?.tracking.face).toHaveLength(3);
    expect(session.samples[0]?.tracking.hands?.left?.landmarks).toHaveLength(21);
    expect(session.samples[0]?.tracking.blendshapes?.[0]).toMatchObject({
      categoryName: "eyeBlinkLeft",
      score: 0.8,
    });
  });
});
