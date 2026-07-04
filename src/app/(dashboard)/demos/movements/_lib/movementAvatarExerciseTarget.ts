import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import type { MovementExercisePoseDecision } from "./movementExercisePose";
import {
  resolveMovementExerciseTransition,
  type MovementExerciseTransitionDecision,
} from "./movementExerciseTransition";

export type MovementAvatarExerciseTransitionState = {
  previousPose: MovementExercisePoseDecision | null;
};

export type MovementAvatarExerciseTargetDecision = {
  exercisePose: MovementExercisePoseDecision;
  exerciseTransition: MovementExerciseTransitionDecision;
  nextState: MovementAvatarExerciseTransitionState;
  previousPose: MovementExercisePoseDecision | null;
};

export function createMovementAvatarExerciseTransitionState(): MovementAvatarExerciseTransitionState {
  return {
    previousPose: null,
  };
}

export function resolveMovementAvatarExerciseTarget({
  decision,
  previousState,
}: {
  decision: MovementAvatarPipelineDecision;
  previousState?: MovementAvatarExerciseTransitionState | null;
}): MovementAvatarExerciseTargetDecision {
  const previousPose = previousState?.previousPose ?? null;
  const exercisePose = decision.exercisePose;
  const exerciseTransition = resolveMovementExerciseTransition({
    currentPose: exercisePose,
    previousPose,
  });

  return {
    exercisePose,
    exerciseTransition,
    nextState: {
      previousPose: exercisePose,
    },
    previousPose,
  };
}
