import type {
  MovementAvatarRetargetSegmentApplicationDecision,
  MovementAvatarRetargetSegmentType,
} from "./movementAvatarPipeline";
import {
  getMovementRetargetSegmentZScale,
  type MovementRetargetFrame,
  type MovementRetargetSegmentName,
} from "./movementRetargeting";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
} from "./movementTrackingCalibration";

export function resolveMovementAvatarRetargetSegmentApplication({
  avatarRole,
  instructorSquatPresentationDepth,
  lowerBodySegmentMotion,
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
  const isPlayer = avatarRole === "player";
  const zScale = getMovementRetargetSegmentZScale(retargetFrame, 0.18);
  const segment = retargetFrame.segments[segmentName];
  const slerp = segmentType === "foot"
    ? (isPlayer ? profile.footSlerp : 0.36)
    : segmentType === "arm"
      ? segmentName.includes("UpperArm") ? 0.72 : 0.78
      : segmentType === "spine"
        ? (isPlayer ? 0.32 : 0.66)
        : (isPlayer ? profile.legSlerp : 0.42);

  const inactiveDecision = (
    reason: MovementAvatarRetargetSegmentApplicationDecision["reason"],
  ): MovementAvatarRetargetSegmentApplicationDecision => ({
    reason,
    shouldApply: false,
    slerp,
    zScale,
  });

  if (!segment || segment.confidence < 0.3) return inactiveDecision("low-confidence");

  const presentationSquatDepth = isPlayer
    ? retargetFrame.squatDepth
    : instructorSquatPresentationDepth;
  const activeFootMotion = Math.max(
    presentationSquatDepth,
    lowerBodySegmentMotion,
    retargetFrame.kneeLift.left,
    retargetFrame.kneeLift.right,
  );

  if (!isPlayer && segmentType === "foot" && activeFootMotion < 0.22) {
    return inactiveDecision("recorded-foot-low-motion");
  }

  if (!isPlayer && segmentType === "foot") {
    const isLeftFoot = segmentName === "leftFoot";
    const isPlanted = isLeftFoot
      ? retargetFrame.contacts.leftFoot
      : retargetFrame.contacts.rightFoot;
    const kneeLift = isLeftFoot
      ? retargetFrame.kneeLift.left
      : retargetFrame.kneeLift.right;

    if (isPlanted) return inactiveDecision("recorded-foot-planted");
    if (kneeLift < 0.45) return inactiveDecision("recorded-foot-low-knee-lift");
  }

  return {
    reason: "active",
    shouldApply: true,
    slerp,
    zScale,
  };
}
