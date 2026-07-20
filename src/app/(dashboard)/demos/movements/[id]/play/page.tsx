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
import {
  useMovementLiveMotionFrame,
  type MovementLiveInitialFrame,
} from "../../_hooks/useMovementLiveMotionFrame";
import { useMovementLivePlayerSetup } from "../../_hooks/useMovementLivePlayerSetup";
import { useMovementGameProofPacket } from "../../_hooks/useMovementGameProofPacket";
import { useMovementMatchScoring } from "../../_hooks/useMovementMatchScoring";
import { useMovementMatchSession } from "../../_hooks/useMovementMatchSession";
import { useMediaPipeVision } from "../../_hooks/useMediaPipeVision";
import { useMovementFrames } from "../../_hooks/useMovementFrames";
import { useMovementRecordedMotionFrame } from "../../_hooks/useMovementRecordedMotionFrame";
import { buildMovementRecordedInstructorCalibration } from "../../_lib/movementRecordedInstructorSetup";
import {
  createMovementRecordedSourcePlaybackState,
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
import { getMovementAvatarTrackingProfileName } from "../../_lib/movementAvatarProfiles";
import { movementBoundaryChecksum } from "../../_lib/movementBoundaryChecksum";
import { buildMovementDenseCaptureProofSnapshot } from "../../_lib/movementDenseCaptureProof";
import {
  MOVEMENT_GAME_RUNTIME_CONTRACT_VERSION,
  MOVEMENT_REPLAY_GAME_PARITY_PROOF_MODE,
} from "../../_lib/movementGameRuntimeFrame";
import { buildMovementOwnersRootSupportProofSnapshot } from "../../_lib/movementGameProofPacket";
import type { MovementMotionFrame } from "../../_lib/movementMotionFrame";
import {
  parseMovementDebugGameFrameIndex,
  shouldShowMovementDebugPlayerPausedPose,
} from "../../_lib/movementGameDebugRoute";
import {
  MOVEMENT_GAME_START_FRESH_FRAME_DELAY_MS,
  MOVEMENT_GAME_START_FRESH_FRAME_INTERVAL_MS,
  MOVEMENT_GAME_START_STABLE_FRAME_COUNT,
  advanceMovementGameStartStability,
  shouldContinueMovementGameStartFreshFrameCheck,
} from "../../_lib/movementGameStartFreshFrame";
import { getMovementGameStartInstruction } from "../../_lib/movementGameStartPresentation";
import { getMovementDebugQaPresets } from "../../_lib/movementDebugQaPresets";
import { getStudioRoutineTitle } from "../../_lib/movementPresentation";
import {
  buildMovementRetargetSourceModel,
} from "../../_lib/movementRetargeting";
import { resolveMovementStartReadinessBypassReason } from "../../_lib/movementStartBypass";
import { MOVEMENT_SPINE_GOAL_OPTIONS } from "../../_lib/movementSpineIntent";
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
  getMovementStartReadinessMessage,
} from "../../_lib/movementSetupRecoveryCue";
import type { VrmMotionFrame, VrmMotionPayload, VrmPoseLandmark } from "../../_lib/vrmRigging";

type MotionFrame = VrmMotionFrame;

const MOVEMENT_GAME_START_COUNTDOWN_MS = 3000;

