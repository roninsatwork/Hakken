import {
  buildMovementRetargetSourceModel,
  type MovementRetargetSourceModel,
} from "./movementRetargeting";
import type { TrackingLandmark } from "./movementTrackingCalibration";

export function resolveMovementAvatarRetargetSourceRuntimeModel({
  currentModel,
  now = Date.now(),
  poseLandmarks,
  providedModel,
  worldPoseLandmarks,
}: {
  currentModel: MovementRetargetSourceModel | null;
  now?: number;
  poseLandmarks: TrackingLandmark[];
  providedModel: MovementRetargetSourceModel | null;
  worldPoseLandmarks?: TrackingLandmark[] | null;
}): MovementRetargetSourceModel | null {
  if (providedModel) return providedModel;
  if (currentModel) return currentModel;

  return buildMovementRetargetSourceModel({
    now,
    poseLandmarks,
    worldPoseLandmarks,
  });
}
