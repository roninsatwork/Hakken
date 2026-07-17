import { describe, expect, it } from "vitest";
import {
  REQUIRED_CHANNELS,
  validateCompleteReplayGamePacket,
} from "./run-replay-mounted-game-packet-proof.mjs";
import { MOVEMENT_COMMISSIONING_REQUIRED_CHANNELS } from "../../src/app/(dashboard)/demos/movements/_lib/movementRecordingCommissioning";

function packet() {
  const samples = [{ startReadiness: { status: "ready" } }];
  const channelSummary = Object.fromEntries(
    ["blendshapes", "camera", "face", "hands", "pose", "worldPose"].map((channel) => [
      channel,
      { complete: true, presentFrames: 1, totalFrames: 1 },
    ]),
  );
  return {
    channelSummary,
    id: "packet-a",
    inputContract: {
      id: "movement-player-input-v1",
      setup: { id: "movement-player-setup-v1" },
    },
    sampleCount: 1,
    samples,
    schemaVersion: 2,
    setupPrefix: { complete: true },
    sourcePacketHash: `sha256:${"a".repeat(64)}`,
  };
}

describe("Replay/mounted Game packet proof preflight", () => {
  it("requires the same capture channels as the commissioning save boundary", () => {
    expect(REQUIRED_CHANNELS).toEqual(MOVEMENT_COMMISSIONING_REQUIRED_CHANNELS);
  });

  it("accepts a complete current packet", () => {
    expect(validateCompleteReplayGamePacket(packet())).toEqual([]);
  });

  it("rejects legacy identity before browser capture", () => {
    const input = packet();
    delete input.schemaVersion;
    delete input.sourcePacketHash;

    expect(validateCompleteReplayGamePacket(input)).toEqual(expect.arrayContaining([
      "recording schemaVersion must be 2",
      "sourcePacketHash must be a complete SHA-256 identity",
    ]));
  });

  it("rejects a pose-only packet that cannot certify all channels", () => {
    const input = packet();
    input.channelSummary.hands.presentFrames = 0;
    input.channelSummary.face.presentFrames = 0;

    expect(validateCompleteReplayGamePacket(input)).toEqual(expect.arrayContaining([
      "hands channel evidence is missing",
      "face channel evidence is missing",
    ]));
  });
});
