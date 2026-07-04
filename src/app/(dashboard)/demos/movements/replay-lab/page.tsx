"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Images,
  ListChecks,
  Loader2,
  Pause,
  Play,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Header from "@/src/ui/components/layout/Header";
import {
  extractOwner,
  type MovementDebugReplayFrame,
  type MovementDebugReplaySession,
} from "../_lib/movementDebugReplay";
import {
  analyzeMovementDebugReplaySession,
  type MovementReplayAnalysis,
  type MovementReplayFailure,
} from "../_lib/movementReplayAnalyzer";
import {
  resolveMovementAvatarReplayDecision,
  resolveMovementAvatarStudioDecision,
  type MovementAvatarPipelineDecision,
} from "../_lib/movementAvatarPipeline";
import {
  loadMovementReplayRecording,
  type MovementReplayRecordingSource,
} from "../_lib/movementRecordingReplay";
import { buildInstructorRetargetSourceModel } from "../_hooks/useMovementInstructorPlayback";
import { drawMovementSkeleton } from "../_lib/movementSkeleton";
import {
  averageMovementCalibrations,
  buildMovementCalibration,
  type MovementTrackingDebugState,
} from "../_lib/movementTrackingCalibration";
import { buildMovementSourceFrame } from "../_lib/movementSourceFrame";
import {
  resolveMovementMotionFrame,
  type MovementMotionFrame,
} from "../_lib/movementMotionFrame";
import type { VrmMotionRef } from "../_lib/vrmRigging";
import MovementMatchScene from "../[id]/play/_components/MovementMatchScene";
import MovementSourceSkeleton from "../[id]/play/_components/MovementSourceSkeleton";
import VrmAvatar from "../[id]/play/_components/VrmAvatar";

function formatTime(value?: number) {
  if (!value) return "unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatNumber(value?: number, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function formatAngleDegrees(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round((value * 180) / Math.PI)}deg`;
}

function formatAnglesCompact(value?: { pitch: number; yaw: number; roll: number }) {
  if (!value) return "--";
  return `p ${formatAngleDegrees(value.pitch)} y ${formatAngleDegrees(value.yaw)} r ${formatAngleDegrees(value.roll)}`;
}

function formatPoint(value?: { x: number; y: number; z?: number; visibility?: number }) {
  if (!value) return "--";
  const z = typeof value.z === "number" && Number.isFinite(value.z) ? value.z.toFixed(2) : "--";
  const visibility = typeof value.visibility === "number" && Number.isFinite(value.visibility)
    ? value.visibility.toFixed(2)
    : "--";
  return `x ${value.x.toFixed(2)} y ${value.y.toFixed(2)} z ${z} v ${visibility}`;
}

