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

const denseBody = {
  adapter: {
    inferenceDurationMs: 31,
    inputHeight: 360,
    inputWidth: 640,
    profileId: "movement-dense-capture-adapter-v1" as const,
    qualityTier: "medium" as const,
    runtime: "webgpu" as const,
    targetIntervalMs: 180,
  },
  anchors: [{
    anatomicalSide: "midline" as const,
    depth: 0.2,
    id: "chest-front-000",
    image: { x: 0.5, y: 0.4 },
    normal: { x: 0, y: 0, z: 1 },
    occluded: false,
    provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 10_000, origin: "model-estimated" as const, sourceTimestampMs: 1_000 },
    region: "chest" as const,
    surface: "front" as const,
  }],
  modelHash: `sha256:${"a".repeat(64)}`,
  modelId: "candidate@1",
  segmentation: {
    confidence: 0.9,
    coverage: 0.5,
    encoding: "model-rle" as const,
    frameHeight: 720,
    frameWidth: 1280,
    maskHeight: 2,
    maskWidth: 2,
    payload: [[0, 1], [1, 2]],
    provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 10_000, origin: "model-estimated" as const, sourceTimestampMs: 1_000 },
  },
};

describe("movement recording replay", () => {
  it("preserves complete pose, hand, face, timing, and input-contract evidence", () => {
    const frame: MovementFrame = {
      acquisitionProfileId: "movement-deep-capture-v1",
      blendshapes: [{ categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", index: 0, score: 0.8 }],
      camera: { facingMode: "user", frameHeight: 720, frameWidth: 1280 },
      capturedAt: 10_000,
      deepCapture: { denseBody, profileId: "movement-deep-capture-v1" },
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
      deepCaptureChannelSummary: {
        denseBody: { complete: false, presentFrames: 0, totalFrames: 1 },
        eyesGaze: { complete: false, presentFrames: 0, totalFrames: 1 },
        face: { complete: false, presentFrames: 0, totalFrames: 1 },
        leftHand: { complete: false, presentFrames: 0, totalFrames: 1 },
        palmWrist: { complete: false, presentFrames: 0, totalFrames: 1 },
        rightHand: { complete: false, presentFrames: 0, totalFrames: 1 },
        segmentation: { complete: false, presentFrames: 0, totalFrames: 1 },
      },
      deepCaptureProfile: {
        anchorTarget: { maximum: 500, minimum: 200 },
        channels: ["denseBody"],
        denseAdapter: {
          id: "movement-dense-capture-adapter-v1",
          maximumBackoffMs: 1000,
          qualityProfiles: {
            high: { inputHeight: 540, inputWidth: 960, internalResolution: "medium", targetIntervalMs: 100 },
            medium: { inputHeight: 360, inputWidth: 640, internalResolution: "medium", targetIntervalMs: 180 },
            low: { inputHeight: 216, inputWidth: 384, internalResolution: "low", targetIntervalMs: 300 },
          },
          staleAfterMs: 300,
          targetIntervalMs: 100,
        },
        id: "movement-deep-capture-v1",
        privacy: { persistRawRgbByDefault: false, persistRawVideoByDefault: false },
        refinement: {
          id: "movement-deep-capture-refinement-v1",
          maximumBackoffMs: 500,
          maximumInputEdgePixels: 512,
          minimumFaceInputPixels: 256,
          minimumHandInputPixels: 192,
          staleAfterMs: 150,
          targetIntervalMs: 66,
        },
        schemaVersion: 3,
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
    expect(session.deepCaptureProfile?.id).toBe("movement-deep-capture-v1");
    expect(session.samples[0]?.capturedAt).toBe(10_000);
    expect(session.samples[0]?.acquisitionProfileId).toBe("movement-deep-capture-v1");
    expect(session.samples[0]?.tracking.pose).toHaveLength(33);
    expect(session.samples[0]?.tracking.worldPose).toHaveLength(33);
    expect(session.samples[0]?.tracking.face).toHaveLength(3);
    expect(session.samples[0]?.tracking.hands?.left?.landmarks).toHaveLength(21);
    expect(session.samples[0]?.tracking.deepCapture?.profileId).toBe("movement-deep-capture-v1");
    expect(session.samples[0]?.tracking.deepCapture?.denseBody).toEqual(denseBody);
    expect(session.samples[0]?.tracking.deepCapture?.denseBody?.anchors[0]?.id).toBe(
      "chest-front-000",
    );
    expect(session.samples[0]?.tracking.blendshapes?.[0]).toMatchObject({
      categoryName: "eyeBlinkLeft",
      score: 0.8,
    });
  });
});
