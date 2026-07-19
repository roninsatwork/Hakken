"use client";

import React, { type RefObject } from "react";
import Webcam from "react-webcam";
import Typography from "@/src/ui/atoms/typography";
import type { MediaPipeVisionStatus } from "../_hooks/useMediaPipeVision";
import { MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS } from "../_lib/movementCameraConstraints";
import type { MovementCapturePreflight } from "../_lib/movementCapturePreflight";
import MovementCapturePreflightPanel from "./MovementCapturePreflightPanel";

type MovementCapturePanelProps = {
  webcamRef: RefObject<Webcam | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraError: boolean;
  isRecording: boolean;
  isVisionReady: boolean;
  visionStatus: MediaPipeVisionStatus;
  visionError: string | null;
  isPoseReady: boolean;
  captureReadinessMessage?: string | null;
  captureReadinessStatus?: "idle" | "waiting-for-body" | "blocked";
  capturePreflight?: MovementCapturePreflight;
  captureTechnicalError?: string | null;
  frameCount: number;
  trackingQuality: number;
  spineQuality: number;
  onCameraError: () => void;
  onRetryVision: () => void;
  onToggleRecording: () => void;
  onToggleTrackingDetail?: () => void;
  showAllTrackingPoints?: boolean;
  showTrackingDetailToggle?: boolean;
};

