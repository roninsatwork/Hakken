import {
  extractOwner,
  summarizeMovementDebugReplaySession,
  type MovementDebugReplayFrame,
  type MovementDebugReplaySession,
  type MovementDebugReplaySummary,
} from "./movementDebugReplay";
import {
  buildMovementGamePathSimulation,
  type MovementGamePathDecision,
} from "./movementGamePathSimulation";
import {
  selectMovementGameVisualParityProofFrames,
  type MovementGameVisualParityProofFrame,
} from "./movementGameVisualParityProof";
import {
  resolveMovementGameplayEventFrameSummary,
  type MovementGameplayEventFrame,
  type MovementGameplayEventFrameSummary,
} from "./movementGameplayEvents";
import {
  resolveMovementMatchScoringGameplaySummary,
} from "./movementGameplayScoring";
import {
  getMovementCoverageEntries,
  getMovementCoverageMissingProofs,
  summarizeMovementCoverageRegistry,
  type MovementCoverageEntry,
  type MovementCoverageMissingProof,
  type MovementCoverageSummary,
} from "./movementCoverageRegistry";
import {
  resolveMovementAvatarReplayDecision,
  resolveMovementAvatarStudioDecision,
} from "./movementAvatarLegacyDecision";
import {
  type MovementAvatarPipelineDecision,
} from "./movementAvatarPipeline";
import { resolveMovementAvatarHeadTarget } from "./movementAvatarHeadTarget";
import {
  resolveMovementRootMotionJumpResponse,
  resolveMovementRootMotionStepResponse,
  type MovementRootMotionFrame,
} from "./movementRootMotion";
import type {
  MovementCameraBodyPart,
  MovementCameraConfidenceState,
  MovementCameraMessageEvent,
  MovementSourceFrame,
  MovementSourceOrigin,
  MovementSourceStatus,
  MovementStartPromptEvent,
  MovementStartReadiness,
  MovementStartReadinessState,
} from "./movementSourceFrame";
import type { MovementHeadMotionIntent } from "./movementTrackingCalibration";

export type MovementReplayFailureCode =
  | "avatar_head_spine_diverged"
  | "avatar_head_not_applied"
  | "avatar_head_root_diverged"
  | "avatar_output_diverged"
  | "avatar_upper_body_diverged"
  | "feet_neutral_while_leg_motion_present"
  | "false_knee_raise_candidate"
  | "heading_unavailable"
  | "lower_body_owner_flicker"
  | "replay_game_path_diverged"
  | "replay_game_score_message_diverged"
  | "replay_game_wrapper_diverged"
  | "retarget_quality_drop"
  | "root_path_detected"
  | "root_motion_missing"
  | "root_turn_detected"
  | "source_feet_weak"
  | "source_lower_body_out_of_frame"
  | "start_readiness_blocked_at_capture"
  | "start_readiness_replay_mismatch"
  | "support_constraint_missing"
  | "support_constraint_partial"
  | "squat_hold_too_sticky"
  | "squat_not_detected"
  | "stand_recovery_missing"
  | "visual_match_low"
  | "world_landmarks_missing";

export type MovementReplaySemanticFailureCode =
  | "head-direction-reversed"
  | "head-motion-missing"
  | "side-bend-missing"
  | "side-bend-wrong-direction"
  | "hip-drop-missing"
  | "hip-shift-wrong-direction"
  | "leg-lift-missing"
  | "leg-lift-wrong-side"
  | "leg-lift-collapsed-to-squat"
  | "squat-missing"
  | "squat-collapsed-to-leg-lift"
  | "root-turn-reversed"
  | "root-travel-reversed"
  | "mirror-side-mismatch"
  | "movement-visible-but-unscored"
  | "score-positive-but-avatar-wrong";

export type MovementReplayFailure = {
  code: MovementReplayFailureCode;
  detail: string;
  frameIndex?: number;
  semanticCode?: MovementReplaySemanticFailureCode;
  severity: "error" | "warning";
};

export type MovementReplayGamePathFrame = {
  exercisePoseKey: string;
  exercisePoseLabel: string;
  exercisePoseQualityScore: number;
  exercisePoseToleranceBand: string;
  exerciseTransitionKey: string;
  exerciseTransitionLabel: string;
  feetOwner: string;
  frameIndex: number;
  hipDrop: number;
  leftKneeLift: number;
  lowerBodyTargetCanUsePlayerRetargetLegRaise: boolean;
  lowerBodyTargetInstructorMotion: number;
  lowerBodyTargetPlayerRetargetMotion: number;
  lowerBodyTargetShouldHoldPlayerSquat: boolean;
  lowerBodyTargetStage: string;
  lowerBodyTrackingReady: boolean;
  lowerLabel: string;
  lowerOwner: string;
  rootMotionJumpResponseHeightOffset: number;
  rootMotionJumpResponseOwner: string;
  rootMotionJumpResponseApplied: boolean;
  rootMotionStepResponseApplied: boolean;
  rootMotionStepResponseFootLiftOffset: number;
  rootMotionStepResponseOwner: string;
  rootMotionStepResponseSide: string;
  rightKneeLift: number;
  shouldDrivePlayerLegRaise: boolean;
  shouldDrivePlayerSquat: boolean;
  sourceQuality: number;
  spineSideBend: number;
  squatDepth: number;
  rootHeadingYaw: number;
  rootPathDistance: number;
  rootMotionHeadingDelta: number;
  rootMotionIntentKey: string;
  rootMotionIntentLabel: string;
  rootMotionPlantedFoot: string;
  rootMotionSwingFoot: string;
  rootMotionTravelDirection: string;
  rootMotionTravelDistance: number;
  rootPositionConfidence: number;
  rootSource: string;
  supportConstraintOwner: string;
  supportConstraintStatus: string;
  supportContactAnchorCount: number;
  supportContactOwner: string;
  supportContactStatus: string;
  supportIntentKey: string;
  supportIntentLabel: string;
  supportPresentationApplied: boolean;
  supportPresentationArmSpecCount: number;
  supportPresentationOwner: string;
  supportPresentationSpineSpecCount: number;
  visualRootDrop: number;
};

export type MovementReplayHeadFrame = {
  appliedYaw: number;
  avatarHeadWorldYaw: number;
  avatarRootWorldYaw: number;
  frameIndex: number;
  headOwner: string;
  headRootDivergence: number;
  rawConfidence: number;
  rawSource: string;
  rawYaw: number;
  rootHeadingConfidence: number;
  rootHeadingYaw: number;
  shouldApplyHeadMotion: boolean;
};

export type MovementReplaySourceFrame = {
  blockedReasons: string[];
  cameraHelpEvents: MovementCameraMessageEvent[];
  cameraReasons: string[];
  cameraScore: number;
  cameraState: MovementCameraConfidenceState;
  canStartGame: boolean;
  canStartRecording: boolean;
  capturedAt: number;
  frameIndex: number;
  frameVisibility: number;
  promptEvents: MovementStartPromptEvent[];
  scoreAllowed: boolean;
  sourceOrigin: MovementSourceOrigin;
  sourceStatus: MovementSourceStatus;
  startReadinessState: MovementStartReadinessState;
  visibleBodyParts: MovementCameraBodyPart[];
};

type MovementReplayGameWrapperParitySnapshot = {
  feetOwner: string;
  leftArmFallback: string;
  leftArmReady: boolean;
  lowerBodyTrackingReady: boolean;
  lowerLabel: string;
  lowerOwner: string;
  rightArmFallback: string;
  rightArmReady: boolean;
  shouldApplyLowerBody: boolean;
  shouldDriveLegRaise: boolean;
  shouldDriveSquat: boolean;
  spineOwner: string;
  torsoOwner: string;
};

export type MovementReplayGameWrapperFrame = {
  diffs: string[];
  frameIndex: number;
  replay: MovementReplayGameWrapperParitySnapshot;
  studio: MovementReplayGameWrapperParitySnapshot;
};

export type MovementReplayScoreMessageParityFrame = {
  diffs: string[];
  frameIndex: number;
  gameEventTypes: string[];
  gameNextStreak: number;
  gameSummary: MovementGameplayEventFrameSummary;
  replayEventTypes: string[];
  replayNextStreak: number;
  replaySummary: MovementGameplayEventFrameSummary;
};

