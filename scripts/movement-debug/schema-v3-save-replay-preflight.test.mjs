import { describe, expect, it, vi } from "vitest";
import {
  DEEP_CAPTURE_TEST_READINESS,
  createCompleteDeepCaptureFrames,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementDeepCaptureTestFixture";
import { saveMovementRecording } from "../../src/app/(dashboard)/demos/movements/_lib/saveMovementRecording";
import { loadMovementReplayRecording } from "../../src/app/(dashboard)/demos/movements/_lib/movementRecordingReplay";
import { validateCompleteReplayGamePacket } from "./run-replay-mounted-game-packet-proof.mjs";

describe("schema-v3 save to Replay/Game preflight", () => {
  it("accepts the exact JSON emitted by the browser save path", async () => {
    const uploadFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ storageId: "schema-v3-storage-id" }),
    }));

    await expect(saveMovementRecording({
      title: "Schema-v3 saved packet",
      difficulty: "Intermediate",
      captureStartReadiness: DEEP_CAPTURE_TEST_READINESS,
      frames: createCompleteDeepCaptureFrames(),
      generateUploadUrl: vi.fn(async () => "https://upload.example"),
      createMovement: vi.fn(async () => "schema-v3-recording-id"),
      uploadFetch,
      requireDeepCapturePacket: true,
    })).resolves.toBe("schema-v3-recording-id");

    const uploadBody = uploadFetch.mock.calls[0]?.[1]?.body;
    expect(typeof uploadBody).toBe("string");
    const replay = await loadMovementReplayRecording({
      _id: "schema-v3-recording-id",
      captureFps: 30,
      poseData: uploadBody,
      poseDataFormat: "storage-json-v3",
      title: "Schema-v3 saved packet",
    });

    expect(validateCompleteReplayGamePacket(replay.session, {
      requireDeepCapture: true,
    })).toEqual([]);
    expect(replay.session).toMatchObject({
      deepCaptureProfile: { id: "movement-deep-capture-v1", schemaVersion: 3 },
      id: "schema-v3-recording-id",
      sampleCount: 60,
      schemaVersion: 3,
      sourcePacketHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
  });
});
