import {
  resolveMovementAvatarInactiveLowerBodyDecision,
  resolveMovementAvatarLowerBodyApplicationStage,
  resolveMovementAvatarPlayerSourceOwnerDecision,
  type MovementAvatarInactiveLowerBodyDecision,
  type MovementAvatarLowerBodyApplicationStageDecision,
  type MovementAvatarLowerBodyVisualState,
  type MovementAvatarPipelineDecision,
  type MovementAvatarPlayerSourceOwnerDecision,
} from "./movementAvatarPipeline";
import { getRecordedSquatPresentationDepth } from "./movementRetargeting";

export type MovementAvatarLowerBodyTargetDecision = {
  feetOwner: string;
  inactiveDecision: MovementAvatarInactiveLowerBodyDecision | null;
  instructorLowerBodyMotion: number;
  lowerBodyOwner: string;
  playerSourceOwner: MovementAvatarPlayerSourceOwnerDecision;
  playerSquatPresentationDepth: number;
  recordedSquatPresentationDepth: number;
  shouldHoldPlayerSquatPose: boolean;
  stageDecision: MovementAvatarLowerBodyApplicationStageDecision | null;
};

export function resolveMovementAvatarLowerBodyTarget({
  avatarRole,
  decision,
  lowerBodyVisualState,
}: {
  avatarRole: "instructor" | "player";
  decision: MovementAvatarPipelineDecision;
  lowerBodyVisualState: MovementAvatarLowerBodyVisualState;
}): MovementAvatarLowerBodyTargetDecision {
  const isPlayer = avatarRole === "player";
  const playerSquatPresentationDepth = lowerBodyVisualState.squatPresentationDepth;
  const recordedSquatPresentationDepth = getRecordedSquatPresentationDepth(decision.retargetFrame);
  const instructorLowerBodyMotion = Math.max(
    recordedSquatPresentationDepth,
    decision.lowerBodySegmentMotion,
    decision.retargetFrame.kneeLift.left,
    decision.retargetFrame.kneeLift.right,
  );
  const shouldHoldPlayerSquatPose =
    isPlayer &&
    decision.shouldApplyLowerBody &&
    decision.lowerBodyDrive.liveSquatDepth > 0.12 &&
    playerSquatPresentationDepth > 0.18;
  const hasCompleteLegRetarget =
    decision.retargetApplicableLegs >= 4 &&
    decision.retargetFrame.debug.sourceQuality >= 0.45;
  const hasUsablePartialLegRetarget =
    decision.retargetApplicableThighs >= 2 &&
    decision.retargetFrame.debug.sourceQuality >= 0.45 &&
    (
      lowerBodyVisualState.hasEstablishedLegRetarget === true ||
      (
        // Three available leg segments (both thighs plus one child) are
        // sufficient to acquire meaningful moving source motion without
        // treating a two-thigh startup estimate as a complete leg solve.
        decision.retargetApplicableLegs >= 3 &&
        instructorLowerBodyMotion >= 0.18
      )
    );
  const playerSourceOwner = resolveMovementAvatarPlayerSourceOwnerDecision({
    avatarRole,
    decision,
    playerSquatPresentationDepth,
    shouldHoldPlayerSquatPose,
  });

  if (
    (
      decision.lowerBodyTrackingReady ||
      shouldHoldPlayerSquatPose ||
      hasCompleteLegRetarget ||
      hasUsablePartialLegRetarget
    ) &&
    decision.shouldApplyLowerBody
  ) {
    const stageDecision = resolveMovementAvatarLowerBodyApplicationStage({
      avatarRole,
      canContinuePartialLegRetarget: hasUsablePartialLegRetarget,
      hasCompleteLegRetarget,
      instructorLowerBodyMotion,
      lowerBodyDrive: decision.lowerBodyDrive,
      playerRetargetLowerBodyMotion: playerSourceOwner.playerRetargetLowerBodyMotion,
      sourceOwnerDecision: playerSourceOwner.lowerBodyOwnerDecision,
      shouldHoldPlayerSquatPose,
    });

    if (stageDecision.stage !== "retarget") {
      return {
        feetOwner: stageDecision.feetOwner,
        inactiveDecision: null,
        instructorLowerBodyMotion,
        lowerBodyOwner: stageDecision.lowerBodyOwner,
        playerSourceOwner,
        playerSquatPresentationDepth,
        recordedSquatPresentationDepth,
        shouldHoldPlayerSquatPose,
        stageDecision,
      };
    }

    return {
      feetOwner: decision.feetOwner,
      inactiveDecision: null,
      instructorLowerBodyMotion,
      lowerBodyOwner: decision.lowerOwner,
      playerSourceOwner,
      playerSquatPresentationDepth,
      recordedSquatPresentationDepth,
      shouldHoldPlayerSquatPose,
      stageDecision,
    };
  }

  const inactiveDecision = resolveMovementAvatarInactiveLowerBodyDecision({
    avatarRole,
    lowerBodySourceReliable: decision.lowerBodySourceReliable,
  });

  return {
    feetOwner: inactiveDecision.feetOwner ?? decision.feetOwner,
    inactiveDecision,
    instructorLowerBodyMotion,
    lowerBodyOwner: inactiveDecision.lowerBodyOwner ?? decision.lowerOwner,
    playerSourceOwner,
    playerSquatPresentationDepth,
    recordedSquatPresentationDepth,
    shouldHoldPlayerSquatPose,
    stageDecision: null,
  };
}
