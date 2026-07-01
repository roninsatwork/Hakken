"use client";
/**
 * Sonae Movement Demo - Premium Posture Studio Interface
 * Last Updated: 2026-06-14 - pitch polish pass
 */

import React, { useEffect, useRef, use, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
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
import { useMovementPlayerTracking } from "../../_hooks/useMovementPlayerTracking";
import { useMovementTrackingCalibration } from "../../_hooks/useMovementTrackingCalibration";
import { getStudioRoutineTitle } from "../../_lib/movementPresentation";
import type { MovementTrackingDebugState } from "../../_lib/movementTrackingCalibration";
import type { VrmMotionFrame } from "../../_lib/vrmRigging";

type MotionFrame = VrmMotionFrame;

export default function MatchPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const searchParams = useSearchParams();
  const movementId = unwrappedParams.id as Id<"movements">;
  const isDebugTracking = searchParams.get("debugTracking") === "1";
  const isGuidedPreviewRoute = searchParams.get("guidedPreview") === "1";
  const shouldAutoStartGuidedPreview = isGuidedPreviewRoute && isDebugTracking;
  const [cameraStatus, setCameraStatus] = useState<"pending" | "ready" | "error">("pending");
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const movement = useQuery(api.movements.get, { id: movementId });
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
  const {
    finalScore,
    feedbackMsg,
    isComplete,
    hudScore,
    hudSync,
    syncRef,
    resetScoring,
  } = useMovementMatchScoring({
    isPlaying,
    isScoringEnabled: isCalibrated,
    setIsPlaying,
    playerLiveLmRef,
    advanceInstructorFrame,
  });
  const hasStartedGuidedPreviewRef = useRef(false);
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
      !shouldAutoStartGuidedPreview ||
      hasStartedGuidedPreviewRef.current ||
      !isLobby ||
      !movement ||
      isFramesLoading ||
      loadedFrames.length === 0
    ) {
      return;
    }

    hasStartedGuidedPreviewRef.current = true;
    startSelectedMatch();
  }, [
    isFramesLoading,
    isLobby,
    loadedFrames.length,
    movement,
    shouldAutoStartGuidedPreview,
    startSelectedMatch,
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
