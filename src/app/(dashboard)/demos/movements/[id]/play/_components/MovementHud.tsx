"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Webcam from "react-webcam";
import { ArrowLeft, Crosshair, Pause, Play, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import Typography from "@/src/ui/atoms/typography";
import type { MediaPipeVisionStatus } from "../../../_hooks/useMediaPipeVision";
import { MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS } from "../../../_lib/movementCameraConstraints";

type MovementHudProps = {
  movementTitle: string;
  difficulty: string;
  hudScore: number;
  hudSync: number;
  hudSpine?: number;
  hudSpineCue?: string;
  isPlaying: boolean;
  isVisionReady: boolean;
  isTrackingCalibrated: boolean;
  isPreviewMode?: boolean;
  isCalibrating: boolean;
  visionStatus: MediaPipeVisionStatus;
  visionError: string | null;
  isCameraReady?: boolean;
  cameraError?: string | null;
  calibrationStatus: string;
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
  hudSync,
  hudSpine = 0,
  hudSpineCue = "Waiting for spine tracking.",
  isPlaying,
  isVisionReady,
  isTrackingCalibrated,
  isPreviewMode = false,
  isCalibrating,
  visionStatus,
  visionError,
  isCameraReady = false,
  cameraError = null,
  calibrationStatus,
  webcamRef,
  onTogglePlaying,
  onRetryVision,
  onCalibrate,
  onResetStudio,
  onStartGuidedPreview,
  onCameraReady,
  onCameraError,
}: MovementHudProps) {
  const [hasCameraWaitElapsed, setHasCameraWaitElapsed] = useState(false);

  useEffect(() => {
    if (visionStatus !== "ready" || isCameraReady) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setHasCameraWaitElapsed(true), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [isCameraReady, visionStatus]);

  const cameraNeedsAttention =
    Boolean(cameraError) || (visionStatus === "ready" && !isCameraReady && hasCameraWaitElapsed);
  const readinessLabel = visionStatus === "failed"
    ? "Vision Failed"
    : isPreviewMode
      ? "Preview mode"
    : cameraNeedsAttention
      ? "Camera check needed"
    : visionStatus === "ready"
      ? (isTrackingCalibrated ? (isPlaying ? calibrationStatus : "Ready") : calibrationStatus)
      : "Loading Vision";
  const isPlaybackDisabled = isPreviewMode
    ? isCalibrating
    : !isVisionReady || !isTrackingCalibrated || isCalibrating;
  const practiceLabel = isPlaying ? "Guided Practice" : "Studio Ready";

  return (
    <div className="relative z-10 flex h-full flex-col p-8 pointer-events-none" style={{ isolation: "isolate" }}>
      <div className="flex items-center justify-between rounded-[28px] border border-white/10 bg-[#111018]/[0.72] p-3 shadow-[0_20px_80px_rgba(0,0,0,0.34)] backdrop-blur-3xl pointer-events-auto">
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
            <Typography className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a8d5ba]">
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

        <div className="flex items-center gap-4 rounded-2xl border border-[#f6ccbe]/[0.16] bg-[#f6ccbe]/[0.08] px-6 py-2">
          <Sparkles className="h-6 w-6 text-[#f6ccbe]" />
          <div className="flex flex-col">
            <Typography className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f6ccbe]">Alignment</Typography>
            <Typography className="mt-1 text-3xl font-black leading-none text-white">{hudScore}</Typography>
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-4 pointer-events-auto">
        <div className="flex min-w-0 max-w-[min(78vw,380px)] items-center gap-4 rounded-full border border-white/10 bg-[#111018]/[0.72] p-2 pr-6 shadow-[0_20px_80px_rgba(0,0,0,0.34)] backdrop-blur-3xl sm:max-w-none sm:pr-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onTogglePlaying}
              disabled={isPlaybackDisabled}
              aria-label={isPlaying ? "Pause practice" : "Start practice"}
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#f7efe7] text-[#17131d] transition-all hover:scale-105 hover:bg-[#f6ccbe] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {isPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="h-7 w-7 fill-current" />}
            </button>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-lg font-bold tracking-wide text-white">
                {practiceLabel}
              </span>
              <span className={`truncate text-xs font-black uppercase tracking-[0.2em] ${calibrationStatus === "Ready" && visionStatus === "ready" ? "text-[#a8d5ba]" : "text-[#f6ccbe]"}`}>
                {readinessLabel}
              </span>
              {hudSpine > 0 && (
                <span className="mt-1 max-w-[300px] truncate text-[11px] font-bold text-[#d7eef4]">
                  {hudSpineCue}
                </span>
              )}
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
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#f6ccbe]">
                    {cameraError ?? "Allow camera access"}
                  </span>
                  {onStartGuidedPreview && (
                    <button
                      type="button"
                      onClick={onStartGuidedPreview}
                      className="inline-flex items-center gap-1 rounded-full border border-[#f6ccbe]/[0.22] bg-[#f6ccbe]/[0.10] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#f6ccbe] transition-colors hover:bg-[#f6ccbe]/[0.16] hover:text-white"
                    >
                      <Sparkles className="h-3 w-3" />
                      Guided Preview
                    </button>
                  )}
                </div>
              )}
              {isVisionReady && (
                <button
                  type="button"
                  onClick={onCalibrate}
                  disabled={isCalibrating}
                  className="mt-1 inline-flex w-fit items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#d7eef4] underline decoration-[#d7eef4]/[0.35] underline-offset-4 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isCalibrating ? "animate-spin" : ""}`} />
                  Posture check
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-5 rounded-full border border-white/10 bg-[#111018]/[0.72] py-4 pl-5 pr-10 shadow-[0_20px_80px_rgba(0,0,0,0.34)] backdrop-blur-3xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#a8d5ba]/[0.45] bg-[#a8d5ba]/[0.18]">
            <Crosshair className="h-6 w-6 text-[#a8d5ba]" />
          </div>
          <div className="flex flex-col">
            <Typography className="text-[11px] font-bold uppercase tracking-widest text-[#a8d5ba]">Posture Sync</Typography>
            <Typography className="text-4xl font-black text-white">{hudSync}%</Typography>
          </div>
          <div className="h-10 w-px bg-white/15" />
          <div className="flex flex-col">
            <Typography className="text-[11px] font-bold uppercase tracking-widest text-[#f6ccbe]">Spine</Typography>
            <Typography className="text-4xl font-black text-white">{hudSpine}%</Typography>
          </div>
        </div>
      </div>

      <div
        data-testid="movement-camera-preview"
        className="absolute bottom-28 left-1/2 aspect-video w-[min(72vw,420px)] -translate-x-1/2 overflow-hidden rounded-3xl border border-white/10 bg-black/50 shadow-2xl backdrop-blur-md pointer-events-auto sm:bottom-8 sm:w-[min(38vw,420px)]"
      >
        <Webcam
          ref={webcamRef}
          audio={false}
          mirrored={true}
          videoConstraints={MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS}
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
