import { MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS } from "./movementDeepCaptureContract";
import { buildMovementDenseCaptureFusion } from "./movementDenseCaptureFusion";
import type { MovementStartReadiness } from "./movementSourceFrame";
import type { MovementFramePayload } from "./movementTypes";

const landmark = { visibility: 0.96, x: 0.5, y: 0.5, z: 0 };

export const DEEP_CAPTURE_TEST_READINESS: MovementStartReadiness = {
  blockedReasons: [],
  calibrationQuality: 0.94,
  canStartGame: true,
  canStartRecording: true,
  countdownMsRemaining: 0,
  promptEvents: [],
  requiredBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
  state: "ready",
  visibleBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
};

export function createCompleteDeepCaptureFrame(index: number): MovementFramePayload {
  const sourceTimestampMs = index * 33;
  const provenance = {
    ageMs: 0,
    confidence: 0.95,
    inferenceTimestampMs: sourceTimestampMs,
    origin: "model-estimated" as const,
    sourceTimestampMs,
  };
  const crop = {
    height: 256,
    sourceFrameHeight: 1080,
    sourceFrameWidth: 1920,
    width: 256,
    x: 320,
    y: 180,
  };
  const handEvidence = {
    assignment: "pose-wrist-reconciled" as const,
    crop,
    detectorHandedness: { label: "Left" as const, score: 0.98 },
    fingerJointAngles: Object.fromEntries(Array.from({ length: 15 }, (_, angleIndex) => [
      `joint-${angleIndex}`,
      { provenance: { ...provenance, origin: "derived" as const }, radians: 0.5 },
    ])),
    orientation: {
      facing: "palm-facing-camera" as const,
      palmNormal: { x: 0, y: 0, z: -1 },
      provenance: { ...provenance, origin: "derived" as const },
      wristRotation: { x: 0.1, y: 0.2, z: 0.3 },
    },
    provenance,
    refinement: {
      inferenceDurationMs: 8,
      inputHeight: 192,
      inputWidth: 192,
      profileId: "movement-deep-capture-refinement-v1" as const,
      source: "native-roi-second-pass" as const,
    },
    tracking: { occluded: false, state: "observed" as const },
  };

  const frame: MovementFramePayload = {
    acquisitionProfileId: "movement-deep-capture-v1",
    blendshapes: [{ categoryName: "eyeBlinkLeft", score: 0.5 }],
    camera: {
      deviceFingerprint: "fnv1a32:1234abcd",
      facingMode: "user",
      frameHeight: 1080,
      frameWidth: 1920,
    },
    capturedAt: sourceTimestampMs,
    deepCapture: {
      denseBody: {
        adapter: {
          inferenceDurationMs: 30,
          inputHeight: 360,
          inputWidth: 640,
          profileId: "movement-dense-capture-adapter-v1",
          qualityTier: "medium",
          runtime: "webgpu",
          targetIntervalMs: 180,
        },
        anchors: Array.from({ length: 200 }, (_, anchorIndex) => ({
          anatomicalSide: "midline" as const,
          depth: 0.2,
          id: `surface-${anchorIndex}`,
          image: { x: 0.5, y: 0.5 },
          normal: { x: 0, y: 0, z: 1 },
          occluded: false,
          provenance,
          region: MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS[
            anchorIndex % MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.length
          ],
          surface: "front" as const,
        })),
        modelHash: `sha256:${"b".repeat(64)}`,
        modelId: "dense-model-v1",
        segmentation: {
          confidence: 0.95,
          coverage: 0.5,
          encoding: "derived-contour",
          frameHeight: 1080,
          frameWidth: 1920,
          maskHeight: 256,
          maskWidth: 256,
          payload: [[0, 0], [1, 1]],
          provenance,
        },
      },
      face: {
        crop,
        eyeVisibility: { eyewear: "unknown", left: "visible", right: "visible" },
        facialTransformationMatrix: Array.from({ length: 16 }, (_, matrixIndex) => matrixIndex),
        gaze: {
          fused: { x: 0, y: 0, z: -1 },
          left: { x: -0.01, y: 0, z: -1 },
          provenance: { ...provenance, origin: "derived" },
          right: { x: 0.01, y: 0, z: -1 },
        },
        irisLandmarkCount: 10,
        provenance,
        refinement: {
          inferenceDurationMs: 10,
          inputHeight: 256,
          inputWidth: 256,
          profileId: "movement-deep-capture-refinement-v1",
          source: "native-roi-second-pass",
        },
        tracking: { occluded: false, state: "observed" },
      },
      hands: {
        left: handEvidence,
        right: {
          ...handEvidence,
          detectorHandedness: { label: "Right", score: 0.97 },
        },
      },
      profileId: "movement-deep-capture-v1",
    },
    faceLandmarks: Array.from({ length: 478 }, () => landmark),
    hands: {
      left: {
        landmarks: Array.from({ length: 21 }, () => landmark),
        worldLandmarks: Array.from({ length: 21 }, () => landmark),
      },
      right: {
        landmarks: Array.from({ length: 21 }, () => landmark),
        worldLandmarks: Array.from({ length: 21 }, () => landmark),
      },
    },
    landmarks: Array.from({ length: 33 }, () => landmark),
    sourceTimestampMs,
    startReadiness: DEEP_CAPTURE_TEST_READINESS,
    timestamp: sourceTimestampMs,
    worldLandmarks: Array.from({ length: 33 }, () => landmark),
  };
  if (!frame.deepCapture?.denseBody) throw new Error("Expected dense-body fixture.");
  frame.deepCapture.denseBody.fusion = buildMovementDenseCaptureFusion({
    anchors: frame.deepCapture.denseBody.anchors,
    poseLandmarks: frame.landmarks ?? [],
    worldPoseLandmarks: frame.worldLandmarks,
  });
  return frame;
}

export function createCompleteDeepCaptureFrames(count = 60) {
  return Array.from({ length: count }, (_, index) => createCompleteDeepCaptureFrame(index));
}
