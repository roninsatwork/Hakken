import {
  resolveMovementAvatarPlayerLowerBodyOwners,
  type MovementAvatarLowerBodyDrive,
  type MovementAvatarPlayerLowerBodyOwnerDecision,
} from "./movementAvatarLowerBody";
import type {
  MovementAvatarAppliedLowerBodyDecision,
  MovementAvatarPipelineDecision,
  MovementAvatarPlayerSourceOwnerDecision,
} from "./movementAvatarPipeline";
import type { MovementRetargetFrame } from "./movementRetargeting";

export function resolveMovementAvatarPlayerSourceOwnerDecision({
  avatarRole,
  decision,
  playerSquatPresentationDepth,
  shouldHoldPlayerSquatPose,
}: {
  avatarRole: "instructor" | "player";
  decision: MovementAvatarPipelineDecision;
  playerSquatPresentationDepth: number;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarPlayerSourceOwnerDecision {
  const playerRetargetLowerBodyMotion = avatarRole === "player"
    ? Math.max(
        playerSquatPresentationDepth,
        decision.retargetFrame.squatDepth,
        decision.retargetFrame.kneeLift.left,
        decision.retargetFrame.kneeLift.right,
        decision.lowerBodySegmentMotion,
      )
    : decision.playerRetargetLowerBodyMotion;

  return {
    lowerBodyOwnerDecision: avatarRole === "player"
      ? resolveMovementAvatarPlayerLowerBodyOwners({
          lowerBodyDrive: decision.lowerBodyDrive,
          lowerBodySegmentMotion: decision.lowerBodySegmentMotion,
          lowerBodyTrackingReady: decision.lowerBodyTrackingReady,
          playerRetargetLowerBodyMotion,
          retargetSourceQuality: decision.retargetFrame.debug.sourceQuality,
          shouldApplyLowerBody: decision.shouldApplyLowerBody,
          shouldHoldPlayerSquatPose,
          solvedFootSegments: decision.retargetSolvedFeet,
          solvedLegSegments: decision.retargetSolvedLegs,
          solvedLowerBodySegments: decision.retargetSolvedLegs + decision.retargetSolvedFeet,
          totalSolvedSegments: decision.retargetFrame.debug.solvedSegments.length,
        })
      : null,
    playerRetargetLowerBodyMotion,
  };
}

export function resolveMovementAvatarAppliedLowerBodyDecision({
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
}: {
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
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarAppliedLowerBodyDecision {
  const isPlayer = avatarRole === "player";
  const retargetOwnsLowerBody =
    appliedLegSegments >= 4 &&
    retargetFrame.debug.sourceQuality >= 0.45;
  const shouldUseLegacyLowerBody = !retargetOwnsLowerBody;
  const shouldUseRecordedSquatPresentation =
    !isPlayer &&
    instructorSquatPresentationDepth > 0.18 &&
    balancedPlantedSquatDepth === 0;
  const playerAppliedOwnerDecision = isPlayer
    ? resolveMovementAvatarPlayerLowerBodyOwners({
        lowerBodyDrive,
        lowerBodySegmentMotion,
        lowerBodyTrackingReady,
        playerRetargetLowerBodyMotion,
        retargetSourceQuality: retargetFrame.debug.sourceQuality,
        shouldApplyLowerBody,
        shouldHoldPlayerSquatPose,
        solvedFootSegments: appliedFootSegments,
        solvedLegSegments: appliedLegSegments,
        solvedLowerBodySegments: appliedLowerBodySegments,
        totalSolvedSegments: retargetFrame.debug.solvedSegments.length,
      })
    : null;
  const shouldUsePlayerFootFallback =
    playerAppliedOwnerDecision?.shouldUsePlayerFootFallback ?? false;
  const lowerBodyOwner = playerAppliedOwnerDecision?.lowerBodyOwner ?? (retargetOwnsLowerBody
    ? "recorded-retarget"
    : appliedLowerBodySegments > 0
      ? "retarget-legacy-fallback"
      : "legacy-fallback");
  const feetOwner = shouldUsePlayerFootFallback
    ? "player-legacy-foot-fallback"
    : playerAppliedOwnerDecision?.feetOwner ?? (appliedFootSegments > 0 ? "recorded-retarget" : "neutral");

  return {
    feetOwner,
    lowerBodyOwner,
    playerAppliedOwnerDecision,
    retargetOwnsLowerBody,
    shouldUseLegacyLowerBody,
    shouldUsePlayerFootFallback,
    shouldUseRecordedSquatPresentation,
  };
}

export function resolveMovementAvatarPlantedFootOwner(currentOwner: string) {
  if (currentOwner.includes("planted-flat")) return currentOwner;
  if (currentOwner === "neutral") return "planted-flat";
  return `${currentOwner}+planted-flat`;
}

export type { MovementAvatarPlayerLowerBodyOwnerDecision };
