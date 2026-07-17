import { describe, expect, it } from "vitest";
import {
  compareReplayMountedGameChecksums,
  movementBoundaryChecksumForComparison,
} from "./compare-replay-mounted-game-checksums.mjs";
import {
  movementCodeCommit,
  movementPipelineFingerprint,
} from "./lib/movementPipelineFingerprint.mjs";

function fixture(checksum) {
  const code = {
    commit: movementCodeCommit(),
    motionPipelineFingerprint: movementPipelineFingerprint(),
  };
  const identity = {
    avatarProfile: "VIPE_Hero__1793.vrm",
    inputContractId: "movement-player-input-v1",
    proofMode: "replay-mounted-game-player-v1",
    recordingSchemaVersion: 2,
    runtimeContract: "movement-game-runtime-v1",
    setupPolicyId: "movement-player-setup-v1",
    sourcePacketHash: "sha256:source-a",
  };
  const boundaries = {
    acquisition: { frame: 1, layer: "acquisition" },
    calibration: { frame: 1, layer: "calibration" },
    instructorRendered: { frame: 1, layer: "instructor-rendered" },
    motionFrame: { frame: 1, layer: "motion-frame" },
    ownersRootSupport: { frame: 1, layer: "owners-root-support" },
    playerApplied: {},
    playerRendered: { frame: 1 },
    setup: { frame: 1, layer: "setup" },
  };
  const checksums = Object.fromEntries(
    Object.entries(boundaries).map(([boundary, value]) => [
      boundary,
      movementBoundaryChecksumForComparison(value),
    ]),
  );
  checksums.playerRendered = checksum;
  return {
    game: {
      code,
      final: {
        packetId: "recording-a",
        renderedFrames: [{
          boundaries: structuredClone(boundaries),
          checksums,
          frameIndex: 1,
          playerApplied: {},
          playerVisual: { frame: 1 },
        }],
        setupFrameCount: 1,
        sourcePacketHash: "sha256:source-a",
      },
      identity,
    },
    replay: {
      code,
      frames: [
        { avatars: { player: { avatarVisual: { frame: 0 } } }, frameIndex: 0 },
        {
          avatars: { player: { avatarVisual: { frame: 1 } } },
          boundaries: structuredClone(boundaries),
          frameIndex: 1,
        },
      ],
      identity,
      recordingId: "recording-a",
      sourceHash: "sha256:source-a",
    },
  };
}

describe("Replay/mounted Game checksum comparison", () => {
  it("passes identical current rendered output with matching packet identity", () => {
    const checksum = movementBoundaryChecksumForComparison({ frame: 1 });
    const report = compareReplayMountedGameChecksums(fixture(checksum));

    expect(report.passed).toBe(true);
    expect(report.divergenceCount).toBe(0);
    expect(report.identityStatus).toBe("matched");
  });

  it("hard-fails byte-level checksum drift even when the visual delta is in tolerance", () => {
    const report = compareReplayMountedGameChecksums(fixture("fnv1a32:00000000"));

    expect(report.passed).toBe(false);
    expect(report.exactChecksumDivergenceCount).toBe(1);
    expect(report.divergenceCount).toBe(0);
  });

  it("hard-fails the first differing acquisition boundary", () => {
    const checksum = movementBoundaryChecksumForComparison({ frame: 1 });
    const input = fixture(checksum);
    input.game.final.renderedFrames[0].boundaries.acquisition.frame = 2;

    const report = compareReplayMountedGameChecksums(input);

    expect(report.passed).toBe(false);
    expect(report.firstExactChecksumDivergence).toMatchObject({
      boundary: "acquisition",
      frameIndex: 1,
    });
    expect(report.exactChecksumDivergenceBoundaryCounts.acquisition).toBe(1);
  });

  it("hard-fails stale or missing proof identity", () => {
    const checksum = movementBoundaryChecksumForComparison({ frame: 1 });
    const input = fixture(checksum);
    input.replay.identity.inputContractId = null;

    const report = compareReplayMountedGameChecksums(input);

    expect(report.passed).toBe(false);
    expect(report.identityStatus).toBe("legacy-unverifiable");
    expect(report.failures).toContain(
      "proof identity is legacy or missing: inputContractId",
    );
  });

  it("hard-fails a reused Replay capture from a different fingerprint", () => {
    const checksum = movementBoundaryChecksumForComparison({ frame: 1 });
    const input = fixture(checksum);
    input.replay.code = {
      ...input.replay.code,
      motionPipelineFingerprint: "sha256:stale",
    };

    const report = compareReplayMountedGameChecksums(input);

    expect(report.passed).toBe(false);
    expect(report.metadata.staleCodeFields).toContain("motionPipelineFingerprint");
  });

  it("fails at the first rendered field outside visual tolerance", () => {
    const input = fixture("fnv1a32:00000000");
    input.game.final.renderedFrames[0].playerVisual.frame = 1.2;
    const report = compareReplayMountedGameChecksums(input);

    expect(report.passed).toBe(false);
    expect(report.divergenceCount).toBe(1);
    expect(report.firstDivergence?.frameIndex).toBe(1);
  });
});
