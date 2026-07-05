"use client";
/**
 * Sonae Movement Demo - Premium Posture Studio Interface
 * Last Updated: 2026-06-14 - pitch polish pass
 */

import React, { useEffect, useRef, use, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import AvatarSelectorLobby from "./_components/AvatarSelectorLobby";
import MovementDebugFrameScrubber from "./_components/MovementDebugFrameScrubber";
import MovementCalibrationOverlay from "./_components/MovementCalibrationOverlay";
import MovementCompletionDialog from "./_components/MovementCompletionDialog";
import MovementFeedbackOverlay from "./_components/MovementFeedbackOverlay";
import MovementHud from "./_components/MovementHud";
import MovementMatchScene from "./_components/MovementMatchScene";
import MovementSourceSkeleton from "./_components/MovementSourceSkeleton";
import MovementSparkles from "./_components/MovementSparkles";
import MovementTrackingDebugOverlay from "./_components/MovementTrackingDebugOverlay";
import VrmAvatar from "./_components/VrmAvatar";
import Webcam from "react-webcam";
import { useMovementInstructorPlayback } from "../../_hooks/useMovementInstructorPlayback";
import { useMovementLiveMotionFrame } from "../../_hooks/useMovementLiveMotionFrame";
import { useMovementMatchScoring } from "../../_hooks/useMovementMatchScoring";
import { useMovementMatchSession } from "../../_hooks/useMovementMatchSession";
import { useMediaPipeVision } from "../../_hooks/useMediaPipeVision";
import { useMovementFrames } from "../../_hooks/useMovementFrames";
import { useMovementRecordedMotionFrame } from "../../_hooks/useMovementRecordedMotionFrame";
import {
  useMovementPlayerTracking,
  type MovementPlayerMotionPayload,
} from "../../_hooks/useMovementPlayerTracking";
import { useMovementTrackingCalibration } from "../../_hooks/useMovementTrackingCalibration";
import {
  makeMovementAvatarProofMotionPayload,
  makeMovementAvatarProofPose,
  toMovementAvatarProofMode,
} from "../../_lib/movementAvatarProofFixtures";
import { getStudioRoutineTitle } from "../../_lib/movementPresentation";
import { buildMovementRetargetSourceModel } from "../../_lib/movementRetargeting";
import { resolveMovementStartReadinessBypassReason } from "../../_lib/movementStartBypass";
import { MOVEMENT_SPINE_GOAL_OPTIONS } from "../../_lib/movementSpineIntent";
import type { MovementSpineGoal } from "../../_lib/movementTypes";
import {
  buildMovementCalibration,
  getMovementTrackingHealthSummary,
  type MovementTrackingDebugState,
} from "../../_lib/movementTrackingCalibration";
import {
  resolveMovementStartGateDecision,
  resolveMovementStartReadiness,
  type MovementStartReadiness,
} from "../../_lib/movementSourceFrame";
import type { VrmMotionFrame } from "../../_lib/vrmRigging";

type MotionFrame = VrmMotionFrame;

const MOVEMENT_GAME_START_COUNTDOWN_MS = 5000;

type MovementGameStartGateStatus =
  | "idle"
  | "countdown"
  | "checking-visibility"
  | "blocked";

type MovementGameStartGateState = {
  countdownMsRemaining: number;
  endsAt: number | null;
  message: string | null;
  status: MovementGameStartGateStatus;
};

type DebugTrackingSample = {
  capturedAt: number;
  updatedAt?: number;
  baseline: string;
  camera?: MovementTrackingDebugState["camera"];
  tracking: {
    poseCount: number;
    worldPoseCount: number;
    faceCount: number;
    leftHandCount: number;
    rightHandCount: number;
    pose?: CompactLandmark[];
    worldPose?: CompactLandmark[];
    face?: CompactLandmark[];
    leftHand?: CompactLandmark[];
    rightHand?: CompactLandmark[];
  };
  health: {
    score: number;
    label: string;
    primaryAction: string;
    warnings: string[];
  };
  calibrationQuality?: number;
  startReadiness?: MovementStartReadiness;
  avatarVisual?: MovementTrackingDebugState["avatarVisual"];
  bodyConfidence?: MovementTrackingDebugState["bodyConfidence"];
  fallbacks: MovementTrackingDebugState["fallbacks"];
  poseBounds?: MovementTrackingDebugState["poseBounds"];
  retarget?: MovementTrackingDebugState["retarget"];
  headRaw?: MovementTrackingDebugState["headRaw"];
  headApplied?: MovementTrackingDebugState["headApplied"];
};

type CompactLandmark = {
  x: number;
  y: number;
  z?: number;
  v?: number;
};

function compactNumber(value: number | undefined, fallback = 0) {
  return Number((value ?? fallback).toFixed(4));
}

function compactLandmarks(landmarks: MovementPlayerMotionPayload["landmarks"] | null | undefined) {
  return (landmarks ?? []).map((landmark) => ({
    x: compactNumber(landmark.x),
    y: compactNumber(landmark.y),
    z: landmark.z === undefined ? undefined : compactNumber(landmark.z),
    v: landmark.visibility === undefined ? undefined : compactNumber(landmark.visibility),
  }));
}

function compactTrackingPayload(payload: MovementPlayerMotionPayload | null) {
  const pose = compactLandmarks(payload?.landmarks);
  const worldPose = compactLandmarks(payload?.worldLandmarks);
  const face = compactLandmarks(payload?.faceLandmarks);
  const leftHand = compactLandmarks(payload?.hands?.left?.landmarks);
  const rightHand = compactLandmarks(payload?.hands?.right?.landmarks);

  return {
    poseCount: pose.length,
    worldPoseCount: worldPose.length,
    faceCount: face.length,
    leftHandCount: leftHand.length,
    rightHandCount: rightHand.length,
    pose: pose.length > 0 ? pose : undefined,
    worldPose: worldPose.length > 0 ? worldPose : undefined,
    face: face.length > 0 ? face : undefined,
    leftHand: leftHand.length > 0 ? leftHand : undefined,
    rightHand: rightHand.length > 0 ? rightHand : undefined,
  };
}

function getDebugCameraInfo(video: HTMLVideoElement | null | undefined): MovementTrackingDebugState["camera"] {
  if (!video) return undefined;
  const track = video.srcObject instanceof MediaStream
    ? video.srcObject.getVideoTracks()[0]
    : undefined;
  const settings = track?.getSettings();

  return {
    aspectRatio: settings?.aspectRatio,
    deviceLabel: track?.label,
    frameRate: settings?.frameRate,
    trackHeight: settings?.height,
    trackWidth: settings?.width,
    videoHeight: video.videoHeight,
    videoWidth: video.videoWidth,
  };
}

function getDebugPoseBounds(
  landmarks: MovementPlayerMotionPayload["landmarks"] | null | undefined,
): MovementTrackingDebugState["poseBounds"] {
  if (!landmarks || landmarks.length === 0) return undefined;

  return landmarks.reduce<NonNullable<MovementTrackingDebugState["poseBounds"]>>(
    (bounds, landmark) => ({
      maxX: Math.max(bounds.maxX, compactNumber(landmark.x)),
      maxY: Math.max(bounds.maxY, compactNumber(landmark.y)),
      minX: Math.min(bounds.minX, compactNumber(landmark.x)),
      minY: Math.min(bounds.minY, compactNumber(landmark.y)),
      outOfFrameCount: bounds.outOfFrameCount +
        (landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1 ? 1 : 0),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      outOfFrameCount: 0,
    },
  );
}

function summarizeSampleLabels(
  samples: DebugTrackingSample[],
  selector: (sample: DebugTrackingSample) => string | undefined,
) {
  const counts = new Map<string, number>();
  for (const sample of samples) {
    const value = selector(sample);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${label}:${count}`)
    .join(", ");
}

function toMovementSpineGoal(value: unknown): MovementSpineGoal | null {
  if (typeof value !== "string") return null;
  return MOVEMENT_SPINE_GOAL_OPTIONS.some((option) => option.value === value)
    ? (value as MovementSpineGoal)
    : null;
}

function getMovementStartReadinessMessage(readiness: MovementStartReadiness | null) {
  if (!readiness) return "Move where I can see you.";
  if (readiness.promptEvents.includes("show-your-whole-body")) return "Show your whole body.";
  if (readiness.promptEvents.includes("show-your-feet")) return "Show your feet.";
  if (readiness.promptEvents.includes("show-your-hands")) return "Show your hands.";
  if (readiness.promptEvents.includes("hold-still-for-calibration")) {
    return "Hold still for posture check.";
  }
  if (readiness.promptEvents.includes("walk-back-into-frame")) {
    return "Walk back into frame.";
  }
  if (readiness.blockedReasons.length > 0) return "Move where I can see you.";
  return "Get ready.";
}

function createIdleGameStartGate(): MovementGameStartGateState {
  return {
    countdownMsRemaining: 0,
    endsAt: null,
    message: null,
    status: "idle",
  };
}

export default function MatchPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const searchParams = useSearchParams();
  const movementId = unwrappedParams.id as Id<"movements">;
  const isDebugTracking = searchParams.get("debugTracking") === "1";
  const isGuidedPreviewRoute = searchParams.get("guidedPreview") === "1";
  const isDebugAutoBaselineRoute = isDebugTracking && searchParams.get("debugAutoBaseline") === "1";
  const debugPlayerPoseMode = isDebugTracking
    ? toMovementAvatarProofMode(searchParams.get("debugPlayerPose"))
    : null;
  const isDebugPlayerPoseRoute = Boolean(debugPlayerPoseMode);
  const shouldAutoStartGuidedPreview = (isGuidedPreviewRoute && isDebugTracking) || isDebugPlayerPoseRoute;
  const [cameraStatus, setCameraStatus] = useState<"pending" | "ready" | "error">("pending");
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const movement = useQuery(api.movements.get, { id: movementId });
  const saveDebugTrackingSession = useMutation(api.movements.saveDebugTrackingSession);
  const { frames: loadedFrames, isLoading: isFramesLoading } = useMovementFrames(movement);

  const webcamRef = useRef<Webcam>(null);
  const trackingDebugRef = useRef<MovementTrackingDebugState | null>(null);
  const {
    poseLandmarker,
    faceLandmarker,
    handLandmarker,
    status: visionStatus,
    error: visionError,
    retry: retryVision,
    isReady: isVisionReady,
  } = useMediaPipeVision();
  const isVisionReadyForSession = isVisionReady || isDebugPlayerPoseRoute;
  const instructorTrackingDebugRef = useRef<MovementTrackingDebugState | null>(null);
  const debugPlayerNeutralPose = React.useMemo(() => makeMovementAvatarProofPose("standing"), []);
  const debugPlayerMotionPayload = React.useMemo<MovementPlayerMotionPayload | null>(() => {
    if (!debugPlayerPoseMode) return null;

    return makeMovementAvatarProofMotionPayload(debugPlayerPoseMode);
  }, [debugPlayerPoseMode]);
  const debugPlayerLiveLmRef = useRef<MovementPlayerMotionPayload | null>(null);
  debugPlayerLiveLmRef.current = debugPlayerMotionPayload;
  const debugPlayerCalibration = React.useMemo(() => (
    isDebugPlayerPoseRoute
      ? buildMovementCalibration({ poseLandmarks: debugPlayerNeutralPose })
      : null
  ), [debugPlayerNeutralPose, isDebugPlayerPoseRoute]);
  const debugPlayerRetargetSourceModel = React.useMemo(() => (
    isDebugPlayerPoseRoute
      ? buildMovementRetargetSourceModel({ poseLandmarks: debugPlayerNeutralPose })
      : null
  ), [debugPlayerNeutralPose, isDebugPlayerPoseRoute]);
  const {
    isLobby,
    playerAvatarUrl,
    playerAvatarName,
    instructorAvatarUrl,
    instructorAvatarName,
    isPlaying,
    calibrationStatus,
    setPlayerAvatarUrl,
    setInstructorAvatarUrl,
    setIsPlaying,
    startMatch,
    markBodyTracked,
    togglePlaying,
    resetMatch,
  } = useMovementMatchSession({ isVisionReady: isVisionReadyForSession });
  const playerLiveLmRef = useMovementPlayerTracking({
    webcamRef,
    poseLandmarker,
    faceLandmarker,
    handLandmarker,
    onBodyTracked: markBodyTracked,
  });
  const effectivePlayerLiveLmRef = isDebugPlayerPoseRoute ? debugPlayerLiveLmRef : playerLiveLmRef;
  const {
    calibration,
    isCalibrated,
    isCalibrationSkipped,
    isCalibrating,
    calibrationStatus: trackingCalibrationStatus,
    calibrationProgress,
    calibrationSampleCount,
    calibrationCountdownSeconds,
    retargetSourceModel: playerRetargetSourceModel,
    startCalibration,
    resetCalibration,
    skipCalibration,
  } = useMovementTrackingCalibration({
    isVisionReady: isVisionReadyForSession,
    playerLiveLmRef: effectivePlayerLiveLmRef,
  });
  const effectivePlayerCalibration = debugPlayerCalibration ?? calibration;
  const effectivePlayerRetargetSourceModel = debugPlayerRetargetSourceModel ?? playerRetargetSourceModel;
  const isTrackingReady = isDebugPlayerPoseRoute || isCalibrated || isCalibrationSkipped;
  const [gameStartGate, setGameStartGate] = useState<MovementGameStartGateState>(
    createIdleGameStartGate,
  );
  const liveMotionFrameRequirements = React.useMemo(() => ({
    calibrationQuality: effectivePlayerCalibration?.quality ?? null,
    countdownMsRemaining: gameStartGate.status === "countdown"
      ? gameStartGate.countdownMsRemaining
      : 0,
  }), [
    effectivePlayerCalibration?.quality,
    gameStartGate.countdownMsRemaining,
    gameStartGate.status,
  ]);
  const playerMotionFrameRef = useMovementLiveMotionFrame({
    calibration: effectivePlayerCalibration,
    isPlaying,
    playerLiveLmRef: effectivePlayerLiveLmRef,
    requirements: liveMotionFrameRequirements,
    retargetSourceModel: effectivePlayerRetargetSourceModel,
  });
  const displayedCalibrationStatus = isCalibrationSkipped
    ? trackingCalibrationStatus
    : isCalibrated
      ? calibrationStatus
      : trackingCalibrationStatus;

  const {
    frameCount: instructorFrameCount,
    instructorCurrentLmRef,
    frameIndexRef: instructorFrameIndexRef,
    retargetAnalysis: instructorRetargetAnalysis,
    retargetSourceModel: instructorRetargetSourceModel,
    advanceInstructorFrame,
    resetInstructorPlayback,
    setInstructorFrame,
  } = useMovementInstructorPlayback(loadedFrames as unknown as MotionFrame[]);
  const instructorMotionFrameRef = useMovementRecordedMotionFrame({
    instructorFrameRef: instructorCurrentLmRef,
    isPlaying,
    retargetSourceModel: instructorRetargetSourceModel,
  });
  const spineGoal = toMovementSpineGoal(movement?.spineGoal);
  const {
    finalScore,
    finalSpineScore,
    finalSpineCue,
    feedbackMsg,
    isComplete,
    hudScore,
    hudSync,
    hudSpine,
    hudSpineCue,
    syncRef,
    resetScoring,
  } = useMovementMatchScoring({
    isPlaying,
    isScoringEnabled: isCalibrated || isDebugPlayerPoseRoute,
    setIsPlaying,
    playerMotionFrameRef,
    instructorMotionFrameRef,
    advanceInstructorFrame,
    spineGoal,
  });
  const hasStartedGuidedPreviewRef = useRef(false);
  const debugTrackingSamplesRef = useRef<DebugTrackingSample[]>([]);
  const debugTrackingChunkStartedAtRef = useRef<number | null>(null);
  const debugTrackingChunkStartReadinessRef = useRef<MovementStartReadiness | null>(null);
  const isSavingDebugTrackingRef = useRef(false);
  const startDebugAutoBaseline = React.useCallback(() => {
    const readinessBypassReason = resolveMovementStartReadinessBypassReason({
      isDebugAutoBaselineRoute: true,
    });
    if (readinessBypassReason !== "debug-auto-baseline") return;

    setGameStartGate(createIdleGameStartGate());
    startMatch();
    skipCalibration();
    resetInstructorPlayback();
    resetScoring();
    setIsPlaying(true);
  }, [
    resetInstructorPlayback,
    resetScoring,
    setIsPlaying,
    skipCalibration,
    startMatch,
  ]);
  const startSelectedMatch = React.useCallback(() => {
    setGameStartGate(createIdleGameStartGate());
    startMatch();

    const readinessBypassReason = resolveMovementStartReadinessBypassReason({
      isDebugPlayerPoseRoute,
      isGuidedPreviewRoute,
    });
    if (!readinessBypassReason) return;

    skipCalibration();
    resetInstructorPlayback();
    resetScoring();
    setIsPlaying(true);
  }, [
    isDebugPlayerPoseRoute,
    isGuidedPreviewRoute,
    resetInstructorPlayback,
    resetScoring,
    setIsPlaying,
    skipCalibration,
    startMatch,
  ]);

  const resolveCurrentGameStartReadiness = React.useCallback(() => {
    const sourceFrame = playerMotionFrameRef.current?.source;
    if (!sourceFrame) return null;

    return resolveMovementStartReadiness({
      cameraConfidence: sourceFrame.cameraConfidence,
      requirements: {
        calibrationQuality: effectivePlayerCalibration?.quality ?? null,
      },
    });
  }, [effectivePlayerCalibration?.quality, playerMotionFrameRef]);

  const completeGameStartGate = React.useCallback(() => {
    const readiness = resolveCurrentGameStartReadiness();
    const gateDecision = resolveMovementStartGateDecision({
      readiness,
      target: "game",
    });
    if (gateDecision.canStart) {
      resetInstructorPlayback();
      resetScoring();
      setGameStartGate(createIdleGameStartGate());
      setIsPlaying(true);
      return;
    }

    setGameStartGate({
      countdownMsRemaining: 0,
      endsAt: null,
      message: getMovementStartReadinessMessage(gateDecision.readiness),
      status: "blocked",
    });
  }, [
    resetInstructorPlayback,
    resetScoring,
    resolveCurrentGameStartReadiness,
    setIsPlaying,
  ]);

  useEffect(() => {
    if (gameStartGate.status !== "countdown" || gameStartGate.endsAt === null) {
      return undefined;
    }

    let startCheckTimeoutId: number | null = null;
    const updateCountdown = () => {
      const countdownMsRemaining = Math.max(0, gameStartGate.endsAt! - Date.now());
      if (countdownMsRemaining > 0) {
        setGameStartGate((current) => (
          current.status === "countdown" && current.endsAt === gameStartGate.endsAt
            ? { ...current, countdownMsRemaining }
            : current
        ));
        return;
      }

      setGameStartGate((current) => (
        current.status === "countdown" && current.endsAt === gameStartGate.endsAt
          ? {
              countdownMsRemaining: 0,
              endsAt: null,
              message: "Checking visibility.",
              status: "checking-visibility",
            }
          : current
      ));
      startCheckTimeoutId = window.setTimeout(completeGameStartGate, 120);
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 100);

    return () => {
      window.clearInterval(intervalId);
      if (startCheckTimeoutId !== null) {
        window.clearTimeout(startCheckTimeoutId);
      }
    };
  }, [
    completeGameStartGate,
    gameStartGate.endsAt,
    gameStartGate.status,
  ]);

  const handleTogglePlaying = React.useCallback(() => {
    if (isPlaying) {
      setGameStartGate(createIdleGameStartGate());
      togglePlaying();
      return;
    }

    const readinessBypassReason = resolveMovementStartReadinessBypassReason({
      isDebugPlayerPoseRoute,
      isManualPreviewSkip: isCalibrationSkipped,
    });
    if (readinessBypassReason) {
      setGameStartGate(createIdleGameStartGate());
      togglePlaying();
      return;
    }

    if (!isVisionReadyForSession || !isTrackingReady || isCalibrating) return;

    setIsPlaying(false);
    setGameStartGate({
      countdownMsRemaining: MOVEMENT_GAME_START_COUNTDOWN_MS,
      endsAt: Date.now() + MOVEMENT_GAME_START_COUNTDOWN_MS,
      message: "Walk back into frame.",
      status: "countdown",
    });
  }, [
    isCalibrating,
    isCalibrationSkipped,
    isDebugPlayerPoseRoute,
    isPlaying,
    isTrackingReady,
    isVisionReadyForSession,
    setIsPlaying,
    togglePlaying,
  ]);

  useEffect(() => {
    if (
      (!shouldAutoStartGuidedPreview && !isDebugAutoBaselineRoute) ||
      hasStartedGuidedPreviewRef.current ||
      !isLobby ||
      !movement ||
      isFramesLoading ||
      loadedFrames.length === 0
    ) {
      return;
    }

    hasStartedGuidedPreviewRef.current = true;
    if (isDebugAutoBaselineRoute) {
      startDebugAutoBaseline();
    } else {
      startSelectedMatch();
    }
  }, [
    isFramesLoading,
    isDebugAutoBaselineRoute,
    isLobby,
    loadedFrames.length,
    movement,
    shouldAutoStartGuidedPreview,
    startDebugAutoBaseline,
    startSelectedMatch,
  ]);

  useEffect(() => {
    if (!isDebugAutoBaselineRoute || isLobby) return undefined;

    const captureSample = () => {
      const debugState = trackingDebugRef.current;
      const trackingPayload = effectivePlayerLiveLmRef.current;
      const startReadiness = playerMotionFrameRef.current?.source.startReadiness ?? undefined;
      const now = performance.now();
      if (!debugState && !trackingPayload) return;
      if (debugTrackingChunkStartedAtRef.current === null) {
        debugTrackingChunkStartedAtRef.current = Date.now();
        debugTrackingChunkStartReadinessRef.current = startReadiness ?? null;
      }

      const camera = getDebugCameraInfo(webcamRef.current?.video);
      const poseBounds = getDebugPoseBounds(trackingPayload?.landmarks);
      if (debugState) {
        debugState.camera = camera;
        debugState.poseBounds = poseBounds;
      }
      const health = getMovementTrackingHealthSummary(debugState, { now });
      debugTrackingSamplesRef.current.push({
        capturedAt: Date.now(),
        updatedAt: debugState?.updatedAt,
        baseline: debugState?.fallbacks.baseline ?? "waiting",
        camera,
        tracking: compactTrackingPayload(trackingPayload),
        health: {
          score: health.score,
          label: health.label,
          primaryAction: health.primaryAction,
          warnings: health.warnings,
        },
        calibrationQuality: debugState?.calibrationQuality,
        startReadiness,
        avatarVisual: debugState?.avatarVisual,
        bodyConfidence: debugState?.bodyConfidence,
        fallbacks: debugState?.fallbacks ?? { baseline: "waiting" },
        poseBounds,
        retarget: debugState?.retarget,
        headRaw: debugState?.headRaw,
        headApplied: debugState?.headApplied,
      });
    };

    const flushSamples = async () => {
      if (isSavingDebugTrackingRef.current) return;

      const samples = debugTrackingSamplesRef.current;
      if (samples.length < 4) return;

      const chunk = samples.slice(0, 40);
      const startedAt = debugTrackingChunkStartedAtRef.current ?? chunk[0]?.capturedAt ?? Date.now();
      const endedAt = chunk[chunk.length - 1]?.capturedAt ?? Date.now();
      const captureStartReadiness = chunk[0]?.startReadiness ??
        debugTrackingChunkStartReadinessRef.current ??
        undefined;
      debugTrackingSamplesRef.current = samples.slice(chunk.length);
      debugTrackingChunkStartedAtRef.current = debugTrackingSamplesRef.current[0]?.capturedAt ?? null;
      debugTrackingChunkStartReadinessRef.current = debugTrackingSamplesRef.current[0]?.startReadiness ?? null;
      isSavingDebugTrackingRef.current = true;

      try {
        await saveDebugTrackingSession({
          movementId,
          trigger: "debug-auto-baseline",
          sampleCount: chunk.length,
          durationMs: Math.max(0, endedAt - startedAt),
          startedAt,
          endedAt,
          baselineSummary: summarizeSampleLabels(chunk, (sample) => sample.baseline) || "none",
          warningSummary: summarizeSampleLabels(chunk, (sample) => sample.health.warnings[0]) || "none",
          captureStartReadiness,
          samplesJson: JSON.stringify(chunk),
        });
      } finally {
        isSavingDebugTrackingRef.current = false;
      }
    };

    const sampleIntervalId = window.setInterval(captureSample, 500);
    const flushIntervalId = window.setInterval(() => {
      void flushSamples();
    }, 2000);

    captureSample();

    return () => {
      window.clearInterval(sampleIntervalId);
      window.clearInterval(flushIntervalId);
      void flushSamples();
    };
  }, [
    isDebugAutoBaselineRoute,
    isLobby,
    movementId,
    effectivePlayerLiveLmRef,
    playerMotionFrameRef,
    saveDebugTrackingSession,
  ]);

  useEffect(() => {
    if (!isDebugTracking || typeof window === "undefined") return;

    const debugWindow = window as Window & {
      __sonaeMovementRecordingRetargetAnalysis?: typeof instructorRetargetAnalysis;
    };
    debugWindow.__sonaeMovementRecordingRetargetAnalysis = instructorRetargetAnalysis;
  }, [instructorRetargetAnalysis, isDebugTracking]);

  if (!movement || isFramesLoading) {
    const loadingStudio = (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#07070b] text-[#f6ccbe] animate-pulse font-medium">
        <style>{`nextjs-portal { display: none !important; }`}</style>
        Preparing posture studio...
      </div>
    );

    return typeof document === "undefined" ? loadingStudio : createPortal(loadingStudio, document.body);
  }

  if (isLobby) {
    return (
      <AvatarSelectorLobby
        playerAvatarUrl={playerAvatarUrl}
        setPlayerAvatarUrl={setPlayerAvatarUrl}
        instructorAvatarUrl={instructorAvatarUrl}
        setInstructorAvatarUrl={setInstructorAvatarUrl}
        onStart={startSelectedMatch}
      />
    );
  }

  const routineTitle = getStudioRoutineTitle(movement.title);

  const studio = (
    <div className="fixed inset-0 z-[9999] flex h-screen w-screen flex-col overflow-hidden bg-[#07070b]">
      <style>{`nextjs-portal { display: none !important; }`}</style>
      <MovementMatchScene>
        <VrmAvatar
          landmarksRef={instructorCurrentLmRef}
          motionFrameRef={instructorMotionFrameRef}
          positionOffset={[-5, 0, 0]}
          isPlaying={isPlaying}
          showPausedPose={isDebugTracking}
          trackingDebugRef={instructorTrackingDebugRef}
          retargetSourceModel={instructorRetargetSourceModel}
          vrmUrl={instructorAvatarUrl}
          name={instructorAvatarName}
        />

        {isDebugTracking ? (
          <MovementSourceSkeleton
            color="#f6ccbe"
            landmarksRef={instructorCurrentLmRef}
            mirrorX
            positionOffset={[-5, 0, 0]}
          />
        ) : null}

        <VrmAvatar
          landmarksRef={effectivePlayerLiveLmRef}
          positionOffset={[5, 0, 0]}
          isPlayer={true}
          isPlaying={isPlaying}
          motionFrameRef={playerMotionFrameRef}
          trackingCalibration={effectivePlayerCalibration}
          trackingDebugRef={trackingDebugRef}
          retargetSourceModel={effectivePlayerRetargetSourceModel}
          vrmUrl={playerAvatarUrl}
          name={playerAvatarName}
        />

        {isDebugTracking ? (
          <MovementSourceSkeleton
            color="#bfe7d0"
            landmarksRef={effectivePlayerLiveLmRef}
            positionOffset={[5, 0, 0]}
          />
        ) : null}

        <MovementSparkles landmarksRef={effectivePlayerLiveLmRef} jointIndices={[15, 16, 27, 28]} syncRef={syncRef} />
      </MovementMatchScene>

      <MovementHud
        movementTitle={routineTitle}
        difficulty={movement.difficulty || "Beginner"}
        hudScore={hudScore}
        hudSync={hudSync}
        hudSpine={hudSpine}
        hudSpineCue={hudSpineCue}
        isPlaying={isPlaying}
        isVisionReady={isVisionReadyForSession}
        isTrackingCalibrated={isTrackingReady}
        isPreviewMode={isCalibrationSkipped}
        isCalibrating={isCalibrating}
        visionStatus={visionStatus}
        visionError={visionError}
        isCameraReady={isDebugPlayerPoseRoute || cameraStatus === "ready"}
        cameraError={cameraError}
        calibrationStatus={displayedCalibrationStatus}
        webcamRef={webcamRef}
        startReadinessCountdownSeconds={Math.ceil(gameStartGate.countdownMsRemaining / 1000)}
        startReadinessMessage={gameStartGate.message}
        startReadinessStatus={gameStartGate.status}
        onTogglePlaying={handleTogglePlaying}
        onRetryVision={retryVision}
        onCalibrate={() => {
          setGameStartGate(createIdleGameStartGate());
          startCalibration();
        }}
        onResetStudio={() => {
          setGameStartGate(createIdleGameStartGate());
          resetCalibration();
          resetMatch({ returnToLobby: true, resetInstructorPlayback, resetScoring });
        }}
        onStartGuidedPreview={() => {
          const readinessBypassReason = resolveMovementStartReadinessBypassReason({
            isManualPreviewSkip: true,
          });
          if (readinessBypassReason !== "manual-preview-skip") return;

          setGameStartGate(createIdleGameStartGate());
          skipCalibration();
          resetInstructorPlayback();
          resetScoring();
          setIsPlaying(true);
        }}
        onCameraReady={() => {
          setCameraStatus("ready");
          setCameraError(null);
        }}
        onCameraError={(error) => {
          setCameraStatus("error");
          setCameraError(error);
        }}
      />

      <MovementDebugFrameScrubber
        frameCount={instructorFrameCount}
        frameIndexRef={instructorFrameIndexRef}
        isEnabled={isDebugTracking}
        isPlaying={isPlaying}
        onFrameChange={(frameIndex) => {
          resetScoring();
          setInstructorFrame(frameIndex);
        }}
        onPlayingChange={setIsPlaying}
        recordingAnalysis={instructorRetargetAnalysis}
      />

      <MovementCalibrationOverlay
        isCalibrated={isTrackingReady}
        isCalibrating={isCalibrating}
        isVisionReady={isVisionReadyForSession}
        calibrationStatus={trackingCalibrationStatus}
        calibrationProgress={calibrationProgress}
        calibrationSampleCount={calibrationSampleCount}
        calibrationCountdownSeconds={calibrationCountdownSeconds}
        onCalibrate={startCalibration}
        onSkipCalibration={skipCalibration}
        onStartDebugAutoBaseline={isDebugTracking ? startDebugAutoBaseline : undefined}
      />

      <MovementTrackingDebugOverlay
        calibration={effectivePlayerCalibration}
        debugRef={trackingDebugRef}
        isEnabled={isDebugTracking}
        title="Student Diagnostics"
      />

      <MovementTrackingDebugOverlay
        calibration={null}
        debugRef={instructorTrackingDebugRef}
        isEnabled={isDebugTracking}
        placement="right"
        title="Coach Diagnostics"
      />

      <MovementFeedbackOverlay feedbackMsg={feedbackMsg} />

      <MovementCompletionDialog
        isOpen={isComplete}
        finalScore={finalScore}
        finalSpineScore={finalSpineScore}
        finalSpineCue={finalSpineCue}
        isPreviewMode={isCalibrationSkipped}
        onExitMatch={() =>
          resetMatch({ returnToLobby: true, resetInstructorPlayback, resetScoring })
        }
        onRematch={() =>
          resetMatch({ startPlaying: isTrackingReady, resetInstructorPlayback, resetScoring })
        }
      />
    </div>
  );

  return typeof document === "undefined" ? studio : createPortal(studio, document.body);
}
