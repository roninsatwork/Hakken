import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import type { MovementMotionFrame } from "./movementMotionFrame";

export type MovementAvatarMotionFrameInputDecision = {
  decision: MovementAvatarPipelineDecision;
  owner: "movement-motion-frame" | "renderer-fallback";
};

export function resolveMovementAvatarMotionFrameInput({
  fallbackDecision,
  motionFrame,
}: {
  fallbackDecision: MovementAvatarPipelineDecision;
  motionFrame?: MovementMotionFrame | null;
}): MovementAvatarMotionFrameInputDecision {
  if (motionFrame) {
    return {
      decision: motionFrame.avatarDecision,
      owner: "movement-motion-frame",
    };
  }

  return {
    decision: fallbackDecision,
    owner: "renderer-fallback",
  };
}
