import type {
  MovementAvatarAppliedLowerBodyDecision,
  MovementAvatarLowerBodyApplicationStageDecision,
} from "./movementAvatarPipeline";
import { resolveMovementAvatarAppliedLowerBodyDecision } from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementRetargetFrame } from "./movementRetargeting";

export type MovementAvatarLowerBodyRetargetApplicationPlan = {
  legRaiseOverlay: {
    depth: number;
    side: "left" | "right";
  } | null;
  plantedSquatIkDepth: number;
  plantInstructorFeet: Array<"left" | "right">;
  squatFlexionDepth: number | null;
};

export type MovementAvatarLowerBodyRetargetAppliedCounts = {
  feet: number;
  legs: number;
  lowerBody: number;
};

export type MovementAvatarLowerBodyRetargetSegmentCounts = {
  applied: number;
  feet: number;
  legs: number;
};

export type MovementAvatarLowerBodyRetargetSegmentCountApplicationResult =
  MovementAvatarLowerBodyRetargetAppliedCounts & {
    footOwnerOverride: "recorded-retarget" | null;
  };

export type MovementAvatarLowerBodyRetargetDecisionApplication = {
  appliedDecision: MovementAvatarAppliedLowerBodyDecision;
  lowerBodyOwner: string;
  feetOwner: string;
  retargetApplicationPlan: MovementAvatarLowerBodyRetargetApplicationPlan;
};

export type MovementAvatarLowerBodyRetargetDecisionApplicationInput = {
  appliedFootSegments: number;
  appliedLegSegments: number;
  appliedLowerBodySegments: number;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  instructorSquatPresentationDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodySegmentMotion: number;
  lowerBodyTrackingReady: boolean;
  playerRetargetLowerBodyMotion: number;
  playerSquatPresentationDepth: number;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose: boolean;
  stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
};

export function applyMovementAvatarLowerBodyRetargetSegmentCounts({
  current,
  segmentCounts,
}: {
  current: MovementAvatarLowerBodyRetargetAppliedCounts;
  segmentCounts: MovementAvatarLowerBodyRetargetSegmentCounts;
}): MovementAvatarLowerBodyRetargetSegmentCountApplicationResult {
  const feet = current.feet + segmentCounts.feet;
  const legs = current.legs + segmentCounts.legs;
  const lowerBody = current.lowerBody + segmentCounts.applied;

  return {
    feet,
    footOwnerOverride: segmentCounts.feet > 0 ? "recorded-retarget" : null,
    legs,
    lowerBody,
  };
}

export function resolveMovementAvatarLowerBodyRetargetApplicationPlan({
  appliedDecision,
  avatarRole,
  balancedPlantedSquatDepth,
  instructorSquatPresentationDepth,
  lowerBodyDrive,
  playerSquatPresentationDepth,
  retargetAppliedLowerBody,
  stageDecision,
}: {
  appliedDecision: MovementAvatarAppliedLowerBodyDecision;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  instructorSquatPresentationDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerSquatPresentationDepth: number;
  retargetAppliedLowerBody: number;
  stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
}): MovementAvatarLowerBodyRetargetApplicationPlan {
  const isPlayer = avatarRole === "player";
  const plantedSquatIkDepth = isPlayer
    ? appliedDecision.hasCompleteLegRetarget
      ? 0
      : playerSquatPresentationDepth
    : !appliedDecision.hasCompleteLegRetarget && balancedPlantedSquatDepth > 0
      ? instructorSquatPresentationDepth
      : 0;
  // A complete four-segment leg solve already contains the visible squat.
  // Adding the canned flexion pose afterwards makes the instructor diverge
  // from the player mirror even though both received the same source skeleton.
  // Keep the fallback only for incomplete leg solves.
  const squatFlexionDepth = !appliedDecision.hasCompleteLegRetarget
    ? Math.max(instructorSquatPresentationDepth, playerSquatPresentationDepth)
    : null;
  const legRaiseOverlay = stageDecision.anchoredPlayerLegRaiseSide && retargetAppliedLowerBody < 4
    ? {
        depth: lowerBodyDrive.playerLegRaiseDepth,
        side: stageDecision.anchoredPlayerLegRaiseSide,
      }
    : null;
  const plantInstructorFeet: Array<"left" | "right"> = [];

  return {
    legRaiseOverlay,
    plantedSquatIkDepth,
    plantInstructorFeet,
    squatFlexionDepth,
  };
}

export function resolveMovementAvatarLowerBodyRetargetDecisionApplication({
  appliedDecision,
  avatarRole,
  balancedPlantedSquatDepth,
  instructorSquatPresentationDepth,
  lowerBodyDrive,
  playerSquatPresentationDepth,
  retargetAppliedLowerBody,
  stageDecision,
}: {
  appliedDecision: MovementAvatarAppliedLowerBodyDecision;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  instructorSquatPresentationDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerSquatPresentationDepth: number;
  retargetAppliedLowerBody: number;
  stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
}): MovementAvatarLowerBodyRetargetDecisionApplication {
  return {
    appliedDecision,
    feetOwner: appliedDecision.feetOwner,
    lowerBodyOwner: appliedDecision.lowerBodyOwner,
    retargetApplicationPlan: resolveMovementAvatarLowerBodyRetargetApplicationPlan({
      appliedDecision,
      avatarRole,
      balancedPlantedSquatDepth,
      instructorSquatPresentationDepth,
      lowerBodyDrive,
      playerSquatPresentationDepth,
      retargetAppliedLowerBody,
      stageDecision,
    }),
  };
}

export function resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput({
  appliedFootSegments,
  appliedLegSegments,
  appliedLowerBodySegments,
  avatarRole,
  balancedPlantedSquatDepth,
  instructorSquatPresentationDepth,
  lowerBodyDrive,
  lowerBodySegmentMotion,
  lowerBodyTrackingReady,
  playerRetargetLowerBodyMotion,
  playerSquatPresentationDepth,
  retargetFrame,
  shouldApplyLowerBody,
  shouldHoldPlayerSquatPose,
  stageDecision,
}: MovementAvatarLowerBodyRetargetDecisionApplicationInput): MovementAvatarLowerBodyRetargetDecisionApplication {
  const appliedDecision = resolveMovementAvatarAppliedLowerBodyDecision({
    appliedFootSegments,
    appliedLegSegments,
    appliedLowerBodySegments,
    avatarRole,
    balancedPlantedSquatDepth,
    instructorSquatPresentationDepth,
    lowerBodyDrive,
    lowerBodySegmentMotion,
    lowerBodyTrackingReady,
    playerRetargetLowerBodyMotion,
    retargetFrame,
    shouldApplyLowerBody,
    shouldHoldPlayerSquatPose,
  });

  return resolveMovementAvatarLowerBodyRetargetDecisionApplication({
    appliedDecision,
    avatarRole,
    balancedPlantedSquatDepth,
    instructorSquatPresentationDepth,
    lowerBodyDrive,
    playerSquatPresentationDepth,
    retargetAppliedLowerBody: appliedLowerBodySegments,
    stageDecision,
  });
}
