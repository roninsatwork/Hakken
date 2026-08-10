"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { drawMovementSkeleton } from "../_lib/movementSkeleton";
import { getFrameLandmarks } from "../_lib/movementFrameCodec";
import { buildMovementSpineModel } from "../_lib/movementSpineMetrics";
import type { MovementFrame } from "../_lib/movementTypes";
import {
  MOVEMENT_CREAM,
  MOVEMENT_INK,
  MOVEMENT_MINT,
  MOVEMENT_SALMON,
  MOVEMENT_SCENE_BG,
} from "../_lib/movementPalette";

type MovementFrameViewerProps = {
  frames: MovementFrame[];
  fps?: number;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  controls?: "scrubber" | "button";
};

export default function MovementFrameViewer({
  frames,
  fps = 30,
  isLoading,
  error,
  onRetry,
  controls = "scrubber",
}: MovementFrameViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

  const drawFrame = useCallback(
    (frameIndex: number) => {
      const canvas = canvasRef.current;
      const frameData = frames[frameIndex];
      if (!canvas || !frameData) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      drawMovementSkeleton(ctx, frameData, canvas.width, canvas.height);
    },
    [frames],
  );

  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;

    let animationFrameId: number;
    let lastDrawTime = performance.now();
    const fpsInterval = 1000 / fps;

    const renderLoop = (time: number) => {
      animationFrameId = requestAnimationFrame(renderLoop);

      const elapsed = time - lastDrawTime;
      if (elapsed <= fpsInterval) return;

      lastDrawTime = time - (elapsed % fpsInterval);
      setCurrentFrameIndex((previousFrameIndex) => {
        const nextFrameIndex =
          previousFrameIndex + 1 >= frames.length ? 0 : previousFrameIndex + 1;
        drawFrame(nextFrameIndex);
        return nextFrameIndex;
      });
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [drawFrame, fps, frames.length, isPlaying]);

  useEffect(() => {
    if (!isPlaying && frames.length > 0) {
      drawFrame(Math.min(currentFrameIndex, frames.length - 1));
    }
  }, [currentFrameIndex, drawFrame, frames.length, isPlaying]);

  const hasFrames = frames.length > 0;
  const safeFrameIndex = hasFrames ? Math.min(currentFrameIndex, frames.length - 1) : 0;
  const currentSpineModel = useMemo(() => {
    if (!hasFrames) return null;
    return buildMovementSpineModel(getFrameLandmarks(frames[safeFrameIndex]));
  }, [frames, hasFrames, safeFrameIndex]);
  const toggleLabel = isPlaying ? "Pause Visualizer" : "Play Sequence";

  return (
    <div className="flex flex-col gap-4">
      <div className={`relative w-full aspect-video bg-[${MOVEMENT_SCENE_BG}] border border-white/10 rounded-3xl overflow-hidden shadow-[0_30px_90px_rgba(246,204,190,0.08)]`}>
        {isLoading ? (
          <div className={`absolute inset-0 flex items-center justify-center text-[${MOVEMENT_SALMON}] animate-pulse font-medium tracking-wide`}>
            Preparing posture sequence...
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-400 font-medium px-6 text-center">
            <span>{error}</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-sm transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        ) : !hasFrames ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-400 font-medium">
            Routine preview unavailable
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}
      </div>

      {hasFrames && controls === "scrubber" && (
        <div className="flex items-center gap-4 bg-sidebar/50 border border-border-dim rounded-2xl p-4 backdrop-blur-md">
          <button
            onClick={() => setIsPlaying((playing) => !playing)}
            aria-label={isPlaying ? "Pause routine preview" : "Play routine preview"}
            className={`p-3 rounded-full bg-[${MOVEMENT_SALMON}] hover:bg-[${MOVEMENT_CREAM}] text-[${MOVEMENT_INK}] transition-colors shadow-[0_0_15px_rgba(246,204,190,0.35)] flex-shrink-0`}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
          </button>
          <input
            id="movement-scrubber"
            type="range"
            min="0"
            max={frames.length - 1}
            value={safeFrameIndex}
            onChange={(event) => {
              setIsPlaying(false);
              setCurrentFrameIndex(Number.parseInt(event.target.value, 10));
            }}
            className={`w-full accent-[${MOVEMENT_SALMON}]`}
          />
          <span className="text-xs text-muted-foreground font-mono min-w-[72px] text-right">
            {safeFrameIndex} / {frames.length}
          </span>
          {currentSpineModel && (
            <span className={`hidden min-w-[150px] text-right text-xs font-bold uppercase tracking-wide text-[${MOVEMENT_MINT}] sm:block`}>
              Spine {currentSpineModel.neutralStackScore}%
            </span>
          )}
        </div>
      )}

      {controls === "button" && (
        <button
          onClick={() => setIsPlaying((playing) => !playing)}
          disabled={isLoading || !hasFrames}
          className={`w-full bg-[${MOVEMENT_SALMON}] hover:bg-[${MOVEMENT_CREAM}] text-[${MOVEMENT_INK}] font-bold py-3 rounded-xl shadow-[0_0_15px_rgba(246,204,190,0.35)] transition-all disabled:opacity-50`}
        >
          {toggleLabel}
        </button>
      )}
    </div>
  );
}
