import type { MovementMotionFrame } from "./movementMotionFrame";
import {
  getMovementCameraConfidenceRecoveryCue,
  type MovementCameraConfidenceRecoveryCue,
  type MovementStartReadiness,
} from "./movementSourceFrame";
import {
  getMovementTruthSkeletonRecoveryCue,
  summarizeMovementTruthSkeleton,
} from "./movementTruthSkeleton";

export type MovementSetupSpineReadiness = "blocked" | "needs-attention" | "ready";

export function getMovementStartReadinessMessage({
  blockedReasons,
  cameraRecoveryCue,
  readiness,
}: {
  blockedReasons?: string[];
  cameraRecoveryCue?: MovementCameraConfidenceRecoveryCue | null;
  readiness: MovementStartReadiness | null;
}) {
  const activeBlockedReasons = blockedReasons ?? readiness?.blockedReasons ?? [];
  if (
    activeBlockedReasons.includes("spine-blocked") ||
    activeBlockedReasons.includes("spine-needs-attention")
  ) {
    return "Line up your spine first.";
  }
  if (cameraRecoveryCue) return cameraRecoveryCue.message;
  if (!readiness) return "Move where I can see you.";
  if (readiness.promptEvents.includes("show-your-whole-body")) return "Show your whole body.";
  if (readiness.promptEvents.includes("show-your-feet")) return "Show your feet.";
  if (readiness.promptEvents.includes("show-your-hands")) return "Show your hands.";
  if (readiness.promptEvents.includes("hold-still-for-calibration")) {
    return "Hold still while the camera gets ready.";
  }
  if (readiness.promptEvents.includes("walk-back-into-frame")) {
    return "Walk back into frame.";
  }
  if (readiness.blockedReasons.length > 0) return "Move where I can see you.";
  return "Get ready.";
}

export function getMovementSetupRecoveryCue({
  motionFrame,
  spineReadiness,
}: {
  motionFrame: MovementMotionFrame | null | undefined;
  spineReadiness: MovementSetupSpineReadiness;
}) {
  if (spineReadiness === "blocked") {
    return "Step back until head, shoulders, and hips are visible.";
  }
  if (spineReadiness === "needs-attention") {
    return "Keep head, shoulders, and hips visible.";
  }
  if (!motionFrame) return null;
  if (motionFrame.startReadiness?.canStartGame) return null;

  const cameraRecoveryCue = getMovementCameraConfidenceRecoveryCue(motionFrame.cameraConfidence);
  if (cameraRecoveryCue) return cameraRecoveryCue.message;

  const truthRecoveryCue = getMovementTruthSkeletonRecoveryCue(
    summarizeMovementTruthSkeleton(motionFrame.truthSkeleton),
  );
  return truthRecoveryCue?.message ?? null;
}
