// Pure helpers, thresholds, and local types for the replay lab page.

import type { Id } from "@/convex/_generated/dataModel";
import { RENDERED_FIDELITY_POLICY } from "@/src/lib/movements/renderedFidelityPolicy.mjs";
import {
  extractOwner,
  type MovementDebugReplayFrame,
  type MovementDebugReplaySession,
} from "../../_lib/movementDebugReplay";
import {
  type MovementReplayAnalysis,
  type MovementReplayFailure,
} from "../../_lib/movementReplayAnalyzer";
import {
  type MovementAvatarPipelineDecision,
} from "../../_lib/movementAvatarPipeline";
import {
  type MovementReplayRecordingSource,
} from "../../_lib/movementRecordingReplay";
import {
  type MovementTrackingDebugState,
} from "../../_lib/movementTrackingCalibration";

export function replayMotionFrameHistoryForBuild<T>({
  isPlaying,
  previousMotionFrame,
}: {
  isPlaying: boolean;
  previousMotionFrame: T | null | undefined;
}): T | null | undefined {
  // A paused Replay frame is an independently selected proof frame. Carrying
  // the prior frame into temporal stabilization turns a seek into one bounded
  // smoothing step, leaving the avatar stranded between the old and new pose.
  // Timed playback remains continuous and keeps its prior frame history.
  return isPlaying ? previousMotionFrame : null;
}

export function replayShouldPresentTimedRootMotionRef(isPlaying: boolean): boolean {
  // The imperative ref advances between React renders only during timed
  // playback. A paused frame must use its declarative current-frame value;
  // otherwise the last played/previous-recording heading wins indefinitely.
  return isPlaying;
}

