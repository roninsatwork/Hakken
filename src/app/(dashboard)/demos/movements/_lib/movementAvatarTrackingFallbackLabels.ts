import type { MovementAvatarArmTargetsDecision } from "./movementAvatarPipeline";
import type {
  MovementHeadAngles,
  MovementHeadMotionIntent,
  MovementLowerBodyIntent,
} from "./movementTrackingCalibration";

export type MovementAvatarTrackingFallbackLabelsDecision = {
  armDepth: string;
  baseline: string;
  floor: string;
  head: string;
  headMotion: string;
  leftArm: string;
  leftFoot: string;
  leftKnee: string;
  lowerBody: string;
  owners: string;
  rightArm: string;
  rightFoot: string;
  rightKnee: string;
  spine: string;
};

export function resolveMovementAvatarTrackingFallbackLabels({
  activeSpineOwner,
  armTargets,
  autoCalibrationKind,
  avatarRole,
  bodyConfidence,
  feetOwner,
  hasActiveCalibration,
  hasManualCalibration,
  headMotionIntent,
  headOwner,
  leftArmTrackingReady,
  leftFootSource,
  leftKneeSource,
  lowerBodyIntent,
  lowerBodyOwner,
  lowerBodyTrackingReady,
  rawHead,
  rightArmTrackingReady,
  rightFootSource,
  rightKneeSource,
  shouldApplyLowerBody,
  torsoOwner,
}: {
  activeSpineOwner: string;
  armTargets: MovementAvatarArmTargetsDecision;
  autoCalibrationKind?: string | null;
  avatarRole: "instructor" | "player";
  bodyConfidence: Record<string, number>;
  feetOwner: string;
  hasActiveCalibration: boolean;
  hasManualCalibration: boolean;
  headMotionIntent: MovementHeadMotionIntent;
  headOwner: string;
  leftArmTrackingReady: boolean;
  leftFootSource: string;
  leftKneeSource: string;
  lowerBodyIntent: MovementLowerBodyIntent;
  lowerBodyOwner: string;
  lowerBodyTrackingReady: boolean;
  rawHead: MovementHeadAngles;
  rightArmTrackingReady: boolean;
  rightFootSource: string;
  rightKneeSource: string;
  shouldApplyLowerBody: boolean;
  torsoOwner: string;
}): MovementAvatarTrackingFallbackLabelsDecision {
  const isPlayer = avatarRole === "player";
  const lowerBodyLabel = isPlayer
    ? hasManualCalibration || !hasActiveCalibration
      ? lowerBodyIntent.label
      : `${lowerBodyIntent.label}-auto`
    : "recorded";
  const lowerBodyDebugLabel =
    `${lowerBodyLabel} d${lowerBodyIntent.squatDepth.toFixed(2)} ` +
    `h${lowerBodyIntent.squatSignals.hipDrop.toFixed(2)} ` +
    `k${lowerBodyIntent.squatSignals.kneeBend.toFixed(2)} ` +
    `t${lowerBodyIntent.squatSignals.torsoDrop.toFixed(2)} ` +
    `l${lowerBodyIntent.leftKneeRaise.toFixed(2)} ` +
    `r${lowerBodyIntent.rightKneeRaise.toFixed(2)}`;
  const shouldUseLowerBodySources = lowerBodyTrackingReady && shouldApplyLowerBody;
  const headSource = rawHead.confidence > 0.25 ? rawHead.source : "last-good";

  return {
    armDepth: isPlayer ? "player-2d-safe-arms" : "recorded-depth-arms",
    baseline: hasManualCalibration
      ? "manual-calibration"
      : hasActiveCalibration
        ? `${autoCalibrationKind ?? "auto"}-auto-baseline`
        : "none",
    floor: shouldUseLowerBodySources &&
      ((bodyConfidence.leftFoot ?? 0) > 0.35 || (bodyConfidence.rightFoot ?? 0) > 0.35)
      ? isPlayer
        ? hasManualCalibration ? "calibrated-floor" : "auto-floor"
        : "recorded-floor"
      : "fixed-floor",
    head: hasManualCalibration
      ? headSource
      : hasActiveCalibration
        ? `${headSource}-auto`
        : "neutral",
    headMotion: hasActiveCalibration ? headMotionIntent.label : "uncalibrated",
    leftArm: leftArmTrackingReady ? armTargets.left.wristSource : "relaxed-arm",
    leftFoot: shouldUseLowerBodySources ? leftFootSource : "neutral-stance",
    leftKnee: shouldUseLowerBodySources ? leftKneeSource : "neutral-stance",
    lowerBody: shouldUseLowerBodySources ? lowerBodyDebugLabel : "neutral-stance",
    owners: `head ${headOwner}; torso ${torsoOwner}; lower ${lowerBodyOwner}; feet ${feetOwner}`,
    rightArm: rightArmTrackingReady ? armTargets.right.wristSource : "relaxed-arm",
    rightFoot: shouldUseLowerBodySources ? rightFootSource : "neutral-stance",
    rightKnee: shouldUseLowerBodySources ? rightKneeSource : "neutral-stance",
    spine: activeSpineOwner,
  };
}
