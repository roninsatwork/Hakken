"use client";

import { useEffect, useRef } from "react";
import type { VoiceSessionState } from "@/src/lib/voiceSession";

/**
 * The moving shape that represents sound — the voice session's whole face,
 * by owner decision (see docs/plans/active/voice-session-plan.md). It knows
 * only { state, level }: never chat state, threads, or audio internals, so
 * any future face can replace it behind the same two props.
 *
 * Canvas rather than CSS keyframes because `level` changes every animation
 * frame while sound plays, and the movement must follow it — a rendered ring
 * of points whose radius breathes with the live loudness. Colours come from
 * the theme tokens so the shape obeys the aesthetics screen like everything
 * else.
 */
export function SpeakingCharacter({
  state,
  level,
  size = 280,
}: {
  state: VoiceSessionState;
  level: number;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(level);
  stateRef.current = state;
  levelRef.current = level;

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

    const POINTS = 96;
    let smoothedLevel = 0;
    let phase = 0;
    let frame = 0;

    const draw = () => {
      const currentState = stateRef.current;
      // The level follows the sound fast on the way up and settles slowly on
      // the way down, so speech reads as movement rather than flicker.
      const target = currentState === "idle" ? 0 : levelRef.current;
      smoothedLevel += (target - smoothedLevel) * (target > smoothedLevel ? 0.4 : 0.08);

      const speed = reducedMotion
        ? 0.004
        : currentState === "thinking"
          ? 0.03
          : currentState === "speaking"
            ? 0.016
            : 0.008;
      phase += speed;

      const centre = size / 2;
      const baseRadius = size * 0.27;
      context.clearRect(0, 0, size, size);

      // Two rings: a quiet reference circle, and the live ring that carries
      // the sound. Listening ripples gently; thinking spins a soft asymmetry;
      // speaking pushes the ring outward with the voice.
      context.beginPath();
      context.arc(centre, centre, baseRadius, 0, Math.PI * 2);
      context.strokeStyle = muted;
      context.globalAlpha = 0.25;
      context.lineWidth = 1;
      context.stroke();
      context.globalAlpha = 1;

      context.beginPath();
      for (let i = 0; i <= POINTS; i += 1) {
        const angle = (i / POINTS) * Math.PI * 2;
        const wobble = reducedMotion
          ? Math.sin(phase * 2) * 0.01
          : currentState === "thinking"
            ? Math.sin(angle * 2 + phase * 5) * 0.035
            : Math.sin(angle * 5 + phase * 7) * (0.02 + smoothedLevel * 0.05);
        const push = smoothedLevel * 0.22;
        const radius = baseRadius * (1 + wobble + push);
        const x = centre + Math.cos(angle) * radius;
        const y = centre + Math.sin(angle) * radius;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.strokeStyle = brand;
      context.lineWidth = 2.5;
      context.stroke();
      context.fillStyle = brand;
      context.globalAlpha = 0.08 + smoothedLevel * 0.18;
      context.fill();
      context.globalAlpha = 1;

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
