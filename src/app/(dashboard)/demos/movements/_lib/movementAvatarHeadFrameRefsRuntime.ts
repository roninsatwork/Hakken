import type * as THREE from "three";
import type { MovementAvatarHeadFrameRuntimeResult } from "./movementAvatarHeadFrameRuntime";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

type MovementAvatarMutableRef<T> = {
  current: T;
};

export type MovementAvatarHeadFrameRefsRuntimeResult = {
  appliedBaseHeadPosition: boolean;
  appliedTrackingDebugState: boolean;
};

export function applyMovementAvatarHeadFrameRefsRuntime({
  baseBonePositionRef,
  headFrameRuntime,
  trackingDebugRef,
}: {
  baseBonePositionRef: MovementAvatarMutableRef<Record<string, THREE.Vector3>>;
  headFrameRuntime: MovementAvatarHeadFrameRuntimeResult;
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
}): MovementAvatarHeadFrameRefsRuntimeResult {
  let appliedBaseHeadPosition = false;
  let appliedTrackingDebugState = false;

  if (headFrameRuntime.nextBaseHeadPosition) {
    baseBonePositionRef.current.head = headFrameRuntime.nextBaseHeadPosition;
    appliedBaseHeadPosition = true;
  }

  if (trackingDebugRef && headFrameRuntime.trackingDebugState) {
    trackingDebugRef.current = headFrameRuntime.trackingDebugState;
    appliedTrackingDebugState = true;
  }

  return {
    appliedBaseHeadPosition,
    appliedTrackingDebugState,
  };
}
