import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type {
  MovementAvatarArmAimOptionsDecision,
  MovementAvatarBoneEaseOptionsDecision,
  MovementAvatarHipsApplicationDecision,
  MovementAvatarHipsPositionOptionsDecision,
  MovementAvatarLegacyLowerBodyAimOptionsDecision,
  MovementAvatarPlantedSquatIkOptionsDecision,
} from "./movementAvatarPipeline";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
} from "./movementTrackingCalibration";

export function resolveMovementAvatarArmAimOptions({
  avatarRole,
  frontBias,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  safeZScale,
}: {
  avatarRole: "instructor" | "player";
  frontBias: number;
  profile?: MovementAvatarTrackingProfile;
  safeZScale?: number;
}): MovementAvatarArmAimOptionsDecision {
  const isPlayer = avatarRole === "player";
  const baseOptions = {
    minVectorLengthSq: 0.00002,
    storeVisibilityThreshold: isPlayer ? profile.armStoreVisibility : 0.6,
    visibilityThreshold: isPlayer ? profile.armVisibility : 0.2,
    zScale: safeZScale,
  };

  return {
    lowerArm: {
      ...baseOptions,
      frontBias: frontBias * 1.15,
      slerpOverride: isPlayer ? profile.lowerArmSlerp : 0.45,
    },
    upperArm: {
      ...baseOptions,
      frontBias: frontBias * 0.9,
      slerpOverride: isPlayer ? profile.upperArmSlerp : 0.42,
    },
  };
}

export function resolveMovementAvatarLegacyLowerBodyAimOptions({
  avatarRole,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
}: {
  avatarRole: "instructor" | "player";
  profile?: MovementAvatarTrackingProfile;
}): MovementAvatarLegacyLowerBodyAimOptionsDecision {
  const isPlayer = avatarRole === "player";
  const leg = {
    minVectorLengthSq: 0.00002,
    slerpOverride: isPlayer ? profile.legSlerp : 0.36,
    storeVisibilityThreshold: isPlayer ? profile.legStoreVisibility : 0.6,
    visibilityThreshold: isPlayer ? profile.legVisibility : 0.2,
  };

  return {
    foot: {
      ...leg,
      slerpOverride: isPlayer ? profile.footSlerp : 0.32,
      visibilityThreshold: isPlayer ? profile.footVisibility : 0.2,
    },
    leg,
  };
}

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
}: {
  avatarRole: "instructor" | "player";
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  profile?: MovementAvatarTrackingProfile;
}): MovementAvatarHipsPositionOptionsDecision {
  const isPlayer = avatarRole === "player";
  const shouldUsePlayerSquatDrop = isPlayer && lowerBodyDrive.shouldDrivePlayerSquat;
  const shouldUsePlayerFloorCorrection =
    isPlayer && lowerBodyDrive.shouldDrivePlayerSquat;

  return {
    avatarRootVisualLerp: isPlayer ? 0.28 : 0.34,
    floorContactCorrectionScale: isPlayer
      ? shouldUsePlayerFloorCorrection ? 0.7 : 0
      : 0.86,
    rootLerp: isPlayer ? 0.38 : 0.48,
    shouldUseCalibratedFloorCorrection: isPlayer,
    squatHipDropLimit: shouldUsePlayerSquatDrop
      ? 0.88
      : profile.squatHipDropLimit ?? 0.42,
    squatHipDropScale: shouldUsePlayerSquatDrop
      ? 0.78
      : profile.squatHipDropScale ?? 0.38,
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
    handNeutralSlerp: isPlayer ? 0.48 : 0.32,
    lowerBodyNeutralSlerp: isPlayer ? 0.12 : 0.08,
    singleLegRaiseSlerp: isPlayer ? 0.72 : 0.58,
    solvedLowerBodySlerp: isPlayer ? 0.62 : 0.54,
    squatFlexionSlerp: isPlayer ? 0.84 : 0.62,
  };
}
