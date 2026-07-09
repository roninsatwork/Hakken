import type { MovementAvatarLowerBodyApplicationStageDecision } from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarLowerBodyTargetDecision } from "./movementAvatarTarget";
export {
  applyMovementAvatarLowerBodyRetargetSegmentCounts,
  resolveMovementAvatarLowerBodyRetargetApplicationPlan,
  resolveMovementAvatarLowerBodyRetargetDecisionApplication,
  resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput,
} from "./movementAvatarLowerBodyRetargetApplicationPlan";
export type {
  MovementAvatarLowerBodyRetargetAppliedCounts,
  MovementAvatarLowerBodyRetargetApplicationPlan,
  MovementAvatarLowerBodyRetargetDecisionApplication,
  MovementAvatarLowerBodyRetargetDecisionApplicationInput,
  MovementAvatarLowerBodyRetargetSegmentCountApplicationResult,
  MovementAvatarLowerBodyRetargetSegmentCounts,
} from "./movementAvatarLowerBodyRetargetApplicationPlan";

export type MovementAvatarLowerBodyApplicationPlan =
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "inactive-neutral";
      shouldEaseLowerBodyToNeutral: true;
      stageDecision: null;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "player-neutral";
      shouldEaseLowerBodyToNeutral: true;
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "player-leg-raise";
      side: "left" | "right";
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
      depth: number;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "player-squat";
      shouldEaseLowerBodyToNeutral: boolean;
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
      depth: number;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "recorded-neutral";
      plantInstructorFeet: Array<"left" | "right">;
      shouldEaseLowerBodyToNeutral: true;
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "retarget";
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
    };

export function resolveMovementAvatarLowerBodyApplicationPlan({
  lowerBodyDrive,
  lowerBodyTarget,
}: {
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTarget: MovementAvatarLowerBodyTargetDecision;
}): MovementAvatarLowerBodyApplicationPlan {
  const stageDecision = lowerBodyTarget.stageDecision;

  if (!stageDecision) {
    return {
      feetOwner: lowerBodyTarget.feetOwner,
      lowerBodyOwner: lowerBodyTarget.lowerBodyOwner,
      mode: "inactive-neutral",
      shouldEaseLowerBodyToNeutral: true,
      stageDecision: null,
    };
  }

  if (stageDecision.stage === "player-leg-raise" && stageDecision.anchoredPlayerLegRaiseSide) {
    if (stageDecision.canUsePlayerRetargetLegRaise) {
      return {
        feetOwner: lowerBodyTarget.feetOwner,
        lowerBodyOwner: lowerBodyTarget.lowerBodyOwner,
        mode: "retarget",
        stageDecision,
      };
    }

    return {
      depth: lowerBodyDrive.playerLegRaiseDepth,
      feetOwner: stageDecision.feetOwner,
      lowerBodyOwner: stageDecision.lowerBodyOwner,
      mode: "player-leg-raise",
      side: stageDecision.anchoredPlayerLegRaiseSide,
      stageDecision,
    };
  }

  if (stageDecision.stage === "player-squat") {
    return {
      depth: lowerBodyTarget.playerSquatPresentationDepth,
      feetOwner: stageDecision.feetOwner,
      lowerBodyOwner: stageDecision.lowerBodyOwner,
      mode: "player-squat",
      shouldEaseLowerBodyToNeutral: lowerBodyTarget.playerSquatPresentationDepth <= 0.16,
      stageDecision,
    };
  }

  if (stageDecision.stage === "player-neutral") {
    return {
      feetOwner: stageDecision.feetOwner,
      lowerBodyOwner: stageDecision.lowerBodyOwner,
      mode: "player-neutral",
      shouldEaseLowerBodyToNeutral: true,
      stageDecision,
    };
  }

  if (stageDecision.stage === "recorded-neutral") {
    return {
      feetOwner: stageDecision.feetOwner,
      lowerBodyOwner: stageDecision.lowerBodyOwner,
      mode: "recorded-neutral",
      plantInstructorFeet: ["right", "left"],
      shouldEaseLowerBodyToNeutral: true,
      stageDecision,
    };
  }

  return {
    feetOwner: lowerBodyTarget.feetOwner,
    lowerBodyOwner: lowerBodyTarget.lowerBodyOwner,
    mode: "retarget",
    stageDecision,
  };
}
