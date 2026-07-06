import {
  resolveMovementAvatarPlayerLowerBodyOwners,
  type MovementAvatarLowerBodyDrive,
  type MovementAvatarPlayerLowerBodyOwnerDecision,
} from "./movementAvatarLowerBody";
import type {
  MovementAvatarAppliedLowerBodyDecision,
  MovementAvatarInactiveLowerBodyDecision,
  MovementAvatarLowerBodyApplicationStageDecision,
  MovementAvatarLowerBodyVisualDecision,
  MovementAvatarLowerBodyVisualState,
  MovementAvatarPipelineDecision,
  MovementAvatarPlayerSourceOwnerDecision,
  MovementAvatarRetargetSegmentApplicationDecision,
  MovementAvatarRetargetSegmentType,
} from "./movementAvatarPipeline";
import type { MovementRetargetFrame, MovementRetargetSegmentName } from "./movementRetargeting";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementAvatarTrackingProfile,
} from "./movementTrackingCalibration";

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function smoothLowerBodyValue(current: number, target: number, rise: number, fall: number) {
  const factor = target > current ? rise : fall;
  const next = lerp(current, target, factor);
  return target <= 0.001 && next < 0.025 ? 0 : next;
}

const INSTRUCTOR_SQUAT_ENTRY_MIN_VISIBLE_DEPTH = 0.18;

function smoothInstructorSquatDepth(current: number, sourceDepth: number) {
  const enterThreshold = current > 0.08 ? 0.08 : 0.2;
  const target = sourceDepth >= enterThreshold ? sourceDepth : 0;
  const next = smoothLowerBodyValue(current, target, 0.2, 0.1);
  return target > 0 && current <= 0.08
    ? Math.max(next, Math.min(target, INSTRUCTOR_SQUAT_ENTRY_MIN_VISIBLE_DEPTH))
    : next;
}

