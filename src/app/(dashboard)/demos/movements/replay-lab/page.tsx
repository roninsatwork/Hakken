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
} from "../_lib/movementReplayAnalyzer";
import {
  loadMovementReplayRecording,
  type MovementReplayRecordingSource,
} from "../_lib/movementRecordingReplay";
import { drawMovementSkeleton } from "../_lib/movementSkeleton";
import type { MovementTrackingDebugState } from "../_lib/movementTrackingCalibration";
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

function frameLandmarks(frame?: MovementDebugReplayFrame) {
  return frame?.tracking.pose ?? [];
}

function clampFrame(index: number, frameCount: number) {
  if (frameCount <= 0) return 0;
  return Math.max(0, Math.min(index, frameCount - 1));
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

  const safeFrameIndex = clampFrame(frameIndex, replaySession?.samples.length ?? 0);
  const currentFrame = replaySession?.samples[safeFrameIndex];
  const currentFrameFailures = analysis?.failures.filter((failure) => failure.frameIndex === safeFrameIndex) ?? [];
  const frameSeverity = useMemo(() => {
    const severityByFrame = new Map<number, "error" | "warning">();
    analysis?.failures.forEach((failure) => {
      if (typeof failure.frameIndex !== "number") return;
      const currentSeverity = severityByFrame.get(failure.frameIndex);
      if (failure.severity === "error" || !currentSeverity) {
        severityByFrame.set(failure.frameIndex, failure.severity);
      }
    });
    return severityByFrame;
  }, [analysis]);

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
      setCurrentAvatarVisual(undefined);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setCurrentAvatarVisual(replayAvatarDebugRef.current?.avatarVisual);
    }, 160);

    return () => window.clearInterval(interval);
  }, [replaySession]);

  useEffect(() => {
    if (!isPlaying || !replaySession || replaySession.samples.length <= 1) return;

    const interval = window.setInterval(() => {
      setFrameIndex((previousIndex) => (
        previousIndex + 1 >= replaySession.samples.length ? 0 : previousIndex + 1
      ));
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

  return (
    <>
      <Header />
      <div
        className="flex flex-col gap-5"
        data-active-session-id={activeRecordingId ?? ""}
        data-frame-count={frameCount}
        data-testid="movement-replay-lab"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
              <ListChecks className="h-6 w-6 text-brand" />
              Replay Alignment
            </h1>
            <p className="mt-1 text-[13px] text-secondary">
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

        <section className="grid gap-4 rounded-[8px] border border-border-dim bg-sidebar/35 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Alignment Batch</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-5">
              <div className="rounded-[8px] border border-border-dim bg-background/45 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">Selected</div>
                <div className="mt-1 text-2xl font-bold text-foreground">{selectedCount}</div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/45 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">Clean</div>
                <div className="mt-1 text-2xl font-bold text-[#a8d5ba]">{hasRunBatch ? batchSummary.clean : "--"}</div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/45 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">Visual Match</div>
                <div className="mt-1 text-2xl font-bold text-[#f6ccbe]">{hasRunBatch ? `${Math.round(batchSummary.visualMatchScore * 100)}%` : "--"}</div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/45 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">Code Errors</div>
                <div className="mt-1 text-2xl font-bold text-[#f28b82]">{hasRunBatch ? batchSummary.errors : "--"}</div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/45 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">Warnings</div>
                <div className="mt-1 text-2xl font-bold text-[#f6ccbe]">{hasRunBatch ? batchSummary.warnings : "--"}</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button
                type="button"
                onClick={selectLatestRecordings}
                disabled={!recordings || recordings.length === 0 || isRunInProgress}
                className="h-10 rounded-[8px] border border-border-dim px-3 text-xs font-semibold text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select Latest 5
              </button>
              <button
                type="button"
                onClick={runAlignmentBatch}
                disabled={selectedCount === 0 || isRunInProgress}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#f6ccbe] px-4 text-xs font-bold text-[#17131d] transition-colors hover:bg-[#f7efe7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRunInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                {isRunInProgress ? "Running..." : "Run Selected Recordings"}
              </button>
            </div>
            <div
              className="min-h-5 text-right text-xs text-secondary"
              data-testid="movement-replay-run-status"
            >
              {runStatusText}
              {isRunInProgress && runStartedAt ? ` Started ${formatRunClock(runStartedAt)}.` : ""}
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <aside className="flex flex-col gap-3 rounded-[8px] border border-border-dim bg-sidebar/35 p-3 xl:order-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Recordings</h2>
              <span className="text-xs text-muted">{selectedCount} selected</span>
            </div>

            <div className="flex max-h-[640px] flex-col gap-2 overflow-y-auto pr-1">
              {!recordings ? (
                <div className="rounded-[8px] border border-border-dim bg-background/60 p-3 text-sm text-secondary">
                  Loading saved recordings...
                </div>
              ) : recordings.length === 0 ? (
                <div className="rounded-[8px] border border-border-dim bg-background/60 p-3 text-sm text-secondary">
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
                    className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[8px] border p-3 transition-colors ${
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
                      className="mt-1 h-4 w-4 accent-[#f6ccbe]"
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
                        <span className="shrink-0 text-[11px]">{frameTotal} frames</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted">
                          {formatTime(recording.createdAt)} · {formatDuration(recording.durationMs)}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
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
                      <div className="mt-1 truncate text-[11px] text-secondary">
                        {recordingAnalysis
                          ? `${Math.round(recordingAnalysis.metrics.visualMatchScore * 100)}% visual match, ${recordingAnalysis.metrics.strongFullBodyFrameCount} strong frames`
                          : loaded?.error ?? `${recording.difficulty} · ${recording.spineGoal ?? "uncategorized"}`}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          <main className="flex flex-col gap-5 xl:order-1">
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex flex-col gap-3">
                <div className="relative aspect-video overflow-hidden rounded-[8px] border border-border-dim bg-[#07070b]">
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

                <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-border-dim bg-sidebar/35 p-3">
                  <button
                    type="button"
                    onClick={() => setIsPlaying((playing) => !playing)}
                    disabled={frameCount <= 1}
                    aria-label={isPlaying ? "Pause replay" : "Play replay"}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f6ccbe] text-[#17131d] transition-colors hover:bg-[#f7efe7] disabled:opacity-50"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrameIndex((index) => clampFrame(index - 1, frameCount))}
                    disabled={frameCount <= 1}
                    aria-label="Previous frame"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border-dim text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(frameCount - 1, 0)}
                    value={safeFrameIndex}
                    onChange={(event) => {
                      setIsPlaying(false);
                      setFrameIndex(Number.parseInt(event.target.value, 10));
                    }}
                    className="min-w-[180px] flex-1 accent-[#f6ccbe]"
                  />
                  <button
                    type="button"
                    onClick={() => setFrameIndex((index) => clampFrame(index + 1, frameCount))}
                    disabled={frameCount <= 1}
                    aria-label="Next frame"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border-dim text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <span className="min-w-[86px] text-right font-mono text-xs text-secondary">
                    {safeFrameIndex} / {Math.max(frameCount - 1, 0)}
                  </span>
                </div>

                <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Frame Timeline</h2>
                    <span className="text-xs text-muted">quality / flags</span>
                  </div>
                  <div
                    className="grid min-w-full gap-1 overflow-x-auto"
                    style={{ gridTemplateColumns: `repeat(${Math.max(frameCount, 1)}, minmax(10px, 1fr))` }}
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
                          className={`h-8 rounded-[6px] border transition-transform hover:-translate-y-0.5 ${markerClass}`}
                          data-frame-index={index}
                          data-testid="movement-replay-frame"
                          title={`Frame ${index} quality ${formatNumber(quality)}`}
                        />
                      );
                    }) ?? (
                      <div className="h-8 rounded-[6px] border border-border-dim bg-background" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
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

            <section
              ref={replaySceneRef}
              className="overflow-hidden rounded-[8px] border border-border-dim bg-[#07070b]"
              data-testid="movement-replay-avatar-section"
            >
              <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Avatar Replay</h2>
                  <p className="mt-1 text-xs text-secondary">Current frame drives both source skeleton and student avatar.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={captureAvatarFrame}
                    disabled={captureDisabled}
                    className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border-dim px-3 text-xs font-semibold text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {captureMode === "scene" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    Scene PNG
                  </button>
                  <button
                    type="button"
                    onClick={captureSourceStrip}
                    disabled={captureDisabled}
                    className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border-dim px-3 text-xs font-semibold text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {captureMode === "strip" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Images className="h-4 w-4" />
                    )}
                    Source Strip
                  </button>
                  <span className="font-mono text-xs text-muted">frame {safeFrameIndex}</span>
                </div>
              </div>
              <div className="relative h-[520px]" data-testid="movement-replay-avatar-scene">
                    {replaySession ? (
                  <MovementMatchScene>
                    <MovementSourceSkeleton
                      color="#f6ccbe"
                      landmarksRef={replayMotionRef}
                      positionOffset={[0, 0, 0]}
                    />
                    <VrmAvatar
                      landmarksRef={replayMotionRef}
                      positionOffset={[0, 0, 0]}
                      isPlayer
                      isPlaying
                      name="Replay student"
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
            </section>

            {captureStatus && (
              <div className="rounded-[8px] border border-border-dim bg-sidebar/35 px-3 py-2 text-xs text-secondary">
                {captureStatus}
              </div>
            )}

            <section className="grid gap-5 lg:grid-cols-5">
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
                  {analysis ? `${countFailures(analysis, "error")} errors, ${countFailures(analysis, "warning")} warnings, ${analysis.metrics.strongFullBodyFrameCount} strong full-body frames` : "Waiting for data"}
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
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Bounds</h2>
                <div className="mt-3 text-3xl font-bold text-foreground">
                  {formatNumber(analysis?.metrics.averageOutOfFrameCount)}
                </div>
                <div className="mt-2 text-xs text-secondary">
                  avg out-of-frame, max {analysis?.metrics.maxOutOfFrameCount ?? "--"}
                </div>
              </div>
            </section>

            <section className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">All Replay Flags</h2>
                <span className="text-xs text-muted">{analysis?.summary.lowerBodyOwners.join(", ") ?? "--"}</span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {!analysis ? (
                  <div className="text-sm text-secondary">Waiting for analysis.</div>
                ) : analysis.failures.length === 0 ? (
                  <div className="rounded-[8px] border border-[#a8d5ba]/20 bg-[#a8d5ba]/10 p-3 text-sm text-[#a8d5ba]">
                    No replay flags for this stored recording.
                  </div>
                ) : analysis.failures.map((failure, index) => (
                  <button
                    key={`${failure.code}-${failure.frameIndex ?? "session"}-${index}`}
                    type="button"
                    onClick={() => {
                      if (typeof failure.frameIndex === "number") {
                        setIsPlaying(false);
                        setFrameIndex(failure.frameIndex);
                      }
                    }}
                    className="rounded-[8px] border border-border-dim bg-background/50 p-3 text-left text-sm transition-colors hover:border-border"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-xs text-[#f6ccbe]">{failure.code}</span>
                      <span className="text-xs uppercase tracking-wide text-muted">{failure.severity}</span>
                    </div>
                    <div className="mt-1 text-secondary">{failure.detail}</div>
                  </button>
                ))}
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