export type MovementReplayAnalysis = {
  coverage: {
    entries: MovementCoverageEntry[];
    missingProofs: MovementCoverageMissingProof[];
    summary: MovementCoverageSummary;
  };
  failures: MovementReplayFailure[];
  gamePath: {
    calibrationQuality: number;
    frames: MovementReplayGamePathFrame[];
    gameplayEvents: Array<MovementGameplayEventFrame | undefined>;
    parity: {
      divergenceFrameCount: number;
      firstDivergenceFrame?: number;
      firstScoreMessageDivergenceFrame?: number;
      firstWrapperDivergenceFrame?: number;
      scoreMessageDivergenceFrameCount: number;
      scoreMessageFrameCount: number;
      wrapperDivergenceFrameCount: number;
    };
    retargetSourceQuality: number;
    scoreMessageParityFrames: MovementReplayScoreMessageParityFrame[];
    sourceFrames: MovementReplaySourceFrame[];
    visualProofFrames: MovementGameVisualParityProofFrame[];
    wrapperFrames: MovementReplayGameWrapperFrame[];
  };
  head: {
    frames: MovementReplayHeadFrame[];
  };
  metrics: {
    averageOutOfFrameCount: number;
    averageAvatarLowerBodyDirectionError: number;
    awayBodyFrameCount: number;
    averageHeadRootDivergence: number;
    averageRootHeadingConfidence: number;
    averageRootPositionConfidence: number;
    averageRetargetQuality: number;
    avatarVisualFrameCount: number;
    coverageApproximateCount: number;
    coverageBlockedCount: number;
    coverageDemoReadyCount: number;
    coverageDemoReadyPercent: number;
    coverageDiagnosticOnlyCount: number;
    coverageExplicitStatusCount: number;
    coverageFamilyCount: number;
    coverageImplementedCount: number;
    coverageImplementedPercent: number;
    coverageInternalDemoOnlyCount: number;
    coverageMissingProofCount: number;
    coverageRemainingGapCount: number;
    coverageSupportedCount: number;
    coverageUnsupportedCount: number;
    coverageUserFacingCount: number;
    averageExercisePoseQualityScore: number;
    exerciseFloorRollTransitionCount: number;
    exerciseLungeFrameCount: number;
    exercisePoseDiagnosticFrameCount: number;
    exercisePoseModerateFrameCount: number;
    exercisePoseStrictFrameCount: number;
    exerciseRollingCrawlingFrameCount: number;
    exerciseTransitionCount: number;
    cameraConfidenceLostFrameCount: number;
    cameraConfidencePartialFrameCount: number;
    cameraConfidenceReadyFrameCount: number;
    cameraConfidenceUncertainFrameCount: number;
    cameraHelpEventCount: number;
    cameraScoreAllowedFrameCount: number;
    gameplayClearMovementEventCount: number;
    gameplayScoreDeltaTotal: number;
    gameplayTrackingUncertaintyEventCount: number;
    headAppliedFrameCount: number;
    headPoseFrameCount: number;
    headRootDivergenceFrameCount: number;
    lowerBodyOwnerTransitions: number;
    maxOutOfFrameCount: number;
    maxRootHeadingYaw: number;
    maxRootPathDistance: number;
    maxStandRecoveryHold: number;
    ownerTransitionsPerSecond: number;
    rootMotionSourceLimitedFrameCount: number;
    rootMotionJumpFrameCount: number;
    rootMotionJumpResponseFrameCount: number;
    rootMotionPivotFrameCount: number;
    rootMotionStepResponseFrameCount: number;
    rootMotionStepEventFrameCount: number;
    rootMotionTravelFrameCount: number;
    rootMotionTurnFrameCount: number;
    rootMotionWeightTransferFrameCount: number;
    rootMotionWorldLandmarkFrameCount: number;
    replayGameWrapperDivergenceFrameCount: number;
    replayGameWrapperFrameCount: number;
    replayGameScoreMessageDivergenceFrameCount: number;
    replayGameScoreMessageFrameCount: number;
    startReadinessCaptureBlockedCount: number;
    startReadinessMismatchFrameCount: number;
    startReadinessStoredFrameCount: number;
    startReadinessBlockedFrameCount: number;
    startReadinessCanStartGameFrameCount: number;
    startReadinessReadyFrameCount: number;
    strongFullBodyFrameCount: number;
    supportConstraintActiveFrameCount: number;
    supportConstraintMissingFrameCount: number;
    supportConstraintPartialFrameCount: number;
    supportContactCorrectionFrameCount: number;
    supportPresentationAppliedFrameCount: number;
    supportPresentationUpperBodyFrameCount: number;
    visualMatchScore: number;
    visualMotionCoverage: number;
    visualReliableFrameCount: number;
  };
  pass: boolean;
  sessionId: string;
  summary: MovementDebugReplaySummary;
  rootMotion: {
    frames: MovementRootMotionFrame[];
    sourceLimitedFrameCount: number;
    worldLandmarkFrameCount: number;
  };
};

type MovementReplayCurrentDecision = MovementGamePathDecision;

const STRONG_CONFIDENCE = 0.65;
const AVATAR_LOWER_BODY_DIRECTION_REVIEW_THRESHOLD = 0.52;
const AVATAR_UPPER_BODY_DIRECTION_REVIEW_THRESHOLD = 0.18;
const REPLAY_GAME_PATH_MOTION_REVIEW_THRESHOLD = 0.18;
const ROOT_HEADING_REVIEW_THRESHOLD = 0.65;
const ROOT_PATH_REVIEW_THRESHOLD = 0.16;
const SOURCE_OUT_OF_FRAME_REVIEW_COUNT = 3;
const VISUAL_MATCH_REVIEW_THRESHOLD = 0.85;
const AWAY_BODY_HEADING_REVIEW_THRESHOLD = 0.9;
const HEAD_ROOT_DIVERGENCE_REVIEW_THRESHOLD = 0.58;
const STRONG_RAW_HEAD_YAW_REVIEW_THRESHOLD = 0.45;
const APPLIED_HEAD_NEUTRAL_REVIEW_THRESHOLD = 0.04;

const NEUTRAL_HEAD_MOTION_INTENT: MovementHeadMotionIntent = {
  confidence: 1,
  depth: 0,
  label: "neutral",
  lateral: 0,
  vertical: 0,
};

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function frameConfidence(
  frame: MovementDebugReplayFrame,
  currentDecision: MovementReplayCurrentDecision | undefined,
) {
  return currentDecision?.bodyConfidence ?? frame.bodyConfidence;
}

function minConfidence(
  frame: MovementDebugReplayFrame,
  keys: string[],
  currentDecision?: MovementReplayCurrentDecision,
) {
  const confidence = frameConfidence(frame, currentDecision);
  return Math.min(...keys.map((key) => confidence[key] ?? 0));
}

function averageConfidence(
  frame: MovementDebugReplayFrame,
  keys: string[],
  currentDecision?: MovementReplayCurrentDecision,
) {
  const confidence = frameConfidence(frame, currentDecision);
  return average(keys.map((key) => confidence[key] ?? 0));
}

function lowerOwner(frame: MovementDebugReplayFrame) {
  return extractOwner(frame.fallbacks, "lower");
}

function feetOwner(frame: MovementDebugReplayFrame) {
  return extractOwner(frame.fallbacks, "feet");
}

function isRecordedOnlyOwner(owner: string) {
  const normalized = owner.toLowerCase();
  return normalized === "recorded" || normalized.startsWith("recorded ");
}

function replayLowerMotionMode({
  label,
  owner,
  retarget,
}: {
  label: string;
  owner: string;
  retarget?: MovementDebugReplayFrame["retarget"];
}) {
  const normalized = `${owner} ${label}`.toLowerCase();
  if (owner === "unknown" || isRecordedOnlyOwner(owner)) return null;
  if (normalized.includes("squat")) return "squat";
  if (normalized.includes("leg-raise") || normalized.includes("knee-raise")) return "leg-raise";

  const motion = Math.max(
    retarget?.squatDepth ?? 0,
    retarget?.hipDrop ?? 0,
    retarget?.leftKneeLift ?? 0,
    retarget?.rightKneeLift ?? 0,
  );
  if (motion >= REPLAY_GAME_PATH_MOTION_REVIEW_THRESHOLD) return "retarget-motion";

  return "not-motion";
}

function feetOwnerMode(owner: string) {
  if (owner === "unknown" || isRecordedOnlyOwner(owner)) return null;
  return owner.includes("neutral") ? "neutral" : "retarget";
}

function lowerLabel(frame: MovementDebugReplayFrame) {
  return frame.fallbacks.lowerBody?.split(/\s+/)[0] ?? "unknown";
}

function hasStrongFullBody(
  frame: MovementDebugReplayFrame,
  currentDecision?: MovementReplayCurrentDecision,
) {
  return minConfidence(
    frame,
    ["hips", "leftKnee", "rightKnee", "leftFoot", "rightFoot"],
    currentDecision,
  ) >= STRONG_CONFIDENCE;
}

function hasLegMotion(frame: MovementDebugReplayFrame, currentDecision?: MovementReplayCurrentDecision) {
  const retarget = currentDecision?.retarget ?? frame.retarget;
  return Math.max(
    retarget?.squatDepth ?? 0,
    retarget?.leftKneeLift ?? 0,
    retarget?.rightKneeLift ?? 0,
    retarget?.lowerBodySegmentMotion ?? 0,
    retarget?.hipDrop ?? 0,
  ) >= 0.22;
}

function hasStoredSquat(frame: MovementDebugReplayFrame, currentDecision?: MovementReplayCurrentDecision) {
  const retarget = currentDecision?.retarget ?? frame.retarget;
  const lower = lowerLabel(frame);
  return lower.includes("squat") ||
    (currentDecision?.lowerLabel.includes("squat") ?? false) ||
    (retarget?.squatDepth ?? 0) >= 0.22 ||
    (retarget?.visualRootDrop ?? 0) >= 0.22 ||
    (currentDecision?.lowerOwner ?? lowerOwner(frame)).includes("squat");
}

function hasNeutralSource(frame: MovementDebugReplayFrame, currentDecision?: MovementReplayCurrentDecision) {
  const retarget = currentDecision?.retarget ?? frame.retarget;
  return Math.max(
    retarget?.squatDepth ?? 0,
    retarget?.hipDrop ?? 0,
    retarget?.leftKneeLift ?? 0,
    retarget?.rightKneeLift ?? 0,
  ) < 0.12;
}

