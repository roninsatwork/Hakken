"use client";

import React, { type RefObject } from "react";
import Webcam from "react-webcam";
import Typography from "@/src/ui/atoms/typography";
import type { MediaPipeVisionStatus } from "../_hooks/useMediaPipeVision";

type MovementCapturePanelProps = {
  webcamRef: RefObject<Webcam | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraError: boolean;
  isRecording: boolean;
  isVisionReady: boolean;
  visionStatus: MediaPipeVisionStatus;
  visionError: string | null;
  isPoseReady: boolean;
  frameCount: number;
  trackingQuality: number;
  onCameraError: () => void;
  onRetryVision: () => void;
  onToggleRecording: () => void;
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
  frameCount,
  trackingQuality,
  onCameraError,
  onRetryVision,
  onToggleRecording,
}: MovementCapturePanelProps) {
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
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-[#07070b] border border-white/10 shadow-[0_30px_90px_rgba(246,204,190,0.10)]">
      <Webcam
        ref={webcamRef}
        onUserMediaError={onCameraError}
        className="absolute inset-0 w-full h-full object-contain"
        mirrored={true}
        videoConstraints={{
          facingMode: "user",
        }}
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

      <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20">
        <button
          onClick={onToggleRecording}
          disabled={!isVisionReady}
          aria-label={isRecording ? "Stop posture capture" : "Start posture capture"}
          className={`px-8 py-3 rounded-full font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${
            isRecording
              ? "bg-red-500 hover:bg-red-600 shadow-[0_0_20px_#ef4444]"
              : "bg-[#f6ccbe] text-[#17131d] hover:bg-[#f7efe7] shadow-[0_0_20px_rgba(246,204,190,0.34)]"
          }`}
        >
          {isRecording ? "Finish Capture" : "Start Posture Capture"}
        </button>
      </div>
    </div>
  );
}
