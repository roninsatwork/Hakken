import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type {
  MovementAvatarFootLockEngagementDecision,
  MovementAvatarFootLockOptionsDecision,
} from "./movementAvatarPipeline";
import type { MovementRetargetFrame } from "./movementRetargeting";

export function resolveMovementAvatarFootLockOptions({
  avatarRole,
}: {
  avatarRole: "instructor" | "player";
}): MovementAvatarFootLockOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    correctionScale: isPlayer ? 0.4 : 0.5,
    engageSlerp: 0.32,
    initialStrength: 0.25,
    maxLateralDriftBeforeReset: 0.55,
    maxVerticalCorrection: 0.45,
    minStrengthBeforeClear: 0.04,
    releaseSlerp: 0.28,
    verticalCorrectionScale: 1,
  };
}

export function resolveMovementAvatarFootLockEngagement({
  avatarRole,
  lowerBodyDrive,
  lowerBodyTrackingReady,
  retargetFrame,
  shouldApplyLowerBody,
  shouldLockActiveTorso = false,
  shouldHoldPlayerSquatPose = false,
}: {
  avatarRole: "instructor" | "player";
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTrackingReady: boolean;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldLockActiveTorso?: boolean;
  shouldHoldPlayerSquatPose?: boolean;
}): MovementAvatarFootLockEngagementDecision {
  const hasReliablePlantedFeet =
    lowerBodyTrackingReady &&
    (shouldApplyLowerBody || shouldLockActiveTorso) &&
    (retargetFrame.contacts.leftFoot || retargetFrame.contacts.rightFoot) &&
    retargetFrame.debug.sourceQuality >= 0.45;

  if (!hasReliablePlantedFeet) {
    return { shouldEngage: false };
  }

  if (avatarRole === "player") {
    return {
      shouldEngage:
        lowerBodyDrive.shouldDrivePlayerSquat ||
        lowerBodyDrive.shouldDrivePlayerLegRaise ||
        shouldLockActiveTorso ||
        shouldHoldPlayerSquatPose,
    };
  }

  return { shouldEngage: true };
}
