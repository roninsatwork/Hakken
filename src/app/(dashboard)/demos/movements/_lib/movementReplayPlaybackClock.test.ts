import { describe, expect, it } from "vitest";
import { resolveMovementReplayFrameDelay } from "./movementReplayPlaybackClock";

describe("movementReplayPlaybackClock", () => {
  it("preserves recorded frame timing instead of imposing the nominal fps", () => {
    expect(resolveMovementReplayFrameDelay({
      currentFrameIndex: 0,
      fallbackFps: 30,
      samples: [{ capturedAt: 1000 }, { capturedAt: 1026 }],
    })).toBe(26);
  });

  it("falls back to fps for invalid timestamps and bounds disruptive gaps", () => {
    expect(resolveMovementReplayFrameDelay({
      currentFrameIndex: 0,
      fallbackFps: 25,
      samples: [{ capturedAt: 1000 }, { capturedAt: 1000 }],
    })).toBe(40);
    expect(resolveMovementReplayFrameDelay({
      currentFrameIndex: 0,
      samples: [{ capturedAt: 1000 }, { capturedAt: 2000 }],
    })).toBe(250);
  });
});
