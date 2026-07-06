import type {
  MovementAvatarHeadDecision,
  MovementAvatarRawHeadDecision,
} from "./movementAvatarPipeline";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  applyHeadCalibration,
  estimateMovementHeadAngles,
  getNeutralMovementHeadAngles,
  type MovementAvatarTrackingProfile,
  type MovementCalibration,
  type MovementHeadAngles,
  type MovementHeadMotionIntent,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function resolveMovementAvatarRecordedHeadAngles({
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  rawHead,
}: {
  profile?: MovementAvatarTrackingProfile;
  rawHead: MovementHeadAngles;
}): MovementHeadAngles {
  const poseOnlyHeadScale = rawHead.source === "pose"
    ? { pitch: 0.38, roll: 0.22, yaw: 0.28 }
    : { pitch: 0.72, roll: 0.48, yaw: 0.52 };

  return {
    pitch: clamp(
      rawHead.pitch * poseOnlyHeadScale.pitch + profile.headPitchOffset,
      Math.max(profile.minHeadPitch, -0.18),
      Math.min(profile.maxHeadPitch, 0.24),
    ),
    yaw: clamp(
      rawHead.yaw * poseOnlyHeadScale.yaw + profile.headYawOffset,
      -Math.min(profile.maxHeadYaw, 0.2),
      Math.min(profile.maxHeadYaw, 0.2),
    ),
    roll: clamp(
      rawHead.roll * poseOnlyHeadScale.roll + profile.headRollOffset,
      -Math.min(profile.maxHeadRoll, 0.12),
      Math.min(profile.maxHeadRoll, 0.12),
    ),
    confidence: rawHead.confidence,
    source: rawHead.source,
  };
}

export function resolveMovementAvatarRawHeadDecision({
  faceLandmarks,
  poseLandmarks,
}: {
  faceLandmarks?: TrackingLandmark[] | null;
  poseLandmarks: TrackingLandmark[];
}): MovementAvatarRawHeadDecision {
  const selectedFaceLandmarks = faceLandmarks ?? null;

  return {
    faceLandmarks: selectedFaceLandmarks,
    rawHead: estimateMovementHeadAngles({
      faceLandmarks: selectedFaceLandmarks,
      poseLandmarks,
    }),
  };
}

export function resolveMovementAvatarHeadDecision({
  avatarRole,
  calibration,
  headMotionIntent,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  rawHead,
}: {
  avatarRole: "instructor" | "player";
  calibration: MovementCalibration | null;
  headMotionIntent: MovementHeadMotionIntent;
  profile?: MovementAvatarTrackingProfile;
  rawHead: MovementHeadAngles;
}): MovementAvatarHeadDecision {
  const isPlayer = avatarRole === "player";
  const recordedHeadTrackingReady =
    !isPlayer &&
    (
      (rawHead.source === "face" && rawHead.confidence >= 0.35) ||
      (rawHead.source === "pose" && rawHead.confidence >= 0.75)
    );
  const shouldApplyPlayerHeadMotion = isPlayer && Boolean(calibration);
  const calibratedPlayerHead = shouldApplyPlayerHeadMotion
    ? applyHeadCalibration({
        rawHead,
        calibration,
        profile,
      })
    : null;
  const appliedHead = calibratedPlayerHead
    ? resolveMovementAvatarMirrorHeadForDisplay({
        avatarRole,
        head: calibratedPlayerHead,
      })
    : recordedHeadTrackingReady
      ? resolveMovementAvatarRecordedHeadAngles({
          profile,
          rawHead,
        })
      : getNeutralMovementHeadAngles(profile);
  const shouldApplyHeadMotion = shouldApplyPlayerHeadMotion || recordedHeadTrackingReady;
  const headOwner = shouldApplyPlayerHeadMotion
    ? "player-calibrated"
    : recordedHeadTrackingReady
      ? `recorded-${rawHead.source}`
      : "neutral";
  return {
    appliedHead,
    headOwner,
    headPitch: appliedHead.pitch + (shouldApplyPlayerHeadMotion ? headMotionIntent.depth * 0.22 : 0),
    headRoll: appliedHead.roll + (shouldApplyPlayerHeadMotion ? -headMotionIntent.lateral * 0.16 : 0),
    headYaw: appliedHead.yaw + (shouldApplyPlayerHeadMotion ? headMotionIntent.lateral * 0.18 : 0),
    shouldApplyHeadMotion,
    shouldApplyPlayerHeadMotion,
  };
}

export function resolveMovementAvatarMirrorHeadForDisplay({
  avatarRole,
  head,
}: {
  avatarRole: "instructor" | "player";
  head: MovementHeadAngles;
}): MovementHeadAngles {
  if (avatarRole !== "player") return head;

  return {
    ...head,
    roll: -head.roll,
    yaw: -head.yaw,
  };
}

export function resolveMovementAvatarHeadWorldYaw({
  avatarRootYaw,
  headYaw,
}: {
  avatarRootYaw: number;
  headYaw: number;
}) {
  return avatarRootYaw + headYaw;
}
