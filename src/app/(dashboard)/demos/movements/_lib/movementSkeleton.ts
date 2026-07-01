import type { MovementFrame, MovementLandmark } from "./movementTypes";
import { getFrameLandmarks } from "./movementFrameCodec";
import { buildMovementSpineModel, type MovementSpinePoint } from "./movementSpineMetrics";

export const MOVEMENT_POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30],
] as const;

function toCanvasPoint(point: MovementSpinePoint, width: number, height: number) {
  return {
    x: (1 - point.x) * width,
    y: point.y * height,
  };
}

function getSpineColor(score: number) {
  if (score >= 75) return "#a8d5ba";
  if (score >= 50) return "#f6ccbe";
  return "#f28b82";
}

export function drawMovementSpineGuide(
  ctx: CanvasRenderingContext2D,
  landmarks: MovementLandmark[],
  width: number,
  height: number,
) {
  const spine = buildMovementSpineModel(landmarks);
  if (!spine || spine.confidence < 0.25) return;

  const head = toCanvasPoint(spine.headCenter, width, height);
  const shoulders = toCanvasPoint(spine.shoulderCenter, width, height);
  const ribs = toCanvasPoint(spine.ribcageCenter, width, height);
  const pelvis = toCanvasPoint(spine.pelvisCenter, width, height);
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const spineColor = getSpineColor(spine.neutralStackScore);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = spineColor;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = spineColor;
  ctx.fillStyle = spineColor;
  ctx.globalAlpha = 0.92;

  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.quadraticCurveTo(shoulders.x, shoulders.y, ribs.x, ribs.y);
  ctx.quadraticCurveTo(ribs.x, ribs.y, pelvis.x, pelvis.y);
  ctx.stroke();

  ctx.shadowBlur = 10;
  ctx.lineWidth = 5;
  if (leftShoulder && rightShoulder) {
    ctx.beginPath();
    ctx.moveTo((1 - leftShoulder.x) * width, leftShoulder.y * height);
    ctx.lineTo((1 - rightShoulder.x) * width, rightShoulder.y * height);
    ctx.stroke();
  }
  if (leftHip && rightHip) {
    ctx.beginPath();
    ctx.moveTo((1 - leftHip.x) * width, leftHip.y * height);
    ctx.lineTo((1 - rightHip.x) * width, rightHip.y * height);
    ctx.stroke();
  }

  [head, shoulders, ribs, pelvis].forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, 2 * Math.PI);
    ctx.fill();
  });

  ctx.restore();
}

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

  drawMovementSpineGuide(ctx, landmarks, width, height);

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
