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

function isStationaryFeetFloorSideBend(decision: MovementAvatarPipelineDecision) {
  const strongestKneeLift = Math.max(
    decision.retargetFrame.kneeLift.left,
    decision.retargetFrame.kneeLift.right,
  );

  return (
    decision.supportIntent.key === "feet-floor" &&
    Math.abs(decision.spineDrive.sideBend) >= 0.12 &&
    !decision.lowerBodyDrive.shouldDrivePlayerSquat &&
    !decision.lowerBodyDrive.shouldDrivePlayerLegRaise &&
    decision.retargetFrame.squatDepth < 0.12 &&
    strongestKneeLift < 0.18
  );
}

function buildNeutralPlayerSideBendSourceOwner(
  playerSourceOwner: MovementAvatarPlayerSourceOwnerDecision,
): MovementAvatarPlayerSourceOwnerDecision {
  return {
    ...playerSourceOwner,
    lowerBodyOwnerDecision: {
      canUsePlayerRetargetLegRaise: false,
      feetOwner: "neutral",
      lowerBodyOwner: "player-lower-body-neutral",
      shouldUsePlayerFootFallback: false,
    },
    playerRetargetLowerBodyMotion: 0,
  };
}

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
  const playerSourceOwner = resolveMovementAvatarPlayerSourceOwnerDecision({
    avatarRole,
    decision,
    playerSquatPresentationDepth,
    shouldHoldPlayerSquatPose,
  });

  if (isPlayer && isStationaryFeetFloorSideBend(decision)) {
    const stageDecision: MovementAvatarLowerBodyApplicationStageDecision = {
      anchoredPlayerLegRaiseSide: null,
      canUsePlayerRetargetLegRaise: false,
      feetOwner: "neutral",
      lowerBodyOwner: "player-lower-body-neutral",
      stage: "player-neutral",
    };

    return {
      feetOwner: stageDecision.feetOwner,
      inactiveDecision: null,
      instructorLowerBodyMotion,
      lowerBodyOwner: stageDecision.lowerBodyOwner,
      playerSourceOwner: buildNeutralPlayerSideBendSourceOwner(playerSourceOwner),
      playerSquatPresentationDepth: 0,
      recordedSquatPresentationDepth,
      shouldHoldPlayerSquatPose: false,
      stageDecision,
    };
  }

  if ((decision.lowerBodyTrackingReady || shouldHoldPlayerSquatPose) && decision.shouldApplyLowerBody) {
    const stageDecision = resolveMovementAvatarLowerBodyApplicationStage({
      avatarRole,
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
