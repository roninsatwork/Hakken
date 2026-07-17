import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "./movementPlayerInputContract";
import type {
  MovementFrame,
  MovementFrameEnvelope,
  MovementRecordingChannelSummary,
} from "./movementTypes";

export const MOVEMENT_COMMISSIONING_REQUIRED_CHANNELS = [
  "blendshapes",
  "camera",
  "face",
  "hands",
  "pose",
  "worldPose",
] as const satisfies ReadonlyArray<keyof MovementRecordingChannelSummary>;

export type MovementCommissioningPacketReport = {
  failures: string[];
  passed: boolean;
};

function hasFrameReadiness(frame: MovementFrame) {
  return !Array.isArray(frame) && Boolean(frame.startReadiness);
}

export function validateMovementCommissioningEnvelope(
  envelope: MovementFrameEnvelope,
  options: { requireSourceHash?: boolean } = {},
): MovementCommissioningPacketReport {
  const failures: string[] = [];
  const frameCount = envelope.frames.length;
  const requireSourceHash = options.requireSourceHash ?? true;

  if (envelope.schemaVersion !== 2) {
    failures.push("Recording schema must be version 2.");
  }
  if (envelope.inputContract?.id !== MOVEMENT_PLAYER_INPUT_CONTRACT.id) {
    failures.push(`Input contract must be ${MOVEMENT_PLAYER_INPUT_CONTRACT.id}.`);
  }
  if (envelope.inputContract?.setup.id !== MOVEMENT_PLAYER_INPUT_CONTRACT.setup.id) {
    failures.push(`Setup policy must be ${MOVEMENT_PLAYER_INPUT_CONTRACT.setup.id}.`);
  }
  if (
    envelope.setupPrefix?.complete !== true ||
    envelope.setupPrefix.requiredFrameCount !== MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount ||
    envelope.setupPrefix.frameIndexes.length !== MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount
  ) {
    failures.push(
      `Capture the complete ${MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount}-frame setup prefix.`,
    );
  }
  if (!envelope.captureStartReadiness?.canStartRecording) {
    failures.push("Recording must start from a ready full-body setup.");
  }

  const readinessFrameCount = envelope.frames.filter(hasFrameReadiness).length;
  if (readinessFrameCount !== frameCount) {
    failures.push(
      `Readiness evidence is missing from ${frameCount - readinessFrameCount} recorded frame(s).`,
    );
  }

  for (const channel of MOVEMENT_COMMISSIONING_REQUIRED_CHANNELS) {
    const summary = envelope.channelSummary?.[channel];
    if (!summary || !Number.isInteger(summary.presentFrames) || summary.presentFrames <= 0) {
      failures.push(`${channel} channel evidence is missing.`);
      continue;
    }
    if (summary.totalFrames !== frameCount) {
      failures.push(`${channel} channel total does not match the recorded frame count.`);
    }
  }

  if (
    requireSourceHash &&
    !/^sha256:[a-f0-9]{64}$/.test(envelope.sourcePacketHash ?? "")
  ) {
    failures.push("Source packet SHA-256 identity is missing.");
  }

  return {
    failures,
    passed: failures.length === 0,
  };
}
