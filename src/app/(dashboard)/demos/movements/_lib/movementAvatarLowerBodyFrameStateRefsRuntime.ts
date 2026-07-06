import type {
  MovementAvatarLowerBodyVisualState,
  MovementAvatarPlayerLegRaiseHoldDecision,
  MovementAvatarPlayerLegRaiseHoldState,
} from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyFrameStateRuntime } from "./movementAvatarLowerBodyFrameStateRuntime";

type MovementAvatarMutableRef<T> = {
  current: T;
};

export type MovementAvatarLowerBodyFrameStateRefsRuntime = {
  legRaiseHoldDecision: MovementAvatarPlayerLegRaiseHoldDecision;
};

export function applyMovementAvatarLowerBodyFrameStateRefsRuntime({
  instructorLowerBodyStabilityRef,
  lowerBodyFrameStateRuntime,
  playerLegRaiseHoldRef,
  playerLowerBodyStabilityRef,
}: {
  instructorLowerBodyStabilityRef: MovementAvatarMutableRef<MovementAvatarLowerBodyVisualState>;
  lowerBodyFrameStateRuntime: MovementAvatarLowerBodyFrameStateRuntime;
  playerLegRaiseHoldRef: MovementAvatarMutableRef<MovementAvatarPlayerLegRaiseHoldState>;
  playerLowerBodyStabilityRef: MovementAvatarMutableRef<MovementAvatarLowerBodyVisualState>;
}): MovementAvatarLowerBodyFrameStateRefsRuntime {
  const lowerBodyRuntimeStateDecision = lowerBodyFrameStateRuntime.lowerBodyRuntimeStateDecision;
  playerLegRaiseHoldRef.current = lowerBodyRuntimeStateDecision.nextPlayerLegRaiseHoldState;
  playerLowerBodyStabilityRef.current = lowerBodyRuntimeStateDecision.nextPlayerLowerBodyVisualState;
  instructorLowerBodyStabilityRef.current = lowerBodyRuntimeStateDecision.nextInstructorLowerBodyVisualState;

  return {
    legRaiseHoldDecision: lowerBodyRuntimeStateDecision.legRaiseHoldDecision,
  };
}
