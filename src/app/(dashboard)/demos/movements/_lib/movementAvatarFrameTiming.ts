const REFERENCE_FRAME_SECONDS = 1 / 60;
const MAX_APPLICATION_DELTA_SECONDS = 0.1;

export function movementAvatarApplicationDeltaSeconds(deltaSeconds: number | null | undefined) {
  if (!Number.isFinite(deltaSeconds) || !deltaSeconds || deltaSeconds <= 0) {
    return REFERENCE_FRAME_SECONDS;
  }
  return Math.min(deltaSeconds, MAX_APPLICATION_DELTA_SECONDS);
}

export function movementAvatarSourceAwareApplicationDeltaSeconds({
  currentSourceCapturedAt,
  previousSourceCapturedAt,
  renderDeltaSeconds,
}: {
  currentSourceCapturedAt: number | null | undefined;
  previousSourceCapturedAt: number | null | undefined;
  renderDeltaSeconds: number;
}) {
  const sourceDeltaSeconds = Number.isFinite(currentSourceCapturedAt) &&
    Number.isFinite(previousSourceCapturedAt) &&
    currentSourceCapturedAt! > previousSourceCapturedAt!
    ? (currentSourceCapturedAt! - previousSourceCapturedAt!) / 1000
    : 0;
  return movementAvatarApplicationDeltaSeconds(
    sourceDeltaSeconds > 0 ? sourceDeltaSeconds : renderDeltaSeconds,
  );
}

export function movementAvatarFrameRateAdjustedSlerp(
  referenceFrameSlerp: number,
  deltaSeconds: number | null | undefined,
) {
  const base = Math.max(0, Math.min(1, referenceFrameSlerp));
  if (base === 0 || base === 1) return base;
  const frameScale = movementAvatarApplicationDeltaSeconds(deltaSeconds) / REFERENCE_FRAME_SECONDS;
  return 1 - Math.pow(1 - base, frameScale);
}

export function movementAvatarFrameRateAdjustedAngleStep(
  referenceFrameStep: number | undefined,
  deltaSeconds: number | null | undefined,
) {
  if (!referenceFrameStep || referenceFrameStep <= 0) return referenceFrameStep;
  const frameScale = movementAvatarApplicationDeltaSeconds(deltaSeconds) / REFERENCE_FRAME_SECONDS;
  return referenceFrameStep * frameScale;
}
