import type { MovementFrame, MovementLandmark } from "./movementTypes";
import { getFrameLandmarks } from "./movementFrameCodec";

export const MOVEMENT_POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30],
] as const;

export function drawMovementSkeleton(
  ctx: CanvasRenderingContext2D,
  frameOrLandmarks: MovementFrame | MovementLandmark[] | null | undefined,
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);

  const landmarks = Array.isArray(frameOrLandmarks)
    ? frameOrLandmarks
    : getFrameLandmarks(frameOrLandmarks ?? undefined);

  if (landmarks.length === 0) return;

  ctx.strokeStyle = "#0ff";
  ctx.lineWidth = 4;
  ctx.shadowColor = "#0ff";
  ctx.shadowBlur = 15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  MOVEMENT_POSE_CONNECTIONS.forEach(([start, end]) => {
    const p1 = landmarks[start];
    const p2 = landmarks[end];
    if (p1 && p2 && (p1.visibility ?? 0) > 0.5 && (p2.visibility ?? 0) > 0.5) {
      ctx.moveTo((1 - p1.x) * width, p1.y * height);
      ctx.lineTo((1 - p2.x) * width, p2.y * height);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#f0f";
  ctx.shadowColor = "#f0f";
  landmarks.forEach((landmark) => {
    if ((landmark.visibility ?? 0) > 0.5) {
      ctx.beginPath();
      ctx.arc((1 - landmark.x) * width, landmark.y * height, 6, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
}
