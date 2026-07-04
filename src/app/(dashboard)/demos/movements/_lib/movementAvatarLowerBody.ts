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

export type MovementAvatarPlayerLowerBodyOwnerDecision = {
  canUsePlayerRetargetLegRaise: boolean;
  feetOwner: string;
  lowerBodyOwner: string;
  shouldUsePlayerFootFallback: boolean;
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
  retargetHipDrop,
  retargetSquatDepth,
}: {
  hasLiveBodyCalibration: boolean;
  isPlayer: boolean;
  lowerBodyIntent: MovementLowerBodyIntent;
  lowerBodyTrackingReady: boolean;
  retargetContactsBothFeet: boolean;
  retargetHipDrop: number;
  retargetSquatDepth: number;
}): MovementAvatarLowerBodyDrive {
  let liveSquatDepth = retargetSquatDepth;
  const canUsePlayerIntent =
    isPlayer &&
    lowerBodyTrackingReady &&
    lowerBodyIntent.confidence >= 0.35;
  const hasRetargetSquatEvidence =
    retargetContactsBothFeet &&
    (retargetSquatDepth > 0.08 || retargetHipDrop > 0.12);
  const hasLiveDropSquatEvidence =
    retargetHipDrop > 0.12 ||
    retargetSquatDepth > 0.08 ||
    lowerBodyIntent.squatSignals.hipDrop > 0.16 ||
    lowerBodyIntent.squatSignals.torsoDrop > 0.2 ||
    lowerBodyIntent.squatSignals.headDrop > 0.2;
  const hasStrongLiveSquatEvidence =
    lowerBodyIntent.squatDepth > 0.34 &&
    lowerBodyIntent.squatSignals.kneeBend > 0.28 &&
    hasLiveDropSquatEvidence;
  const shouldDrivePlayerSquat =
    canUsePlayerIntent &&
    lowerBodyIntent.label === "squat" &&
    (hasRetargetSquatEvidence || hasStrongLiveSquatEvidence);
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
  const rawPlayerSquatPresentationDepth = isPlayer
    ? Math.max(groundedSquatDepth, shouldDrivePlayerSquat ? lowerBodyIntent.squatDepth : 0)
    : groundedSquatDepth;
  const playerSquatPresentationDepth =
    isPlayer && !shouldDrivePlayerSquat
      ? 0
      : rawPlayerSquatPresentationDepth;
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

export function resolveMovementAvatarPlayerLowerBodyOwners({
  lowerBodyDrive,
  lowerBodySegmentMotion,
  lowerBodyTrackingReady,
  playerRetargetLowerBodyMotion,
  retargetSourceQuality,
  shouldApplyLowerBody,
  shouldHoldPlayerSquatPose,
  solvedFootSegments,
  solvedLegSegments,
  solvedLowerBodySegments,
  totalSolvedSegments,
}: {
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodySegmentMotion: number;
  lowerBodyTrackingReady: boolean;
  playerRetargetLowerBodyMotion: number;
  retargetSourceQuality: number;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose: boolean;
  solvedFootSegments: number;
  solvedLegSegments: number;
  solvedLowerBodySegments: number;
  totalSolvedSegments: number;
}): MovementAvatarPlayerLowerBodyOwnerDecision {
  const canUsePlayerRetargetLegRaise =
    lowerBodyDrive.shouldDrivePlayerLegRaise &&
    retargetSourceQuality >= 0.65 &&
    totalSolvedSegments >= 8;
  const playerLegRaiseOwner =
    lowerBodyDrive.shouldDrivePlayerLegRaise &&
    lowerBodyDrive.playerLegRaiseSide
      ? `player-${lowerBodyDrive.playerLegRaiseSide}-leg-raise`
      : null;
  const retargetOwnsLowerBody = solvedLegSegments >= 4 && retargetSourceQuality >= 0.45;
  const shouldUsePlayerFootFallback =
    solvedLegSegments >= 4 &&
    solvedFootSegments === 0 &&
    lowerBodySegmentMotion > 0.16 &&
    retargetSourceQuality >= 0.45;

  if (!lowerBodyTrackingReady && !shouldHoldPlayerSquatPose) {
    return {
      canUsePlayerRetargetLegRaise,
      feetOwner: "neutral",
      lowerBodyOwner: "neutral",
      shouldUsePlayerFootFallback,
    };
  }

  if (!shouldApplyLowerBody) {
    return {
      canUsePlayerRetargetLegRaise,
      feetOwner: "neutral",
      lowerBodyOwner: "neutral",
      shouldUsePlayerFootFallback,
    };
  }

  if (lowerBodyDrive.shouldDrivePlayerLegRaise && !canUsePlayerRetargetLegRaise) {
    return {
      canUsePlayerRetargetLegRaise,
      feetOwner: "neutral",
      lowerBodyOwner: playerLegRaiseOwner ?? "player-leg-raise",
      shouldUsePlayerFootFallback,
    };
  }

  if (lowerBodyDrive.shouldDrivePlayerSquat || shouldHoldPlayerSquatPose) {
    return {
      canUsePlayerRetargetLegRaise,
      feetOwner: "recorded-retarget",
      lowerBodyOwner: lowerBodyDrive.shouldDrivePlayerSquat
        ? "player-stable-squat"
        : "player-stable-squat-held",
      shouldUsePlayerFootFallback,
    };
  }

  if (playerRetargetLowerBodyMotion < 0.16) {
    return {
      canUsePlayerRetargetLegRaise,
      feetOwner: "neutral",
      lowerBodyOwner: retargetSourceQuality >= 0.65
        ? "player-retarget"
        : "player-lower-body-neutral",
      shouldUsePlayerFootFallback,
    };
  }

  return {
    canUsePlayerRetargetLegRaise,
    feetOwner: solvedFootSegments > 0
      ? "recorded-retarget"
      : shouldUsePlayerFootFallback
        ? "player-legacy-foot-fallback"
        : "neutral",
    lowerBodyOwner: playerLegRaiseOwner ?? (retargetOwnsLowerBody
      ? "player-retarget"
      : solvedLowerBodySegments > 0
        ? "retarget-legacy-fallback"
        : "legacy-fallback"),
    shouldUsePlayerFootFallback,
  };
}
