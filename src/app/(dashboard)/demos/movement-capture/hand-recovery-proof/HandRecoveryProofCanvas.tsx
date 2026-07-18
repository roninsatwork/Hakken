"use client";

import { useEffect, useRef } from "react";
import type { MovementLandmark } from "../../movements/_lib/movementTypes";
import {
  MOVEMENT_HAND_CONNECTIONS,
  drawMovementHandOverlay,
} from "../../movements/_lib/movementSkeleton";

export default function HandRecoveryProofCanvas({
  landmarks,
}: {
  landmarks: MovementLandmark[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#090910";
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawMovementHandOverlay(
      context,
      { left: { landmarks } },
      canvas.width,
      canvas.height,
    );
  }, [landmarks]);

  return (
    <canvas
      aria-label="Recovered 21-point left-hand overlay"
      className="h-auto w-full rounded-2xl border border-sky-300/25 bg-[#090910]"
      data-connection-count={MOVEMENT_HAND_CONNECTIONS.length}
      data-point-count={landmarks.length}
      data-testid="hand-recovery-overlay"
      height={600}
      ref={canvasRef}
      width={960}
    />
  );
}
