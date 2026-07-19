import { describe, expect, it } from "vitest";
import {
  aggregateMountedGameChunkReports,
  buildMountedGameChunkWindows,
  reusableMountedGameChunkReportFailure,
} from "./run-mounted-game-packet-chunked-proof.mjs";

function report({ packetFrameStart, processed, rendered }) {
  return {
    final: {
      contractStatus: "matched",
      missingFrameIndexes: [],
      missingRenderedFrameIndexes: [],
      processedFrameIndexes: processed,
      renderedFrames: rendered.map((frameIndex) => ({ frameIndex })),
    },
    identity: { sourcePacketHash: `sha256:${"a".repeat(64)}` },
    passed: true,
    sourceWindow: { packetFrameStart },
  };
}

describe("mounted Game chunk window planning", () => {
  it("covers a long packet with setup-safe overlapping active windows", () => {
    const windows = buildMountedGameChunkWindows({
      chunkSize: 300,
      overlap: 60,
      sampleCount: 2_453,
      setupFrameCount: 60,
    });

    expect(windows[0]).toEqual({ frameEnd: 359, frameStart: 60 });
    expect(windows.at(-1)).toEqual({ frameEnd: 2_452, frameStart: 2_153 });
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index - 1].frameEnd - windows[index].frameStart + 1).toBeGreaterThanOrEqual(60);
    }
  });

  it("extends a short final tail backwards to preserve a full readiness window", () => {
    const windows = buildMountedGameChunkWindows({
      chunkSize: 120,
      overlap: 30,
      sampleCount: 2_453,
      setupFrameCount: 60,
    });

    expect(windows.at(-2)).toEqual({ frameEnd: 2_429, frameStart: 2_310 });
    expect(windows.at(-1)).toEqual({ frameEnd: 2_452, frameStart: 2_333 });
  });
});

describe("mounted Game chunk aggregation", () => {
  it("proves complete processing and gap-free globally active rendering", () => {
    const summary = aggregateMountedGameChunkReports({
      reports: [
        report({
          packetFrameStart: 0,
          processed: Array.from({ length: 150 }, (_, index) => index),
          rendered: Array.from({ length: 77 }, (_, index) => index + 73),
        }),
        report({
          packetFrameStart: 90,
          processed: Array.from({ length: 110 }, (_, index) => index),
          rendered: Array.from({ length: 50 }, (_, index) => index + 60),
        }),
      ],
      sampleCount: 200,
    });

    expect(summary).toMatchObject({
      failures: [],
      firstRenderedSourceFrame: 73,
      lastRenderedSourceFrame: 199,
      missingProcessedSourceIndexes: [],
      missingRenderedSourceIndexes: [],
      passed: true,
      processedSourceFrameCount: 200,
      renderedSourceFrameCount: 127,
    });
  });

  it("fails when an active source frame disappears between browser windows", () => {
    const summary = aggregateMountedGameChunkReports({
      reports: [
        report({
          packetFrameStart: 0,
          processed: Array.from({ length: 100 }, (_, index) => index),
          rendered: [73, 74, 75, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99],
        }),
      ],
      sampleCount: 100,
    });

    expect(summary.passed).toBe(false);
    expect(summary.missingRenderedSourceIndexes).toEqual([76]);
  });
});

describe("mounted Game chunk resume", () => {
  const packet = { sourcePacketHash: `sha256:${"a".repeat(64)}` };
  const validReport = {
    ...report({
      packetFrameStart: 270,
      processed: Array.from({ length: 180 }, (_, index) => index),
      rendered: Array.from({ length: 120 }, (_, index) => index + 60),
    }),
    failures: [],
    sourceWindow: {
      activeFrameEnd: 449,
      activeFrameStart: 330,
      packetFrameEnd: 449,
      packetFrameStart: 270,
      setupFrameCount: 60,
    },
  };

  it("reuses only an exact passing source window for the same packet", () => {
    expect(reusableMountedGameChunkReportFailure({
      packet,
      report: validReport,
      setupFrameCount: 60,
      window: { frameEnd: 449, frameStart: 330 },
    })).toBeNull();
  });

  it("rejects stale packet identity or source-window output", () => {
    expect(reusableMountedGameChunkReportFailure({
      packet: { sourcePacketHash: `sha256:${"b".repeat(64)}` },
      report: validReport,
      setupFrameCount: 60,
      window: { frameEnd: 449, frameStart: 330 },
    })).toBe("source packet identity changed");
    expect(reusableMountedGameChunkReportFailure({
      packet,
      report: validReport,
      setupFrameCount: 60,
      window: { frameEnd: 450, frameStart: 330 },
    })).toBe("source window changed");
  });
});
