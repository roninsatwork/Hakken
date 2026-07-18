import type {
  MovementDataFormat,
  MovementFrame,
  MovementFrameEnvelope,
  MovementFrameParseResult,
  MovementLandmark,
  MovementRecordingChannelSummary,
} from "./movementTypes";
import type { MovementStartReadiness } from "./movementSourceFrame";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "./movementPlayerInputContract";
import {
  MOVEMENT_DEEP_CAPTURE_PROFILE,
  type MovementDeepCaptureChannelSummary,
} from "./movementDeepCaptureContract";
import { MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE } from "./movementDeepCaptureRefinement";
import { MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE } from "./movementDenseCapture";

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

export function isMovementStartReadiness(value: unknown): value is MovementStartReadiness {
  return (
    isRecord(value) &&
    typeof value.state === "string" &&
    typeof value.canStartRecording === "boolean" &&
    typeof value.canStartGame === "boolean" &&
    Array.isArray(value.requiredBodyParts) &&
    Array.isArray(value.visibleBodyParts)
  );
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
      format: envelope.schemaVersion === 3
        ? "storage-json-v3"
        : envelope.schemaVersion === 2
          ? "storage-json-v2"
        : envelope.schemaVersion === 1
          ? "storage-json-v1"
          : sourceFormat,
      fps: typeof envelope.fps === "number" && envelope.fps > 0 ? envelope.fps : DEFAULT_CAPTURE_FPS,
      captureStartReadiness: isMovementStartReadiness(envelope.captureStartReadiness)
        ? envelope.captureStartReadiness
        : undefined,
      channelSummary: envelope.channelSummary,
      deepCaptureChannelSummary: envelope.deepCaptureChannelSummary,
      deepCaptureProfile: envelope.deepCaptureProfile,
      inputContract: envelope.inputContract,
      schemaVersion: typeof envelope.schemaVersion === "number" ? envelope.schemaVersion : undefined,
      setupPrefix: envelope.setupPrefix,
      sourcePacketHash: typeof envelope.sourcePacketHash === "string"
        ? envelope.sourcePacketHash
        : undefined,
    };
  }

  throw new Error("Movement pose payload must be a frame array or versioned frame envelope.");
}

function isFramePayload(frame: MovementFrame): frame is Exclude<MovementFrame, MovementLandmark[]> {
  return !Array.isArray(frame) && isRecord(frame);
}

function stripDeepCaptureEvidence(frame: MovementFrame): MovementFrame {
  if (!isFramePayload(frame)) return frame;
  const legacyFrame = { ...frame };
  delete legacyFrame.deepCapture;
  return legacyFrame;
}

export function summarizeMovementRecordingChannels(
  frames: MovementFrame[],
): MovementRecordingChannelSummary {
  const totalFrames = frames.length;
  const count = (predicate: (frame: Exclude<MovementFrame, MovementLandmark[]>) => boolean) => (
    frames.filter((frame) => isFramePayload(frame) && predicate(frame)).length
  );
  const channel = (presentFrames: number) => ({
    complete: totalFrames > 0 && presentFrames === totalFrames,
    presentFrames,
    totalFrames,
  });

  return {
    blendshapes: channel(count((frame) => Array.isArray(frame.blendshapes))),
    camera: channel(count((frame) => Boolean(frame.camera))),
    face: channel(count((frame) => Array.isArray(frame.faceLandmarks))),
    hands: channel(count((frame) => Boolean(frame.hands?.left || frame.hands?.right))),
    pose: channel(frames.filter((frame) => getFrameLandmarks(frame).length >= 33).length),
    worldPose: channel(count((frame) => (frame.worldLandmarks?.length ?? 0) >= 33)),
  };
}

