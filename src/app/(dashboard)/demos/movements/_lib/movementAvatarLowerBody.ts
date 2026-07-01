import type { MovementLowerBodyIntent } from "./movementTrackingCalibration";

export type MovementAvatarBodyConfidence = Record<string, number>;

export type MovementAvatarLowerBodyDrive = {
  groundedSquatDepth: number;
  liveSquatDepth: number;
  playerLegRaiseDepth: number;
  playerLegRaiseSide: "left" | "right" | null;
  playerLowerBodyState: "held" | "left-leg-raise" | "mixed-lower-body" | "neutral" | "planted-squat" | "right-leg-raise";
  playerSquatPresentationDepth: number;
  shouldApplyLowerBody: boolean;
  shouldDrivePlayerLegRaise: boolean;
  shouldApplySolverTorso: boolean;
  shouldDrivePlayerSquat: boolean;
  visualRootDrop: number;
};

function confidenceValue(bodyConfidence: MovementAvatarBodyConfidence, key: string) {
  return bodyConfidence[key] ?? 0;
}

export function isMovementAvatarLowerBodyTrackingReady({
  bodyConfidence,
  isPlayer,
  lowerBodyIntent,
}: {
  bodyConfidence: MovementAvatarBodyConfidence;
  isPlayer: boolean;
  lowerBodyIntent: MovementLowerBodyIntent;
}) {
  if (!isPlayer) return true;

  const hipConfidence = confidenceValue(bodyConfidence, "hips");
  const leftKneeConfidence = confidenceValue(bodyConfidence, "leftKnee");
  const rightKneeConfidence = confidenceValue(bodyConfidence, "rightKnee");
  const lowerLimbConfidence = Math.max(
    leftKneeConfidence,
    rightKneeConfidence,
    confidenceValue(bodyConfidence, "leftFoot"),
    confidenceValue(bodyConfidence, "rightFoot"),
  );
  const normalLowerBodyReady = hipConfidence >= 0.45 && lowerLimbConfidence >= 0.35;
  const farCameraSquatReady =
    lowerBodyIntent.label === "squat" &&
    lowerBodyIntent.confidence >= 0.35 &&
    lowerBodyIntent.squatDepth > 0.16 &&
    hipConfidence >= 0.32 &&
    Math.min(leftKneeConfidence, rightKneeConfidence) >= 0.3;
  const farCameraLeftLegRaiseReady =
    lowerBodyIntent.label === "left-knee-raise" &&
    lowerBodyIntent.confidence >= 0.35 &&
    lowerBodyIntent.leftKneeRaise > 0.22 &&
    hipConfidence >= 0.32 &&
    Math.min(leftKneeConfidence, rightKneeConfidence) >= 0.3;
  const farCameraRightLegRaiseReady =
    lowerBodyIntent.label === "right-knee-raise" &&
    lowerBodyIntent.confidence >= 0.35 &&
    lowerBodyIntent.rightKneeRaise > 0.22 &&
    hipConfidence >= 0.32 &&
    Math.min(leftKneeConfidence, rightKneeConfidence) >= 0.3;

  return normalLowerBodyReady || farCameraSquatReady || farCameraLeftLegRaiseReady || farCameraRightLegRaiseReady;
}

export function resolveMovementAvatarLowerBodyDrive({
  hasLiveBodyCalibration,
  isPlayer,
  lowerBodyIntent,
  lowerBodyTrackingReady,
  retargetContactsBothFeet,
  retargetSquatDepth,
}: {
  hasLiveBodyCalibration: boolean;
  isPlayer: boolean;
  lowerBodyIntent: MovementLowerBodyIntent;
  lowerBodyTrackingReady: boolean;
  retargetContactsBothFeet: boolean;
  retargetSquatDepth: number;
}): MovementAvatarLowerBodyDrive {
  let liveSquatDepth = retargetSquatDepth;
  const canUsePlayerIntent =
    isPlayer &&
    lowerBodyTrackingReady &&
    lowerBodyIntent.confidence >= 0.35;
  const shouldDrivePlayerSquat =
    canUsePlayerIntent &&
    lowerBodyIntent.label === "squat" &&
    lowerBodyIntent.squatDepth > 0.16;
  const playerLegRaiseSide =
    canUsePlayerIntent && lowerBodyIntent.label === "left-knee-raise" && lowerBodyIntent.leftKneeRaise > 0.22
      ? "left"
      : canUsePlayerIntent && lowerBodyIntent.label === "right-knee-raise" && lowerBodyIntent.rightKneeRaise > 0.22
        ? "right"
        : null;
  const playerLegRaiseDepth = playerLegRaiseSide === "left"
    ? lowerBodyIntent.leftKneeRaise
    : playerLegRaiseSide === "right"
      ? lowerBodyIntent.rightKneeRaise
      : 0;
  const shouldDrivePlayerLegRaise = Boolean(playerLegRaiseSide && playerLegRaiseDepth > 0.22);

  if (shouldDrivePlayerSquat) {
    liveSquatDepth = Math.max(liveSquatDepth, lowerBodyIntent.squatDepth);
  }

  const shouldApplyLowerBody = hasLiveBodyCalibration || shouldDrivePlayerSquat || shouldDrivePlayerLegRaise;
  const groundedSquatDepth = retargetContactsBothFeet ? liveSquatDepth : 0;
  const playerSquatPresentationDepth = isPlayer
    ? Math.max(groundedSquatDepth, shouldDrivePlayerSquat ? lowerBodyIntent.squatDepth : 0)
    : groundedSquatDepth;
  const playerLowerBodyState = shouldDrivePlayerSquat
    ? "planted-squat"
    : shouldDrivePlayerLegRaise && playerLegRaiseSide === "left"
      ? "left-leg-raise"
      : shouldDrivePlayerLegRaise && playerLegRaiseSide === "right"
        ? "right-leg-raise"
        : canUsePlayerIntent && lowerBodyIntent.label === "mixed-lower-body"
          ? "mixed-lower-body"
          : shouldApplyLowerBody
            ? "neutral"
            : "held";

  return {
    groundedSquatDepth,
    liveSquatDepth,
    playerLegRaiseDepth,
    playerLegRaiseSide,
    playerLowerBodyState,
    playerSquatPresentationDepth,
    shouldApplyLowerBody,
    shouldDrivePlayerLegRaise,
    shouldApplySolverTorso: isPlayer && shouldApplyLowerBody,
    shouldDrivePlayerSquat,
    visualRootDrop: lowerBodyTrackingReady && shouldApplyLowerBody
      ? playerSquatPresentationDepth * (isPlayer ? 1.72 : 0.56)
      : 0,
  };
}
