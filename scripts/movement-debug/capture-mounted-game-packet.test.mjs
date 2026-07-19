import { describe, expect, test } from "vitest";
import {
  buildMountedGamePacketWindow,
  updateMountedGamePlaybackWatchdog,
} from "./capture-mounted-game-packet.mjs";

function sample(index) {
  return {
    camera: { width: 1280 },
    index,
    tracking: {
      face: [],
      hands: index % 2 === 0 ? { left: { landmarks: Array(21).fill({ x: 0 }) } } : {},
      pose: Array(33).fill({ x: 0 }),
      worldPose: Array(33).fill({ x: 0 }),
    },
  };
}

describe("buildMountedGamePacketWindow", () => {
  test("preserves a setup prefix before the requested active source window", () => {
    const session = {
      channelSummary: {
        camera: {}, face: {}, hands: {}, pose: {}, worldPose: {}, blendshapes: {},
      },
      inputContract: { setup: { prefixFrameCount: 2 } },
      sampleCount: 8,
      samples: Array.from({ length: 8 }, (_, index) => sample(index)),
      setupPrefix: { complete: true, frameIndexes: [0, 1], requiredFrameCount: 2 },
    };

    const result = buildMountedGamePacketWindow(session, 4, 6);

    expect(result.sourceWindow).toEqual({
      activeFrameEnd: 6,
      activeFrameStart: 4,
      packetFrameEnd: 6,
      packetFrameStart: 2,
      setupFrameCount: 2,
    });
    expect(result.packet.samples.map((entry) => entry.index)).toEqual([2, 3, 4, 5, 6]);
    expect(result.packet.sampleCount).toBe(5);
    expect(result.packet.setupPrefix.frameIndexes).toEqual([0, 1]);
    expect(result.packet.channelSummary.pose).toEqual({
      complete: true,
      presentFrames: 5,
      totalFrames: 5,
    });
    expect(result.packet.channelSummary.hands).toEqual({
      complete: false,
      presentFrames: 3,
      totalFrames: 5,
    });
  });

  test("rejects a window that cannot retain the setup prefix", () => {
    const session = {
      samples: Array.from({ length: 8 }, (_, index) => sample(index)),
      setupPrefix: { requiredFrameCount: 3 },
    };
    expect(() => buildMountedGamePacketWindow(session, 2, 4)).toThrow(
      "cannot preserve the 3-frame setup prefix",
    );
  });
});

describe("mounted Game playback progress watchdog", () => {
  const initial = {
    complete: false,
    lastProgressAt: 1_000,
    playerFrameIndex: 80,
    renderedFrameCount: 10,
    stalled: false,
  };

  test("keeps a slow browser alive while source or rendered frames advance", () => {
    expect(updateMountedGamePlaybackWatchdog({
      nowMs: 70_000,
      previous: initial,
      proof: { phase: "playing", playerFrameIndex: 81, renderedFrameCount: 10 },
    })).toMatchObject({
      lastProgressAt: 70_000,
      playerFrameIndex: 81,
      stalled: false,
    });
  });

  test("fails a real stall and accepts explicit completion", () => {
    expect(updateMountedGamePlaybackWatchdog({
      nowMs: 61_000,
      previous: initial,
      proof: { phase: "playing", playerFrameIndex: 80, renderedFrameCount: 10 },
    }).stalled).toBe(true);
    expect(updateMountedGamePlaybackWatchdog({
      nowMs: 61_000,
      previous: initial,
      proof: { phase: "complete", playerFrameIndex: 80, renderedFrameCount: 10 },
    })).toMatchObject({ complete: true, stalled: false });
  });
});
