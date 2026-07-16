import { describe, expect, it } from "vitest";
import {
  replayMotionFrameHistoryForBuild,
  replayShouldPresentTimedRootMotionRef,
} from "./replayLabHelpers";

describe("replayMotionFrameHistoryForBuild", () => {
  it("drops temporal history for an independently selected paused frame", () => {
    const previousMotionFrame = { sourceFrame: 0 };

    expect(replayMotionFrameHistoryForBuild({
      isPlaying: false,
      previousMotionFrame,
    })).toBeNull();
  });

  it("preserves temporal history during continuous timed playback", () => {
    const previousMotionFrame = { sourceFrame: 281 };

    expect(replayMotionFrameHistoryForBuild({
      isPlaying: true,
      previousMotionFrame,
    })).toBe(previousMotionFrame);
  });
});

describe("replayShouldPresentTimedRootMotionRef", () => {
  it("does not let a stale timed or previous-recording root frame override a paused seek", () => {
    expect(replayShouldPresentTimedRootMotionRef(false)).toBe(false);
  });

  it("keeps the imperative root frame available during timed playback", () => {
    expect(replayShouldPresentTimedRootMotionRef(true)).toBe(true);
  });
});
