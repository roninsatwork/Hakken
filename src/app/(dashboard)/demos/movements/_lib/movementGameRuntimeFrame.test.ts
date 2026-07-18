import { describe, expect, it } from "vitest";
import { makeMovementAvatarProofPose } from "./movementAvatarProofFixtures";
import { buildMovementGameInstructorRuntimeFrame } from "./movementGameRuntimeFrame";

describe("buildMovementGameInstructorRuntimeFrame", () => {
  const pose = makeMovementAvatarProofPose("standing");

  it("preserves a recorded payload timestamp", () => {
    const frame = buildMovementGameInstructorRuntimeFrame({
      isPlaying: true,
      motionRef: { capturedAt: 123_456, landmarks: pose },
      retargetSourceModel: null,
    });

    expect(frame?.source.capturedAt).toBe(123_456);
  });

  it("allows an explicit adapter timestamp to override the payload", () => {
    const frame = buildMovementGameInstructorRuntimeFrame({
      capturedAt: 654_321,
      isPlaying: true,
      motionRef: { capturedAt: 123_456, landmarks: pose },
      retargetSourceModel: null,
    });

    expect(frame?.source.capturedAt).toBe(654_321);
  });

  it("carries Deep Capture evidence through the shared Game source boundary", () => {
    const deepCapture = {
      denseBody: {
        adapter: {
          inferenceDurationMs: 30,
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
          id: "pelvis-front-000",
          image: { x: 0.5, y: 0.6 },
          normal: { x: 0, y: 0, z: 1 },
          occluded: false,
          provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated" as const, sourceTimestampMs: 1 },
          region: "pelvis" as const,
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
          provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated" as const, sourceTimestampMs: 1 },
        },
      },
      profileId: "movement-deep-capture-v1" as const,
    };
    const frame = buildMovementGameInstructorRuntimeFrame({
      isPlaying: true,
      motionRef: { deepCapture, landmarks: pose },
      retargetSourceModel: null,
    });

    expect(frame?.source.landmarks.deepCapture).toEqual(deepCapture);
    expect(frame?.source.landmarks.deepCapture?.denseBody?.modelId).toBe("candidate@1");
    expect(frame?.source.landmarks.deepCapture?.denseBody?.anchors[0]?.id).toBe(
      "pelvis-front-000",
    );
  });
});
