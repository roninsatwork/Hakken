import { describe, expect, test } from "vitest";
import {
  buildMovementFrameEnvelope,
  getFrameLandmarks,
  isInlinePoseData,
  parseMovementFramePayload,
  hashMovementFrameEnvelopeSource,
} from "./movementFrameCodec";
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
