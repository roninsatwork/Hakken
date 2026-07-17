import { describe, expect, it } from "vitest";
import {
  MOVEMENT_GAME_START_FRESH_FRAME_ATTEMPT_LIMIT,
  shouldContinueMovementGameStartFreshFrameCheck,
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
});
