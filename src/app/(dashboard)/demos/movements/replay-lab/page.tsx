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
  type MovementDebugReplaySession,
} from "../_lib/movementDebugReplay";
import {
  analyzeMovementDebugReplaySession,
  type MovementReplayFailure,
} from "../_lib/movementReplayAnalyzer";
import {
  resolveMovementAvatarPipelineDecision,
} from "../_lib/movementAvatarPipeline";
import {
  loadMovementReplayRecording,
  type MovementReplayRecordingSource,
} from "../_lib/movementRecordingReplay";
import { MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS } from "./_lib/movementNextProofRehearsal";
import {
  getMovementProofRehearsalBatchSummary,
} from "./_lib/movementProofRehearsalEvidence";
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
import {
  mirrorMovementLandmarksForDisplay,
} from "../_lib/movementMirrorMapping";
import type { VrmMotionRef } from "../_lib/vrmRigging";
import MovementMatchScene from "../[id]/play/_components/MovementMatchScene";
import MovementSourceSkeleton from "../[id]/play/_components/MovementSourceSkeleton";
import VrmAvatar from "../[id]/play/_components/VrmAvatar";
import ReplayProofRehearsalPanel from "./_components/ReplayProofRehearsalPanel";
import ReplayBatchReviewPanels from "./_components/ReplayBatchReviewPanels";
import ReplayRecordingList from "./_components/ReplayRecordingList";
import ReplayCurrentFramePanel from "./_components/ReplayCurrentFramePanel";
import ReplayAnalysisReviewSections from "./_components/ReplayAnalysisReviewSections";

import {
  AVATAR_FOLLOW_ACTIVE_LEG_ERROR_THRESHOLD,
  AVATAR_FOLLOW_ACTIVE_LEG_THRESHOLD,
  AVATAR_FOLLOW_ARM_POSE_ERROR_THRESHOLD,
  AVATAR_FOLLOW_AVERAGE_LOWER_REVIEW_THRESHOLD,
  AVATAR_FOLLOW_CURRENT_LOWER_REVIEW_THRESHOLD,
  AVATAR_FOLLOW_OWNER_FLICKER_THRESHOLD,
  AVATAR_FOLLOW_PLANTED_FOOT_CLEARANCE_THRESHOLD,
  AVATAR_FOLLOW_PLANTED_FOOT_ERROR_THRESHOLD,
  AVATAR_FOLLOW_SPINE_ANGLE_ERROR_THRESHOLD,
  AVATAR_FOLLOW_VISUAL_MATCH_THRESHOLD,
  LIVE_HEAD_DAMPING_REVIEW_THRESHOLD,
  LIVE_SPINE_DRIVE_MOTION_THRESHOLD,
  LIVE_SPINE_DRIVE_REVIEW_THRESHOLD,
  LIVE_UPPER_BODY_REVIEW_THRESHOLD,
  SOURCE_OUT_OF_FRAME_REVIEW_COUNT,
  avatarPlantedFootClearance,
  avatarSegmentVectorAttr,
  buildPathStripPoints,
  captureFileName,
  clampFrame,
  classifyLowerOwner,
  compactCaptureLabel,
  downloadDataUrl,
  extractKnownOwner,
  formatAngleDegrees,
  formatAnglesCompact,
  formatNumber,
  formatRunClock,
  frameLandmarks,
  getAvatarFollowBatchIssueCode,
  getAvatarFollowBatchNextFixArea,
  getAvatarFollowBatchStatus,
  getBatchStatusLabel,
  getBatchSummary,
  getFailureGroups,
  getProofRehearsalReadiness,
  getReplayStudioParityDiffs,
  getReplayStudioParitySnapshot,
  headMotionMagnitude,
  maxAvatarSegmentError,
  minNumber,
  replayCalibrationNeutralScore,
  selectStripFrameIndexes,
} from "./_lib/replayLabHelpers";
import type {
  AvatarFollowCriterionStatus,
  LoadedReplayRecording,
  ReplayLabRecording,
} from "./_lib/replayLabHelpers";

