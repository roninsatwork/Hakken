import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import type {
  MovementAvatarFootLockEngagementDecision,
  MovementAvatarFootLockOptionsDecision,
  MovementAvatarHeadApplicationPoseDecision,
  MovementAvatarHeadApplyOptionsDecision,
  MovementAvatarSpineApplyOptionsDecision,
  MovementAvatarSpineBoneRotationSpec,
  MovementAvatarSpineSolverSpec,
} from "./movementAvatarPipeline";
import type { MovementRetargetFrame } from "./movementRetargeting";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
  type MovementHeadMotionIntent,
} from "./movementTrackingCalibration";

export function resolveMovementAvatarSpineApplyOptions({
  avatarRole,
  shouldApplySpine,
}: {
  avatarRole: "instructor" | "player";
  shouldApplySpine: boolean;
}): MovementAvatarSpineApplyOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    activeDrive: {
      chest: isPlayer ? 0.42 : 0.78,
      hips: isPlayer ? 0.22 : 0.36,
      spine: isPlayer ? 0.44 : 0.82,
      upperChest: isPlayer ? 0.36 : 0.72,
    },
    shouldCountRecordedSpineRetarget: !isPlayer && shouldApplySpine,
    solver: {
      chest: isPlayer ? 0.36 : 0.24,
      hips: isPlayer ? 0.34 : 0.26,
      spine: isPlayer ? 0.42 : 0.28,
      upperChest: isPlayer ? 0.32 : 0.22,
    },
  };
}

export function resolveMovementAvatarActiveSpinePose({
  spineApplyOptions,
  spineDrive,
}: {
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
  spineDrive: MovementAvatarPlayerSpineDrive;
}): MovementAvatarSpineBoneRotationSpec[] {
  return [
    {
      bone: "hips",
      rotation: spineDrive.rotations.hips,
      slerp: spineApplyOptions.activeDrive.hips,
    },
    {
      bone: "spine",
      rotation: spineDrive.rotations.spine,
      slerp: spineApplyOptions.activeDrive.spine,
    },
    {
      bone: "chest",
      rotation: spineDrive.rotations.chest,
      slerp: spineApplyOptions.activeDrive.chest,
    },
    {
      bone: "upperChest",
      rotation: spineDrive.rotations.upperChest,
      slerp: spineApplyOptions.activeDrive.upperChest,
    },
  ];
}

export function resolveMovementAvatarSpineSolverPose({
  avatarRole,
  spineApplyOptions,
}: {
  avatarRole: "instructor" | "player";
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
}): MovementAvatarSpineSolverSpec[] {
  const mirrorZ = avatarRole === "instructor";

  return [
    {
      bone: "hips",
      limits: { x: 0.35, y: 0.75, z: 0.45 },
      mirrorZ,
      scale: 1,
      slerp: spineApplyOptions.solver.hips,
      source: "hips",
    },
    {
      bone: "spine",
      limits: { x: 0.45, y: 0.65, z: 0.45 },
      mirrorZ,
      scale: 0.65,
      slerp: spineApplyOptions.solver.spine,
      source: "spine",
    },
    {
      bone: "chest",
      limits: { x: 0.35, y: 0.5, z: 0.35 },
      mirrorZ,
      scale: 0.35,
      slerp: spineApplyOptions.solver.chest,
      source: "spine",
    },
    {
      bone: "upperChest",
      limits: { x: 0.25, y: 0.35, z: 0.25 },
      mirrorZ,
      scale: 0.2,
      slerp: spineApplyOptions.solver.upperChest,
      source: "spine",
    },
  ];
}

export function resolveMovementAvatarSpineNeutralPose(): MovementAvatarSpineBoneRotationSpec[] {
  return [
    { bone: "hips", rotation: { x: 0, y: 0, z: 0 }, slerp: 0.14 },
    { bone: "spine", rotation: { x: 0.02, y: 0, z: 0 }, slerp: 0.14 },
    { bone: "chest", rotation: { x: 0.02, y: 0, z: 0 }, slerp: 0.14 },
    { bone: "upperChest", rotation: { x: 0.01, y: 0, z: 0 }, slerp: 0.14 },
  ];
}

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
  avatarRole,
  headPitch,
}: {
  avatarRole: "instructor" | "player";
  headPitch: number;
}) {
  return avatarRole === "player" ? -headPitch : headPitch;
}

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
    maxDriftBeforeReset: 0.55,
    minStrengthBeforeClear: 0.04,
    releaseSlerp: 0.28,
  };
}

export function resolveMovementAvatarFootLockEngagement({
  avatarRole,
  lowerBodyDrive,
  lowerBodyTrackingReady,
  retargetFrame,
  shouldApplyLowerBody,
  shouldHoldPlayerSquatPose = false,
}: {
  avatarRole: "instructor" | "player";
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTrackingReady: boolean;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose?: boolean;
}): MovementAvatarFootLockEngagementDecision {
  const hasReliablePlantedFeet =
    lowerBodyTrackingReady &&
    shouldApplyLowerBody &&
    retargetFrame.contacts.leftFoot &&
    retargetFrame.contacts.rightFoot &&
    retargetFrame.debug.sourceQuality >= 0.45;

  if (!hasReliablePlantedFeet) {
    return { shouldEngage: false };
  }

  if (avatarRole === "player") {
    return {
      shouldEngage:
        lowerBodyDrive.shouldDrivePlayerSquat ||
        lowerBodyDrive.shouldDrivePlayerLegRaise ||
        shouldHoldPlayerSquatPose,
    };
  }

  return { shouldEngage: true };
}
