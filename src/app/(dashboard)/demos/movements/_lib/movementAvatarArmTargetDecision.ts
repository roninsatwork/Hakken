import type {
  MovementAvatarArmDecision,
  MovementAvatarArmSide,
} from "./movementAvatarPipeline";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
} from "./movementTrackingCalibration";

export function resolveMovementAvatarArmDecision({
  bodyConfidence,
  isPlayer,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  side,
}: {
  bodyConfidence: Record<string, number>;
  isPlayer: boolean;
  profile?: MovementAvatarTrackingProfile;
  side: MovementAvatarArmSide;
}): MovementAvatarArmDecision {
  const shoulderKey = side === "left" ? "leftShoulder" : "rightShoulder";
  const elbowKey = side === "left" ? "leftElbow" : "rightElbow";
  const wristKey = side === "left" ? "leftWrist" : "rightWrist";
  const handKey = side === "left" ? "leftHand" : "rightHand";
  const endpointConfidence = Math.max(bodyConfidence[wristKey] ?? 0, bodyConfidence[handKey] ?? 0);
  const isTrackingReady =
    !isPlayer ||
    (
      (bodyConfidence[shoulderKey] ?? 0) >= profile.armVisibility &&
      endpointConfidence >= profile.armVisibility &&
      (
        (bodyConfidence[elbowKey] ?? 0) >= profile.armVisibility ||
        (bodyConfidence[handKey] ?? 0) >= 0.15
      )
    );

  return {
    endpointConfidence,
    isTrackingReady,
    side,
    unreadyFallback: isPlayer && endpointConfidence >= 0.12 ? "hold-last-good" : "relax",
  };
}
