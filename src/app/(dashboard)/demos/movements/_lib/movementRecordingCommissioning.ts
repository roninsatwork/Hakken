import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "./movementPlayerInputContract";
import {
  MOVEMENT_DEEP_CAPTURE_PROFILE,
  type MovementDeepCaptureChannelSummary,
} from "./movementDeepCaptureContract";
import {
  MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE,
  validateMovementDenseCaptureMeasurement,
} from "./movementDenseCapture";
import { validateMovementDenseCaptureFusion } from "./movementDenseCaptureFusion";
import {
  buildMovementDeepCaptureProfile,
  summarizeMovementDeepCaptureChannels,
} from "./movementFrameCodec";
import { movementBoundaryChecksum } from "./movementBoundaryChecksum";
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

export const MOVEMENT_DEEP_CAPTURE_REQUIRED_CHANNELS = [
  "leftHand",
  "rightHand",
  "palmWrist",
  "face",
  "eyesGaze",
  "segmentation",
  "denseBody",
] as const satisfies ReadonlyArray<keyof MovementDeepCaptureChannelSummary>;

export type MovementCommissioningPacketReport = {
  failures: string[];
  passed: boolean;
};

function hasFrameReadiness(frame: MovementFrame) {
  return !Array.isArray(frame) && Boolean(frame.startReadiness);
}

