import {
  resolveMovementAvatarExerciseTarget,
  type MovementAvatarExerciseTransitionState,
} from "./movementAvatarExerciseTarget";
import {
  resolveMovementAvatarMotionFrameInput,
  type MovementAvatarMotionFrameInputDecision,
} from "./movementAvatarMotionFrameInput";
import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import type { MovementExerciseTransitionDecision } from "./movementExerciseTransition";
import type { MovementMotionFrame } from "./movementMotionFrame";

export type MovementAvatarFrameDecisionRuntime = {
  avatarDecision: MovementAvatarPipelineDecision | null;
  exerciseTransition: MovementExerciseTransitionDecision | null;
  motionFrameInput: MovementAvatarMotionFrameInputDecision;
  nextExerciseTransitionState: MovementAvatarExerciseTransitionState;
};

export function resolveMovementAvatarFrameDecisionRuntime({
  motionFrame,
  previousExerciseTransitionState,
}: {
  motionFrame: MovementMotionFrame | null;
  previousExerciseTransitionState: MovementAvatarExerciseTransitionState;
}): MovementAvatarFrameDecisionRuntime {
  const motionFrameInput = resolveMovementAvatarMotionFrameInput({
    motionFrame,
    requiresMotionFrame: true,
  });
  const avatarDecision = motionFrameInput.decision;
  if (!avatarDecision) {
    return {
      avatarDecision: null,
      exerciseTransition: null,
      motionFrameInput,
      nextExerciseTransitionState: previousExerciseTransitionState,
    };
  }

  const exerciseTarget = resolveMovementAvatarExerciseTarget({
    decision: avatarDecision,
    previousState: previousExerciseTransitionState,
  });

  return {
    avatarDecision,
    exerciseTransition: exerciseTarget.exerciseTransition,
    motionFrameInput,
    nextExerciseTransitionState: exerciseTarget.nextState,
  };
}