type MovementGameStartGateStatus =
  | "idle"
  | "waiting-for-readiness"
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
  const debugGamePacketUrl = isDebugTracking ? searchParams.get("debugGamePacketUrl") : null;
  const isDebugGamePacketRoute = Boolean(debugGamePacketUrl);
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
  const isDebugPlayerInjectionRoute = isDebugPlayerPoseRoute || isDebugGameFrameRoute || isDebugGamePacketRoute;
  const isDebugMovementInjectionRoute = isDebugPlayerInjectionRoute || isDebugInstructorPoseRoute;
  const shouldUseDebugStartGate = isDebugPlayerInjectionRoute && searchParams.get("debugStartGate") === "1";
  const shouldBypassStartReadinessForDebug =
    (isDebugPlayerPoseRoute || isDebugGameFrameRoute) && !shouldUseDebugStartGate;
  const shouldShowPlayerPausedPose = shouldShowMovementDebugPlayerPausedPose({ isDebugTracking });
  const shouldAutoStartGuidedPreview = (isGuidedPreviewRoute && isDebugTracking) || (
    isDebugMovementInjectionRoute && !isDebugGamePacketRoute
  );
  const [cameraStatus, setCameraStatus] = useState<"pending" | "ready" | "error">("pending");
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const movement = useQuery(api.movements.get, { id: movementId });
  const saveDebugTrackingSession = useMutation(api.movements.saveDebugTrackingSession);
  const { frames: loadedFrames, isLoading: isFramesLoading } = useMovementFrames(movement);
  const {
    error: gameProofPacketError,
    isLoading: isGameProofPacketLoading,
    packet: gameProofPacket,
  } = useMovementGameProofPacket(debugGamePacketUrl);
  const effectiveLoadedFrames = gameProofPacket?.instructorFrames ?? loadedFrames;

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
  const debugGameFrameMotionSequence = React.useMemo<MovementPlayerMotionPayload[] | null>(() => {
    if (debugGameFrameIndex === null) return null;

    const prefix = loadedFrames
      .slice(0, Math.min(60, loadedFrames.length))
      .map((frame) => toDebugPlayerMotionPayload(frame as unknown as MotionFrame))
      .filter((frame): frame is MovementPlayerMotionPayload => Boolean(frame));
    const target = toDebugPlayerMotionPayload(
      loadedFrames[debugGameFrameIndex] as unknown as MotionFrame | undefined,
    );
    if (target && debugGameFrameIndex !== prefix.length - 1) prefix.push(target);
    return prefix;
  }, [debugGameFrameIndex, loadedFrames]);
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
  const recordedGameControlRef = useRef({ isCheckingStart: false, isPlaying: false });
  const recordedGamePlaybackStateRef = useRef(createMovementRecordedSourcePlaybackState());
  const recordedGameMotionFrameIndexRef = useRef(-1);
  const recordedGameRenderedFrameIndexRef = useRef(-1);
  recordedGameControlRef.current.isPlaying = isPlaying;
  const recordedSourcePlayback = React.useMemo(() => (
    gameProofPacket
      ? {
          controlRef: recordedGameControlRef,
          fallbackFps: gameProofPacket.session.fps,
          motionFrameIndexRef: recordedGameMotionFrameIndexRef,
          renderedFrameIndexRef: recordedGameRenderedFrameIndexRef,
          setupFrameCount: gameProofPacket.setupFrameCount,
          stateRef: recordedGamePlaybackStateRef,
        }
      : null
  ), [gameProofPacket]);
  const playerLiveLmRef = useMovementPlayerTracking({
    webcamRef,
    poseLandmarker,
    faceLandmarker,
    handLandmarker,
    onBodyTracked: markBodyTracked,
    recordedSourcePlayback,
    recordedSourceSequence: gameProofPacket?.playerFrames ?? (
      isDebugPlayerInjectionRoute
        ? debugGameFrameMotionSequence ?? (debugPlayerMotionPayload ? [debugPlayerMotionPayload] : null)
        : null
    ),
  });
  const effectivePlayerLiveLmRef = playerLiveLmRef;
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
  const automaticPlayerSetupPrefixFramesRef = useRef<VrmMotionPayload[]>([]);
  const automaticPlayerSetup = useMovementLivePlayerSetup({
    isVisionReady: isVisionReadyForSession,
    playerLiveLmRef: effectivePlayerLiveLmRef,
    setupPrefixFramesRef: automaticPlayerSetupPrefixFramesRef,
  });
  React.useEffect(() => {
    if (!isDebugGameFrameRoute) return;
    (window as Window & {
      __sonaeMovementRecordedPlayerSetup?: typeof automaticPlayerSetup;
    }).__sonaeMovementRecordedPlayerSetup = automaticPlayerSetup;
  }, [automaticPlayerSetup, isDebugGameFrameRoute]);
  const effectivePlayerCalibration =
    debugPlayerCalibration ?? calibration ?? automaticPlayerSetup?.calibration ?? null;
  const effectivePlayerRetargetSourceModel =
    debugPlayerRetargetSourceModel ??
    playerRetargetSourceModel ??
    automaticPlayerSetup?.retargetSourceModel ??
    null;
  const isTrackingReady = isDebugGamePacketRoute
    ? Boolean(automaticPlayerSetup)
    : isDebugPlayerInjectionRoute ||
      isCalibrated ||
      isCalibrationSkipped ||
      Boolean(automaticPlayerSetup);
  const [gameStartGate, setGameStartGate] = useState<MovementGameStartGateState>(
    createIdleGameStartGate,
  );
  recordedGameControlRef.current.isCheckingStart =
    gameStartGate.status === "waiting-for-readiness" ||
    gameStartGate.status === "checking-visibility";
  const gameStartGateRef = useRef(gameStartGate);
  const gameStartFreshFrameCheckRef = useRef({
    attempts: 0,
    lastProofFrameIndex: -1,
  });
  const gameStartStabilityRef = useRef({
    acceptedFrameCount: 0,
    lastCapturedAt: null as number | null,
  });
  gameStartGateRef.current = gameStartGate;
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
  const isPlayerAvatarMotionActive = isPlaying || (
    isDebugGameFrameRoute && Boolean(automaticPlayerSetup)
  ) || (
    isDebugGamePacketRoute &&
    Boolean(automaticPlayerSetup) &&
    recordedGamePlaybackStateRef.current.startedAt === undefined
  );
  const recordedGameSetupMotionSequence = React.useMemo(() => (
    gameProofPacket
      ? gameProofPacket.playerFrames.slice(0, gameProofPacket.setupFrameCount)
      : null
  ), [gameProofPacket]);
  const playerInitialFrameSequenceRef = useRef<MovementLiveInitialFrame[]>([]);
  const collectRecordedGamePlayerWarmupFramesRef = useRef(false);
  collectRecordedGamePlayerWarmupFramesRef.current = Boolean(
    gameProofPacket &&
    !isPlaying &&
    recordedGamePlaybackStateRef.current.startedAt === undefined
  );
  const instructorInitialFrameSequenceRef = useRef<MovementLiveInitialFrame[]>([]);
  const playerMotionFrameProcessingDebugRef = useRef({
    effectRunCount: 0,
    processedFrames: [] as Array<{
      effectRun: number;
      frameId: string;
      rootHistoryLength: number;
    }>,
    processedFrameIds: [] as string[],
  });
  const playerFrameApplicationProofRef = useRef({
    currentSourceCapturedAt: null as number | null,
    lastAppliedSourceCapturedAt: null as number | null,
    status: "waiting-motion" as "applied" | "duplicate" | "fallback" | "not-ready" | "waiting-motion",
    warmupFrameCount: 0,
    warmupFrameIndex: 0,
  });
  const instructorFrameApplicationProofRef = useRef({
    currentSourceCapturedAt: null as number | null,
    lastAppliedSourceCapturedAt: null as number | null,
    status: "waiting-motion" as "applied" | "duplicate" | "fallback" | "not-ready" | "waiting-motion",
    warmupFrameCount: 0,
    warmupFrameIndex: 0,
  });
  const playerMotionFrameRef = useMovementLiveMotionFrame({
    calibration: effectivePlayerCalibration,
    collectInitialFramesRef: isDebugGamePacketRoute
      ? collectRecordedGamePlayerWarmupFramesRef
      : undefined,
    debugProcessingRef: isDebugGamePacketRoute
      ? playerMotionFrameProcessingDebugRef
      : undefined,
    initialFrameSequenceRef: playerInitialFrameSequenceRef,
    initialMotionSequence: gameProofPacket
      ? recordedGameSetupMotionSequence
      : automaticPlayerSetup
        ? automaticPlayerSetupPrefixFramesRef.current
        : null,
    isPlaying: isPlayerAvatarMotionActive,
    motionSequence: null,
    playerLiveLmRef: effectivePlayerLiveLmRef,
    requirements: liveMotionFrameRequirements,
    retargetSourceModel: effectivePlayerRetargetSourceModel,
  });
  const {
    frameCount: instructorFrameCount,
    instructorCurrentLmRef,
    frameIndexRef: instructorFrameIndexRef,
    retargetAnalysis: instructorRetargetAnalysis,
    retargetSourceModel: instructorRetargetSourceModel,
    advanceInstructorFrame,
    resetInstructorPlayback,
    setInstructorFrame,
  } = useMovementInstructorPlayback(
    effectiveLoadedFrames as unknown as MotionFrame[],
    isDebugGamePacketRoute
      ? { sourceFrameIndexRef: recordedGamePlaybackStateRef }
      : undefined,
  );
  const effectiveInstructorCurrentLmRef = isDebugInstructorPoseRoute
    ? debugInstructorLmRef
    : instructorCurrentLmRef;
  const effectiveInstructorRetargetSourceModel =
    debugInstructorRetargetSourceModel ?? instructorRetargetSourceModel;
  const effectiveInstructorCalibration = React.useMemo(() => (
    buildMovementRecordedInstructorCalibration(
      effectiveLoadedFrames as unknown as Array<{
        landmarks?: MovementPlayerMotionPayload["landmarks"];
        pose?: MovementPlayerMotionPayload["landmarks"];
      }>,
    )
  ), [effectiveLoadedFrames]);
  const shouldKeepInstructorMotionFrameVisible = isPlaying || isDebugTracking || (
    isDebugGamePacketRoute &&
    Boolean(automaticPlayerSetup) &&
    recordedGamePlaybackStateRef.current.startedAt === undefined
  );
  const instructorMotionFrameRef = useMovementRecordedMotionFrame({
    calibration: effectiveInstructorCalibration,
    controlledFrameIndexRef: gameProofPacket
      ? recordedGamePlaybackStateRef
      : undefined,
    controlledMotionSequence: gameProofPacket?.instructorFrames ?? null,
    initialFrameSequenceRef: instructorInitialFrameSequenceRef,
    initialMotionSequence: gameProofPacket
      ? gameProofPacket.instructorFrames.slice(0, gameProofPacket.setupFrameCount)
      : null,
    instructorFrameRef: effectiveInstructorCurrentLmRef,
    isPlaying: shouldKeepInstructorMotionFrameVisible,
    retargetSourceModel: effectiveInstructorRetargetSourceModel,
  });
  const recordedGameRenderedFramesRef = useRef(new Map<number, {
    checksums: {
      acquisition: string;
      calibration: string;
      denseFusion: string;
      instructorMotionFrame: string;
      instructorRendered: string;
      motionFrame: string;
      ownersRootSupport: string;
      playerApplied: string;
      playerRendered: string;
      setup: string;
    };
    playerApplied: Pick<MovementTrackingDebugState,
      "avatarExpressions" | "avatarHands" | "avatarHead" | "avatarRoot" | "avatarSpine">;
    playerMotionRoot: MovementMotionFrame["rootMotionFrame"];
    playerVisual: NonNullable<MovementTrackingDebugState["avatarVisual"]>;
  }>());
  const recordedGameFirstRenderedBoundaryRef = useRef<{
    frameIndex: number;
    playerDebug: MovementTrackingDebugState;
  } | null>(null);
  React.useEffect(() => {
    if (!gameProofPacket) return;
    const debugWindow = window as Window & {
      __sonaeMovementGamePacketProof?: unknown;
    };
    recordedGameRenderedFramesRef.current.clear();
    recordedGameFirstRenderedBoundaryRef.current = null;
    let pendingRenderedFrameIndex = -1;
    let pendingInstructorUpdatedAt = -1;
    let pendingPlayerUpdatedAt = -1;
    let pendingPlayerMotionFrame = playerMotionFrameRef.current;
    const publish = () => {
      const playback = recordedGamePlaybackStateRef.current;
      const playerDebug = trackingDebugRef.current;
      const instructorDebug = instructorTrackingDebugRef.current;
      if (playback.frameIndex !== pendingRenderedFrameIndex) {
        pendingRenderedFrameIndex = playback.frameIndex;
        pendingInstructorUpdatedAt = instructorDebug?.updatedAt ?? -1;
        pendingPlayerUpdatedAt = playerDebug?.updatedAt ?? -1;
        pendingPlayerMotionFrame = playerMotionFrameRef.current;
      }
      if (playerMotionFrameRef.current !== pendingPlayerMotionFrame) {
        pendingPlayerMotionFrame = playerMotionFrameRef.current;
        pendingPlayerUpdatedAt = playerDebug?.updatedAt ?? -1;
      }
      const currentPlayerPayload = effectivePlayerLiveLmRef.current;
      const playerSourceCapturedAt = Array.isArray(currentPlayerPayload)
        ? undefined
        : currentPlayerPayload?.capturedAt;
      const playerSourceFrameId = Array.isArray(currentPlayerPayload)
        ? undefined
        : currentPlayerPayload?.frameId;
      const instructorSourceCapturedAt = instructorMotionFrameRef.current?.source.capturedAt;
      const instructorSourceFrameId = instructorMotionFrameRef.current?.source.frameId;
      const isPlayerMotionCurrent = playerSourceFrameId
        ? playerMotionFrameRef.current?.source.frameId === playerSourceFrameId
        : playerSourceCapturedAt === undefined || (
            playerMotionFrameRef.current?.source.capturedAt === playerSourceCapturedAt
          );
      if (isPlayerMotionCurrent) {
        recordedGameMotionFrameIndexRef.current = Math.max(
          recordedGameMotionFrameIndexRef.current,
          playback.frameIndex,
        );
      }
      const isPlayerRenderCurrent = playerSourceFrameId
        ? playerDebug?.sourceFrameId === playerSourceFrameId
        : playerSourceCapturedAt === undefined
        ? (playerDebug?.updatedAt ?? -1) > pendingPlayerUpdatedAt
        : playerDebug?.sourceCapturedAt === playerSourceCapturedAt;
      const isInstructorRenderCurrent = instructorSourceFrameId
        ? instructorDebug?.sourceFrameId === instructorSourceFrameId
        : instructorSourceCapturedAt === undefined
        ? (instructorDebug?.updatedAt ?? -1) > pendingInstructorUpdatedAt
        : instructorDebug?.sourceCapturedAt === instructorSourceCapturedAt;
      if (
        !isLobby &&
        playback.activeFrameStartIndex !== undefined &&
        playback.frameIndex >= playback.activeFrameStartIndex &&
        instructorFrameIndexRef.current === playback.frameIndex &&
        isPlayerMotionCurrent &&
        isInstructorRenderCurrent &&
        isPlayerRenderCurrent &&
        playerDebug?.avatarVisual &&
        instructorDebug?.avatarVisual &&
        !recordedGameRenderedFramesRef.current.has(playback.frameIndex)
      ) {
        if (!recordedGameFirstRenderedBoundaryRef.current) {
          recordedGameFirstRenderedBoundaryRef.current = {
            frameIndex: playback.frameIndex,
            playerDebug: structuredClone(playerDebug),
          };
        }
        const playerApplied = structuredClone({
          avatarExpressions: playerDebug.avatarExpressions,
          avatarHands: playerDebug.avatarHands,
          avatarHead: playerDebug.avatarHead,
          avatarRoot: playerDebug.avatarRoot,
          avatarSpine: playerDebug.avatarSpine,
        });
        const boundaries = {
          acquisition: structuredClone(effectivePlayerLiveLmRef.current),
          calibration: structuredClone(effectivePlayerCalibration),
          denseFusion: buildMovementDenseCaptureProofSnapshot(
            Array.isArray(effectivePlayerLiveLmRef.current)
              ? undefined
              : effectivePlayerLiveLmRef.current?.deepCapture,
          ),
          instructorMotionFrame: structuredClone(instructorMotionFrameRef.current),
          instructorRendered: structuredClone(instructorDebug.avatarVisual),
          motionFrame: structuredClone(playerMotionFrameRef.current),
          ownersRootSupport: buildMovementOwnersRootSupportProofSnapshot(playerDebug, 5),
          playerApplied,
          playerRendered: structuredClone(playerDebug.avatarVisual),
          setup: structuredClone(automaticPlayerSetup),
        };
        recordedGameRenderedFramesRef.current.set(playback.frameIndex, {
          checksums: {
            acquisition: movementBoundaryChecksum(boundaries.acquisition),
            calibration: movementBoundaryChecksum(boundaries.calibration),
            denseFusion: movementBoundaryChecksum(boundaries.denseFusion),
            instructorMotionFrame: movementBoundaryChecksum(boundaries.instructorMotionFrame),
            instructorRendered: movementBoundaryChecksum(boundaries.instructorRendered),
            motionFrame: movementBoundaryChecksum(boundaries.motionFrame),
            ownersRootSupport: movementBoundaryChecksum(boundaries.ownersRootSupport),
            playerApplied: movementBoundaryChecksum(boundaries.playerApplied),
            playerRendered: movementBoundaryChecksum(boundaries.playerRendered),
            setup: movementBoundaryChecksum(boundaries.setup),
          },
          playerApplied,
          playerMotionRoot: structuredClone(playerMotionFrameRef.current?.rootMotionFrame ?? null),
          playerVisual: structuredClone(playerDebug.avatarVisual),
        });
        recordedGameRenderedFrameIndexRef.current = Math.max(
          recordedGameRenderedFrameIndexRef.current,
          playback.frameIndex,
        );
      }
      const isCompletePlayback = playback.phase === "complete";
      const processedFrameIndexes = isCompletePlayback
        ? [...playback.processedFrameIndexes]
        : [];
      const expectedFrameIndexes = Array.from(
        { length: gameProofPacket.playerFrames.length },
        (_, frameIndex) => frameIndex,
      );
      const processedSet = new Set(processedFrameIndexes);
      const renderedFrames = isCompletePlayback
        ? [...recordedGameRenderedFramesRef.current.entries()]
            .sort(([left], [right]) => left - right)
            .map(([frameIndex, renderedFrame]) => ({ frameIndex, ...renderedFrame }))
        : [];
      const renderedSet = new Set(renderedFrames.map((frame) => frame.frameIndex));
      const activeFrameStartIndex = playback.activeFrameStartIndex ?? null;
      const expectedRenderedFrameIndexes = activeFrameStartIndex === null
        ? []
        : expectedFrameIndexes.slice(activeFrameStartIndex);
      const preStartFrameIndexes = activeFrameStartIndex === null
        ? expectedFrameIndexes.slice(gameProofPacket.setupFrameCount, playback.frameIndex + 1)
        : expectedFrameIndexes.slice(gameProofPacket.setupFrameCount, activeFrameStartIndex);
      debugWindow.__sonaeMovementGamePacketProof = {
        activeFrameStartIndex,
        avatarProfile: getMovementAvatarTrackingProfileName(playerAvatarUrl),
        instructorAvatarProfile: getMovementAvatarTrackingProfileName(instructorAvatarUrl),
        contractStatus: gameProofPacket.contractStatus,
        expectedFrameCount: expectedFrameIndexes.length,
        firstRenderedBoundary: recordedGameFirstRenderedBoundaryRef.current,
        inputContractId: gameProofPacket.session.inputContract?.id ?? null,
        instructorFrameIndex: instructorFrameIndexRef.current,
        isLobby,
        isPlaying: recordedGameControlRef.current.isPlaying,
        lastRenderedFrameIndex: recordedGameRenderedFrameIndexRef.current,
        motionFrameIndex: recordedGameMotionFrameIndexRef.current,
        motionFrameProcessing: {
          effectRunCount: playerMotionFrameProcessingDebugRef.current.effectRunCount,
          processedFrameIds: isCompletePlayback
            ? [...playerMotionFrameProcessingDebugRef.current.processedFrameIds]
            : [],
          processedFrameIdCount: playerMotionFrameProcessingDebugRef.current.processedFrameIds.length,
          processedFrames: isCompletePlayback
            ? [...playerMotionFrameProcessingDebugRef.current.processedFrames]
            : [],
        },
        missingFrameIndexes: isCompletePlayback
          ? expectedFrameIndexes.filter((frameIndex) => !processedSet.has(frameIndex))
          : [],
        missingRenderedFrameIndexes: isCompletePlayback
          ? expectedRenderedFrameIndexes.filter((frameIndex) => !renderedSet.has(frameIndex))
          : [],
        packetId: gameProofPacket.session.id,
        phase: playback.phase,
        playerFrameIndex: playback.frameIndex,
        preStartFrameCount: preStartFrameIndexes.length,
        preStartFrameIndexes,
        processedFrameIndexes,
        processedFrameCount: playback.processedFrameIndexes.length,
        proofMode: MOVEMENT_REPLAY_GAME_PARITY_PROOF_MODE,
        recordingSchemaVersion: gameProofPacket.session.schemaVersion ?? null,
        renderDiagnostics: {
          instructorDebugSourceCapturedAt: instructorDebug?.sourceCapturedAt ?? null,
          instructorDebugUpdatedAt: instructorDebug?.updatedAt ?? null,
          instructorMotionSourceCapturedAt: instructorSourceCapturedAt ?? null,
          instructorMotionSourceFrameId: instructorSourceFrameId ?? null,
          instructorRenderer: instructorFrameApplicationProofRef.current,
          playerDebugSourceCapturedAt: playerDebug?.sourceCapturedAt ?? null,
          playerDebugUpdatedAt: playerDebug?.updatedAt ?? null,
          playerMotionSourceCapturedAt: playerMotionFrameRef.current?.source.capturedAt ?? null,
          playerMotionSourceFrameId: playerMotionFrameRef.current?.source.frameId ?? null,
          playerPayloadCapturedAt: playerSourceCapturedAt ?? null,
          playerPayloadFrameId: playerSourceFrameId ?? null,
          playerRenderer: playerFrameApplicationProofRef.current,
        },
        renderedFrames,
        renderedFrameCount: recordedGameRenderedFramesRef.current.size,
        setupFrameCount: gameProofPacket.setupFrameCount,
        setupPolicyId: gameProofPacket.session.inputContract?.setup.id ?? null,
        startGate: gameStartGateRef.current,
        startGateFreshFrameCheck: gameStartFreshFrameCheckRef.current,
        sourcePacketHash: gameProofPacket.session.sourcePacketHash ?? null,
        runtimeContract: MOVEMENT_GAME_RUNTIME_CONTRACT_VERSION,
      };
      animationFrameId = window.requestAnimationFrame(publish);
    };
    let animationFrameId = 0;
    publish();
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      delete debugWindow.__sonaeMovementGamePacketProof;
    };
  }, [
    automaticPlayerSetup,
    effectivePlayerCalibration,
    effectiveInstructorCurrentLmRef,
    effectivePlayerLiveLmRef,
    gameProofPacket,
    instructorMotionFrameRef,
    instructorFrameIndexRef,
    isLobby,
    instructorAvatarUrl,
    playerAvatarUrl,
    playerMotionFrameRef,
  ]);
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
    isScoringEnabled: Boolean(effectivePlayerCalibration) || isDebugPlayerInjectionRoute,
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

  const resolveCurrentGameStartGate = React.useCallback(() => {
    const sourceFrame = playerMotionFrameRef.current?.source;
    const readiness = sourceFrame
      ? resolveMovementStartReadiness({
          cameraConfidence: sourceFrame.cameraConfidence,
          poseLandmarks: sourceFrame.landmarks.pose,
          requirements: {
            calibrationQuality: effectivePlayerCalibration?.quality ?? null,
          },
        })
      : null;
    const cameraRecoveryCue = sourceFrame
      ? getMovementCameraConfidenceRecoveryCue(sourceFrame.cameraConfidence)
      : null;
    if (!effectivePlayerCalibration) {
      return {
        canStart: false,
        capturedAt: sourceFrame?.capturedAt ?? null,
        message: getMovementGameStartInstruction({
          cameraRecoveryCue,
          hasAutomaticSetup: false,
          readiness,
        }),
      };
    }
    const gateDecision = resolveMovementStartGateDecision({
      readiness,
      target: "game",
    });
    return {
      canStart: gateDecision.canStart,
      capturedAt: sourceFrame?.capturedAt ?? null,
      message: getMovementStartReadinessMessage({
        blockedReasons: gateDecision.blockedReasons,
        cameraRecoveryCue,
        readiness: gateDecision.readiness,
      }),
    };
  }, [
    effectivePlayerCalibration,
    playerMotionFrameRef,
  ]);

  const completeGameStartGate = React.useCallback((deferBlockedResult = false) => {
    const gateDecision = resolveCurrentGameStartGate();
    if (gateDecision.canStart) {
      resetInstructorPlayback();
      resetScoring();
      setGameStartGate(createIdleGameStartGate());
      setIsPlaying(true);
      return true;
    }

    if (deferBlockedResult) return false;

    setGameStartGate({
      countdownMsRemaining: 0,
      endsAt: null,
      message: gateDecision.message,
      status: "waiting-for-readiness",
    });
    return false;
  }, [
    resetInstructorPlayback,
    resetScoring,
    resolveCurrentGameStartGate,
    setIsPlaying,
  ]);

  useEffect(() => {
    if (gameStartGate.status !== "waiting-for-readiness") {
      return undefined;
    }

    let active = true;
    let readinessTimeoutId = 0;
    const waitForReadiness = () => {
      if (!active) return;

      const gateDecision = resolveCurrentGameStartGate();
      gameStartStabilityRef.current = advanceMovementGameStartStability({
        canStart: gateDecision.canStart,
        capturedAt: gateDecision.capturedAt,
        state: gameStartStabilityRef.current,
      });
      if (
        gameStartStabilityRef.current.acceptedFrameCount >=
        MOVEMENT_GAME_START_STABLE_FRAME_COUNT
      ) {
        const endsAt = Date.now() + MOVEMENT_GAME_START_COUNTDOWN_MS;
        setGameStartGate({
          countdownMsRemaining: MOVEMENT_GAME_START_COUNTDOWN_MS,
          endsAt,
          message: "Perfect — stay there.",
          status: "countdown",
        });
        return;
      }

      setGameStartGate((current) => (
        current.status === "waiting-for-readiness"
          ? {
              ...current,
              message: gateDecision.canStart
                ? "We can see your whole body — stay there."
                : gateDecision.message,
            }
          : current
      ));
      readinessTimeoutId = window.setTimeout(
        waitForReadiness,
        MOVEMENT_GAME_START_FRESH_FRAME_INTERVAL_MS,
      );
    };

    readinessTimeoutId = window.setTimeout(
      waitForReadiness,
      MOVEMENT_GAME_START_FRESH_FRAME_DELAY_MS,
    );
    return () => {
      active = false;
      window.clearTimeout(readinessTimeoutId);
    };
  }, [
    gameStartGate.status,
    resolveCurrentGameStartGate,
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
              message: "Stay there — starting now.",
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

    let active = true;
    let attempts = gameStartFreshFrameCheckRef.current.attempts;
    let startCheckTimeoutId = 0;
    const checkFreshMotionFrame = () => {
      if (!active) return;
      const currentProofFrameIndex = recordedGamePlaybackStateRef.current.frameIndex;
      if (
        isDebugGamePacketRoute &&
        currentProofFrameIndex === gameStartFreshFrameCheckRef.current.lastProofFrameIndex
      ) {
        startCheckTimeoutId = window.setTimeout(
          checkFreshMotionFrame,
          MOVEMENT_GAME_START_FRESH_FRAME_INTERVAL_MS,
        );
        return;
      }
      gameStartFreshFrameCheckRef.current.lastProofFrameIndex = currentProofFrameIndex;
      attempts += 1;
      gameStartFreshFrameCheckRef.current.attempts = attempts;
      const shouldKeepChecking = shouldContinueMovementGameStartFreshFrameCheck({
        attempt: attempts,
        didStart: false,
      });
      const didStart = completeGameStartGate(shouldKeepChecking);
      if (shouldContinueMovementGameStartFreshFrameCheck({ attempt: attempts, didStart })) {
        startCheckTimeoutId = window.setTimeout(
          checkFreshMotionFrame,
          MOVEMENT_GAME_START_FRESH_FRAME_INTERVAL_MS,
        );
      }
    };
    startCheckTimeoutId = window.setTimeout(
      checkFreshMotionFrame,
      MOVEMENT_GAME_START_FRESH_FRAME_DELAY_MS,
    );
    return () => {
      active = false;
      window.clearTimeout(startCheckTimeoutId);
    };
  }, [
    completeGameStartGate,
    gameStartGate.status,
    isDebugGamePacketRoute,
    playerMotionFrameRef,
  ]);

  const handleTogglePlaying = React.useCallback(() => {
    if (isPlaying) {
      if (isDebugGamePacketRoute) {
        recordedGameControlRef.current.isPlaying = false;
      }
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

    if (!isVisionReadyForSession || isCalibrating) return;

    gameStartFreshFrameCheckRef.current = {
      attempts: 0,
      lastProofFrameIndex: -1,
    };
    gameStartStabilityRef.current = {
      acceptedFrameCount: 0,
      lastCapturedAt: null,
    };
    setIsPlaying(false);
    setGameStartGate({
      countdownMsRemaining: 0,
      endsAt: null,
      message: "Move into view so the camera can see your whole body.",
      status: "waiting-for-readiness",
    });
  }, [
    isCalibrating,
    isCalibrationSkipped,
    isPlaying,
    isTrackingReady,
    isVisionReadyForSession,
    isDebugGamePacketRoute,
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

  if (!movement || isFramesLoading || isGameProofPacketLoading) {
    const loadingStudio = (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#07070b] text-[#f6ccbe] animate-pulse font-medium">
        <style>{`nextjs-portal { display: none !important; }`}</style>
        Preparing posture studio...
      </div>
    );

    return typeof document === "undefined" ? loadingStudio : createPortal(loadingStudio, document.body);
  }

  if (gameProofPacketError) {
    const packetError = (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#07070b] px-8 text-center text-[#f6ccbe] font-medium">
        Game proof packet failed: {gameProofPacketError}
      </div>
    );
    return typeof document === "undefined" ? packetError : createPortal(packetError, document.body);
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
          frameApplicationProofRef={isDebugGamePacketRoute ? instructorFrameApplicationProofRef : undefined}
          frameWarmupSequenceRef={isDebugGamePacketRoute ? instructorInitialFrameSequenceRef : undefined}
          landmarksRef={effectiveInstructorCurrentLmRef}
          motionFrameRef={instructorMotionFrameRef}
          positionOffset={[-5, 0, 0]}
          isPlaying={shouldKeepInstructorMotionFrameVisible}
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
          frameApplicationProofRef={isDebugGamePacketRoute ? playerFrameApplicationProofRef : undefined}
          frameWarmupSequenceRef={isDebugGamePacketRoute ? playerInitialFrameSequenceRef : undefined}
          landmarksRef={effectivePlayerLiveLmRef}
          positionOffset={[5, 0, 0]}
          isPlayer={true}
          isPlaying={isPlayerAvatarMotionActive}
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
        visionStatus={visionStatus}
        visionError={visionError}
        isCameraReady={isDebugPlayerInjectionRoute || cameraStatus === "ready"}
        cameraError={cameraError}
        calibrationStatus={trackingCalibrationStatus}
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

      {isDebugTracking ? (
        <MovementCalibrationOverlay
          isCalibrated={isDebugPlayerInjectionRoute || isCalibrated || isCalibrationSkipped}
          isCalibrating={isCalibrating}
          isVisionReady={isVisionReadyForSession}
          calibrationStatus={trackingCalibrationStatus}
          calibrationProgress={calibrationProgress}
          calibrationSampleCount={calibrationSampleCount}
          calibrationCountdownSeconds={calibrationCountdownSeconds}
          onCalibrate={startCalibration}
          onSkipCalibration={skipCalibration}
          onStartDebugAutoBaseline={startDebugAutoBaseline}
        />
      ) : null}

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
