import type { MovementAvatarFrameSetupRuntimeDecision } from "./movementAvatarFrameSetupRuntime";

type MovementAvatarMutableRef<T> = {
  current: T;
};

export function applyMovementAvatarFrameSetupRefsRuntime({
  frameSetupRuntime,
  retargetSourceModelRef,
  setupStateRef,
}: {
  frameSetupRuntime: MovementAvatarFrameSetupRuntimeDecision;
  retargetSourceModelRef: MovementAvatarMutableRef<MovementAvatarFrameSetupRuntimeDecision["nextRetargetSourceModel"]>;
  setupStateRef: MovementAvatarMutableRef<MovementAvatarFrameSetupRuntimeDecision["nextSetupState"]>;
}) {
  setupStateRef.current = frameSetupRuntime.nextSetupState;
  retargetSourceModelRef.current = frameSetupRuntime.nextRetargetSourceModel;

  return {
    activeCalibration: frameSetupRuntime.activeCalibration,
    autoCalibrationKind: frameSetupRuntime.autoCalibrationKind,
  };
}
