import { describe, expect, it } from "vitest";
import { resolveMovementAvatarFrameWorldRuntime } from "./movementAvatarFrameWorldRuntime";
import type { TrackingLandmark } from "./movementTrackingCalibration";

describe("movementAvatarFrameWorldRuntime", () => {
  it("returns world-pose inputs and full-depth z-scales when world landmarks are present", () => {
    const worldLandmarks: TrackingLandmark[] = [{
      visibility: 0.9,
      x: 0.1,
      y: 0.2,
      z: 0.3,
    }];

    const runtime = resolveMovementAvatarFrameWorldRuntime({ worldLandmarks });

    expect(runtime.hasWorldLandmarks).toBe(true);
    expect(runtime.lowerBodyZScale).toBe(1);
    expect(runtime.visualTelemetryZScale).toBe(1);
    expect(runtime.worldPoseForLocomotion).toBe(worldLandmarks);
    expect(runtime.worldPoseForSetup).toBe(worldLandmarks);
  });

  it("preserves existing fallback values when world landmarks are absent", () => {
    const runtime = resolveMovementAvatarFrameWorldRuntime({ worldLandmarks: null });

    expect(runtime.hasWorldLandmarks).toBe(false);
    expect(runtime.lowerBodyZScale).toBe(0.1);
    expect(runtime.visualTelemetryZScale).toBe(0.18);
    expect(runtime.worldPoseForLocomotion).toBeNull();
    expect(runtime.worldPoseForSetup).toBeUndefined();
  });
});
