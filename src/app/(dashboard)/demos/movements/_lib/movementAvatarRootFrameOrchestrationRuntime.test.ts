import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarRootFrameOrchestrationRuntime } from "./movementAvatarRootFrameOrchestrationRuntime";
import type { MovementAvatarRootOrientationDecision } from "./movementAvatarPipeline";
import type { MovementRootMotionFrame } from "./movementRootMotion";
import type { MovementTrackingDebugState, TrackingLandmark } from "./movementTrackingCalibration";

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

function pose(): TrackingLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.9,
  }));
  landmarks[23] = { x: -0.14, y: 1.02, z: 0, visibility: 0.95 };
  landmarks[24] = { x: 0.14, y: 1.02, z: 0, visibility: 0.95 };
  return landmarks;
}

function rootMotionFrame(): MovementRootMotionFrame {
  return {
    debug: {
      reasons: [],
      source: "world-landmarks",
    },
    feet: {
      left: {
        contact: true,
        stepPhase: "planted",
        worldPosition: null,
      },
      right: {
        contact: true,
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
  };
}

function trackingDebugState(): MovementTrackingDebugState {
  return {
    bodyConfidence: {},
    fallbacks: {},
    headApplied: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
    headRaw: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
    updatedAt: 10,
  };
}

describe("movementAvatarRootFrameOrchestrationRuntime", () => {
  it("applies root runtime, writes root debug, and exposes step response", () => {
    const root = new THREE.Object3D();
    const trackingDebugRef = {
      current: trackingDebugState(),
    };

    const result = applyMovementAvatarRootFrameOrchestrationRuntime({
      avatarBaseY: -2.8,
      avatarRoot: root,
      avatarRootVisualLerp: 0.2,
      history: [],
      livePose: pose(),
      liveWorldPose: pose(),
      positionOffset: [0.2, 0, -0.3],
      recordedRootMotionFrame: rootMotionFrame(),
      rootOrientation: uprightRootOrientation,
      trackingDebugRef,
      visualRootDrop: 0.1,
    });

    expect(result.rootFrameRuntime.rootDebug).not.toBeNull();
    expect(trackingDebugRef.current.avatarRoot).toBe(result.rootFrameRuntime.rootDebug);
    expect(result.stepResponse).toBe(result.rootFrameRuntime.stepResponse);
  });
});
