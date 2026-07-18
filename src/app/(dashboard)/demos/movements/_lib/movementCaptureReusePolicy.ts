import { movementBoundaryChecksum } from "./movementBoundaryChecksum";
import { buildMovementDeepCaptureProfile } from "./movementFrameCodec";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "./movementPlayerInputContract";

export const MOVEMENT_CAPTURE_REUSE_POLICY = {
  id: "movement-capture-reuse-policy-v1",
  ignoredChangeClasses: [
    "proof-harness",
    "renderer",
    "shared-motion-runtime",
    "solver",
  ],
  invalidatingChangeClasses: [
    "physical-camera",
    "detector-model-or-options",
    "acquisition-preparation-or-filters",
    "dense-body-model",
    "hand-face-refinement-policy",
    "setup-or-calibration-policy",
  ],
} as const;

type DenseModelIdentity = { modelHash: string; modelId: string };

type CaptureReusePacket = {
  deepCaptureProfile?: unknown;
  frames?: unknown[];
  inputContract?: unknown;
  samples?: unknown[];
  schemaVersion?: number;
};

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function packetFrames(packet: CaptureReusePacket) {
  return Array.isArray(packet.frames)
    ? packet.frames
    : Array.isArray(packet.samples)
      ? packet.samples
      : [];
}

function frameCamera(frame: unknown) {
  return record(record(frame)?.camera);
}

function frameDeepCapture(frame: unknown) {
  const value = record(frame);
  return record(value?.deepCapture) ?? record(record(value?.tracking)?.deepCapture);
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.filter((value): value is string => (
    typeof value === "string" && value.length > 0
  )))];
}

export function evaluateMovementCaptureReuse({
  currentCameraFingerprint,
  currentDenseModel,
  packet,
}: {
  currentCameraFingerprint?: string | null;
  currentDenseModel?: DenseModelIdentity | null;
  packet: CaptureReusePacket;
}) {
  const captureInvalidators: string[] = [];
  const missingCurrentIdentity: string[] = [];
  const frames = packetFrames(packet);
  if (packet.schemaVersion !== 3) captureInvalidators.push("recording is not schema v3");

  const expectedInputChecksum = movementBoundaryChecksum(MOVEMENT_PLAYER_INPUT_CONTRACT);
  const packetInputChecksum = movementBoundaryChecksum(packet.inputContract ?? null);
  if (packetInputChecksum !== expectedInputChecksum) {
    captureInvalidators.push("detector options, acquisition filters, or setup policy changed");
  }

  const expectedDeepProfileChecksum = movementBoundaryChecksum(buildMovementDeepCaptureProfile());
  const packetDeepProfileChecksum = movementBoundaryChecksum(packet.deepCaptureProfile ?? null);
  if (packetDeepProfileChecksum !== expectedDeepProfileChecksum) {
    captureInvalidators.push("Deep Capture, hand/face refinement, or dense-adapter policy changed");
  }

  const cameraFingerprints = uniqueStrings(frames.map((frame) => (
    frameCamera(frame)?.deviceFingerprint
  )));
  if (cameraFingerprints.length !== 1) {
    captureInvalidators.push("recording has missing or inconsistent physical-camera identity");
  }
  if (!currentCameraFingerprint) {
    missingCurrentIdentity.push("current physical-camera fingerprint");
  } else if (cameraFingerprints.length === 1 && cameraFingerprints[0] !== currentCameraFingerprint) {
    captureInvalidators.push("physical camera changed");
  }

  const denseModels = uniqueStrings(frames.map((frame) => {
    const denseBody = record(frameDeepCapture(frame)?.denseBody);
    const modelId = denseBody?.modelId;
    const modelHash = denseBody?.modelHash;
    return typeof modelId === "string" && typeof modelHash === "string"
      ? `${modelId}\n${modelHash}`
      : null;
  }));
  if (denseModels.length !== 1) {
    captureInvalidators.push("recording has missing or inconsistent dense-model identity");
  }
  if (!currentDenseModel?.modelId || !currentDenseModel.modelHash) {
    missingCurrentIdentity.push("current selected dense-model id and SHA-256");
  } else {
    const expectedDenseIdentity = `${currentDenseModel.modelId}\n${currentDenseModel.modelHash}`;
    if (denseModels.length === 1 && denseModels[0] !== expectedDenseIdentity) {
      captureInvalidators.push("selected dense-body model changed");
    }
  }

  const decision = captureInvalidators.length > 0
    ? "new-live-capture-required"
    : missingCurrentIdentity.length > 0
      ? "cannot-determine"
      : "reuse-recording";
  return {
    captureInvalidators,
    current: {
      cameraFingerprint: currentCameraFingerprint ?? null,
      deepProfileChecksum: expectedDeepProfileChecksum,
      denseModel: currentDenseModel ?? null,
      inputContractChecksum: expectedInputChecksum,
    },
    decision,
    ignoredChangeClasses: [...MOVEMENT_CAPTURE_REUSE_POLICY.ignoredChangeClasses],
    missingCurrentIdentity,
    packet: {
      cameraFingerprints,
      deepProfileChecksum: packetDeepProfileChecksum,
      denseModels,
      frameCount: frames.length,
      inputContractChecksum: packetInputChecksum,
      schemaVersion: packet.schemaVersion ?? null,
    },
    policyId: MOVEMENT_CAPTURE_REUSE_POLICY.id,
    reusable: decision === "reuse-recording",
  };
}
