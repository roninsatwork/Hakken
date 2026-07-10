import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
} from "./movementTrackingCalibration";

/**
 * Per-avatar overrides on top of DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE.
 *
 * Geometry-dependent values are derived from MovementAvatarRigMeasurements at
 * VRM load and smoothing values are unified in the default profile, so the
 * only surviving per-avatar knob is the mesh-aesthetic head pitch trim: the
 * four VIPE skeletons measure identically (hip 0.875, leg 0.708, arm 0.358,
 * torso 0.498) but each mesh carries its face at a slightly different pitch,
 * which no rig measurement can observe.
 */
const AVATAR_TRACKING_PROFILES: Record<string, Partial<MovementAvatarTrackingProfile>> = {
  "/models/VIPE_Hero__1914.vrm": {
    headPitchOffset: 0.03,
  },
  "/models/VIPE_Hero__949.vrm": {
    headPitchOffset: -0.02,
  },
  "/models/VIPE_Hero__2575.vrm": {
    headPitchOffset: 0.02,
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
