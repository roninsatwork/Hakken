"use client";

import { Activity, RefreshCw } from "lucide-react";

type MovementCalibrationOverlayProps = {
  isCalibrated: boolean;
  isCalibrating: boolean;
  isVisionReady: boolean;
  calibrationStatus: string;
  calibrationProgress: number;
  calibrationSampleCount: number;
  calibrationCountdownSeconds: number;
  onCalibrate: () => void;
  onSkipCalibration: () => void;
};

export default function MovementCalibrationOverlay({
  isCalibrated,
  isCalibrating,
  isVisionReady,
  calibrationStatus,
  calibrationProgress,
  calibrationSampleCount,
  calibrationCountdownSeconds,
  onCalibrate,
  onSkipCalibration,
}: MovementCalibrationOverlayProps) {
  if (isCalibrated && !isCalibrating) return null;

  return (
    <div className="pointer-events-auto absolute left-6 top-28 z-20 w-[min(92vw,380px)] rounded-[28px] border border-white/10 bg-[#111018]/[0.82] p-5 text-center shadow-2xl backdrop-blur-2xl">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#f6ccbe]/[0.35] bg-[#f6ccbe]/[0.14]">
        <Activity className="h-6 w-6 text-[#f6ccbe]" />
      </div>
      <h2 className="mt-4 text-xl font-black uppercase tracking-[0.08em] text-white">
        Posture Check-In
      </h2>
      <p className="mt-2 text-sm leading-6 text-white/70">
        Stand tall, soften the shoulders, and face the camera so the studio can set a calm
        alignment baseline.
      </p>
      {calibrationStatus === "Needs stronger tracking" && (
        <p className="mt-2 text-xs leading-5 text-white/55">
          Start a guided preview now, then use Posture check once the camera view is stronger.
        </p>
      )}
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#f6ccbe]">
        {calibrationCountdownSeconds > 0
          ? `SET YOUR POSTURE: ${calibrationCountdownSeconds}`
          : calibrationStatus}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#f6ccbe] transition-[width]"
          style={{ width: `${Math.max(0, Math.min(100, calibrationProgress))}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/[0.45]">
        {calibrationSampleCount} posture moments
      </div>
      <button
        type="button"
        onClick={onCalibrate}
        disabled={!isVisionReady || isCalibrating}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f7efe7] px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#17131d] transition hover:bg-[#f6ccbe] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${isCalibrating ? "animate-spin" : ""}`} />
        {isCalibrating ? "Checking Posture" : "Start Check-In"}
      </button>
      <button
        type="button"
        onClick={onSkipCalibration}
        disabled={isCalibrating}
        className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Start Guided Preview
      </button>
    </div>
  );
}
