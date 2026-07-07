import { describe, expect, it } from "vitest";
import { resolveMovementAvatarRootMotionRuntimeFrame } from "./movementAvatarRootMotionRuntime";
import type { MovementRootMotionFrame, MovementRootMotionInputFrame } from "./movementRootMotion";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function pose(offset = { x: 0, z: 0 }): TrackingLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.9,
  }));
  const points: Record<number, TrackingLandmark> = {
    0: { x: 0, y: 1.72, z: -0.08, visibility: 0.95 },
    11: { x: -0.22, y: 1.48, z: 0, visibility: 0.95 },
    12: { x: 0.22, y: 1.48, z: 0, visibility: 0.95 },
    23: { x: -0.14, y: 1.02, z: 0, visibility: 0.95 },
    24: { x: 0.14, y: 1.02, z: 0, visibility: 0.95 },
    25: { x: -0.14, y: 0.54, z: 0.02, visibility: 0.9 },
    26: { x: 0.14, y: 0.54, z: 0.02, visibility: 0.9 },
    27: { x: -0.14, y: 0.08, z: 0.04, visibility: 0.9 },
    28: { x: 0.14, y: 0.08, z: 0.04, visibility: 0.9 },
    29: { x: -0.15, y: 0.02, z: -0.06, visibility: 0.9 },
    30: { x: 0.15, y: 0.02, z: -0.06, visibility: 0.9 },
    31: { x: -0.13, y: 0, z: 0.18, visibility: 0.9 },
    32: { x: 0.13, y: 0, z: 0.18, visibility: 0.9 },
  };

  Object.entries(points).forEach(([index, point]) => {
    landmarks[Number(index)] = {
      ...point,
      visibility: point.visibility ?? 0.9,
      x: point.x + offset.x,
      z: (point.z ?? 0) + offset.z,
    };
  });

  return landmarks;
}

function rootMotionFrame(overrides: Partial<MovementRootMotionFrame> = {}): MovementRootMotionFrame {
  return {
    debug: {
      reasons: [],
      source: "world-landmarks",
    },
    feet: {
      left: {
        contact: true,
        confidence: 1,
        stepPhase: "planted",
        worldPosition: null,
      },
      right: {
        contact: true,
        confidence: 1,
        stepPhase: "planted",
        worldPosition: null,
      },
    },
    floor: {
      confidence: 0.9,
      y: 0,
    },
    frameIndex: 4,
    headingConfidence: 0.9,
    headingYaw: 0.2,
    intent: {
      confidence: 0.9,
      headingDelta: 0,
      key: "root-stationary",
      label: "Root stationary",
      plantedFoot: "both",
      summary: "stationary",
      swingFoot: "none",
      travelDirection: "none",
      travelDistance: 0,
    },
    rootPosition: { x: 0, y: 0, z: 0 },
    rootPositionConfidence: 0.9,
    ...overrides,
  };
}

describe("movementAvatarRootMotionRuntime", () => {
  it("uses recorded root motion without mutating live history", () => {
    const history: MovementRootMotionInputFrame[] = [];
    const recordedRootMotionFrame = rootMotionFrame({
      frameIndex: 12,
      rootPosition: { x: 0.4, y: 0, z: 0.2 },
    });

    const result = resolveMovementAvatarRootMotionRuntimeFrame({
      history,
      livePose: pose(),
      liveWorldPose: pose(),
      recordedRootMotionFrame,
    });

    expect(result).toBe(recordedRootMotionFrame);
    expect(history).toHaveLength(0);
  });

  it("appends live player root-motion history when no recorded frame is provided", () => {
    const history: MovementRootMotionInputFrame[] = [];
    const firstPose = pose();
    const secondPose = pose({ x: 0.15, z: 0.05 });

    const first = resolveMovementAvatarRootMotionRuntimeFrame({
      history,
      livePose: firstPose,
      liveWorldPose: firstPose,
      recordedRootMotionFrame: null,
    });
    const second = resolveMovementAvatarRootMotionRuntimeFrame({
      history,
      livePose: secondPose,
      liveWorldPose: secondPose,
      recordedRootMotionFrame: null,
    });

    expect(first?.frameIndex).toBe(0);
    expect(second?.frameIndex).toBe(1);
    expect(history).toHaveLength(2);
    expect(second?.debug.source).toBe("world-landmarks");
  });
});
