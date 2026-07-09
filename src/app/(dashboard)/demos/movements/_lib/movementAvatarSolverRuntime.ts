import {
  createVrmImageSolverLandmarks,
  getVrmMotionLandmarks,
  prepareVrmSolverInput,
  type VrmMotionPayload,
  type VrmMotionRef,
} from "./vrmRigging";

type MovementAvatarPreparedSolverInput = ReturnType<typeof prepareVrmSolverInput>;

export type MovementAvatarSolverRuntimeInput = {
  displayPreparedInput: MovementAvatarPreparedSolverInput;
  mirrorPlayerDisplay: boolean;
  payload: VrmMotionPayload | null;
  rawPreparedInput: MovementAvatarPreparedSolverInput;
  targetSolverLandmarks: MovementAvatarPreparedSolverInput["solverLandmarks"];
};

export function resolveMovementAvatarSolverRuntimeInput({
  isPlaying,
  motionRef,
  showPausedPose,
  usesPlayerMotionPath,
}: {
  isPlaying: boolean;
  motionRef: VrmMotionRef;
  showPausedPose: boolean;
  usesPlayerMotionPath: boolean;
}): MovementAvatarSolverRuntimeInput | null {
  const payload = motionRef && !Array.isArray(motionRef) ? motionRef : null;
  const rawLandmarks = getVrmMotionLandmarks(motionRef);
  if (rawLandmarks.length < 33) return null;

  const shouldAnimate = isPlaying || showPausedPose;
  const rawPreparedInput = prepareVrmSolverInput({
    rawLandmarks,
    payload,
    isPlayer: usesPlayerMotionPath,
    isPlaying: shouldAnimate,
  });
  const displayPreparedInput = usesPlayerMotionPath
    ? prepareVrmSolverInput({
        rawLandmarks,
        payload,
        isPlayer: true,
        isPlaying: shouldAnimate,
        mirrorForDisplay: true,
      })
    : rawPreparedInput;
  const mirrorPlayerDisplay = usesPlayerMotionPath;

  return {
    displayPreparedInput,
    mirrorPlayerDisplay,
    payload,
    rawPreparedInput,
    targetSolverLandmarks: mirrorPlayerDisplay
      ? createVrmImageSolverLandmarks(displayPreparedInput.imageLandmarks)
      : rawPreparedInput.solverLandmarks,
  };
}

export type MovementAvatarSolvedFrameRuntime =
  | {
    status: "missing-input";
  }
  | {
    displayPreparedInput: MovementAvatarPreparedSolverInput;
    faceLandmarks: MovementAvatarPreparedSolverInput["faceLandmarks"];
    forceStandby: MovementAvatarPreparedSolverInput["forceStandby"];
    imageLandmarks: MovementAvatarPreparedSolverInput["imageLandmarks"];
    mirrorPlayerDisplay: boolean;
    payload: VrmMotionPayload | null;
    rawPreparedInput: MovementAvatarPreparedSolverInput;
    rigBlendshapes: MovementAvatarPreparedSolverInput["rigBlendshapes"];
    rigHands: MovementAvatarPreparedSolverInput["rigHands"];
    solverLandmarks: MovementAvatarPreparedSolverInput["solverLandmarks"];
    status: "ready";
    targetSolverLandmarks: MovementAvatarPreparedSolverInput["solverLandmarks"];
  };

export function resolveMovementAvatarSolvedFrameRuntime({
  isPlaying,
  motionRef,
  showPausedPose,
  usesPlayerMotionPath,
}: {
  isPlaying: boolean;
  motionRef: VrmMotionRef;
  showPausedPose: boolean;
  usesPlayerMotionPath: boolean;
}): MovementAvatarSolvedFrameRuntime {
  const solverRuntimeInput = resolveMovementAvatarSolverRuntimeInput({
    isPlaying,
    motionRef,
    showPausedPose,
    usesPlayerMotionPath,
  });
  if (!solverRuntimeInput) {
    return {
      status: "missing-input",
    };
  }

  const {
    displayPreparedInput,
    mirrorPlayerDisplay,
    payload,
    rawPreparedInput,
    targetSolverLandmarks,
  } = solverRuntimeInput;
  const {
    faceLandmarks,
    forceStandby,
    imageLandmarks,
    rigHands,
    rigBlendshapes,
  } = displayPreparedInput;
  const { solverLandmarks } = rawPreparedInput;

  return {
    displayPreparedInput,
    faceLandmarks,
    forceStandby,
    imageLandmarks,
    mirrorPlayerDisplay,
    payload,
    rawPreparedInput,
    rigBlendshapes,
    rigHands,
    solverLandmarks,
    status: "ready",
    targetSolverLandmarks,
  };
}
