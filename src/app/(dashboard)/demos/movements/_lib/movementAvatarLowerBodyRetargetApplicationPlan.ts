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
  shouldApplyLegacyAim: boolean;
  solvedLowerBodyDepth: number | null;
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
  const solvedLowerBodyDepth = appliedDecision.shouldUseLegacyLowerBody
    ? isPlayer ? lowerBodyDrive.liveSquatDepth : instructorSquatPresentationDepth
    : null;
  const plantedSquatIkDepth = isPlayer
    ? playerSquatPresentationDepth
    : appliedDecision.shouldUseLegacyLowerBody && balancedPlantedSquatDepth > 0
      ? instructorSquatPresentationDepth
      : 0;
  const squatFlexionDepth =
    appliedDecision.shouldUseLegacyLowerBody || appliedDecision.shouldUseRecordedSquatPresentation
      ? playerSquatPresentationDepth
      : null;
  const legRaiseOverlay = stageDecision.anchoredPlayerLegRaiseSide
    ? {
        depth: lowerBodyDrive.playerLegRaiseDepth,
        side: stageDecision.anchoredPlayerLegRaiseSide,
      }
    : null;
  const plantInstructorFeet: Array<"left" | "right"> = [];
  if (!isPlayer) {
    plantInstructorFeet.push("right", "left");
  }

  return {
    legRaiseOverlay,
    plantedSquatIkDepth,
    plantInstructorFeet,
    shouldApplyLegacyAim: retargetAppliedLowerBody < 4 || appliedDecision.shouldUsePlayerFootFallback,
    solvedLowerBodyDepth,
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
