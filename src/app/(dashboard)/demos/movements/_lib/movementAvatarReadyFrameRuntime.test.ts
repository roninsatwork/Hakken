import { describe, expect, it } from "vitest";
import { resolveMovementAvatarReadyFrameRuntime } from "./movementAvatarReadyFrameRuntime";
import type { MovementAvatarSolvedFrameRuntime } from "./movementAvatarSolverRuntime";

function readySolvedFrame(): Extract<MovementAvatarSolvedFrameRuntime, { status: "ready" }> {
  return {
    displayPreparedInput: {} as never,
    faceLandmarks: undefined,
    forceStandby: false,
    imageLandmarks: [],
    mirrorPlayerDisplay: false,
    payload: null,
    rawPreparedInput: {} as never,
    rigBlendshapes: null as never,
    rigHands: null as never,
    status: "ready",
    targetSolverLandmarks: [],
  };
}

describe("movementAvatarReadyFrameRuntime", () => {
  it("falls back to the demo pose when solver input is missing", () => {
    expect(resolveMovementAvatarReadyFrameRuntime({
      hasHumanoid: true,
      solvedFrameRuntime: { status: "missing-input" },
    })).toEqual({
      status: "fallback-demo-pose",
    });
  });

  it("skips ready solver frames until the VRM humanoid is available", () => {
    expect(resolveMovementAvatarReadyFrameRuntime({
      hasHumanoid: false,
      solvedFrameRuntime: readySolvedFrame(),
    })).toEqual({
      status: "skip-frame",
    });
  });

  it("returns the solved frame when it is ready and the humanoid exists", () => {
    const solvedFrameRuntime = readySolvedFrame();

    expect(resolveMovementAvatarReadyFrameRuntime({
      hasHumanoid: true,
      solvedFrameRuntime,
    })).toEqual({
      solvedFrameRuntime,
      status: "ready",
    });
  });
});
