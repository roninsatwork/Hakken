import type {
  MovementAvatarAppliedLowerBodyDecision,
  MovementAvatarLowerBodyApplicationStageDecision,
} from "./movementAvatarPipeline";
import { resolveMovementAvatarAppliedLowerBodyDecision } from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import {
  countMovementApplicableRetargetSegments,
  THIGH_SEGMENTS,
} from "./movementAvatarRetargetDebugDecision";
import type { MovementRetargetFrame } from "./movementRetargeting";

export type MovementAvatarLowerBodyRetargetApplicationPlan = {
  legRaiseOverlay: {
    depth: number;
    side: "left" | "right";
  } | null;
  plantedSquatIkDepth: number;
  plantInstructorFeet: Array<"left" | "right">;
  squatFlexionDepth: number | null;
  squatFlexionSlerp: number;
};

const SHARED_RETARGET_SQUAT_FLEXION_SLERP = 0.62;

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
  hasBilateralApplicableThighs?: boolean;
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
  balancedPlantedSquatDepth,
  hasBilateralApplicableThighs = false,
  instructorSquatPresentationDepth,
  lowerBodyDrive,
  retargetContacts,
  retargetAppliedLowerBody,
  stageDecision,
}: {
  appliedDecision: MovementAvatarAppliedLowerBodyDecision;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  hasBilateralApplicableThighs?: boolean;
  instructorSquatPresentationDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerSquatPresentationDepth: number;
  retargetContacts?: MovementRetargetFrame["contacts"];
  retargetAppliedLowerBody: number;
  stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
}): MovementAvatarLowerBodyRetargetApplicationPlan {
  // Once a frame has entered the shared retarget path, fallback ownership must
  // remain with the recorded source. Player-only squat classification and
  // smoothing used to add planted IK on one avatar while the matching
  // instructor frame had none, leaving two rendered results from one source.
  const plantedSquatIkDepth =
    !appliedDecision.hasCompleteLegRetarget &&
    !hasBilateralApplicableThighs &&
    balancedPlantedSquatDepth > 0
      ? instructorSquatPresentationDepth
      : 0;
  // A complete four-segment leg solve already contains the visible squat.
  // Adding the canned flexion pose afterwards makes the instructor diverge
  // from the player mirror even though both received the same source skeleton.
  // Keep the fallback only for incomplete leg solves.
  // If both recorded thigh directions are applicable, keep them as the
  // visible source of truth. A bilateral canned squat applied after retarget
  // overwrites those moving targets and can make the avatar visibly static
  // even while the instructor thighs continue to move. The canned fallback is
  // only for frames that cannot provide both thigh directions.
  const squatFlexionDepth =
    !appliedDecision.hasCompleteLegRetarget && !hasBilateralApplicableThighs
    ? instructorSquatPresentationDepth
    : null;
  const legRaiseOverlay = stageDecision.anchoredPlayerLegRaiseSide && retargetAppliedLowerBody < 4
    ? {
        depth: lowerBodyDrive.playerLegRaiseDepth,
        side: stageDecision.anchoredPlayerLegRaiseSide,
      }
    : null;
  // A solved foot direction describes the source ankle-to-toe axis, but it
  // does not by itself enforce the rendered sole/floor boundary. When the
  // recorded source says a side is planted, finish both roles on the same
  // exact neutral foot/toe target after retargeting.
  const plantInstructorFeet: Array<"left" | "right"> = [
    ...(retargetContacts?.leftFoot ? ["left" as const] : []),
    ...(retargetContacts?.rightFoot ? ["right" as const] : []),
  ];

  return {
    legRaiseOverlay,
    plantedSquatIkDepth,
    plantInstructorFeet,
    squatFlexionDepth,
    squatFlexionSlerp: SHARED_RETARGET_SQUAT_FLEXION_SLERP,
  };
}

export function resolveMovementAvatarLowerBodyRetargetDecisionApplication({
  appliedDecision,
  avatarRole,
  balancedPlantedSquatDepth,
  hasBilateralApplicableThighs = false,
  instructorSquatPresentationDepth,
  lowerBodyDrive,
  retargetContacts,
  playerSquatPresentationDepth,
  retargetAppliedLowerBody,
  stageDecision,
}: {
  appliedDecision: MovementAvatarAppliedLowerBodyDecision;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  hasBilateralApplicableThighs?: boolean;
  instructorSquatPresentationDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerSquatPresentationDepth: number;
  retargetContacts?: MovementRetargetFrame["contacts"];
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
      hasBilateralApplicableThighs,
      instructorSquatPresentationDepth,
      lowerBodyDrive,
      retargetContacts,
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
    hasBilateralApplicableThighs:
      countMovementApplicableRetargetSegments(retargetFrame, THIGH_SEGMENTS, "leg") >= 2,
    instructorSquatPresentationDepth,
    lowerBodyDrive,
    playerSquatPresentationDepth,
    retargetContacts: retargetFrame.contacts,
    retargetAppliedLowerBody: appliedLowerBodySegments,
    stageDecision,
  });
}
