import { describe, expect, test } from "vitest";
import {
  buildMovementFrameEnvelope,
  getFrameLandmarks,
  isInlinePoseData,
  parseMovementFramePayload,
} from "./movementFrameCodec";

const landmark = { x: 0.1, y: 0.2, z: 0.3, visibility: 0.9 };

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
    const envelope = buildMovementFrameEnvelope([{ landmarks: [landmark] }], 60);
    const result = parseMovementFramePayload(JSON.stringify(envelope), "legacy-storage-json");

    expect(result.format).toBe("storage-json-v1");
    expect(result.fps).toBe(60);
    expect(result.schemaVersion).toBe(1);
    expect(getFrameLandmarks(result.frames[0])).toEqual([landmark]);
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