function isReliableVisualFrame(
  frame: MovementDebugReplayFrame,
  currentDecision?: MovementReplayCurrentDecision,
) {
  const quality = currentDecision?.retarget.sourceQuality ?? frame.retarget?.sourceQuality ?? 0;
  return hasStrongFullBody(frame, currentDecision) &&
    quality >= 0.55 &&
    (frame.poseBounds?.outOfFrameCount ?? 0) < 4 &&
    (frame.poseBounds?.maxY ?? 0) <= 1.08;
}

function isLowerMotionRepresented({
  currentDecision,
  frame,
}: {
  currentDecision?: MovementReplayCurrentDecision;
  frame: MovementDebugReplayFrame;
}) {
  const owner = currentDecision?.lowerOwner ?? lowerOwner(frame);
  const feet = currentDecision?.feetOwner ?? feetOwner(frame);
  if (owner.includes("neutral")) return false;
  return owner.includes("squat") || owner.includes("retarget") || feet !== "neutral";
}

function transitionCount(values: string[]) {
  return values.reduce((count, value, index) => (
    index > 0 && value !== values[index - 1] ? count + 1 : count
  ), 0);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function angleDistance(left: number, right: number) {
  return Math.abs(normalizeAngle(left - right));
}

function avatarLowerBodyDirectionError(frame: MovementDebugReplayFrame) {
  const compared = frame.avatarVisual?.comparedLowerBodySegments ?? 0;
  const error = frame.avatarVisual?.averageLowerBodyDirectionError;
  if (compared < 4 || typeof error !== "number" || !Number.isFinite(error)) return null;
  return error;
}

function avatarUpperBodyDirectionError(frame: MovementDebugReplayFrame) {
  const compared = frame.avatarVisual?.comparedUpperBodySegments ?? 0;
  const error = frame.avatarVisual?.averageUpperBodyDirectionError;
  if (compared < 3 || typeof error !== "number" || !Number.isFinite(error)) return null;
  return error;
}

function pushFailure(
  failures: MovementReplayFailure[],
  failure: MovementReplayFailure,
) {
  failures.push({
    ...failure,
    semanticCode: failure.semanticCode ?? semanticCodeForReplayFailure(failure),
  });
}

function semanticCodeForReplayFailure(
  failure: MovementReplayFailure,
): MovementReplaySemanticFailureCode | undefined {
  if (failure.code === "avatar_head_not_applied") return "head-motion-missing";
  if (failure.code === "avatar_head_root_diverged") return "head-direction-reversed";
  if (failure.code === "avatar_head_spine_diverged") return "head-direction-reversed";
  if (failure.code === "avatar_output_diverged") return "score-positive-but-avatar-wrong";
  if (failure.code === "avatar_upper_body_diverged") return "side-bend-wrong-direction";
  if (failure.code === "feet_neutral_while_leg_motion_present") return "movement-visible-but-unscored";
  if (failure.code === "false_knee_raise_candidate") return "leg-lift-wrong-side";
  if (failure.code === "replay_game_path_diverged") return "score-positive-but-avatar-wrong";
  if (failure.code === "replay_game_score_message_diverged") return "movement-visible-but-unscored";
  if (failure.code === "replay_game_wrapper_diverged") return "score-positive-but-avatar-wrong";
  if (failure.code === "root_motion_missing") return "root-travel-reversed";
  if (failure.code === "squat_not_detected") return "squat-missing";
  if (failure.code === "stand_recovery_missing") return "squat-collapsed-to-leg-lift";
  return undefined;
}

function getReplayGamePathDivergenceFailure({
  currentDecision,
  frame,
  frameIndex,
}: {
  currentDecision: MovementReplayCurrentDecision | undefined;
  frame: MovementDebugReplayFrame;
  frameIndex: number;
}): MovementReplayFailure | null {
  if (!currentDecision) return null;

  const replayLowerOwner = lowerOwner(frame);
  const replayFeetOwner = feetOwner(frame);
  const replayMode = replayLowerMotionMode({
    label: lowerLabel(frame),
    owner: replayLowerOwner,
    retarget: frame.retarget,
  });
  const gameMode = replayLowerMotionMode({
    label: currentDecision.lowerLabel,
    owner: currentDecision.lowerOwner,
    retarget: currentDecision.retarget,
  });
  if (!replayMode || !gameMode) return null;

  const replaySquatDepth = frame.retarget?.squatDepth;
  const gameSquatDepth = currentDecision.retarget.squatDepth ?? 0;
  const replayHipDrop = frame.retarget?.hipDrop;
  const gameHipDrop = currentDecision.retarget.hipDrop ?? 0;
  const hasMotion = replayMode !== "not-motion" ||
    gameMode !== "not-motion" ||
    (replaySquatDepth ?? 0) >= REPLAY_GAME_PATH_MOTION_REVIEW_THRESHOLD ||
    gameSquatDepth >= REPLAY_GAME_PATH_MOTION_REVIEW_THRESHOLD ||
    (replayHipDrop ?? 0) >= REPLAY_GAME_PATH_MOTION_REVIEW_THRESHOLD ||
    gameHipDrop >= REPLAY_GAME_PATH_MOTION_REVIEW_THRESHOLD;
  if (!hasMotion) return null;

  const reasons: string[] = [];
  if (replayMode !== gameMode) {
    reasons.push(`lower replay "${replayLowerOwner}" (${replayMode}) vs game "${currentDecision.lowerOwner}" (${gameMode})`);
  }

  const replayFeetMode = feetOwnerMode(replayFeetOwner);
  const gameFeetMode = feetOwnerMode(currentDecision.feetOwner);
  if (replayFeetMode && gameFeetMode && replayFeetMode !== gameFeetMode) {
    reasons.push(`feet replay "${replayFeetOwner}" vs game "${currentDecision.feetOwner}"`);
  }

  if (
    typeof replaySquatDepth === "number" &&
    Math.abs(replaySquatDepth - gameSquatDepth) > REPLAY_GAME_PATH_MOTION_REVIEW_THRESHOLD
  ) {
    reasons.push(`squat replay ${replaySquatDepth.toFixed(2)} vs game ${gameSquatDepth.toFixed(2)}`);
  }

  if (
    typeof replayHipDrop === "number" &&
    Math.abs(replayHipDrop - gameHipDrop) > REPLAY_GAME_PATH_MOTION_REVIEW_THRESHOLD
  ) {
    reasons.push(`hip replay ${replayHipDrop.toFixed(2)} vs game ${gameHipDrop.toFixed(2)}`);
  }

  if (reasons.length === 0) return null;

  return {
    code: "replay_game_path_diverged",
    detail: `Frame ${frameIndex} replay output diverges from simulated game path: ${reasons.join("; ")}.`,
    frameIndex,
    severity: "warning",
  };
}

function replayGameWrapperParitySnapshot(
  decision: MovementAvatarPipelineDecision,
): MovementReplayGameWrapperParitySnapshot {
  return {
    feetOwner: decision.feetOwner,
    leftArmFallback: decision.leftArm.unreadyFallback,
    leftArmReady: decision.leftArm.isTrackingReady,
    lowerBodyTrackingReady: decision.lowerBodyTrackingReady,
    lowerLabel: decision.lowerLabel,
    lowerOwner: decision.lowerOwner,
    rightArmFallback: decision.rightArm.unreadyFallback,
    rightArmReady: decision.rightArm.isTrackingReady,
    shouldApplyLowerBody: decision.shouldApplyLowerBody,
    shouldDriveLegRaise: decision.lowerBodyDrive.shouldDrivePlayerLegRaise,
    shouldDriveSquat: decision.lowerBodyDrive.shouldDrivePlayerSquat,
    spineOwner: decision.spineDrive.owner,
    torsoOwner: decision.torsoOwner,
  };
}

function getReplayGameWrapperParityDiffs({
  replay,
  studio,
}: {
  replay: MovementReplayGameWrapperParitySnapshot;
  studio: MovementReplayGameWrapperParitySnapshot;
}) {
  return (Object.keys(replay) as Array<keyof MovementReplayGameWrapperParitySnapshot>)
    .filter((key) => replay[key] !== studio[key])
    .map((key) => `${key}: replay ${String(replay[key])} / game ${String(studio[key])}`);
}

function buildReplayGameWrapperFrames({
  session,
  simulation,
}: {
  session: MovementDebugReplaySession;
  simulation: ReturnType<typeof buildMovementGamePathSimulation>;
}): MovementReplayGameWrapperFrame[] {
  if (!simulation.calibration) return [];

  return session.samples.flatMap((frame, frameIndex) => {
    if (frame.tracking.pose.length < 33) return [];

    const source = {
      poseLandmarks: frame.tracking.pose,
    };
    const replayDecision = resolveMovementAvatarReplayDecision({
      avatarRole: "player",
      calibration: simulation.calibration,
      retargetSourceModel: simulation.retargetSourceModel,
      source,
    });
    const studioDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration: simulation.calibration,
      retargetSourceModel: simulation.retargetSourceModel,
      source,
    });
    const replay = replayGameWrapperParitySnapshot(replayDecision);
    const studio = replayGameWrapperParitySnapshot(studioDecision);

    return [{
      diffs: getReplayGameWrapperParityDiffs({ replay, studio }),
      frameIndex,
      replay,
      studio,
    }];
  });
}

