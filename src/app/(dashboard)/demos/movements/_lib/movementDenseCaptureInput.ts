import { MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES } from "./movementDenseCaptureQuality";
import type { MovementDenseCaptureQualityTier } from "./movementDenseCaptureQuality";

export function resolveMovementDenseCaptureContainRect({
  inputHeight,
  inputWidth,
  sourceHeight,
  sourceWidth,
}: {
  inputHeight: number;
  inputWidth: number;
  sourceHeight: number;
  sourceWidth: number;
}) {
  if (inputHeight <= 0 || inputWidth <= 0 || sourceHeight <= 0 || sourceWidth <= 0) return null;
  const scale = Math.min(inputWidth / sourceWidth, inputHeight / sourceHeight);
  const height = sourceHeight * scale;
  const width = sourceWidth * scale;
  return {
    height,
    width,
    x: (inputWidth - width) / 2,
    y: (inputHeight - height) / 2,
  };
}

export function renderMovementDenseCaptureInput({
  canvas,
  qualityTier,
  video,
}: {
  canvas: HTMLCanvasElement;
  qualityTier: MovementDenseCaptureQualityTier;
  video: HTMLVideoElement;
}) {
  const { inputHeight, inputWidth } = MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[qualityTier];
  const rect = resolveMovementDenseCaptureContainRect({
    inputHeight,
    inputWidth,
    sourceHeight: video.videoHeight,
    sourceWidth: video.videoWidth,
  });
  if (!rect) return false;
  canvas.width = inputWidth;
  canvas.height = inputHeight;
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.fillStyle = "black";
  context.fillRect(0, 0, inputWidth, inputHeight);
  context.drawImage(
    video,
    0,
    0,
    video.videoWidth,
    video.videoHeight,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
  return true;
}