export function resolveMovementAvatarPlayerSourceOwnerDecision({
  avatarRole,
  decision,
  playerSquatPresentationDepth,
  shouldHoldPlayerSquatPose,
}: {
  avatarRole: "instructor" | "player";
  decision: MovementAvatarPipelineDecision;
  playerSquatPresentationDepth: number;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarPlayerSourceOwnerDecision {
  const playerRetargetLowerBodyMotion = avatarRole === "player"
    ? Math.max(
        playerSquatPresentationDepth,
        decision.retargetFrame.squatDepth,
        decision.retargetFrame.kneeLift.left,
        decision.retargetFrame.kneeLift.right,
        decision.lowerBodySegmentMotion,
      )
    : decision.playerRetargetLowerBodyMotion;

  return {
    lowerBodyOwnerDecision: avatarRole === "player"
      ? resolveMovementAvatarPlayerLowerBodyOwners({
          lowerBodyDrive: decision.lowerBodyDrive,
          lowerBodySegmentMotion: decision.lowerBodySegmentMotion,
          lowerBodyTrackingReady: decision.lowerBodyTrackingReady,
          playerRetargetLowerBodyMotion,
          retargetSourceQuality: decision.retargetFrame.debug.sourceQuality,
          shouldApplyLowerBody: decision.shouldApplyLowerBody,
          shouldHoldPlayerSquatPose,
          solvedFootSegments: decision.retargetSolvedFeet,
          solvedLegSegments: decision.retargetSolvedLegs,
          solvedLowerBodySegments: decision.retargetSolvedLegs + decision.retargetSolvedFeet,
          totalSolvedSegments: decision.retargetFrame.debug.solvedSegments.length,
        })
      : null,
    playerRetargetLowerBodyMotion,
  };
}

export function resolveMovementAvatarAppliedLowerBodyDecision({
  appliedFootSegments,
  appliedLegSegments,
  appliedLowerBodySegments,
  avatarRole,
  balancedPlantedSquatDepth,
  instructorSquatPresentationDepth,
  lowerBodyDrive,
  lowerBodySegmentMotion,
  lowerBodyTrackingReady,
  playerRetargetLowerBodyMotion,
  retargetFrame,
  shouldApplyLowerBody,
  shouldHoldPlayerSquatPose,
}: {
  appliedFootSegments: number;
  appliedLegSegments: number;
  appliedLowerBodySegments: number;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  instructorSquatPresentationDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodySegmentMotion: number;
  lowerBodyTrackingReady: boolean;
  playerRetargetLowerBodyMotion: number;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarAppliedLowerBodyDecision {
  const isPlayer = avatarRole === "player";
  const retargetOwnsLowerBody =
    appliedLegSegments >= 4 &&
    retargetFrame.debug.sourceQuality >= 0.45;
  const shouldUseLegacyLowerBody = !retargetOwnsLowerBody;
  const shouldUseRecordedSquatPresentation =
    !isPlayer &&
    instructorSquatPresentationDepth > 0.18 &&
    balancedPlantedSquatDepth === 0;
  const playerAppliedOwnerDecision = isPlayer
    ? resolveMovementAvatarPlayerLowerBodyOwners({
        lowerBodyDrive,
        lowerBodySegmentMotion,
        lowerBodyTrackingReady,
        playerRetargetLowerBodyMotion,
        retargetSourceQuality: retargetFrame.debug.sourceQuality,
        shouldApplyLowerBody,
        shouldHoldPlayerSquatPose,
        solvedFootSegments: appliedFootSegments,
        solvedLegSegments: appliedLegSegments,
        solvedLowerBodySegments: appliedLowerBodySegments,
        totalSolvedSegments: retargetFrame.debug.solvedSegments.length,
      })
    : null;
  const shouldUsePlayerFootFallback =
    playerAppliedOwnerDecision?.shouldUsePlayerFootFallback ?? false;
  const lowerBodyOwner = playerAppliedOwnerDecision?.lowerBodyOwner ?? (retargetOwnsLowerBody
    ? "recorded-retarget"
    : appliedLowerBodySegments > 0
      ? "retarget-legacy-fallback"
      : "legacy-fallback");
  const feetOwner = shouldUsePlayerFootFallback
    ? "player-legacy-foot-fallback"
    : playerAppliedOwnerDecision?.feetOwner ?? (appliedFootSegments > 0 ? "recorded-retarget" : "neutral");

  return {
    feetOwner,
    lowerBodyOwner,
    playerAppliedOwnerDecision,
    retargetOwnsLowerBody,
    shouldUseLegacyLowerBody,
    shouldUsePlayerFootFallback,
    shouldUseRecordedSquatPresentation,
  };
}

export function resolveMovementAvatarPlantedFootOwner(currentOwner: string) {
  if (currentOwner.includes("planted-flat")) return currentOwner;
  if (currentOwner === "neutral") return "planted-flat";
  return `${currentOwner}+planted-flat`;
}

export function resolveMovementAvatarRetargetSegmentApplication({
  avatarRole,
  hasWorldLandmarks,
  instructorSquatPresentationDepth,
  lowerBodySegmentMotion,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  retargetFrame,
  segmentName,
  segmentType,
  shouldUseRetargetedUpperBody,
}: {
  avatarRole: "instructor" | "player";
  hasWorldLandmarks: boolean;
  instructorSquatPresentationDepth: number;
  lowerBodySegmentMotion: number;
  profile?: MovementAvatarTrackingProfile;
  retargetFrame: MovementRetargetFrame;
  segmentName: MovementRetargetSegmentName;
  segmentType: MovementAvatarRetargetSegmentType;
  shouldUseRetargetedUpperBody: boolean;
}): MovementAvatarRetargetSegmentApplicationDecision {
  const isPlayer = avatarRole === "player";
  const segment = retargetFrame.segments[segmentName];
  const useReplayUpperBodySlerp = shouldUseRetargetedUpperBody && segmentType === "arm";
  const slerp = segmentType === "foot"
    ? (isPlayer ? profile.footSlerp : 0.36)
    : segmentType === "arm"
      ? segmentName.includes("UpperArm")
        ? (useReplayUpperBodySlerp ? 0.72 : isPlayer ? profile.upperArmSlerp : 0.72)
        : (useReplayUpperBodySlerp ? 0.78 : isPlayer ? profile.lowerArmSlerp : 0.78)
      : segmentType === "spine"
        ? (isPlayer ? 0.32 : 0.66)
        : (isPlayer ? profile.legSlerp : 0.42);

  const inactiveDecision = (
    reason: MovementAvatarRetargetSegmentApplicationDecision["reason"],
  ): MovementAvatarRetargetSegmentApplicationDecision => ({
    reason,
    shouldApply: false,
    slerp,
    zScale: hasWorldLandmarks ? 1 : 0.18,
  });

  if (!segment || segment.confidence < 0.3) return inactiveDecision("low-confidence");

  const presentationSquatDepth = isPlayer
    ? retargetFrame.squatDepth
    : instructorSquatPresentationDepth;
  const activeFootMotion = Math.max(
    presentationSquatDepth,
    lowerBodySegmentMotion,
    retargetFrame.kneeLift.left,
    retargetFrame.kneeLift.right,
  );

  if (!isPlayer && segmentType === "foot" && activeFootMotion < 0.22) {
    return inactiveDecision("recorded-foot-low-motion");
  }

  if (!isPlayer && segmentType === "foot") {
    const isLeftFoot = segmentName === "leftFoot";
    const isPlanted = isLeftFoot
      ? retargetFrame.contacts.leftFoot
      : retargetFrame.contacts.rightFoot;
    const kneeLift = isLeftFoot
      ? retargetFrame.kneeLift.left
      : retargetFrame.kneeLift.right;

    if (isPlanted) return inactiveDecision("recorded-foot-planted");
    if (kneeLift < 0.45) return inactiveDecision("recorded-foot-low-knee-lift");
  }

  return {
    reason: "active",
    shouldApply: true,
    slerp,
    zScale: hasWorldLandmarks ? 1 : 0.18,
  };
}

export function resolveMovementAvatarInactiveLowerBodyDecision({
  avatarRole,
  lowerBodySourceReliable,
}: {
  avatarRole: "instructor" | "player";
  lowerBodySourceReliable: boolean;
}): MovementAvatarInactiveLowerBodyDecision {
  if (avatarRole === "instructor" && !lowerBodySourceReliable) {
    return {
      feetOwner: "recorded-source-limited",
      lowerBodyOwner: "recorded-source-limited",
    };
  }

  return {
    feetOwner: null,
    lowerBodyOwner: null,
  };
}

export function resolveMovementAvatarLowerBodyApplicationStage({
  avatarRole,
  instructorLowerBodyMotion,
  lowerBodyDrive,
  playerRetargetLowerBodyMotion,
  sourceOwnerDecision,
  shouldHoldPlayerSquatPose,
}: {
  avatarRole: "instructor" | "player";
  instructorLowerBodyMotion: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerRetargetLowerBodyMotion: number;
  sourceOwnerDecision: MovementAvatarPlayerLowerBodyOwnerDecision | null;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarLowerBodyApplicationStageDecision {
  const isPlayer = avatarRole === "player";
  const playerLegRaiseOwner =
    isPlayer &&
    lowerBodyDrive.shouldDrivePlayerLegRaise &&
    lowerBodyDrive.playerLegRaiseSide
      ? `player-${lowerBodyDrive.playerLegRaiseSide}-leg-raise`
      : null;
  const anchoredPlayerLegRaiseSide =
    isPlayer &&
    lowerBodyDrive.shouldDrivePlayerLegRaise &&
    lowerBodyDrive.playerLegRaiseSide
      ? lowerBodyDrive.playerLegRaiseSide
      : null;
  const canUsePlayerRetargetLegRaise =
    sourceOwnerDecision?.canUsePlayerRetargetLegRaise ?? false;

  if (anchoredPlayerLegRaiseSide && !canUsePlayerRetargetLegRaise) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: sourceOwnerDecision?.feetOwner ?? "neutral",
      lowerBodyOwner: sourceOwnerDecision?.lowerBodyOwner ?? playerLegRaiseOwner ?? "player-leg-raise",
      stage: "player-leg-raise",
    };
  }

  if (isPlayer && (lowerBodyDrive.shouldDrivePlayerSquat || shouldHoldPlayerSquatPose)) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: sourceOwnerDecision?.feetOwner ?? "recorded-retarget",
      lowerBodyOwner: sourceOwnerDecision?.lowerBodyOwner ?? (lowerBodyDrive.shouldDrivePlayerSquat
        ? "player-stable-squat"
        : "player-stable-squat-held"),
      stage: "player-squat",
    };
  }

  const shouldKeepNeutralPlayerLowerBody =
    isPlayer &&
    lowerBodyDrive.playerLowerBodyState === "neutral" &&
    playerRetargetLowerBodyMotion < 0.32 &&
    !sourceOwnerDecision?.shouldUsePlayerFootFallback;

  if (isPlayer && (shouldKeepNeutralPlayerLowerBody || playerRetargetLowerBodyMotion < 0.16)) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: "neutral",
      lowerBodyOwner: "player-lower-body-neutral",
      stage: "player-neutral",
    };
  }

  if (!isPlayer && instructorLowerBodyMotion < 0.08) {
    return {
      anchoredPlayerLegRaiseSide: null,
      canUsePlayerRetargetLegRaise: false,
      feetOwner: "neutral",
      lowerBodyOwner: "recorded-neutral",
      stage: "recorded-neutral",
    };
  }

  return {
    anchoredPlayerLegRaiseSide,
    canUsePlayerRetargetLegRaise,
    feetOwner: "neutral",
    lowerBodyOwner: "neutral",
    stage: "retarget",
  };
}

