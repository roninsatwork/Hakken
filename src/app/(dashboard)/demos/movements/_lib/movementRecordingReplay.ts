import { readMovementRecordingPacket } from "./movementRecordingPacketTransport";
import {
  getFrameLandmarks,
  parseMovementFramePayload,
} from "./movementFrameCodec";
import type {
  MovementDataFormat,
  MovementFrame,
  MovementFrameEnvelope,
  MovementLandmark,
  MovementRecordingChannelSummary,
} from "./movementTypes";
import type { MovementStartReadiness } from "./movementSourceFrame";
import type {
  MovementDebugReplayLandmark,
  MovementDebugReplayPoseBounds,
  MovementDebugReplaySession,
} from "./movementDebugReplay";

export type MovementReplayRecordingSource = {
  _id: string;
  captureFps?: number;
  createdAt?: number;
  durationMs?: number;
  frameCount?: number;
  poseData: string;
  poseDataFormat?: MovementDataFormat;
  poseDataUrl?: string | null;
  title?: string;
};

export type MovementReplayRecordingLoadResult = {
  format: MovementDataFormat;
  session: MovementDebugReplaySession;
};

type MovementReplaySessionBuildOptions = {
  captureStartReadiness?: MovementStartReadiness;
  channelSummary?: MovementRecordingChannelSummary;
  deepCaptureChannelSummary?: MovementFrameEnvelope["deepCaptureChannelSummary"];
  deepCaptureProfile?: MovementFrameEnvelope["deepCaptureProfile"];
  inputContract?: MovementFrameEnvelope["inputContract"];
  schemaVersion?: number;
  setupPrefix?: MovementFrameEnvelope["setupPrefix"];
  sourcePacketHash?: string;
};

function isFramePayload(frame: MovementFrame): frame is Exclude<MovementFrame, MovementLandmark[]> {
  return !Array.isArray(frame) && typeof frame === "object" && frame !== null;
}

function getWorldLandmarks(frame: MovementFrame): MovementLandmark[] {
  return isFramePayload(frame) && Array.isArray(frame.worldLandmarks) ? frame.worldLandmarks : [];
}

function getFramePayload(frame: MovementFrame) {
  return isFramePayload(frame) ? frame : null;
}

function getFrameTimestamp(frame: MovementFrame, fallback: number) {
  return isFramePayload(frame) && typeof frame.timestamp === "number" ? frame.timestamp : fallback;
}

function toReplayLandmarks(landmarks: MovementLandmark[]): MovementDebugReplayLandmark[] {
  return landmarks
    .filter((landmark) => Number.isFinite(landmark.x) && Number.isFinite(landmark.y))
    .map((landmark) => ({
      visibility: typeof landmark.visibility === "number" ? landmark.visibility : undefined,
      x: landmark.x,
      y: landmark.y,
      z: typeof landmark.z === "number" ? landmark.z : undefined,
    }));
}

function buildPoseBounds(landmarks: MovementDebugReplayLandmark[]): MovementDebugReplayPoseBounds | undefined {
  if (landmarks.length === 0) return undefined;

  const xs = landmarks.map((landmark) => landmark.x);
  const ys = landmarks.map((landmark) => landmark.y);

  return {
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    outOfFrameCount: landmarks.filter((landmark) => (
      landmark.x < 0 ||
      landmark.x > 1 ||
      landmark.y < 0 ||
      landmark.y > 1
    )).length,
  };
}

