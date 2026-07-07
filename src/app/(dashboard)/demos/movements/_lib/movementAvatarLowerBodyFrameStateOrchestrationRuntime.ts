import {
  applyMovementAvatarLowerBodyFrameStateRefsRuntime,
  type MovementAvatarLowerBodyFrameStateRefsRuntime,
} from "./movementAvatarLowerBodyFrameStateRefsRuntime";
import {
  resolveMovementAvatarLowerBodyFrameStateRuntime,
  type MovementAvatarLowerBodyFrameStateRuntime,
} from "./movementAvatarLowerBodyFrameStateRuntime";

type MovementAvatarMutableRef<T> = {
  current: T;
};

type MovementAvatarLowerBodyFrameStateRuntimeInput =
  Parameters<typeof resolveMovementAvatarLowerBodyFrameStateRuntime>[0];

export type MovementAvatarLowerBodyFrameStateOrchestrationRuntime = {
  legRaiseHoldDecision: MovementAvatarLowerBodyFrameStateRefsRuntime["legRaiseHoldDecision"];
  lowerBodyFrameStateRuntime: MovementAvatarLowerBodyFrameStateRuntime;
};

export function applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime({
  instructorLowerBodyStabilityRef,
  playerLegRaiseHoldRef,
  playerLowerBodyStabilityRef,
  ...input
}: Omit<
  MovementAvatarLowerBodyFrameStateRuntimeInput,
  "instructorLowerBodyVisualState" | "playerLegRaiseHoldState" | "playerLowerBodyVisualState"
> & {
  instructorLowerBodyStabilityRef: MovementAvatarMutableRef<
    MovementAvatarLowerBodyFrameStateRuntimeInput["instructorLowerBodyVisualState"]
  >;
  playerLegRaiseHoldRef: MovementAvatarMutableRef<
    MovementAvatarLowerBodyFrameStateRuntimeInput["playerLegRaiseHoldState"]
  >;
  playerLowerBodyStabilityRef: MovementAvatarMutableRef<
    MovementAvatarLowerBodyFrameStateRuntimeInput["playerLowerBodyVisualState"]
  >;
}): MovementAvatarLowerBodyFrameStateOrchestrationRuntime {
  const lowerBodyFrameStateRuntime = resolveMovementAvatarLowerBodyFrameStateRuntime({
    ...input,
    instructorLowerBodyVisualState: instructorLowerBodyStabilityRef.current,
    playerLegRaiseHoldState: playerLegRaiseHoldRef.current,
    playerLowerBodyVisualState: playerLowerBodyStabilityRef.current,
  });
  const { legRaiseHoldDecision } = applyMovementAvatarLowerBodyFrameStateRefsRuntime({
    instructorLowerBodyStabilityRef,
    lowerBodyFrameStateRuntime,
    playerLegRaiseHoldRef,
    playerLowerBodyStabilityRef,
  });

  return {
    legRaiseHoldDecision,
    lowerBodyFrameStateRuntime,
  };
}
