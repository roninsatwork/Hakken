import { describe, expect, it } from "vitest";
import {
  parseMovementDebugGameFrameIndex,
  shouldShowMovementDebugPlayerPausedPose,
} from "./movementGameDebugRoute";

describe("movementGameDebugRoute", () => {
  it("parses only non-negative debug game frame indexes", () => {
    expect(parseMovementDebugGameFrameIndex(null)).toBeNull();
    expect(parseMovementDebugGameFrameIndex("")).toBeNull();
    expect(parseMovementDebugGameFrameIndex("-1")).toBeNull();
    expect(parseMovementDebugGameFrameIndex("12")).toBe(12);
  });

  it("keeps player paused-pose rendering enabled on debug tracking routes", () => {
    expect(shouldShowMovementDebugPlayerPausedPose({ isDebugTracking: false })).toBe(false);
    expect(shouldShowMovementDebugPlayerPausedPose({ isDebugTracking: true })).toBe(true);
  });
});
