import { describe, expect, it } from "vitest";
import { applyMovementAvatarRootFrameRefsRuntime } from "./movementAvatarRootFrameRefsRuntime";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

function makeTrackingDebugState(): MovementTrackingDebugState {
  return {
    bodyConfidence: {},
    fallbacks: {},
    headApplied: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
    headRaw: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
    updatedAt: 10,
  };
}

describe("movementAvatarRootFrameRefsRuntime", () => {
  it("applies root debug telemetry to an existing tracking debug state", () => {
    const rootDebug = {
      appliedYaw: 0.1,
      appliedX: 0.2,
      appliedZ: -0.3,
      source: "world-landmarks",
      targetYaw: 0.4,
      targetX: 0.5,
      targetZ: -0.6,
    };
    const trackingDebugRef: { current: MovementTrackingDebugState | null } = {
      current: makeTrackingDebugState(),
    };

    const result = applyMovementAvatarRootFrameRefsRuntime({
      rootFrameRuntime: {
        rootDebug,
      } as never,
      trackingDebugRef: trackingDebugRef as never,
    });

    expect(trackingDebugRef.current?.avatarRoot).toBe(rootDebug);
    expect(result).toEqual({
      appliedRootDebug: true,
    });
  });

  it("does not create a tracking debug state when the ref is empty", () => {
    const trackingDebugRef = {
      current: null,
    };

    const result = applyMovementAvatarRootFrameRefsRuntime({
      rootFrameRuntime: {
        rootDebug: {
          appliedYaw: 0,
          appliedX: 0,
          appliedZ: 0,
          source: "world-landmarks",
          targetYaw: 0,
          targetX: 0,
          targetZ: 0,
        },
      } as never,
      trackingDebugRef: trackingDebugRef as never,
    });

    expect(trackingDebugRef.current).toBeNull();
    expect(result).toEqual({
      appliedRootDebug: false,
    });
  });

  it("leaves existing debug state unchanged when root debug is missing", () => {
    const trackingDebugState = makeTrackingDebugState();
    const trackingDebugRef = {
      current: trackingDebugState,
    };

    const result = applyMovementAvatarRootFrameRefsRuntime({
      rootFrameRuntime: {
        rootDebug: null,
      } as never,
      trackingDebugRef: trackingDebugRef as never,
    });

    expect(trackingDebugRef.current).toBe(trackingDebugState);
    expect(trackingDebugRef.current.avatarRoot).toBeUndefined();
    expect(result).toEqual({
      appliedRootDebug: false,
    });
  });

  it("does not require a tracking debug ref", () => {
    expect(applyMovementAvatarRootFrameRefsRuntime({
      rootFrameRuntime: {
        rootDebug: null,
      } as never,
    })).toEqual({
      appliedRootDebug: false,
    });
  });
});
