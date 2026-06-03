"use client";
/**
 * Sonae Movement Demo - Gamified Pilates Interface
 * Last Updated: 2026-05-08 - v1.2.0 (Stability & Magnetism)
 */

import React, { useRef, use } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/src/ui/components/layout/Header";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import AvatarSelectorLobby from "./_components/AvatarSelectorLobby";
import MovementCalibrationOverlay from "./_components/MovementCalibrationOverlay";
import MovementCompletionDialog from "./_components/MovementCompletionDialog";
import MovementFeedbackOverlay from "./_components/MovementFeedbackOverlay";
import MovementHud from "./_components/MovementHud";
import MovementMatchScene from "./_components/MovementMatchScene";
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
import type { MovementTrackingDebugState } from "../../_lib/movementTrackingCalibration";
import type { VrmMotionFrame } from "../../_lib/vrmRigging";

type MotionFrame = VrmMotionFrame;

export default function MatchPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const searchParams = useSearchParams();
  const movementId = unwrappedParams.id as Id<"movements">;
  const isDebugTracking = searchParams.get("debugTracking") === "1";
  
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
    instructorCurrentLmRef,
    advanceInstructorFrame,
    resetInstructorPlayback,
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
    setIsPlaying,
    playerLiveLmRef,
    advanceInstructorFrame,
  });

  if (!movement || isFramesLoading) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-24 text-cyan-500 animate-pulse font-medium">
          Loading 3D Engine & Holograms...
        </div>
      </>
    );
  }

  if (isLobby) {
    return (
      <AvatarSelectorLobby
        playerAvatarUrl={playerAvatarUrl}
        setPlayerAvatarUrl={setPlayerAvatarUrl}
        instructorAvatarUrl={instructorAvatarUrl}
        setInstructorAvatarUrl={setInstructorAvatarUrl}
        onStart={startMatch}
      />
    );
  }

  return (
    <div className="h-screen w-full bg-black overflow-hidden flex flex-col relative">
      <MovementMatchScene>
        <VrmAvatar
          landmarksRef={instructorCurrentLmRef}
          positionOffset={[-5, 0, 0]}
          isPlaying={isPlaying}
          vrmUrl={instructorAvatarUrl}
          name={instructorAvatarName}
        />

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

        <MovementSparkles landmarksRef={playerLiveLmRef} jointIndices={[15, 16, 27, 28]} syncRef={syncRef} />
      </MovementMatchScene>

      <MovementHud
        movementTitle={movement.title || "Unknown"}
        difficulty={movement.difficulty || "Beginner"}
        hudScore={hudScore}
        hudSync={hudSync}
        isPlaying={isPlaying}
        isVisionReady={isVisionReady}
        isTrackingCalibrated={isTrackingReady}
        isCalibrating={isCalibrating}
        visionStatus={visionStatus}
        visionError={visionError}
        calibrationStatus={displayedCalibrationStatus}
        webcamRef={webcamRef}
        onTogglePlaying={togglePlaying}
        onRetryVision={retryVision}
        onCalibrate={startCalibration}
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
      />

      <MovementFeedbackOverlay feedbackMsg={feedbackMsg} />

      <MovementCompletionDialog
        isOpen={isComplete}
        finalScore={finalScore}
        onExitMatch={() =>
          resetMatch({ returnToLobby: true, resetInstructorPlayback, resetScoring })
        }
        onRematch={() =>
          resetMatch({ startPlaying: isTrackingReady, resetInstructorPlayback, resetScoring })
        }
      />
    </div>
  );
}
