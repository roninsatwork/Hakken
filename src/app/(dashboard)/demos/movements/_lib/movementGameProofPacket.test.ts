import { describe, expect, it } from "vitest";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "./movementPlayerInputContract";
import {
  buildMovementGameProofPacket,
  buildMovementOwnersRootSupportProofSnapshot,
} from "./movementGameProofPacket";

function pose() {
  return Array.from({ length: 33 }, (_, index) => ({
    visibility: 1,
    x: index / 100,
    y: index / 50,
    z: 0,
  }));
}

describe("buildMovementGameProofPacket", () => {
  it("preserves every source frame and builds the independent opposite-player imitation", () => {
    const sourcePose = pose();
    const packet = buildMovementGameProofPacket({
      baselineSummary: "recorded",
      durationMs: 33,
      endedAt: 33,
      fps: 30,
      id: "recording-1",
      inputContract: MOVEMENT_PLAYER_INPUT_CONTRACT,
      movementId: "recording-1",
      samples: [0, 33].map((capturedAt) => ({
        bodyConfidence: {},
        capturedAt,
        fallbacks: {},
        tracking: {
          pose: sourcePose,
          worldPose: sourcePose,
        },
      })),
      setupPrefix: {
        complete: true,
        frameIndexes: [0],
        requiredFrameCount: 1,
      },
      startedAt: 0,
      trigger: "test",
      warningSummary: "none",
    });

    expect(packet.contractStatus).toBe("matched");
    expect(packet.setupFrameCount).toBe(2);
    expect(packet.instructorFrames).toHaveLength(2);
    expect(packet.playerFrames).toHaveLength(2);
    expect(packet.playerFrames[0]?.landmarks?.[11]).toEqual(sourcePose[12]);
    expect(packet.playerFrames[0]?.landmarks?.[12]).toEqual(sourcePose[11]);
  });

  it("rejects a packet recorded against a different acquisition contract", () => {
    expect(() => buildMovementGameProofPacket({
      durationMs: 0,
      endedAt: 0,
      id: "wrong-contract",
      inputContract: { ...MOVEMENT_PLAYER_INPUT_CONTRACT, id: "movement-player-input-v0" },
      movementId: "wrong-contract",
      samples: [{ bodyConfidence: {}, capturedAt: 0, fallbacks: {}, tracking: { pose: pose(), worldPose: [] } }],
      startedAt: 0,
    })).toThrow(/does not match movement-player-input-v1/);
  });

  it("preserves dense-model identity and anchor ids in instructor and player proof frames", () => {
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
          id: "abdomen-front-000",
          image: { x: 0.5, y: 0.5 },
          normal: { x: 0, y: 0, z: 1 },
          occluded: false,
          provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated" as const, sourceTimestampMs: 1 },
          region: "abdomen" as const,
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
    const packet = buildMovementGameProofPacket({
      durationMs: 0,
      endedAt: 0,
      id: "dense-proof",
      inputContract: MOVEMENT_PLAYER_INPUT_CONTRACT,
      movementId: "dense-proof",
      samples: [{
        bodyConfidence: {},
        capturedAt: 1,
        fallbacks: {},
        tracking: { deepCapture, pose: pose(), worldPose: pose() },
      }],
      startedAt: 0,
    });

    expect(packet.instructorFrames[0]?.deepCapture).toEqual(deepCapture);
    expect(packet.playerFrames[0]?.deepCapture?.denseBody).toEqual(deepCapture.denseBody);
    expect(packet.playerFrames[0]?.deepCapture?.denseBody?.anchors[0]?.id).toBe(
      "abdomen-front-000",
    );
  });

  it("normalises route stage placement without dropping relative root travel", () => {
    expect(buildMovementOwnersRootSupportProofSnapshot({
      avatarRoot: { appliedX: 5.4, targetX: 5.6, targetZ: 0.2 },
      fallbacks: { lowerBody: "recorded" },
    }, 5)).toEqual({
      avatarRoot: { appliedX: 0.40000000000000036, targetX: 0.5999999999999996, targetZ: 0.2 },
      bodySupport: undefined,
      fallbacks: { lowerBody: "recorded" },
      retarget: undefined,
      supportConstraint: undefined,
      supportIntent: undefined,
    });
  });

});