export function summarizeMovementDeepCaptureChannels(
  frames: MovementFrame[],
): MovementDeepCaptureChannelSummary {
  const totalFrames = frames.length;
  const count = (predicate: (frame: Exclude<MovementFrame, MovementLandmark[]>) => boolean) => (
    frames.filter((frame) => isFramePayload(frame) && predicate(frame)).length
  );
  const channel = (
    presentFrames: number,
    { minimumFrames, minimumRatio }: { minimumFrames: number; minimumRatio: number },
  ) => ({
    // Natural whole-body movement necessarily creates temporary face/hand
    // occlusion. "Complete" means the recording contains enough measured
    // evidence to prove that channel, while every source frame still remains
    // in the packet and claimed evidence is validated independently.
    complete: totalFrames > 0 && presentFrames >= Math.min(
      totalFrames,
      Math.max(minimumFrames, Math.ceil(totalFrames * minimumRatio)),
    ),
    presentFrames,
    totalFrames,
  });
  const handCoverage = { minimumFrames: 15, minimumRatio: 0.1 };
  const faceCoverage = { minimumFrames: 30, minimumRatio: 0.5 };
  const bodyCoverage = { minimumFrames: 30, minimumRatio: 0.8 };
  const hasGazeVector = (frame: Exclude<MovementFrame, MovementLandmark[]>) => {
    const gaze = frame.deepCapture?.face?.gaze;
    return Boolean(gaze?.left || gaze?.right || gaze?.fused);
  };

  return {
    leftHand: channel(count((frame) => (
      (frame.hands?.left?.landmarks.length ?? 0) >= 21 && Boolean(frame.deepCapture?.hands?.left)
    )), handCoverage),
    rightHand: channel(count((frame) => (
      (frame.hands?.right?.landmarks.length ?? 0) >= 21 && Boolean(frame.deepCapture?.hands?.right)
    )), handCoverage),
    palmWrist: channel(count((frame) => {
      const hands = frame.deepCapture?.hands;
      return [hands?.left, hands?.right].every((hand) => (
        Boolean(hand?.orientation?.palmNormal) &&
        Boolean(hand?.orientation?.wristRotation) &&
        hand?.orientation?.facing !== "unknown"
      ));
    }), handCoverage),
    face: channel(count((frame) => (
      (frame.deepCapture?.face?.facialTransformationMatrix?.length ?? 0) === 16
    )), faceCoverage),
    eyesGaze: channel(count(hasGazeVector), faceCoverage),
    segmentation: channel(
      count((frame) => Boolean(frame.deepCapture?.denseBody?.segmentation)),
      bodyCoverage,
    ),
    denseBody: channel(count((frame) => (
      (frame.deepCapture?.denseBody?.anchors.length ?? 0) >=
      MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum
    )), bodyCoverage),
  };
}

export function buildMovementFrameEnvelope(
  frames: MovementFrame[],
  fps = DEFAULT_CAPTURE_FPS,
  options: {
    captureStartReadiness?: MovementStartReadiness | null;
  } = {},
): MovementFrameEnvelope {
  const { prefixFrameCount } = MOVEMENT_PLAYER_INPUT_CONTRACT.setup;
  return {
    schemaVersion: 2,
    capturedAt: Date.now(),
    captureStartReadiness: options.captureStartReadiness ?? undefined,
    channelSummary: summarizeMovementRecordingChannels(frames),
    fps,
    frames: frames.map(stripDeepCaptureEvidence),
    inputContract: {
      detector: { ...MOVEMENT_PLAYER_INPUT_CONTRACT.detector },
      filters: {
        hand: { ...MOVEMENT_PLAYER_INPUT_CONTRACT.filters.hand },
        pose: { ...MOVEMENT_PLAYER_INPUT_CONTRACT.filters.pose },
      },
      id: MOVEMENT_PLAYER_INPUT_CONTRACT.id,
      setup: { ...MOVEMENT_PLAYER_INPUT_CONTRACT.setup },
    },
    setupPrefix: {
      complete: frames.length >= prefixFrameCount,
      frameIndexes: Array.from(
        { length: Math.min(frames.length, prefixFrameCount) },
        (_, index) => index,
      ),
      requiredFrameCount: prefixFrameCount,
    },
  };
}

export function buildMovementDeepCaptureFrameEnvelope(
  frames: MovementFrame[],
  fps = DEFAULT_CAPTURE_FPS,
  options: {
    captureStartReadiness?: MovementStartReadiness | null;
  } = {},
): MovementFrameEnvelope {
  const baseEnvelope = buildMovementFrameEnvelope(frames, fps, options);

  return {
    ...baseEnvelope,
    deepCaptureChannelSummary: summarizeMovementDeepCaptureChannels(frames),
    deepCaptureProfile: buildMovementDeepCaptureProfile(),
    frames,
    schemaVersion: 3,
  };
}

export function buildMovementDeepCaptureProfile(): NonNullable<MovementFrameEnvelope["deepCaptureProfile"]> {
  return {
    anchorTarget: { ...MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget },
    channels: [...MOVEMENT_DEEP_CAPTURE_PROFILE.channels],
    denseAdapter: { ...MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE },
    id: MOVEMENT_DEEP_CAPTURE_PROFILE.id,
    privacy: { ...MOVEMENT_DEEP_CAPTURE_PROFILE.privacy },
    refinement: { ...MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE },
    schemaVersion: MOVEMENT_DEEP_CAPTURE_PROFILE.schemaVersion,
  };
}

export async function hashMovementFrameEnvelopeSource(
  envelope: MovementFrameEnvelope,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 recording packet hashing is unavailable in this browser.");
  }

  const sourcePacket = { ...envelope, sourcePacketHash: undefined };
  const encoded = new TextEncoder().encode(JSON.stringify(sourcePacket));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) => (
    byte.toString(16).padStart(2, "0")
  )).join("");

  return `sha256:${hexadecimal}`;
}
