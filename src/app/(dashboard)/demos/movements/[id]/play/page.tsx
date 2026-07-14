"use client";
/**
 * Sonae Movement Demo - Premium Posture Studio Interface
 * Last Updated: 2026-06-14 - pitch polish pass
 */

import React, { useEffect, useRef, use, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  makeMovementAvatarProofFaceLandmarks,
  makeMovementAvatarProofMotionPayload,
  makeMovementAvatarProofPose,
  makeMovementAvatarProofRootBaselinePayload,
  toMovementAvatarProofMode,
} from "../../_lib/movementAvatarProofFixtures";
import {
  parseMovementDebugGameFrameIndex,
  shouldShowMovementDebugPlayerPausedPose,
} from "../../_lib/movementGameDebugRoute";
import { getMovementDebugQaPresets } from "../../_lib/movementDebugQaPresets";
import { getStudioRoutineTitle } from "../../_lib/movementPresentation";
import {
  buildMovementRetargetSourceModel,
} from "../../_lib/movementRetargeting";
import { buildMovementRecordedPlayerSetup } from "../../_lib/movementRecordedPlayerSetup";
import { resolveMovementStartReadinessBypassReason } from "../../_lib/movementStartBypass";
import { MOVEMENT_SPINE_GOAL_OPTIONS } from "../../_lib/movementSpineIntent";
import {
  buildMovementSpineModel,
  evaluateMovementSpineReadiness,
} from "../../_lib/movementSpineMetrics";
import type { MovementSpineGoal } from "../../_lib/movementTypes";
import {
  buildMovementCalibration,
  getMovementTrackingHealthSummary,
  type MovementTrackingDebugState,
} from "../../_lib/movementTrackingCalibration";
import {
  getMovementCameraConfidenceRecoveryCue,
  resolveMovementStartGateDecision,
  resolveMovementStartReadiness,
  type MovementStartReadiness,
} from "../../_lib/movementSourceFrame";
import {
  getMovementSetupRecoveryCue,
  getMovementStartReadinessMessage,
} from "../../_lib/movementSetupRecoveryCue";
import type { VrmMotionFrame, VrmPoseLandmark } from "../../_lib/vrmRigging";

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

function createIdleGameStartGate(): MovementGameStartGateState {
  return {
    countdownMsRemaining: 0,
    endsAt: null,
    message: null,
    status: "idle",
  };
}

function toDebugPlayerMotionPayload(frame: MotionFrame | null | undefined): MovementPlayerMotionPayload | null {
  if (!frame) return null;
  const normalizeLandmarks = (landmarks: VrmPoseLandmark[]) =>
    landmarks.map((landmark) => ({
      ...landmark,
      z: landmark.z ?? 0,
    }));

  if (Array.isArray(frame)) {
    return {
      landmarks: normalizeLandmarks(frame) as MovementPlayerMotionPayload["landmarks"],
    };
  }

  const poseLandmarks = frame.landmarks ?? frame.pose;

  return {
    ...frame,
    landmarks: poseLandmarks
      ? normalizeLandmarks(poseLandmarks) as MovementPlayerMotionPayload["landmarks"]
      : undefined,
    worldLandmarks: frame.worldLandmarks
      ? normalizeLandmarks(frame.worldLandmarks) as MovementPlayerMotionPayload["worldLandmarks"]
      : frame.worldLandmarks,
  } as MovementPlayerMotionPayload;
}