function validateMovementCommissioningCore(
  envelope: MovementFrameEnvelope,
  options: { expectedSchemaVersion: 2 | 3; requireSourceHash?: boolean },
): MovementCommissioningPacketReport {
  const failures: string[] = [];
  const frameCount = envelope.frames.length;
  const requireSourceHash = options.requireSourceHash ?? true;

  if (envelope.schemaVersion !== options.expectedSchemaVersion) {
    failures.push(`Recording schema must be version ${options.expectedSchemaVersion}.`);
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
    failures.push("Recording must start from trustworthy pose acquisition evidence.");
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

export function validateMovementCommissioningEnvelope(
  envelope: MovementFrameEnvelope,
  options: { requireSourceHash?: boolean } = {},
): MovementCommissioningPacketReport {
  return validateMovementCommissioningCore(envelope, {
    expectedSchemaVersion: 2,
    requireSourceHash: options.requireSourceHash,
  });
}

export function validateMovementDeepCaptureEnvelope(
  envelope: MovementFrameEnvelope,
  options: { requireSourceHash?: boolean } = {},
): MovementCommissioningPacketReport {
  const baseReport = validateMovementCommissioningCore(envelope, {
    expectedSchemaVersion: 3,
    requireSourceHash: options.requireSourceHash,
  });
  const failures = [...baseReport.failures];
  let cameraDeviceFingerprint: string | null = null;
  const measuredChannelSummary = summarizeMovementDeepCaptureChannels(envelope.frames);

  if (envelope.deepCaptureProfile?.id !== MOVEMENT_DEEP_CAPTURE_PROFILE.id) {
    failures.push(`Deep Capture profile must be ${MOVEMENT_DEEP_CAPTURE_PROFILE.id}.`);
  }
  if (envelope.deepCaptureProfile?.privacy.persistRawRgbByDefault !== false) {
    failures.push("Deep Capture must not persist raw RGB by default.");
  }
  if (envelope.deepCaptureProfile?.privacy.persistRawVideoByDefault !== false) {
    failures.push("Deep Capture must not persist raw video by default.");
  }
  if (
    movementBoundaryChecksum(envelope.deepCaptureProfile ?? null) !==
    movementBoundaryChecksum(buildMovementDeepCaptureProfile())
  ) {
    failures.push("Deep Capture acquisition, refinement, or dense-adapter profile is stale.");
  }

  for (const channel of MOVEMENT_DEEP_CAPTURE_REQUIRED_CHANNELS) {
    const summary = envelope.deepCaptureChannelSummary?.[channel];
    const measured = measuredChannelSummary[channel];
    if (!summary || !measured.complete || summary.complete !== measured.complete) {
      failures.push(`${channel} Deep Capture evidence is incomplete.`);
      continue;
    }
    if (
      summary.presentFrames !== measured.presentFrames ||
      summary.totalFrames !== measured.totalFrames
    ) {
      failures.push(`${channel} Deep Capture frame accounting does not match the packet.`);
    }
  }

  envelope.frames.forEach((frame, index) => {
    if (Array.isArray(frame)) {
      failures.push(`Frame ${index} is legacy pose data, not a Deep Capture frame.`);
      return;
    }
    if (frame.acquisitionProfileId !== MOVEMENT_DEEP_CAPTURE_PROFILE.id) {
      failures.push(`Frame ${index} has the wrong Deep Capture acquisition profile.`);
    }
    if (frame.deepCapture?.profileId !== MOVEMENT_DEEP_CAPTURE_PROFILE.id) {
      failures.push(`Frame ${index} is missing Deep Capture profile evidence.`);
    }
    if (!/^fnv1a32:[a-f0-9]{8}$/.test(frame.camera?.deviceFingerprint ?? "")) {
      failures.push(`Frame ${index} is missing an opaque physical-camera fingerprint.`);
    } else if (cameraDeviceFingerprint === null) {
      cameraDeviceFingerprint = frame.camera?.deviceFingerprint ?? null;
    } else if (frame.camera?.deviceFingerprint !== cameraDeviceFingerprint) {
      failures.push(`Frame ${index} changes physical-camera identity within the packet.`);
    }

    const denseBody = frame.deepCapture?.denseBody;
    if (denseBody) {
      const anchors = denseBody.anchors;
      const denseReport = validateMovementDenseCaptureMeasurement({
        adapter: denseBody.adapter ?? {
          inferenceDurationMs: -1,
          inputHeight: 0,
          inputWidth: 0,
          profileId: MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE.id,
          qualityTier: "low",
          runtime: "wasm",
          targetIntervalMs: 300,
        },
        anchors,
        modelHash: denseBody.modelHash,
        modelId: denseBody.modelId,
      });
      if (!denseReport.passed || denseBody.adapter?.profileId !== MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE.id) {
        failures.push(`Frame ${index} dense-body adapter evidence is invalid: ${denseReport.failures.join(" ")}`);
      }
      const fusionReport = validateMovementDenseCaptureFusion(denseBody.fusion);
      if (!fusionReport.passed) {
        failures.push(`Frame ${index} dense-body fusion evidence is invalid: ${fusionReport.failures.join(" ")}`);
      }
      if (
        anchors.length < MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum ||
        anchors.length > MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.maximum
      ) {
        failures.push(
          `Frame ${index} must contain ${MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum}-${MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.maximum} dense-body anchors.`,
        );
      }
      if (new Set(anchors.map((anchor) => anchor.id)).size !== anchors.length) {
        failures.push(`Frame ${index} contains duplicate dense-body anchor ids.`);
      }
      if (!/^sha256:[a-f0-9]{64}$/.test(denseBody.modelHash)) {
        failures.push(`Frame ${index} is missing an immutable dense-model SHA-256 identity.`);
      }
      const segmentation = denseBody.segmentation;
      if (
        !segmentation ||
        segmentation.frameWidth <= 0 ||
        segmentation.frameHeight <= 0 ||
        segmentation.maskWidth <= 0 ||
        segmentation.maskHeight <= 0 ||
        !(
          Array.isArray(segmentation.payload) ||
          (typeof segmentation.payload === "string" && segmentation.payload.length > 0)
        )
      ) {
        failures.push(`Frame ${index} has invalid segmentation evidence.`);
      }
    }

    for (const side of ["left", "right"] as const) {
      const hand = frame.hands?.[side];
      const evidence = frame.deepCapture?.hands?.[side];
      if (!hand && !evidence) continue;
      if ((hand?.landmarks.length ?? 0) < 21 || (hand?.worldLandmarks?.length ?? 0) < 21) {
        failures.push(`Frame ${index} ${side} hand requires 21 image and world landmarks.`);
      }
      if (
        !evidence ||
        evidence.detectorHandedness.label === "Unknown" ||
        evidence.detectorHandedness.score <= 0 ||
        evidence.refinement?.profileId !== "movement-deep-capture-refinement-v1" ||
        Object.keys(evidence.fingerJointAngles ?? {}).length < 15 ||
        evidence.orientation?.provenance.origin !== "derived" ||
        !["observed", "temporally-carried", "reacquired"].includes(evidence.tracking?.state) ||
        (evidence.tracking?.state === "observed" && evidence.tracking.occluded)
      ) {
        failures.push(`Frame ${index} ${side} hand evidence is incomplete or ambiguous.`);
      }
    }

    const face = frame.deepCapture?.face;
    if (!face && !frame.faceLandmarks) return;
    if (
      (frame.faceLandmarks?.length ?? 0) < 478 ||
      face?.refinement?.profileId !== "movement-deep-capture-refinement-v1" ||
      (face?.facialTransformationMatrix?.length ?? 0) !== 16 ||
      (face?.irisLandmarkCount ?? 0) < 10 ||
      !face?.gaze.left ||
      !face.gaze.right ||
      !face.gaze.fused ||
      face.gaze.provenance.origin !== "derived" ||
      face.eyeVisibility?.left !== "visible" ||
      face.eyeVisibility?.right !== "visible" ||
      face.eyeVisibility?.eyewear !== "unknown" ||
      !["observed", "temporally-carried", "reacquired"].includes(face.tracking?.state) ||
      (face.tracking?.state === "observed" && face.tracking.occluded)
    ) {
      failures.push(`Frame ${index} face, iris, transform, or gaze evidence is incomplete.`);
    }
  });

  return {
    failures: Array.from(new Set(failures)),
    passed: failures.length === 0,
  };
}
