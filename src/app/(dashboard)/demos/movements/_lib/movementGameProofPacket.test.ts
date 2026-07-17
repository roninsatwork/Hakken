import { describe, expect, it } from "vitest";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "./movementPlayerInputContract";
import { buildMovementGameProofPacket } from "./movementGameProofPacket";

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

});
