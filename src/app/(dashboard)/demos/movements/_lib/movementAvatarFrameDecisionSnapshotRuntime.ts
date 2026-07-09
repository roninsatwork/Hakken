import type { MovementAvatarLowerBodyFrameStateRuntime } from "./movementAvatarLowerBodyFrameStateRuntime";
import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";

export type MovementAvatarFrameDecisionSnapshotRuntime = {
  activeSpineDrive: MovementAvatarPipelineDecision["spineDrive"];
  balancedPlantedSquatDepth: MovementAvatarLowerBodyFrameStateRuntime["balancedPlantedSquatDepth"];
  instructorSquatPresentationDepth: MovementAvatarLowerBodyFrameStateRuntime["instructorSquatPresentationDepth"];
  leftArmDecision: MovementAvatarPipelineDecision["leftArm"];
  liveSquatDepth: MovementAvatarLowerBodyFrameStateRuntime["liveSquatDepth"];
  lowerBodyDrive: MovementAvatarLowerBodyFrameStateRuntime["lowerBodyDrive"];
  lowerBodyTarget: MovementAvatarLowerBodyFrameStateRuntime["lowerBodyTarget"];
  lowerBodyTrackingReady: MovementAvatarPipelineDecision["lowerBodyTrackingReady"];
  playerRetargetLowerBodyMotion: MovementAvatarLowerBodyFrameStateRuntime["playerRetargetLowerBodyMotion"];
  playerSquatPresentationDepth: MovementAvatarLowerBodyFrameStateRuntime["playerSquatPresentationDepth"];
  recordedLowerBodySegmentMotion: MovementAvatarPipelineDecision["lowerBodySegmentMotion"];
  recordedLowerBodySourceReliable: MovementAvatarPipelineDecision["lowerBodySourceReliable"];
  retargetFrame: MovementAvatarPipelineDecision["retargetFrame"];
  rightArmDecision: MovementAvatarPipelineDecision["rightArm"];
  rootOrientation: MovementAvatarPipelineDecision["rootOrientation"];
  shouldApplyLowerBody: MovementAvatarLowerBodyFrameStateRuntime["shouldApplyLowerBody"];
  shouldApplySolverTorso: MovementAvatarLowerBodyFrameStateRuntime["shouldApplySolverTorso"];
  shouldHoldPlayerSquatPose: MovementAvatarLowerBodyFrameStateRuntime["shouldHoldPlayerSquatPose"];
  torsoTrackingReady: MovementAvatarPipelineDecision["torsoTrackingReady"];
  visualRootDrop: MovementAvatarLowerBodyFrameStateRuntime["visualRootDrop"];
};

export function resolveMovementAvatarFrameDecisionSnapshotRuntime({
  avatarDecision,
  lowerBodyFrameStateRuntime,
}: {
  avatarDecision: MovementAvatarPipelineDecision;
  lowerBodyFrameStateRuntime: MovementAvatarLowerBodyFrameStateRuntime;
}): MovementAvatarFrameDecisionSnapshotRuntime {
  return {
    activeSpineDrive: avatarDecision.spineDrive,
    balancedPlantedSquatDepth: lowerBodyFrameStateRuntime.balancedPlantedSquatDepth,
    instructorSquatPresentationDepth: lowerBodyFrameStateRuntime.instructorSquatPresentationDepth,
    leftArmDecision: avatarDecision.leftArm,
    liveSquatDepth: lowerBodyFrameStateRuntime.liveSquatDepth,
    lowerBodyDrive: lowerBodyFrameStateRuntime.lowerBodyDrive,
    lowerBodyTarget: lowerBodyFrameStateRuntime.lowerBodyTarget,
    lowerBodyTrackingReady: avatarDecision.lowerBodyTrackingReady,
    playerRetargetLowerBodyMotion: lowerBodyFrameStateRuntime.playerRetargetLowerBodyMotion,
    playerSquatPresentationDepth: lowerBodyFrameStateRuntime.playerSquatPresentationDepth,
    recordedLowerBodySegmentMotion: avatarDecision.lowerBodySegmentMotion,
    recordedLowerBodySourceReliable: avatarDecision.lowerBodySourceReliable,
    retargetFrame: avatarDecision.retargetFrame,
    rightArmDecision: avatarDecision.rightArm,
    rootOrientation: avatarDecision.rootOrientation,
    shouldApplyLowerBody: lowerBodyFrameStateRuntime.shouldApplyLowerBody,
    shouldApplySolverTorso: lowerBodyFrameStateRuntime.shouldApplySolverTorso,
    shouldHoldPlayerSquatPose: lowerBodyFrameStateRuntime.shouldHoldPlayerSquatPose,
    torsoTrackingReady: avatarDecision.torsoTrackingReady,
    visualRootDrop: lowerBodyFrameStateRuntime.visualRootDrop,
  };
}
