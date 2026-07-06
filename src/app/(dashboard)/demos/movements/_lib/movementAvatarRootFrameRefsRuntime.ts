import type { MovementAvatarRootFrameRuntimeResult } from "./movementAvatarRootFrameRuntime";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

type MovementAvatarMutableRef<T> = {
  current: T;
};

export type MovementAvatarRootFrameRefsRuntimeResult = {
  appliedRootDebug: boolean;
};

export function applyMovementAvatarRootFrameRefsRuntime({
  rootFrameRuntime,
  trackingDebugRef,
}: {
  rootFrameRuntime: MovementAvatarRootFrameRuntimeResult;
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
}): MovementAvatarRootFrameRefsRuntimeResult {
  if (!trackingDebugRef?.current || !rootFrameRuntime.rootDebug) {
    return {
      appliedRootDebug: false,
    };
  }

  trackingDebugRef.current.avatarRoot = rootFrameRuntime.rootDebug;

  return {
    appliedRootDebug: true,
  };
}