export function resolveMovementAvatarLowerBodyVisualDecision({
  avatarRole,
  lowerBodyDrive,
  previousState,
  recordedSquatPresentationDepth,
}: {
  avatarRole: "instructor" | "player";
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  previousState: MovementAvatarLowerBodyVisualState;
  recordedSquatPresentationDepth: number;
}): MovementAvatarLowerBodyVisualDecision {
  if (avatarRole === "player") {
    const state = {
      squatPresentationDepth: smoothLowerBodyValue(
        previousState.squatPresentationDepth,
        lowerBodyDrive.playerSquatPresentationDepth,
        lowerBodyDrive.shouldDrivePlayerSquat ? 0.22 : 0.12,
        0.2,
      ),
      visualRootDrop: smoothLowerBodyValue(
        previousState.visualRootDrop,
        lowerBodyDrive.visualRootDrop,
        0.2,
        0.22,
      ),
    };

    return {
      instructorSquatPresentationDepth: recordedSquatPresentationDepth,
      playerSquatPresentationDepth: state.squatPresentationDepth,
      state,
      visualRootDrop: state.visualRootDrop,
    };
  }

  const squatPresentationDepth = smoothInstructorSquatDepth(
    previousState.squatPresentationDepth,
    recordedSquatPresentationDepth,
  );
  const visualRootDrop = smoothLowerBodyValue(
    previousState.visualRootDrop,
    squatPresentationDepth * 0.56,
    0.18,
    0.12,
  );
  const state = {
    squatPresentationDepth,
    visualRootDrop,
  };

  return {
    instructorSquatPresentationDepth: squatPresentationDepth,
    playerSquatPresentationDepth: squatPresentationDepth,
    state,
    visualRootDrop,
  };
}