function getReplayGameWrapperFailures(wrapperFrames: MovementReplayGameWrapperFrame[]) {
  return wrapperFrames
    .filter((frame) => frame.diffs.length > 0)
    .map((frame): MovementReplayFailure => ({
      code: "replay_game_wrapper_diverged",
      detail: `Frame ${frame.frameIndex} replay wrapper diverges from game wrapper: ${frame.diffs.join("; ")}.`,
      frameIndex: frame.frameIndex,
      severity: "error",
    }));
}

function eventTypes(frame: MovementGameplayEventFrame | undefined) {
  return frame?.events.map((event) => event.eventType) ?? [];
}

function diffArray({
  key,
  left,
  right,
}: {
  key: string;
  left: string[];
  right: string[];
}) {
  return JSON.stringify(left) === JSON.stringify(right)
    ? []
    : [`${key}: replay ${left.join(",") || "none"} / game ${right.join(",") || "none"}`];
}

function buildReplayGameScoreMessageParityFrames(
  simulation: ReturnType<typeof buildMovementGamePathSimulation>,
): MovementReplayScoreMessageParityFrame[] {
  let gameStreak = 0;

  return simulation.motionFrames.flatMap((motionFrame, frameIndex) => {
    if (!motionFrame) {
      gameStreak = 0;
      return [];
    }

    const gameScoring = resolveMovementMatchScoringGameplaySummary({
      playerMotionFrame: motionFrame,
      previousPlayerMotionFrame: simulation.motionFrames[frameIndex - 1] ?? null,
      streak: gameStreak,
    });
    gameStreak = gameScoring.gameplayEventFrame.nextStreak;

    const replayFrame = simulation.gameplayEvents[frameIndex];
    const replaySummary = resolveMovementGameplayEventFrameSummary(replayFrame);
    const replayEventTypes = eventTypes(replayFrame);
    const gameEventTypes = eventTypes(gameScoring.gameplayEventFrame);
    const gameSummary = gameScoring.gameplaySummary;
    const diffs = [
      ...diffArray({
        key: "eventTypes",
        left: replayEventTypes,
        right: gameEventTypes,
      }),
      replaySummary.scoreDeltaTotal === gameSummary.scoreDeltaTotal
        ? null
        : `scoreDeltaTotal: replay ${replaySummary.scoreDeltaTotal} / game ${gameSummary.scoreDeltaTotal}`,
      replaySummary.feedbackMessage === gameSummary.feedbackMessage
        ? null
        : `feedbackMessage: replay ${replaySummary.feedbackMessage ?? "none"} / game ${gameSummary.feedbackMessage ?? "none"}`,
      (replayFrame?.nextStreak ?? 0) === gameScoring.gameplayEventFrame.nextStreak
        ? null
        : `nextStreak: replay ${replayFrame?.nextStreak ?? 0} / game ${gameScoring.gameplayEventFrame.nextStreak}`,
      (replayFrame?.scoreAllowed ?? false) === gameScoring.gameplayEventFrame.scoreAllowed
        ? null
        : `scoreAllowed: replay ${String(replayFrame?.scoreAllowed ?? false)} / game ${String(gameScoring.gameplayEventFrame.scoreAllowed)}`,
    ].filter((diff): diff is string => Boolean(diff));

    return [{
      diffs,
      frameIndex,
      gameEventTypes,
      gameNextStreak: gameScoring.gameplayEventFrame.nextStreak,
      gameSummary,
      replayEventTypes,
      replayNextStreak: replayFrame?.nextStreak ?? 0,
      replaySummary,
    }];
  });
}

function getReplayGameScoreMessageFailures(scoreMessageFrames: MovementReplayScoreMessageParityFrame[]) {
  return scoreMessageFrames
    .filter((frame) => frame.diffs.length > 0)
    .map((frame): MovementReplayFailure => ({
      code: "replay_game_score_message_diverged",
      detail: `Frame ${frame.frameIndex} replay score/message events diverge from Game scoring helper: ${frame.diffs.join("; ")}.`,
      frameIndex: frame.frameIndex,
      severity: "error",
    }));
}

function getSupportConstraintFailures(
  decisions: Array<MovementReplayCurrentDecision | undefined>,
) {
  const partialFrames = decisions.filter((decision) => (
    decision?.supportConstraint.status === "partial-root-only" ||
    decision?.supportConstraint.status === "partial-contact-correction"
  ));
  const missingFrames = decisions.filter((decision) => (
    decision?.supportConstraint.status === "missing"
  ));
  const failures: MovementReplayFailure[] = [];

  if (missingFrames.length > 0) {
    failures.push({
      code: "support_constraint_missing",
      detail: `${missingFrames.length} frame${missingFrames.length === 1 ? "" : "s"} have no usable support constraint intent.`,
      frameIndex: missingFrames[0]?.rootMotion.frameIndex,
      severity: "warning",
    });
  }

  if (partialFrames.length > 0) {
    const missingLayers = Array.from(new Set(
      partialFrames.flatMap((decision) => decision?.supportConstraint.missingLayers ?? []),
    )).sort();

    failures.push({
      code: "support_constraint_partial",
      detail: `${partialFrames.length} frame${partialFrames.length === 1 ? "" : "s"} use partial support correction; missing ${missingLayers.join(", ")}.`,
      frameIndex: partialFrames[0]?.rootMotion.frameIndex,
      severity: "warning",
    });
  }

  return failures;
}

function isStartReadinessBlocked(readiness: MovementStartReadiness) {
  return !readiness.canStartGame || !readiness.canStartRecording || readiness.state !== "ready";
}

function getStartReadinessAudit({
  frames,
  session,
  sourceFrames,
}: {
  frames: MovementDebugReplayFrame[];
  session: MovementDebugReplaySession;
  sourceFrames: MovementReplaySourceFrame[];
}) {
  const failures: MovementReplayFailure[] = [];
  let blockedCaptureCount = 0;
  let mismatchFrameCount = 0;
  let storedFrameCount = 0;

  if (session.captureStartReadiness && isStartReadinessBlocked(session.captureStartReadiness)) {
    blockedCaptureCount = 1;
    failures.push({
      code: "start_readiness_blocked_at_capture",
      detail: `Session started with readiness "${session.captureStartReadiness.state}" (${session.captureStartReadiness.blockedReasons.join(", ") || "no reason"}).`,
      severity: "error",
    });
  }

  frames.forEach((frame, frameIndex) => {
    if (!frame.startReadiness) return;
    storedFrameCount += 1;
    const replayFrame = sourceFrames.find((sourceFrame) => sourceFrame.frameIndex === frameIndex);
    if (!replayFrame) return;
    const mismatched =
      frame.startReadiness.state !== replayFrame.startReadinessState ||
      frame.startReadiness.canStartGame !== replayFrame.canStartGame ||
      frame.startReadiness.canStartRecording !== replayFrame.canStartRecording;

    if (!mismatched) return;
    mismatchFrameCount += 1;
    failures.push({
      code: "start_readiness_replay_mismatch",
      detail: `Frame ${frameIndex} stored readiness "${frame.startReadiness.state}" but replay recomputed "${replayFrame.startReadinessState}".`,
      frameIndex,
      severity: "warning",
    });
  });

  return {
    blockedCaptureCount,
    failures,
    mismatchFrameCount,
    storedFrameCount,
  };
}

function isCompressibleSourceWarning(failure: MovementReplayFailure) {
  return failure.severity === "warning" && (
    failure.code === "source_feet_weak" ||
    failure.code === "source_lower_body_out_of_frame"
  );
}

function sourceWarningLabel(code: MovementReplayFailureCode) {
  if (code === "source_feet_weak") return "source feet are weak";
  if (code === "source_lower_body_out_of_frame") return "source lower body is out of frame";
  return code;
}

function compressReplayFailures(failures: MovementReplayFailure[]) {
  const compressed: MovementReplayFailure[] = [];
  const sourceWarnings = failures
    .filter((failure) => isCompressibleSourceWarning(failure) && typeof failure.frameIndex === "number")
    .sort((left, right) => (
      left.code.localeCompare(right.code) ||
      (left.frameIndex ?? 0) - (right.frameIndex ?? 0)
    ));
  const consumed = new Set<MovementReplayFailure>();

  for (let index = 0; index < sourceWarnings.length; index += 1) {
    const first = sourceWarnings[index];
    if (!first || consumed.has(first) || typeof first.frameIndex !== "number") continue;

    const range = [first];
    consumed.add(first);
    let endFrame = first.frameIndex;

    for (let nextIndex = index + 1; nextIndex < sourceWarnings.length; nextIndex += 1) {
      const next = sourceWarnings[nextIndex];
      if (!next || next.code !== first.code || typeof next.frameIndex !== "number") continue;
      if (next.frameIndex !== endFrame + 1) break;
      range.push(next);
      consumed.add(next);
      endFrame = next.frameIndex;
    }

    const startFrame = first.frameIndex;
    const frameLabel = startFrame === endFrame
      ? `Frame ${startFrame}`
      : `Frames ${startFrame}-${endFrame}`;
    compressed.push({
      code: first.code,
      detail: `${frameLabel}: ${sourceWarningLabel(first.code)} across ${range.length} frame${range.length === 1 ? "" : "s"}.`,
      frameIndex: startFrame,
      severity: "warning",
    });
  }

  failures.forEach((failure) => {
    if (
      isCompressibleSourceWarning(failure) &&
      typeof failure.frameIndex === "number" &&
      consumed.has(failure)
    ) {
      return;
    }

    compressed.push(failure);
  });

  return compressed.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "error" ? -1 : 1;
    if (typeof left.frameIndex === "number" && typeof right.frameIndex === "number") {
      return left.frameIndex - right.frameIndex;
    }
    if (typeof left.frameIndex === "number") return -1;
    if (typeof right.frameIndex === "number") return 1;
    return left.code.localeCompare(right.code);
  });
}

