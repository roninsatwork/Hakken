export type MovementStartReadinessBypassReason =
  | "debug-auto-baseline"
  | "debug-player-pose"
  | "guided-preview"
  | "manual-preview-skip";

export type ResolveMovementStartReadinessBypassInput = {
  isDebugAutoBaselineRoute?: boolean;
  isDebugPlayerPoseRoute?: boolean;
  isGuidedPreviewRoute?: boolean;
  isManualPreviewSkip?: boolean;
};

export function resolveMovementStartReadinessBypassReason({
  isDebugAutoBaselineRoute = false,
  isDebugPlayerPoseRoute = false,
  isGuidedPreviewRoute = false,
  isManualPreviewSkip = false,
}: ResolveMovementStartReadinessBypassInput): MovementStartReadinessBypassReason | null {
  if (isDebugAutoBaselineRoute) return "debug-auto-baseline";
  if (isDebugPlayerPoseRoute) return "debug-player-pose";
  if (isGuidedPreviewRoute) return "guided-preview";
  if (isManualPreviewSkip) return "manual-preview-skip";
  return null;
}
