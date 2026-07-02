"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { MovementInstructorRetargetAnalysis } from "../../../_hooks/useMovementInstructorPlayback";

type MovementDebugFrameScrubberProps = {
  frameCount: number;
  frameIndexRef: MutableRefObject<number>;
  isEnabled: boolean;
  isPlaying: boolean;
  onFrameChange: (frameIndex: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  recordingAnalysis?: MovementInstructorRetargetAnalysis | null;
};

export default function MovementDebugFrameScrubber({
  frameCount,
  frameIndexRef,
  isEnabled,
  isPlaying,
  onFrameChange,
  onPlayingChange,
  recordingAnalysis = null,
}: MovementDebugFrameScrubberProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const frameInputRef = useRef<HTMLInputElement>(null);
  const maxFrameIndex = Math.max(0, frameCount - 1);

  useEffect(() => {
    if (!isEnabled) return undefined;

    const interval = window.setInterval(() => {
      const nextFrameIndex = frameIndexRef.current;
      setFrameIndex(nextFrameIndex);
      if (frameInputRef.current && document.activeElement !== frameInputRef.current) {
        frameInputRef.current.value = String(Math.min(nextFrameIndex + 1, frameCount));
      }
    }, 120);

    return () => window.clearInterval(interval);
  }, [frameCount, frameIndexRef, isEnabled]);

  if (!isEnabled || frameCount <= 0) return null;

  const jumpToFrame = (nextFrameIndex: number) => {
    const clampedFrameIndex = Math.max(0, Math.min(maxFrameIndex, nextFrameIndex));
    onPlayingChange(false);
    onFrameChange(clampedFrameIndex);
    setFrameIndex(clampedFrameIndex);
    if (frameInputRef.current) {
      frameInputRef.current.value = String(clampedFrameIndex + 1);
    }
  };

  const jumpToInputFrame = () => {
    const nextFrame = Number(frameInputRef.current?.value ?? frameIndex + 1);
    if (!Number.isFinite(nextFrame)) return;
    jumpToFrame(nextFrame - 1);
  };

  const toggleDebugPlayback = () => {
    if (isPlaying) {
      onPlayingChange(false);
      return;
    }

    if (frameIndex >= maxFrameIndex) {
      onFrameChange(0);
      setFrameIndex(0);
      if (frameInputRef.current) {
        frameInputRef.current.value = "1";
      }
    }

    onPlayingChange(true);
  };

  const formatPeak = (
    frame: MovementInstructorRetargetAnalysis["peakSquat"],
    score: (frame: NonNullable<MovementInstructorRetargetAnalysis["peakSquat"]>) => number,
  ) => {
    if (!frame) return "waiting";
    return `F${frame.frameIndex + 1} ${score(frame).toFixed(2)}`;
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-32 z-[60] w-[34rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-[#a8d5ba]/25 bg-black/70 p-3 text-[#edf7f0] shadow-2xl backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a8d5ba]">
            Debug Scrub
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-white/60">
            <span>Frame</span>
            <input
              aria-label="Debug frame number"
              className="h-7 w-20 rounded-lg border border-white/10 bg-white/10 px-2 text-center font-mono text-white outline-none transition focus:border-[#a8d5ba]/60"
              defaultValue={Math.min(frameIndex + 1, frameCount)}
              max={frameCount}
              min={1}
              onChange={(event) => {
                const nextFrame = Number(event.target.value);
                if (!Number.isFinite(nextFrame)) return;
                jumpToFrame(nextFrame - 1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  jumpToInputFrame();
                }
              }}
              ref={frameInputRef}
              type="number"
            />
            <button
              type="button"
              aria-label="Go to debug frame"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/15"
              onClick={jumpToInputFrame}
            >
              Go
            </button>
            <span>/ {frameCount}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous frame"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/15"
            onClick={() => jumpToFrame(frameIndex - 1)}
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={isPlaying ? "Pause debug playback" : "Resume debug playback"}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#f7efe7] text-[#121016] transition hover:bg-white"
            onClick={toggleDebugPlayback}
          >
            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
          </button>
          <button
            type="button"
            aria-label="Next frame"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/15"
            onClick={() => jumpToFrame(frameIndex + 1)}
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      </div>

      <input
        aria-label="Movement debug frame"
        className="mt-3 h-2 w-full cursor-pointer accent-[#a8d5ba]"
        max={maxFrameIndex}
        min={0}
        onChange={(event) => jumpToFrame(Number(event.target.value))}
        type="range"
        value={Math.min(frameIndex, maxFrameIndex)}
      />

      {recordingAnalysis ? (
        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/10 pt-3 font-mono text-[10px] text-white/60">
          <div>
            <div className="font-black uppercase tracking-[0.14em] text-[#a8d5ba]">
              Peak Squat
            </div>
            <div>
              {formatPeak(recordingAnalysis.peakSquat, (frame) => frame.squatDepth)}
              {recordingAnalysis.peakSquat
                ? ` body${recordingAnalysis.peakSquat.balancedPlantedSquatDepth.toFixed(2)}`
                : ""}
            </div>
          </div>
          <div>
            <div className="font-black uppercase tracking-[0.14em] text-[#a8d5ba]">
              Left Knee
            </div>
            <div>{formatPeak(recordingAnalysis.peakLeftKneeLift, (frame) => frame.leftKneeLift)}</div>
          </div>
          <div>
            <div className="font-black uppercase tracking-[0.14em] text-[#a8d5ba]">
              Right Knee
            </div>
            <div>{formatPeak(recordingAnalysis.peakRightKneeLift, (frame) => frame.rightKneeLift)}</div>
          </div>
          <div>
            <div className="font-black uppercase tracking-[0.14em] text-[#a8d5ba]">
              Single Knee
            </div>
            <div>
              {formatPeak(recordingAnalysis.peakSingleKneeLift, (frame) => Math.abs(frame.leftKneeLift - frame.rightKneeLift))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