export default function MatchPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const movementId = unwrappedParams.id as Id<"movements">;
  const isDebugTracking = searchParams.get("debugTracking") === "1";
  const isGuidedPreviewRoute = searchParams.get("guidedPreview") === "1";
  const isDebugAutoBaselineRoute = isDebugTracking && searchParams.get("debugAutoBaseline") === "1";
  const debugGameFrameIndex = isDebugTracking
    ? parseMovementDebugGameFrameIndex(searchParams.get("debugGameFrame"))
    : null;
  const isDebugGameFrameRoute = debugGameFrameIndex !== null;
  const debugPlayerPoseMode = isDebugTracking
    ? toMovementAvatarProofMode(searchParams.get("debugPlayerPose"))
    : null;
  const debugInstructorPoseMode = isDebugTracking
    ? toMovementAvatarProofMode(searchParams.get("debugInstructorPose"))
    : null;
  const isDebugPoseTransitionRoute = isDebugTracking && searchParams.get("debugPoseTransition") === "1";
  const shouldSkipDebugPoseCalibration = isDebugTracking && searchParams.get("debugSkipPoseCalibration") === "1";
  const isDebugPlayerPoseRoute = Boolean(debugPlayerPoseMode);
  const isDebugInstructorPoseRoute = Boolean(debugInstructorPoseMode);
  const isDebugPlayerInjectionRoute = isDebugPlayerPoseRoute || isDebugGameFrameRoute;
  const isDebugMovementInjectionRoute = isDebugPlayerInjectionRoute || isDebugInstructorPoseRoute;
  const shouldUseDebugStartGate = isDebugPlayerInjectionRoute && searchParams.get("debugStartGate") === "1";
  const shouldBypassStartReadinessForDebug =
    isDebugPlayerInjectionRoute && !shouldUseDebugStartGate;
  const shouldShowPlayerPausedPose = shouldShowMovementDebugPlayerPausedPose({ isDebugTracking });
  const shouldAutoStartGuidedPreview = (isGuidedPreviewRoute && isDebugTracking) || isDebugMovementInjectionRoute;
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
  const isVisionReadyForSession = isVisionReady || isDebugMovementInjectionRoute;
  const instructorTrackingDebugRef = useRef<MovementTrackingDebugState | null>(null);
  const [debugPoseTransitionActive, setDebugPoseTransitionActive] = React.useState(false);
  React.useEffect(() => {
    if (!isDebugPoseTransitionRoute) {
      setDebugPoseTransitionActive(false);
      return;
    }

    setDebugPoseTransitionActive(false);
    const timer = window.setTimeout(() => setDebugPoseTransitionActive(true), 900);
    return () => window.clearTimeout(timer);
  }, [debugInstructorPoseMode, debugPlayerPoseMode, isDebugPoseTransitionRoute]);
  const debugPlayerNeutralPose = React.useMemo(() => makeMovementAvatarProofPose("standing"), []);
  const debugPlayerNeutralFace = React.useMemo(
    () => makeMovementAvatarProofFaceLandmarks("standing"),
    [],
  );
  const debugPlayerMotionPayload = React.useMemo<MovementPlayerMotionPayload | null>(() => {
    if (!debugPlayerPoseMode) return null;

    if (isDebugPoseTransitionRoute && !debugPoseTransitionActive) {
      return makeMovementAvatarProofRootBaselinePayload();
    }
    return makeMovementAvatarProofMotionPayload(debugPlayerPoseMode);
  }, [debugPlayerPoseMode, debugPoseTransitionActive, isDebugPoseTransitionRoute]);
  const debugInstructorMotionPayload = React.useMemo<MovementPlayerMotionPayload | null>(() => {
    if (!debugInstructorPoseMode) return null;

    if (isDebugPoseTransitionRoute && !debugPoseTransitionActive) {
      return makeMovementAvatarProofRootBaselinePayload();
    }
    return makeMovementAvatarProofMotionPayload(debugInstructorPoseMode);
  }, [debugInstructorPoseMode, debugPoseTransitionActive, isDebugPoseTransitionRoute]);
  const debugInstructorLmRef = useRef<MovementPlayerMotionPayload | null>(null);
  debugInstructorLmRef.current = debugInstructorMotionPayload;
  const debugGameFrameMotionPayload = React.useMemo<MovementPlayerMotionPayload | null>(() => (
    debugGameFrameIndex === null
      ? null
      : toDebugPlayerMotionPayload(loadedFrames[debugGameFrameIndex] as unknown as MotionFrame | undefined)
  ), [debugGameFrameIndex, loadedFrames]);
  const debugPlayerLiveLmRef = useRef<MovementPlayerMotionPayload | null>(null);
  debugPlayerLiveLmRef.current = debugGameFrameMotionPayload ?? debugPlayerMotionPayload;
  const debugGameFrameSetup = React.useMemo(() => {
    if (!isDebugGameFrameRoute) return null;

    const frames = loadedFrames.map((frame) => (
      toDebugPlayerMotionPayload(frame as unknown as MotionFrame) ?? {}
    ));
    return buildMovementRecordedPlayerSetup({
      frameLimit: Math.min(59, frames.length - 1),
      frames,
    });
  }, [isDebugGameFrameRoute, loadedFrames]);
  const debugGameFrameCalibration = debugGameFrameSetup?.calibration ?? null;
  const debugGameFrameRetargetSourceModel = debugGameFrameSetup?.retargetSourceModel ?? null;
  React.useEffect(() => {
    if (!isDebugGameFrameRoute) return;
    (window as Window & {
      __sonaeMovementRecordedPlayerSetup?: typeof debugGameFrameSetup;
    }).__sonaeMovementRecordedPlayerSetup = debugGameFrameSetup;
  }, [debugGameFrameSetup, isDebugGameFrameRoute]);
  const debugPlayerCalibration = React.useMemo(() => (
    isDebugPlayerPoseRoute && !shouldSkipDebugPoseCalibration
      ? buildMovementCalibration({
          faceLandmarks: debugPlayerNeutralFace,
          poseLandmarks: debugPlayerNeutralPose,
        })
      : null
  ), [debugPlayerNeutralFace, debugPlayerNeutralPose, isDebugPlayerPoseRoute, shouldSkipDebugPoseCalibration]);
  const debugPlayerRetargetSourceModel = React.useMemo(() => (
    isDebugPlayerPoseRoute && !shouldSkipDebugPoseCalibration
      ? buildMovementRetargetSourceModel({ poseLandmarks: debugPlayerNeutralPose })
      : null
  ), [debugPlayerNeutralPose, isDebugPlayerPoseRoute, shouldSkipDebugPoseCalibration]);
  const debugInstructorRetargetSourceModel = React.useMemo(() => (
    isDebugInstructorPoseRoute
      ? buildMovementRetargetSourceModel({ poseLandmarks: debugPlayerNeutralPose })
      : null
  ), [debugPlayerNeutralPose, isDebugInstructorPoseRoute]);
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
  const effectivePlayerLiveLmRef = isDebugPlayerInjectionRoute ? debugPlayerLiveLmRef : playerLiveLmRef;
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
  const effectivePlayerCalibration = debugGameFrameCalibration ?? debugPlayerCalibration ?? calibration;
  const effectivePlayerRetargetSourceModel =
    debugGameFrameRetargetSourceModel ?? debugPlayerRetargetSourceModel ?? playerRetargetSourceModel;
  const isTrackingReady = isDebugPlayerInjectionRoute || isCalibrated || isCalibrationSkipped;
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
  const effectiveInstructorCurrentLmRef = isDebugInstructorPoseRoute
    ? debugInstructorLmRef
    : instructorCurrentLmRef;
  const effectiveInstructorRetargetSourceModel =
    debugInstructorRetargetSourceModel ?? instructorRetargetSourceModel;
  const debugQaPresets = React.useMemo(
    () => getMovementDebugQaPresets(movementId, instructorFrameCount),
    [instructorFrameCount, movementId],
  );
  const syncDebugGameFrameRoute = React.useCallback((frameIndex: number) => {
    if (!isDebugTracking) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("debugTracking", "1");
    nextParams.set("debugGameFrame", String(frameIndex));
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [isDebugTracking, pathname, router, searchParams]);
  const shouldKeepInstructorMotionFrameVisible = isPlaying || isDebugTracking;
  const instructorMotionFrameRef = useMovementRecordedMotionFrame({
    instructorFrameRef: effectiveInstructorCurrentLmRef,
    isPlaying: shouldKeepInstructorMotionFrameVisible,
    retargetSourceModel: effectiveInstructorRetargetSourceModel,
  });
  useEffect(() => {
    if (debugGameFrameIndex === null || loadedFrames.length === 0) return;
    setInstructorFrame(Math.min(debugGameFrameIndex, loadedFrames.length - 1));
  }, [debugGameFrameIndex, loadedFrames.length, setInstructorFrame]);
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
    hudSpineReadiness,
    syncRef,
    resetScoring,
  } = useMovementMatchScoring({
    isPlaying,
    isScoringEnabled: isCalibrated || isDebugPlayerInjectionRoute,
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
      isDebugPlayerPoseRoute: shouldBypassStartReadinessForDebug,
      isGuidedPreviewRoute,
    });
    if (!readinessBypassReason) return;

    skipCalibration();
    resetInstructorPlayback();
    if (debugGameFrameIndex !== null && loadedFrames.length > 0) {
      setInstructorFrame(Math.min(debugGameFrameIndex, loadedFrames.length - 1));
    }
    resetScoring();
    setIsPlaying(!isDebugGameFrameRoute);
  }, [
    debugGameFrameIndex,
    isDebugGameFrameRoute,
    isGuidedPreviewRoute,
    loadedFrames.length,
    resetInstructorPlayback,
    resetScoring,
    setIsPlaying,
    setInstructorFrame,
    shouldBypassStartReadinessForDebug,
    skipCalibration,
    startMatch,
  ]);

  const resolveCurrentSpineStartReadinessStatus = React.useCallback(() => {
    const poseLandmarks = playerMotionFrameRef.current?.source.landmarks.pose;
    return evaluateMovementSpineReadiness(buildMovementSpineModel(poseLandmarks)).status;
  }, [playerMotionFrameRef]);

  const completeGameStartGate = React.useCallback(() => {
    const sourceFrame = playerMotionFrameRef.current?.source;
    const readiness = sourceFrame
      ? resolveMovementStartReadiness({
          cameraConfidence: sourceFrame.cameraConfidence,
          requirements: {
            calibrationQuality: effectivePlayerCalibration?.quality ?? null,
          },
        })
      : null;
    const cameraRecoveryCue = sourceFrame
      ? getMovementCameraConfidenceRecoveryCue(sourceFrame.cameraConfidence)
      : null;
    const gateDecision = resolveMovementStartGateDecision({
      readiness,
      spineReadinessStatus: resolveCurrentSpineStartReadinessStatus(),
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
      message: getMovementStartReadinessMessage({
        blockedReasons: gateDecision.blockedReasons,
        cameraRecoveryCue,
        readiness: gateDecision.readiness,
      }),
      status: "blocked",
    });
  }, [
    effectivePlayerCalibration?.quality,
    playerMotionFrameRef,
    resetInstructorPlayback,
    resetScoring,
    resolveCurrentSpineStartReadinessStatus,
    setIsPlaying,
  ]);

  useEffect(() => {
    if (gameStartGate.status !== "countdown" || gameStartGate.endsAt === null) {
      return undefined;
    }

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
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    gameStartGate.endsAt,
    gameStartGate.status,
  ]);

  useEffect(() => {
    if (gameStartGate.status !== "checking-visibility") {
      return undefined;
    }

    const startCheckTimeoutId = window.setTimeout(completeGameStartGate, 120);
    return () => window.clearTimeout(startCheckTimeoutId);
  }, [
    completeGameStartGate,
    gameStartGate.status,
  ]);

  const handleTogglePlaying = React.useCallback(() => {
    if (isPlaying) {
      setGameStartGate(createIdleGameStartGate());
      togglePlaying();
      return;
    }

    const readinessBypassReason = resolveMovementStartReadinessBypassReason({
      isDebugPlayerPoseRoute: shouldBypassStartReadinessForDebug,
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
    isPlaying,
    isTrackingReady,
    isVisionReadyForSession,
    setIsPlaying,
    shouldBypassStartReadinessForDebug,
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
    loadedFrames.length,
    isDebugAutoBaselineRoute,
    isLobby,
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

  useEffect(() => {
    if (!isDebugTracking || typeof window === "undefined") return undefined;

    const debugWindow = window as Window & {
      __sonaeMovementLiveInputDebug?: {
        leftElbow: MovementPlayerMotionPayload["landmarks"] extends Array<infer T> ? T | null : unknown;
        leftShoulder: MovementPlayerMotionPayload["landmarks"] extends Array<infer T> ? T | null : unknown;
        leftWrist: MovementPlayerMotionPayload["landmarks"] extends Array<infer T> ? T | null : unknown;
        rightElbow: MovementPlayerMotionPayload["landmarks"] extends Array<infer T> ? T | null : unknown;
        rightShoulder: MovementPlayerMotionPayload["landmarks"] extends Array<infer T> ? T | null : unknown;
        rightWrist: MovementPlayerMotionPayload["landmarks"] extends Array<infer T> ? T | null : unknown;
        updatedAt: number;
      };
    };
    const updateLiveInputDebug = () => {
      const landmarks = effectivePlayerLiveLmRef.current?.landmarks;
      if (!landmarks || landmarks.length < 17) return;
      debugWindow.__sonaeMovementLiveInputDebug = {
        leftElbow: landmarks[13] ?? null,
        leftShoulder: landmarks[11] ?? null,
        leftWrist: landmarks[15] ?? null,
        rightElbow: landmarks[14] ?? null,
        rightShoulder: landmarks[12] ?? null,
        rightWrist: landmarks[16] ?? null,
        updatedAt: performance.now(),
      };
    };
    const intervalId = window.setInterval(updateLiveInputDebug, 100);
    updateLiveInputDebug();

    return () => {
      window.clearInterval(intervalId);
      delete debugWindow.__sonaeMovementLiveInputDebug;
    };
  }, [effectivePlayerLiveLmRef, isDebugTracking]);

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
  const setupRecoveryCue = getMovementSetupRecoveryCue({
    motionFrame: playerMotionFrameRef.current,
    spineReadiness: hudSpineReadiness,
  });

  const studio = (
    <div className="fixed inset-0 z-[9999] flex h-screen w-screen flex-col overflow-hidden bg-[#07070b]">
      <style>{`nextjs-portal { display: none !important; }`}</style>
      <MovementMatchScene>
        <VrmAvatar
          landmarksRef={effectiveInstructorCurrentLmRef}
          motionFrameRef={instructorMotionFrameRef}
          positionOffset={[-5, 0, 0]}
          isPlaying={isPlaying}
          showPausedPose={isDebugTracking}
          trackingDebugRef={instructorTrackingDebugRef}
          retargetSourceModel={effectiveInstructorRetargetSourceModel}
          vrmUrl={instructorAvatarUrl}
          name={instructorAvatarName}
        />

        {isDebugTracking ? (
          <>
            <MovementSourceSkeleton
              color="#f6ccbe"
              landmarksRef={effectiveInstructorCurrentLmRef}
              mirrorX
              positionOffset={[-5, 0, 0]}
            />
            <MovementSourceSkeleton
              color="#f5d84f"
              landmarksRef={effectiveInstructorCurrentLmRef}
              mirrorX
              mode="truth"
              motionFrameRef={instructorMotionFrameRef}
              positionOffset={[-3.55, 0, 0]}
            />
          </>
        ) : null}

        <VrmAvatar
          landmarksRef={effectivePlayerLiveLmRef}
          positionOffset={[5, 0, 0]}
          isPlayer={true}
          isPlaying={isPlaying}
          showPausedPose={shouldShowPlayerPausedPose}
          motionFrameRef={playerMotionFrameRef}
          trackingCalibration={effectivePlayerCalibration}
          trackingDebugRef={trackingDebugRef}
          retargetSourceModel={effectivePlayerRetargetSourceModel}
          vrmUrl={playerAvatarUrl}
          name={playerAvatarName}
        />

        {isDebugTracking ? (
          <>
            <MovementSourceSkeleton
              color="#bfe7d0"
              landmarksRef={effectivePlayerLiveLmRef}
              positionOffset={[5, 0, 0]}
            />
            <MovementSourceSkeleton
              color="#f5d84f"
              landmarksRef={effectivePlayerLiveLmRef}
              mode="truth"
              motionFrameRef={playerMotionFrameRef}
              positionOffset={[3.55, 0, 0]}
            />
          </>
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
        hudSpineReadiness={hudSpineReadiness}
        isPlaying={isPlaying}
        isVisionReady={isVisionReadyForSession}
        isTrackingCalibrated={isTrackingReady}
        isPreviewMode={isCalibrationSkipped}
        isCalibrating={isCalibrating}
        setupRecoveryCue={setupRecoveryCue}
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
        onDebugFrameRouteChange={syncDebugGameFrameRoute}
        onFrameChange={(frameIndex) => {
          resetScoring();
          setInstructorFrame(frameIndex);
        }}
        onPlayingChange={setIsPlaying}
        qaPresets={debugQaPresets}
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
        calibration={null}
        debugRole="instructor"
        debugRef={instructorTrackingDebugRef}
        isEnabled={isDebugTracking}
        motionFrameRef={instructorMotionFrameRef}
        title="Instructor Diagnostics"
      />

      <MovementTrackingDebugOverlay
        calibration={effectivePlayerCalibration}
        debugRole="player"
        debugRef={trackingDebugRef}
        isEnabled={isDebugTracking}
        motionFrameRef={playerMotionFrameRef}
        placement="right"
        title="Your Avatar Diagnostics"
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