export default function MovementCapturePanel({
  webcamRef,
  canvasRef,
  cameraError,
  isRecording,
  isVisionReady,
  visionStatus,
  visionError,
  isPoseReady,
  captureReadinessMessage = null,
  captureReadinessStatus = "idle",
  capturePreflight,
  captureTechnicalError = null,
  frameCount,
  trackingQuality,
  spineQuality,
  onCameraError,
  onRetryVision,
  onToggleRecording,
  onToggleTrackingDetail,
  showAllTrackingPoints = false,
  showTrackingDetailToggle = false,
}: MovementCapturePanelProps) {
  const isCaptureStartGateActive = captureReadinessStatus === "waiting-for-body";
  const lifecycleLabel = isRecording
    ? `Recording — ${frameCount} moments saved`
    : captureReadinessStatus === "waiting-for-body"
      ? "Armed — not recording yet"
      : captureReadinessStatus === "blocked"
        ? "Recording did not start"
        : "Not recording";
  const visionLabel =
    visionStatus === "ready"
      ? "Posture Tracking: Ready"
      : visionStatus === "failed"
        ? "Posture Tracking: Check needed"
        : "Preparing posture model...";

  if (cameraError) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full text-center backdrop-blur-3xl shadow-2xl">
        <Typography className="text-white text-xl font-light tracking-wide mb-4">
          Camera Check Needed
        </Typography>
        <Typography className="text-gray-400">
          Allow camera access to run the posture studio. You can update the browser camera setting
          and refresh this page when you are ready.
        </Typography>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-[#07070b] border border-white/10 shadow-[0_30px_90px_rgba(246,204,190,0.10)]">
      <Webcam
        ref={webcamRef}
        onUserMediaError={onCameraError}
        className="absolute inset-0 w-full h-full object-contain"
        mirrored={true}
        videoConstraints={MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none"
      />

      <div className="absolute top-4 left-4 z-20">
        <div className="px-4 py-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isPoseReady ? "bg-[#a8d5ba] shadow-[0_0_12px_rgba(168,213,186,0.75)]" : "bg-[#f6ccbe] animate-pulse"
            }`}
          />
          <Typography className="text-white text-sm font-medium">{visionLabel}</Typography>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <div className="rounded-full border border-white/10 bg-black/50 px-4 py-2 backdrop-blur-md">
          <Typography className="text-xs font-bold uppercase tracking-wide text-white/80">
            Moments {frameCount}
          </Typography>
        </div>
        <div className="rounded-full border border-white/10 bg-black/50 px-4 py-2 backdrop-blur-md">
          <Typography className="text-xs font-bold uppercase tracking-wide text-white/80">
            Alignment {trackingQuality}%
          </Typography>
        </div>
        <div className="rounded-full border border-white/10 bg-black/50 px-4 py-2 backdrop-blur-md">
          <Typography className="text-xs font-bold uppercase tracking-wide text-white/80">
            Spine {spineQuality}%
          </Typography>
        </div>
      </div>

      <div
        className={`absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border px-4 py-2 backdrop-blur-md ${
          isRecording
            ? "border-red-300/50 bg-red-600/85 text-white"
            : captureReadinessStatus === "waiting-for-body"
              ? "border-amber-200/40 bg-amber-950/85 text-amber-100"
              : captureReadinessStatus === "blocked"
                ? "border-red-300/40 bg-red-950/85 text-red-100"
                : "border-white/15 bg-black/65 text-white/80"
        }`}
        data-testid="recording-lifecycle-status"
        role="status"
      >
        <span className="text-xs font-black uppercase tracking-[0.14em]">{lifecycleLabel}</span>
      </div>

      {visionError && (
        <div className="absolute top-16 left-4 right-4 z-20 rounded-2xl border border-red-500/30 bg-black/70 px-4 py-3 backdrop-blur-md">
          <Typography className="text-sm font-medium text-red-200">{visionError}</Typography>
          <button
            type="button"
            onClick={onRetryVision}
            className="mt-2 rounded-full border border-red-300/30 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-100 transition-colors hover:bg-red-500/20"
          >
            Retry tracking
          </button>
        </div>
      )}

      {captureTechnicalError && !visionError && (
        <div className="absolute left-4 right-4 top-16 z-20 rounded-2xl border border-red-500/40 bg-black/80 px-4 py-3 backdrop-blur-md" role="alert">
          <Typography className="text-sm font-semibold text-red-100">
            Deep Capture is not ready. Recording will not start.
          </Typography>
          <Typography className="mt-1 text-xs text-red-100/80">
            Body-surface tracking failed: {captureTechnicalError}
          </Typography>
        </div>
      )}

      {captureReadinessStatus !== "idle" && (
        <div className="absolute bottom-24 left-1/2 z-20 w-[min(90%,360px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 px-5 py-3 text-center backdrop-blur-md">
          <Typography className="text-xs font-black uppercase tracking-[0.18em] text-[#f6ccbe]">
            {captureReadinessMessage ?? "Show your whole body"}
          </Typography>
        </div>
      )}

      {showTrackingDetailToggle && onToggleTrackingDetail && (
        <button
          aria-label={showAllTrackingPoints
            ? "Show essential tracking points"
            : "Show all tracking points"}
          aria-pressed={showAllTrackingPoints}
          className="absolute bottom-20 left-4 z-20 rounded-full border border-white/15 bg-black/65 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white/85 backdrop-blur-md transition-colors hover:bg-black/80 sm:bottom-6"
          onClick={onToggleTrackingDetail}
          title={showAllTrackingPoints
            ? "Return to the lighter region-balanced overlay"
            : "Show every captured face and dense-body point"}
          type="button"
        >
          Points: {showAllTrackingPoints ? "All" : "Essential"}
        </button>
      )}

        <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20">
          <button
            onClick={onToggleRecording}
            disabled={!isVisionReady || isCaptureStartGateActive}
            aria-label={isRecording ? "Stop posture capture" : "Start posture capture"}
            className={`px-8 py-3 rounded-full font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${
              isRecording
                ? "bg-red-500 hover:bg-red-600 shadow-[0_0_20px_#ef4444]"
                : "bg-[#f6ccbe] text-[#17131d] hover:bg-[#f7efe7] shadow-[0_0_20px_rgba(246,204,190,0.34)]"
            }`}
          >
            {isRecording
              ? "Finish Capture"
              : captureReadinessStatus === "waiting-for-body"
                ? "Waiting for whole body"
                  : "Start Posture Capture"}
          </button>
        </div>
      </div>

      {capturePreflight && <MovementCapturePreflightPanel capturePreflight={capturePreflight} />}
    </div>
  );
}
