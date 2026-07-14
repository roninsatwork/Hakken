import type { MovementAvatarPlayerLowerBodyOwnerDecision } from "./movementAvatarLowerBody";
import type { MovementAvatarLowerBodyApplicationStageDecision } from "./movementAvatarPipeline";

export function resolveMovementAvatarLowerBodyRetargetStage({
  anchoredPlayerLegRaiseSide,
  avatarRole,
  canContinuePartialLegRetarget,
  canUsePlayerRetargetLegRaise,
  hasCompleteLegRetarget,
  sourceOwnerDecision,
}: {
  anchoredPlayerLegRaiseSide: "left" | "right" | null;
  avatarRole: "instructor" | "player";
  canContinuePartialLegRetarget: boolean;
  canUsePlayerRetargetLegRaise: boolean;
  hasCompleteLegRetarget: boolean;
  sourceOwnerDecision: MovementAvatarPlayerLowerBodyOwnerDecision | null;
}): MovementAvatarLowerBodyApplicationStageDecision | null {
  const isPlayer = avatarRole === "player";

  // Once either rendered role has established a usable partial solve, the
  // remaining recorded directions outrank pose labels and neutral fallbacks.
  // This keeps the two avatars on the same anatomical movement through a
  // brief visibility dip.
  if (canContinuePartialLegRetarget) {
    return {
      anchoredPlayerLegRaiseSide: isPlayer ? anchoredPlayerLegRaiseSide : null,
      canUsePlayerRetargetLegRaise: isPlayer && canUsePlayerRetargetLegRaise,
      feetOwner: isPlayer
        ? sourceOwnerDecision?.feetOwner ?? "neutral"
        : "recorded-retarget",
      lowerBodyOwner: isPlayer
        ? sourceOwnerDecision?.hasCompleteLegRetarget
          ? sourceOwnerDecision.lowerBodyOwner
          : "retarget-partial-fallback"
        : "retarget-partial-fallback",
      stage: "retarget",
    };
  }

  // Complete directions remain authoritative even when frame-to-frame motion
  // is small. Easing to neutral at a motion threshold caused the observed
  // bilateral snap in otherwise continuous source motion.
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

  return null;
}
