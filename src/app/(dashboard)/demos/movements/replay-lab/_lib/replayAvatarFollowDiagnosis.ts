import type {
  MovementReplayAnalysis,
  MovementReplayFailure,
} from "../../_lib/movementReplayAnalyzer";
import type {
  ReplayStudioAcceptanceStatus,
  ReplayStudioRepairPacket,
  ReplayStudioRepairStage,
} from "../../_lib/movementReplayStudioRepairPacket";
import {
  replayStudioAvatarFollowAcceptanceLabel,
  replayStudioAvatarFollowStatusForAcceptance,
} from "../../_lib/movementReplayStudioRepairPacket";
import {
  AVATAR_FOLLOW_AVERAGE_LOWER_REVIEW_THRESHOLD,
  AVATAR_FOLLOW_OWNER_FLICKER_THRESHOLD,
  AVATAR_FOLLOW_VISUAL_MATCH_THRESHOLD,
  type AvatarFollowCriterionStatus,
} from "./replayLabHelpers";

export type AvatarFollowCriterionStatusMap = {
  arms: AvatarFollowCriterionStatus;
  foot: AvatarFollowCriterionStatus;
  head: AvatarFollowCriterionStatus;
  spine: AvatarFollowCriterionStatus;
};

export type AvatarFollowCriterionDisplay = {
  key: keyof AvatarFollowCriterionStatusMap;
  label: string;
  metric: string;
  status: AvatarFollowCriterionStatus;
};

export type AvatarFollowAcceptanceSummary = {
  acceptanceStatus: ReturnType<typeof replayStudioAvatarFollowAcceptanceLabel>;
  currentFailureCodes: string;
  judgeText: string;
  status: ReturnType<typeof replayStudioAvatarFollowStatusForAcceptance>;
};

const AVATAR_FOLLOW_CRITERION_FAILURE_CODES = {
  arms: ["avatar_arm_pose_diverged"],
  foot: ["avatar_planted_foot_diverged"],
  head: ["avatar_head_alignment_diverged"],
  spine: ["avatar_spine_angle_diverged"],
} satisfies Record<keyof AvatarFollowCriterionStatusMap, string[]>;

const AVATAR_FOLLOW_CRITERION_LABELS = {
  arms: "Arms",
  foot: "Planted foot",
  head: "Head",
  spine: "Body / spine",
} satisfies Record<keyof AvatarFollowCriterionStatusMap, string>;

const AVATAR_FOLLOW_CRITERION_ORDER = [
  "head",
  "spine",
  "arms",
  "foot",
] satisfies Array<keyof AvatarFollowCriterionStatusMap>;

export function buildAvatarFollowSessionFailures(
  analysis: MovementReplayAnalysis | null,
): MovementReplayFailure[] {
  if (!analysis) return [];

  const failures: MovementReplayFailure[] = [];
  const visualMatchScore = analysis.metrics.visualMatchScore;
  const ownerTransitionsPerSecond = analysis.metrics.ownerTransitionsPerSecond;
  const lowerError = analysis.metrics.averageAvatarLowerBodyDirectionError;

  if (visualMatchScore < AVATAR_FOLLOW_VISUAL_MATCH_THRESHOLD) {
    failures.push({
      code: "visual_match_low",
      detail: `Replay avatar-follow visual match is ${Math.round(visualMatchScore * 100)}%; target is ${Math.round(AVATAR_FOLLOW_VISUAL_MATCH_THRESHOLD * 100)}%.`,
      severity: "error",
    });
  }

  if (
    ownerTransitionsPerSecond > AVATAR_FOLLOW_OWNER_FLICKER_THRESHOLD &&
    analysis.metrics.lowerBodyOwnerTransitions >= 2
  ) {
    failures.push({
      code: "lower_body_owner_flicker",
      detail: `Lower-body owner changes ${ownerTransitionsPerSecond.toFixed(2)} times/sec; target is <= ${AVATAR_FOLLOW_OWNER_FLICKER_THRESHOLD.toFixed(2)}.`,
      severity: "warning",
    });
  }

  if (analysis.metrics.avatarVisualFrameCount === 0) {
    failures.push({
      code: "avatar_output_diverged",
      detail: "This replay has no persisted VRM bone telemetry, so visual follow must be proven by capture frames before it can pass.",
      severity: "error",
    });
  }

  if (lowerError > AVATAR_FOLLOW_AVERAGE_LOWER_REVIEW_THRESHOLD) {
    failures.push({
      code: "avatar_output_diverged",
      detail: `Average avatar lower-body direction error is ${lowerError.toFixed(2)}; target is <= ${AVATAR_FOLLOW_AVERAGE_LOWER_REVIEW_THRESHOLD.toFixed(2)}.`,
      severity: "error",
    });
  }

  return failures;
}

export function buildAvatarFollowCurrentFrameFailures({
  analysis,
  liveCurrentFrameFailures,
  replayStudioParityFailure,
  safeFrameIndex,
}: {
  analysis: MovementReplayAnalysis | null;
  liveCurrentFrameFailures: MovementReplayFailure[];
  replayStudioParityFailure: MovementReplayFailure | null;
  safeFrameIndex: number;
}): MovementReplayFailure[] {
  return [
    ...(analysis?.failures.filter((failure) => failure.frameIndex === safeFrameIndex) ?? []),
    ...liveCurrentFrameFailures,
    ...(replayStudioParityFailure ? [replayStudioParityFailure] : []),
  ];
}

