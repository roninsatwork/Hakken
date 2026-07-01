import type { Id } from "@/convex/_generated/dataModel";
import { buildMovementFrameEnvelope } from "./movementFrameCodec";
import type {
  MovementBodyFocus,
  MovementDifficulty,
  MovementFrame,
  MovementSpineGoal,
} from "./movementTypes";

export const MIN_MOVEMENT_CAPTURE_FRAMES = 5;

type MovementCreateInput = {
  title: string;
  difficulty: MovementDifficulty;
  poseData: Id<"_storage">;
  poseStorageId: Id<"_storage">;
  poseDataFormat: "storage-json-v1";
  frameCount: number;
  durationMs: number;
  captureFps: number;
  schemaVersion: number;
  spineGoal?: MovementSpineGoal;
  primaryCue?: string;
  bodyFocus?: MovementBodyFocus[];
};

type SaveMovementRecordingInput = {
  title: string;
  difficulty: MovementDifficulty;
  spineGoal?: MovementSpineGoal;
  primaryCue?: string;
  bodyFocus?: MovementBodyFocus[];
  frames: MovementFrame[];
  generateUploadUrl: () => Promise<string>;
  createMovement: (input: MovementCreateInput) => Promise<unknown>;
  uploadFetch?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFrameTimestamp(frame: MovementFrame | undefined) {
  return isRecord(frame) && typeof frame.timestamp === "number" ? frame.timestamp : 0;
}

function parseStorageId(value: unknown): Id<"_storage"> {
  if (!isRecord(value) || typeof value.storageId !== "string" || value.storageId.trim().length === 0) {
    throw new Error("Upload did not return a storage id.");
  }

  return value.storageId as Id<"_storage">;
}

export function getMovementRecordingDurationMs(frames: MovementFrame[]) {
  if (frames.length === 0) return 0;

  const firstTimestamp = getFrameTimestamp(frames[0]);
  const lastTimestamp = getFrameTimestamp(frames[frames.length - 1]);

  return Math.max(0, lastTimestamp - firstTimestamp);
}

export async function saveMovementRecording({
  title,
  difficulty,
  spineGoal,
  primaryCue,
  bodyFocus,
  frames,
  generateUploadUrl,
  createMovement,
  uploadFetch = fetch,
}: SaveMovementRecordingInput) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Add a routine name before saving.");
  }

  if (frames.length < MIN_MOVEMENT_CAPTURE_FRAMES) {
    throw new Error(`Capture at least ${MIN_MOVEMENT_CAPTURE_FRAMES} valid frames before saving.`);
  }

  const payload = buildMovementFrameEnvelope(frames);
  const postUrl = await generateUploadUrl();
  const uploadResponse = await uploadFetch(postUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!uploadResponse.ok) {
    throw new Error("Movement upload failed. Please try saving again.");
  }

  const storageId = parseStorageId(await uploadResponse.json());
  const durationMs = getMovementRecordingDurationMs(frames);
  const trimmedCue = primaryCue?.trim();

  return await createMovement({
    title: trimmedTitle,
    difficulty,
    poseData: storageId,
    poseStorageId: storageId,
    poseDataFormat: "storage-json-v1",
    frameCount: frames.length,
    durationMs,
    captureFps: payload.fps ?? 30,
    schemaVersion: payload.schemaVersion ?? 1,
    spineGoal,
    primaryCue: trimmedCue || undefined,
    bodyFocus: bodyFocus && bodyFocus.length > 0 ? bodyFocus : undefined,
  });
}