export function buildMovementReplaySessionFromRecording(
  recording: MovementReplayRecordingSource,
  frames: MovementFrame[],
  fps = 30,
  options: MovementReplaySessionBuildOptions = {},
): MovementDebugReplaySession {
  const startedAt = recording.createdAt ?? Date.now();
  const frameDurationMs = 1000 / Math.max(fps, 1);
  const samples = frames.map((frame, frameIndex) => {
    const pose = toReplayLandmarks(getFrameLandmarks(frame));
    const worldPose = toReplayLandmarks(getWorldLandmarks(frame));
    const capturedAt = startedAt + getFrameTimestamp(frame, frameIndex * frameDurationMs);

    return {
      acquisitionProfileId: getFramePayload(frame)?.acquisitionProfileId,
      bodyConfidence: {},
      camera: getFramePayload(frame)?.camera
        ? {
            deviceFingerprint: getFramePayload(frame)?.camera?.deviceFingerprint,
            trackHeight: getFramePayload(frame)?.camera?.frameHeight,
            trackWidth: getFramePayload(frame)?.camera?.frameWidth,
            videoHeight: getFramePayload(frame)?.camera?.frameHeight,
            videoWidth: getFramePayload(frame)?.camera?.frameWidth,
          }
        : undefined,
      capturedAt,
      fallbacks: {
        lowerBody: "recorded",
        owners: "head recorded; torso recorded; lower recorded; feet recorded",
      },
      health: {
        primaryAction: "recorded movement",
      },
      poseBounds: buildPoseBounds(pose),
      startReadiness: getFramePayload(frame)?.startReadiness,
      tracking: {
        blendshapes: getFramePayload(frame)?.blendshapes as MovementDebugReplaySession["samples"][number]["tracking"]["blendshapes"],
        deepCapture: getFramePayload(frame)?.deepCapture,
        face: getFramePayload(frame)?.faceLandmarks
          ? toReplayLandmarks(getFramePayload(frame)?.faceLandmarks ?? [])
          : undefined,
        hands: Object.fromEntries(
          (["left", "right"] as const).map((side) => {
            const hand = getFramePayload(frame)?.hands?.[side];
            return [side, hand
              ? {
                  landmarks: toReplayLandmarks(hand.landmarks),
                  worldLandmarks: hand.worldLandmarks
                    ? toReplayLandmarks(hand.worldLandmarks)
                    : null,
                }
              : null];
          }),
        ),
        pose,
        worldPose,
      },
    };
  });
  const durationMs = recording.durationMs ?? (
    samples.length > 1
      ? Math.round((samples.length - 1) * frameDurationMs)
      : 0
  );

  return {
    baselineSummary: "saved movement recording",
    captureStartReadiness: options.captureStartReadiness,
    channelSummary: options.channelSummary,
    deepCaptureChannelSummary: options.deepCaptureChannelSummary,
    deepCaptureProfile: options.deepCaptureProfile,
    createdAt: recording.createdAt,
    durationMs,
    endedAt: startedAt + durationMs,
    fps,
    id: recording._id,
    inputContract: options.inputContract,
    movementId: recording._id,
    sampleCount: samples.length,
    samples,
    schemaVersion: options.schemaVersion,
    setupPrefix: options.setupPrefix,
    sourcePacketHash: options.sourcePacketHash,
    startedAt,
    trigger: "saved-movement-recording",
    warningSummary: recording.title ?? "saved movement recording",
  };
}

export async function loadMovementReplayRecording(
  recording: MovementReplayRecordingSource,
): Promise<MovementReplayRecordingLoadResult> {
  const payload = recording.poseDataUrl
    ? await fetch(recording.poseDataUrl).then((response) => {
      if (!response.ok) throw new Error(`Could not load pose data (${response.status}).`);
      return readMovementRecordingPacket(response);
    })
    : recording.poseData;
  const sourceFormat = recording.poseDataFormat ?? (recording.poseDataUrl ? "legacy-storage-json" : "legacy-inline-json");
  const parsed = parseMovementFramePayload(payload, sourceFormat);

  return {
    format: parsed.format,
    session: buildMovementReplaySessionFromRecording(
      recording,
      parsed.frames,
      recording.captureFps ?? parsed.fps,
      {
        captureStartReadiness: parsed.captureStartReadiness,
        channelSummary: parsed.channelSummary,
        deepCaptureChannelSummary: parsed.deepCaptureChannelSummary,
        deepCaptureProfile: parsed.deepCaptureProfile,
        inputContract: parsed.inputContract,
        schemaVersion: parsed.schemaVersion,
        setupPrefix: parsed.setupPrefix,
        sourcePacketHash: parsed.sourcePacketHash,
      },
    ),
  };
}