export function buildReplayStudioParityFailure({
  diffs,
  safeFrameIndex,
}: {
  diffs: string[];
  safeFrameIndex: number;
}): MovementReplayFailure | null {
  if (diffs.length === 0) return null;

  return {
    code: "replay_game_path_diverged",
    detail: `Replay wrapper diverges from Studio wrapper on frame ${safeFrameIndex}: ${diffs.join("; ")}.`,
    frameIndex: safeFrameIndex,
    severity: "warning",
  };
}

export function buildAvatarFollowAcceptanceSummary({
  currentFrameFailures,
  repairPacket,
}: {
  currentFrameFailures: MovementReplayFailure[];
  repairPacket: ReplayStudioRepairPacket | null;
}): AvatarFollowAcceptanceSummary {
  return {
    acceptanceStatus: replayStudioAvatarFollowAcceptanceLabel(repairPacket?.verdict.status),
    currentFailureCodes: currentFrameFailures.map((failure) => failure.code).join(","),
    judgeText: repairPacket
      ? `${repairPacket.verdict.status} packet / ${repairPacket.divergence.firstDivergentStage}`
      : "--",
    status: replayStudioAvatarFollowStatusForAcceptance(repairPacket?.verdict.status),
  };
}

export function resolveAvatarFollowCriterionStatus({
  codes,
  currentFrameFailures,
  currentFrameSourceReady,
  repairStage,
  repairStatus,
}: {
  codes: string[];
  currentFrameFailures: MovementReplayFailure[];
  currentFrameSourceReady: boolean;
  repairStage: ReplayStudioRepairStage | undefined;
  repairStatus: ReplayStudioAcceptanceStatus | undefined;
}): AvatarFollowCriterionStatus {
  const matchingFailures = currentFrameFailures.filter((failure) => (
    codes.includes(failure.code)
  ));
  if (matchingFailures.some((failure) => failure.severity === "error")) return "blocked";
  if (repairStage === "rendered-telemetry") return "blocked";
  if (matchingFailures.length > 0) return "review";
  if (repairStatus === "blocked") return "review";
  return currentFrameSourceReady ? "pass" : "--";
}

export function buildAvatarFollowCriterionStatuses({
  currentFrameFailures,
  currentFrameSourceReady,
  repairStage,
  repairStatus,
}: {
  currentFrameFailures: MovementReplayFailure[];
  currentFrameSourceReady: boolean;
  repairStage: ReplayStudioRepairStage | undefined;
  repairStatus: ReplayStudioAcceptanceStatus | undefined;
}): AvatarFollowCriterionStatusMap {
  return {
    arms: resolveAvatarFollowCriterionStatus({
      codes: AVATAR_FOLLOW_CRITERION_FAILURE_CODES.arms,
      currentFrameFailures,
      currentFrameSourceReady,
      repairStage,
      repairStatus,
    }),
    foot: resolveAvatarFollowCriterionStatus({
      codes: AVATAR_FOLLOW_CRITERION_FAILURE_CODES.foot,
      currentFrameFailures,
      currentFrameSourceReady,
      repairStage,
      repairStatus,
    }),
    head: resolveAvatarFollowCriterionStatus({
      codes: AVATAR_FOLLOW_CRITERION_FAILURE_CODES.head,
      currentFrameFailures,
      currentFrameSourceReady,
      repairStage,
      repairStatus,
    }),
    spine: resolveAvatarFollowCriterionStatus({
      codes: AVATAR_FOLLOW_CRITERION_FAILURE_CODES.spine,
      currentFrameFailures,
      currentFrameSourceReady,
      repairStage,
      repairStatus,
    }),
  };
}

export function buildAvatarFollowCriteria({
  metrics,
  statuses,
}: {
  metrics: Record<keyof AvatarFollowCriterionStatusMap, string>;
  statuses: AvatarFollowCriterionStatusMap;
}): AvatarFollowCriterionDisplay[] {
  return AVATAR_FOLLOW_CRITERION_ORDER.map((key) => ({
    key,
    label: AVATAR_FOLLOW_CRITERION_LABELS[key],
    metric: metrics[key],
    status: statuses[key],
  }));
}

export function buildAvatarFollowFrameSeverityMap({
  analysis,
  liveCurrentFrameFailures,
  replayStudioParityFailure,
}: {
  analysis: MovementReplayAnalysis | null;
  liveCurrentFrameFailures: MovementReplayFailure[];
  replayStudioParityFailure: MovementReplayFailure | null;
}): Map<number, "error" | "warning"> {
  const severityByFrame = new Map<number, "error" | "warning">();
  const addFailure = (failure: MovementReplayFailure) => {
    if (typeof failure.frameIndex !== "number") return;
    const currentSeverity = severityByFrame.get(failure.frameIndex);
    if (failure.severity === "error" || !currentSeverity) {
      severityByFrame.set(failure.frameIndex, failure.severity);
    }
  };

  analysis?.failures.forEach(addFailure);
  liveCurrentFrameFailures.forEach(addFailure);
  if (replayStudioParityFailure) addFailure(replayStudioParityFailure);

  analysis?.replayStudio.frames.forEach((frame) => {
    if (frame.status === "pass") return;
    const currentSeverity = severityByFrame.get(frame.frameIndex);
    const replayStudioSeverity = frame.status === "blocked" ? "error" : "warning";
    if (replayStudioSeverity === "error" || !currentSeverity) {
      severityByFrame.set(frame.frameIndex, replayStudioSeverity);
    }
  });

  return severityByFrame;
}
