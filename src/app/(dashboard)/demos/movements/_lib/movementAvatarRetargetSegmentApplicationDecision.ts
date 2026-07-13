import type {
  MovementAvatarRetargetSegmentApplicationDecision,
  MovementAvatarRetargetSegmentType,
} from "./movementAvatarPipelineTypes";
import {
  getMovementRetargetSegmentZScale,
  type MovementRetargetFrame,
  type MovementRetargetSegmentName,
} from "./movementRetargeting";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
} from "./movementTrackingCalibration";

export function getMovementAvatarRetargetSegmentMinimumConfidence(
  segmentType: MovementAvatarRetargetSegmentType,
) {
  return segmentType === "foot"
    ? 0.03
    : segmentType === "leg"
      ? 0.25
      : 0.3;
}

export function resolveMovementAvatarRetargetSegmentApplication({
  avatarRole,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  retargetFrame,
  segmentName,
  segmentType,
}: {
  avatarRole: "instructor" | "player";
  instructorSquatPresentationDepth: number;
  lowerBodySegmentMotion: number;
  profile?: MovementAvatarTrackingProfile;
  retargetFrame: MovementRetargetFrame;
  segmentName: MovementRetargetSegmentName;
  segmentType: MovementAvatarRetargetSegmentType;
}): MovementAvatarRetargetSegmentApplicationDecision {
  const zScale = getMovementRetargetSegmentZScale(retargetFrame, 0.18);
  const segment = retargetFrame.segments[segmentName];
  const armBaseSlerp = segmentName.includes("UpperArm") ? 0.72 : 0.78;
  // Arm and leg segments re-enter the solve at 0.3 confidence. Applying the
  // normal high-confidence blend on that first frame makes a stale fallback
  // pose jump directly toward a noisy target, and a child-bone jump also drags
  // the rest of its chain. Ramp only the low-confidence recovery band; fully
  // visible motion keeps the existing response.
  const armLinearConfidenceBlend = segmentType === "arm" && segment
    ? Math.max(0, Math.min(1, (segment.confidence - 0.3) / 0.6))
    : 1;
  const armConfidenceBlend = armLinearConfidenceBlend * armLinearConfidenceBlend;
  const legConfidenceBlend = segmentType === "leg" && segment
    ? Math.max(0, Math.min(1, (segment.confidence - 0.3) / 0.3))
    : 1;
  const footConfidenceBlend = segmentType === "foot" && segment
    ? Math.max(0, Math.min(1, (segment.confidence - 0.03) / 0.27))
    : 1;
  const armSlerp = 0.08 + (armBaseSlerp - 0.08) * armConfidenceBlend;
  const legBaseSlerp = profile.legSlerp;
  const legSlerp = 0.08 + (legBaseSlerp - 0.08) * legConfidenceBlend;
  const footSlerp = 0.02 + (profile.footSlerp - 0.02) * footConfidenceBlend * footConfidenceBlend;
  const slerp = segmentType === "foot"
    ? footSlerp
    : segmentType === "arm"
      ? armSlerp
      : segmentType === "spine"
        ? (avatarRole === "player" ? 0.32 : 0.66)
        : legSlerp;

  const inactiveDecision = (
    reason: MovementAvatarRetargetSegmentApplicationDecision["reason"],
  ): MovementAvatarRetargetSegmentApplicationDecision => ({
    reason,
    shouldApply: false,
    slerp,
    zScale,
  });

  // A hard 0.30 leg cutoff caused a one-frame ownership flip whenever a
  // partially occluded shin hovered around that boundary: the visual path
  // alternated between a complete four-leg solve and a partial fallback even
  // though the recorded direction itself remained continuous. Keep a small
  // continuation band below the normal 0.30 recovery ramp. The existing
  // 0.08 slerp and 0.08-radian local-angle cap make that band a conservative
  // hold-and-refine path, while genuinely unavailable legs (< 0.25) still do
  // not drive the rig.
  const minimumConfidence = getMovementAvatarRetargetSegmentMinimumConfidence(segmentType);
  if (!segment || segment.confidence < minimumConfidence) return inactiveDecision("low-confidence");

  return {
    reason: "active",
    shouldApply: true,
    slerp,
    zScale,
  };
}
