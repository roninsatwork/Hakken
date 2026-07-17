import { describe, expect, it, vi } from "vitest";
import {
  MIN_MOVEMENT_CAPTURE_FRAMES,
  getMovementRecordingDurationMs,
  saveMovementRecording,
} from "./saveMovementRecording";
import type { MovementFrame } from "./movementTypes";
import type { MovementStartReadiness } from "./movementSourceFrame";

const landmark = { x: 0.1, y: 0.2, visibility: 0.9 };
const captureStartReadiness: MovementStartReadiness = {
  blockedReasons: [],
  calibrationQuality: 0.86,
  canStartGame: true,
  canStartRecording: true,
  countdownMsRemaining: 0,
  promptEvents: [],
  requiredBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
  state: "ready",
  visibleBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
};

function makeFrames(count = MIN_MOVEMENT_CAPTURE_FRAMES): MovementFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: index * 33,
    landmarks: [landmark],
    worldLandmarks: null,
  }));
}

describe("saveMovementRecording", () => {
  it("requires a title", async () => {
    await expect(saveMovementRecording({
      title: " ",
      difficulty: "Beginner",
      frames: makeFrames(),
      generateUploadUrl: vi.fn(),
      createMovement: vi.fn(),
    })).rejects.toThrow("Add a routine name");
  });

  it("requires a minimum number of valid frames", async () => {
    await expect(saveMovementRecording({
      title: "Short take",
      difficulty: "Beginner",
      frames: makeFrames(MIN_MOVEMENT_CAPTURE_FRAMES - 1),
      generateUploadUrl: vi.fn(),
      createMovement: vi.fn(),
    })).rejects.toThrow(`Capture at least ${MIN_MOVEMENT_CAPTURE_FRAMES}`);
  });

  it("reports failed uploads", async () => {
    await expect(saveMovementRecording({
      title: "Morning flow",
      difficulty: "Beginner",
      frames: makeFrames(),
      generateUploadUrl: vi.fn(async () => "https://upload.example"),
      createMovement: vi.fn(),
      uploadFetch: vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      } as Response)),
    })).rejects.toThrow("Movement upload failed");
  });

  it("requires a storage id from the upload response", async () => {
    await expect(saveMovementRecording({
      title: "Morning flow",
      difficulty: "Beginner",
      frames: makeFrames(),
      generateUploadUrl: vi.fn(async () => "https://upload.example"),
      createMovement: vi.fn(),
      uploadFetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({ nope: "missing" }),
      } as Response)),
    })).rejects.toThrow("storage id");
  });

  it("creates the movement with storage metadata", async () => {
    const createMovement = vi.fn(async () => "movement-id");
    const uploadFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ storageId: "storage-id" }),
    } as Response));

    await saveMovementRecording({
      title: "  Morning flow  ",
      difficulty: "Intermediate",
      spineGoal: "hipHinge",
      primaryCue: "  Keep ribs over hips  ",
      bodyFocus: ["ribcage", "pelvis"],
      captureStartReadiness,
      frames: makeFrames(),
      generateUploadUrl: vi.fn(async () => "https://upload.example"),
      createMovement,
      uploadFetch,
    });

    const uploadBody = (uploadFetch.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1].body;
    expect(typeof uploadBody).toBe("string");
    expect(JSON.parse(uploadBody as string)).toEqual(
      expect.objectContaining({
        captureStartReadiness,
        schemaVersion: 2,
        inputContract: expect.objectContaining({ id: "movement-player-input-v1" }),
        setupPrefix: expect.objectContaining({ complete: true, requiredFrameCount: 60 }),
        sourcePacketHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }),
    );
    expect(createMovement).toHaveBeenCalledWith(expect.objectContaining({
      title: "Morning flow",
      difficulty: "Intermediate",
      poseData: "storage-id",
      poseStorageId: "storage-id",
      poseDataFormat: "storage-json-v2",
      frameCount: 60,
      durationMs: 1947,
      captureFps: 30,
      schemaVersion: 2,
      spineGoal: "hipHinge",
      primaryCue: "Keep ribs over hips",
      bodyFocus: ["ribcage", "pelvis"],
    }));
  });

  it("calculates duration from first and last frame timestamps", () => {
    expect(getMovementRecordingDurationMs(makeFrames(3))).toBe(66);
  });
});
