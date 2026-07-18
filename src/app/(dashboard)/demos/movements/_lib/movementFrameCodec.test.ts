import { describe, expect, test } from "vitest";
import {
  buildMovementDeepCaptureFrameEnvelope,
  buildMovementFrameEnvelope,
  getFrameLandmarks,
  isInlinePoseData,
  parseMovementFramePayload,
  hashMovementFrameEnvelopeSource,
} from "./movementFrameCodec";
import type { MovementFramePayload } from "./movementTypes";
import type { MovementStartReadiness } from "./movementSourceFrame";

const landmark = { x: 0.1, y: 0.2, z: 0.3, visibility: 0.9 };
const captureStartReadiness: MovementStartReadiness = {
  blockedReasons: [],
  calibrationQuality: 0.9,
  canStartGame: true,
  canStartRecording: true,
  countdownMsRemaining: 0,
  promptEvents: [],
  requiredBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
  state: "ready",
  visibleBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
};

describe("movement frame codec", () => {
  test("detects inline legacy JSON separately from storage ids", () => {
    expect(isInlinePoseData("[{\"x\":0}]")).toBe(true);
    expect(isInlinePoseData("{\"frames\":[]}")).toBe(true);
    expect(isInlinePoseData("kg2a7p9storageid")).toBe(false);
  });

  test("parses legacy frame arrays", () => {
    const result = parseMovementFramePayload(JSON.stringify([[landmark]]), "legacy-inline-json");

    expect(result.format).toBe("legacy-inline-json");
    expect(result.fps).toBe(30);
    expect(getFrameLandmarks(result.frames[0])).toEqual([landmark]);
  });

  test("parses versioned frame envelopes", () => {
    const envelope = buildMovementFrameEnvelope([{ landmarks: [landmark] }], 60, {
      captureStartReadiness,
    });
    const result = parseMovementFramePayload(JSON.stringify(envelope), "legacy-storage-json");

    expect(result.format).toBe("storage-json-v2");
    expect(result.fps).toBe(60);
    expect(result.schemaVersion).toBe(2);
    expect(result.captureStartReadiness).toEqual(captureStartReadiness);
    expect(result.inputContract).toMatchObject({
      id: "movement-player-input-v1",
      setup: { prefixFrameCount: 60, sampleLimit: 12 },
    });
    expect(result.setupPrefix).toEqual({
      complete: false,
      frameIndexes: [0],
      requiredFrameCount: 60,
    });
    expect(result.channelSummary?.pose).toEqual({
      complete: false,
      presentFrames: 0,
      totalFrames: 1,
    });
    expect(getFrameLandmarks(result.frames[0])).toEqual([landmark]);
  });

  test("does not silently store Deep Capture evidence inside schema v2", () => {
    const envelope = buildMovementFrameEnvelope([{
      deepCapture: { profileId: "movement-deep-capture-v1" },
      landmarks: [landmark],
    }]);

    expect(envelope.schemaVersion).toBe(2);
    expect(Array.isArray(envelope.frames[0])).toBe(false);
    expect((envelope.frames[0] as { deepCapture?: unknown }).deepCapture).toBeUndefined();
  });

  test("builds and parses schema-v3 Deep Capture packets without persisting raw imagery", () => {
    const provenance = {
      ageMs: 0,
      confidence: 0.94,
      inferenceTimestampMs: 100,
      origin: "model-estimated" as const,
      sourceTimestampMs: 100,
    };
    const crop = {
      height: 256,
      sourceFrameHeight: 1080,
      sourceFrameWidth: 1920,
      width: 256,
      x: 320,
      y: 180,
    };
    const handEvidence = {
      assignment: "pose-wrist-reconciled" as const,
      crop,
      detectorHandedness: { label: "Left" as const, score: 0.97 },
      orientation: {
        facing: "palm-facing-camera" as const,
        palmNormal: { x: 0, y: 0, z: -1 },
        provenance: { ...provenance, origin: "derived" as const },
        wristRotation: { x: 0.1, y: 0.2, z: 0.3 },
      },
      provenance,
      tracking: { occluded: false, state: "observed" as const },
    };
    const frame: MovementFramePayload = {
      acquisitionProfileId: "movement-deep-capture-v1",
      blendshapes: [{ categoryName: "eyeBlinkLeft", score: 0.8 }],
      camera: { facingMode: "user", frameHeight: 1080, frameWidth: 1920 },
      capturedAt: 100,
      deepCapture: {
        denseBody: {
          anchors: Array.from({ length: 200 }, (_, index) => ({
            anatomicalSide: "midline" as const,
            depth: 0.3,
            id: `chest-${index}`,
            image: { x: 0.5, y: 0.5 },
            normal: { x: 0, y: 0, z: 1 },
            occluded: false,
            provenance,
            region: "chest" as const,
            surface: "front" as const,
          })),
          modelHash: "sha256:model",
          modelId: "dense-model-v1",
          segmentation: {
            confidence: 0.93,
            coverage: 0.51,
            encoding: "derived-contour",
            frameHeight: 1080,
            frameWidth: 1920,
            maskHeight: 256,
            maskWidth: 256,
            payload: [[0, 0], [1, 1]],
            provenance,
          },
        },
        face: {
          crop,
          eyeVisibility: { eyewear: "unknown", left: "visible", right: "visible" },
          facialTransformationMatrix: Array.from({ length: 16 }, (_, index) => index),
          gaze: {
            fused: { x: 0, y: 0, z: -1 },
            left: { x: -0.01, y: 0, z: -1 },
            provenance: { ...provenance, origin: "derived" },
            right: { x: 0.01, y: 0, z: -1 },
          },
          irisLandmarkCount: 10,
          provenance,
          tracking: { occluded: false, state: "observed" },
        },
        hands: {
          left: handEvidence,
          right: {
            ...handEvidence,
            detectorHandedness: { label: "Right", score: 0.96 },
          },
        },
        profileId: "movement-deep-capture-v1",
      },
      faceLandmarks: Array.from({ length: 478 }, () => landmark),
      hands: {
        left: { landmarks: Array.from({ length: 21 }, () => landmark) },
        right: { landmarks: Array.from({ length: 21 }, () => landmark) },
      },
      landmarks: Array.from({ length: 33 }, () => landmark),
      sourceTimestampMs: 100,
      worldLandmarks: Array.from({ length: 33 }, () => landmark),
    };

    const envelope = buildMovementDeepCaptureFrameEnvelope([frame], 30, {
      captureStartReadiness,
    });
    const parsed = parseMovementFramePayload(JSON.stringify(envelope), "legacy-storage-json");

    expect(envelope.schemaVersion).toBe(3);
    expect(envelope.deepCaptureProfile).toMatchObject({
      id: "movement-deep-capture-v1",
      privacy: {
        persistRawRgbByDefault: false,
        persistRawVideoByDefault: false,
      },
    });
    expect(envelope.deepCaptureChannelSummary).toMatchObject({
      denseBody: { complete: true, presentFrames: 1, totalFrames: 1 },
      eyesGaze: { complete: true, presentFrames: 1, totalFrames: 1 },
      leftHand: { complete: true, presentFrames: 1, totalFrames: 1 },
      palmWrist: { complete: true, presentFrames: 1, totalFrames: 1 },
      rightHand: { complete: true, presentFrames: 1, totalFrames: 1 },
      segmentation: { complete: true, presentFrames: 1, totalFrames: 1 },
    });
    expect(parsed.format).toBe("storage-json-v3");
    expect(parsed.deepCaptureProfile?.id).toBe("movement-deep-capture-v1");
    expect(JSON.stringify(envelope)).not.toContain("data:image");
  });

  test("keeps version-one recording envelopes readable", () => {
    const result = parseMovementFramePayload({
      schemaVersion: 1,
      fps: 30,
      frames: [{ landmarks: [landmark] }],
    }, "legacy-storage-json");

    expect(result.format).toBe("storage-json-v1");
    expect(result.schemaVersion).toBe(1);
  });

  test("hashes the complete source packet and detects source changes", async () => {
    const envelope = buildMovementFrameEnvelope([{ landmarks: [landmark] }]);
    const originalHash = await hashMovementFrameEnvelopeSource(envelope);
    const repeatedHash = await hashMovementFrameEnvelopeSource(envelope);
    const changedHash = await hashMovementFrameEnvelopeSource({
      ...envelope,
      frames: [{ landmarks: [{ ...landmark, x: 0.2 }] }],
    });

    expect(originalHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(repeatedHash).toBe(originalHash);
    expect(changedHash).not.toBe(originalHash);
  });

  test("normalizes pose and landmarks frame shapes", () => {
    expect(getFrameLandmarks({ pose: [landmark] })).toEqual([landmark]);
    expect(getFrameLandmarks({ landmarks: [landmark] })).toEqual([landmark]);
  });

  test("rejects corrupt payloads", () => {
    expect(() => parseMovementFramePayload("{\"bad\":true}", "legacy-inline-json")).toThrow(
      "Movement pose payload"
    );
  });
});
