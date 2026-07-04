import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
} from "./movementTrackingCalibration";

const AVATAR_TRACKING_PROFILES: Record<string, Partial<MovementAvatarTrackingProfile>> = {
  "/models/VIPE_Hero__1793.vrm": {
    headPitchOffset: 0,
    headYawOffset: 0,
    headRollOffset: 0,
    headSlerp: 0.6,
    neckPitchShare: 0.28,
    neckYawShare: 0.18,
    neckRollShare: 0.18,
    neckSlerp: 0.26,
    upperArmSlerp: 0.5,
    lowerArmSlerp: 0.56,
    legSlerp: 0.42,
    footSlerp: 0.34,
    armStoreVisibility: 0.24,
    legStoreVisibility: 0.34,
    armVisibility: 0.05,
    legVisibility: 0.12,
    footVisibility: 0.18,
    floorCorrectionScale: 1.6,
    floorCorrectionLimit: 0.35,
  },
  "/models/VIPE_Hero__1914.vrm": {
    headPitchOffset: 0.03,
    headYawOffset: 0,
    headRollOffset: 0,
    headSlerp: 0.58,
    neckPitchShare: 0.3,
    neckYawShare: 0.2,
    neckRollShare: 0.18,
    neckSlerp: 0.25,
    upperArmSlerp: 0.48,
    lowerArmSlerp: 0.54,
    legSlerp: 0.4,
    footSlerp: 0.32,
    armStoreVisibility: 0.26,
    legStoreVisibility: 0.35,
    armVisibility: 0.06,
    legVisibility: 0.12,
    footVisibility: 0.18,
    floorCorrectionScale: 1.55,
    floorCorrectionLimit: 0.32,
  },
  "/models/VIPE_Hero__949.vrm": {
    headPitchOffset: -0.02,
    headYawOffset: 0,
    headRollOffset: 0,
    headSlerp: 0.6,
    neckPitchShare: 0.26,
    neckYawShare: 0.18,
    neckRollShare: 0.16,
    neckSlerp: 0.26,
    upperArmSlerp: 0.5,
    lowerArmSlerp: 0.54,
    legSlerp: 0.42,
    footSlerp: 0.34,
    armStoreVisibility: 0.24,
    legStoreVisibility: 0.34,
    armVisibility: 0.05,
    legVisibility: 0.12,
    footVisibility: 0.18,
    floorCorrectionScale: 1.7,
    floorCorrectionLimit: 0.35,
  },
  "/models/VIPE_Hero__2575.vrm": {
    headPitchOffset: 0.02,
    headYawOffset: 0,
    headRollOffset: 0,
    headSlerp: 0.6,
    neckPitchShare: 0.28,
    neckYawShare: 0.18,
    neckRollShare: 0.18,
    neckSlerp: 0.26,
    upperArmSlerp: 0.48,
    lowerArmSlerp: 0.54,
    legSlerp: 0.42,
    footSlerp: 0.32,
    armStoreVisibility: 0.25,
    legStoreVisibility: 0.35,
    armVisibility: 0.05,
    legVisibility: 0.12,
    footVisibility: 0.2,
    floorCorrectionScale: 1.6,
    floorCorrectionLimit: 0.34,
  },
};

function normalizeAvatarUrl(vrmUrl: string) {
  return vrmUrl.split("?")[0] ?? vrmUrl;
}

export function getMovementAvatarTrackingProfileName(vrmUrl: string) {
  return normalizeAvatarUrl(vrmUrl).split("/").pop() ?? "default";
}

export function getMovementAvatarTrackingProfile(vrmUrl: string): MovementAvatarTrackingProfile {
  const profile = AVATAR_TRACKING_PROFILES[normalizeAvatarUrl(vrmUrl)] ?? {};

  return {
    ...DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
    ...profile,
  };
}
