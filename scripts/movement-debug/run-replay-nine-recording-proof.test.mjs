import { describe, expect, it } from "vitest";
import {
  buildNineRecordingBundleManifest,
  selectProofRecordings,
} from "./run-replay-nine-recording-proof.mjs";

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
          requireTimed: true,
          requireThreeParty: true,
          runtimeContract: "movement-game-runtime-v1",
          session: "tmp/movement-replay-lab/current-nine-recording-proof/sessions/recording-a.session.json",
          telemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-a.player-avatar-deterministic.json",
          threePartyTelemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-a.three-party-deterministic.json",
          timedTelemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-a.player-avatar-intended-time.json",
          title: "A",
        },
        {
          expectedFrameCount: 3,
          id: "recording-b",
          proofMode: "player-avatar",
          requireCurrentFingerprint: true,
          requireTimed: true,
          requireThreeParty: true,
          runtimeContract: "movement-game-runtime-v1",
          session: "tmp/movement-replay-lab/current-nine-recording-proof/sessions/recording-b.session.json",
          telemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-b.player-avatar-deterministic.json",
          threePartyTelemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-b.three-party-deterministic.json",
          timedTelemetry: "tmp/movement-replay-lab/current-nine-recording-proof/telemetry/recording-b.player-avatar-intended-time.json",
          title: "B",
        },
      ],
      requiredRecordingIds: ["recording-a", "recording-b"],
      schemaVersion: 1,
    });
  });

  it("labels fast-subset manifests as repair proof instead of final all-nine acceptance", () => {
    const manifest = buildNineRecordingBundleManifest({
      outDir: "tmp/movement-replay-lab/current-fast-subset-proof",
      proofTier: "fast-subset",
      recordings: [
        { expectedFrameCount: 648, id: "spins-id", title: "Spins" },
        { expectedFrameCount: 1290, id: "full-spinal-flow-id", title: "Full Spinal Flow" },
        { expectedFrameCount: 3026, id: "full-motion-exercises-id", title: "Full Motion Exercises" },
      ],
    });

    expect(manifest.recordingSetId).toBe("replay-mirror-repair-fast-subset-current");
    expect(manifest.requiredRecordingIds).toEqual([
      "spins-id",
      "full-spinal-flow-id",
      "full-motion-exercises-id",
    ]);
  });

  it("selects the documented fast subset by title", () => {
    const registry = {
      schemaVersion: 1,
      recordings: [
        { expectedFrameCount: 648, id: "spins-id", title: "Spins" },
        { expectedFrameCount: 632, id: "turning-id", title: "Turning Around in Circles" },
        { expectedFrameCount: 1290, id: "full-spinal-flow-id", title: "Full Spinal Flow" },
        { expectedFrameCount: 3026, id: "full-motion-exercises-id", title: "Full Motion Exercises" },
      ],
    };

    expect(selectProofRecordings({ proofTier: "fast-subset", registry })).toEqual({
      proofTier: "fast-subset",
      recordings: [
        { expectedFrameCount: 648, id: "spins-id", title: "Spins" },
        { expectedFrameCount: 1290, id: "full-spinal-flow-id", title: "Full Spinal Flow" },
        { expectedFrameCount: 3026, id: "full-motion-exercises-id", title: "Full Motion Exercises" },
      ],
    });
  });

  it("requires targeted proof to name the recording ids explicitly", () => {
    const registry = {
      schemaVersion: 1,
      recordings: [
        { expectedFrameCount: 648, id: "spins-id", title: "Spins" },
      ],
    };

    expect(() => selectProofRecordings({ proofTier: "targeted", registry })).toThrow(
      "--proof-tier targeted requires --recording-ids <ids>.",
    );
    expect(selectProofRecordings({
      proofTier: "",
      registry,
      requestedIds: ["spins-id"],
    })).toEqual({
      proofTier: "targeted",
      recordings: [
        { expectedFrameCount: 648, id: "spins-id", title: "Spins" },
      ],
    });
  });

  it("does not let recording ids masquerade as all-nine acceptance", () => {
    const registry = {
      schemaVersion: 1,
      recordings: [
        { expectedFrameCount: 648, id: "spins-id", title: "Spins" },
      ],
    };

    expect(() => selectProofRecordings({
      proofTier: "all-nine",
      registry,
      requestedIds: ["spins-id"],
    })).toThrow("Use --proof-tier targeted with --recording-ids");
  });
});
