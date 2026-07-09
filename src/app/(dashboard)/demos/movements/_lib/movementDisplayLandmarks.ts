import {
  prepareVrmSolverInput,
  type VrmLandmarkInput,
  type VrmMotionPayload,
  type VrmSolverLandmark,
} from "./vrmRigging";

export type MovementDisplayLandmarkRole = "live-player" | "recorded-instructor";

export type MovementDisplayLandmarkFrame = {
  hasWorldPose: boolean;
  pose: VrmSolverLandmark[];
  worldPose: VrmSolverLandmark[];
};

export function resolveMovementDisplayLandmarkFrame({
  isPlaying,
  payload,
  rawLandmarks,
  role,
}: {
  isPlaying: boolean;
  payload: VrmMotionPayload | null;
  rawLandmarks: VrmLandmarkInput[];
  role: MovementDisplayLandmarkRole;
}): MovementDisplayLandmarkFrame {
  // This is display preparation only; MovementSourceFrame construction keeps
  // raw source landmarks separate from mirrored/presentation landmarks.
  const hasWorldPose = payload?.worldLandmarks?.length === 33;
  const prepared = prepareVrmSolverInput({
    rawLandmarks,
    payload,
    isPlayer: role === "live-player",
    isPlaying,
    mirrorForDisplay: role === "live-player",
  });

  return {
    hasWorldPose,
    pose: prepared.imageLandmarks,
    worldPose: prepared.solverLandmarks ?? [],
  };
}
