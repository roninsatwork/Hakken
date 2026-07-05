import {
  resolveMovementAvatarSetup,
  type MovementAvatarSetupState,
  type MovementAvatarSetupTarget,
} from "./movementAvatarSetup";
import type {
  MovementCalibration,
  MovementHandsForConfidence,
  TrackingLandmark,
} from "./movementTrackingCalibration";

export function resolveMovementAvatarSetupRuntimeState({
  faceLandmarks,
  hands,
  isLivePlayer,
  manualCalibration,
  now,
  poseLandmarks,
  previousState,
  worldPoseLandmarks,
}: {
  faceLandmarks?: TrackingLandmark[] | null;
  hands?: MovementHandsForConfidence;
  isLivePlayer: boolean;
  manualCalibration: MovementCalibration | null;
  now?: number;
  poseLandmarks: TrackingLandmark[];
  previousState: MovementAvatarSetupState;
  worldPoseLandmarks?: TrackingLandmark[];
}): MovementAvatarSetupTarget {
  return resolveMovementAvatarSetup({
    faceLandmarks,
    hands,
    isLivePlayer,
    manualCalibration,
    now,
    poseLandmarks,
    previousState,
    worldPoseLandmarks,
  });
}
