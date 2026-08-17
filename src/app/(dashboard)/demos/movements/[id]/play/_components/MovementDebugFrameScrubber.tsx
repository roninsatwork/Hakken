"use client";

import { Bookmark, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Field } from "@/src/ui/components/screens/Field";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { MovementInstructorRetargetAnalysis } from "../../../_hooks/useMovementInstructorPlayback";
import type { MovementDebugQaPreset } from "../../../_lib/movementDebugQaPresets";
import {
  MOVEMENT_CREAM,
  MOVEMENT_MINT,
  MOVEMENT_SALMON,
} from "../../../_lib/movementPalette";

type MovementDebugFrameScrubberProps = {
  frameCount: number;
  frameIndexRef: MutableRefObject<number>;
  isEnabled: boolean;
  isPlaying: boolean;
  onDebugFrameRouteChange?: (frameIndex: number) => void;
  onFrameChange: (frameIndex: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  qaPresets?: MovementDebugQaPreset[];
  recordingAnalysis?: MovementInstructorRetargetAnalysis | null;
};

type AnalysisHotspot = {
  detail: string;
  frameIndex: number;
  id: string;
  label: string;
  metric: string;
};

type DebugMarker = {
  frameIndex: number;
  id: string;
  labels: string[];
};

export default function MovementDebugFrameScrubber({
  frameCount,
  frameIndexRef,
  isEnabled,
  isPlaying,
  onDebugFrameRouteChange,
  onFrameChange,
  onPlayingChange,
  qaPresets = [],
  recordingAnalysis = null,
}: MovementDebugFrameScrubberProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const frameInputRef = useRef<HTMLInputElement>(null);
  const maxFrameIndex = Math.max(0, frameCount - 1);
  const activePresets = qaPresets.filter((preset) => preset.frameIndex === frameIndex);
  const analysisHotspots = useMemo(() => {
    if (!recordingAnalysis) return [];

    const hotspots: AnalysisHotspot[] = [];
    const seenFrames = new Set<number>();
    const addHotspot = (
      id: string,
      label: string,
      frame: MovementInstructorRetargetAnalysis["peakSquat"],
      score: (frame: NonNullable<MovementInstructorRetargetAnalysis["peakSquat"]>) => number,
    ) => {
      if (!frame || frame.frameIndex > maxFrameIndex || seenFrames.has(frame.frameIndex)) return;
      seenFrames.add(frame.frameIndex);
      hotspots.push({
        detail: `${label} analysis hotspot`,
        frameIndex: frame.frameIndex,
        id,
        label,
        metric: score(frame).toFixed(2),
      });
    };

    addHotspot("peak-squat", "Peak Squat", recordingAnalysis.peakSquat, (frame) => frame.squatDepth);
    addHotspot("left-knee", "Left Knee", recordingAnalysis.peakLeftKneeLift, (frame) => frame.leftKneeLift);
    addHotspot("right-knee", "Right Knee", recordingAnalysis.peakRightKneeLift, (frame) => frame.rightKneeLift);
    addHotspot(
      "single-knee",
      "Single Knee",
      recordingAnalysis.peakSingleKneeLift,
      (frame) => Math.abs(frame.leftKneeLift - frame.rightKneeLift),
    );

    return hotspots;
  }, [maxFrameIndex, recordingAnalysis]);
  const activeHotspots = analysisHotspots.filter((hotspot) => hotspot.frameIndex === frameIndex);
  const markerFrames = (() => {
    const markers = new Map<number, DebugMarker>();
    const addMarker = (frameIndex: number, id: string, label: string) => {
      const existing = markers.get(frameIndex);
      if (existing) {
        markers.set(frameIndex, {
          ...existing,
          id: `${existing.id}+${id}`,
          labels: existing.labels.includes(label) ? existing.labels : [...existing.labels, label],
        });
        return;
      }

      markers.set(frameIndex, {
        frameIndex,
        id,
        labels: [label],
      });
    };

    qaPresets.forEach((preset) => {
      if (preset.frameIndex === null) return;
      addMarker(preset.frameIndex, `preset:${preset.id}`, preset.label);
    });
    analysisHotspots.forEach((hotspot) => {
      addMarker(hotspot.frameIndex, `hotspot:${hotspot.id}`, hotspot.label);
    });

    return [...markers.values()].sort((a, b) => a.frameIndex - b.frameIndex);
  })();

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
    onDebugFrameRouteChange?.(clampedFrameIndex);
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
      onDebugFrameRouteChange?.(0);
      setFrameIndex(0);
      if (frameInputRef.current) {
        frameInputRef.current.value = "1";
      }
    }

    onPlayingChange(true);
  };

  const jumpToAdjacentMarker = (direction: "next" | "previous") => {
    if (markerFrames.length === 0) return;
    const target = direction === "next"
      ? markerFrames.find((marker) => marker.frameIndex > frameIndex) ?? markerFrames[0]
      : [...markerFrames].reverse().find((marker) => marker.frameIndex < frameIndex) ?? markerFrames.at(-1);

    if (!target) return;
    jumpToFrame(target.frameIndex);
  };

  const formatPeak = (
    frame: MovementInstructorRetargetAnalysis["peakSquat"],
    score: (frame: NonNullable<MovementInstructorRetargetAnalysis["peakSquat"]>) => number,
  ) => {
    if (!frame) return "waiting";
    return `F${frame.frameIndex + 1} ${score(frame).toFixed(2)}`;
  };
  const formatPresetCases = (preset: MovementDebugQaPreset) => preset.cases.join(" / ");

  return (
    <div className={`pointer-events-auto absolute left-1/2 top-32 z-[60] w-[34rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-[${MOVEMENT_MINT}]/25 bg-black/70 p-3 text-[#edf7f0] shadow-2xl backdrop-blur-2xl`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={`text-[10px] font-black uppercase tracking-[0.18em] text-[${MOVEMENT_MINT}]`}>
            Debug Scrub
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-white/60">
            <span>Frame</span>
            {/* The word "Frame" sits beside it, so the name is kept for a screen
                reader and not repeated. The overlay has its own dark styling,
                which is why so much of the house field is overridden here. */}
            <Field
              label="Debug frame number"
              labelHidden
              className={`h-7 w-20 rounded-lg border-white/10 bg-white/10 px-2 text-center font-mono text-[13px] text-white transition focus:border-[${MOVEMENT_MINT}]/60`}
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
              inputRef={frameInputRef}
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
            className={`grid h-10 w-10 place-items-center rounded-full bg-[${MOVEMENT_CREAM}] text-[#121016] transition hover:bg-white`}
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
          <div className="mx-1 h-7 w-px bg-white/10" />
          <button
            type="button"
            aria-label="Previous debug marker"
            className={`grid h-9 w-9 place-items-center rounded-full border border-[${MOVEMENT_MINT}]/20 bg-[${MOVEMENT_MINT}]/10 text-[#effff4] transition hover:bg-[${MOVEMENT_MINT}]/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/25`}
            disabled={markerFrames.length === 0}
            onClick={() => jumpToAdjacentMarker("previous")}
            title="Previous QA preset or analysis hotspot"
          >
            <Bookmark className="h-4 w-4 -scale-x-100" />
          </button>
          <button
            type="button"
            aria-label="Next debug marker"
            className={`grid h-9 w-9 place-items-center rounded-full border border-[${MOVEMENT_MINT}]/20 bg-[${MOVEMENT_MINT}]/10 text-[#effff4] transition hover:bg-[${MOVEMENT_MINT}]/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/25`}
            disabled={markerFrames.length === 0}
            onClick={() => jumpToAdjacentMarker("next")}
            title="Next QA preset or analysis hotspot"
          >
            <Bookmark className="h-4 w-4" />
          </button>
        </div>
      </div>

      <input
        aria-label="Movement debug frame"
        className={`mt-3 h-2 w-full cursor-pointer accent-[${MOVEMENT_MINT}]`}
        max={maxFrameIndex}
        min={0}
        onChange={(event) => jumpToFrame(Number(event.target.value))}
        type="range"
        value={Math.min(frameIndex, maxFrameIndex)}
      />

      {markerFrames.length > 0 ? (
        <div className="relative mt-2 h-5" aria-label="Debug marker rail">
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
          {markerFrames.map((marker) => {
            const leftPercent = maxFrameIndex <= 0
              ? 0
              : (marker.frameIndex / maxFrameIndex) * 100;
            const isActive = marker.frameIndex === frameIndex;
            const label = marker.labels.join(" / ");

            return (
              <button
                aria-label={`Jump to ${label} debug marker at frame ${marker.frameIndex + 1}`}
                className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border transition ${
                  isActive
                    ? `border-[#effff4] bg-[${MOVEMENT_MINT}] shadow-[0_0_0_4px_rgba(168,213,186,0.18)]`
                    : `border-[${MOVEMENT_MINT}]/45 bg-black/80 hover:bg-[${MOVEMENT_MINT}]/45`
                }`}
                key={marker.id}
                onClick={() => jumpToFrame(marker.frameIndex)}
                style={{ left: `${leftPercent}%` }}
                title={`${label} F${marker.frameIndex + 1}`}
                type="button"
              />
            );
          })}
        </div>
      ) : null}

      {qaPresets.length > 0 ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className={`mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[${MOVEMENT_SALMON}]`}>
            QA Presets
          </div>
          <div className="flex flex-wrap gap-2">
            {qaPresets.map((preset) => {
              const frameLabel = preset.frameIndex === null
                ? "blocked"
                : `F${preset.frameIndex + 1}`;
              const label = `${preset.label} ${frameLabel}`;
              const isActive = preset.frameIndex === frameIndex;

              return (
                <button
                  aria-label={preset.frameIndex === null
                    ? `${preset.label} QA preset blocked: ${preset.detail}`
                    : `Jump to ${preset.label} QA preset at frame ${preset.frameIndex + 1}`}
                  className={`min-h-8 rounded-full border px-3 py-1 text-left font-mono text-[10px] font-black uppercase tracking-[0.08em] transition ${
                    preset.frameIndex === null
                      ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                      : isActive
                        ? `border-[${MOVEMENT_MINT}]/60 bg-[${MOVEMENT_MINT}]/20 text-[#effff4]`
                        : `border-[${MOVEMENT_SALMON}]/25 bg-[${MOVEMENT_SALMON}]/12 text-[#fff4ee] hover:bg-[${MOVEMENT_SALMON}]/20`
                  }`}
                  disabled={preset.frameIndex === null}
                  key={preset.id}
                  onClick={() => {
                    if (preset.frameIndex === null) return;
                    jumpToFrame(preset.frameIndex);
                  }}
                  title={preset.detail}
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
          {activePresets.length > 0 ? (
            <div className={`mt-3 rounded-lg border border-[${MOVEMENT_MINT}]/20 bg-[${MOVEMENT_MINT}]/10 p-2 font-mono text-[10px] text-white/70`}>
              <div className={`font-black uppercase tracking-[0.14em] text-[${MOVEMENT_MINT}]`}>
                Active Proof
              </div>
              {activePresets.map((preset) => (
                <div key={preset.id} className="mt-1">
                  <span className="text-white">{preset.label}</span>
                  <span className="text-white/45"> - {formatPresetCases(preset)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {analysisHotspots.length > 0 ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className={`mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[${MOVEMENT_MINT}]`}>
            Analysis Hotspots
          </div>
          <div className="flex flex-wrap gap-2">
            {analysisHotspots.map((hotspot) => {
              const isActive = hotspot.frameIndex === frameIndex;

              return (
                <button
                  aria-label={`Jump to ${hotspot.label} analysis hotspot at frame ${hotspot.frameIndex + 1}`}
                  className={`min-h-8 rounded-full border px-3 py-1 text-left font-mono text-[10px] font-black uppercase tracking-[0.08em] transition ${
                    isActive
                      ? `border-[${MOVEMENT_MINT}]/60 bg-[${MOVEMENT_MINT}]/20 text-[#effff4]`
                      : `border-[${MOVEMENT_MINT}]/25 bg-[${MOVEMENT_MINT}]/10 text-[#effff4] hover:bg-[${MOVEMENT_MINT}]/18`
                  }`}
                  key={hotspot.id}
                  onClick={() => jumpToFrame(hotspot.frameIndex)}
                  title={hotspot.detail}
                  type="button"
                >
                  {hotspot.label} F{hotspot.frameIndex + 1} {hotspot.metric}
                </button>
              );
            })}
          </div>
          {activeHotspots.length > 0 ? (
            <div className={`mt-3 rounded-lg border border-[${MOVEMENT_MINT}]/20 bg-[${MOVEMENT_MINT}]/10 p-2 font-mono text-[10px] text-white/70`}>
              <div className={`font-black uppercase tracking-[0.14em] text-[${MOVEMENT_MINT}]`}>
                Active Hotspot
              </div>
              {activeHotspots.map((hotspot) => (
                <div key={hotspot.id} className="mt-1">
                  <span className="text-white">{hotspot.label}</span>
                  <span className="text-white/45"> - {hotspot.metric}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {recordingAnalysis ? (
        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/10 pt-3 font-mono text-[10px] text-white/60">
          <div>
            <div className={`font-black uppercase tracking-[0.14em] text-[${MOVEMENT_MINT}]`}>
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
            <div className={`font-black uppercase tracking-[0.14em] text-[${MOVEMENT_MINT}]`}>
              Left Knee
            </div>
            <div>{formatPeak(recordingAnalysis.peakLeftKneeLift, (frame) => frame.leftKneeLift)}</div>
          </div>
          <div>
            <div className={`font-black uppercase tracking-[0.14em] text-[${MOVEMENT_MINT}]`}>
              Right Knee
            </div>
            <div>{formatPeak(recordingAnalysis.peakRightKneeLift, (frame) => frame.rightKneeLift)}</div>
          </div>
          <div>
            <div className={`font-black uppercase tracking-[0.14em] text-[${MOVEMENT_MINT}]`}>
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
