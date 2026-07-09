import type {
  MovementAvatarLowerBodyApplicationPlan,
  MovementAvatarLowerBodyRetargetApplicationPlan,
} from "./movementAvatarLowerBodyApplicationPlan";
import type {
  MovementAvatarInstructorFootPlantSide,
  MovementAvatarLowerBodyNonRetargetApplicationResult,
  MovementAvatarLowerBodyRetargetPostPlanApplicationResult,
  MovementAvatarLowerBodySquatPoseApplicationResult,
} from "./movementAvatarLowerBodyApplicationTypes";

export function applyMovementAvatarLowerBodySquatPoseApplication({
  applyPlantedSquatIk,
  applySquatFlexion,
  depth,
}: {
  applyPlantedSquatIk: (depth: number) => number;
  applySquatFlexion: (depth: number) => void;
  depth: number;
}): MovementAvatarLowerBodySquatPoseApplicationResult {
  const plantedSquatIkDepth = applyPlantedSquatIk(depth);
  applySquatFlexion(depth);

  return {
    appliedSquatFlexion: true,
    plantedSquatIkDepth,
  };
}

export function applyMovementAvatarLowerBodyNonRetargetApplicationPlan({
  applyLegRaise,
  applyNeutral,
  applySquat,
  plan,
  plantInstructorFeet,
}: {
  applyLegRaise: (side: "left" | "right", depth: number) => void;
  applyNeutral: () => void;
  applySquat: (depth: number) => number;
  plan: MovementAvatarLowerBodyApplicationPlan;
  plantInstructorFeet: (sides: MovementAvatarInstructorFootPlantSide[]) => void;
}): MovementAvatarLowerBodyNonRetargetApplicationResult {
  if (plan.mode === "retarget") {
    return {
      feetOwner: null,
      handled: false,
      lowerBodyOwner: null,
      plantedSquatIkDepth: null,
    };
  }

  let plantedSquatIkDepth: number | null = null;

  if (plan.mode === "inactive-neutral" || plan.mode === "player-neutral") {
    applyNeutral();
  } else if (plan.mode === "player-leg-raise") {
    applyLegRaise(plan.side, plan.depth);
  } else if (plan.mode === "player-squat") {
    plantedSquatIkDepth = applySquat(plan.depth);
    if (plan.shouldEaseLowerBodyToNeutral) {
      applyNeutral();
    }
  } else if (plan.mode === "recorded-neutral") {
    applyNeutral();
    plantInstructorFeet(plan.plantInstructorFeet);
  }

  return {
    feetOwner: plan.feetOwner,
    handled: true,
    lowerBodyOwner: plan.lowerBodyOwner,
    plantedSquatIkDepth,
  };
}

export function applyMovementAvatarLowerBodyRetargetPostPlanApplication({
  applyLegRaise,
  applyPlantedSquatIk,
  applySquatFlexion,
  plan,
  plantInstructorFeet,
}: {
  applyLegRaise: (side: "left" | "right", depth: number) => void;
  applyPlantedSquatIk: (depth: number) => number;
  applySquatFlexion: (depth: number) => void;
  plan: MovementAvatarLowerBodyRetargetApplicationPlan;
  plantInstructorFeet: (sides: MovementAvatarInstructorFootPlantSide[]) => void;
}): MovementAvatarLowerBodyRetargetPostPlanApplicationResult {
  let appliedSolvedLowerBody = false;
  let appliedSquatFlexion = false;
  let appliedLegRaiseOverlay = false;


  const plantedSquatIkDepth = applyPlantedSquatIk(plan.plantedSquatIkDepth);

  if (plan.squatFlexionDepth !== null) {
    applySquatFlexion(plan.squatFlexionDepth);
    appliedSquatFlexion = true;
  }

  if (plan.legRaiseOverlay) {
    applyLegRaise(plan.legRaiseOverlay.side, plan.legRaiseOverlay.depth);
    appliedLegRaiseOverlay = true;
  }

  plantInstructorFeet(plan.plantInstructorFeet);

  return {
    appliedLegRaiseOverlay,
    appliedSolvedLowerBody,
    appliedSquatFlexion,
    plantedSquatIkDepth,
  };
}
