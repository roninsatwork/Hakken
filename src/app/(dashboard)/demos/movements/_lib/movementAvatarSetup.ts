import {
  resolveMovementAutoCalibrationState,
  type MovementAutoCalibrationKind,
  type MovementAutoCalibrationState,
  type MovementCalibration,
  type MovementHandsForConfidence,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import {
  buildLiveMovementSourceFrame,
  type MovementSourceFrame,
} from "./movementSourceFrame";

export type MovementAvatarSetupState = {
  autoCalibration: MovementAutoCalibrationState;
};

export type MovementAvatarSetupTarget = {
  activeCalibration: MovementCalibration | null;
  autoCalibrationKind: MovementAutoCalibrationKind | null;
  nextState: MovementAvatarSetupState;
  sourceFrame: MovementSourceFrame | null;
};

export function createMovementAvatarSetupState(): MovementAvatarSetupState {
  return {
    autoCalibration: {
      calibration: null,
      kind: null,
      samples: [],
    },
  };
}

export function resolveMovementAvatarSetup({
  faceLandmarks,
  hands,
  isLivePlayer,
  manualCalibration,
  now = Date.now(),
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
  previousState?: MovementAvatarSetupState | null;
  worldPoseLandmarks?: TrackingLandmark[];
}): MovementAvatarSetupTarget {
  const emptyState = createMovementAvatarSetupState();
  const currentState = previousState ?? emptyState;

  if (!isLivePlayer) {
    return {
      activeCalibration: null,
      autoCalibrationKind: null,
      nextState: emptyState,
      sourceFrame: null,
    };
  }

  const autoCalibration = manualCalibration
    ? emptyState.autoCalibration
    : resolveMovementAutoCalibrationState({
        faceLandmarks,
        now,
        poseLandmarks,
        state: currentState.autoCalibration,
      });
  const activeCalibration = manualCalibration ?? autoCalibration.calibration;
  const sourceFrame = buildLiveMovementSourceFrame({
    capturedAt: now,
    hands,
    poseLandmarks,
    requirements: {
      calibrationQuality: activeCalibration?.quality ?? null,
    },
    sourceStatus: "raw",
    worldPoseLandmarks,
  });

  return {
    activeCalibration,
    autoCalibrationKind: autoCalibration.kind,
    nextState: {
      autoCalibration,
    },
    sourceFrame,
  };
}
