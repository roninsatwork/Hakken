import {
  resolveMovementAvatarHipsApplication,
  resolveMovementAvatarHipsPositionOptions,
  type MovementAvatarHipsApplicationDecision,
  type MovementAvatarHipsPositionOptionsDecision,
} from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import { resolveMovementAvatarFloorRuntime, type MovementAvatarFloorRuntimeDecision } from "./movementAvatarFloorRuntime";
import type {
  MovementAvatarTrackingProfile,
  MovementCalibration,
} from "./movementTrackingCalibration";
import type { VrmSolverLandmark } from "./vrmRigging";

export type MovementAvatarHipsFrameRuntimeDecision = {
  floorRuntime: MovementAvatarFloorRuntimeDecision;
  hipsApplication: MovementAvatarHipsApplicationDecision;
  hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision;
};

export function resolveMovementAvatarHipsFrameRuntime({
  avatarRole,
  calibration,
  lowerBodyDrive,
  lowerBodyTrackingReady,
  playerSquatPresentationDepth,
  poseLandmarks,
  profile,
  shouldApplyLowerBody,
}: {
  avatarRole: "instructor" | "player";
  calibration: MovementCalibration | null;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTrackingReady: boolean;
  playerSquatPresentationDepth: number;
  poseLandmarks: VrmSolverLandmark[];
  profile: MovementAvatarTrackingProfile;
  shouldApplyLowerBody: boolean;
}): MovementAvatarHipsFrameRuntimeDecision {
  const hipsPositionOptions = resolveMovementAvatarHipsPositionOptions({
    avatarRole,
    lowerBodyDrive,
    profile,
  });
  const floorRuntime = resolveMovementAvatarFloorRuntime({
    calibration,
    poseLandmarks,
    profile,
    shouldUseCalibratedFloorCorrection: hipsPositionOptions.shouldUseCalibratedFloorCorrection,
  });
  const hipsApplication = resolveMovementAvatarHipsApplication({
    hipsPositionOptions,
    lowerBodyTrackingReady,
    playerSquatPresentationDepth,
    shouldApplyLowerBody,
  });

  return {
    floorRuntime,
    hipsApplication,
    hipsPositionOptions,
  };
}
