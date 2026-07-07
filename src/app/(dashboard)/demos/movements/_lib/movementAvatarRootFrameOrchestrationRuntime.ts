import {
  applyMovementAvatarRootFrameRuntime,
  type MovementAvatarRootFrameRuntimeResult,
} from "./movementAvatarRootFrameRuntime";
import { applyMovementAvatarRootFrameRefsRuntime } from "./movementAvatarRootFrameRefsRuntime";
import type { MovementRootMotionStepResponseDecision } from "./movementRootMotion";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

type MovementAvatarMutableRef<T> = {
  current: T;
};

type MovementAvatarRootFrameRuntimeInput = Parameters<typeof applyMovementAvatarRootFrameRuntime>[0];

export type MovementAvatarRootFrameOrchestrationRuntimeResult = {
  rootFrameRuntime: MovementAvatarRootFrameRuntimeResult;
  stepResponse: MovementRootMotionStepResponseDecision;
};

export function applyMovementAvatarRootFrameOrchestrationRuntime({
  trackingDebugRef,
  ...input
}: MovementAvatarRootFrameRuntimeInput & {
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
}): MovementAvatarRootFrameOrchestrationRuntimeResult {
  const rootFrameRuntime = applyMovementAvatarRootFrameRuntime(input);
  applyMovementAvatarRootFrameRefsRuntime({
    rootFrameRuntime,
    trackingDebugRef,
  });

  return {
    rootFrameRuntime,
    stepResponse: rootFrameRuntime.stepResponse,
  };
}
