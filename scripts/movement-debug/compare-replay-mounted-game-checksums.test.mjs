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
    instructorAvatarProfile: "VIPE_Hero__1914.vrm",
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
    expect(report.comparedBoundaryCount).toBe(8);
  });

  it("adds an exact dense-fusion boundary for schema-v3 Deep Capture packets", () => {
    const checksum = movementBoundaryChecksumForComparison({ frame: 1 });
    const input = fixture(checksum);
    input.replay.identity.recordingSchemaVersion = 3;
    input.game.identity.recordingSchemaVersion = 3;
    const denseFusion = {
      anchorCount: 240,
      anchorIdentityChecksum: "fnv1a32:dense",
      regionCoverage: { chest: { currentCount: 12, state: "current" } },
      torsoTwist: { confidence: 0.8, radians: 0.2 },
    };
    input.replay.frames[1].boundaries.denseFusion = structuredClone(denseFusion);
    input.game.final.renderedFrames[0].boundaries.denseFusion = structuredClone(denseFusion);
    input.game.final.renderedFrames[0].checksums.denseFusion =
      movementBoundaryChecksumForComparison(denseFusion);

    const report = compareReplayMountedGameChecksums(input);

    expect(report.passed).toBe(true);
    expect(report.comparedBoundaryCount).toBe(9);
    expect(report.comparedBoundaries).toContain("denseFusion");
  });

  it("fails schema-v3 proof when dense fusion is missing or differs", () => {
    const checksum = movementBoundaryChecksumForComparison({ frame: 1 });
    const missing = fixture(checksum);
    missing.replay.identity.recordingSchemaVersion = 3;
    missing.game.identity.recordingSchemaVersion = 3;
    expect(compareReplayMountedGameChecksums(missing)).toMatchObject({
      passed: false,
      firstExactChecksumDivergence: { boundary: "denseFusion", frameIndex: 1 },
    });

    const drift = fixture(checksum);
    drift.replay.identity.recordingSchemaVersion = 3;
    drift.game.identity.recordingSchemaVersion = 3;
    drift.replay.frames[1].boundaries.denseFusion = { anchorCount: 240 };
    drift.game.final.renderedFrames[0].boundaries.denseFusion = { anchorCount: 239 };
    drift.game.final.renderedFrames[0].checksums.denseFusion =
      movementBoundaryChecksumForComparison({ anchorCount: 239 });
    expect(compareReplayMountedGameChecksums(drift)).toMatchObject({
      passed: false,
      firstExactChecksumDivergence: { boundary: "denseFusion", frameIndex: 1 },
    });
  });

  it("accepts harmless rendered floating-point drift inside the visual tolerance", () => {
    const input = fixture(movementBoundaryChecksumForComparison({ frame: 1 }));
    const gameVisual = { frame: 1.0001 };
    input.game.final.renderedFrames[0].playerVisual = gameVisual;
    input.game.final.renderedFrames[0].boundaries.playerRendered = gameVisual;
    input.game.final.renderedFrames[0].checksums.playerRendered =
      movementBoundaryChecksumForComparison(gameVisual);
    const report = compareReplayMountedGameChecksums(input);

    expect(report.passed).toBe(true);
    expect(report.exactChecksumDivergenceCount).toBe(0);
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
