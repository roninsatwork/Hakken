import type { VrmSolverLandmark } from "./vrmRigging";
import {
  getCalibratedFloorCorrection,
  type MovementAvatarTrackingProfile,
  type MovementCalibration,
} from "./movementTrackingCalibration";

export type MovementAvatarFloorRuntimeDecision = {
  calibratedFloorCorrection: number;
  currentFloorY: number;
  floorConfidence: number;
};

export function resolveMovementAvatarFloorRuntime({
  calibration,
  poseLandmarks,
  profile,
  shouldUseCalibratedFloorCorrection,
}: {
  calibration: MovementCalibration | null;
  poseLandmarks: VrmSolverLandmark[];
  profile: MovementAvatarTrackingProfile;
  shouldUseCalibratedFloorCorrection: boolean;
}): MovementAvatarFloorRuntimeDecision {
  const currentFloorY = Math.max(
    poseLandmarks[27]?.y ?? 0,
    poseLandmarks[28]?.y ?? 0,
    poseLandmarks[31]?.y ?? 0,
    poseLandmarks[32]?.y ?? 0,
  );
  const floorConfidence = Math.max(
    poseLandmarks[27]?.visibility ?? 0,
    poseLandmarks[28]?.visibility ?? 0,
    poseLandmarks[31]?.visibility ?? 0,
    poseLandmarks[32]?.visibility ?? 0,
  );

  return {
    calibratedFloorCorrection: shouldUseCalibratedFloorCorrection
      ? getCalibratedFloorCorrection({
          calibration,
          currentFloorY,
          floorConfidence,
          profile,
        })
      : 0,
    currentFloorY,
    floorConfidence,
  };
}
