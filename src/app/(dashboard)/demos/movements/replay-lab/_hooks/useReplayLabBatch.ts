"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { MovementDebugReplaySession } from "../../_lib/movementDebugReplay";
import { analyzeMovementDebugReplaySession } from "../../_lib/movementReplayAnalyzer";
import type { MovementReplayAnalysis } from "../../_lib/movementReplayAnalyzer";
import { MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS } from "../_lib/movementNextProofRehearsal";
import {
  getMovementProofRehearsalBatchSummary,
} from "../_lib/movementProofRehearsalEvidence";
import {
  formatRunClock,
  getAvatarFollowBatchIssueCode,
  getAvatarFollowBatchNextFixArea,
  getAvatarFollowBatchStatus,
  getBatchSummary,
  getProofRehearsalReadiness,
} from "../_lib/replayLabHelpers";
import type { LoadedReplayRecording, ReplayLabRecording } from "../_lib/replayLabHelpers";

export function useReplayLabBatch({
  activeRecordingId,
  analysis,
  hasRunBatch,
  loadedRecordings,
  recordingTitleById,
  replayRecordings,
  selectedRecordingIds,
  setFrameIndex,
  setHasRunBatch,
  setIsPlaying,
  setSelectedRecordingId,
  setSelectedRecordingIds,
}: {
  activeRecordingId: Id<"movements"> | null;
  analysis: MovementReplayAnalysis | null;
  hasRunBatch: boolean;
  loadedRecordings: Record<string, LoadedReplayRecording | undefined>;
  recordingTitleById: Map<string, string>;
  replayRecordings: ReplayLabRecording[] | undefined;
  selectedRecordingIds: Array<Id<"movements">>;
  setFrameIndex: (frameIndex: number) => void;
  setHasRunBatch: (hasRunBatch: boolean) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setSelectedRecordingId: (recordingId: Id<"movements"> | null) => void;
  setSelectedRecordingIds: Dispatch<SetStateAction<Array<Id<"movements">>>>;
}) {
  const [pendingRunId, setPendingRunId] = useState<number | null>(null);
  const [completedRunCount, setCompletedRunCount] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runCompletedAt, setRunCompletedAt] = useState<number | null>(null);

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
  const setupReviewItems = useMemo(() => {
    if (!hasRunBatch || !replayRecordings) return [];

    return replayRecordings.flatMap((recording) => {
      if (!selectedRecordingIds.includes(recording._id)) return [];
      const recordingAnalysis = analysisByRecordingId.get(recording._id);
      const topMessage = recordingAnalysis?.gamePath.startReadinessMessageSummary[0];
      if (!recordingAnalysis || !topMessage || recordingAnalysis.metrics.startReadinessBlockedFrameCount === 0) {
        return [];
      }

      return [{
        analysis: recordingAnalysis,
        recording,
        topMessage,
      }];
    }).sort((left, right) => (
      right.analysis.metrics.startReadinessBlockedFrameCount -
      left.analysis.metrics.startReadinessBlockedFrameCount ||
      right.topMessage.count - left.topMessage.count ||
      (left.recording.title ?? "").localeCompare(right.recording.title ?? "")
    ));
  }, [analysisByRecordingId, hasRunBatch, replayRecordings, selectedRecordingIds]);
  const avatarFollowBatchItems = useMemo(() => {
    if (!hasRunBatch || !replayRecordings) return [];
    const statusRank = { blocked: 0, review: 1, pass: 2 } as const;

    return replayRecordings.flatMap((recording) => {
      if (!selectedRecordingIds.includes(recording._id)) return [];
      const recordingAnalysis = analysisByRecordingId.get(recording._id);
      if (!recordingAnalysis) return [];

      const status = getAvatarFollowBatchStatus(recordingAnalysis);
      const worstFrame = recordingAnalysis.replayStudio.session.worstFrames[0] ?? null;
      const issueCode = getAvatarFollowBatchIssueCode(recordingAnalysis);
      return [{
        analysis: recordingAnalysis,
        issueCode,
        nextFixArea: getAvatarFollowBatchNextFixArea(recordingAnalysis),
        recording,
        status,
        worstFrame,
      }];
    }).sort((left, right) => (
      statusRank[left.status] - statusRank[right.status] ||
      (right.analysis.replayStudio.session.blockedFrameCount - left.analysis.replayStudio.session.blockedFrameCount) ||
      (right.analysis.replayStudio.session.failureCount - left.analysis.replayStudio.session.failureCount) ||
      (right.analysis.metrics.averageAvatarLowerBodyDirectionError - left.analysis.metrics.averageAvatarLowerBodyDirectionError) ||
      (left.recording.title ?? "").localeCompare(right.recording.title ?? "")
    ));
  }, [analysisByRecordingId, hasRunBatch, replayRecordings, selectedRecordingIds]);
  const avatarFollowBatchBlockedCount = avatarFollowBatchItems.filter((item) => item.status === "blocked").length;
  const avatarFollowBatchReviewCount = avatarFollowBatchItems.filter((item) => item.status === "review").length;
  const avatarFollowBatchWorstItem = avatarFollowBatchItems[0] ?? null;

  const proofRehearsalEvidenceEntries = useMemo(() => {
    if (hasRunBatch) {
      return batchAnalyses.map((batchAnalysis, order) => ({
        analysis: batchAnalysis,
        order,
        recordingId: batchAnalysis.sessionId,
        recordingTitle: recordingTitleById.get(batchAnalysis.sessionId),
      }));
    }

    if (!activeRecordingId || !analysis) return [];
    return [{
      analysis,
      order: 0,
      recordingId: activeRecordingId,
      recordingTitle: recordingTitleById.get(activeRecordingId),
    }];
  }, [activeRecordingId, analysis, batchAnalyses, hasRunBatch, recordingTitleById]);
  const proofRehearsalCandidateSummary = useMemo(() => (
    getMovementProofRehearsalBatchSummary(
      MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS,
      proofRehearsalEvidenceEntries,
    )
  ), [proofRehearsalEvidenceEntries]);

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
  const proofRehearsalReadiness = getProofRehearsalReadiness({
    hasRunBatch,
    isRunInProgress,
    selectedCount,
    setupBlocked: batchSummary.setupBlocked,
  });
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
    const latestIds = replayRecordings?.slice(0, 5).map((recording) => recording._id) ?? [];
    resetRunState();
    setSelectedRecordingIds(latestIds);
    setFrameIndex(0);
    setIsPlaying(false);
  };
  const selectAllRecordings = () => {
    const allIds = replayRecordings?.map((recording) => recording._id) ?? [];
    resetRunState();
    setSelectedRecordingIds(allIds);
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

  return {
    analysisByRecordingId,
    avatarFollowBatchBlockedCount,
    avatarFollowBatchItems,
    avatarFollowBatchReviewCount,
    avatarFollowBatchWorstItem,
    batchAnalyses,
    batchIsLoading,
    batchSummary,
    isRunInProgress,
    proofRehearsalCandidateSummary,
    proofRehearsalEvidenceEntries,
    proofRehearsalReadiness,
    resetRunState,
    runAlignmentBatch,
    runStartedAt,
    runStatusText,
    selectAllRecordings,
    selectedCount,
    selectLatestRecordings,
    setupReviewItems,
    toggleRecordingSelection,
  };
}