function toGamePathFrames(
  decisions: Array<MovementReplayCurrentDecision | undefined>,
): MovementReplayGamePathFrame[] {
  return decisions.flatMap((decision, frameIndex) => {
    if (!decision) return [];
    const jumpResponse = resolveMovementRootMotionJumpResponse(decision.rootMotion.intent);
    const stepResponse = resolveMovementRootMotionStepResponse(decision.rootMotion.intent);

    return [{
      exercisePoseKey: decision.exercisePose.poseKey,
      exercisePoseLabel: decision.exercisePose.label,
      exercisePoseQualityScore: decision.exercisePose.qualityScore,
      exercisePoseToleranceBand: decision.exercisePose.toleranceBand,
      exerciseTransitionKey: decision.exerciseTransition.key,
      exerciseTransitionLabel: decision.exerciseTransition.label,
      feetOwner: decision.feetOwner,
      frameIndex,
      hipDrop: decision.retarget.hipDrop ?? 0,
      leftKneeLift: decision.retarget.leftKneeLift ?? 0,
      lowerBodyTargetCanUsePlayerRetargetLegRaise:
        decision.lowerBodyTarget.stageDecision?.canUsePlayerRetargetLegRaise ?? false,
      lowerBodyTargetInstructorMotion: decision.lowerBodyTarget.instructorLowerBodyMotion,
      lowerBodyTargetPlayerRetargetMotion: decision.lowerBodyTarget.playerSourceOwner.playerRetargetLowerBodyMotion,
      lowerBodyTargetShouldHoldPlayerSquat: decision.lowerBodyTarget.shouldHoldPlayerSquatPose,
      lowerBodyTargetStage: decision.lowerBodyTarget.stageDecision?.stage ?? "inactive",
      lowerBodyTrackingReady: decision.lowerBodyTrackingReady,
      lowerLabel: decision.lowerLabel,
      lowerOwner: decision.lowerOwner,
      rootMotionJumpResponseHeightOffset: jumpResponse.heightOffset,
      rootMotionJumpResponseOwner: jumpResponse.owner,
      rootMotionJumpResponseApplied: jumpResponse.shouldApply,
      rootMotionStepResponseApplied: stepResponse.shouldApply,
      rootMotionStepResponseFootLiftOffset: stepResponse.footLiftOffset,
      rootMotionStepResponseOwner: stepResponse.owner,
      rootMotionStepResponseSide: stepResponse.side ?? "none",
      rightKneeLift: decision.retarget.rightKneeLift ?? 0,
      shouldDrivePlayerLegRaise: decision.lowerBodyDrive.shouldDrivePlayerLegRaise,
      shouldDrivePlayerSquat: decision.lowerBodyDrive.shouldDrivePlayerSquat,
      sourceQuality: decision.retarget.sourceQuality ?? 0,
      spineSideBend: decision.spineDrive.sideBend,
      squatDepth: decision.retarget.squatDepth ?? 0,
      rootHeadingYaw: decision.rootMotion.headingYaw,
      rootPathDistance: Math.hypot(
        decision.rootMotion.rootPosition.x,
        decision.rootMotion.rootPosition.z,
      ),
      rootMotionHeadingDelta: decision.rootMotion.intent.headingDelta,
      rootMotionIntentKey: decision.rootMotion.intent.key,
      rootMotionIntentLabel: decision.rootMotion.intent.label,
      rootMotionPlantedFoot: decision.rootMotion.intent.plantedFoot,
      rootMotionSwingFoot: decision.rootMotion.intent.swingFoot,
      rootMotionTravelDirection: decision.rootMotion.intent.travelDirection,
      rootMotionTravelDistance: decision.rootMotion.intent.travelDistance,
      rootPositionConfidence: decision.rootMotion.rootPositionConfidence,
      rootSource: decision.rootMotion.debug.source,
      supportConstraintOwner: decision.supportConstraint.owner,
      supportConstraintStatus: decision.supportConstraint.status,
      supportContactAnchorCount: decision.supportContactLocks.anchors.length,
      supportContactOwner: decision.supportContactLocks.owner,
      supportContactStatus: decision.supportContactLocks.status,
      supportIntentKey: decision.supportIntent.key,
      supportIntentLabel: decision.supportIntent.label,
      supportPresentationApplied: decision.supportPresentation.shouldApply,
      supportPresentationArmSpecCount: decision.supportPresentation.armSpecs.length,
      supportPresentationOwner: decision.supportPresentation.owner,
      supportPresentationSpineSpecCount: decision.supportPresentation.spineSpecs.length,
      visualRootDrop: decision.lowerBodyDrive.visualRootDrop,
    }];
  });
}

function toReplaySourceFrames(
  sourceFrames: Array<MovementSourceFrame | null>,
): MovementReplaySourceFrame[] {
  return sourceFrames.flatMap((sourceFrame, frameIndex) => {
    if (!sourceFrame) return [];

    return [{
      blockedReasons: sourceFrame.startReadiness.blockedReasons,
      cameraHelpEvents: sourceFrame.cameraConfidence.messageEvents,
      cameraReasons: sourceFrame.cameraConfidence.reasons,
      cameraScore: sourceFrame.cameraConfidence.score,
      cameraState: sourceFrame.cameraConfidence.state,
      canStartGame: sourceFrame.startReadiness.canStartGame,
      canStartRecording: sourceFrame.startReadiness.canStartRecording,
      capturedAt: sourceFrame.capturedAt,
      frameIndex,
      frameVisibility: sourceFrame.cameraConfidence.frameVisibility,
      promptEvents: sourceFrame.startReadiness.promptEvents,
      scoreAllowed: sourceFrame.cameraConfidence.scoreAllowed,
      sourceOrigin: sourceFrame.sourceOrigin,
      sourceStatus: sourceFrame.sourceStatus,
      startReadinessState: sourceFrame.startReadiness.state,
      visibleBodyParts: sourceFrame.startReadiness.visibleBodyParts,
    }];
  });
}

function buildReplayHeadFrames(
  frames: MovementDebugReplayFrame[],
  decisions: Array<MovementReplayCurrentDecision | undefined>,
): MovementReplayHeadFrame[] {
  return decisions.flatMap((decision, frameIndex) => {
    if (!decision) return [];
    const frame = frames[frameIndex];
    if (!frame || frame.tracking.pose.length < 9) return [];

    const avatarRootWorldYaw = normalizeAngle(Math.PI + decision.rootMotion.headingYaw);
    const headTarget = resolveMovementAvatarHeadTarget({
      avatarRole: "instructor",
      avatarRootYaw: avatarRootWorldYaw,
      calibration: null,
      headMotionIntent: NEUTRAL_HEAD_MOTION_INTENT,
      poseLandmarks: frame.tracking.pose,
      shouldApplyLowerBody: decision.shouldApplyLowerBody,
      shouldApplySpine: decision.spineDrive.shouldApplySpine,
    });
    const headDecision = headTarget.headDecision;
    const rawHead = headTarget.rawHeadDecision.rawHead;
    const avatarHeadWorldYaw = normalizeAngle(headTarget.headWorldYaw);
    const headRootDivergence = angleDistance(avatarHeadWorldYaw, avatarRootWorldYaw);

    return [{
      appliedYaw: headDecision.appliedHead.yaw,
      avatarHeadWorldYaw,
      avatarRootWorldYaw,
      frameIndex,
      headOwner: headDecision.headOwner,
      headRootDivergence,
      rawConfidence: rawHead.confidence,
      rawSource: rawHead.source,
      rawYaw: rawHead.yaw,
      rootHeadingConfidence: decision.rootMotion.headingConfidence,
      rootHeadingYaw: decision.rootMotion.headingYaw,
      shouldApplyHeadMotion: headDecision.shouldApplyHeadMotion,
    }];
  });
}

function getHeadRootFailures(headFrames: MovementReplayHeadFrame[]) {
  const failures: MovementReplayFailure[] = [];

  headFrames.forEach((headFrame) => {
    if (
      Math.abs(headFrame.rootHeadingYaw) >= AWAY_BODY_HEADING_REVIEW_THRESHOLD &&
      headFrame.rootHeadingConfidence >= 0.45 &&
      headFrame.headRootDivergence > HEAD_ROOT_DIVERGENCE_REVIEW_THRESHOLD
    ) {
      failures.push({
        code: "avatar_head_root_diverged",
        detail: `Frame ${headFrame.frameIndex} body/root is turned ${(headFrame.rootHeadingYaw * 180 / Math.PI).toFixed(0)}deg but avatar head differs by ${(headFrame.headRootDivergence * 180 / Math.PI).toFixed(0)}deg.`,
        frameIndex: headFrame.frameIndex,
        severity: "error",
      });
    }

    if (
      headFrame.rawSource !== "none" &&
      headFrame.rawConfidence >= 0.75 &&
      Math.abs(headFrame.rawYaw) >= STRONG_RAW_HEAD_YAW_REVIEW_THRESHOLD &&
      (!headFrame.shouldApplyHeadMotion || Math.abs(headFrame.appliedYaw) <= APPLIED_HEAD_NEUTRAL_REVIEW_THRESHOLD)
    ) {
      failures.push({
        code: "avatar_head_not_applied",
        detail: `Frame ${headFrame.frameIndex} saved ${headFrame.rawSource} head yaw is ${(headFrame.rawYaw * 180 / Math.PI).toFixed(0)}deg but applied yaw is ${(headFrame.appliedYaw * 180 / Math.PI).toFixed(0)}deg (${headFrame.headOwner}).`,
        frameIndex: headFrame.frameIndex,
        severity: "error",
      });
    }
  });

  return failures;
}

