import { describe, expect, it } from "vitest";
import { buildNineRecordingBundleManifest } from "./run-replay-nine-recording-proof.mjs";

describe("nine-recording rendered proof manifest", () => {
  it("requires no-skip player and three-party proof for every canonical recording", () => {
    const manifest = buildNineRecordingBundleManifest({
      outDir: "tmp/movement-replay-lab/current-nine-recording-proof",
      recordings: [
        { expectedFrameCount: 2, id: "recording-a", title: "A" },
        { expectedFrameCount: 3, id: "recording-b", title: "B" },
      ],
    });

    expect(manifest).toEqual({
      recordingSetId: "replay-mirror-acceptance-nine-current",
      recordings: [
        {
          expectedFrameCount: 2,
          id: "recording-a",
          proofMode: "player-avatar",
          requireCurrentFingerprint: true,
          requireThreeParty: true,
          session: "tmp/movement-replay-lab/current-nine-recording-proof/sessions/recording-a.session.json",
          telemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-a.player-avatar-deterministic.json",
          threePartyTelemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-a.three-party-deterministic.json",
          title: "A",
        },
        {
          expectedFrameCount: 3,
          id: "recording-b",
          proofMode: "player-avatar",
          requireCurrentFingerprint: true,
          requireThreeParty: true,
          session: "tmp/movement-replay-lab/current-nine-recording-proof/sessions/recording-b.session.json",
          telemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-b.player-avatar-deterministic.json",
          threePartyTelemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-b.three-party-deterministic.json",
          title: "B",
        },
      ],
      requiredRecordingIds: ["recording-a", "recording-b"],
      schemaVersion: 1,
    });
  });
});
