import type { MovementAvatarLowerBodyDrive, MovementAvatarPlayerLowerBodyOwnerDecision } from "./movementAvatarLowerBody";
import type { MovementAvatarInactiveLowerBodyDecision, MovementAvatarLowerBodyApplicationStageDecision } from "./movementAvatarPipeline";

export function resolveMovementAvatarInactiveLowerBodyDecision({
  avatarRole,
  lowerBodySourceReliable,
}: {
  avatarRole: "instructor" | "player";
  lowerBodySourceReliable: boolean;
}): MovementAvatarInactiveLowerBodyDecision {
  if (avatarRole === "instructor" && !lowerBodySourceReliable) {
    return {
      feetOwner: "recorded-source-limited",
      lowerBodyOwner: "recorded-source-limited",
    };
  }

  return {
    feetOwner: null,
    lowerBodyOwner: null,
  };
}

export function resolveMovementAvatarLowerBodyApplicationStage({
  avatarRole,
  hasCompleteLegRetarget = false,
  instructorLowerBodyMotion,
  lowerBodyDrive,
  playerRetargetLowerBodyMotion,
  sourceOwnerDecision,
  shouldHoldPlayerSquatPose,
}: {
  avatarRole: "instructor" | "player";
  hasCompleteLegRetarget?: boolean;
  instructorLowerBodyMotion: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerRetargetLowerBodyMotion: number;
  sourceOwnerDecision: MovementAvatarPlayerLowerBodyOwnerDecision | null;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarLowerBodyApplicationStageDecision {
  const isPlayer = avatarRole === "player";
  const playerLegRaiseOwner =
    isPlayer &&
    lowerBodyDrive.shouldDrivePlayerLegRaise &&
    lowerBodyDrive.playerLegRaiseSide
      ? `player-${lowerBodyDrive.playerLegRaiseSide}-leg-raise`
      : null;
  const anchoredPlayerLegRaiseSide =
    isPlayer &&
    lowerBodyDrive.shouldDrivePlayerLegRaise &&
    lowerBodyDrive.playerLegRaiseSide
      ? lowerBodyDrive.playerLegRaiseSide
      : null;
  const canUsePlayerRetargetLegRaise =
    sourceOwnerDecision?.canUsePlayerRetargetLegRaise ?? false;

  if (anchoredPlayerLegRaiseSide) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: sourceOwnerDecision?.feetOwner ?? "neutral",
      lowerBodyOwner: playerLegRaiseOwner ?? sourceOwnerDecision?.lowerBodyOwner ?? "player-leg-raise",
      stage: "player-leg-raise",
    };
  }

  if (isPlayer && (lowerBodyDrive.shouldDrivePlayerSquat || shouldHoldPlayerSquatPose)) {
    if (sourceOwnerDecision?.hasCompleteLegRetarget) {
      return {
        anchoredPlayerLegRaiseSide,
        canUsePlayerRetargetLegRaise,
        feetOwner: sourceOwnerDecision.feetOwner,
        lowerBodyOwner: sourceOwnerDecision.lowerBodyOwner,
        stage: "retarget",
      };
    }

    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: sourceOwnerDecision?.feetOwner ?? "recorded-retarget",
      lowerBodyOwner: sourceOwnerDecision?.lowerBodyOwner ?? (lowerBodyDrive.shouldDrivePlayerSquat
        ? "player-stable-squat"
        : "player-stable-squat-held"),
      stage: "player-squat",
    };
  }

  // Complete leg directions remain the owner even when their
  // frame-to-frame motion is small. Easing the rig to neutral by label and
  // switching back at a motion threshold creates the observed bilateral leg
  // snap despite a continuous source. This continuity rule applies equally to
  // instructor identity and player mirror paths.
  if (isPlayer && sourceOwnerDecision?.hasCompleteLegRetarget) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: sourceOwnerDecision.feetOwner,
      lowerBodyOwner: sourceOwnerDecision.lowerBodyOwner,
      stage: "retarget",
    };
  }

  if (!isPlayer && hasCompleteLegRetarget) {
    return {
      anchoredPlayerLegRaiseSide: null,
      canUsePlayerRetargetLegRaise: false,
      feetOwner: "recorded-retarget",
      lowerBodyOwner: "recorded-retarget",
      stage: "retarget",
    };
  }

  const shouldKeepNeutralPlayerLowerBody =
    isPlayer &&
    lowerBodyDrive.playerLowerBodyState === "neutral" &&
    playerRetargetLowerBodyMotion < 0.12 &&
    !sourceOwnerDecision?.shouldUsePlayerFootFallback;

  if (isPlayer && (shouldKeepNeutralPlayerLowerBody || playerRetargetLowerBodyMotion < 0.08)) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: "neutral",
      lowerBodyOwner: "player-lower-body-neutral",
      stage: "player-neutral",
    };
  }

  if (!isPlayer && instructorLowerBodyMotion < 0.08) {
    return {
      anchoredPlayerLegRaiseSide: null,
      canUsePlayerRetargetLegRaise: false,
      feetOwner: "neutral",
      lowerBodyOwner: "recorded-neutral",
      stage: "recorded-neutral",
    };
  }

  return {
    anchoredPlayerLegRaiseSide,
    canUsePlayerRetargetLegRaise,
    feetOwner: "neutral",
    lowerBodyOwner: "neutral",
    stage: "retarget",
  };
}