function getRootMotionFailures({
  rootMotionFrames,
  session,
}: {
  rootMotionFrames: MovementRootMotionFrame[];
  session: MovementDebugReplaySession;
}) {
  const failures: MovementReplayFailure[] = [];
  const framesWithPose = session.samples.filter((frame) => frame.tracking.pose.length >= 33).length;
  const framesWithWorld = session.samples.filter((frame) => frame.tracking.worldPose.length >= 33).length;
  const maxYaw = rootMotionFrames.reduce((max, frame) => Math.max(max, Math.abs(frame.headingYaw)), 0);
  const maxPath = rootMotionFrames.reduce((max, frame) => (
    Math.max(max, Math.hypot(frame.rootPosition.x, frame.rootPosition.z))
  ), 0);
  const firstWeakHeading = rootMotionFrames.find((frame) => (
    frame.debug.source !== "unavailable" && frame.headingConfidence < 0.3
  ));

  if (framesWithPose > 0 && framesWithWorld === 0) {
    failures.push({
      code: "world_landmarks_missing",
      detail: "Saved movement has pose landmarks but no world landmarks, so physical X/Z path proof is source-limited.",
      severity: "warning",
    });
  }

  if (framesWithPose > 0 && rootMotionFrames.length === 0) {
    failures.push({
      code: "root_motion_missing",
      detail: "Saved movement has pose landmarks but no root-motion frames were produced.",
      severity: "warning",
    });
  }

  if (firstWeakHeading) {
    failures.push({
      code: "heading_unavailable",
      detail: `Frame ${firstWeakHeading.frameIndex} has weak body-heading evidence (${firstWeakHeading.headingConfidence.toFixed(2)}).`,
      frameIndex: firstWeakHeading.frameIndex,
      severity: "warning",
    });
  }

  if (maxYaw >= ROOT_HEADING_REVIEW_THRESHOLD) {
    const firstTurnFrame = rootMotionFrames.find((frame) => Math.abs(frame.headingYaw) >= ROOT_HEADING_REVIEW_THRESHOLD);
    failures.push({
      code: "root_turn_detected",
      detail: `Saved points show body heading changed by ${(maxYaw * 180 / Math.PI).toFixed(0)} degrees; verify the avatar root yaw follows this turn in replay capture.`,
      frameIndex: firstTurnFrame?.frameIndex,
      severity: "warning",
    });
  }

  if (maxPath >= ROOT_PATH_REVIEW_THRESHOLD) {
    const firstPathFrame = rootMotionFrames.find((frame) => (
      Math.hypot(frame.rootPosition.x, frame.rootPosition.z) >= ROOT_PATH_REVIEW_THRESHOLD
    ));
    failures.push({
      code: "root_path_detected",
      detail: `Saved world points show ${maxPath.toFixed(2)}m equivalent X/Z root travel; verify the avatar root path follows this travel in replay capture.`,
      frameIndex: firstPathFrame?.frameIndex,
      severity: "warning",
    });
  }

  return failures;
}

