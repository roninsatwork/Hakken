"use client";

import React from "react";
import Link from "next/link";
import Webcam from "react-webcam";
import { ArrowLeft, Crosshair, Flame, Pause, Play, RefreshCw } from "lucide-react";
import Typography from "@/src/ui/atoms/typography";
import type { MediaPipeVisionStatus } from "../../../_hooks/useMediaPipeVision";

type MovementHudProps = {
  movementTitle: string;
  difficulty: string;
  hudScore: number;
  hudSync: number;
  isPlaying: boolean;
  isVisionReady: boolean;
  isTrackingCalibrated: boolean;
  isCalibrating: boolean;
  visionStatus: MediaPipeVisionStatus;
  visionError: string | null;
  calibrationStatus: string;
  webcamRef: React.RefObject<Webcam | null>;
  onTogglePlaying: () => void;
  onRetryVision: () => void;
  onCalibrate: () => void;
};

export default function MovementHud({
  movementTitle,
  difficulty,
  hudScore,
  hudSync,
  isPlaying,
  isVisionReady,
  isTrackingCalibrated,
  isCalibrating,
  visionStatus,
  visionError,
  calibrationStatus,
  webcamRef,
  onTogglePlaying,
  onRetryVision,
  onCalibrate,
}: MovementHudProps) {
  const readinessLabel = visionStatus === "failed"
    ? "Vision Failed"
    : visionStatus === "ready"
      ? (isTrackingCalibrated ? (isPlaying ? calibrationStatus : "Ready") : calibrationStatus)
      : "Loading Vision";
  const isPlaybackDisabled = !isVisionReady || !isTrackingCalibrated || isCalibrating;

  return (
    <div className="relative z-10 p-8 flex flex-col h-full pointer-events-none" style={{ isolation: "isolate" }}>
      <div className="flex justify-between items-center bg-white/5 backdrop-blur-3xl border border-white/10 p-3 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] pointer-events-auto">
        <Link href="/demos/movements" className="flex items-center justify-center gap-2 text-[12px] font-bold text-white/70 hover:text-white transition-colors bg-black/40 px-5 py-3 rounded-2xl border border-white/5">
          <ArrowLeft className="w-4 h-4" /> EXIT MATCH
        </Link>

        <div className="flex items-center gap-6 px-8">
          <div className="flex flex-col items-end">
            <Typography className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
              Instructor Routine
            </Typography>
            <Typography className="text-xl font-black text-white uppercase tracking-tight leading-none mt-1">
              {movementTitle}
            </Typography>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <span className="px-3 py-1.5 bg-white/10 rounded-md text-[10px] font-bold text-white/90 uppercase tracking-widest">
            {difficulty}
          </span>
        </div>

        <div className="flex items-center gap-4 bg-black/40 px-6 py-2 rounded-2xl border border-white/5">
          <Flame className="w-6 h-6 text-[#FF3300] drop-shadow-[0_0_15px_rgba(255,51,0,0.8)]" />
          <div className="flex flex-col">
            <Typography className="text-[10px] font-bold tracking-widest text-[#FF3300] uppercase">Total Score</Typography>
            <Typography className="text-3xl font-black text-white leading-none mt-1">{hudScore}</Typography>
          </div>
        </div>
      </div>

      <div className="mt-auto flex justify-between items-end pointer-events-auto">
        <div className="bg-white/5 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/10 p-2 pr-8 rounded-full flex items-center gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onTogglePlaying}
              disabled={isPlaybackDisabled}
              aria-label={isPlaying ? "Pause match" : "Start match"}
              className="w-16 h-16 bg-[#CCFF00] hover:bg-white rounded-full flex items-center justify-center text-black transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current" />}
            </button>
            <div className="flex flex-col">
              <span className="text-white font-bold tracking-wide text-lg">
                {isPlaying ? "Match Sequence" : "System Ready"}
              </span>
              <span className={`text-xs font-black tracking-[0.2em] uppercase ${calibrationStatus === "Ready" && visionStatus === "ready" ? "text-green-400" : "text-[#CCFF00]"}`}>
                {readinessLabel}
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
              {isVisionReady && (
                <button
                  type="button"
                  onClick={onCalibrate}
                  disabled={isCalibrating}
                  className="mt-1 inline-flex w-fit items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 transition-colors hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isCalibrating ? "animate-spin" : ""}`} />
                  Recalibrate
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5 bg-white/5 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/10 rounded-full pr-10 pl-5 py-4">
          <div className="w-12 h-12 rounded-full bg-[#CCFF00]/20 flex items-center justify-center border border-[#CCFF00]/50">
            <Crosshair className="w-6 h-6 text-[#CCFF00]" />
          </div>
          <div className="flex flex-col">
            <Typography className="text-[11px] font-bold tracking-widest text-[#CCFF00] uppercase">Sync Rate</Typography>
            <Typography className="text-4xl font-black text-white">{hudSync}%</Typography>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 w-40 h-24 bg-black/50 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md pointer-events-auto">
        <Webcam
          ref={webcamRef}
          audio={false}
          mirrored={true}
          videoConstraints={{ facingMode: "user" }}
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  );
}
