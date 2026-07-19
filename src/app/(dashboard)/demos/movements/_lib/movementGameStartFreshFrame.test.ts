import { describe, expect, it } from "vitest";
import {
  MOVEMENT_GAME_START_FRESH_FRAME_ATTEMPT_LIMIT,
  MOVEMENT_GAME_START_STABLE_FRAME_COUNT,
  advanceMovementGameStartStability,
  shouldContinueMovementGameStartFreshFrameCheck,
  type MovementGameStartStabilityState,
} from "./movementGameStartFreshFrame";

describe("mounted Game fresh-frame start checks", () => {
  it("keeps checking transient blocked frames but stops after the bounded window", () => {
    expect(shouldContinueMovementGameStartFreshFrameCheck({ attempt: 1, didStart: false })).toBe(true);
    expect(shouldContinueMovementGameStartFreshFrameCheck({
      attempt: MOVEMENT_GAME_START_FRESH_FRAME_ATTEMPT_LIMIT,
      didStart: false,
    })).toBe(false);
  });

  it("stops immediately after a fresh frame starts the Game", () => {
    expect(shouldContinueMovementGameStartFreshFrameCheck({ attempt: 1, didStart: true })).toBe(false);
  });

  it("requires several distinct ready frames before starting the countdown", () => {
    let state: MovementGameStartStabilityState = {
      acceptedFrameCount: 0,
      lastCapturedAt: null,
    };

    for (let index = 0; index < MOVEMENT_GAME_START_STABLE_FRAME_COUNT; index += 1) {
      state = advanceMovementGameStartStability({
        canStart: true,
        capturedAt: 1000 + index * 33,
        state,
      });
    }

    expect(state.acceptedFrameCount).toBe(MOVEMENT_GAME_START_STABLE_FRAME_COUNT);
  });

  it("does not count the same frame twice and resets after a blocked frame", () => {
    const first = advanceMovementGameStartStability({
      canStart: true,
      capturedAt: 1000,
      state: { acceptedFrameCount: 0, lastCapturedAt: null },
    });
    const duplicate = advanceMovementGameStartStability({
      canStart: true,
      capturedAt: 1000,
      state: first,
    });
    const blocked = advanceMovementGameStartStability({
      canStart: false,
      capturedAt: 1033,
      state: duplicate,
    });

    expect(duplicate).toEqual(first);
    expect(blocked).toEqual({ acceptedFrameCount: 0, lastCapturedAt: 1033 });
  });
});
