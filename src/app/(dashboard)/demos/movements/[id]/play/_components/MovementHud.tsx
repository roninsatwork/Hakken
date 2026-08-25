"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Webcam from "react-webcam";
import { ArrowLeft, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import Typography from "@/src/ui/components/screens/typography";
import type { MediaPipeVisionStatus } from "../../../_hooks/useMediaPipeVision";
import { movementBodyTrackingVideoConstraints } from "../../../_lib/movementCameraConstraints";
import { useMovementCameraDevices } from "../../../_hooks/useMovementCameraDevices";
import { Select } from "@/src/ui/components/screens/Select";
import {
  MOVEMENT_CREAM,
  MOVEMENT_INK,
  MOVEMENT_MINT,
  MOVEMENT_PANEL_BG,
  MOVEMENT_SALMON,
} from "../../../_lib/movementPalette";

type MovementHudProps = {
  movementTitle: string;
  difficulty: string;
  hudScore: number;
  hudSync: number;
  hudSpine?: number;
  hudSpineCue?: string;
  hudSpineReadiness?: "blocked" | "needs-attention" | "ready";
  isPlaying: boolean;
  isVisionReady: boolean;
  isTrackingCalibrated: boolean;
  isPreviewMode?: boolean;
  isCalibrating: boolean;
  setupRecoveryCue?: string | null;
  visionStatus: MediaPipeVisionStatus;
  visionError: string | null;
  isCameraReady?: boolean;
  cameraError?: string | null;
  calibrationStatus: string;
  startReadinessCountdownSeconds?: number;
  startReadinessMessage?: string | null;
  startReadinessStatus?:
    | "idle"
    | "waiting-for-readiness"
    | "countdown"
    | "checking-visibility"
    | "blocked";
  webcamRef: React.RefObject<Webcam | null>;
  onTogglePlaying: () => void;
  onRetryVision: () => void;
  onCalibrate: () => void;
  onResetStudio: () => void;
  onStartGuidedPreview?: () => void;
  onCameraReady?: () => void;
  onCameraError?: (error: string) => void;
};

export default function MovementHud({
  movementTitle,
  difficulty,
  hudScore,
  isPlaying,
  isVisionReady,
  isTrackingCalibrated,
  isPreviewMode = false,
  isCalibrating,
  visionStatus,
  visionError,
  isCameraReady = false,
  cameraError = null,
  startReadinessCountdownSeconds = 0,
  startReadinessMessage = null,
  startReadinessStatus = "idle",
  webcamRef,
  onTogglePlaying,
  onRetryVision,
  onResetStudio,
  onCameraReady,
  onCameraError,
}: MovementHudProps) {
  const [hasCameraWaitElapsed, setHasCameraWaitElapsed] = useState(false);
  // No picker here — practice simply honours the camera chosen on the capture
  // screen, so a student is not looking at the wrong one after setting it once.
  const {
    activeDeviceId: activeCameraId,
    devices: cameras,
    selectDevice: onSelectCamera,
  } = useMovementCameraDevices();
  const videoConstraints = React.useMemo(
    () => movementBodyTrackingVideoConstraints(activeCameraId),
    [activeCameraId],
  );

  useEffect(() => {
    if (visionStatus !== "ready" || isCameraReady) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setHasCameraWaitElapsed(true), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [isCameraReady, visionStatus]);

  const cameraNeedsAttention =
    Boolean(cameraError) || (visionStatus === "ready" && !isCameraReady && hasCameraWaitElapsed);
  const isStartGateActive =
    startReadinessStatus === "waiting-for-readiness" ||
    startReadinessStatus === "countdown" ||
    startReadinessStatus === "checking-visibility";
  let readinessLabel = "Loading camera";
  if (startReadinessStatus === "countdown") {
    readinessLabel = `Starting in ${Math.max(startReadinessCountdownSeconds, 1)}`;
  } else if (startReadinessStatus === "waiting-for-readiness") {
    readinessLabel = startReadinessMessage ?? "Show your whole body";
  } else if (startReadinessStatus === "checking-visibility") {
    readinessLabel = "Checking you're ready";
  } else if (startReadinessStatus === "blocked") {
    readinessLabel = startReadinessMessage ?? "Move where I can see you";
  } else if (visionStatus === "failed") {
    readinessLabel = "Camera unavailable";
  } else if (isPreviewMode) {
    readinessLabel = "Preview mode";
  } else if (cameraNeedsAttention) {
    readinessLabel = "Camera needed";
  } else if (visionStatus === "ready") {
    readinessLabel = isPlaying
      ? "Game in progress"
      : isTrackingCalibrated
        ? "Press Start when you're ready"
        : "Press Start to begin setup";
  }
  const isPlaybackDisabled = isPreviewMode
    ? isCalibrating
    : !isVisionReady || isCalibrating || isStartGateActive;
  const practiceLabel = startReadinessStatus === "countdown"
    ? "Get Ready"
    : startReadinessStatus === "waiting-for-readiness"
      ? "Getting You Ready"
    : startReadinessStatus === "checking-visibility"
      ? "Starting"
      : startReadinessStatus === "blocked"
        ? "Camera Needed"
      : isPlaying
        ? "Pause"
        : "Start";
  const controlReadinessLabel = isStartGateActive
    ? "Game starts automatically"
    : readinessLabel;
  const displayedScore = isPlaying || hudScore > 0 ? hudScore : "—";

  return (
    <div className="relative z-10 flex h-full flex-col p-8 pointer-events-none" style={{ isolation: "isolate" }}>
      <div className={`flex items-center justify-between rounded-[28px] border border-white/10 bg-[${MOVEMENT_PANEL_BG}]/[0.72] p-3 shadow-[0_20px_80px_rgba(0,0,0,0.34)] backdrop-blur-3xl pointer-events-auto`}>
        <div className="flex items-center gap-2">
          <Link href="/demos/movements" className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.14em] text-white/[0.68] transition-colors hover:border-white/20 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Leave Studio
          </Link>
          <button
            type="button"
            onClick={onResetStudio}
            aria-label="Reset studio"
            title="Reset studio"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/[0.68] transition-colors hover:border-white/20 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-6 px-8">
          <div className="flex flex-col items-end">
            <Typography className={`text-[10px] font-bold uppercase tracking-[0.22em] text-[${MOVEMENT_MINT}]`}>
              Guided Sequence
            </Typography>
            <Typography className="mt-1 text-xl font-black uppercase leading-none tracking-tight text-white">
              {movementTitle}
            </Typography>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/[0.85]">
            {difficulty}
          </span>
        </div>

        <div className={`flex items-center gap-4 rounded-2xl border border-[${MOVEMENT_SALMON}]/[0.16] bg-[${MOVEMENT_SALMON}]/[0.08] px-6 py-2`}>
          <Sparkles className={`h-6 w-6 text-[${MOVEMENT_SALMON}]`} />
          <div className="flex flex-col">
            <Typography className={`text-[10px] font-bold uppercase tracking-[0.2em] text-[${MOVEMENT_SALMON}]`}>Score</Typography>
            <Typography
              className="mt-1 text-3xl font-black leading-none text-white"
              data-testid="movement-hud-score"
            >
              {displayedScore}
            </Typography>
          </div>
        </div>
      </div>

      {isStartGateActive ? (
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 z-30 w-[min(88vw,760px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border-2 border-[${MOVEMENT_SALMON}]/50 bg-[${MOVEMENT_PANEL_BG}]/95 px-8 py-6 text-center shadow-[0_24px_90px_rgba(0,0,0,0.62)] backdrop-blur-2xl`}
          data-testid="movement-game-readiness-banner"
          role="status"
        >
          <p className={`text-sm font-black uppercase tracking-[0.24em] text-[${MOVEMENT_MINT}]`}>
            {startReadinessStatus === "countdown" ? "Position detected" : "Camera setup"}
          </p>
          {startReadinessStatus === "countdown" ? (
            <>
              <p
                className="mt-2 text-7xl font-black leading-none text-white sm:text-8xl"
                data-testid="movement-game-start-countdown"
              >
                {Math.max(startReadinessCountdownSeconds, 1)}
              </p>
              <p className={`mt-3 text-xl font-bold text-[${MOVEMENT_SALMON}] sm:text-2xl`}>
                Perfect — stay there.
              </p>
            </>
          ) : (
            <p className="mt-3 text-2xl font-black leading-tight text-white sm:text-4xl">
              {readinessLabel}
            </p>
          )}
          <p className="mt-4 text-base font-bold text-white/75 sm:text-lg">
            You don&apos;t need to press Start again. The game will start automatically.
          </p>
        </div>
      ) : null}

      <div className="mt-auto flex items-end justify-between gap-4 pointer-events-auto">
        <div className={`flex min-w-0 max-w-[min(78vw,380px)] items-center gap-4 rounded-full border border-white/10 bg-[${MOVEMENT_PANEL_BG}]/[0.72] p-2 pr-6 shadow-[0_20px_80px_rgba(0,0,0,0.34)] backdrop-blur-3xl sm:max-w-none sm:pr-8`}>
          <div className="flex items-center gap-4">
            <button
              onClick={onTogglePlaying}
              disabled={isPlaybackDisabled}
              aria-label={isPlaying ? "Pause practice" : "Start practice"}
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[${MOVEMENT_CREAM}] text-[${MOVEMENT_INK}] transition-all hover:scale-105 hover:bg-[${MOVEMENT_SALMON}] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100`}
            >
              {isPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="h-7 w-7 fill-current" />}
            </button>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-lg font-bold tracking-wide text-white">
                {practiceLabel}
              </span>
              <span className={`truncate text-xs font-black uppercase tracking-[0.2em] ${isPlaying ? `text-[${MOVEMENT_MINT}]` : `text-[${MOVEMENT_SALMON}]`}`}>
                {controlReadinessLabel}
              </span>
              {visionError && (
                <button
                  type="button"
                  onClick={onRetryVision}
                  className="mt-1 w-fit text-[10px] font-black uppercase tracking-[0.18em] text-red-200 underline decoration-red-300/40 underline-offset-4 transition-colors hover:text-red-100"
                >
                  Retry Vision
                </button>
              )}
              {cameraNeedsAttention && !isPreviewMode && (
                <div className="mt-1 flex max-w-[260px] flex-wrap items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-[0.16em] text-[${MOVEMENT_SALMON}]`}>
                    {cameraError ?? "Allow camera access"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/*
          * Change camera without leaving practice.
          *
          * There was deliberately no picker here: practice honoured whatever the
          * capture screen had been set to, so a student would not choose twice.
          * That holds right up until the chosen camera is the wrong one or has
          * been unplugged — and then the only route to a picture was to leave the
          * studio, change it elsewhere and come back, while the screen said
          * "camera unavailable" and offered nothing to do about it.
          *
          * It sits opposite the play control rather than over the picture, in the
          * same panel treatment as everything else floating on this screen, and
          * appears only when there is a real choice to make or the camera needs
          * attention. One working camera is not a decision anybody needs to see.
          */}
        {(cameras.length > 1 || cameraNeedsAttention) && !isPreviewMode && (
          <div
            data-testid="movement-camera-picker"
            className={`flex items-center gap-3 rounded-full border border-white/10 bg-[${MOVEMENT_PANEL_BG}]/[0.72] py-2 pl-6 pr-2 shadow-[0_20px_80px_rgba(0,0,0,0.34)] backdrop-blur-3xl`}
          >
            <label
              className="shrink-0 text-[10px] font-black uppercase tracking-[0.2em] text-white/60"
              htmlFor="movement-practice-camera"
            >
              Camera
            </label>
            <Select
              className="w-[min(42vw,240px)] rounded-full"
              id="movement-practice-camera"
              value={activeCameraId}
              onChange={onSelectCamera}
            >
              <option value="">Browser default</option>
              {cameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div
        data-testid="movement-camera-preview"
        className="absolute bottom-28 left-1/2 aspect-video w-[min(72vw,420px)] -translate-x-1/2 overflow-hidden rounded-3xl border border-white/10 bg-black/50 shadow-2xl backdrop-blur-md pointer-events-auto sm:bottom-8 sm:w-[min(38vw,420px)]"
      >
        <Webcam
          ref={webcamRef}
          audio={false}
          mirrored={true}
          videoConstraints={videoConstraints}
          onUserMedia={onCameraReady}
          onUserMediaError={(error) => {
            const rawMessage = error instanceof Error ? error.message : String(error);
            const message = rawMessage.toLowerCase().includes("permission")
              ? "Camera permission is blocked"
              : "Camera access unavailable";
            onCameraError?.(message);
          }}
          className="w-full h-full object-contain"
        />

      </div>
    </div>
  );
}