export function formatTime(value?: number) {
  if (!value) return "unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatNumber(value?: number, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

export function formatAngleDegrees(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round((value * 180) / Math.PI)}deg`;
}

export function formatAnglesCompact(value?: { pitch: number; yaw: number; roll: number }) {
  if (!value) return "--";
  return `p ${formatAngleDegrees(value.pitch)} y ${formatAngleDegrees(value.yaw)} r ${formatAngleDegrees(value.roll)}`;
}

export function formatPoint(value?: { x: number; y: number; z?: number; visibility?: number }) {
  if (!value) return "--";
  const z = typeof value.z === "number" && Number.isFinite(value.z) ? value.z.toFixed(2) : "--";
  const visibility = typeof value.visibility === "number" && Number.isFinite(value.visibility)
    ? value.visibility.toFixed(2)
    : "--";
  return `x ${value.x.toFixed(2)} y ${value.y.toFixed(2)} z ${z} v ${visibility}`;
}

export function buildPathStripPoints(
  frames: MovementReplayAnalysis["rootMotion"]["frames"],
) {
  type PathStripPoint = {
    frameIndex: number;
    px: number;
    py: number;
    x: number;
    z: number;
  };
  const points = frames
    .filter((frame) => frame.rootPositionConfidence > 0)
    .map((frame) => ({
      frameIndex: frame.frameIndex,
      x: frame.rootPosition.x,
      z: frame.rootPosition.z,
    }));
  if (points.length === 0) {
    return {
      points: [] as PathStripPoint[],
      polyline: "",
    };
  }

  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const width = Math.max(maxX - minX, 0.01);
  const depth = Math.max(maxZ - minZ, 0.01);
  const padding = 10;
  const plotWidth = 100 - padding * 2;
  const plotHeight = 54 - padding * 2;
  const plotted: PathStripPoint[] = points.map((point) => ({
    ...point,
    px: padding + ((point.x - minX) / width) * plotWidth,
    py: padding + ((point.z - minZ) / depth) * plotHeight,
  }));

  return {
    points: plotted,
    polyline: plotted.map((point) => `${point.px.toFixed(1)},${point.py.toFixed(1)}`).join(" "),
  };
}

export function minNumber(values: Array<number | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return undefined;
  return Math.min(...valid);
}

export function replayCalibrationNeutralScore(frame: MovementDebugReplayFrame) {
  const landmarks = frame.tracking.pose;
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftKnee || !rightKnee) return Infinity;

  const shoulderCenter = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };
  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  };
  const torsoHeight = Math.max(Math.hypot(shoulderCenter.x - hipCenter.x, shoulderCenter.y - hipCenter.y), 0.12);
  const kneeLift = (
    Math.max(0, hipCenter.y + torsoHeight * 0.34 - leftKnee.y) +
    Math.max(0, hipCenter.y + torsoHeight * 0.34 - rightKnee.y)
  ) / torsoHeight;
  const sideBend = Math.abs(shoulderCenter.x - hipCenter.x);

  return kneeLift + sideBend * 2.4;
}

export const LIVE_UPPER_BODY_REVIEW_THRESHOLD = RENDERED_FIDELITY_POLICY.passMax;
export const LIVE_SPINE_DRIVE_MOTION_THRESHOLD = 0.18;
export const LIVE_SPINE_DRIVE_REVIEW_THRESHOLD = 0.1;
export const LIVE_HEAD_DAMPING_REVIEW_THRESHOLD = 0.05;
export const AVATAR_FOLLOW_VISUAL_MATCH_THRESHOLD = 0.85;
export const AVATAR_FOLLOW_OWNER_FLICKER_THRESHOLD = 1.25;
export const AVATAR_FOLLOW_ACTIVE_LEG_THRESHOLD = 0.18;
export const AVATAR_FOLLOW_ACTIVE_LEG_ERROR_THRESHOLD = 0.12;
export const AVATAR_FOLLOW_AVERAGE_LOWER_REVIEW_THRESHOLD = 0.52;
export const AVATAR_FOLLOW_ARM_POSE_ERROR_THRESHOLD = RENDERED_FIDELITY_POLICY.passMax;
export const AVATAR_FOLLOW_CURRENT_LOWER_REVIEW_THRESHOLD = 0.24;
export const AVATAR_FOLLOW_PLANTED_FOOT_CLEARANCE_THRESHOLD = 0.08;
export const AVATAR_FOLLOW_PLANTED_FOOT_ERROR_THRESHOLD = 0.12;
export const AVATAR_FOLLOW_SPINE_ANGLE_ERROR_THRESHOLD = RENDERED_FIDELITY_POLICY.passMax;
export type AvatarFollowBatchStatus = "blocked" | "review" | "pass";
export type AvatarFollowCriterionStatus = "blocked" | "review" | "pass" | "--";
export const SOURCE_OUT_OF_FRAME_REVIEW_COUNT = 3;

export function frameLandmarks(frame?: MovementDebugReplayFrame) {
  return frame?.tracking.pose ?? [];
}

export function clampFrame(index: number, frameCount: number) {
  if (frameCount <= 0) return 0;
  return Math.max(0, Math.min(index, frameCount - 1));
}

export function headMotionMagnitude(value?: { pitch: number; yaw: number; roll: number }) {
  if (!value) return 0;
  return Math.max(Math.abs(value.pitch), Math.abs(value.yaw), Math.abs(value.roll));
}

export function maxAvatarSegmentError(
  avatarVisual: MovementTrackingDebugState["avatarVisual"] | undefined,
  segments: string[],
) {
  const errors = segments.flatMap((segment) => {
    const value = avatarVisual?.segments?.[segment]?.sourceError;
    return typeof value === "number" && Number.isFinite(value) ? [value] : [];
  });
  return errors.length > 0 ? Math.max(...errors) : undefined;
}

export function maxFinite(values: Array<number | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length > 0 ? Math.max(...valid) : undefined;
}

export function avatarPlantedFootClearance(
  avatarVisual: MovementTrackingDebugState["avatarVisual"] | undefined,
  plantedFoot: string | undefined,
) {
  const left = avatarVisual?.footing?.leftFootClearance;
  const right = avatarVisual?.footing?.rightFootClearance;
  if (plantedFoot === "left") return left;
  if (plantedFoot === "right") return right;
  if (plantedFoot === "both") return maxFinite([left, right]);
  return undefined;
}

export function avatarPlantedFootSide(
  rootPlantedFoot: string | undefined,
  raisedFoot: "left" | "right" | null | undefined,
) {
  if (raisedFoot === "left") return "right";
  if (raisedFoot === "right") return "left";
  return rootPlantedFoot;
}

export function avatarSegmentVectorAttr(
  avatarVisual: MovementTrackingDebugState["avatarVisual"] | undefined,
  segment: string,
  key: "direction" | "sourceDirection",
) {
  const vector = avatarVisual?.segments?.[segment]?.[key];
  if (!vector) return "";
  return `${vector.x},${vector.y},${vector.z}`;
}

export function extractKnownOwner(fallbacks: Record<string, string> | undefined, key: "feet" | "lower") {
  if (!fallbacks) return undefined;
  const owner = extractOwner(fallbacks, key);
  return owner === "unknown" ? undefined : owner;
}

export function avatarFollowCriterionClass(status: AvatarFollowCriterionStatus) {
  if (status === "blocked") return "text-[#ffb0b0]";
  if (status === "review") return "text-[#f6ccbe]";
  if (status === "pass") return "text-[#a8d5ba]";
  return "text-muted";
}

export function captureFileName(recordingId: string | null, suffix: string) {
  const recordingSuffix = recordingId ? recordingId.slice(-8) : "pending";
  return `movement-replay-${recordingSuffix}-${suffix}`;
}

export function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.rel = "noopener";
  link.click();
}

export function compactCaptureLabel(value: string, maxLength = 42) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function selectStripFrameIndexes(
  frameCount: number,
  currentFrameIndex: number,
  failures: Array<{ frameIndex?: number }>,
) {
  if (frameCount <= 0) return [];

  const indexes = new Set<number>([
    0,
    clampFrame(currentFrameIndex, frameCount),
    frameCount - 1,
  ]);

  failures
    .map((failure) => failure.frameIndex)
    .filter((index): index is number => typeof index === "number")
    .slice(0, 3)
    .forEach((index) => indexes.add(clampFrame(index, frameCount)));

  const targetCount = Math.min(5, frameCount);
  for (let step = 1; indexes.size < targetCount && step <= targetCount; step += 1) {
    indexes.add(clampFrame(Math.round((step / targetCount) * (frameCount - 1)), frameCount));
  }

  return Array.from(indexes).sort((left, right) => left - right);
}

export function countFailures(analysis: MovementReplayAnalysis, severity: "error" | "warning") {
  return analysis.failures.filter((failure) => failure.severity === severity).length;
}

export function classifyLowerOwner(owner?: string) {
  if (!owner) return "unknown";
  if (owner.includes("squat")) return "squat";
  if (owner.includes("leg-raise") || owner.includes("knee-raise")) return "leg-raise";
  if (owner.includes("retarget")) return "retarget";
  if (owner.includes("neutral")) return "neutral";
  return owner;
}

export function getBatchSummary(analyses: MovementReplayAnalysis[]) {
  const visualScores = analyses.map((analysis) => analysis.metrics.visualMatchScore);
  const setupBlocked = analyses.filter((analysis) => analysis.metrics.startReadinessBlockedFrameCount > 0).length;
  const setupReadyFrames = analyses.reduce(
    (sum, analysis) => sum + analysis.metrics.startReadinessReadyFrameCount,
    0,
  );
  const setupBlockedFrames = analyses.reduce(
    (sum, analysis) => sum + analysis.metrics.startReadinessBlockedFrameCount,
    0,
  );
  const setupTopMessages = new Map<string, number>();
  analyses.forEach((analysis) => {
    analysis.gamePath.startReadinessMessageSummary.forEach((item) => {
      setupTopMessages.set(item.message, (setupTopMessages.get(item.message) ?? 0) + item.count);
    });
  });
  const setupTopMessage = [...setupTopMessages.entries()].sort((left, right) => (
    right[1] - left[1] || left[0].localeCompare(right[0])
  ))[0]?.[0] ?? null;

  return {
    clean: analyses.filter((analysis) => analysis.pass && countFailures(analysis, "warning") === 0).length,
    errors: analyses.reduce((sum, analysis) => sum + countFailures(analysis, "error"), 0),
    failed: analyses.filter((analysis) => !analysis.pass).length,
    passed: analyses.filter((analysis) => analysis.pass).length,
    setupBlocked,
    setupBlockedFrames,
    setupReadyFrames,
    setupTopMessage,
    visualMatchScore: visualScores.length === 0
      ? 0
      : visualScores.reduce((sum, score) => sum + score, 0) / visualScores.length,
    warnings: analyses.reduce((sum, analysis) => sum + countFailures(analysis, "warning"), 0),
  };
}

export function getFailureGroups(failures: MovementReplayFailure[]) {
  const groups = new Map<
    string,
    {
      code: MovementReplayFailure["code"];
      count: number;
      firstFrame?: number;
      samples: MovementReplayFailure[];
      severity: MovementReplayFailure["severity"];
    }
  >();

  failures.forEach((failure) => {
    const group = groups.get(failure.code);
    if (!group) {
      groups.set(failure.code, {
        code: failure.code,
        count: 1,
        firstFrame: failure.frameIndex,
        samples: [failure],
        severity: failure.severity,
      });
      return;
    }

    group.count += 1;
    if (failure.severity === "error") group.severity = "error";
    if (
      typeof failure.frameIndex === "number" &&
      (typeof group.firstFrame !== "number" || failure.frameIndex < group.firstFrame)
    ) {
      group.firstFrame = failure.frameIndex;
    }
    if (group.samples.length < 3) group.samples.push(failure);
  });

  return Array.from(groups.values()).sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "error" ? -1 : 1;
    return right.count - left.count;
  });
}

export function getRecordingLabel(analysis?: MovementReplayAnalysis) {
  if (!analysis) return "Not run";
  const errors = countFailures(analysis, "error");
  const warnings = countFailures(analysis, "warning");
  if (errors > 0) return "Needs code fix";
  if (warnings > 0) return "Source warning";
  return "Pass";
}

export function getBatchStatusLabel({
  hasRunBatch,
  selectedCount,
  summary,
  total,
}: {
  hasRunBatch: boolean;
  selectedCount: number;
  summary: ReturnType<typeof getBatchSummary>;
  total: number;
}) {
  if (!hasRunBatch) return `${selectedCount} recordings selected`;
  if (summary.errors > 0) return `${summary.errors} code errors in ${summary.failed}/${total} recordings`;
  if (summary.setupBlocked > 0) {
    return `${summary.setupBlocked}/${total} recordings have setup blockers`;
  }
  if (summary.warnings > 0) return `0 code errors · ${Math.round(summary.visualMatchScore * 100)}% visual match · review needed`;
  return `${summary.clean}/${total} recordings clean`;
}

export function getAvatarFollowBatchStatus(analysis: MovementReplayAnalysis): AvatarFollowBatchStatus {
  const hasHardFailure = analysis.replayStudio.session.status === "blocked" ||
    countFailures(analysis, "error") > 0;
  if (hasHardFailure) return "blocked";
  const needsReview = analysis.replayStudio.session.status === "review" ||
    countFailures(analysis, "warning") > 0 ||
    analysis.metrics.visualMatchScore < AVATAR_FOLLOW_VISUAL_MATCH_THRESHOLD ||
    (
      analysis.metrics.ownerTransitionsPerSecond > AVATAR_FOLLOW_OWNER_FLICKER_THRESHOLD &&
      analysis.metrics.lowerBodyOwnerTransitions >= 2
    ) ||
    analysis.metrics.averageAvatarLowerBodyDirectionError > AVATAR_FOLLOW_AVERAGE_LOWER_REVIEW_THRESHOLD;
  return needsReview ? "review" : "pass";
}

export function getAvatarFollowBatchIssueCode(analysis: MovementReplayAnalysis) {
  const worstFrameFailure = analysis.replayStudio.session.worstFrames[0]?.failures[0];
  if (worstFrameFailure) return worstFrameFailure.code;
  const firstFailure = analysis.failures.find((failure) => failure.severity === "error") ?? analysis.failures[0];
  if (firstFailure) return firstFailure.code;
  if (analysis.metrics.visualMatchScore < AVATAR_FOLLOW_VISUAL_MATCH_THRESHOLD) return "visual_match_low";
  if (
    analysis.metrics.ownerTransitionsPerSecond > AVATAR_FOLLOW_OWNER_FLICKER_THRESHOLD &&
    analysis.metrics.lowerBodyOwnerTransitions >= 2
  ) {
    return "lower_body_owner_flicker";
  }
  if (analysis.metrics.averageAvatarLowerBodyDirectionError > AVATAR_FOLLOW_AVERAGE_LOWER_REVIEW_THRESHOLD) {
    return "avatar_output_diverged";
  }
  return "clean";
}

export function getAvatarFollowBatchNextFixArea(analysis: MovementReplayAnalysis) {
  const worstFrameFailure = analysis.replayStudio.session.worstFrames[0]?.failures[0];
  if (worstFrameFailure) return worstFrameFailure.nextFixArea;
  const issueCode = getAvatarFollowBatchIssueCode(analysis);
  if (issueCode === "visual_match_low") return "Replay visual proof capture / avatar-follow gate";
  if (issueCode === "lower_body_owner_flicker") return "lower-body owner smoothing / hysteresis";
  if (issueCode === "avatar_output_diverged") return "VRM lower-body application / leg-retarget output";
  return "none";
}

export function getProofRehearsalReadiness({
  hasRunBatch,
  isRunInProgress,
  selectedCount,
  setupBlocked,
}: {
  hasRunBatch: boolean;
  isRunInProgress: boolean;
  selectedCount: number;
  setupBlocked: number;
}) {
  if (selectedCount === 0) {
    return {
      detail: "Select the recording set you want to compare before the physical proof pass.",
      label: "Select recordings first",
      state: "needs-selection",
    };
  }
  if (isRunInProgress) {
    return {
      detail: "Replay Lab is checking the selected recordings for setup blockers.",
      label: "Checking selected recordings",
      state: "checking",
    };
  }
  if (!hasRunBatch) {
    return {
      detail: "Run the selected recordings so setup blockers are visible before recording new proof.",
      label: "Run selected recordings",
      state: "needs-run",
    };
  }
  if (setupBlocked > 0) {
    return {
      detail: `${setupBlocked} selected recording${setupBlocked === 1 ? "" : "s"} still need setup review before physical proof.`,
      label: "Fix setup blockers first",
      state: "setup-blocked",
    };
  }
  return {
    detail: "Selected recordings have no setup blockers; rehearse the two physical proof motions next.",
    label: "Ready to rehearse proof",
    state: "ready",
  };
}

export type ReplayStudioParitySnapshot = {
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

export function getReplayStudioParitySnapshot(
  decision: MovementAvatarPipelineDecision,
): ReplayStudioParitySnapshot {
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

export function getReplayStudioParityDiffs({
  replay,
  studio,
}: {
  replay: ReplayStudioParitySnapshot;
  studio: ReplayStudioParitySnapshot;
}) {
  return (Object.keys(replay) as Array<keyof ReplayStudioParitySnapshot>)
    .filter((key) => replay[key] !== studio[key])
    .map((key) => `${key}: replay ${String(replay[key])} / studio ${String(studio[key])}`);
}

export type LoadedReplayRecording = {
  error: string | null;
  isLoading: boolean;
  session: MovementDebugReplaySession | null;
};

export type ReplayLabRecording = MovementReplayRecordingSource & {
  _id: Id<"movements">;
  difficulty?: string;
  spineGoal?: string | null;
};

export function formatDuration(value?: number) {
  if (!value) return "--";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

export function formatRunClock(value?: number | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
