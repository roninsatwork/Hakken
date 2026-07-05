import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import type { MovementMotionFrame } from "./movementMotionFrame";

export type MovementAvatarMotionFrameInputDecision = {
  decision: MovementAvatarPipelineDecision | null;
  owner: "movement-motion-frame" | "presentation-standby" | "renderer-fallback";
};

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
      owner: "movement-motion-frame",
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
