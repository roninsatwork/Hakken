import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type {
  MovementAvatarBoneEaseOptionsDecision,
  MovementAvatarHipsApplicationDecision,
  MovementAvatarHipsPositionOptionsDecision,
  MovementAvatarPlantedSquatIkOptionsDecision,
} from "./movementAvatarPipeline";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
} from "./movementTrackingCalibration";



export function resolveMovementAvatarPlantedSquatIkOptions({
  avatarRole,
}: {
  avatarRole: "instructor" | "player";
}): MovementAvatarPlantedSquatIkOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    footSlerp: isPlayer ? 0.3 : 0.34,
    legSlerp: isPlayer ? 0.52 : 0.66,
  };
}

export function resolveMovementAvatarHipsPositionOptions({
  avatarRole,
  lowerBodyDrive,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  rigMeasurements = null,
}: {
  avatarRole: "instructor" | "player";
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  profile?: MovementAvatarTrackingProfile;
  rigMeasurements?: { legLength: number } | null;
}): MovementAvatarHipsPositionOptionsDecision {
  const isPlayer = avatarRole === "player";
  const shouldUsePlayerSquatDrop = isPlayer && lowerBodyDrive.shouldDrivePlayerSquat;
  const shouldUsePlayerFloorCorrection =
    isPlayer && lowerBodyDrive.shouldDrivePlayerSquat;
  // A full-depth squat drops the hips by a fixed fraction of leg length;
  // the hand-authored defaults encode the same ratios at the measured VIPE
  // leg length of 0.708 (0.38 = 0.54x, 0.42 = 0.59x).
  const presentationSquatDropScale =
    rigMeasurements !== null
      ? rigMeasurements.legLength * 0.54
      : profile.squatHipDropScale ?? 0.38;
  const presentationSquatDropLimit =
    rigMeasurements !== null
      ? rigMeasurements.legLength * 0.59
      : profile.squatHipDropLimit ?? 0.42;

  return {
    avatarRootVisualLerp: isPlayer ? 0.28 : 0.34,
    floorContactCorrectionScale: isPlayer
      ? shouldUsePlayerFloorCorrection ? 0.7 : 0
      : 0.86,
    rootLerp: isPlayer ? 0.38 : 0.48,
    shouldUseCalibratedFloorCorrection: isPlayer,
    squatHipDropLimit: shouldUsePlayerSquatDrop
      ? 0.88
      : presentationSquatDropLimit,
    squatHipDropScale: shouldUsePlayerSquatDrop
      ? 0.78
      : presentationSquatDropScale,
  };
}

export function resolveMovementAvatarHipsApplication({
  hipsPositionOptions,
  lowerBodyTrackingReady,
  playerSquatPresentationDepth,
  shouldApplyLowerBody,
}: {
  hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision;
  lowerBodyTrackingReady: boolean;
  playerSquatPresentationDepth: number;
  shouldApplyLowerBody: boolean;
}): MovementAvatarHipsApplicationDecision {
  const canApplyLowerBodyHips = lowerBodyTrackingReady && shouldApplyLowerBody;
  const squatDrop = canApplyLowerBodyHips
    ? Math.min(
        hipsPositionOptions.squatHipDropLimit,
        playerSquatPresentationDepth * hipsPositionOptions.squatHipDropScale,
      )
    : 0;

  return {
    shouldApplyFloorContactCorrection:
      canApplyLowerBodyHips &&
      hipsPositionOptions.floorContactCorrectionScale > 0,
    shouldApplySquatDrop: squatDrop > 0,
    squatDrop,
  };
}

export function resolveMovementAvatarBoneEaseOptions({
  avatarRole,
}: {
  avatarRole: "instructor" | "player";
}): MovementAvatarBoneEaseOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    armRelaxedSlerp: isPlayer ? 0.16 : 0.1,
    demoFallbackSlerp: isPlayer ? 0.18 : 0.12,
    lowerBodyNeutralSlerp: isPlayer ? 0.12 : 0.08,
    singleLegRaiseSlerp: isPlayer ? 0.72 : 0.58,
    squatFlexionSlerp: isPlayer ? 0.84 : 0.62,
  };
}
