import { describe, expect, it, vi } from "vitest";
import {
  MIN_MOVEMENT_CAPTURE_FRAMES,
  buildMovementRecordingPacket,
  getMovementRecordingDurationMs,
  saveMovementRecording,
} from "./saveMovementRecording";
import type { MovementFrame } from "./movementTypes";
import type { MovementStartReadiness } from "./movementSourceFrame";
import {
  validateMovementCommissioningEnvelope,
  validateMovementDeepCaptureEnvelope,
} from "./movementRecordingCommissioning";
import { buildMovementFrameEnvelope } from "./movementFrameCodec";
import {
  DEEP_CAPTURE_TEST_READINESS,
  createCompleteDeepCaptureFrames,
} from "./movementDeepCaptureTestFixture";
import { loadMovementReplayRecording } from "./movementRecordingReplay";

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

function makeCommissioningFrames(count = MIN_MOVEMENT_CAPTURE_FRAMES): MovementFrame[] {
  const landmarks = Array.from({ length: 33 }, () => ({ ...landmark }));
  return Array.from({ length: count }, (_, index) => ({
    blendshapes: [{ categoryName: "jawOpen", score: 0.2 }],
    camera: { facingMode: "user", frameHeight: 720, frameWidth: 1280 },
    faceLandmarks: [{ ...landmark }],
    hands: {
      left: { landmarks: [{ ...landmark }] },
    },
    landmarks,
    startReadiness: captureStartReadiness,
    timestamp: index * 33,
    worldLandmarks: landmarks,
  }));
}

describe("saveMovementRecording", () => {
  it("builds one validated schema-v3 packet for both local backup and cloud save", async () => {
    const packet = await buildMovementRecordingPacket({
      captureStartReadiness: DEEP_CAPTURE_TEST_READINESS,
      frames: createCompleteDeepCaptureFrames(),
      requireDeepCapturePacket: true,
    });

    expect(validateMovementDeepCaptureEnvelope(packet)).toEqual({
      failures: [],
      passed: true,
    });
    expect(packet).toMatchObject({
      schemaVersion: 3,
      sourcePacketHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
  });

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

  it("reports every missing commissioning boundary before hashing", () => {
    const report = validateMovementCommissioningEnvelope(
      buildMovementFrameEnvelope(makeFrames(), 30),
      { requireSourceHash: false },
    );

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      "Recording must start from trustworthy pose acquisition evidence.",
      "Readiness evidence is missing from 60 recorded frame(s).",
      "blendshapes channel evidence is missing.",
      "camera channel evidence is missing.",
      "face channel evidence is missing.",
      "hands channel evidence is missing.",
      "worldPose channel evidence is missing.",
    ]));
  });

  it("fails closed before upload when schema-v3 Deep Capture channels are incomplete", async () => {
    const uploadFetch = vi.fn();

    await expect(saveMovementRecording({
      title: "Incomplete Deep Capture",
      difficulty: "Intermediate",
      captureStartReadiness,
      frames: makeCommissioningFrames(),
      generateUploadUrl: vi.fn(async () => "https://upload.example"),
      createMovement: vi.fn(),
      uploadFetch,
      requireDeepCapturePacket: true,
    })).rejects.toThrow(/Deep Capture is not proof-ready.*denseBody Deep Capture evidence is incomplete/);

    expect(uploadFetch).not.toHaveBeenCalled();
  });

  it("uploads a complete schema-v3 packet and returns its immutable recording id", async () => {
    const createMovement = vi.fn(async () => "deep-capture-recording-id");
    const uploadFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ storageId: "deep-capture-storage-id" }),
    } as Response));

    await expect(saveMovementRecording({
      title: "Deep Capture commissioning",
      difficulty: "Intermediate",
      captureStartReadiness: DEEP_CAPTURE_TEST_READINESS,
      frames: createCompleteDeepCaptureFrames(),
      generateUploadUrl: vi.fn(async () => "https://upload.example"),
      createMovement,
      uploadFetch,
      requireDeepCapturePacket: true,
    })).resolves.toBe("deep-capture-recording-id");

    const uploadBody = (uploadFetch.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1].body;
    const envelope = JSON.parse(uploadBody as string);
    expect(validateMovementDeepCaptureEnvelope(envelope)).toEqual({
      failures: [],
      passed: true,
    });
    expect(envelope).toMatchObject({
      deepCaptureProfile: { id: "movement-deep-capture-v1", schemaVersion: 3 },
      schemaVersion: 3,
      sourcePacketHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(createMovement).toHaveBeenCalledWith(expect.objectContaining({
      captureFps: 30,
      durationMs: 1947,
      frameCount: 60,
      poseData: "deep-capture-storage-id",
      poseDataFormat: "storage-json-v3",
      poseStorageId: "deep-capture-storage-id",
      schemaVersion: 3,
      title: "Deep Capture commissioning",
    }));

    const replay = await loadMovementReplayRecording({
      _id: "deep-capture-recording-id",
      captureFps: 30,
      poseData: uploadBody as string,
      poseDataFormat: "storage-json-v3",
      title: "Deep Capture commissioning",
    });
    expect(replay).toMatchObject({
      format: "storage-json-v3",
      session: {
        deepCaptureProfile: { id: "movement-deep-capture-v1", schemaVersion: 3 },
        id: "deep-capture-recording-id",
        sampleCount: 60,
        schemaVersion: 3,
        sourcePacketHash: envelope.sourcePacketHash,
      },
    });
    expect(replay.session.samples[0]?.tracking.deepCapture?.denseBody?.anchors).toHaveLength(200);
    expect(replay.session.samples[0]?.tracking.hands?.left?.worldLandmarks).toHaveLength(21);
    expect(replay.session.samples[0]?.tracking.face).toHaveLength(478);
  });

  it("saves a complete commissioning packet and returns its recording id", async () => {
    const createMovement = vi.fn(async () => "commissioning-recording-id");
    const uploadFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ storageId: "commissioning-storage-id" }),
    } as Response));

    await expect(saveMovementRecording({
      title: "Replay Game commissioning",
      difficulty: "Intermediate",
      captureStartReadiness,
      frames: makeCommissioningFrames(),
      generateUploadUrl: vi.fn(async () => "https://upload.example"),
      createMovement,
      uploadFetch,
      requireCommissioningPacket: true,
    })).resolves.toBe("commissioning-recording-id");

    const uploadBody = (uploadFetch.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1].body;
    const envelope = JSON.parse(uploadBody as string);
    expect(validateMovementCommissioningEnvelope(envelope)).toEqual({
      failures: [],
      passed: true,
    });
  });

  it("does not upload an incomplete commissioning packet", async () => {
    const generateUploadUrl = vi.fn(async () => "https://upload.example");

    await expect(saveMovementRecording({
      title: "Incomplete commissioning take",
      difficulty: "Beginner",
      captureStartReadiness,
      frames: makeFrames(),
      generateUploadUrl,
      createMovement: vi.fn(),
      requireCommissioningPacket: true,
    })).rejects.toThrow("Commissioning capture is not proof-ready");

    expect(generateUploadUrl).not.toHaveBeenCalled();
  });

  it("calculates duration from first and last frame timestamps", () => {
    expect(getMovementRecordingDurationMs(makeFrames(3))).toBe(66);
  });
});
