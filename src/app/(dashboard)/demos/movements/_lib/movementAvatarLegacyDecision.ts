import {
  resolveMovementAvatarPipelineDecision,
  type MovementAvatarPipelineDecision,
  type MovementAvatarSourceWrapperInput,
} from "./movementAvatarPipeline";

/**
 * Compatibility wrappers for old Replay/Game parity harnesses.
 * New runtime paths should build a MovementSourceFrame and call resolveMovementMotionFrame.
 */
export function resolveMovementAvatarReplayDecision(
  input: MovementAvatarSourceWrapperInput,
): MovementAvatarPipelineDecision {
  return resolveMovementAvatarPipelineDecision({
    ...input,
    sourceOrigin: "replay",
  });
}

/**
 * Compatibility wrappers for old Replay/Game parity harnesses.
 * New runtime paths should build a MovementSourceFrame and call resolveMovementMotionFrame.
 */
export function resolveMovementAvatarStudioDecision(
  input: MovementAvatarSourceWrapperInput,
): MovementAvatarPipelineDecision {
  return resolveMovementAvatarPipelineDecision({
    ...input,
    sourceOrigin: "studio",
  });
}
