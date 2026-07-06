import type {
  MovementAvatarExerciseTransitionState,
} from "./movementAvatarExerciseTarget";
import type { MovementAvatarFrameDecisionRuntime } from "./movementAvatarFrameDecisionRuntime";

type MovementAvatarMutableRef<T> = {
  current: T;
};

export type MovementAvatarFrameDecisionRefsRuntime =
  | {
    status: "fallback-demo-pose";
  }
  | {
    avatarDecision: NonNullable<MovementAvatarFrameDecisionRuntime["avatarDecision"]>;
    exerciseTransition: NonNullable<MovementAvatarFrameDecisionRuntime["exerciseTransition"]>;
    motionFrameInput: MovementAvatarFrameDecisionRuntime["motionFrameInput"];
    status: "ready";
  };

export function applyMovementAvatarFrameDecisionRefsRuntime({
  exerciseTransitionStateRef,
  frameDecisionRuntime,
}: {
  exerciseTransitionStateRef: MovementAvatarMutableRef<MovementAvatarExerciseTransitionState>;
  frameDecisionRuntime: MovementAvatarFrameDecisionRuntime;
}): MovementAvatarFrameDecisionRefsRuntime {
  exerciseTransitionStateRef.current = frameDecisionRuntime.nextExerciseTransitionState;

  if (!frameDecisionRuntime.avatarDecision || !frameDecisionRuntime.exerciseTransition) {
    return {
      status: "fallback-demo-pose",
    };
  }

  return {
    avatarDecision: frameDecisionRuntime.avatarDecision,
    exerciseTransition: frameDecisionRuntime.exerciseTransition,
    motionFrameInput: frameDecisionRuntime.motionFrameInput,
    status: "ready",
  };
}
