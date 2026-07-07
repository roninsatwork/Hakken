import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarRootFrameRuntime } from "./movementAvatarRootFrameRuntime";
import type { MovementAvatarRootOrientationDecision } from "./movementAvatarPipeline";
import type { MovementRootMotionFrame, MovementRootMotionInputFrame } from "./movementRootMotion";
import type { TrackingLandmark } from "./movementTrackingCalibration";

const uprightRootOrientation: MovementAvatarRootOrientationDecision = {
  heightLerp: 0.16,
  owner: "upright-root",
  reason: "upright",
  shouldApply: false,
  shouldApplyHeight: false,
  slerp: 0.16,
  targetHeightDrop: 0,
  targetPitch: 0,
  targetRoll: 0,
};

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
      key: "root-travel",
      label: "Root travel",
      plantedFoot: "both",
      summary: "travel",
      swingFoot: "none",
      travelDirection: "forward",
      travelDistance: 0.4,
    },
    rootPosition: { x: 0.4, y: 0, z: -0.2 },
    rootPositionConfidence: 0.9,
    ...overrides,
  };
}

describe("movementAvatarRootFrameRuntime", () => {
  it("applies recorded root motion and returns root debug telemetry", () => {
    const root = new THREE.Object3D();
    root.position.set(0, -2.8, 0);
    root.rotation.set(0, Math.PI, 0);
    const history: MovementRootMotionInputFrame[] = [];

    const runtime = applyMovementAvatarRootFrameRuntime({
      avatarBaseY: -2.8,
      avatarRoot: root,
      avatarRootVisualLerp: 0.2,
      history,
      livePose: pose(),
      liveWorldPose: pose(),
      positionOffset: [0.2, 0, -0.3],
      recordedRootMotionFrame: rootMotionFrame(),
      rootOrientation: uprightRootOrientation,
      visualRootDrop: 0.1,
    });

    expect(history).toHaveLength(0);
    expect(runtime.rootMotion?.frameIndex).toBe(4);
    expect(runtime.rootTarget.targetX).toBeCloseTo(0.6);
    expect(runtime.rootTarget.targetZ).toBeCloseTo(-0.37);
    expect(runtime.transformRuntime.result).toEqual({ applied: true });
    expect(runtime.rootApplication).not.toBeNull();
    expect(runtime.rootDebug).toMatchObject({
      orientationOwner: "upright-root",
      source: "world-landmarks",
      stepResponseOwner: expect.any(String),
      targetYaw: 0.2,
    });
    expect(root.position.x).toBeCloseTo(runtime.rootApplication!.position.x);
  });

  it("builds live root motion history when no recorded frame is available", () => {
    const history: MovementRootMotionInputFrame[] = [];

    const first = applyMovementAvatarRootFrameRuntime({
      avatarBaseY: -2.8,
      avatarRoot: null,
      avatarRootVisualLerp: 0.2,
      history,
      livePose: pose(),
      liveWorldPose: pose(),
      positionOffset: [0, 0, 0],
      recordedRootMotionFrame: null,
      rootOrientation: uprightRootOrientation,
      visualRootDrop: 0,
    });
    const second = applyMovementAvatarRootFrameRuntime({
      avatarBaseY: -2.8,
      avatarRoot: null,
      avatarRootVisualLerp: 0.2,
      history,
      livePose: pose({ x: 0.15, z: 0.05 }),
      liveWorldPose: pose({ x: 0.15, z: 0.05 }),
      positionOffset: [0, 0, 0],
      recordedRootMotionFrame: null,
      rootOrientation: uprightRootOrientation,
      visualRootDrop: 0,
    });

    expect(first.rootMotion?.frameIndex).toBe(0);
    expect(second.rootMotion?.frameIndex).toBe(1);
    expect(history).toHaveLength(2);
    expect(second.rootDebug).toBeNull();
    expect(second.transformRuntime.result).toEqual({ applied: false });
  });
});
