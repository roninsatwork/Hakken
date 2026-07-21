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

function applyDeadzone(value: number, deadzone: number) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * (magnitude - deadzone);
}

function stabilizePoseOnlyPlayerHead(
  head: MovementHeadAngles,
  options: { preserveActiveSpineYaw?: boolean } = {},
): MovementHeadAngles {
  if (head.source !== "pose") return head;

  const strongYaw = Math.abs(head.yaw) >= 0.65;
  const yawDeadzone = options.preserveActiveSpineYaw && strongYaw ? 0 : 0.45;
  const yawScale = options.preserveActiveSpineYaw && strongYaw ? 0.85 : 0.4;

  return {
    ...head,
    pitch: applyDeadzone(head.pitch, 0.025) * 0.98,
    yaw: applyDeadzone(head.yaw, yawDeadzone) * yawScale,
    roll: applyDeadzone(head.roll, 0.06) * 0.82,
  };
}

export function resolveMovementAvatarRecordedHeadAngles({
  calibration = null,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  rawHead,
}: {
  calibration?: MovementCalibration | null;
  profile?: MovementAvatarTrackingProfile;
  rawHead: MovementHeadAngles;
}): MovementHeadAngles {
  const poseOnlyHeadScale = rawHead.source === "pose"
    ? { pitch: 0.78, roll: 0.72, yaw: 0.85 }
    : { pitch: 0.85, roll: 0.72, yaw: 0.8 };

  // Measure the head relative to the recording's neutral head pose when the
  // neutral was captured in the same source space (face vs pose). This makes a
  // consistent screen-look the baseline so it reads as level, while genuine
  // head movement away from that baseline is preserved. Falls back to absolute
  // angles when no matching-space neutral is available.
  const neutral = calibration?.headNeutral;
  const neutralMatchesSource = Boolean(neutral && neutral.source === rawHead.source);
  const neutralPitch = neutralMatchesSource ? neutral!.pitch : 0;
  const neutralYaw = neutralMatchesSource ? neutral!.yaw : 0;
  const neutralRoll = neutralMatchesSource ? neutral!.roll : 0;

  return {
    pitch: clamp(
      (rawHead.pitch - neutralPitch) * poseOnlyHeadScale.pitch + profile.headPitchOffset,
      Math.max(profile.minHeadPitch, -0.42),
      Math.min(profile.maxHeadPitch, 0.42),
    ),
    yaw: clamp(
      (rawHead.yaw - neutralYaw) * poseOnlyHeadScale.yaw + profile.headYawOffset,
      -Math.min(profile.maxHeadYaw, 0.9),
      Math.min(profile.maxHeadYaw, 0.9),
    ),
    roll: clamp(
      (rawHead.roll - neutralRoll) * poseOnlyHeadScale.roll + profile.headRollOffset,
      -Math.min(profile.maxHeadRoll, 0.35),
      Math.min(profile.maxHeadRoll, 0.35),
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
  mirrorHeadForDisplay,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  rawHead,
  shouldApplySpine = false,
}: {
  avatarRole: "instructor" | "player";
  calibration: MovementCalibration | null;
  headMotionIntent: MovementHeadMotionIntent;
  mirrorHeadForDisplay?: boolean;
  profile?: MovementAvatarTrackingProfile;
  rawHead: MovementHeadAngles;
  shouldApplySpine?: boolean;
}): MovementAvatarHeadDecision {
  const isPlayer = avatarRole === "player";
  const sharedPoseHeadTrackingReady =
    isPlayer && rawHead.source === "pose" && rawHead.confidence >= 0.75;
  const recordedHeadTrackingReady =
    !isPlayer &&
    (
      (rawHead.source === "face" && rawHead.confidence >= 0.35) ||
      (rawHead.source === "pose" && rawHead.confidence >= 0.75)
    );
  // Pose-only head evidence is already in the same display/anatomical space
  // for the instructor and the opposite-player imitation. Sending it through
  // player-only calibration, deadzones, and intent offsets creates two visible
  // head paths from identical source angles. Face tracking remains calibrated;
  // pose-only tracking uses one shared recorded transform for both avatars.
  const shouldApplyPlayerHeadMotion =
    isPlayer && Boolean(calibration) && !sharedPoseHeadTrackingReady;
  const calibratedPlayerHead = shouldApplyPlayerHeadMotion
    ? applyHeadCalibration({
        rawHead,
        calibration,
        profile,
      })
    : null;
  const stabilizedPlayerHead = calibratedPlayerHead
    ? stabilizePoseOnlyPlayerHead(calibratedPlayerHead, {
        preserveActiveSpineYaw: shouldApplySpine,
      })
    : null;
  const sharedPoseHead = sharedPoseHeadTrackingReady
    ? resolveMovementAvatarRecordedHeadAngles({ profile, rawHead })
    : null;
  const appliedHead = sharedPoseHead ?? (stabilizedPlayerHead
    ? (mirrorHeadForDisplay ?? avatarRole === "player")
        ? resolveMovementAvatarMirrorHeadForDisplay({
            avatarRole,
            head: stabilizedPlayerHead,
          })
        : stabilizedPlayerHead
    : recordedHeadTrackingReady
      ? resolveMovementAvatarRecordedHeadAngles({
          calibration,
          profile,
          rawHead,
        })
      : getNeutralMovementHeadAngles(profile));
  const shouldApplyHeadMotion =
    shouldApplyPlayerHeadMotion || recordedHeadTrackingReady || sharedPoseHeadTrackingReady;
  const headOwner = sharedPoseHeadTrackingReady
    ? "shared-pose"
    : shouldApplyPlayerHeadMotion
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
    // Player face/pose landmark ownership and lateral coordinates have already
    // been mapped before head estimation. Reversing yaw again here makes the
    // player avatar turn away from the recorded instructor; preserve the same
    // mapped yaw, roll, and pitch at application time.
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
