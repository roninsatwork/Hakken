import { describe, expect, it } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { resolveMovementDisplayLandmarkFrame } from "./movementDisplayLandmarks";

describe("resolveMovementDisplayLandmarkFrame", () => {
  it("keeps live-player display mirroring explicit", () => {
    const payload = makeMovementAvatarProofMotionPayload("left-leg-raise");
    const display = resolveMovementDisplayLandmarkFrame({
      isPlaying: true,
      payload,
      rawLandmarks: payload.landmarks,
      role: "live-player",
    });

    expect(display.hasWorldPose).toBe(payload.worldLandmarks?.length === 33);
    expect(display.pose).not.toBe(payload.landmarks);
    expect(display.pose[0]?.x).toBeCloseTo(1 - (payload.landmarks[0]?.x ?? 0));
  });

  it("keeps recorded instructor display mirroring explicit", () => {
    const payload = makeMovementAvatarProofMotionPayload("squat");
    const display = resolveMovementDisplayLandmarkFrame({
      isPlaying: true,
      payload,
      rawLandmarks: payload.landmarks,
      role: "recorded-instructor",
    });

    expect(display.hasWorldPose).toBe(payload.worldLandmarks?.length === 33);
    expect(display.pose).not.toBe(payload.landmarks);
    expect(display.pose[0]?.x).toBeCloseTo(1 - (payload.landmarks[0]?.x ?? 0));
  });

  it("does not expose display world pose without full source world landmarks", () => {
    const payload = {
      ...makeMovementAvatarProofMotionPayload("standing"),
      worldLandmarks: [],
    };
    const display = resolveMovementDisplayLandmarkFrame({
      isPlaying: true,
      payload,
      rawLandmarks: payload.landmarks,
      role: "live-player",
    });

    expect(display.hasWorldPose).toBe(false);
    expect(display.worldPose).toEqual([]);
  });
});
