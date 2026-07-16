import { describe, expect, it } from "vitest";
import {
  buildReplaySliderSeekFidelity,
  parseReplaySliderSeekFrames,
  replaySliderSeekEventPasses,
  replaySliderTargetRatio,
} from "./lib/replaySliderSeekProof.mjs";

function cleanDebug() {
  const segment = { confidence: 0.95, sourceError: 0.08 };
  return {
    avatarHead: {
      appliedWorldQuaternion: { w: 1, x: 0, y: 0, z: 0 },
      targetWorldQuaternion: { w: 1, x: 0, y: 0, z: 0 },
    },
    avatarSpine: {
      chest: { x: 0.2, y: 0.1, z: 0.1 },
      spine: { x: 0.1, y: 0.05, z: 0.05 },
      upperChest: { x: 0.15, y: 0.08, z: 0.08 },
    },
    avatarVisual: {
      segments: {
        leftLowerArm: segment,
        leftUpperArm: segment,
        rightLowerArm: segment,
        rightUpperArm: segment,
      },
    },
    headRaw: { confidence: 0.95 },
    spineDrive: {
      confidence: 0.95,
      owner: "player-spine-model",
      targetRotations: {
        chest: { x: 0.2, y: 0.1, z: 0.1 },
        spine: { x: 0.1, y: 0.05, z: 0.05 },
        upperChest: { x: 0.15, y: 0.08, z: 0.08 },
      },
    },
  };
}

describe("Replay slider seek proof helpers", () => {
  it("preserves discontinuous order and repeated targets", () => {
    expect(parseReplaySliderSeekFrames("281,1500,281,9999", 3026)).toEqual([
      281,
      1500,
      281,
      3025,
    ]);
    expect(replaySliderTargetRatio(281, 3026)).toBeCloseTo(281 / 3025);
  });

  it("uses the shared 0.10 policy for settled head, spine, and arms", () => {
    const debug = cleanDebug();
    expect(buildReplaySliderSeekFidelity(debug).clean).toBe(true);

    debug.avatarVisual.segments.leftUpperArm = { confidence: 0.95, sourceError: 0.1001 };
    expect(buildReplaySliderSeekFidelity(debug)).toMatchObject({
      clean: false,
      repairSamples: [{ error: 0.1001, outcome: "repair-required", segment: "leftUpperArm" }],
    });
  });

  it("requires exact UI convergence, paused playback, fresh VRM telemetry, and clean fidelity", () => {
    const fidelity = buildReplaySliderSeekFidelity(cleanDebug());
    const passing = {
      committedFrameIndex: 281,
      fidelity,
      observedFrameIndex: 281,
      playbackPaused: true,
      requestedFrameIndex: 281,
      sliderValue: 281,
      telemetryRefreshed: true,
    };
    expect(replaySliderSeekEventPasses(passing)).toBe(true);
    expect(replaySliderSeekEventPasses({ ...passing, telemetryRefreshed: false })).toBe(false);
    expect(replaySliderSeekEventPasses({ ...passing, sliderValue: 280 })).toBe(false);
  });
});
