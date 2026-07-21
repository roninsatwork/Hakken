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

/**
 * Whether the avatar must wait because the current display landmark ref does
 * not match the motion frame it would apply. This protects RECORDED playback
 * and Replay/Game proof (scrubbing/seeking) from applying a frame built for a
 * different source frame.
 *
 * It deliberately does NOT gate the live webcam stream: there the motion frame
 * is always built one render tick behind the newest landmark, so a strict
 * timestamp/frameId match would reject nearly every frame on normal render
 * timing and freeze the avatar. Live always applies the latest motion frame.
 */
export function shouldWaitForMovementAvatarSourceSync({
  motionFrame,
  motionRefCapturedAt,
  motionRefFrameId,
}: {
  motionFrame?: MovementMotionFrame | null;
  motionRefCapturedAt?: number;
  motionRefFrameId?: string;
}): boolean {
  // Frame-ID sync is authoritative whenever both sides carry an id: recorded
  // playback, Replay, and the mounted Game proof (which drives recorded data
  // through the live adapter) all use ids and MUST stay strict for
  // deterministic frame identity.
  const frameIdMismatch = Boolean(
    motionRefFrameId && motionFrame?.source.frameId &&
    motionRefFrameId !== motionFrame.source.frameId,
  );
  if (frameIdMismatch) return true;

  // The timestamp path is the only one that gates the real live webcam (no
  // frame ids). There the motion frame is always one render-tick behind the
  // newest landmark, so a strict timestamp match rejects every frame on a
  // render-timing race and freezes the avatar. Never wait on timestamp for a
  // live-webcam frame; keep it strict for any other id-less source.
  if (motionFrame?.source.sourceOrigin === "live-webcam") return false;

  return Boolean(
    !motionRefFrameId && !motionFrame?.source.frameId &&
    Number.isFinite(motionRefCapturedAt) &&
    Number.isFinite(motionFrame?.source.capturedAt) &&
    motionRefCapturedAt !== motionFrame?.source.capturedAt,
  );
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
