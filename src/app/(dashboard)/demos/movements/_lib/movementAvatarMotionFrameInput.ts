import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import type { MovementAvatarHeadTargetDecision } from "./movementAvatarHeadTarget";
import type { MovementMotionFrame } from "./movementMotionFrame";

export type MovementAvatarMotionFrameInputDecision = {
  decision: MovementAvatarPipelineDecision | null;
  headTarget?: MovementAvatarHeadTargetDecision;
  owner: "movement-motion-frame" | "presentation-standby" | "renderer-fallback";
  sourceOrigin?: MovementMotionFrame["source"]["sourceOrigin"];
};

export function shouldHoldMovementAvatarLastPose({
  isPlaying,
  motionFrame,
}: {
  isPlaying: boolean;
  motionFrame?: MovementMotionFrame | null;
}) {
  return isPlaying && !motionFrame;
}

export function resolveMovementAvatarMotionFrameInput({
  fallbackDecision,
  getFallbackDecision,
  motionFrame,
  requiresMotionFrame = false,
}: {
  fallbackDecision?: MovementAvatarPipelineDecision;
  getFallbackDecision?: () => MovementAvatarPipelineDecision;
  motionFrame?: MovementMotionFrame | null;
  requiresMotionFrame?: boolean;
}): MovementAvatarMotionFrameInputDecision {
  if (motionFrame) {
    return {
      decision: motionFrame.avatarDisplayDecision,
      headTarget: motionFrame.avatarDisplayHeadTarget,
      owner: "movement-motion-frame",
      sourceOrigin: motionFrame.source?.sourceOrigin,
    };
  }

  if (requiresMotionFrame) {
    return {
      decision: null,
      owner: "presentation-standby",
    };
  }

  const resolvedFallbackDecision = fallbackDecision ?? getFallbackDecision?.();
  if (!resolvedFallbackDecision) {
    throw new Error("Movement avatar fallback decision is required when motion frame is absent.");
  }

  return {
    decision: resolvedFallbackDecision,
    owner: "renderer-fallback",
  };
}
