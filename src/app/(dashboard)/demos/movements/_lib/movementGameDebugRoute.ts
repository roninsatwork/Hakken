export function parseMovementDebugGameFrameIndex(value: string | null) {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function shouldShowMovementDebugPlayerPausedPose({
  isDebugTracking,
}: {
  isDebugTracking: boolean;
}) {
  return isDebugTracking;
}
