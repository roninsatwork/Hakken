import type { MovementDebugReplayFrame } from "./movementDebugReplay";

const MIN_REPLAY_FRAME_DELAY_MS = 8;
const MAX_REPLAY_FRAME_DELAY_MS = 250;
const DEFAULT_REPLAY_FRAME_DELAY_MS = 1000 / 30;

export function resolveMovementReplayFrameDelay({
  currentFrameIndex,
  fallbackFps,
  samples,
}: {
  currentFrameIndex: number;
  fallbackFps?: number;
  samples: Array<Pick<MovementDebugReplayFrame, "capturedAt"> | { capturedAt?: number }>;
}) {
  const fallbackDelay = fallbackFps && fallbackFps > 0
    ? 1000 / fallbackFps
    : DEFAULT_REPLAY_FRAME_DELAY_MS;
  const currentCapturedAt = samples[currentFrameIndex]?.capturedAt;
  const nextCapturedAt = samples[currentFrameIndex + 1]?.capturedAt;
  const recordedDelay = typeof currentCapturedAt === "number" && typeof nextCapturedAt === "number"
    ? nextCapturedAt - currentCapturedAt
    : Number.NaN;
  const delay = Number.isFinite(recordedDelay) && recordedDelay > 0
    ? recordedDelay
    : fallbackDelay;

  return Math.min(Math.max(delay, MIN_REPLAY_FRAME_DELAY_MS), MAX_REPLAY_FRAME_DELAY_MS);
}

export function resolveMovementReplayPlaybackStep({
  currentFrameIndex,
  fallbackFps,
  samples,
}: {
  currentFrameIndex: number;
  fallbackFps?: number;
  samples: Array<Pick<MovementDebugReplayFrame, "capturedAt"> | { capturedAt?: number }>;
}) {
  const frameIndex = Math.min(currentFrameIndex + 1, Math.max(samples.length - 1, 0));
  return {
    delayMs: resolveMovementReplayFrameDelay({
      currentFrameIndex: frameIndex,
      fallbackFps,
      samples,
    }),
    frameIndex,
  };
}
