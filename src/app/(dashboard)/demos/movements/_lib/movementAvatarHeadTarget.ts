import {
  resolveMovementAvatarHeadApplicationPose,
  resolveMovementAvatarHeadApplyOptions,
  resolveMovementAvatarHeadBonePitch,
  resolveMovementAvatarHeadDecision,
  resolveMovementAvatarHeadWorldYaw,
  resolveMovementAvatarRawHeadDecision,
  type MovementAvatarHeadApplicationPoseDecision,
  type MovementAvatarHeadApplyOptionsDecision,
  type MovementAvatarHeadDecision,
  type MovementAvatarRawHeadDecision,
} from "./movementAvatarPipeline";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  getMovementHeadMotionIntent,
  type MovementAvatarTrackingProfile,
  type MovementCalibration,
  type MovementHeadMotionIntent,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

export type MovementAvatarHeadTargetDecision = {
  applicationPose: MovementAvatarHeadApplicationPoseDecision;
  applyOptions: MovementAvatarHeadApplyOptionsDecision;
  headBonePitch: number;
  headDecision: MovementAvatarHeadDecision;
  headMotionIntent: MovementHeadMotionIntent;
  headWorldYaw: number;
  rawHeadDecision: MovementAvatarRawHeadDecision;
};

export function resolveMovementAvatarHeadTarget({
  avatarRole,
  avatarRootYaw,
  calibration,
  faceLandmarks,
  headMotionIntent,
  mirrorHeadForDisplay,
  poseLandmarks,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  shouldApplyLowerBody,
  shouldApplySpine,
}: {
  avatarRole: "instructor" | "player";
  avatarRootYaw: number;
  calibration: MovementCalibration | null;
  faceLandmarks?: TrackingLandmark[] | null;
  headMotionIntent?: MovementHeadMotionIntent;
  mirrorHeadForDisplay?: boolean;
  poseLandmarks: TrackingLandmark[];
  profile?: MovementAvatarTrackingProfile;
  shouldApplyLowerBody: boolean;
  shouldApplySpine: boolean;
}): MovementAvatarHeadTargetDecision {
  const resolvedHeadMotionIntent = headMotionIntent ?? getMovementHeadMotionIntent({
    calibration,
    faceLandmarks: faceLandmarks ?? undefined,
    poseLandmarks,
  });
  const rawHeadDecision = resolveMovementAvatarRawHeadDecision({
    faceLandmarks: faceLandmarks ?? null,
    poseLandmarks,
  });
  const headDecision = resolveMovementAvatarHeadDecision({
    avatarRole,
    calibration,
    headMotionIntent: resolvedHeadMotionIntent,
    mirrorHeadForDisplay,
    profile,
    rawHead: rawHeadDecision.rawHead,
    shouldApplySpine,
  });
  const headBonePitch = resolveMovementAvatarHeadBonePitch({
    avatarRole,
    headPitch: headDecision.headPitch,
  });
  const applyOptions = resolveMovementAvatarHeadApplyOptions({
    // Shared pose-only head targets also share their interpolation semantics.
    // Role-specific slerp after a common target would still create a rendered
    // three-party mismatch during continuous movement.
    avatarRole: headDecision.headOwner === "shared-pose" ? "instructor" : avatarRole,
    profile,
  });
  const applicationPose = resolveMovementAvatarHeadApplicationPose({
    headMotionIntent: resolvedHeadMotionIntent,
    headPitch: headBonePitch,
    headRoll: headDecision.headRoll,
    headYaw: headDecision.headYaw,
    profile,
    shouldApplyHeadMotion: headDecision.shouldApplyHeadMotion,
    shouldApplyLowerBody,
    shouldApplyPlayerHeadMotion: headDecision.shouldApplyPlayerHeadMotion,
    shouldApplySpine,
  });

  return {
    applicationPose,
    applyOptions,
    headBonePitch,
    headDecision,
    headMotionIntent: resolvedHeadMotionIntent,
    headWorldYaw: resolveMovementAvatarHeadWorldYaw({
      avatarRootYaw,
      headYaw: headDecision.headYaw,
    }),
    rawHeadDecision,
  };
}
