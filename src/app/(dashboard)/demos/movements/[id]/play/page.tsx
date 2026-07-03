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
import { useMovementMatchScoring } from "../../_hooks/useMovementMatchScoring";
import { useMovementMatchSession } from "../../_hooks/useMovementMatchSession";
import { useMediaPipeVision } from "../../_hooks/useMediaPipeVision";
import { useMovementFrames } from "../../_hooks/useMovementFrames";
import {
  useMovementPlayerTracking,
  type MovementPlayerMotionPayload,
} from "../../_hooks/useMovementPlayerTracking";
import { useMovementTrackingCalibration } from "../../_hooks/useMovementTrackingCalibration";
import { getStudioRoutineTitle } from "../../_lib/movementPresentation";
import { MOVEMENT_SPINE_GOAL_OPTIONS } from "../../_lib/movementSpineIntent";
import type { MovementSpineGoal } from "../../_lib/movementTypes";
import {
  getMovementTrackingHealthSummary,
  type MovementTrackingDebugState,
} from "../../_lib/movementTrackingCalibration";
import type { VrmMotionFrame } from "../../_lib/vrmRigging";

type MotionFrame = VrmMotionFrame;

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

export default function MatchPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const searchParams = useSearchParams();
  const movementId = unwrappedParams.id as Id<"movements">;
  const isDebugTracking = searchParams.get("debugTracking") === "1";
  const isGuidedPreviewRoute = searchParams.get("guidedPreview") === "1";
  const isDebugAutoBaselineRoute = isDebugTracking && searchParams.get("debugAutoBaseline") === "1";
  const shouldAutoStartGuidedPreview = isGuidedPreviewRoute && isDebugTracking;
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
  const instructorTrackingDebugRef = useRef<MovementTrackingDebugState | null>(null);
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
  } = useMovementMatchSession({ isVisionReady });
  const playerLiveLmRef = useMovementPlayerTracking({
    webcamRef,
    poseLandmarker,
    faceLandmarker,
    handLandmarker,
    onBodyTracked: markBodyTracked,
  });
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
    isVisionReady,
    playerLiveLmRef,
  });
  const isTrackingReady = isCalibrated || isCalibrationSkipped;
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
    isScoringEnabled: isCalibrated,
    setIsPlaying,
    playerLiveLmRef,
    advanceInstructorFrame,
    spineGoal,
  });
  const hasStartedGuidedPreviewRef = useRef(false);
  const debugTrackingSamplesRef = useRef<DebugTrackingSample[]>([]);
  const debugTrackingChunkStartedAtRef = useRef<number | null>(null);
  const isSavingDebugTrackingRef = useRef(false);
  const startDebugAutoBaseline = React.useCallback(() => {
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
    startMatch();

    if (!isGuidedPreviewRoute) return;

    skipCalibration();
    resetInstructorPlayback();
    resetScoring();
    setIsPlaying(true);
  }, [
    isGuidedPreviewRoute,
    resetInstructorPlayback,
    resetScoring,
    setIsPlaying,
    skipCalibration,
    startMatch,
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
      const trackingPayload = playerLiveLmRef.current;
      const now = performance.now();
      if (!debugState && !trackingPayload) return;
      if (debugTrackingChunkStartedAtRef.current === null) {
        debugTrackingChunkStartedAtRef.current = Date.now();
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
      debugTrackingSamplesRef.current = samples.slice(chunk.length);
      debugTrackingChunkStartedAtRef.current = debugTrackingSamplesRef.current[0]?.capturedAt ?? null;
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
    playerLiveLmRef,
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
          landmarksRef={playerLiveLmRef}
          positionOffset={[5, 0, 0]}
          isPlayer={true}
          isPlaying={isPlaying}
          trackingCalibration={calibration}
          trackingDebugRef={trackingDebugRef}
          retargetSourceModel={playerRetargetSourceModel}
          vrmUrl={playerAvatarUrl}
          name={playerAvatarName}
        />

        {isDebugTracking ? (
          <MovementSourceSkeleton
            color="#bfe7d0"
            landmarksRef={playerLiveLmRef}
            positionOffset={[5, 0, 0]}
          />
        ) : null}

        <MovementSparkles landmarksRef={playerLiveLmRef} jointIndices={[15, 16, 27, 28]} syncRef={syncRef} />
      </MovementMatchScene>

      <MovementHud
        movementTitle={routineTitle}
        difficulty={movement.difficulty || "Beginner"}
        hudScore={hudScore}
        hudSync={hudSync}
        hudSpine={hudSpine}
        hudSpineCue={hudSpineCue}
        isPlaying={isPlaying}
        isVisionReady={isVisionReady}
        isTrackingCalibrated={isTrackingReady}
        isPreviewMode={isCalibrationSkipped}
        isCalibrating={isCalibrating}
        visionStatus={visionStatus}
        visionError={visionError}
        isCameraReady={cameraStatus === "ready"}
        cameraError={cameraError}
        calibrationStatus={displayedCalibrationStatus}
        webcamRef={webcamRef}
        onTogglePlaying={togglePlaying}
        onRetryVision={retryVision}
        onCalibrate={startCalibration}
        onResetStudio={() => {
          resetCalibration();
          resetMatch({ returnToLobby: true, resetInstructorPlayback, resetScoring });
        }}
        onStartGuidedPreview={() => {
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
        isVisionReady={isVisionReady}
        calibrationStatus={trackingCalibrationStatus}
        calibrationProgress={calibrationProgress}
        calibrationSampleCount={calibrationSampleCount}
        calibrationCountdownSeconds={calibrationCountdownSeconds}
        onCalibrate={startCalibration}
        onSkipCalibration={skipCalibration}
        onStartDebugAutoBaseline={isDebugTracking ? startDebugAutoBaseline : undefined}
      />

      <MovementTrackingDebugOverlay
        calibration={calibration}
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