function buildPathStripPoints(
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

function minNumber(values: Array<number | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return undefined;
  return Math.min(...valid);
}

function replayCalibrationNeutralScore(frame: MovementDebugReplayFrame) {
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

const LIVE_UPPER_BODY_REVIEW_THRESHOLD = 0.18;
const LIVE_SPINE_DRIVE_MOTION_THRESHOLD = 0.18;
const LIVE_SPINE_DRIVE_REVIEW_THRESHOLD = 0.1;
const LIVE_HEAD_DAMPING_REVIEW_THRESHOLD = 0.05;
const LIVE_LOWER_BODY_REVIEW_THRESHOLD = 0.52;
const SOURCE_OUT_OF_FRAME_REVIEW_COUNT = 3;

function frameLandmarks(frame?: MovementDebugReplayFrame) {
  return frame?.tracking.pose ?? [];
}

function clampFrame(index: number, frameCount: number) {
  if (frameCount <= 0) return 0;
  return Math.max(0, Math.min(index, frameCount - 1));
}

function headMotionMagnitude(value?: { pitch: number; yaw: number; roll: number }) {
  if (!value) return 0;
  return Math.max(Math.abs(value.pitch), Math.abs(value.yaw), Math.abs(value.roll));
}

function captureFileName(recordingId: string | null, suffix: string) {
  const recordingSuffix = recordingId ? recordingId.slice(-8) : "pending";
  return `movement-replay-${recordingSuffix}-${suffix}`;
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.rel = "noopener";
  link.click();
}

function selectStripFrameIndexes(
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

function countFailures(analysis: MovementReplayAnalysis, severity: "error" | "warning") {
  return analysis.failures.filter((failure) => failure.severity === severity).length;
}

function classifyLowerOwner(owner?: string) {
  if (!owner) return "unknown";
  if (owner.includes("squat")) return "squat";
  if (owner.includes("leg-raise") || owner.includes("knee-raise")) return "leg-raise";
  if (owner.includes("retarget")) return "retarget";
  if (owner.includes("neutral")) return "neutral";
  return owner;
}

function getBatchSummary(analyses: MovementReplayAnalysis[]) {
  const visualScores = analyses.map((analysis) => analysis.metrics.visualMatchScore);
  return {
    clean: analyses.filter((analysis) => analysis.pass && countFailures(analysis, "warning") === 0).length,
    errors: analyses.reduce((sum, analysis) => sum + countFailures(analysis, "error"), 0),
    failed: analyses.filter((analysis) => !analysis.pass).length,
    passed: analyses.filter((analysis) => analysis.pass).length,
    visualMatchScore: visualScores.length === 0
      ? 0
      : visualScores.reduce((sum, score) => sum + score, 0) / visualScores.length,
    warnings: analyses.reduce((sum, analysis) => sum + countFailures(analysis, "warning"), 0),
  };
}

function getFailureGroups(failures: MovementReplayFailure[]) {
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

function getRecordingLabel(analysis?: MovementReplayAnalysis) {
  if (!analysis) return "Not run";
  const errors = countFailures(analysis, "error");
  const warnings = countFailures(analysis, "warning");
  if (errors > 0) return "Needs code fix";
  if (warnings > 0) return "Source warning";
  return "Pass";
}

function getBatchStatusLabel({
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
  if (summary.warnings > 0) return `0 code errors · ${Math.round(summary.visualMatchScore * 100)}% visual match · review needed`;
  return `${summary.clean}/${total} recordings clean`;
}

type ReplayStudioParitySnapshot = {
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

function getReplayStudioParitySnapshot(
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

function getReplayStudioParityDiffs({
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

type LoadedReplayRecording = {
  error: string | null;
  isLoading: boolean;
  session: MovementDebugReplaySession | null;
};

function formatDuration(value?: number) {
  if (!value) return "--";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatRunClock(value?: number | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function MovementReplayLabPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const replaySceneRef = useRef<HTMLElement | null>(null);
  const replayAvatarDebugRef = useRef<MovementTrackingDebugState | null>(null);
  const replayMotionRef = useRef<VrmMotionRef>(null);
  const replayMotionFrameRef = useRef<MovementMotionFrame | null>(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState<Id<"movements"> | null>(null);
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<Array<Id<"movements">>>([]);
  const [hasRunBatch, setHasRunBatch] = useState(false);
  const [pendingRunId, setPendingRunId] = useState<number | null>(null);
  const [completedRunCount, setCompletedRunCount] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runCompletedAt, setRunCompletedAt] = useState<number | null>(null);
  const [loadedRecordings, setLoadedRecordings] = useState<Record<string, LoadedReplayRecording>>({});
  const loadedRecordingsRef = useRef<Record<string, LoadedReplayRecording>>({});
  const recordingsToLoadRef = useRef<MovementReplayRecordingSource[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [captureMode, setCaptureMode] = useState<"scene" | "strip" | null>(null);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const [currentAvatarDebug, setCurrentAvatarDebug] = useState<MovementTrackingDebugState | null>(null);
  const [currentAvatarVisual, setCurrentAvatarVisual] = useState<MovementTrackingDebugState["avatarVisual"]>();

  const recordings = useQuery(api.movements.listReplayAlignmentRecordings, { limit: 50 });
  const activeRecordingId = selectedRecordingId;
  const recordingsToLoad = useMemo(() => {
    if (!recordings) return [];
    const idsToLoad = new Set<string>(hasRunBatch ? selectedRecordingIds : []);
    if (activeRecordingId) idsToLoad.add(activeRecordingId);
    return recordings.filter((recording) => idsToLoad.has(recording._id));
  }, [activeRecordingId, hasRunBatch, recordings, selectedRecordingIds]);
  const recordingsToLoadKey = useMemo(() => (
    recordingsToLoad
      .map((recording) => [
        recording._id,
        recording.poseDataUrl ?? "",
        recording.poseData,
        recording.poseDataFormat ?? "",
        recording.frameCount ?? "",
        recording.durationMs ?? "",
      ].join(":"))
      .join("|")
  ), [recordingsToLoad]);

  useEffect(() => {
    loadedRecordingsRef.current = loadedRecordings;
  }, [loadedRecordings]);

  useEffect(() => {
    recordingsToLoadRef.current = recordingsToLoad;
  }, [recordingsToLoad]);

  useEffect(() => {
    const queuedRecordings = recordingsToLoadRef.current;
    if (queuedRecordings.length === 0) return;

    let cancelled = false;
    const missingRecordings = queuedRecordings.filter((recording) => !loadedRecordingsRef.current[recording._id]);
    if (missingRecordings.length === 0) return;

    setLoadedRecordings((current) => {
      const next = { ...current };
      missingRecordings.forEach((recording) => {
        next[recording._id] = {
          error: null,
          isLoading: true,
          session: null,
        };
      });
      return next;
    });

    missingRecordings.forEach((recording) => {
      void loadMovementReplayRecording(recording as MovementReplayRecordingSource)
        .then((result) => {
          if (cancelled) return;
          setLoadedRecordings((current) => ({
            ...current,
            [recording._id]: {
              error: null,
              isLoading: false,
              session: result.session,
            },
          }));
        })
        .catch((error) => {
          if (cancelled) return;
          setLoadedRecordings((current) => ({
            ...current,
            [recording._id]: {
              error: error instanceof Error ? error.message : "Could not load recording.",
              isLoading: false,
              session: null,
            },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [recordingsToLoadKey]);

  const replaySession = activeRecordingId ? loadedRecordings[activeRecordingId]?.session ?? null : null;
  const replayLoadError = activeRecordingId ? loadedRecordings[activeRecordingId]?.error ?? null : null;
  const replayIsLoading = Boolean(activeRecordingId && loadedRecordings[activeRecordingId]?.isLoading);
  const batchReplaySessions = useMemo(() => (
    selectedRecordingIds
      .map((recordingId) => loadedRecordings[recordingId]?.session)
      .filter((session): session is MovementDebugReplaySession => Boolean(session))
  ), [loadedRecordings, selectedRecordingIds]);

  const batchAnalyses = useMemo(() => (
    hasRunBatch
      ? batchReplaySessions.map((session) => analyzeMovementDebugReplaySession(session))
      : []
  ), [batchReplaySessions, hasRunBatch]);

  const batchSummary = useMemo(() => getBatchSummary(batchAnalyses), [batchAnalyses]);
  const analysisByRecordingId = useMemo(() => (
    new Map(batchAnalyses.map((batchAnalysis) => [batchAnalysis.sessionId, batchAnalysis]))
  ), [batchAnalyses]);

  const analysis = useMemo(
    () => replaySession ? analyzeMovementDebugReplaySession(replaySession) : null,
    [replaySession],
  );
  const failureGroups = useMemo(
    () => getFailureGroups(analysis?.failures ?? []),
    [analysis?.failures],
  );

  const safeFrameIndex = clampFrame(frameIndex, replaySession?.samples.length ?? 0);
  const currentFrame = replaySession?.samples[safeFrameIndex];
  const currentPoseLandmarks = frameLandmarks(currentFrame);
  const currentNose = currentPoseLandmarks[0];
  const currentLeftEar = currentPoseLandmarks[7];
  const currentRightEar = currentPoseLandmarks[8];
  const currentBodyConfidence = currentAvatarDebug?.bodyConfidence;
  const currentRetarget = currentAvatarDebug?.retarget;
  const currentFallbacks = currentAvatarDebug?.fallbacks;
  const currentSpineDrive = currentAvatarDebug?.spineDrive;
  const currentLegRaise = currentAvatarDebug?.avatarLegRaise;
  const armConfidence = minNumber([
    currentBodyConfidence?.leftShoulder,
    currentBodyConfidence?.rightShoulder,
    currentBodyConfidence?.leftElbow,
    currentBodyConfidence?.rightElbow,
    Math.max(currentBodyConfidence?.leftWrist ?? 0, currentBodyConfidence?.leftHand ?? 0),
    Math.max(currentBodyConfidence?.rightWrist ?? 0, currentBodyConfidence?.rightHand ?? 0),
  ]);
  const legConfidence = minNumber([
    currentBodyConfidence?.hips,
    currentBodyConfidence?.leftKnee,
    currentBodyConfidence?.rightKnee,
  ]);
  const footConfidence = minNumber([
    currentBodyConfidence?.leftFoot,
    currentBodyConfidence?.rightFoot,
  ]);
  const currentGamePathFrame = analysis?.gamePath.frames.find((frame) => frame.frameIndex === safeFrameIndex);
  const currentSourceFrame = analysis?.gamePath.sourceFrames.find((frame) => frame.frameIndex === safeFrameIndex);
  const currentRootMotionFrame = analysis?.rootMotion.frames.find((frame) => frame.frameIndex === safeFrameIndex);
  const rootPathStrip = useMemo(
    () => buildPathStripPoints(analysis?.rootMotion.frames ?? []),
    [analysis?.rootMotion.frames],
  );
  const currentRootPathPoint = rootPathStrip.points.find((point) => point.frameIndex === safeFrameIndex);
  const currentRootPathDistance = currentRootMotionFrame
    ? Math.hypot(currentRootMotionFrame.rootPosition.x, currentRootMotionFrame.rootPosition.z)
    : undefined;
  const rootMotionNeedsReview = Boolean(
    currentRootMotionFrame &&
      (
        currentRootMotionFrame.debug.source !== "world-landmarks" ||
        Math.abs(currentRootMotionFrame.headingYaw) > 0.65 ||
        (currentRootPathDistance ?? 0) > 0.16
      ),
  );
  const rootMotionLabel = currentRootMotionFrame
    ? rootMotionNeedsReview ? "review" : "stable"
    : "--";
  const liveLowerOwner = currentFallbacks?.lower ?? (currentFrame ? extractOwner(currentFrame.fallbacks, "lower") : undefined);
  const liveFeetOwner = currentFallbacks?.feet ?? (currentFrame ? extractOwner(currentFrame.fallbacks, "feet") : undefined);
  const replayLowerOwner = liveLowerOwner ?? (currentFrame ? extractOwner(currentFrame.fallbacks, "lower") : undefined);
  const replayFeetOwner = liveFeetOwner ?? (currentFrame ? extractOwner(currentFrame.fallbacks, "feet") : undefined);
  const replaySquatDepth = currentRetarget?.squatDepth ?? currentFrame?.retarget?.squatDepth ?? 0;
  const gamePathLowerMode = classifyLowerOwner(currentGamePathFrame?.lowerOwner);
  const replayLowerMode = classifyLowerOwner(replayLowerOwner);
  const gamePathParityNeedsReview = Boolean(
    currentGamePathFrame &&
      (
        (
          gamePathLowerMode !== "unknown" &&
          replayLowerMode !== "unknown" &&
          gamePathLowerMode !== replayLowerMode
        ) ||
        Math.abs(currentGamePathFrame.squatDepth - replaySquatDepth) > 0.18
      ),
  );
  const gamePathParityLabel = currentGamePathFrame
    ? gamePathParityNeedsReview ? "review" : "match"
    : "--";
  const inspectorCards = [
    {
      label: "Head",
      primary: currentFallbacks?.head ?? "--",
      secondary: formatAnglesCompact(currentAvatarDebug?.headApplied),
      detail: `raw ${formatAnglesCompact(currentAvatarDebug?.headRaw)} · c ${formatNumber(currentAvatarDebug?.headRaw.confidence)}`,
    },
    {
      label: "Torso",
      primary: currentFallbacks?.spine ?? "--",
      secondary: `conf ${formatNumber(currentBodyConfidence?.torso)}`,
      detail: `bend ${formatNumber(currentSpineDrive?.sideBend)} · lean ${formatNumber(currentSpineDrive?.forwardLean)}`,
    },
    {
      label: "Arms",
      primary: `${currentFallbacks?.leftArm ?? "--"} / ${currentFallbacks?.rightArm ?? "--"}`,
      secondary: `conf ${formatNumber(armConfidence)}`,
      detail: `L ${formatNumber(currentBodyConfidence?.leftWrist)} R ${formatNumber(currentBodyConfidence?.rightWrist)}`,
    },
    {
      label: "Legs",
      primary: liveLowerOwner ?? "--",
      secondary: `conf ${formatNumber(legConfidence)}`,
      detail: currentLegRaise
        ? `raw ${formatNumber(currentLegRaise.rawLeftDepth)} / ${formatNumber(currentLegRaise.rawRightDepth)} · applied ${formatNumber(currentLegRaise.appliedDepth)} · ${currentLegRaise.side ?? "--"}${currentLegRaise.holdActive ? " held" : ""}`
        : `knee ${formatNumber(currentRetarget?.leftKneeLift ?? currentFrame?.retarget?.leftKneeLift)} / ${formatNumber(currentRetarget?.rightKneeLift ?? currentFrame?.retarget?.rightKneeLift)}`,
    },
    {
      label: "Feet",
      primary: liveFeetOwner ?? "--",
      secondary: `conf ${formatNumber(footConfidence)}`,
      detail: `contact ${currentRetarget?.leftFootContact ? "L" : "-"}${currentRetarget?.rightFootContact ? "R" : "-"}`,
    },
    {
      label: "Retarget",
      primary: currentFallbacks?.retarget ? "active" : "--",
      secondary: `${currentRetarget?.appliedUpperBody ?? 0}/${currentRetarget?.totalUpperBody ?? 0} upper`,
      detail: `seg ${formatNumber(currentRetarget?.lowerBodySegmentMotion)} · squat ${formatNumber(currentRetarget?.squatDepth ?? currentFrame?.retarget?.squatDepth)}`,
    },
  ];
  const replayRetargetSourceModel = useMemo(() => {
    if (!replaySession) return null;

    return buildInstructorRetargetSourceModel(
      replaySession.samples.map((sample) => ({
        landmarks: sample.tracking.pose,
        worldLandmarks: sample.tracking.worldPose.length > 0
          ? sample.tracking.worldPose
          : null,
      })),
    );
  }, [replaySession]);
  const replayPlayerCalibration = useMemo(() => {
    if (!replaySession) return null;

    const calibrationSamples = replaySession.samples
      .map((sample, index) => ({
        calibration: buildMovementCalibration({
          now: index,
          poseLandmarks: sample.tracking.pose,
        }),
        score: replayCalibrationNeutralScore(sample),
      }))
      .filter((sample): sample is {
        calibration: NonNullable<ReturnType<typeof buildMovementCalibration>>;
        score: number;
      } => Boolean(sample.calibration) && Number.isFinite(sample.score))
      .sort((left, right) => (
        left.score - right.score ||
        right.calibration.quality - left.calibration.quality
      ))
      .slice(0, 8)
      .map((sample) => sample.calibration);

    return averageMovementCalibrations(calibrationSamples);
  }, [replaySession]);
  const currentReplayMotionFrame = useMemo(() => {
    if (!currentFrame || currentPoseLandmarks.length < 33) return null;

    return resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: replayPlayerCalibration ?? buildMovementCalibration({ poseLandmarks: currentPoseLandmarks }),
      displayPoseLandmarks: currentPoseLandmarks,
      displayWorldPoseLandmarks: currentFrame.tracking.worldPose,
      mirrorMode: "facing-player",
      retargetSourceModel: replayRetargetSourceModel,
      sourceFrame: buildMovementSourceFrame({
        poseLandmarks: currentPoseLandmarks,
        sourceOrigin: "recorded-replay",
        sourceStatus: "decoded",
        worldPoseLandmarks: currentFrame.tracking.worldPose,
      }),
    });
  }, [currentFrame, currentPoseLandmarks, replayPlayerCalibration, replayRetargetSourceModel]);
  const replayStudioParity = useMemo(() => {
    if (currentPoseLandmarks.length < 33) return null;

    const calibration = replayPlayerCalibration ?? buildMovementCalibration({ poseLandmarks: currentPoseLandmarks });
    const source = { poseLandmarks: currentPoseLandmarks };
    const replayDecision = resolveMovementAvatarReplayDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel: replayRetargetSourceModel,
      source,
    });
    const studioDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel: replayRetargetSourceModel,
      source,
    });
    const replay = getReplayStudioParitySnapshot(replayDecision);
    const studio = getReplayStudioParitySnapshot(studioDecision);
    const diffs = getReplayStudioParityDiffs({ replay, studio });

    return {
      diffs,
      label: diffs.length > 0 ? "diverged" : "match",
      replay,
      studio,
    };
  }, [currentPoseLandmarks, replayPlayerCalibration, replayRetargetSourceModel]);
  const liveCurrentFrameFailures = useMemo<MovementReplayFailure[]>(() => {
    const failures: MovementReplayFailure[] = [];
    const upperBodyError = currentAvatarVisual?.averageUpperBodyDirectionError;
    const upperBodySegments = currentAvatarVisual?.comparedUpperBodySegments ?? 0;
    const lowerBodyError = currentAvatarVisual?.averageLowerBodyDirectionError;
    const lowerBodySegments = currentAvatarVisual?.comparedLowerBodySegments ?? 0;
    const outOfFrameCount = currentFrame?.poseBounds?.outOfFrameCount ?? 0;
    const maxY = currentFrame?.poseBounds?.maxY ?? 0;
    const sourceQuality = currentRetarget?.sourceQuality ?? currentFrame?.retarget?.sourceQuality ?? 1;
    const spineDriveMagnitude = Math.max(
      Math.abs(currentSpineDrive?.sideBend ?? 0),
      Math.abs(currentSpineDrive?.forwardLean ?? 0),
    );
    const rawHeadMagnitude = headMotionMagnitude(currentAvatarDebug?.headRaw);
    const appliedHeadMagnitude = headMotionMagnitude(currentAvatarDebug?.headApplied);
    const headDamping = rawHeadMagnitude - appliedHeadMagnitude;

    if (outOfFrameCount >= SOURCE_OUT_OF_FRAME_REVIEW_COUNT || maxY > 1.08) {
      failures.push({
        code: "source_lower_body_out_of_frame",
        detail: `Current frame has ${outOfFrameCount} landmarks out of frame; review source tracking before trusting avatar alignment.`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    if (
      typeof footConfidence === "number" &&
      typeof legConfidence === "number" &&
      footConfidence < 0.35 &&
      legConfidence >= 0.45
    ) {
      failures.push({
        code: "source_feet_weak",
        detail: `Current frame has leg confidence ${legConfidence.toFixed(2)} but foot confidence ${footConfidence.toFixed(2)}.`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    if (sourceQuality < 0.45) {
      failures.push({
        code: "retarget_quality_drop",
        detail: `Current frame retarget quality is ${sourceQuality.toFixed(2)}.`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    if (
      upperBodySegments >= 3 &&
      typeof upperBodyError === "number" &&
      upperBodyError > LIVE_UPPER_BODY_REVIEW_THRESHOLD
    ) {
      failures.push({
        code: "avatar_upper_body_diverged",
        detail: `Live avatar upper-body direction error is ${upperBodyError.toFixed(2)} across ${upperBodySegments} segments; review visible spine/arm match.`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    if (
      currentSpineDrive?.owner === "recorded-spine-model" &&
      typeof upperBodyError === "number" &&
      spineDriveMagnitude >= LIVE_SPINE_DRIVE_MOTION_THRESHOLD &&
      upperBodyError > LIVE_SPINE_DRIVE_REVIEW_THRESHOLD
    ) {
      failures.push({
        code: "avatar_upper_body_diverged",
        detail: `Recorded spine drive is strong (bend ${currentSpineDrive.sideBend.toFixed(2)}, lean ${currentSpineDrive.forwardLean.toFixed(2)}) but avatar upper-body error is ${upperBodyError.toFixed(2)}.`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    if (
      currentSpineDrive?.owner === "recorded-spine-model" &&
      currentAvatarDebug?.headRaw.source === "face" &&
      spineDriveMagnitude >= LIVE_SPINE_DRIVE_MOTION_THRESHOLD &&
      rawHeadMagnitude >= 0.12 &&
      headDamping > LIVE_HEAD_DAMPING_REVIEW_THRESHOLD
    ) {
      failures.push({
        code: "avatar_head_spine_diverged",
        detail: `Recorded spine motion is visible (bend ${currentSpineDrive.sideBend.toFixed(2)}, lean ${currentSpineDrive.forwardLean.toFixed(2)}) but head motion is damped from ${formatAngleDegrees(rawHeadMagnitude)} to ${formatAngleDegrees(appliedHeadMagnitude)}.`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    if (
      currentAvatarDebug?.headRaw.source === "pose" &&
      currentAvatarDebug.headRaw.confidence >= 0.75 &&
      Math.abs(currentAvatarDebug.headRaw.yaw) >= 0.65 &&
      Math.abs(currentAvatarDebug.headApplied.yaw) < 0.08
    ) {
      failures.push({
        code: "avatar_head_spine_diverged",
        detail: `Recorded pose head yaw is strong (${formatAngleDegrees(currentAvatarDebug.headRaw.yaw)}) but avatar applied yaw is nearly neutral (${formatAngleDegrees(currentAvatarDebug.headApplied.yaw)}).`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    if (
      currentAvatarDebug?.headRaw.source === "pose" &&
      currentAvatarDebug.headRaw.confidence >= 0.75 &&
      Math.abs(currentAvatarDebug.headRaw.yaw) >= 0.35 &&
      Math.sign(currentAvatarDebug.headRaw.yaw) !== Math.sign(currentAvatarDebug.headApplied.yaw) &&
      Math.abs(currentAvatarDebug.headApplied.yaw) >= 0.08
    ) {
      failures.push({
        code: "avatar_head_spine_diverged",
        detail: `Recorded pose head yaw and avatar applied yaw point in opposite directions (${formatAngleDegrees(currentAvatarDebug.headRaw.yaw)} vs ${formatAngleDegrees(currentAvatarDebug.headApplied.yaw)}).`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    if (
      lowerBodySegments >= 4 &&
      typeof lowerBodyError === "number" &&
      lowerBodyError > LIVE_LOWER_BODY_REVIEW_THRESHOLD
    ) {
      failures.push({
        code: "avatar_output_diverged",
        detail: `Live avatar lower-body direction error is ${lowerBodyError.toFixed(2)} across ${lowerBodySegments} segments.`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    return failures;
  }, [
    currentAvatarVisual?.averageLowerBodyDirectionError,
    currentAvatarVisual?.averageUpperBodyDirectionError,
    currentAvatarVisual?.comparedLowerBodySegments,
    currentAvatarVisual?.comparedUpperBodySegments,
    currentAvatarDebug?.headApplied,
    currentAvatarDebug?.headRaw,
    currentFrame?.poseBounds?.maxY,
    currentFrame?.poseBounds?.outOfFrameCount,
    currentFrame?.retarget?.sourceQuality,
    currentRetarget?.sourceQuality,
    currentSpineDrive?.forwardLean,
    currentSpineDrive?.owner,
    currentSpineDrive?.sideBend,
    footConfidence,
    legConfidence,
    safeFrameIndex,
  ]);
  const replayStudioParityFailure = useMemo<MovementReplayFailure | null>(() => {
    if (!replayStudioParity || replayStudioParity.diffs.length === 0) return null;

    return {
      code: "replay_game_path_diverged",
      detail: `Replay wrapper diverges from Studio wrapper on frame ${safeFrameIndex}: ${replayStudioParity.diffs.join("; ")}.`,
      frameIndex: safeFrameIndex,
      severity: "warning",
    };
  }, [replayStudioParity, safeFrameIndex]);
  const currentFrameFailures = [
    ...(analysis?.failures.filter((failure) => failure.frameIndex === safeFrameIndex) ?? []),
    ...liveCurrentFrameFailures,
    ...(replayStudioParityFailure ? [replayStudioParityFailure] : []),
  ];
  const frameSeverity = useMemo(() => {
    const severityByFrame = new Map<number, "error" | "warning">();
    analysis?.failures.forEach((failure) => {
      if (typeof failure.frameIndex !== "number") return;
      const currentSeverity = severityByFrame.get(failure.frameIndex);
      if (failure.severity === "error" || !currentSeverity) {
        severityByFrame.set(failure.frameIndex, failure.severity);
      }
    });
    liveCurrentFrameFailures.forEach((failure) => {
      if (typeof failure.frameIndex !== "number") return;
      const currentSeverity = severityByFrame.get(failure.frameIndex);
      if (failure.severity === "error" || !currentSeverity) {
        severityByFrame.set(failure.frameIndex, failure.severity);
      }
    });
    if (replayStudioParityFailure && typeof replayStudioParityFailure.frameIndex === "number") {
      const currentSeverity = severityByFrame.get(replayStudioParityFailure.frameIndex);
      if (replayStudioParityFailure.severity === "error" || !currentSeverity) {
        severityByFrame.set(replayStudioParityFailure.frameIndex, replayStudioParityFailure.severity);
      }
    }
    return severityByFrame;
  }, [analysis, liveCurrentFrameFailures, replayStudioParityFailure]);

  useEffect(() => {
    replayMotionFrameRef.current = currentReplayMotionFrame;
  }, [currentReplayMotionFrame]);

  useEffect(() => {
    replayMotionRef.current = currentFrame
      ? {
          landmarks: currentFrame.tracking.pose,
          worldLandmarks: currentFrame.tracking.worldPose.length > 0
            ? currentFrame.tracking.worldPose
            : null,
        }
      : null;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawMovementSkeleton(ctx, frameLandmarks(currentFrame), canvas.width, canvas.height);
  }, [currentFrame]);

  useEffect(() => {
    if (!replaySession) {
      setCurrentAvatarDebug(null);
      setCurrentAvatarVisual(undefined);
      return undefined;
    }

    const interval = window.setInterval(() => {
      const debugState = replayAvatarDebugRef.current;
      setCurrentAvatarDebug(debugState);
      setCurrentAvatarVisual(debugState?.avatarVisual);
    }, 160);

    return () => window.clearInterval(interval);
  }, [replaySession]);

  useEffect(() => {
    if (!isPlaying || !replaySession || replaySession.samples.length <= 1) return;

    const interval = window.setInterval(() => {
      setFrameIndex((previousIndex) => {
        if (previousIndex + 1 >= replaySession.samples.length) {
          setIsPlaying(false);
          return replaySession.samples.length - 1;
        }

        return previousIndex + 1;
      });
    }, replaySession.fps ? Math.max(33, Math.round(1000 / replaySession.fps)) : 220);

    return () => window.clearInterval(interval);
  }, [isPlaying, replaySession]);

  const frameCount = replaySession?.samples.length ?? 0;
  const batchIsLoading = hasRunBatch && selectedRecordingIds.some((recordingId) => {
    const loaded = loadedRecordings[recordingId];
    return !loaded || loaded.isLoading;
  });
  const selectedCount = selectedRecordingIds.length;
  const isRunInProgress = pendingRunId !== null;
  const runStatusText = isRunInProgress
    ? batchIsLoading
      ? "Loading selected recordings..."
      : "Running replay analysis..."
    : runCompletedAt
      ? `Run ${completedRunCount} complete at ${formatRunClock(runCompletedAt)}`
      : selectedCount > 0
        ? "Ready to run selected recordings."
        : "Select recordings to run.";
  const resetRunState = () => {
    setHasRunBatch(false);
    setPendingRunId(null);
    setRunStartedAt(null);
    setRunCompletedAt(null);
  };
  const toggleRecordingSelection = (recordingId: Id<"movements">) => {
    resetRunState();
    setSelectedRecordingIds((previousIds) => (
      previousIds.includes(recordingId)
        ? previousIds.filter((id) => id !== recordingId)
        : [...previousIds, recordingId]
    ));
  };
  const selectLatestRecordings = () => {
    const latestIds = recordings?.slice(0, 5).map((recording) => recording._id) ?? [];
    resetRunState();
    setSelectedRecordingIds(latestIds);
    setFrameIndex(0);
    setIsPlaying(false);
  };
  const runAlignmentBatch = () => {
    const startedAt = Date.now();
    const firstSelectedId = selectedRecordingIds[0] ?? null;
    setHasRunBatch(true);
    setPendingRunId(startedAt);
    setRunStartedAt(startedAt);
    setRunCompletedAt(null);
    setSelectedRecordingId(firstSelectedId);
    setIsPlaying(Boolean(firstSelectedId));
    setFrameIndex(0);
  };

  useEffect(() => {
    if (pendingRunId === null) return;
    if (selectedCount === 0 || batchIsLoading || batchReplaySessions.length < selectedCount) return;

    const timer = window.setTimeout(() => {
      setPendingRunId(null);
      setRunCompletedAt(Date.now());
      setCompletedRunCount((count) => count + 1);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [batchIsLoading, batchReplaySessions.length, pendingRunId, selectedCount]);

  const captureDisabled = frameCount === 0 || captureMode !== null;
  const captureAvatarFrame = async () => {
    if (!replaySceneRef.current || !replaySession) return;

    setIsPlaying(false);
    setCaptureMode("scene");
    setCaptureStatus("Capturing avatar replay frame...");

    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(replaySceneRef.current, {
        backgroundColor: "#07070b",
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
      });

      downloadDataUrl(
        captureFileName(activeRecordingId, `avatar-frame-${safeFrameIndex}.png`),
        canvas.toDataURL("image/png"),
      );
      setCaptureStatus(`Captured avatar frame ${safeFrameIndex}.`);
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : "Avatar capture failed.");
    } finally {
      setCaptureMode(null);
    }
  };

  const captureSourceStrip = () => {
    if (!replaySession) return;

    setIsPlaying(false);
    setCaptureMode("strip");
    setCaptureStatus("Capturing source skeleton strip...");

    try {
      const indexes = selectStripFrameIndexes(frameCount, safeFrameIndex, analysis?.failures ?? []);
      const panelWidth = 420;
      const panelHeight = 260;
      const labelHeight = 38;
      const stripCanvas = document.createElement("canvas");
      const tempCanvas = document.createElement("canvas");
      const stripContext = stripCanvas.getContext("2d");
      const tempContext = tempCanvas.getContext("2d");

      if (!stripContext || !tempContext || indexes.length === 0) {
        setCaptureStatus("Source strip capture failed.");
        return;
      }

      tempCanvas.width = panelWidth;
      tempCanvas.height = panelHeight;
      stripCanvas.width = panelWidth * indexes.length;
      stripCanvas.height = panelHeight + labelHeight;

      stripContext.fillStyle = "#07070b";
      stripContext.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
      stripContext.font = "16px ui-monospace, SFMono-Regular, Menlo, monospace";
      stripContext.textBaseline = "middle";

      indexes.forEach((index, stripIndex) => {
        const frame = replaySession.samples[index];
        const x = stripIndex * panelWidth;
        drawMovementSkeleton(tempContext, frameLandmarks(frame), panelWidth, panelHeight);
        stripContext.fillStyle = "#111118";
        stripContext.fillRect(x, 0, panelWidth, labelHeight);
        stripContext.fillStyle = index === safeFrameIndex ? "#f6ccbe" : "#d7d7dd";
        stripContext.fillText(`frame ${index}`, x + 14, labelHeight / 2);
        stripContext.drawImage(tempCanvas, x, labelHeight);
      });

      downloadDataUrl(
        captureFileName(activeRecordingId, "source-strip.png"),
        stripCanvas.toDataURL("image/png"),
      );
      setCaptureStatus(`Captured source strip: ${indexes.join(", ")}.`);
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : "Source strip capture failed.");
    } finally {
      setCaptureMode(null);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as Window & {
      __movementReplayLabDebug?: unknown;
    }).__movementReplayLabDebug = {
      avatarVisual: currentAvatarVisual ?? null,
      debug: currentAvatarDebug,
      frameIndex: safeFrameIndex,
      parity: replayStudioParity,
      retarget: currentRetarget ?? null,
    };
  }, [currentAvatarDebug, currentAvatarVisual, currentRetarget, replayStudioParity, safeFrameIndex]);

  return (
    <>
      <Header />
      <div
        className="flex min-h-[calc(100dvh-92px)] flex-col gap-2"
        data-active-session-id={activeRecordingId ?? ""}
        data-avatar-lower-error={currentAvatarVisual?.averageLowerBodyDirectionError ?? ""}
        data-avatar-root-applied-x={currentAvatarDebug?.avatarRoot?.appliedX ?? ""}
        data-avatar-root-applied-yaw={currentAvatarDebug?.avatarRoot?.appliedYaw ?? ""}
        data-avatar-root-applied-z={currentAvatarDebug?.avatarRoot?.appliedZ ?? ""}
        data-avatar-root-source={currentAvatarDebug?.avatarRoot?.source ?? ""}
        data-avatar-root-target-x={currentAvatarDebug?.avatarRoot?.targetX ?? ""}
        data-avatar-root-target-yaw={currentAvatarDebug?.avatarRoot?.targetYaw ?? ""}
        data-avatar-root-target-z={currentAvatarDebug?.avatarRoot?.targetZ ?? ""}
        data-avatar-upper-error={currentAvatarVisual?.averageUpperBodyDirectionError ?? ""}
        data-coverage-blocked-count={analysis?.coverage.summary.blockedFamilies.length ?? ""}
        data-coverage-blocked-families={analysis?.coverage.summary.blockedFamilies.join(",") ?? ""}
        data-coverage-demo-ready-count={analysis?.coverage.summary.demoReadyCount ?? ""}
        data-coverage-demo-ready-percent={analysis?.coverage.summary.demoReadyPercent ?? ""}
        data-coverage-explicit-count={analysis?.coverage.summary.explicitStatusCount ?? ""}
        data-coverage-family-count={analysis?.coverage.summary.familyCount ?? ""}
        data-coverage-implemented-count={analysis?.coverage.summary.implementedCount ?? ""}
        data-coverage-implemented-percent={analysis?.coverage.summary.implementedPercent ?? ""}
        data-coverage-missing-proof-count={analysis?.coverage.summary.missingProofCount ?? ""}
        data-coverage-missing-proof-families={analysis?.coverage.summary.missingProofFamilies.join(",") ?? ""}
        data-coverage-phase-complete={analysis?.coverage.summary.phaseComplete ?? ""}
        data-coverage-remaining-gap-count={analysis?.coverage.summary.remainingGapCount ?? ""}
        data-coverage-unsupported-count={analysis?.coverage.summary.unsupportedCount ?? ""}
        data-coverage-unsupported-families={analysis?.coverage.summary.unsupportedFamilies.join(",") ?? ""}
        data-exercise-pose-average-quality-score={analysis?.metrics.averageExercisePoseQualityScore ?? ""}
        data-exercise-pose-diagnostic-frame-count={analysis?.metrics.exercisePoseDiagnosticFrameCount ?? ""}
        data-exercise-pose-moderate-frame-count={analysis?.metrics.exercisePoseModerateFrameCount ?? ""}
        data-exercise-pose-strict-frame-count={analysis?.metrics.exercisePoseStrictFrameCount ?? ""}
        data-camera-confidence-lost-frame-count={analysis?.metrics.cameraConfidenceLostFrameCount ?? ""}
        data-camera-confidence-partial-frame-count={analysis?.metrics.cameraConfidencePartialFrameCount ?? ""}
        data-camera-confidence-ready-frame-count={analysis?.metrics.cameraConfidenceReadyFrameCount ?? ""}
        data-camera-confidence-uncertain-frame-count={analysis?.metrics.cameraConfidenceUncertainFrameCount ?? ""}
        data-camera-help-event-count={analysis?.metrics.cameraHelpEventCount ?? ""}
        data-camera-score-allowed-frame-count={analysis?.metrics.cameraScoreAllowedFrameCount ?? ""}
        data-current-camera-help-events={currentSourceFrame?.cameraHelpEvents.join(",") ?? ""}
        data-current-camera-reasons={currentSourceFrame?.cameraReasons.join(",") ?? ""}
        data-current-camera-score={currentSourceFrame?.cameraScore ?? ""}
        data-current-camera-state={currentSourceFrame?.cameraState ?? ""}
        data-current-frame-visibility={currentSourceFrame?.frameVisibility ?? ""}
        data-current-score-allowed={currentSourceFrame?.scoreAllowed ?? ""}
        data-current-source-origin={currentSourceFrame?.sourceOrigin ?? ""}
        data-current-source-status={currentSourceFrame?.sourceStatus ?? ""}
        data-current-start-readiness={currentSourceFrame?.startReadinessState ?? ""}
        data-current-start-readiness-blocked-reasons={currentSourceFrame?.blockedReasons.join(",") ?? ""}
        data-current-start-readiness-prompts={currentSourceFrame?.promptEvents.join(",") ?? ""}
        data-current-visible-body-parts={currentSourceFrame?.visibleBodyParts.join(",") ?? ""}
        data-gameplay-clear-movement-event-count={analysis?.metrics.gameplayClearMovementEventCount ?? ""}
        data-gameplay-score-delta-total={analysis?.metrics.gameplayScoreDeltaTotal ?? ""}
        data-gameplay-tracking-uncertainty-event-count={analysis?.metrics.gameplayTrackingUncertaintyEventCount ?? ""}
        data-head-applied-yaw={currentAvatarDebug?.headApplied?.yaw ?? ""}
        data-head-owner={currentAvatarDebug?.fallbacks.head ?? ""}
        data-head-raw-confidence={currentAvatarDebug?.headRaw?.confidence ?? ""}
        data-head-raw-source={currentAvatarDebug?.headRaw?.source ?? ""}
        data-head-raw-yaw={currentAvatarDebug?.headRaw?.yaw ?? ""}
        data-leg-raise-applied-depth={currentLegRaise?.appliedDepth ?? ""}
        data-leg-raise-expires-in-ms={currentLegRaise?.expiresInMs ?? ""}
        data-leg-raise-hold-active={currentLegRaise?.holdActive ?? ""}
        data-leg-raise-raw-left-depth={currentLegRaise?.rawLeftDepth ?? ""}
        data-leg-raise-raw-right-depth={currentLegRaise?.rawRightDepth ?? ""}
        data-leg-raise-side={currentLegRaise?.side ?? ""}
        data-current-frame-index={safeFrameIndex}
        data-frame-count={frameCount}
        data-game-lower-body-target-can-use-player-retarget-leg-raise={currentGamePathFrame?.lowerBodyTargetCanUsePlayerRetargetLegRaise ?? ""}
        data-game-lower-body-target-instructor-motion={currentGamePathFrame?.lowerBodyTargetInstructorMotion ?? ""}
        data-game-lower-body-target-player-retarget-motion={currentGamePathFrame?.lowerBodyTargetPlayerRetargetMotion ?? ""}
        data-game-lower-body-target-should-hold-player-squat={currentGamePathFrame?.lowerBodyTargetShouldHoldPlayerSquat ?? ""}
        data-game-lower-body-target-stage={currentGamePathFrame?.lowerBodyTargetStage ?? ""}
        data-lower-owner={liveLowerOwner ?? ""}
        data-retarget-left-knee={currentRetarget?.leftKneeLift ?? ""}
        data-retarget-right-knee={currentRetarget?.rightKneeLift ?? ""}
        data-root-heading-confidence={currentRootMotionFrame?.headingConfidence ?? ""}
        data-root-heading-yaw={currentRootMotionFrame?.headingYaw ?? ""}
        data-root-intent-key={currentRootMotionFrame?.intent.key ?? ""}
        data-root-intent-label={currentRootMotionFrame?.intent.label ?? ""}
        data-root-intent-planted-foot={currentRootMotionFrame?.intent.plantedFoot ?? ""}
        data-root-intent-swing-foot={currentRootMotionFrame?.intent.swingFoot ?? ""}
        data-root-intent-travel-direction={currentRootMotionFrame?.intent.travelDirection ?? ""}
        data-root-intent-travel-distance={currentRootMotionFrame?.intent.travelDistance ?? ""}
        data-root-jump-count={analysis?.metrics.rootMotionJumpFrameCount ?? ""}
        data-root-jump-response-count={analysis?.metrics.rootMotionJumpResponseFrameCount ?? ""}
        data-root-jump-response-offset={currentGamePathFrame?.rootMotionJumpResponseHeightOffset ?? ""}
        data-root-jump-response-owner={currentGamePathFrame?.rootMotionJumpResponseOwner ?? ""}
        data-root-path-distance={currentRootPathDistance ?? ""}
        data-root-pivot-count={analysis?.metrics.rootMotionPivotFrameCount ?? ""}
        data-root-position-confidence={currentRootMotionFrame?.rootPositionConfidence ?? ""}
        data-root-source={currentRootMotionFrame?.debug.source ?? ""}
        data-root-source-limited-count={analysis?.rootMotion.sourceLimitedFrameCount ?? ""}
        data-root-step-count={analysis?.metrics.rootMotionStepEventFrameCount ?? ""}
        data-root-step-response-count={analysis?.metrics.rootMotionStepResponseFrameCount ?? ""}
        data-root-step-response-offset={currentGamePathFrame?.rootMotionStepResponseFootLiftOffset ?? ""}
        data-root-step-response-owner={currentGamePathFrame?.rootMotionStepResponseOwner ?? ""}
        data-root-step-response-side={currentGamePathFrame?.rootMotionStepResponseSide ?? ""}
        data-root-travel-count={analysis?.metrics.rootMotionTravelFrameCount ?? ""}
        data-root-turn-count={analysis?.metrics.rootMotionTurnFrameCount ?? ""}
        data-root-weight-transfer-count={analysis?.metrics.rootMotionWeightTransferFrameCount ?? ""}
        data-root-world-count={analysis?.rootMotion.worldLandmarkFrameCount ?? ""}
        data-start-readiness-blocked-frame-count={analysis?.metrics.startReadinessBlockedFrameCount ?? ""}
        data-start-readiness-can-start-game-frame-count={analysis?.metrics.startReadinessCanStartGameFrameCount ?? ""}
        data-start-readiness-ready-frame-count={analysis?.metrics.startReadinessReadyFrameCount ?? ""}
        data-spine-owner={currentSpineDrive?.owner ?? ""}
        data-spine-side-bend={currentSpineDrive?.sideBend ?? ""}
        data-testid="movement-replay-lab"
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
              <ListChecks className="h-5 w-5 text-brand" />
              Replay Alignment
            </h1>
            <p className="mt-0.5 text-xs text-secondary">
              Run selected recordings against the current avatar alignment code.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-[10px] border border-border-dim bg-sidebar/50 px-3 py-2 text-xs text-secondary">
            {hasRunBatch && batchSummary.errors === 0 && batchSummary.warnings === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-[#a8d5ba]" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-[#f6ccbe]" />
            )}
            <span>
              {getBatchStatusLabel({
                hasRunBatch,
                selectedCount,
                summary: batchSummary,
                total: batchAnalyses.length,
              })}
            </span>
          </div>
        </div>

        <section className="grid gap-2 rounded-[8px] border border-border-dim bg-sidebar/35 p-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-1 text-xs font-bold uppercase tracking-wide text-foreground">Batch</h2>
            {[
              ["Selected", selectedCount, "text-foreground"],
              ["Clean", hasRunBatch ? batchSummary.clean : "--", "text-[#a8d5ba]"],
              ["Visual", hasRunBatch ? `${Math.round(batchSummary.visualMatchScore * 100)}%` : "--", "text-[#f6ccbe]"],
              ["Errors", hasRunBatch ? batchSummary.errors : "--", "text-[#f28b82]"],
              ["Warnings", hasRunBatch ? batchSummary.warnings : "--", "text-[#f6ccbe]"],
            ].map(([label, value, valueClass]) => (
              <div
                key={label}
                className="min-w-[74px] rounded-[8px] border border-border-dim bg-background/45 px-2 py-1.5"
              >
                <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
                <div className={`text-base font-bold leading-tight ${valueClass}`}>{value}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button
                type="button"
                onClick={selectLatestRecordings}
                disabled={!recordings || recordings.length === 0 || isRunInProgress}
                className="h-8 rounded-[8px] border border-border-dim px-3 text-xs font-semibold text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select Latest 5
              </button>
              <button
                type="button"
                onClick={runAlignmentBatch}
                disabled={selectedCount === 0 || isRunInProgress}
                className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#f6ccbe] px-3 text-xs font-bold text-[#17131d] transition-colors hover:bg-[#f7efe7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRunInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                {isRunInProgress ? "Running..." : "Run Selected Recordings"}
              </button>
            </div>
            <div
              className="min-h-4 text-right text-[11px] text-secondary"
              data-testid="movement-replay-run-status"
            >
              {runStatusText}
              {isRunInProgress && runStartedAt ? ` Started ${formatRunClock(runStartedAt)}.` : ""}
            </div>
          </div>
        </section>

        <section className="rounded-[8px] border border-border-dim bg-sidebar/35 p-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Recordings</h2>
            <span className="text-xs text-muted">{selectedCount} selected</span>
          </div>

          <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
            {!recordings ? (
              <div className="min-w-[260px] rounded-[8px] border border-border-dim bg-background/60 p-3 text-sm text-secondary">
                Loading saved recordings...
              </div>
            ) : recordings.length === 0 ? (
              <div className="min-w-[260px] rounded-[8px] border border-border-dim bg-background/60 p-3 text-sm text-secondary">
                No saved movement recordings found.
              </div>
            ) : recordings.map((recording) => {
              const selected = recording._id === activeRecordingId;
              const included = selectedRecordingIds.includes(recording._id);
              const recordingAnalysis = analysisByRecordingId.get(recording._id);
              const loaded = loadedRecordings[recording._id];
              const frameTotal = loaded?.session?.sampleCount ?? recording.frameCount ?? 0;
              return (
                <div
                  key={recording._id}
                  className={`grid min-w-[230px] max-w-[250px] grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-[8px] border p-2 transition-colors ${
                    selected
                      ? "border-[#f6ccbe]/60 bg-[#f6ccbe]/10 text-foreground"
                      : "border-border-dim bg-background/50 text-secondary hover:border-border"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => toggleRecordingSelection(recording._id)}
                    aria-label={`Select recording ${recording.title}`}
                    className="mt-0.5 h-4 w-4 accent-[#f6ccbe]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRecordingId(recording._id);
                      setFrameIndex(0);
                      setIsPlaying(false);
                    }}
                    className="min-w-0 text-left"
                    data-session-id={recording._id}
                    data-testid="movement-replay-session"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-semibold text-foreground">{recording.title}</span>
                      <span className="shrink-0 font-mono text-[11px]">{frameTotal}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted">
                        {formatTime(recording.createdAt)} · {formatDuration(recording.durationMs)}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        recordingAnalysis?.pass && countFailures(recordingAnalysis, "warning") === 0
                          ? "bg-[#a8d5ba]/15 text-[#a8d5ba]"
                          : recordingAnalysis
                            ? "bg-[#f6ccbe]/15 text-[#f6ccbe]"
                            : "bg-white/5 text-muted"
                      }`}
                      >
                        {loaded?.isLoading ? "Loading" : loaded?.error ? "Load failed" : getRecordingLabel(recordingAnalysis)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-secondary">
                      {recordingAnalysis
                        ? `${Math.round(recordingAnalysis.metrics.visualMatchScore * 100)}% match, ${recordingAnalysis.metrics.strongFullBodyFrameCount} strong, ${recordingAnalysis.metrics.supportConstraintPartialFrameCount} partial support`
                        : loaded?.error ?? `${recording.difficulty} · ${recording.spineGoal ?? "uncategorized"}`}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <main className="flex min-h-0 flex-1 flex-col gap-2">
          <section className="grid shrink-0 gap-2 lg:grid-cols-3 xl:grid-cols-6">
            {inspectorCards.map((card) => (
              <div
                key={card.label}
                className="min-w-0 rounded-[8px] border border-border-dim bg-sidebar/35 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{card.label}</h2>
                  <span className="truncate font-mono text-[11px] text-secondary">{card.secondary}</span>
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-foreground">{card.primary}</div>
                <div className="truncate font-mono text-[11px] text-secondary">{card.detail}</div>
              </div>
            ))}
          </section>

          <section className="grid min-h-[1040px] flex-1 gap-2 2xl:min-h-[1180px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-h-0 flex-col gap-2">
              <section
                ref={replaySceneRef}
                className="relative min-h-[940px] flex-1 overflow-hidden rounded-[8px] border border-border-dim bg-[#07070b] 2xl:min-h-[1080px]"
                data-testid="movement-replay-avatar-section"
              >
                <div className="grid h-full min-h-0 grid-rows-2 gap-px bg-border-dim">
                  <div className="relative min-h-0 bg-[#07070b]">
                    <div className="absolute left-3 top-3 z-10 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-secondary">
                      Source
                    </div>
                    <canvas
                      ref={canvasRef}
                      width={1280}
                      height={720}
                      className="absolute inset-0 h-full w-full object-contain"
                      data-testid="movement-replay-source-canvas"
                    />
                    {!replaySession && (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-secondary">
                        {replayIsLoading ? "Loading recording..." : replayLoadError ?? "Select a saved movement recording"}
                      </div>
                    )}
                  </div>
                  <div className="relative min-h-0 bg-[#07070b]" data-testid="movement-replay-avatar-scene">
                    <div className="absolute left-3 top-3 z-10 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-secondary">
                      Avatar
                    </div>
                    <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={captureAvatarFrame}
                        disabled={captureDisabled}
                        aria-label="Scene PNG"
                        className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-border-dim bg-black/40 px-2 text-[11px] font-semibold text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {captureMode === "scene" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Camera className="h-3.5 w-3.5" />
                        )}
                        Scene
                      </button>
                      <button
                        type="button"
                        onClick={captureSourceStrip}
                        disabled={captureDisabled}
                        aria-label="Source Strip"
                        className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-border-dim bg-black/40 px-2 text-[11px] font-semibold text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {captureMode === "strip" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Images className="h-3.5 w-3.5" />
                        )}
                        Strip
                      </button>
                    </div>
                    {replaySession ? (
                      <MovementMatchScene>
                        <MovementSourceSkeleton
                          color="#f6ccbe"
                          landmarksRef={replayMotionRef}
                          positionOffset={[0, 0, 0]}
                        />
                        <VrmAvatar
                          landmarksRef={replayMotionRef}
                          motionFrameRef={replayMotionFrameRef}
                          positionOffset={[0, 0, 0]}
                          isPlayer
                          isPlaying
                          motionMode="recorded"
                          name="Replay student"
                          retargetSourceModel={replayRetargetSourceModel}
                          rootMotionFrame={currentRootMotionFrame ?? null}
                          showNameLabel={false}
                          trackingCalibration={replayPlayerCalibration}
                          trackingDebugRef={replayAvatarDebugRef}
                          vrmUrl="/models/VIPE_Hero__1793.vrm"
                        />
                      </MovementMatchScene>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-secondary">
                        {replayIsLoading ? "Loading recording..." : replayLoadError ?? "Select a saved movement recording"}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/60 p-2 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => setFrameIndex((index) => clampFrame(index - 1, frameCount))}
                      disabled={frameCount <= 1}
                      aria-label="Previous frame"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPlaying((playing) => !playing)}
                      disabled={frameCount <= 1}
                      aria-label={isPlaying ? "Pause replay" : "Play replay"}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f6ccbe] text-[#17131d] transition-colors hover:bg-[#f7efe7] disabled:opacity-50"
                    >
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFrameIndex((index) => clampFrame(index + 1, frameCount))}
                      disabled={frameCount <= 1}
                      aria-label="Next frame"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </section>

              <div className="shrink-0 rounded-[8px] border border-border-dim bg-sidebar/35 p-2">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max={Math.max(frameCount - 1, 0)}
                    value={safeFrameIndex}
                    onChange={(event) => {
                      setIsPlaying(false);
                      setFrameIndex(Number.parseInt(event.target.value, 10));
                    }}
                    className="min-w-[220px] flex-1 accent-[#f6ccbe]"
                  />
                  <span className="min-w-[96px] text-right font-mono text-xs text-secondary">
                    {safeFrameIndex} / {Math.max(frameCount - 1, 0)}
                  </span>
                </div>
                <div
                  className="mt-2 grid min-w-full gap-1 overflow-x-auto"
                  style={{ gridTemplateColumns: `repeat(${Math.max(frameCount, 1)}, minmax(8px, 1fr))` }}
                >
                  {replaySession?.samples.map((sample, index) => {
                    const severity = frameSeverity.get(index);
                    const quality = sample.retarget?.sourceQuality ?? 0;
                    const selected = index === safeFrameIndex;
                    const markerClass = selected
                      ? "border-[#f6ccbe] bg-[#f6ccbe]"
                      : severity === "error"
                        ? "border-[#f28b82] bg-[#f28b82]/70"
                        : severity === "warning"
                          ? "border-[#f6ccbe] bg-[#f6ccbe]/45"
                          : quality >= 0.8
                            ? "border-[#a8d5ba] bg-[#a8d5ba]/50"
                            : "border-border-dim bg-background";

                    return (
                      <button
                        key={`frame-${index}`}
                        type="button"
                        onClick={() => {
                          setIsPlaying(false);
                          setFrameIndex(index);
                        }}
                        aria-label={`Show frame ${index}`}
                        className={`h-4 rounded-[5px] border transition-transform hover:-translate-y-0.5 ${markerClass}`}
                        data-frame-index={index}
                        data-testid="movement-replay-frame"
                        title={`Frame ${index} quality ${formatNumber(quality)}`}
                      />
                    );
                  }) ?? (
                    <div className="h-4 rounded-[5px] border border-border-dim bg-background" />
                  )}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[8px] border border-border-dim bg-sidebar/35 p-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Current Frame</h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <dt className="text-muted">Health</dt>
                  <dd className="text-right text-secondary">{currentFrame?.health?.primaryAction ?? "--"}</dd>
                  <dt className="text-muted">Lower owner</dt>
                  <dd className="text-right text-secondary">
                    {currentFrame ? extractOwner(currentFrame.fallbacks, "lower") : "--"}
                  </dd>
                  <dt className="text-muted">Feet owner</dt>
                  <dd className="text-right text-secondary">
                    {currentFrame ? extractOwner(currentFrame.fallbacks, "feet") : "--"}
                  </dd>
                  <dt className="text-muted">Quality</dt>
                  <dd className="text-right text-secondary">{formatNumber(currentFrame?.retarget?.sourceQuality)}</dd>
                  <dt className="text-muted">Squat / hip</dt>
                  <dd className="text-right text-secondary">
                    {formatNumber(currentFrame?.retarget?.squatDepth)} / {formatNumber(currentFrame?.retarget?.hipDrop)}
                  </dd>
                  <dt className="text-muted">Bounds y</dt>
                  <dd className="text-right text-secondary">
                    {formatNumber(currentFrame?.poseBounds?.minY)}..{formatNumber(currentFrame?.poseBounds?.maxY)}
                  </dd>
                  <dt className="text-muted">Out of frame</dt>
                  <dd className="text-right text-secondary">{currentFrame?.poseBounds?.outOfFrameCount ?? "--"}</dd>
                </dl>

                <div className="mt-2 border-t border-border-dim pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Frame Diagnostics</h3>
                    <span className="font-mono text-xs text-secondary">frame {safeFrameIndex}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <dt className="text-muted">Owners</dt>
                    <dd className="text-right font-mono text-secondary">
                      h {currentFallbacks?.head ?? "--"} · t {currentFallbacks?.spine ?? "--"}
                    </dd>
                    <dt className="text-muted">Lower / feet</dt>
                    <dd className="text-right font-mono text-secondary">
                      {liveLowerOwner ?? "--"} · {liveFeetOwner ?? "--"}
                    </dd>
                    <dt className="text-muted">Arms</dt>
                    <dd className="text-right font-mono text-secondary">
                      L {currentFallbacks?.leftArm ?? "--"} · R {currentFallbacks?.rightArm ?? "--"}
                    </dd>
                    <dt className="text-muted">Confidence</dt>
                    <dd className="text-right font-mono text-secondary">
                      h {formatNumber(currentBodyConfidence?.head)} · t {formatNumber(currentBodyConfidence?.torso)}
                    </dd>
                    <dt className="text-muted">Spine drive</dt>
                    <dd className="text-right font-mono text-secondary">
                      b {formatNumber(currentSpineDrive?.sideBend)} · l {formatNumber(currentSpineDrive?.forwardLean)}
                    </dd>
                    <dt className="text-muted">Avatar upper</dt>
                    <dd className="text-right font-mono text-secondary">
                      e {formatNumber(currentAvatarVisual?.averageUpperBodyDirectionError)} · s {currentAvatarVisual?.comparedUpperBodySegments ?? "--"}
                    </dd>
                    <dt className="text-muted">Arm / leg / foot</dt>
                    <dd className="text-right font-mono text-secondary">
                      {formatNumber(armConfidence)} · {formatNumber(legConfidence)} · {formatNumber(footConfidence)}
                    </dd>
                    <dt className="text-muted">Retarget</dt>
                    <dd className="text-right font-mono text-secondary">
                      q {formatNumber(currentRetarget?.sourceQuality ?? currentFrame?.retarget?.sourceQuality)} · upper {currentRetarget?.appliedUpperBody ?? "--"}/{currentRetarget?.totalUpperBody ?? "--"} · lower {currentRetarget?.appliedLowerBody ?? "--"}/{currentRetarget?.totalLowerBody ?? "--"}
                    </dd>
                    <dt className="text-muted">Knees</dt>
                    <dd className="text-right font-mono text-secondary">
                      {formatNumber(currentRetarget?.leftKneeLift ?? currentFrame?.retarget?.leftKneeLift)} / {formatNumber(currentRetarget?.rightKneeLift ?? currentFrame?.retarget?.rightKneeLift)}
                    </dd>
                    <dt className="text-muted">Head source</dt>
                    <dd className="text-right font-mono text-secondary">
                      {currentAvatarDebug?.headRaw.source ?? "--"} / {formatNumber(currentAvatarDebug?.headRaw.confidence)}
                    </dd>
                    <dt className="text-muted">Head raw</dt>
                    <dd className="text-right font-mono text-secondary">{formatAnglesCompact(currentAvatarDebug?.headRaw)}</dd>
                    <dt className="text-muted">Head applied</dt>
                    <dd className="text-right font-mono text-secondary">{formatAnglesCompact(currentAvatarDebug?.headApplied)}</dd>
                  </dl>
                  <div
                    className="mt-3 rounded-[8px] border border-border-dim bg-background/35 p-2"
                    data-testid="movement-replay-game-path"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Game Decision</h3>
                      <span
                        className={`rounded-[6px] border px-2 py-0.5 font-mono text-[10px] uppercase ${
                          gamePathParityNeedsReview
                            ? "border-[#f6ccbe]/35 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                            : "border-[#a8d5ba]/25 bg-[#a8d5ba]/10 text-[#a8d5ba]"
                        }`}
                      >
                        {gamePathParityLabel}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <dt className="text-muted">Replay lower / feet</dt>
                      <dd className="text-right font-mono text-secondary">
                        {replayLowerOwner ?? "--"} · {replayFeetOwner ?? "--"}
                      </dd>
                      <dt className="text-muted">Game lower / feet</dt>
                      <dd className="text-right font-mono text-secondary">
                        {currentGamePathFrame
                          ? `${currentGamePathFrame.lowerOwner} · ${currentGamePathFrame.feetOwner}`
                          : "--"}
                      </dd>
                      <dt className="text-muted">Target stage</dt>
                      <dd className="text-right font-mono text-secondary">
                        {currentGamePathFrame?.lowerBodyTargetStage ?? "--"}
                      </dd>
                      <dt className="text-muted">Game squat / hip</dt>
                      <dd className="text-right font-mono text-secondary">
                        {formatNumber(currentGamePathFrame?.squatDepth)} / {formatNumber(currentGamePathFrame?.hipDrop)}
                      </dd>
                      <dt className="text-muted">Game knees</dt>
                      <dd className="text-right font-mono text-secondary">
                        {formatNumber(currentGamePathFrame?.leftKneeLift)} / {formatNumber(currentGamePathFrame?.rightKneeLift)}
                      </dd>
                      <dt className="text-muted">Game drive</dt>
                      <dd className="text-right font-mono text-secondary">
                        {currentGamePathFrame
                          ? `${currentGamePathFrame.shouldDrivePlayerSquat ? "squat" : currentGamePathFrame.shouldDrivePlayerLegRaise ? "leg" : "neutral"} · drop ${formatNumber(currentGamePathFrame.visualRootDrop)}`
                          : "--"}
                      </dd>
                      <dt className="text-muted">Game pose</dt>
                      <dd className="text-right font-mono text-secondary">
                        {currentGamePathFrame?.exercisePoseLabel ?? "--"}
                      </dd>
                      <dt className="text-muted">Game support</dt>
                      <dd className="text-right font-mono text-secondary">
                        {currentGamePathFrame
                          ? `${currentGamePathFrame.supportIntentLabel} · ${currentGamePathFrame.supportConstraintStatus} · ${currentGamePathFrame.supportContactOwner}`
                          : "--"}
                      </dd>
                      <dt className="text-muted">Game transition</dt>
                      <dd className="text-right font-mono text-secondary">
                        {currentGamePathFrame?.exerciseTransitionLabel ?? "--"}
                      </dd>
                      <dt className="text-muted">Jump response</dt>
                      <dd className="text-right font-mono text-secondary">
                        {currentGamePathFrame
                          ? `${currentGamePathFrame.rootMotionJumpResponseOwner} · ${formatNumber(currentGamePathFrame.rootMotionJumpResponseHeightOffset)}`
                          : "--"}
                      </dd>
                      <dt className="text-muted">Step response</dt>
                      <dd className="text-right font-mono text-secondary">
                        {currentGamePathFrame
                          ? `${currentGamePathFrame.rootMotionStepResponseOwner} · ${formatNumber(currentGamePathFrame.rootMotionStepResponseFootLiftOffset)}`
                          : "--"}
                      </dd>
                    </dl>
                    <div
                      className="mt-3 border-t border-border-dim pt-3"
                      data-testid="movement-replay-physical-path"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Physical Path</h4>
                        <span
                          className={`rounded-[6px] border px-2 py-0.5 font-mono text-[10px] uppercase ${
                            rootMotionNeedsReview
                              ? "border-[#f6ccbe]/35 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                              : "border-[#a8d5ba]/25 bg-[#a8d5ba]/10 text-[#a8d5ba]"
                          }`}
                        >
                          {rootMotionLabel}
                        </span>
                      </div>
                      <svg
                        aria-hidden="true"
                        className="mt-2 h-14 w-full overflow-visible border border-border-dim bg-black/25"
                        preserveAspectRatio="none"
                        viewBox="0 0 100 54"
                      >
                        <line x1="10" x2="90" y1="27" y2="27" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
                        <line x1="50" x2="50" y1="10" y2="44" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
                        {rootPathStrip.polyline ? (
                          <polyline
                            fill="none"
                            points={rootPathStrip.polyline}
                            stroke="#a8d5ba"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                          />
                        ) : null}
                        {currentRootPathPoint ? (
                          <circle
                            cx={currentRootPathPoint.px}
                            cy={currentRootPathPoint.py}
                            fill="#f6ccbe"
                            r="2.6"
                          />
                        ) : null}
                      </svg>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <dt className="text-muted">Source</dt>
                        <dd className="text-right font-mono text-secondary">
                          {currentRootMotionFrame?.debug.source ?? "--"}
                        </dd>
                        <dt className="text-muted">Intent</dt>
                        <dd className="text-right font-mono text-secondary">
                          {currentRootMotionFrame
                            ? `${currentRootMotionFrame.intent.label} · ${currentRootMotionFrame.intent.travelDirection}`
                            : "--"}
                        </dd>
                        <dt className="text-muted">Heading</dt>
                        <dd className="text-right font-mono text-secondary">
                          {formatAngleDegrees(currentRootMotionFrame?.headingYaw)} · q {formatNumber(currentRootMotionFrame?.headingConfidence)}
                        </dd>
                        <dt className="text-muted">Root X/Z</dt>
                        <dd className="text-right font-mono text-secondary">
                          {currentRootMotionFrame
                            ? `${formatNumber(currentRootMotionFrame.rootPosition.x)} / ${formatNumber(currentRootMotionFrame.rootPosition.z)}`
                            : "--"}
                        </dd>
                        <dt className="text-muted">Path / q</dt>
                        <dd className="text-right font-mono text-secondary">
                          {formatNumber(currentRootPathDistance)} / {formatNumber(currentRootMotionFrame?.rootPositionConfidence)}
                        </dd>
                        <dt className="text-muted">Feet</dt>
                        <dd className="text-right font-mono text-secondary">
                          {currentRootMotionFrame
                            ? `${currentRootMotionFrame.feet.left.stepPhase} · ${currentRootMotionFrame.feet.right.stepPhase}`
                            : "--"}
                        </dd>
                        <dt className="text-muted">Plant / swing</dt>
                        <dd className="text-right font-mono text-secondary">
                          {currentRootMotionFrame
                            ? `${currentRootMotionFrame.intent.plantedFoot} · ${currentRootMotionFrame.intent.swingFoot}`
                            : "--"}
                        </dd>
                        <dt className="text-muted">Batch</dt>
                        <dd className="text-right font-mono text-secondary">
                          {analysis
                            ? `${analysis.rootMotion.worldLandmarkFrameCount} world · ${analysis.rootMotion.sourceLimitedFrameCount} limited`
                            : "--"}
                        </dd>
                        <dt className="text-muted">Intent counts</dt>
                        <dd className="text-right font-mono text-secondary">
                          {analysis
                            ? `t ${analysis.metrics.rootMotionTravelFrameCount} · r ${analysis.metrics.rootMotionTurnFrameCount} · p ${analysis.metrics.rootMotionPivotFrameCount} · s ${analysis.metrics.rootMotionStepEventFrameCount} · j ${analysis.metrics.rootMotionJumpFrameCount}`
                            : "--"}
                        </dd>
                      </dl>
                      {currentRootMotionFrame?.debug.reasons.length ? (
                        <div className="mt-2 border-t border-border-dim pt-2 text-[11px] leading-relaxed text-muted">
                          {currentRootMotionFrame.debug.reasons[0]}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className="mt-3 border-t border-border-dim pt-3"
                      data-testid="movement-replay-wrapper-parity"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Wrapper Parity</h4>
                        <span
                          className={`rounded-[6px] border px-2 py-0.5 font-mono text-[10px] uppercase ${
                            replayStudioParity?.label === "diverged"
                              ? "border-[#f6ccbe]/35 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                              : "border-[#a8d5ba]/25 bg-[#a8d5ba]/10 text-[#a8d5ba]"
                          }`}
                        >
                          {replayStudioParity?.label ?? "pending"}
                        </span>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <dt className="text-muted">Replay decision</dt>
                        <dd className="text-right font-mono text-secondary">
                          {replayStudioParity
                            ? `${replayStudioParity.replay.lowerOwner} · ${replayStudioParity.replay.feetOwner} · ${replayStudioParity.replay.spineOwner}`
                            : "--"}
                        </dd>
                        <dt className="text-muted">Studio decision</dt>
                        <dd className="text-right font-mono text-secondary">
                          {replayStudioParity
                            ? `${replayStudioParity.studio.lowerOwner} · ${replayStudioParity.studio.feetOwner} · ${replayStudioParity.studio.spineOwner}`
                            : "--"}
                        </dd>
                        <dt className="text-muted">Parity</dt>
                        <dd className="text-right font-mono text-secondary">
                          {replayStudioParity
                            ? replayStudioParity.diffs.length === 0
                              ? "matching"
                              : `${replayStudioParity.diffs.length} diff${replayStudioParity.diffs.length === 1 ? "" : "s"}`
                            : "--"}
                        </dd>
                      </dl>
                      {replayStudioParity && replayStudioParity.diffs.length > 0 ? (
                        <div className="mt-2 flex flex-col gap-1">
                          {replayStudioParity.diffs.slice(0, 4).map((diff) => (
                            <div
                              key={diff}
                              className="rounded-[6px] border border-[#f6ccbe]/20 bg-[#f6ccbe]/10 px-2 py-1 font-mono text-[10px] text-[#f6ccbe]"
                            >
                              {diff}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <details className="mt-3 rounded-[8px] border border-border-dim bg-background/35 p-2 text-xs text-secondary">
                    <summary className="cursor-pointer font-semibold uppercase tracking-wide text-muted">
                      Raw points
                    </summary>
                    <dl className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono">
                      <dt>Nose</dt>
                      <dd className="truncate">{formatPoint(currentNose)}</dd>
                      <dt>Left ear</dt>
                      <dd className="truncate">{formatPoint(currentLeftEar)}</dd>
                      <dt>Right ear</dt>
                      <dd className="truncate">{formatPoint(currentRightEar)}</dd>
                    </dl>
                  </details>
                </div>

                <div className="mt-2 border-t border-border-dim pt-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Frame Flags</h3>
                  <div className="mt-2 flex flex-col gap-2">
                    {currentFrameFailures.length === 0 ? (
                      <div className="rounded-[8px] border border-[#a8d5ba]/20 bg-[#a8d5ba]/10 p-2 text-xs text-[#a8d5ba]">
                        No current-code flags.
                      </div>
                    ) : currentFrameFailures.map((failure, index) => (
                      <div
                        key={`${failure.code}-${index}`}
                        className="rounded-[8px] border border-[#f6ccbe]/20 bg-[#f6ccbe]/10 p-2 text-xs text-[#f6ccbe]"
                      >
                        <div className="font-mono">{failure.code}</div>
                        <div className="mt-1 text-secondary">{failure.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {captureStatus && (
              <div className="rounded-[8px] border border-border-dim bg-sidebar/35 px-3 py-2 text-xs text-secondary">
                {captureStatus}
              </div>
            )}

            <section className="hidden">
              <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Visual Match</h2>
                <div className="mt-3 text-3xl font-bold text-foreground">
                  {analysis ? `${Math.round(analysis.metrics.visualMatchScore * 100)}%` : "--"}
                </div>
                <div className="mt-2 text-xs text-secondary">
                  {analysis ? `${analysis.metrics.visualReliableFrameCount}/${analysis.summary.frameCount} reliable frames, ${Math.round(analysis.metrics.visualMotionCoverage * 100)}% motion coverage` : "Waiting for data"}
                </div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Code Result</h2>
                <div className="mt-3 text-3xl font-bold text-foreground">
                  {analysis
                    ? countFailures(analysis, "error") > 0
                      ? "FAIL"
                      : countFailures(analysis, "warning") > 0
                        ? "REVIEW"
                        : "CLEAN"
                    : "--"}
                </div>
                <div className="mt-2 text-xs text-secondary">
                  {analysis
                    ? `${countFailures(analysis, "error")} errors, ${countFailures(analysis, "warning")} warnings, ${analysis.metrics.strongFullBodyFrameCount} strong full-body frames, ${analysis.metrics.supportConstraintPartialFrameCount} partial support frames`
                    : "Waiting for data"}
                </div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Avatar Output</h2>
                <div className="mt-3 text-3xl font-bold text-foreground">
                  {analysis?.metrics.avatarVisualFrameCount
                    ? formatNumber(analysis.metrics.averageAvatarLowerBodyDirectionError)
                    : typeof currentAvatarVisual?.averageLowerBodyDirectionError === "number"
                      ? formatNumber(currentAvatarVisual.averageLowerBodyDirectionError)
                    : "--"}
                </div>
                <div className="mt-2 text-xs text-secondary">
                  {analysis?.metrics.avatarVisualFrameCount
                    ? `${analysis.metrics.avatarVisualFrameCount} frames with VRM bone telemetry`
                    : currentAvatarVisual
                      ? `${currentAvatarVisual.comparedLowerBodySegments} live VRM segments on current frame`
                    : "Run a recording to read live VRM bone telemetry"}
                </div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Retarget</h2>
                <div className="mt-3 text-3xl font-bold text-foreground">
                  {formatNumber(analysis?.metrics.averageRetargetQuality)}
                </div>
                <div className="mt-2 text-xs text-secondary">
                  avg quality, {analysis?.metrics.lowerBodyOwnerTransitions ?? 0} lower-owner transitions
                </div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Support</h2>
                <div className="mt-3 text-3xl font-bold text-foreground">
                  {analysis ? analysis.metrics.supportConstraintPartialFrameCount : "--"}
                </div>
                <div className="mt-2 text-xs text-secondary">
                  {analysis
                    ? `${analysis.metrics.supportConstraintActiveFrameCount} active, ${analysis.metrics.supportContactCorrectionFrameCount} corrected, ${analysis.metrics.supportPresentationAppliedFrameCount} presented, ${analysis.metrics.supportConstraintMissingFrameCount} missing`
                    : "Waiting for support constraints"}
                </div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Bounds</h2>
                <div className="mt-3 text-3xl font-bold text-foreground">
                  {formatNumber(analysis?.metrics.averageOutOfFrameCount)}
                </div>
                <div className="mt-2 text-xs text-secondary">
                  avg out-of-frame, max {analysis?.metrics.maxOutOfFrameCount ?? "--"}
                </div>
              </div>
            </section>

            <section className="rounded-[8px] border border-border-dim bg-sidebar/35 p-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Flag Review</h2>
                <span className="text-xs text-muted">
                  {analysis ? `${analysis.failures.length} flags · ${failureGroups.length} types` : "Waiting for analysis"}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {!analysis ? (
                  <div className="text-sm text-secondary">Waiting for analysis.</div>
                ) : failureGroups.length === 0 ? (
                  <div className="rounded-[8px] border border-[#a8d5ba]/20 bg-[#a8d5ba]/10 p-3 text-sm text-[#a8d5ba]">
                    No replay flags for this stored recording.
                  </div>
                ) : failureGroups.map((group) => (
                  <div
                    key={group.code}
                    className="rounded-[8px] border border-border-dim bg-background/50 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-xs text-[#f6ccbe]">{group.code}</span>
                      <span className="text-xs uppercase tracking-wide text-muted">
                        {group.count} · {group.severity}
                        {typeof group.firstFrame === "number" ? ` · first ${group.firstFrame}` : ""}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.samples.map((failure, index) => (
                        <button
                          key={`${group.code}-${failure.frameIndex ?? "session"}-${index}`}
                          type="button"
                          onClick={() => {
                            if (typeof failure.frameIndex === "number") {
                              setIsPlaying(false);
                              setFrameIndex(failure.frameIndex);
                            }
                          }}
                          disabled={typeof failure.frameIndex !== "number"}
                          className="rounded-[8px] border border-border-dim px-2 py-1 text-left font-mono text-[11px] text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          title={failure.detail}
                        >
                          {typeof failure.frameIndex === "number" ? `frame ${failure.frameIndex}` : "session"}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-secondary">{group.samples[0]?.detail}</div>
                  </div>
                ))}
              </div>
            </section>
          </main>
        </div>
    </>
  );
}
