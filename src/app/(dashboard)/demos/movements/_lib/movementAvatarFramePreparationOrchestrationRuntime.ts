import {
  resolveMovementAvatarFrameDecisionRuntime,
  type MovementAvatarFrameDecisionRuntime,
} from "./movementAvatarFrameDecisionRuntime";
import {
  applyMovementAvatarFrameDecisionRefsRuntime,
} from "./movementAvatarFrameDecisionRefsRuntime";
import {
  resolveMovementAvatarFrameSetupRuntime,
  type MovementAvatarFrameSetupRuntimeDecision,
} from "./movementAvatarFrameSetupRuntime";
import {
  applyMovementAvatarFrameSetupRefsRuntime,
} from "./movementAvatarFrameSetupRefsRuntime";

type MovementAvatarMutableRef<T> = {
  current: T;
};

type MovementAvatarFrameSetupRuntimeInput = Parameters<typeof resolveMovementAvatarFrameSetupRuntime>[0];
type MovementAvatarFrameDecisionRuntimeInput = Parameters<typeof resolveMovementAvatarFrameDecisionRuntime>[0];

export type MovementAvatarFramePreparationOrchestrationRuntime =
  | {
    activeCalibration: MovementAvatarFrameSetupRuntimeDecision["activeCalibration"];
    autoCalibrationKind: MovementAvatarFrameSetupRuntimeDecision["autoCalibrationKind"];
    frameDecisionRuntime: MovementAvatarFrameDecisionRuntime;
    frameSetupRuntime: MovementAvatarFrameSetupRuntimeDecision;
    status: "fallback-demo-pose";
  }
  | {
    activeCalibration: MovementAvatarFrameSetupRuntimeDecision["activeCalibration"];
    autoCalibrationKind: MovementAvatarFrameSetupRuntimeDecision["autoCalibrationKind"];
    avatarDecision: NonNullable<MovementAvatarFrameDecisionRuntime["avatarDecision"]>;
    exerciseTransition: NonNullable<MovementAvatarFrameDecisionRuntime["exerciseTransition"]>;
    frameDecisionRuntime: MovementAvatarFrameDecisionRuntime;
    frameSetupRuntime: MovementAvatarFrameSetupRuntimeDecision;
    motionFrameInput: MovementAvatarFrameDecisionRuntime["motionFrameInput"];
    status: "ready";
  };

export function applyMovementAvatarFramePreparationOrchestrationRuntime({
  exerciseTransitionStateRef,
  motionFrame,
  retargetSourceModelRef,
  setupStateRef,
  ...setupInput
}: Omit<
  MovementAvatarFrameSetupRuntimeInput,
  "currentRetargetSourceModel" | "previousSetupState"
> & Pick<MovementAvatarFrameDecisionRuntimeInput, "motionFrame"> & {
  exerciseTransitionStateRef: MovementAvatarMutableRef<
    MovementAvatarFrameDecisionRuntimeInput["previousExerciseTransitionState"]
  >;
  retargetSourceModelRef: MovementAvatarMutableRef<
    MovementAvatarFrameSetupRuntimeInput["currentRetargetSourceModel"]
  >;
  setupStateRef: MovementAvatarMutableRef<MovementAvatarFrameSetupRuntimeInput["previousSetupState"]>;
}): MovementAvatarFramePreparationOrchestrationRuntime {
  const frameSetupRuntime = resolveMovementAvatarFrameSetupRuntime({
    ...setupInput,
    currentRetargetSourceModel: retargetSourceModelRef.current,
    previousSetupState: setupStateRef.current,
  });
  const { activeCalibration, autoCalibrationKind } = applyMovementAvatarFrameSetupRefsRuntime({
    frameSetupRuntime,
    retargetSourceModelRef,
    setupStateRef,
  });
  const frameDecisionRuntime = resolveMovementAvatarFrameDecisionRuntime({
    motionFrame,
    previousExerciseTransitionState: exerciseTransitionStateRef.current,
  });
  const frameDecisionRefsRuntime = applyMovementAvatarFrameDecisionRefsRuntime({
    exerciseTransitionStateRef,
    frameDecisionRuntime,
  });

  if (frameDecisionRefsRuntime.status === "fallback-demo-pose") {
    return {
      activeCalibration,
      autoCalibrationKind,
      frameDecisionRuntime,
      frameSetupRuntime,
      status: "fallback-demo-pose",
    };
  }

  return {
    activeCalibration,
    autoCalibrationKind,
    avatarDecision: frameDecisionRefsRuntime.avatarDecision,
    exerciseTransition: frameDecisionRefsRuntime.exerciseTransition,
    frameDecisionRuntime,
    frameSetupRuntime,
    motionFrameInput: frameDecisionRefsRuntime.motionFrameInput,
    status: "ready",
  };
}
