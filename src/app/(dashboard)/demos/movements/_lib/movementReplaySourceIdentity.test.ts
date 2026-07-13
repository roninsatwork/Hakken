import { describe, expect, it } from "vitest";
import type { MovementDebugReplaySession } from "./movementDebugReplay";
import { replaySourcePayload, sourceHashForReplaySession } from "./movementReplaySourceIdentity";

function replaySession(): MovementDebugReplaySession {
  return {
    baselineSummary: "baseline",
    durationMs: 33,
    endedAt: 1033,
    id: "recording-1",
    movementId: "movement-1",
    sampleCount: 1,
    samples: [{
      avatarVisual: {
        comparedLowerBodySegments: 4,
        segments: {},
      },
      bodyConfidence: { legs: 0.9 },
      capturedAt: 1000,
      fallbacks: { lower: "tracked" },
      retarget: { leftKneeLift: 0.5 },
      tracking: {
        pose: [{ visibility: 0.9, x: 0.2, y: 0.3 }],
        worldPose: [{ visibility: 0.9, x: -0.2, y: 0.3 }],
      },
    }],
    startedAt: 1000,
    trigger: "test",
    warningSummary: "none",
  };
}

describe("Replay source identity", () => {
  it("excludes mutable solver and rendered output from the canonical payload", async () => {
    const before = replaySession();
    const after = structuredClone(before);
    after.samples[0].retarget = { leftKneeLift: 0.9 };
    after.samples[0].avatarVisual = {
      comparedLowerBodySegments: 1,
      segments: {},
    };
    after.samples[0].fallbacks = { lower: "changed" };

    expect(replaySourcePayload(after)).toEqual(replaySourcePayload(before));
    expect(await sourceHashForReplaySession(after)).toBe(await sourceHashForReplaySession(before));
  });

  it("changes when immutable human source landmarks change", async () => {
    const before = replaySession();
    const after = structuredClone(before);
    after.samples[0].tracking.pose[0].x = 0.7;

    expect(await sourceHashForReplaySession(after)).not.toBe(await sourceHashForReplaySession(before));
  });
});