export default function MovementReplayLabPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const replaySceneRef = useRef<HTMLElement | null>(null);
  const replayAvatarDebugRef = useRef<MovementTrackingDebugState | null>(null);
  const replayMotionRef = useRef<VrmMotionRef>(null);
  const replaySourceMotionRef = useRef<VrmMotionRef>(null);
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
  const [debugReplaySession, setDebugReplaySession] = useState<MovementDebugReplaySession | null>(null);
  const [debugReplayError, setDebugReplayError] = useState<string | null>(null);

  const recordings = useQuery(api.movements.listReplayAlignmentRecordings, { limit: 50 });
  const debugRecordingId = debugReplaySession?.id as Id<"movements"> | undefined;
  const debugRecording = useMemo<ReplayLabRecording | null>(() => {
    if (!debugReplaySession || !debugRecordingId) return null;

    return {
      _id: debugRecordingId,
      captureFps: debugReplaySession.fps,
      createdAt: debugReplaySession.createdAt ?? debugReplaySession.startedAt,
      difficulty: "debug",
      durationMs: debugReplaySession.durationMs,
      frameCount: debugReplaySession.sampleCount,
      poseData: "debug-replay-session",
      poseDataFormat: "legacy-inline-json",
      spineGoal: debugReplaySession.trigger,
      title: debugReplaySession.warningSummary ?? "Debug replay session",
    };
  }, [debugRecordingId, debugReplaySession]);
  const replayRecordings = useMemo<ReplayLabRecording[] | undefined>(() => {
    const savedRecordings = recordings as ReplayLabRecording[] | undefined;
    if (!debugRecording) return savedRecordings;
    return [debugRecording, ...(savedRecordings ?? []).filter((recording) => recording._id !== debugRecording._id)];
  }, [debugRecording, recordings]);
  const activeRecordingId = selectedRecordingId;
  const recordingsToLoad = useMemo(() => {
    if (!replayRecordings) return [];
    const idsToLoad = new Set<string>(hasRunBatch ? selectedRecordingIds : []);
    if (activeRecordingId) idsToLoad.add(activeRecordingId);
    return replayRecordings.filter((recording) => (
      idsToLoad.has(recording._id) &&
      recording._id !== debugRecordingId
    ));
  }, [activeRecordingId, debugRecordingId, hasRunBatch, replayRecordings, selectedRecordingIds]);
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

  // The lab's avatar is parameterisable so the rig-derived-calibration
  // acceptance test can score an unprofiled VRM against the golden set.
  const [replayAvatarVrmUrl] = useState(() => {
    if (typeof window === "undefined") return "/models/VIPE_Hero__1793.vrm";
    return new URLSearchParams(window.location.search).get("avatarUrl") ?? "/models/VIPE_Hero__1793.vrm";
  });

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const debugReplaySessionUrl = new URLSearchParams(window.location.search).get("debugReplaySessionUrl");
    if (!debugReplaySessionUrl) return;

    let cancelled = false;
    void fetch(debugReplaySessionUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load debug replay session (${response.status}).`);
        return response.json() as Promise<MovementDebugReplaySession>;
      })
      .then((session) => {
        if (cancelled) return;
        if (!session.id || !Array.isArray(session.samples)) {
          throw new Error("Debug replay session must include an id and samples.");
        }
        setDebugReplayError(null);
        setDebugReplaySession(session);
      })
      .catch((error) => {
        if (cancelled) return;
        setDebugReplayError(error instanceof Error ? error.message : "Could not load debug replay session.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!debugReplaySession || !debugRecordingId) return;

    setLoadedRecordings((current) => ({
      ...current,
      [debugRecordingId]: {
        error: null,
        isLoading: false,
        session: debugReplaySession,
      },
    }));
    setSelectedRecordingId(debugRecordingId);
    setSelectedRecordingIds((previousIds) => (
      previousIds.includes(debugRecordingId) ? previousIds : [debugRecordingId, ...previousIds]
    ));
    setHasRunBatch(true);
    setFrameIndex(0);
    setIsPlaying(false);
  }, [debugRecordingId, debugReplaySession]);

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
  const recordingTitleById = useMemo(() => (
    new Map<string, string>((replayRecordings ?? []).map((recording) => [
      recording._id,
      recording.title ?? recording._id,
    ]))
  ), [replayRecordings]);

  const analysis = useMemo(
    () => replaySession ? analyzeMovementDebugReplaySession(replaySession) : null,
    [replaySession],
  );
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
  const torsoConfidence = currentBodyConfidence?.torso;
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
  const currentReplayStudioFrameVerdict = analysis?.replayStudio.frames.find((frame) => (
    frame.frameIndex === safeFrameIndex
  ));
  const replayStudioWorstFrames = analysis?.replayStudio.session.worstFrames ?? [];
  const topStartReadinessMessages = analysis?.gamePath.startReadinessMessageSummary.slice(0, 3) ?? [];
  const currentStartReadinessStatus = currentSourceFrame
    ? currentSourceFrame.canStartGame ? "ready" : currentSourceFrame.startReadinessState
    : "--";
  const currentStartReadinessDetail = currentSourceFrame
    ? currentSourceFrame.blockedReasons.length > 0
      ? currentSourceFrame.blockedReasons.join(", ")
      : currentSourceFrame.promptEvents.length > 0
        ? currentSourceFrame.promptEvents.join(", ")
        : currentSourceFrame.visibleBodyParts.length > 0
          ? `visible ${currentSourceFrame.visibleBodyParts.join(", ")}`
          : "no blockers"
    : "--";
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
  const recordedLowerOwner = currentFrame ? extractOwner(currentFrame.fallbacks, "lower") : undefined;
  const recordedFeetOwner = currentFrame ? extractOwner(currentFrame.fallbacks, "feet") : undefined;
  const liveLowerOwner = extractKnownOwner(currentFallbacks, "lower") ?? recordedLowerOwner;
  const liveFeetOwner = extractKnownOwner(currentFallbacks, "feet") ?? recordedFeetOwner;
  const replayLowerOwner = liveLowerOwner ?? recordedLowerOwner;
  const replayFeetOwner = liveFeetOwner ?? recordedFeetOwner;
  const replaySquatDepth = currentRetarget?.squatDepth ?? currentFrame?.retarget?.squatDepth ?? 0;
  const currentFrameStationaryFeetFloorSideBend = Boolean(
    currentGamePathFrame &&
      currentRootMotionFrame?.intent.key === "root-stationary" &&
      currentGamePathFrame.supportIntentKey === "feet-floor" &&
      Math.abs(currentSpineDrive?.sideBend ?? 0) >= 0.12 &&
      Math.max(currentGamePathFrame.leftKneeLift, currentGamePathFrame.rightKneeLift) <
        AVATAR_FOLLOW_ACTIVE_LEG_THRESHOLD &&
      currentGamePathFrame.squatDepth < 0.12 &&
      !currentGamePathFrame.shouldDrivePlayerLegRaise &&
      !currentGamePathFrame.shouldDrivePlayerSquat,
  );
  const currentFrameActiveLegMotion = Boolean(
    currentGamePathFrame &&
      (
        currentGamePathFrame.shouldDrivePlayerLegRaise ||
        Math.max(currentGamePathFrame.leftKneeLift, currentGamePathFrame.rightKneeLift) >=
          AVATAR_FOLLOW_ACTIVE_LEG_THRESHOLD ||
        (!currentFrameStationaryFeetFloorSideBend &&
          currentGamePathFrame.lowerBodyTargetPlayerRetargetMotion >= AVATAR_FOLLOW_ACTIVE_LEG_THRESHOLD) ||
        currentGamePathFrame.lowerOwner.includes("leg-raise") ||
        currentGamePathFrame.lowerLabel.includes("knee-raise")
      ),
  );
  const currentFrameUsesSeatedSupport = Boolean(
    currentGamePathFrame &&
      (
        currentGamePathFrame.supportIntentKey === "seat-chair" ||
        currentGamePathFrame.supportPresentationOwner.startsWith("support-presentation-seated") ||
        currentGamePathFrame.supportContactOwner.includes("seat") ||
        currentGamePathFrame.supportContactOwner.includes("chair")
      ),
  );
  const currentFrameSourceReady = Boolean(
    currentSourceFrame &&
      (currentSourceFrame.canStartGame || currentSourceFrame.startReadinessState === "ready"),
  );
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
          poseLandmarks: mirrorMovementLandmarksForDisplay(sample.tracking.pose, {
            mapX: (x) => 1 - x,
            mirrorMode: "facing-player",
          }),
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

    const displayPoseLandmarks = mirrorMovementLandmarksForDisplay(currentPoseLandmarks, {
      mapX: (x) => 1 - x,
      mirrorMode: "facing-player",
    });
    const displayWorldPoseLandmarks = currentFrame.tracking.worldPose.length >= 33
      ? mirrorMovementLandmarksForDisplay(currentFrame.tracking.worldPose, {
          mapX: (x) => -x,
          mirrorMode: "facing-player",
        })
      : [];

    return resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: replayPlayerCalibration ?? buildMovementCalibration({ poseLandmarks: displayPoseLandmarks }),
      displayPoseLandmarks,
      displayWorldPoseLandmarks,
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
    const source = {
      poseLandmarks: currentPoseLandmarks,
      worldPoseLandmarks: currentFrame && currentFrame.tracking.worldPose.length >= 33
        ? currentFrame.tracking.worldPose
        : null,
    };
    const replayDecision = resolveMovementAvatarPipelineDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel: replayRetargetSourceModel,
      source,
      sourceOrigin: "replay",
    });
    const studioDecision = resolveMovementAvatarPipelineDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel: replayRetargetSourceModel,
      source,
      sourceOrigin: "studio",
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
  }, [currentFrame, currentPoseLandmarks, replayPlayerCalibration, replayRetargetSourceModel]);
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
    const armPoseError = maxAvatarSegmentError(currentAvatarVisual, [
      "leftUpperArm",
      "leftLowerArm",
      "rightUpperArm",
      "rightLowerArm",
    ]);
    const footPoseError = maxAvatarSegmentError(currentAvatarVisual, [
      "leftFoot",
      "rightFoot",
    ]);
    const spinePoseError = maxAvatarSegmentError(currentAvatarVisual, ["spine"]);

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
        code: "avatar_arm_pose_diverged",
        detail: `Live avatar upper-body direction error is ${upperBodyError.toFixed(2)} across ${upperBodySegments} segments; review visible spine/arm match.`,
        frameIndex: safeFrameIndex,
        severity: currentFrameSourceReady ? "error" : "warning",
      });
    }

    if (
      typeof armPoseError === "number" &&
      typeof armConfidence === "number" &&
      armConfidence >= 0.45 &&
      armPoseError > AVATAR_FOLLOW_ARM_POSE_ERROR_THRESHOLD
    ) {
      failures.push({
        code: "avatar_arm_pose_diverged",
        detail: `Avatar arm pose max segment error is ${armPoseError.toFixed(2)} with source arm confidence ${armConfidence.toFixed(2)}.`,
        frameIndex: safeFrameIndex,
        severity: currentFrameSourceReady ? "error" : "warning",
      });
    }

    if (
      currentSpineDrive?.owner === "recorded-spine-model" &&
      typeof upperBodyError === "number" &&
      spineDriveMagnitude >= LIVE_SPINE_DRIVE_MOTION_THRESHOLD &&
      upperBodyError > LIVE_SPINE_DRIVE_REVIEW_THRESHOLD
    ) {
      failures.push({
        code: "avatar_spine_angle_diverged",
        detail: `Recorded spine drive is strong (bend ${currentSpineDrive.sideBend.toFixed(2)}, lean ${currentSpineDrive.forwardLean.toFixed(2)}) but avatar upper-body error is ${upperBodyError.toFixed(2)}.`,
        frameIndex: safeFrameIndex,
        severity: currentFrameSourceReady ? "error" : "warning",
      });
    }

    if (
      currentSpineDrive?.owner === "recorded-spine-model" &&
      typeof spinePoseError === "number" &&
      spineDriveMagnitude >= LIVE_SPINE_DRIVE_MOTION_THRESHOLD &&
      spinePoseError > AVATAR_FOLLOW_SPINE_ANGLE_ERROR_THRESHOLD
    ) {
      failures.push({
        code: "avatar_spine_angle_diverged",
        detail: `Avatar spine segment error is ${spinePoseError.toFixed(2)} while recorded spine drive is visible (bend ${currentSpineDrive.sideBend.toFixed(2)}, lean ${currentSpineDrive.forwardLean.toFixed(2)}).`,
        frameIndex: safeFrameIndex,
        severity: currentFrameSourceReady ? "error" : "warning",
      });
    }

    if (
      currentFrameSourceReady &&
      typeof torsoConfidence === "number" &&
      torsoConfidence >= 0.45 &&
      typeof spinePoseError === "number" &&
      spinePoseError > AVATAR_FOLLOW_SPINE_ANGLE_ERROR_THRESHOLD
    ) {
      failures.push({
        code: "avatar_spine_angle_diverged",
        detail: `Avatar spine segment error is ${spinePoseError.toFixed(2)} with source torso confidence ${torsoConfidence.toFixed(2)}.`,
        frameIndex: safeFrameIndex,
        severity: "error",
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
        code: "avatar_head_alignment_diverged",
        detail: `Recorded spine motion is visible (bend ${currentSpineDrive.sideBend.toFixed(2)}, lean ${currentSpineDrive.forwardLean.toFixed(2)}) but head motion is damped from ${formatAngleDegrees(rawHeadMagnitude)} to ${formatAngleDegrees(appliedHeadMagnitude)}.`,
        frameIndex: safeFrameIndex,
        severity: currentFrameSourceReady ? "error" : "warning",
      });
    }

    if (
      currentAvatarDebug?.headRaw.source === "pose" &&
      currentAvatarDebug.headRaw.confidence >= 0.75 &&
      Math.abs(currentAvatarDebug.headRaw.yaw) >= 0.65 &&
      Math.abs(currentAvatarDebug.headApplied.yaw) < 0.08
    ) {
      failures.push({
        code: "avatar_head_alignment_diverged",
        detail: `Recorded pose head yaw is strong (${formatAngleDegrees(currentAvatarDebug.headRaw.yaw)}) but avatar applied yaw is nearly neutral (${formatAngleDegrees(currentAvatarDebug.headApplied.yaw)}).`,
        frameIndex: safeFrameIndex,
        severity: currentFrameSourceReady ? "error" : "warning",
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
        code: "avatar_head_alignment_diverged",
        detail: `Recorded pose head yaw and avatar applied yaw point in opposite directions (${formatAngleDegrees(currentAvatarDebug.headRaw.yaw)} vs ${formatAngleDegrees(currentAvatarDebug.headApplied.yaw)}).`,
        frameIndex: safeFrameIndex,
        severity: currentFrameSourceReady ? "error" : "warning",
      });
    }

    const plantedFootClearance = avatarPlantedFootClearance(
      currentAvatarVisual,
      currentRootMotionFrame?.intent.plantedFoot,
    );

    if (
      currentFrameSourceReady &&
      currentGamePathFrame?.supportIntentKey === "feet-floor" &&
      typeof footPoseError === "number" &&
      footPoseError > AVATAR_FOLLOW_PLANTED_FOOT_ERROR_THRESHOLD &&
      (
        !currentFrameStationaryFeetFloorSideBend ||
        typeof plantedFootClearance !== "number" ||
        plantedFootClearance > AVATAR_FOLLOW_PLANTED_FOOT_CLEARANCE_THRESHOLD
      )
    ) {
      failures.push({
        code: "avatar_planted_foot_diverged",
        detail: `Avatar planted-foot segment error is ${footPoseError.toFixed(2)} while source support is feet-floor.`,
        frameIndex: safeFrameIndex,
        severity: "error",
      });
    }

    if (
      currentFrameSourceReady &&
      currentGamePathFrame?.supportIntentKey === "feet-floor" &&
      typeof plantedFootClearance === "number" &&
      plantedFootClearance > AVATAR_FOLLOW_PLANTED_FOOT_CLEARANCE_THRESHOLD
    ) {
      failures.push({
        code: "avatar_planted_foot_diverged",
        detail: `Avatar planted foot is ${plantedFootClearance.toFixed(2)} above the floor while source support is feet-floor.`,
        frameIndex: safeFrameIndex,
        severity: "error",
      });
    }

    if (
      currentFrameSourceReady &&
      currentGamePathFrame?.supportIntentKey === "feet-floor" &&
      currentFrameActiveLegMotion &&
      typeof replayFeetOwner === "string" &&
      replayFeetOwner.startsWith("recorded")
    ) {
      failures.push({
        code: "avatar_planted_foot_diverged",
        detail: `Source has active leg motion on feet-floor support, but Replay Lab reports feet owner as ${replayFeetOwner} instead of a planted/locked support owner.`,
        frameIndex: safeFrameIndex,
        severity: "error",
      });
    }

    const activeLegVisualDiverged = Boolean(
      currentFrameSourceReady &&
        currentFrameActiveLegMotion &&
        lowerBodySegments >= 4 &&
        typeof lowerBodyError === "number" &&
        lowerBodyError > AVATAR_FOLLOW_ACTIVE_LEG_ERROR_THRESHOLD
    );

    if (activeLegVisualDiverged) {
      failures.push({
        code: "avatar_output_diverged",
        detail: `Current frame has active leg motion but rendered avatar lower-body direction error is ${lowerBodyError?.toFixed(2)}.`,
        frameIndex: safeFrameIndex,
        semanticCode: "leg-lift-missing",
        severity: "error",
      });
    } else if (
      lowerBodySegments >= 4 &&
      typeof lowerBodyError === "number" &&
      lowerBodyError > AVATAR_FOLLOW_CURRENT_LOWER_REVIEW_THRESHOLD
    ) {
      failures.push({
        code: "avatar_output_diverged",
        detail: `Live avatar lower-body direction error is ${lowerBodyError.toFixed(2)} across ${lowerBodySegments} segments.`,
        frameIndex: safeFrameIndex,
        severity: "warning",
      });
    }

    if (currentFrameSourceReady && currentFrameActiveLegMotion && currentFrameUsesSeatedSupport) {
      failures.push({
        code: "avatar_output_diverged",
        detail: `Source is ready with active leg motion, but avatar support is seated (${currentGamePathFrame?.supportIntentLabel ?? "unknown"} · ${currentGamePathFrame?.supportPresentationOwner ?? "unknown"}).`,
        frameIndex: safeFrameIndex,
        semanticCode: "movement-visible-but-unscored",
        severity: "error",
      });
    }

    if (
      currentFrameActiveLegMotion &&
      lowerBodySegments === 0 &&
      currentAvatarVisual
    ) {
      failures.push({
        code: "avatar_output_diverged",
        detail: "Current frame has active leg motion but no comparable rendered avatar lower-body segments.",
        frameIndex: safeFrameIndex,
        semanticCode: "leg-lift-missing",
        severity: "warning",
      });
    }

    return failures;
  }, [
    currentAvatarVisual,
    currentAvatarDebug?.headApplied,
    currentAvatarDebug?.headRaw,
    currentFrame?.poseBounds?.maxY,
    currentFrame?.poseBounds?.outOfFrameCount,
    currentFrame?.retarget?.sourceQuality,
    currentFrameActiveLegMotion,
    currentFrameSourceReady,
    currentFrameStationaryFeetFloorSideBend,
    currentFrameUsesSeatedSupport,
    currentGamePathFrame?.supportIntentKey,
    currentGamePathFrame?.supportIntentLabel,
    currentGamePathFrame?.supportPresentationOwner,
    currentRootMotionFrame?.intent.plantedFoot,
    currentRetarget?.sourceQuality,
    currentSpineDrive?.forwardLean,
    currentSpineDrive?.owner,
    currentSpineDrive?.sideBend,
    replayFeetOwner,
    armConfidence,
    footConfidence,
    legConfidence,
    safeFrameIndex,
    torsoConfidence,
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
  const avatarFollowSessionFailures = useMemo<MovementReplayFailure[]>(() => {
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
  }, [analysis]);
  const currentFrameFailures = [
    ...(analysis?.failures.filter((failure) => failure.frameIndex === safeFrameIndex) ?? []),
    ...liveCurrentFrameFailures,
    ...(replayStudioParityFailure ? [replayStudioParityFailure] : []),
  ];
  const replayStudioFrameStatus = currentReplayStudioFrameVerdict?.status;
  const replayStudioSessionStatus = analysis?.replayStudio.session.status;
  const currentReplayStudioPrimaryFailure = currentReplayStudioFrameVerdict?.failures[0] ?? null;
  const avatarFollowHasSessionError = avatarFollowSessionFailures.some((failure) => (
    failure.severity === "error"
  ));
  const avatarFollowProofMissing = Boolean(analysis && analysis.metrics.avatarVisualFrameCount === 0);
  const avatarFollowStatus = currentFrameFailures.some((failure) => failure.severity === "error") ||
    avatarFollowHasSessionError ||
    replayStudioFrameStatus === "blocked"
    ? "blocked"
    : avatarFollowSessionFailures.length > 0 ||
        currentFrameFailures.length > 0 ||
        replayStudioFrameStatus === "review" ||
        replayStudioSessionStatus === "review" ||
        replayStudioSessionStatus === "blocked"
      ? "review"
      : analysis
        ? "pass"
        : "--";
  const avatarFollowAcceptanceStatus = avatarFollowStatus === "blocked"
    ? "blocked-for-acceptance"
    : avatarFollowStatus === "review"
      ? "review-only"
      : avatarFollowStatus === "pass"
        ? "accepted"
        : "--";
  const avatarFollowJudgeText = currentReplayStudioFrameVerdict
    ? `${currentReplayStudioFrameVerdict.status} frame / ${analysis?.replayStudio.session.status ?? "--"} session`
    : analysis?.replayStudio.session.status
      ? `${analysis.replayStudio.session.status} session`
      : "--";
  const avatarFollowCurrentFailureCodes = currentFrameFailures.map((failure) => failure.code).join(",");
  const avatarFollowCriterionStatus = (
    codes: string[],
  ): AvatarFollowCriterionStatus => {
    const matchingFailures = currentFrameFailures.filter((failure) => (
      codes.includes(failure.code)
    ));
    if (matchingFailures.some((failure) => failure.severity === "error")) return "blocked";
    if (avatarFollowProofMissing) return "blocked";
    if (matchingFailures.length > 0) return "review";
    if (avatarFollowHasSessionError) return "review";
    return currentFrameSourceReady ? "pass" : "--";
  };
  const currentArmPoseError = maxAvatarSegmentError(currentAvatarVisual, [
    "leftUpperArm",
    "leftLowerArm",
    "rightUpperArm",
    "rightLowerArm",
  ]);
  const currentSpinePoseError = maxAvatarSegmentError(currentAvatarVisual, ["spine"]);
  const currentLeftFootPoseError = maxAvatarSegmentError(currentAvatarVisual, ["leftFoot"]);
  const currentRightFootPoseError = maxAvatarSegmentError(currentAvatarVisual, ["rightFoot"]);
  const currentLeftShinPoseError = maxAvatarSegmentError(currentAvatarVisual, ["leftShin"]);
  const currentRightShinPoseError = maxAvatarSegmentError(currentAvatarVisual, ["rightShin"]);
  const currentFootPoseError = maxAvatarSegmentError(currentAvatarVisual, [
    "leftFoot",
    "rightFoot",
  ]);
  const currentLeftFootClearance = currentAvatarVisual?.footing?.leftFootClearance;
  const currentRightFootClearance = currentAvatarVisual?.footing?.rightFootClearance;
  const currentPlantedFootClearance = avatarPlantedFootClearance(
    currentAvatarVisual,
    currentRootMotionFrame?.intent.plantedFoot,
  );
  const avatarFollowHeadCriterionStatus = avatarFollowCriterionStatus(["avatar_head_alignment_diverged"]);
  const avatarFollowSpineCriterionStatus = avatarFollowCriterionStatus(["avatar_spine_angle_diverged"]);
  const avatarFollowArmCriterionStatus = avatarFollowCriterionStatus(["avatar_arm_pose_diverged"]);
  const avatarFollowFootCriterionStatus = avatarFollowCriterionStatus(["avatar_planted_foot_diverged"]);
  const avatarFollowCriteria = [
    {
      key: "head",
      label: "Head",
      metric: `raw ${formatAnglesCompact(currentAvatarDebug?.headRaw)} · applied ${formatAnglesCompact(currentAvatarDebug?.headApplied)}`,
      status: avatarFollowHeadCriterionStatus,
    },
    {
      key: "spine",
      label: "Body / spine",
      metric: `e ${formatNumber(currentSpinePoseError)} · conf ${formatNumber(torsoConfidence)}`,
      status: avatarFollowSpineCriterionStatus,
    },
    {
      key: "arms",
      label: "Arms",
      metric: `e ${formatNumber(currentArmPoseError)} · conf ${formatNumber(armConfidence)}`,
      status: avatarFollowArmCriterionStatus,
    },
    {
      key: "foot",
      label: "Planted foot",
      metric: `e ${formatNumber(currentFootPoseError)} · clear ${formatNumber(currentPlantedFootClearance)} · ${liveFeetOwner ?? "--"}`,
      status: avatarFollowFootCriterionStatus,
    },
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
    analysis?.replayStudio.frames.forEach((frame) => {
      if (frame.status === "pass") return;
      const currentSeverity = severityByFrame.get(frame.frameIndex);
      const replayStudioSeverity = frame.status === "blocked" ? "error" : "warning";
      if (replayStudioSeverity === "error" || !currentSeverity) {
        severityByFrame.set(frame.frameIndex, replayStudioSeverity);
      }
    });
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
  }, [currentFrame]);

  useEffect(() => {
    const sourceMotion = currentFrame
      ? {
          landmarks: currentFrame.tracking.pose,
          worldLandmarks: currentFrame.tracking.worldPose.length > 0
            ? currentFrame.tracking.worldPose
            : null,
        }
      : null;
    replaySourceMotionRef.current = sourceMotion;

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
      const labelHeight = 64;
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
      stripContext.textBaseline = "top";

      indexes.forEach((index, stripIndex) => {
        const frame = replaySession.samples[index];
        const x = stripIndex * panelWidth;
        const sourceFrame = analysis?.gamePath.sourceFrames.find((source) => source.frameIndex === index);
        const startGateLabel = sourceFrame
          ? `${sourceFrame.canStartGame ? "ready" : sourceFrame.startReadinessState}: ${sourceFrame.startReadinessMessage}`
          : "start gate: pending";
        drawMovementSkeleton(tempContext, frameLandmarks(frame), panelWidth, panelHeight);
        stripContext.fillStyle = "#111118";
        stripContext.fillRect(x, 0, panelWidth, labelHeight);
        stripContext.fillStyle = index === safeFrameIndex ? "#f6ccbe" : "#d7d7dd";
        stripContext.font = "16px ui-monospace, SFMono-Regular, Menlo, monospace";
        stripContext.fillText(`frame ${index}`, x + 14, 10);
        stripContext.fillStyle = sourceFrame?.canStartGame ? "#a8d5ba" : "#f6ccbe";
        stripContext.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";
        stripContext.fillText(compactCaptureLabel(startGateLabel), x + 14, 36);
        stripContext.drawImage(tempCanvas, x, labelHeight);
      });

      downloadDataUrl(
        captureFileName(activeRecordingId, "source-strip.png"),
        stripCanvas.toDataURL("image/png"),
      );
      setCaptureStatus(`Captured source strip with setup labels: ${indexes.join(", ")}.`);
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : "Source strip capture failed.");
    } finally {
      setCaptureMode(null);
    }
  };

  const exportReplayStudioFixLog = () => {
    if (!analysis) return;

    const fixLog = {
      generatedAt: new Date().toISOString(),
      recordingId: activeRecordingId,
      replayStudio: analysis.replayStudio.session,
      currentFrame: currentReplayStudioFrameVerdict ?? null,
      failures: analysis.failures,
    };
    downloadDataUrl(
      captureFileName(activeRecordingId, "replay-studio-fix-log.json"),
      `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(fixLog, null, 2))}`,
    );
    setCaptureStatus(
      `Exported Replay Studio fix log with ${analysis.replayStudio.session.worstFrames.length} worst frames.`,
    );
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
        data-avatar-follow-current-active-leg-motion={currentFrameActiveLegMotion}
        data-avatar-follow-current-seated-support={currentFrameUsesSeatedSupport}
        data-avatar-follow-batch-blocked-recording-count={hasRunBatch ? avatarFollowBatchBlockedCount : ""}
        data-avatar-follow-batch-review-recording-count={hasRunBatch ? avatarFollowBatchReviewCount : ""}
        data-avatar-follow-batch-worst-fix-area={hasRunBatch ? avatarFollowBatchWorstItem?.nextFixArea ?? "" : ""}
        data-avatar-follow-batch-worst-frame={hasRunBatch ? avatarFollowBatchWorstItem?.worstFrame?.frameIndex ?? "" : ""}
        data-avatar-follow-batch-worst-issue={hasRunBatch ? avatarFollowBatchWorstItem?.issueCode ?? "" : ""}
        data-avatar-follow-batch-worst-recording-id={hasRunBatch ? avatarFollowBatchWorstItem?.recording._id ?? "" : ""}
        data-avatar-follow-batch-worst-status={hasRunBatch ? avatarFollowBatchWorstItem?.status ?? "" : ""}
        data-avatar-follow-session-issue-count={avatarFollowSessionFailures.length}
        data-avatar-follow-acceptance-status={avatarFollowAcceptanceStatus}
        data-avatar-follow-current-failure-codes={avatarFollowCurrentFailureCodes}
        data-avatar-follow-head-status={avatarFollowHeadCriterionStatus}
        data-avatar-follow-spine-status={avatarFollowSpineCriterionStatus}
        data-avatar-follow-arm-status={avatarFollowArmCriterionStatus}
        data-avatar-follow-foot-status={avatarFollowFootCriterionStatus}
        data-avatar-follow-status={avatarFollowStatus}
        data-avatar-follow-current-arm-error={currentArmPoseError ?? ""}
        data-avatar-follow-current-foot-error={currentFootPoseError ?? ""}
        data-avatar-follow-current-left-foot-error={currentLeftFootPoseError ?? ""}
        data-avatar-follow-current-left-foot-clearance={currentLeftFootClearance ?? ""}
        data-avatar-follow-current-left-shin-error={currentLeftShinPoseError ?? ""}
        data-avatar-follow-current-right-foot-error={currentRightFootPoseError ?? ""}
        data-avatar-follow-current-right-foot-clearance={currentRightFootClearance ?? ""}
        data-avatar-follow-current-right-shin-error={currentRightShinPoseError ?? ""}
        data-avatar-follow-current-planted-foot-clearance={currentPlantedFootClearance ?? ""}
        data-avatar-follow-current-spine-error={currentSpinePoseError ?? ""}
        data-avatar-follow-current-left-shin-avatar-direction={avatarSegmentVectorAttr(currentAvatarVisual, "leftShin", "direction")}
        data-avatar-follow-current-left-shin-source-direction={avatarSegmentVectorAttr(currentAvatarVisual, "leftShin", "sourceDirection")}
        data-avatar-follow-current-right-shin-avatar-direction={avatarSegmentVectorAttr(currentAvatarVisual, "rightShin", "direction")}
        data-avatar-follow-current-right-shin-source-direction={avatarSegmentVectorAttr(currentAvatarVisual, "rightShin", "sourceDirection")}
        data-avatar-follow-current-spine-avatar-direction={avatarSegmentVectorAttr(currentAvatarVisual, "spine", "direction")}
        data-avatar-follow-current-spine-source-direction={avatarSegmentVectorAttr(currentAvatarVisual, "spine", "sourceDirection")}
        data-replay-studio-failure-codes={
          currentReplayStudioFrameVerdict?.failures.map((failure) => failure.code).join(",") ?? ""
        }
        data-replay-studio-frame-status={currentReplayStudioFrameVerdict?.status ?? ""}
        data-replay-studio-session-status={analysis?.replayStudio.session.status ?? ""}
        data-replay-studio-worst-frame={replayStudioWorstFrames[0]?.frameIndex ?? ""}
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
        data-coverage-internal-demo-only-count={analysis?.coverage.summary.internalDemoOnlyCount ?? ""}
        data-coverage-internal-demo-only-families={analysis?.coverage.summary.internalDemoOnlyFamilies.join(",") ?? ""}
        data-coverage-missing-proof-count={analysis?.coverage.summary.missingProofCount ?? ""}
        data-coverage-missing-proof-families={analysis?.coverage.summary.missingProofFamilies.join(",") ?? ""}
        data-coverage-phase-complete={analysis?.coverage.summary.phaseComplete ?? ""}
        data-coverage-remaining-gap-count={analysis?.coverage.summary.remainingGapCount ?? ""}
        data-coverage-unsupported-count={analysis?.coverage.summary.unsupportedCount ?? ""}
        data-coverage-unsupported-families={analysis?.coverage.summary.unsupportedFamilies.join(",") ?? ""}
        data-coverage-user-facing-count={analysis?.coverage.summary.userFacingCount ?? ""}
        data-coverage-user-facing-families={analysis?.coverage.summary.userFacingFamilies.join(",") ?? ""}
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
        data-current-start-readiness-message={currentSourceFrame?.startReadinessMessage ?? ""}
        data-current-start-readiness-prompts={currentSourceFrame?.promptEvents.join(",") ?? ""}
        data-current-visible-body-parts={currentSourceFrame?.visibleBodyParts.join(",") ?? ""}
        data-start-readiness-top-messages={topStartReadinessMessages.map((item) => `${item.message}:${item.count}`).join("|")}
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
        data-motion-frame-input={currentAvatarDebug?.fallbacks.motionFrameInput ?? ""}
        data-current-frame-index={safeFrameIndex}
        data-frame-count={frameCount}
        data-game-lower-body-target-can-use-player-retarget-leg-raise={currentGamePathFrame?.lowerBodyTargetCanUsePlayerRetargetLegRaise ?? ""}
        data-game-lower-body-target-instructor-motion={currentGamePathFrame?.lowerBodyTargetInstructorMotion ?? ""}
        data-game-lower-body-target-player-retarget-motion={currentGamePathFrame?.lowerBodyTargetPlayerRetargetMotion ?? ""}
        data-game-lower-body-target-should-hold-player-squat={currentGamePathFrame?.lowerBodyTargetShouldHoldPlayerSquat ?? ""}
        data-game-lower-body-target-stage={currentGamePathFrame?.lowerBodyTargetStage ?? ""}
        data-feet-owner={liveFeetOwner ?? ""}
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
        data-next-proof-rehearsal-count={MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS.length}
        data-next-proof-rehearsal-readiness={proofRehearsalReadiness.state}
        data-start-readiness-batch-blocked-frame-count={hasRunBatch ? batchSummary.setupBlockedFrames : ""}
        data-start-readiness-batch-blocked-recording-count={hasRunBatch ? batchSummary.setupBlocked : ""}
        data-start-readiness-batch-ready-frame-count={hasRunBatch ? batchSummary.setupReadyFrames : ""}
        data-start-readiness-batch-top-message={hasRunBatch ? batchSummary.setupTopMessage ?? "" : ""}
        data-start-readiness-blocked-frame-count={analysis?.metrics.startReadinessBlockedFrameCount ?? ""}
        data-start-readiness-can-start-game-frame-count={analysis?.metrics.startReadinessCanStartGameFrameCount ?? ""}
        data-start-readiness-ready-frame-count={analysis?.metrics.startReadinessReadyFrameCount ?? ""}
        data-spine-owner={currentSpineDrive?.owner ?? ""}
        data-spine-confidence={currentSpineDrive?.confidence ?? ""}
        data-spine-forward-lean={currentSpineDrive?.forwardLean ?? ""}
        data-spine-side-bend={currentSpineDrive?.sideBend ?? ""}
        data-spine-twist={currentSpineDrive?.twist ?? ""}
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
              ["Setup", hasRunBatch ? `${batchSummary.setupBlocked}/${batchAnalyses.length}` : "--", batchSummary.setupBlocked > 0 ? "text-[#f6ccbe]" : "text-[#a8d5ba]"],
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
                disabled={!replayRecordings || replayRecordings.length === 0 || isRunInProgress}
                className="h-8 rounded-[8px] border border-border-dim px-3 text-xs font-semibold text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select Latest 5
              </button>
              <button
                type="button"
                onClick={selectAllRecordings}
                disabled={!replayRecordings || replayRecordings.length === 0 || isRunInProgress}
                className="h-8 rounded-[8px] border border-border-dim px-3 text-xs font-semibold text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select All {replayRecordings?.length ?? 0}
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

        <ReplayProofRehearsalPanel
          onJumpToEvidence={(recordingId, frameIndex) => {
            setSelectedRecordingId(recordingId as Id<"movements">);
            setFrameIndex(frameIndex);
            setIsPlaying(false);
          }}
          proofRehearsalCandidateSummary={proofRehearsalCandidateSummary}
          proofRehearsalEvidenceEntries={proofRehearsalEvidenceEntries}
          proofRehearsalReadiness={proofRehearsalReadiness}
        />

        <ReplayBatchReviewPanels
          avatarFollowBatchBlockedCount={avatarFollowBatchBlockedCount}
          avatarFollowBatchItems={avatarFollowBatchItems}
          avatarFollowBatchReviewCount={avatarFollowBatchReviewCount}
          hasRunBatch={hasRunBatch}
          onJumpToFrame={(recordingId, frameIndex) => {
            setSelectedRecordingId(recordingId);
            setFrameIndex(frameIndex);
            setIsPlaying(false);
          }}
          setupReviewItems={setupReviewItems}
        />

        <ReplayRecordingList
          activeRecordingId={activeRecordingId}
          analysisByRecordingId={analysisByRecordingId}
          debugReplayError={debugReplayError}
          loadedRecordings={loadedRecordings}
          onSelectRecording={(recordingId) => {
            setSelectedRecordingId(recordingId);
            setFrameIndex(0);
            setIsPlaying(false);
          }}
          onToggleRecordingSelection={toggleRecordingSelection}
          replayRecordings={replayRecordings}
          selectedCount={selectedCount}
          selectedRecordingIds={selectedRecordingIds}
        />

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
                          landmarksRef={replaySourceMotionRef}
                          positionOffset={[0, 0, 0]}
                        />
                        <VrmAvatar
                          landmarksRef={replayMotionRef}
                          motionFrameRef={replayMotionFrameRef}
                          positionOffset={[0, 0, 0]}
                          isPlayer
                          isPlaying
                          name="Replay student"
                          retargetSourceModel={replayRetargetSourceModel}
                          rootMotionFrame={currentRootMotionFrame ?? null}
                          showNameLabel={false}
                          trackingCalibration={replayPlayerCalibration}
                          trackingDebugRef={replayAvatarDebugRef}
                          vrmUrl={replayAvatarVrmUrl}
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
                    const replayStudioFrame = analysis?.replayStudio.frames[index];
                    const replayStudioMarkerStatus = replayStudioFrame?.status ?? "";
                    const quality = sample.retarget?.sourceQuality ?? 0;
                    const selected = index === safeFrameIndex;
                    const sourceFrame = analysis?.gamePath.sourceFrames.find((frame) => frame.frameIndex === index);
                    const isStartBlocked = sourceFrame?.startReadinessState === "blocked";
                    const markerClass = selected
                      ? "border-[#f6ccbe] bg-[#f6ccbe]"
                      : severity === "error"
                        ? "border-[#f28b82] bg-[#f28b82]/70"
                        : severity === "warning"
                          ? "border-[#f6ccbe] bg-[#f6ccbe]/45"
                          : isStartBlocked
                            ? "border-[#f6ccbe] bg-[#f6ccbe]/30"
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
                        data-replay-studio-failure-codes={
                          replayStudioFrame?.failures.map((failure) => failure.code).join(",") ?? ""
                        }
                        data-replay-studio-frame-status={replayStudioMarkerStatus}
                        data-replay-studio-next-fix-area={replayStudioFrame?.failures[0]?.nextFixArea ?? ""}
                        data-start-readiness={sourceFrame?.startReadinessState ?? ""}
                        data-start-readiness-message={sourceFrame?.startReadinessMessage ?? ""}
                        data-testid="movement-replay-frame"
                        title={`Frame ${index} quality ${formatNumber(quality)} · start ${sourceFrame?.startReadinessMessage ?? "pending"} · avatar ${replayStudioMarkerStatus || "pending"}`}
                      />
                    );
                  }) ?? (
                    <div className="h-4 rounded-[5px] border border-border-dim bg-background" />
                  )}
                </div>
              </div>
            </div>

            <ReplayCurrentFramePanel
              analysis={analysis}
              armConfidence={armConfidence}
              avatarFollowAcceptanceStatus={avatarFollowAcceptanceStatus}
              avatarFollowCriteria={avatarFollowCriteria}
              avatarFollowJudgeText={avatarFollowJudgeText}
              avatarFollowSessionFailures={avatarFollowSessionFailures}
              currentAvatarDebug={currentAvatarDebug}
              currentAvatarVisual={currentAvatarVisual}
              currentFrame={currentFrame}
              currentFrameActiveLegMotion={currentFrameActiveLegMotion}
              currentFrameFailures={currentFrameFailures}
              currentFrameUsesSeatedSupport={currentFrameUsesSeatedSupport}
              currentGamePathFrame={currentGamePathFrame}
              currentLeftEar={currentLeftEar}
              currentNose={currentNose}
              currentReplayStudioFrameVerdict={currentReplayStudioFrameVerdict}
              currentReplayStudioPrimaryFailure={currentReplayStudioPrimaryFailure}
              currentRightEar={currentRightEar}
              currentRootMotionFrame={currentRootMotionFrame}
              currentRootPathDistance={currentRootPathDistance}
              currentRootPathPoint={currentRootPathPoint}
              currentSourceFrame={currentSourceFrame}
              currentStartReadinessDetail={currentStartReadinessDetail}
              currentStartReadinessStatus={currentStartReadinessStatus}
              footConfidence={footConfidence}
              gamePathParityLabel={gamePathParityLabel}
              gamePathParityNeedsReview={gamePathParityNeedsReview}
              legConfidence={legConfidence}
              liveFeetOwner={liveFeetOwner}
              liveLowerOwner={liveLowerOwner}
              onExportFixLog={exportReplayStudioFixLog}
              onSeekFrame={(index) => {
                setIsPlaying(false);
                setFrameIndex(index);
              }}
              replayFeetOwner={replayFeetOwner}
              replayLowerOwner={replayLowerOwner}
              replayStudioParity={replayStudioParity}
              replayStudioWorstFrames={replayStudioWorstFrames}
              rootMotionLabel={rootMotionLabel}
              rootMotionNeedsReview={rootMotionNeedsReview}
              rootPathStrip={rootPathStrip}
              safeFrameIndex={safeFrameIndex}
              topStartReadinessMessages={topStartReadinessMessages}
            />
            </section>

            {captureStatus && (
              <div
                className="rounded-[8px] border border-border-dim bg-sidebar/35 px-3 py-2 text-xs text-secondary"
                data-testid="movement-replay-capture-status"
              >
                {captureStatus}
              </div>
            )}

            <ReplayAnalysisReviewSections
              analysis={analysis}
              currentAvatarVisual={currentAvatarVisual}
              failureGroups={failureGroups}
              onSeekFrame={(index) => {
                setIsPlaying(false);
                setFrameIndex(index);
              }}
            />
          </main>
        </div>
    </>
  );
}
