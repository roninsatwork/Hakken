import { describe, expect, it } from "vitest";
import {
  compareReplayMountedGameChecksums,
  movementBoundaryChecksumForComparison,
} from "./compare-replay-mounted-game-checksums.mjs";

function fixture(checksum) {
  return {
    game: {
      final: {
        packetId: "recording-a",
        renderedFrames: [{
          checksums: { playerRendered: checksum },
          frameIndex: 1,
          playerApplied: {},
          playerVisual: { frame: 1 },
        }],
        setupFrameCount: 1,
        sourcePacketHash: "sha256:source-a",
      },
    },
    replay: {
      frames: [
        { avatars: { player: { avatarVisual: { frame: 0 } } }, frameIndex: 0 },
        { avatars: { player: { avatarVisual: { frame: 1 } } }, frameIndex: 1 },
      ],
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

  it("reports byte-level checksum drift without failing an in-tolerance visual frame", () => {
    const report = compareReplayMountedGameChecksums(fixture("fnv1a32:00000000"));

    expect(report.passed).toBe(true);
    expect(report.exactChecksumDivergenceCount).toBe(1);
    expect(report.divergenceCount).toBe(0);
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