export function analyzeMovementDebugReplaySession(
  session: MovementDebugReplaySession,
): MovementReplayAnalysis {
  const failures: MovementReplayFailure[] = [];
  const frames = session.samples;
  const gamePathSimulation = buildMovementGamePathSimulation(session);
  const currentDecisions = gamePathSimulation.decisions;
  const rootMotionAnalysis = gamePathSimulation.rootMotion;
  const headFrames = buildReplayHeadFrames(frames, currentDecisions);
  const wrapperFrames = buildReplayGameWrapperFrames({
    session,
    simulation: gamePathSimulation,
  });
  const scoreMessageParityFrames = buildReplayGameScoreMessageParityFrames(gamePathSimulation);
  const gameVisualProofFrames = selectMovementGameVisualParityProofFrames(gamePathSimulation);
  const outOfFrameCounts = frames.map((frame) => frame.poseBounds?.outOfFrameCount ?? 0);
  const retargetQualities = frames
    .map((frame, index) => currentDecisions[index]?.retarget.sourceQuality ?? frame.retarget?.sourceQuality)
    .filter((quality): quality is number => typeof quality === "number");
  const exercisePoseQualityScores = currentDecisions
    .map((decision) => decision?.exercisePose.qualityScore)
    .filter((score): score is number => typeof score === "number");
  const lowerOwners = frames.map((frame, index) => currentDecisions[index]?.lowerOwner ?? lowerOwner(frame));
  const lowerBodyOwnerTransitions = transitionCount(lowerOwners);
  const exerciseTransitionCount = currentDecisions.filter((decision) => (
    decision?.exerciseTransition.isTransition
  )).length;
  const exercisePoseStrictFrameCount = currentDecisions.filter((decision) => (
    decision?.exercisePose.toleranceBand === "strict"
  )).length;
  const exercisePoseModerateFrameCount = currentDecisions.filter((decision) => (
    decision?.exercisePose.toleranceBand === "moderate"
  )).length;
  const exercisePoseDiagnosticFrameCount = currentDecisions.filter((decision) => (
    decision?.exercisePose.toleranceBand === "diagnostic"
  )).length;
  const exerciseFloorRollTransitionCount = currentDecisions.filter((decision) => (
    decision?.exerciseTransition.key === "floor-roll"
  )).length;
  const exerciseLungeFrameCount = currentDecisions.filter((decision) => (
    decision?.exercisePose.coverageFamilies.includes("lunges")
  )).length;
  const exerciseRollingCrawlingFrameCount = currentDecisions.filter((decision) => (
    decision?.exercisePose.coverageFamilies.includes("rolling-crawling") ||
    decision?.exerciseTransition.key === "floor-roll"
  )).length;
  const sourceFrames = toReplaySourceFrames(gamePathSimulation.sourceFrames);
  const startReadinessAudit = getStartReadinessAudit({
    frames,
    session,
    sourceFrames,
  });
  const cameraConfidenceReadyFrameCount = sourceFrames.filter((frame) => frame.cameraState === "ready").length;
  const cameraConfidencePartialFrameCount = sourceFrames.filter((frame) => frame.cameraState === "partial").length;
  const cameraConfidenceUncertainFrameCount = sourceFrames.filter((frame) => frame.cameraState === "uncertain").length;
  const cameraConfidenceLostFrameCount = sourceFrames.filter((frame) => frame.cameraState === "lost").length;
  const cameraScoreAllowedFrameCount = sourceFrames.filter((frame) => frame.scoreAllowed).length;
  const cameraHelpEventCount = sourceFrames.reduce((count, frame) => count + frame.cameraHelpEvents.length, 0);
  const startReadinessReadyFrameCount = sourceFrames.filter((frame) => frame.startReadinessState === "ready").length;
  const startReadinessBlockedFrameCount = sourceFrames.filter((frame) => frame.startReadinessState === "blocked").length;
  const startReadinessCanStartGameFrameCount = sourceFrames.filter((frame) => frame.canStartGame).length;
  const gameplayEvents = gamePathSimulation.gameplayEvents;
  const gameplayClearMovementEventCount = gameplayEvents.reduce((count, frame) => (
    count + (frame?.events.filter((event) => event.eventType === "clear-movement-match").length ?? 0)
  ), 0);
  const gameplayTrackingUncertaintyEventCount = gameplayEvents.reduce((count, frame) => (
    count + (frame?.events.filter((event) => event.eventType === "tracking-uncertainty").length ?? 0)
  ), 0);
  const gameplayScoreDeltaTotal = gameplayEvents.reduce((total, frame) => (
    total + resolveMovementGameplayEventFrameSummary(frame).scoreDeltaTotal
  ), 0);
  const rootMotionTravelFrameCount = currentDecisions.filter((decision) => (
    decision?.rootMotion.intent.key === "root-travel" ||
    decision?.rootMotion.intent.key === "turn-and-travel"
  )).length;
  const rootMotionTurnFrameCount = currentDecisions.filter((decision) => (
    decision?.rootMotion.intent.key === "turn-on-spot" ||
    decision?.rootMotion.intent.key === "turn-and-travel" ||
    decision?.rootMotion.intent.key === "left-foot-pivot" ||
    decision?.rootMotion.intent.key === "right-foot-pivot"
  )).length;
  const rootMotionPivotFrameCount = currentDecisions.filter((decision) => (
    decision?.rootMotion.intent.key === "left-foot-pivot" ||
    decision?.rootMotion.intent.key === "right-foot-pivot"
  )).length;
  const rootMotionJumpFrameCount = currentDecisions.filter((decision) => (
    decision?.rootMotion.intent.key === "jump-flight" ||
    decision?.rootMotion.intent.key === "jump-landing"
  )).length;
  const rootMotionJumpResponseFrameCount = currentDecisions.filter((decision) => (
    decision ? resolveMovementRootMotionJumpResponse(decision.rootMotion.intent).shouldApply : false
  )).length;
  const rootMotionStepEventFrameCount = currentDecisions.filter((decision) => (
    decision?.rootMotion.intent.key === "left-foot-release" ||
    decision?.rootMotion.intent.key === "right-foot-release" ||
    decision?.rootMotion.intent.key === "left-foot-landing" ||
    decision?.rootMotion.intent.key === "right-foot-landing"
  )).length;
  const rootMotionStepResponseFrameCount = currentDecisions.filter((decision) => (
    decision ? resolveMovementRootMotionStepResponse(decision.rootMotion.intent).shouldApply : false
  )).length;
  const rootMotionWeightTransferFrameCount = currentDecisions.filter((decision) => (
    decision?.rootMotion.intent.key === "weight-transfer"
  )).length;
  const supportConstraintActiveFrameCount = currentDecisions.filter((decision) => (
    decision?.supportConstraint.status === "active"
  )).length;
  const supportConstraintMissingFrameCount = currentDecisions.filter((decision) => (
    decision?.supportConstraint.status === "missing"
  )).length;
  const supportConstraintPartialFrameCount = currentDecisions.filter((decision) => (
    decision?.supportConstraint.status === "partial-root-only" ||
    decision?.supportConstraint.status === "partial-contact-correction"
  )).length;
  const supportContactCorrectionFrameCount = currentDecisions.filter((decision) => (
    decision?.supportContactLocks.shouldApply
  )).length;
  const supportPresentationAppliedFrameCount = currentDecisions.filter((decision) => (
    decision?.supportPresentation.shouldApply
  )).length;
  const supportPresentationUpperBodyFrameCount = currentDecisions.filter((decision) => (
    (decision?.supportPresentation.armSpecs.length ?? 0) > 0 ||
    (decision?.supportPresentation.spineSpecs.length ?? 0) > 0
  )).length;
  const durationSeconds = Math.max(session.durationMs / 1000, 0.001);
  const strongFullBodyFrameCount = frames.filter((frame, index) => (
    hasStrongFullBody(frame, currentDecisions[index])
  )).length;
  const visualReliableFrameCount = frames.filter((frame, index) => (
    isReliableVisualFrame(frame, currentDecisions[index])
  )).length;
  const lowerMotionFrames = frames
    .map((frame, index) => ({ currentDecision: currentDecisions[index], frame }))
    .filter(({ currentDecision, frame }) => hasLegMotion(frame, currentDecision));
  const representedLowerMotionFrameCount = lowerMotionFrames.filter(isLowerMotionRepresented).length;
  const visualMotionCoverage = lowerMotionFrames.length === 0
    ? 1
    : representedLowerMotionFrameCount / lowerMotionFrames.length;
  const reliableFrameRatio = frames.length === 0 ? 0 : visualReliableFrameCount / frames.length;
  const ownerStabilityScore = clamp(1 - (lowerBodyOwnerTransitions / durationSeconds) / 1.25);
  const avatarDirectionErrors = frames
    .map(avatarLowerBodyDirectionError)
    .filter((error): error is number => typeof error === "number");
  const averageAvatarLowerBodyDirectionError = average(avatarDirectionErrors);
  const avatarOutputScore = avatarDirectionErrors.length === 0
    ? null
    : clamp(1 - averageAvatarLowerBodyDirectionError / 0.75);
  const heuristicVisualMatchScore = clamp(
    reliableFrameRatio * 0.38 +
    average(retargetQualities) * 0.26 +
    visualMotionCoverage * 0.26 +
    ownerStabilityScore * 0.1,
  );
  const visualMatchScore = avatarOutputScore === null
    ? heuristicVisualMatchScore
    : clamp(heuristicVisualMatchScore * 0.7 + avatarOutputScore * 0.3);
  const awayBodyFrameCount = headFrames.filter((frame) => (
    Math.abs(frame.rootHeadingYaw) >= AWAY_BODY_HEADING_REVIEW_THRESHOLD &&
    frame.rootHeadingConfidence >= 0.45
  )).length;
  const headAppliedFrameCount = headFrames.filter((frame) => frame.shouldApplyHeadMotion).length;
  const headPoseFrameCount = headFrames.filter((frame) => frame.rawSource !== "none").length;
  const headRootDivergenceFrameCount = headFrames.filter((frame) => (
    frame.headRootDivergence > HEAD_ROOT_DIVERGENCE_REVIEW_THRESHOLD
  )).length;

  getRootMotionFailures({
    rootMotionFrames: rootMotionAnalysis.frames,
    session,
  }).forEach((failure) => pushFailure(failures, failure));
  getHeadRootFailures(headFrames).forEach((failure) => pushFailure(failures, failure));
  getReplayGameWrapperFailures(wrapperFrames).forEach((failure) => pushFailure(failures, failure));
  getReplayGameScoreMessageFailures(scoreMessageParityFrames).forEach((failure) => pushFailure(failures, failure));
  getSupportConstraintFailures(currentDecisions).forEach((failure) => pushFailure(failures, failure));
  startReadinessAudit.failures.forEach((failure) => pushFailure(failures, failure));

  frames.forEach((frame, index) => {
    const currentDecision = currentDecisions[index];
    const retarget = currentDecision?.retarget ?? frame.retarget;
    const footConfidence = averageConfidence(frame, ["leftFoot", "rightFoot"], currentDecision);
    const kneeConfidence = averageConfidence(frame, ["leftKnee", "rightKnee"], currentDecision);
    const owner = currentDecision?.lowerOwner ?? lowerOwner(frame);
    const feet = currentDecision?.feetOwner ?? feetOwner(frame);
    const label = currentDecision?.lowerLabel ?? lowerLabel(frame);
    const avatarDirectionError = avatarLowerBodyDirectionError(frame);
    const avatarUpperBodyError = avatarUpperBodyDirectionError(frame);
    const replayGamePathDivergence = getReplayGamePathDivergenceFailure({
      currentDecision,
      frame,
      frameIndex: index,
    });

    if (replayGamePathDivergence) {
      pushFailure(failures, replayGamePathDivergence);
    }

    if (
      (frame.poseBounds?.outOfFrameCount ?? 0) >= SOURCE_OUT_OF_FRAME_REVIEW_COUNT ||
      (frame.poseBounds?.maxY ?? 0) > 1.08
    ) {
      pushFailure(failures, {
        code: "source_lower_body_out_of_frame",
        detail: `Frame ${index} has ${frame.poseBounds?.outOfFrameCount ?? 0} landmarks out of frame.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if (footConfidence < 0.35 && kneeConfidence >= 0.45) {
      pushFailure(failures, {
        code: "source_feet_weak",
        detail: `Frame ${index} has knee confidence ${kneeConfidence.toFixed(2)} but foot confidence ${footConfidence.toFixed(2)}.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if ((retarget?.sourceQuality ?? 1) < 0.45) {
      pushFailure(failures, {
        code: "retarget_quality_drop",
        detail: `Frame ${index} retarget quality is ${(retarget?.sourceQuality ?? 0).toFixed(2)}.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if (
      avatarDirectionError !== null &&
      avatarDirectionError > AVATAR_LOWER_BODY_DIRECTION_REVIEW_THRESHOLD
    ) {
      pushFailure(failures, {
        code: "avatar_output_diverged",
        detail: `Frame ${index} avatar lower-body direction error is ${avatarDirectionError.toFixed(2)}.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if (
      avatarUpperBodyError !== null &&
      avatarUpperBodyError > AVATAR_UPPER_BODY_DIRECTION_REVIEW_THRESHOLD
    ) {
      pushFailure(failures, {
        code: "avatar_upper_body_diverged",
        detail: `Frame ${index} avatar upper-body direction error is ${avatarUpperBodyError.toFixed(2)}.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if (
      hasStrongFullBody(frame, currentDecision) &&
      hasLegMotion(frame, currentDecision) &&
      feet === "neutral" &&
      !owner.includes("neutral")
    ) {
      pushFailure(failures, {
        code: "feet_neutral_while_leg_motion_present",
        detail: `Frame ${index} has strong leg motion and lower owner "${owner}" but feet owner is neutral.`,
        frameIndex: index,
        severity: "error",
      });
    }

    if (
      label.includes("knee-raise") &&
      hasStrongFullBody(frame, currentDecision) &&
      footConfidence >= STRONG_CONFIDENCE &&
      (retarget?.sourceQuality ?? 0) >= STRONG_CONFIDENCE &&
      feet === "neutral"
    ) {
      pushFailure(failures, {
        code: "false_knee_raise_candidate",
        detail: `Frame ${index} is "${label}" with strong full-body data but neutral feet.`,
        frameIndex: index,
        severity: "error",
      });
    }

    if (
      hasStrongFullBody(frame, currentDecision) &&
      (retarget?.hipDrop ?? 0) >= 0.22 &&
      (retarget?.squatDepth ?? 0) < 0.12 &&
      owner.includes("neutral")
    ) {
      pushFailure(failures, {
        code: "squat_not_detected",
        detail: `Frame ${index} has hip drop ${(retarget?.hipDrop ?? 0).toFixed(2)} but squat depth is not detected.`,
        frameIndex: index,
        severity: "error",
      });
    }
  });

  const hadSquat = frames.some((frame, index) => hasStoredSquat(frame, currentDecisions[index]));
  let maxStandRecoveryHold = 0;
  if (hadSquat) {
    frames.forEach((frame, index) => {
      const currentDecision = currentDecisions[index];
      const retarget = currentDecision?.retarget ?? frame.retarget;
      if (!hasNeutralSource(frame, currentDecision)) return;
      const owner = currentDecision?.lowerOwner ?? lowerOwner(frame);
      const visualRootDrop = retarget?.visualRootDrop ?? 0;
      const plantedIk = retarget?.plantedSquatIkDepth ?? 0;
      const holdAmount = Math.max(visualRootDrop, plantedIk);
      maxStandRecoveryHold = Math.max(maxStandRecoveryHold, holdAmount);

      if (owner.includes("squat") || holdAmount >= 0.18) {
        pushFailure(failures, {
          code: "stand_recovery_missing",
          detail: `Frame ${index} source looks neutral but lower owner is "${owner}" and hold is ${holdAmount.toFixed(2)}.`,
          frameIndex: index,
          severity: "error",
        });
      }
    });
  }

  if (lowerBodyOwnerTransitions / durationSeconds > 1.25 && lowerBodyOwnerTransitions >= 2) {
    pushFailure(failures, {
      code: "lower_body_owner_flicker",
      detail: `Lower-body owner changed ${lowerBodyOwnerTransitions} times in ${durationSeconds.toFixed(2)}s.`,
      severity: "warning",
    });
  }

  if (visualMatchScore < VISUAL_MATCH_REVIEW_THRESHOLD) {
    pushFailure(failures, {
      code: "visual_match_low",
      detail: `Visual match score is ${Math.round(visualMatchScore * 100)}%. Reliable frames ${visualReliableFrameCount}/${frames.length}, motion coverage ${Math.round(visualMotionCoverage * 100)}%.`,
      severity: "warning",
    });
  }

  const finalFailures = compressReplayFailures(failures);
  const replayGamePathDivergences = finalFailures.filter((failure) => (
    failure.code === "replay_game_path_diverged"
  ));
  const replayGameWrapperDivergences = finalFailures.filter((failure) => (
    failure.code === "replay_game_wrapper_diverged"
  ));
  const replayGameScoreMessageDivergences = finalFailures.filter((failure) => (
    failure.code === "replay_game_score_message_diverged"
  ));
  const summary = {
    ...summarizeMovementDebugReplaySession(session, finalFailures.length),
    lowerBodyOwners: unique(lowerOwners),
  };
  const coverageEntries = getMovementCoverageEntries();
  const coverageMissingProofs = getMovementCoverageMissingProofs();
  const coverageSummary = summarizeMovementCoverageRegistry();

  return {
    coverage: {
      entries: coverageEntries,
      missingProofs: coverageMissingProofs,
      summary: coverageSummary,
    },
    failures: finalFailures,
    gamePath: {
      calibrationQuality: gamePathSimulation.calibration?.quality ?? 0,
      frames: toGamePathFrames(currentDecisions),
      gameplayEvents,
      parity: {
        divergenceFrameCount: replayGamePathDivergences.length,
        firstDivergenceFrame: replayGamePathDivergences.find((failure) => (
          typeof failure.frameIndex === "number"
        ))?.frameIndex,
        firstScoreMessageDivergenceFrame: replayGameScoreMessageDivergences.find((failure) => (
          typeof failure.frameIndex === "number"
        ))?.frameIndex,
        firstWrapperDivergenceFrame: replayGameWrapperDivergences.find((failure) => (
          typeof failure.frameIndex === "number"
        ))?.frameIndex,
        scoreMessageDivergenceFrameCount: replayGameScoreMessageDivergences.length,
        scoreMessageFrameCount: scoreMessageParityFrames.length,
        wrapperDivergenceFrameCount: replayGameWrapperDivergences.length,
      },
      retargetSourceQuality: gamePathSimulation.retargetSourceModel?.quality ?? 0,
      scoreMessageParityFrames,
      sourceFrames,
      visualProofFrames: gameVisualProofFrames,
      wrapperFrames,
    },
    head: {
      frames: headFrames,
    },
    metrics: {
      averageOutOfFrameCount: average(outOfFrameCounts),
      averageAvatarLowerBodyDirectionError,
      awayBodyFrameCount,
      averageHeadRootDivergence: average(headFrames.map((frame) => frame.headRootDivergence)),
      averageRootHeadingConfidence: rootMotionAnalysis.summary.averageHeadingConfidence,
      averageRootPositionConfidence: rootMotionAnalysis.summary.averageRootPositionConfidence,
      averageRetargetQuality: average(retargetQualities),
      avatarVisualFrameCount: avatarDirectionErrors.length,
      coverageApproximateCount: coverageSummary.approximateCount,
      coverageBlockedCount: coverageSummary.blockedFamilies.length,
      coverageDemoReadyCount: coverageSummary.demoReadyCount,
      coverageDemoReadyPercent: coverageSummary.demoReadyPercent,
      coverageDiagnosticOnlyCount: coverageSummary.diagnosticOnlyCount,
      coverageExplicitStatusCount: coverageSummary.explicitStatusCount,
      coverageFamilyCount: coverageSummary.familyCount,
      coverageImplementedCount: coverageSummary.implementedCount,
      coverageImplementedPercent: coverageSummary.implementedPercent,
      coverageInternalDemoOnlyCount: coverageSummary.internalDemoOnlyCount,
      coverageMissingProofCount: coverageSummary.missingProofCount,
      coverageRemainingGapCount: coverageSummary.remainingGapCount,
      coverageSupportedCount: coverageSummary.supportedCount,
      coverageUnsupportedCount: coverageSummary.unsupportedCount,
      coverageUserFacingCount: coverageSummary.userFacingCount,
      averageExercisePoseQualityScore: average(exercisePoseQualityScores),
      exerciseFloorRollTransitionCount,
      exerciseLungeFrameCount,
      exercisePoseDiagnosticFrameCount,
      exercisePoseModerateFrameCount,
      exercisePoseStrictFrameCount,
      exerciseRollingCrawlingFrameCount,
      exerciseTransitionCount,
      cameraConfidenceLostFrameCount,
      cameraConfidencePartialFrameCount,
      cameraConfidenceReadyFrameCount,
      cameraConfidenceUncertainFrameCount,
      cameraHelpEventCount,
      cameraScoreAllowedFrameCount,
      gameplayClearMovementEventCount,
      gameplayScoreDeltaTotal,
      gameplayTrackingUncertaintyEventCount,
      headAppliedFrameCount,
      headPoseFrameCount,
      headRootDivergenceFrameCount,
      lowerBodyOwnerTransitions,
      maxOutOfFrameCount: outOfFrameCounts.length ? Math.max(...outOfFrameCounts) : 0,
      maxRootHeadingYaw: rootMotionAnalysis.summary.maxYawDelta,
      maxRootPathDistance: rootMotionAnalysis.summary.maxPathDistance,
      maxStandRecoveryHold,
      ownerTransitionsPerSecond: lowerBodyOwnerTransitions / durationSeconds,
      rootMotionSourceLimitedFrameCount: rootMotionAnalysis.summary.sourceLimitedFrameCount,
      rootMotionJumpFrameCount,
      rootMotionJumpResponseFrameCount,
      rootMotionPivotFrameCount,
      rootMotionStepResponseFrameCount,
      rootMotionStepEventFrameCount,
      rootMotionTravelFrameCount,
      rootMotionTurnFrameCount,
      rootMotionWeightTransferFrameCount,
      rootMotionWorldLandmarkFrameCount: rootMotionAnalysis.summary.worldLandmarkFrameCount,
      replayGameWrapperDivergenceFrameCount: replayGameWrapperDivergences.length,
      replayGameWrapperFrameCount: wrapperFrames.length,
      replayGameScoreMessageDivergenceFrameCount: replayGameScoreMessageDivergences.length,
      replayGameScoreMessageFrameCount: scoreMessageParityFrames.length,
      startReadinessCaptureBlockedCount: startReadinessAudit.blockedCaptureCount,
      startReadinessMismatchFrameCount: startReadinessAudit.mismatchFrameCount,
      startReadinessStoredFrameCount: startReadinessAudit.storedFrameCount,
      startReadinessBlockedFrameCount,
      startReadinessCanStartGameFrameCount,
      startReadinessReadyFrameCount,
      strongFullBodyFrameCount,
      supportConstraintActiveFrameCount,
      supportConstraintMissingFrameCount,
      supportConstraintPartialFrameCount,
      supportContactCorrectionFrameCount,
      supportPresentationAppliedFrameCount,
      supportPresentationUpperBodyFrameCount,
      visualMatchScore,
      visualMotionCoverage,
      visualReliableFrameCount,
    },
    pass: !finalFailures.some((failure) => failure.severity === "error"),
    rootMotion: {
      frames: rootMotionAnalysis.frames,
      sourceLimitedFrameCount: rootMotionAnalysis.summary.sourceLimitedFrameCount,
      worldLandmarkFrameCount: rootMotionAnalysis.summary.worldLandmarkFrameCount,
    },
    sessionId: session.id,
    summary,
  };
}

export function analyzeMovementDebugReplaySessions(
  sessions: MovementDebugReplaySession[],
): MovementReplayAnalysis[] {
  return sessions.map(analyzeMovementDebugReplaySession);
}
