import {
  resolveMovementAvatarSetupRuntimeState,
} from "./movementAvatarSetupRuntime";
import {
  resolveMovementAvatarRetargetSourceRuntimeModel,
} from "./movementAvatarRetargetSourceRuntime";
import type { MovementAvatarSetupState } from "./movementAvatarSetup";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type {
  MovementCalibration,
  MovementHandsForConfidence,
  TrackingLandmark,
} from "./movementTrackingCalibration";

export type MovementAvatarFrameSetupRuntimeDecision = {
  activeCalibration: MovementCalibration | null;
  autoCalibrationKind: ReturnType<typeof resolveMovementAvatarSetupRuntimeState>["autoCalibrationKind"];
  nextRetargetSourceModel: MovementRetargetSourceModel | null;
  nextSetupState: MovementAvatarSetupState;
};

export function resolveMovementAvatarFrameSetupRuntime({
  currentRetargetSourceModel,
  faceLandmarks,
  hands,
  isLivePlayer,
  manualCalibration,
  now,
  poseLandmarks,
  previousSetupState,
  providedRetargetSourceModel,
  worldPoseLandmarks,
}: {
  currentRetargetSourceModel: MovementRetargetSourceModel | null;
  faceLandmarks?: TrackingLandmark[] | null;
  hands?: MovementHandsForConfidence;
  isLivePlayer: boolean;
  manualCalibration: MovementCalibration | null;
  now?: number;
  poseLandmarks: TrackingLandmark[];
  previousSetupState: MovementAvatarSetupState;
  providedRetargetSourceModel: MovementRetargetSourceModel | null;
  worldPoseLandmarks?: TrackingLandmark[];
}): MovementAvatarFrameSetupRuntimeDecision {
  const setupTarget = resolveMovementAvatarSetupRuntimeState({
    faceLandmarks,
    hands,
    isLivePlayer,
    manualCalibration,
    now,
    poseLandmarks,
    previousState: previousSetupState,
    worldPoseLandmarks,
  });

  return {
    activeCalibration: setupTarget.activeCalibration,
    autoCalibrationKind: setupTarget.autoCalibrationKind,
    nextRetargetSourceModel: resolveMovementAvatarRetargetSourceRuntimeModel({
      currentModel: currentRetargetSourceModel,
      now,
      poseLandmarks,
      providedModel: providedRetargetSourceModel,
      worldPoseLandmarks,
    }),
    nextSetupState: setupTarget.nextState,
  };
}
