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
}: {
  currentModel: MovementRetargetSourceModel | null;
  now?: number;
  poseLandmarks: TrackingLandmark[];
  providedModel: MovementRetargetSourceModel | null;
}): MovementRetargetSourceModel | null {
  if (providedModel) return providedModel;
  if (currentModel) return currentModel;

  return buildMovementRetargetSourceModel({
    now,
    poseLandmarks,
  });
}
