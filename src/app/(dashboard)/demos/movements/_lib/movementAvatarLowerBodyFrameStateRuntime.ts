import type {
  MovementAvatarLowerBodyVisualState,
  MovementAvatarPipelineDecision,
  MovementAvatarPlayerLegRaiseHoldState,
} from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import {
  resolveMovementAvatarLowerBodyRuntimeState,
  type MovementAvatarLowerBodyRuntimeStateDecision,
} from "./movementAvatarRuntimeState";
import {
  resolveMovementAvatarLowerBodyTarget,
  type MovementAvatarLowerBodyTargetDecision,
} from "./movementAvatarTarget";
import {
  getBalancedPlantedSquatDepth,
  getRecordedSquatPresentationDepth,
} from "./movementRetargeting";

export type MovementAvatarLowerBodyFrameStateRuntime = {
  balancedPlantedSquatDepth: number;
  instructorSquatPresentationDepth: number;
  liveSquatDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyRuntimeStateDecision: MovementAvatarLowerBodyRuntimeStateDecision;
  lowerBodyTarget: MovementAvatarLowerBodyTargetDecision;
  playerRetargetLowerBodyMotion: number;
  playerSquatPresentationDepth: number;
  recordedSquatPresentationDepth: number;
  shouldApplyLowerBody: boolean;
  shouldApplySolverTorso: boolean;
  shouldHoldPlayerSquatPose: boolean;
  visualRootDrop: number;
};

export function resolveMovementAvatarLowerBodyFrameStateRuntime({
  avatarDecision,
  avatarRole,
  instructorLowerBodyVisualState,
  now,
  playerLegRaiseHoldState,
  playerLowerBodyVisualState,
}: {
  avatarDecision: MovementAvatarPipelineDecision;
  avatarRole: "instructor" | "player";
  instructorLowerBodyVisualState: MovementAvatarLowerBodyVisualState;
  now: number;
  playerLegRaiseHoldState: MovementAvatarPlayerLegRaiseHoldState;
  playerLowerBodyVisualState: MovementAvatarLowerBodyVisualState;
}): MovementAvatarLowerBodyFrameStateRuntime {
  const recordedSquatPresentationDepth = getRecordedSquatPresentationDepth(avatarDecision.retargetFrame);
  const lowerBodyRuntimeStateDecision = resolveMovementAvatarLowerBodyRuntimeState({
    avatarRole,
    instructorLowerBodyVisualState,
    lowerBodyDrive: avatarDecision.lowerBodyDrive,
    now,
    playerLegRaiseHoldState,
    playerLowerBodyVisualState,
    recordedSquatPresentationDepth,
  });
  const lowerBodyDrive = lowerBodyRuntimeStateDecision.lowerBodyDrive;
  const lowerBodyVisualDecision = lowerBodyRuntimeStateDecision.lowerBodyVisualDecision;
  const lowerBodyTarget = resolveMovementAvatarLowerBodyTarget({
    avatarRole,
    decision: avatarDecision,
    lowerBodyVisualState: lowerBodyVisualDecision.state,
  });

  return {
    balancedPlantedSquatDepth: getBalancedPlantedSquatDepth(avatarDecision.retargetFrame),
    instructorSquatPresentationDepth: lowerBodyVisualDecision.instructorSquatPresentationDepth,
    liveSquatDepth: lowerBodyDrive.liveSquatDepth,
    lowerBodyDrive,
    lowerBodyRuntimeStateDecision,
    lowerBodyTarget,
    playerRetargetLowerBodyMotion: lowerBodyTarget.playerSourceOwner.playerRetargetLowerBodyMotion,
    playerSquatPresentationDepth: lowerBodyVisualDecision.playerSquatPresentationDepth,
    recordedSquatPresentationDepth,
    shouldApplyLowerBody: lowerBodyDrive.shouldApplyLowerBody,
    shouldApplySolverTorso: lowerBodyDrive.shouldApplySolverTorso,
    shouldHoldPlayerSquatPose: lowerBodyTarget.shouldHoldPlayerSquatPose,
    visualRootDrop: lowerBodyVisualDecision.visualRootDrop,
  };
}
