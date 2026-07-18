import { describe, expect, it } from "vitest";
import { buildMovementDeepCaptureFrameEnvelope } from "./movementFrameCodec";
import {
  validateMovementDeepCaptureEnvelope,
} from "./movementRecordingCommissioning";
import type { MovementStartReadiness } from "./movementSourceFrame";
import type { MovementFramePayload } from "./movementTypes";
import { MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS } from "./movementDeepCaptureContract";
import { buildMovementDenseCaptureFusion } from "./movementDenseCaptureFusion";

const landmark = { visibility: 0.96, x: 0.5, y: 0.5, z: 0 };
const ready: MovementStartReadiness = {
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

function deepFrame(index: number): MovementFramePayload {
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
    startReadiness: ready,
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

function completeEnvelope() {
  const envelope = buildMovementDeepCaptureFrameEnvelope(
    Array.from({ length: 60 }, (_, index) => deepFrame(index)),
    30,
    { captureStartReadiness: ready },
  );
  envelope.sourcePacketHash = `sha256:${"a".repeat(64)}`;
  return envelope;
}

describe("validateMovementDeepCaptureEnvelope", () => {
  it("accepts a complete schema-v3 packet with fail-closed channel accounting", () => {
    expect(validateMovementDeepCaptureEnvelope(completeEnvelope())).toEqual({
      failures: [],
      passed: true,
    });
  });

  it("accepts natural temporary face, hand, and dense-body occlusion without dropping frames", () => {
    const frames = Array.from({ length: 60 }, (_, index) => deepFrame(index));
    frames.slice(0, 6).forEach((frame) => {
      delete frame.faceLandmarks;
      delete frame.hands;
      if (frame.deepCapture) {
        delete frame.deepCapture.face;
        delete frame.deepCapture.hands;
        delete frame.deepCapture.denseBody;
      }
    });
    const envelope = buildMovementDeepCaptureFrameEnvelope(frames, 30, {
      captureStartReadiness: ready,
    });
    envelope.sourcePacketHash = `sha256:${"a".repeat(64)}`;

    expect(envelope.frames).toHaveLength(60);
    expect(envelope.deepCaptureChannelSummary).toMatchObject({
      denseBody: { complete: true, presentFrames: 54, totalFrames: 60 },
      face: { complete: true, presentFrames: 54, totalFrames: 60 },
      leftHand: { complete: true, presentFrames: 54, totalFrames: 60 },
      rightHand: { complete: true, presentFrames: 54, totalFrames: 60 },
    });
    expect(validateMovementDeepCaptureEnvelope(envelope)).toEqual({
      failures: [],
      passed: true,
    });
  });

  it("names missing Deep Capture evidence and invalid dense anchor identity", () => {
    const envelope = completeEnvelope();
    const firstFrame = envelope.frames[0];
    if (Array.isArray(firstFrame) || !firstFrame.deepCapture?.denseBody) {
      throw new Error("Expected a Deep Capture frame fixture.");
    }
    firstFrame.deepCapture.hands = { left: firstFrame.deepCapture.hands?.left };
    firstFrame.deepCapture.denseBody.anchors = [
      firstFrame.deepCapture.denseBody.anchors[0]!,
      firstFrame.deepCapture.denseBody.anchors[0]!,
    ];
    envelope.deepCaptureChannelSummary = undefined;

    const report = validateMovementDeepCaptureEnvelope(envelope);

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      "rightHand Deep Capture evidence is incomplete.",
      "denseBody Deep Capture evidence is incomplete.",
      "Frame 0 must contain 200-500 dense-body anchors.",
      "Frame 0 contains duplicate dense-body anchor ids.",
    ]));
  });

  it("rejects anchors that do not come from the versioned dense adapter", () => {
    const envelope = completeEnvelope();
    const firstFrame = envelope.frames[0];
    if (Array.isArray(firstFrame) || !firstFrame.deepCapture?.denseBody) {
      throw new Error("Expected a Deep Capture frame fixture.");
    }
    delete firstFrame.deepCapture.denseBody.adapter;

    expect(validateMovementDeepCaptureEnvelope(envelope)).toMatchObject({
      failures: expect.arrayContaining([
        expect.stringMatching(/^Frame 0 dense-body adapter evidence is invalid:/),
      ]),
      passed: false,
    });
  });

  it("accepts changing visible anchor ids and explicit missing-region fusion state", () => {
    const envelope = completeEnvelope();
    const firstFrame = envelope.frames[0];
    if (Array.isArray(firstFrame) || !firstFrame.deepCapture?.denseBody) {
      throw new Error("Expected a Deep Capture frame fixture.");
    }
    firstFrame.deepCapture.denseBody.anchors = firstFrame.deepCapture.denseBody.anchors.map(
      (anchor, index) => ({
        ...anchor,
        id: `visible-surface-${index}`,
        region: anchor.region === "back" ? "chest" : anchor.region,
      }),
    );
    firstFrame.deepCapture.denseBody.fusion = buildMovementDenseCaptureFusion({
      anchors: firstFrame.deepCapture.denseBody.anchors,
      poseLandmarks: firstFrame.landmarks ?? [],
      worldPoseLandmarks: firstFrame.worldLandmarks,
    });

    expect(validateMovementDeepCaptureEnvelope(envelope)).toEqual({
      failures: [],
      passed: true,
    });
    expect(firstFrame.deepCapture.denseBody.fusion.regionCoverage.back).toMatchObject({
      anchorCount: 0,
      state: "missing",
    });
  });

  it("rejects unresolved eyes and contradictory observed-occluded tracking", () => {
    const envelope = completeEnvelope();
    const firstFrame = envelope.frames[0];
    if (Array.isArray(firstFrame) || !firstFrame.deepCapture?.face || !firstFrame.deepCapture.hands?.left) {
      throw new Error("Expected complete Deep Capture evidence.");
    }
    firstFrame.deepCapture.face.eyeVisibility.left = "occluded-or-unresolved";
    firstFrame.deepCapture.hands.left.tracking = { occluded: true, state: "observed" };

    expect(validateMovementDeepCaptureEnvelope(envelope)).toMatchObject({
      failures: expect.arrayContaining([
        "Frame 0 left hand evidence is incomplete or ambiguous.",
        "Frame 0 face, iris, transform, or gaze evidence is incomplete.",
      ]),
      passed: false,
    });
  });
});
