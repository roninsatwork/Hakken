import type {
  MovementAvatarHeadApplicationPoseDecision,
  MovementAvatarHeadApplyOptionsDecision,
} from "./movementAvatarPipeline";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
  type MovementHeadMotionIntent,
} from "./movementTrackingCalibration";

export function resolveMovementAvatarHeadApplyOptions({
  avatarRole,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
}: {
  avatarRole: "instructor" | "player";
  profile?: MovementAvatarTrackingProfile;
}): MovementAvatarHeadApplyOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    headPositionSlerp: 0.3,
    headSlerp: isPlayer ? profile.headSlerp : 0.82,
    upperChestCompensationSlerp: 0.18,
  };
}

export function resolveMovementAvatarHeadApplicationPose({
  headMotionIntent,
  headPitch,
  headRoll,
  headYaw,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  shouldApplyHeadMotion,
  shouldApplyLowerBody,
  shouldApplyPlayerHeadMotion,
  shouldApplySpine,
}: {
  headMotionIntent: MovementHeadMotionIntent;
  headPitch: number;
  headRoll: number;
  headYaw: number;
  profile?: MovementAvatarTrackingProfile;
  shouldApplyHeadMotion: boolean;
  shouldApplyLowerBody: boolean;
  shouldApplyPlayerHeadMotion: boolean;
  shouldApplySpine: boolean;
}): MovementAvatarHeadApplicationPoseDecision {
  return {
    headPositionOffset: shouldApplyPlayerHeadMotion
      ? {
          x: headMotionIntent.lateral * 0.025,
          y: -headMotionIntent.vertical * 0.012,
          z: -headMotionIntent.depth * 0.018,
        }
      : null,
    neckRotation: shouldApplyHeadMotion
      ? {
          rotationOrder: "YXZ",
          x: headPitch * profile.neckPitchShare +
            (shouldApplyPlayerHeadMotion ? headMotionIntent.depth * 0.12 : 0),
          y: headYaw * profile.neckYawShare +
            (shouldApplyPlayerHeadMotion ? headMotionIntent.lateral * 0.08 : 0),
          z: headRoll * profile.neckRollShare -
            (shouldApplyPlayerHeadMotion ? headMotionIntent.lateral * 0.08 : 0),
        }
      : null,
    upperChestCompensation:
      shouldApplyPlayerHeadMotion && !shouldApplyLowerBody && !shouldApplySpine
        ? {
            x: headMotionIntent.depth * 0.1,
            y: headMotionIntent.lateral * 0.06,
            z: -headMotionIntent.lateral * 0.08,
          }
        : null,
  };
}

export function resolveMovementAvatarHeadBonePitch({
  headPitch,
}: {
  avatarRole: "instructor" | "player";
  headPitch: number;
}) {
  // Tracking pitch is user-intent pitch. The VRM head bone's local X axis is
  // opposite in the rendered rig, so invert only at the final bone boundary.
  return -headPitch;
}
