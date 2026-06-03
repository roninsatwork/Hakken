import type {
  MovementDataFormat,
  MovementFrame,
  MovementFrameEnvelope,
  MovementFrameParseResult,
  MovementLandmark,
} from "./movementTypes";

const DEFAULT_CAPTURE_FPS = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLandmark(value: unknown): value is MovementLandmark {
  if (!isRecord(value)) return false;
  return typeof value.x === "number" && typeof value.y === "number";
}

function isLandmarkArray(value: unknown): value is MovementLandmark[] {
  return Array.isArray(value) && value.every(isLandmark);
}

export function isInlinePoseData(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("{");
}

export function getFrameLandmarks(frame: MovementFrame | undefined): MovementLandmark[] {
  if (!frame) return [];
  if (Array.isArray(frame)) return frame.filter(isLandmark);

  if (isLandmarkArray(frame.landmarks)) return frame.landmarks;
  if (isLandmarkArray(frame.pose)) return frame.pose;

  return [];
}

export function parseMovementFramePayload(
  input: unknown,
  sourceFormat: MovementDataFormat
): MovementFrameParseResult {
  const parsed = typeof input === "string" ? JSON.parse(input) as unknown : input;

  if (Array.isArray(parsed)) {
    return {
      frames: parsed as MovementFrame[],
      format: sourceFormat,
      fps: DEFAULT_CAPTURE_FPS,
    };
  }

  if (isRecord(parsed) && Array.isArray(parsed.frames)) {
    const envelope = parsed as MovementFrameEnvelope;

    return {
      frames: envelope.frames,
      format: envelope.schemaVersion === 1 ? "storage-json-v1" : sourceFormat,
      fps: typeof envelope.fps === "number" && envelope.fps > 0 ? envelope.fps : DEFAULT_CAPTURE_FPS,
      schemaVersion: typeof envelope.schemaVersion === "number" ? envelope.schemaVersion : undefined,
    };
  }

  throw new Error("Movement pose payload must be a frame array or versioned frame envelope.");
}

export function buildMovementFrameEnvelope(frames: MovementFrame[], fps = DEFAULT_CAPTURE_FPS): MovementFrameEnvelope {
  return {
    schemaVersion: 1,
    capturedAt: Date.now(),
    fps,
    frames,
  };
}
