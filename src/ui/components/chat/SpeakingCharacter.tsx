"use client";

import { useEffect, useRef } from "react";
import type { VoiceSessionState } from "@/src/lib/voiceSession";

/**
 * The moving shape that represents sound — the voice session's whole face,
 * by owner decision (see docs/plans/active/voice-session-plan.md). It knows
 * only { state, level }: never chat state, threads, or audio internals, so
 * any future face can replace it behind the same two props.
 *
 * Drawn rather than animated with keyframes because `level` changes every
 * frame while sound plays and the movement must follow it. Three layers give
 * it depth: an outer halo that breathes with the voice, a soft filled body,
 * and a bright rim. The outline is built from three sine harmonics at
 * different speeds so it never repeats visibly — a single sine reads as a
 * wobbling circle, which is what made the first version look cheap.
 */
export function SpeakingCharacter({
  state,
  level,
  size = 320,
}: {
  state: VoiceSessionState;
  level: number;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(level);
  // Handed to the animation loop this way rather than written during render:
  // the loop is started once and reads whatever is current on each frame, so
  // it must not be torn down every time the level moves.
  useEffect(() => {
    stateRef.current = state;
    levelRef.current = level;
  }, [state, level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const styles = getComputedStyle(canvas);
    const brand = styles.getPropertyValue("--color-brand").trim() || "#ff5a1f";
    const muted = styles.getPropertyValue("--color-muted").trim() || "#9ca3af";

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    context.scale(dpr, dpr);

    const POINTS = 160;
    let smoothed = 0;
    let phase = 0;
    let frame = 0;

    // Colour with an explicit alpha, whatever form the token takes.
    const tint = (colour: string, alpha: number) => {
      const parsed = colour.trim();
      if (parsed.startsWith("#") && (parsed.length === 7 || parsed.length === 4)) {
        const hex =
          parsed.length === 4
            ? parsed
                .slice(1)
                .split("")
                .map((c) => c + c)
                .join("")
            : parsed.slice(1);
        const value = parseInt(hex, 16);
        return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
      }
      if (parsed.startsWith("rgb")) {
        const numbers = parsed.match(/[\d.]+/g) ?? [];
        return `rgba(${numbers[0] ?? 255}, ${numbers[1] ?? 90}, ${numbers[2] ?? 31}, ${alpha})`;
      }
      return parsed;
    };

    const outline = (radius: number, wobble: number, speeds: [number, number, number]) => {
      context.beginPath();
      for (let i = 0; i <= POINTS; i += 1) {
        const angle = (i / POINTS) * Math.PI * 2;
        const ripple =
          Math.sin(angle * 3 + phase * speeds[0]) * 0.6 +
          Math.sin(angle * 5 - phase * speeds[1]) * 0.3 +
          Math.sin(angle * 8 + phase * speeds[2]) * 0.1;
        const r = radius * (1 + ripple * wobble);
        const x = size / 2 + Math.cos(angle) * r;
        const y = size / 2 + Math.sin(angle) * r;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
    };

    const draw = () => {
      const current = stateRef.current;
      const target = current === "idle" ? 0 : levelRef.current;
      // Fast to rise, slow to fall: speech reads as movement, not flicker.
      smoothed += (target - smoothed) * (target > smoothed ? 0.35 : 0.06);

      phase += reducedMotion ? 0.004 : current === "thinking" ? 0.022 : 0.011;

      const centre = size / 2;
      const base = size * 0.24;
      // Idle sits calm and small; a voice pushes the body outward.
      const radius = base * (1 + smoothed * 0.16 + (current === "idle" ? 0 : 0.04));
      const wobble = reducedMotion
        ? 0.012
        : current === "thinking"
          ? 0.05
          : 0.022 + smoothed * 0.06;

      context.clearRect(0, 0, size, size);

      // Halo — widest and faintest, grows with the sound.
      const haloRadius = radius * (1.55 + smoothed * 0.5);
      const halo = context.createRadialGradient(centre, centre, radius * 0.6, centre, centre, haloRadius);
      halo.addColorStop(0, tint(brand, 0.16 + smoothed * 0.16));
      halo.addColorStop(0.55, tint(brand, 0.05));
      halo.addColorStop(1, tint(brand, 0));
      context.fillStyle = halo;
      context.beginPath();
      context.arc(centre, centre, haloRadius, 0, Math.PI * 2);
      context.fill();

      // Body — a lit sphere rather than a flat disc.
      outline(radius, wobble, [1.6, 1.1, 2.3]);
      const body = context.createRadialGradient(
        centre - radius * 0.32,
        centre - radius * 0.34,
        radius * 0.1,
        centre,
        centre,
        radius * 1.15
      );
      body.addColorStop(0, tint(brand, 0.5 + smoothed * 0.25));
      body.addColorStop(0.55, tint(brand, 0.2 + smoothed * 0.12));
      body.addColorStop(1, tint(brand, 0.07));
      context.fillStyle = body;
      context.fill();

      // Rim — bright while alive, quiet when idle.
      context.strokeStyle = current === "idle" ? tint(muted, 0.45) : tint(brand, 0.85);
      context.lineWidth = 1.5;
      context.shadowBlur = current === "idle" ? 0 : 18 + smoothed * 26;
      context.shadowColor = tint(brand, 0.6);
      context.stroke();
      context.shadowBlur = 0;

      // A second, looser ring trailing the first gives the surface depth
      // while listening and speaking; thinking keeps only the tight body so
      // the difference between states is legible across a room.
      if (current !== "thinking") {
        outline(radius * 1.12, wobble * 0.8, [1.1, 1.7, 1.4]);
        context.strokeStyle = tint(brand, 0.16 + smoothed * 0.2);
        context.lineWidth = 1;
        context.stroke();
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      role="img"
      aria-label={state}
    />
  );
}
