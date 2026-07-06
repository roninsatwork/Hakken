import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarHeadFrameRefsRuntime } from "./movementAvatarHeadFrameRefsRuntime";

describe("movementAvatarHeadFrameRefsRuntime", () => {
  it("applies the next base head position", () => {
    const nextBaseHeadPosition = new THREE.Vector3(1, 2, 3);
    const baseBonePositionRef = {
      current: {
        head: new THREE.Vector3(0, 0, 0),
      },
    };

    const result = applyMovementAvatarHeadFrameRefsRuntime({
      baseBonePositionRef,
      headFrameRuntime: {
        nextBaseHeadPosition,
        trackingDebugState: null,
      } as never,
    });

    expect(baseBonePositionRef.current.head).toBe(nextBaseHeadPosition);
    expect(result).toEqual({
      appliedBaseHeadPosition: true,
      appliedTrackingDebugState: false,
    });
  });

  it("applies the next tracking debug state when a ref is present", () => {
    const trackingDebugState = {
      updatedAt: 123,
    };
    const trackingDebugRef = {
      current: null,
    };

    const result = applyMovementAvatarHeadFrameRefsRuntime({
      baseBonePositionRef: { current: {} },
      headFrameRuntime: {
        nextBaseHeadPosition: null,
        trackingDebugState,
      } as never,
      trackingDebugRef: trackingDebugRef as never,
    });

    expect(trackingDebugRef.current).toBe(trackingDebugState);
    expect(result).toEqual({
      appliedBaseHeadPosition: false,
      appliedTrackingDebugState: true,
    });
  });

  it("leaves refs unchanged when runtime values are missing", () => {
    const baseHeadPosition = new THREE.Vector3(4, 5, 6);
    const trackingDebugState = {
      updatedAt: 100,
    };
    const baseBonePositionRef = {
      current: {
        head: baseHeadPosition,
      },
    };
    const trackingDebugRef = {
      current: trackingDebugState,
    };

    const result = applyMovementAvatarHeadFrameRefsRuntime({
      baseBonePositionRef,
      headFrameRuntime: {
        nextBaseHeadPosition: null,
        trackingDebugState: null,
      } as never,
      trackingDebugRef: trackingDebugRef as never,
    });

    expect(baseBonePositionRef.current.head).toBe(baseHeadPosition);
    expect(trackingDebugRef.current).toBe(trackingDebugState);
    expect(result).toEqual({
      appliedBaseHeadPosition: false,
      appliedTrackingDebugState: false,
    });
  });

  it("does not require a tracking debug ref", () => {
    const result = applyMovementAvatarHeadFrameRefsRuntime({
      baseBonePositionRef: { current: {} },
      headFrameRuntime: {
        nextBaseHeadPosition: null,
        trackingDebugState: { updatedAt: 456 },
      } as never,
    });

    expect(result).toEqual({
      appliedBaseHeadPosition: false,
      appliedTrackingDebugState: false,
    });
  });
});
