import type {
  Category,
  FaceLandmarkerResult,
  Landmark,
  NormalizedLandmark,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import {
  buildMovementDeepCaptureFaceEvidence,
  buildMovementDeepCaptureHandEvidence,
  buildMovementDeepCaptureSegmentationEvidence,
  resolveMovementDeepCaptureHandAssignment,
} from "./movementDeepCaptureEvidence";

const camera = { frameHeight: 1080, frameWidth: 1920 };

function category(label: "Left" | "Right", score = 0.96): Category {
  return { categoryName: label, displayName: label, index: 0, score };
}

function hand(): NormalizedLandmark[] {
  const landmarks = Array.from({ length: 21 }, (_, index) => ({
    x: 0.4 + (index % 4) * 0.02,
    y: 0.7 - Math.floor(index / 4) * 0.03,
    z: -0.01 * (index % 3),
    visibility: 1,
  }));
  landmarks[0] = { x: 0.45, y: 0.72, z: 0, visibility: 1 };
  landmarks[5] = { x: 0.40, y: 0.62, z: -0.04, visibility: 1 };
  landmarks[9] = { x: 0.45, y: 0.58, z: -0.06, visibility: 1 };
  landmarks[17] = { x: 0.51, y: 0.63, z: -0.01, visibility: 1 };
  return landmarks;
}

function worldHand(): Landmark[] {
  return hand().map(({ x, y, z }) => ({ x: x - 0.45, y: y - 0.72, z, visibility: 1 }));
}

function faceResult(): FaceLandmarkerResult {
  const landmarks = Array.from({ length: 478 }, (_, index) => ({
    x: 0.45 + (index % 20) * 0.005,
    y: 0.3 + Math.floor(index / 20) * 0.004,
    z: -0.01,
    visibility: 1,
  }));
  landmarks[33] = { x: 0.44, y: 0.40, z: -0.01, visibility: 1 };
  landmarks[133] = { x: 0.49, y: 0.40, z: -0.01, visibility: 1 };
  landmarks[362] = { x: 0.52, y: 0.40, z: -0.01, visibility: 1 };
  landmarks[263] = { x: 0.57, y: 0.40, z: -0.01, visibility: 1 };
  for (let index = 468; index <= 472; index += 1) {
    landmarks[index] = { x: 0.468, y: 0.402, z: -0.02, visibility: 1 };
  }
  for (let index = 473; index <= 477; index += 1) {
    landmarks[index] = { x: 0.548, y: 0.399, z: -0.02, visibility: 1 };
  }

  return {
    faceBlendshapes: [],
    faceLandmarks: [landmarks],
    facialTransformationMatrixes: [{
      columns: 4,
      data: Array.from({ length: 16 }, (_, index) => index),
      rows: 4,
    }],
  };
}

describe("movement Deep Capture evidence", () => {
  it("keeps detector handedness as evidence while pose wrists own anatomical side", () => {
    const reconciled = resolveMovementDeepCaptureHandAssignment({
      detectorCategory: category("Right"),
      handWrist: { x: 0.2, y: 0.5, z: 0, visibility: 1 },
      leftWrist: { x: 0.21, y: 0.5, z: 0, visibility: 1 },
      rightWrist: { x: 0.8, y: 0.5, z: 0, visibility: 1 },
    });

    expect(reconciled).toMatchObject({
      assignment: "pose-wrist-reconciled",
      detector: { label: "Right", score: 0.96 },
      side: "left",
    });
  });

  it("keeps pose-wrist ownership when crossed hands contradict detector handedness", () => {
    const crossed = resolveMovementDeepCaptureHandAssignment({
      detectorCategory: category("Left"),
      handWrist: { x: 0.78, y: 0.45, z: 0, visibility: 1 },
      leftWrist: { x: 0.2, y: 0.5, z: 0, visibility: 1 },
      rightWrist: { x: 0.8, y: 0.5, z: 0, visibility: 1 },
    });

    expect(crossed).toMatchObject({
      assignment: "pose-wrist-reconciled",
      detector: { label: "Left" },
      side: "right",
    });
  });

  it("does not reconcile anatomical ownership from weak Pose wrists", () => {
    const assignment = resolveMovementDeepCaptureHandAssignment({
      detectorCategory: category("Right"),
      handWrist: { x: 0.2, y: 0.5, z: 0, visibility: 1 },
      leftWrist: { x: 0.2, y: 0.5, z: 0, visibility: 0.05 },
      rightWrist: { x: 0.8, y: 0.5, z: 0, visibility: 0.05 },
    });

    expect(assignment).toMatchObject({
      assignment: "detector",
      detector: { label: "Right" },
      side: "right",
    });
  });

  it("derives native-frame ROI, palm/wrist orientation, and finger articulation", () => {
    const evidence = buildMovementDeepCaptureHandEvidence({
      assignment: "detector",
      camera,
      capturedAt: 2_000,
      detector: { label: "Left", score: 0.94 },
      landmarks: hand(),
      side: "left",
      sourceTimestampMs: 1_995,
      worldLandmarks: worldHand(),
    });

    expect(evidence?.crop).toMatchObject({
      sourceFrameHeight: 1080,
      sourceFrameWidth: 1920,
    });
    expect(evidence?.crop.width).toBeGreaterThan(1);
    expect(evidence?.orientation?.palmNormal).not.toBeNull();
    expect(evidence?.orientation?.wristRotation).not.toBeNull();
    expect(evidence?.orientation?.facing).not.toBe("unknown");
    expect(evidence?.tracking).toEqual({ occluded: false, state: "observed" });
    expect(Object.keys(evidence?.fingerJointAngles ?? {})).toHaveLength(15);
    expect(evidence?.provenance).toMatchObject({
      confidence: 0.94,
      origin: "model-estimated",
      sourceTimestampMs: 1_995,
    });
  });

  it("clamps native crops at the camera boundary", () => {
    const boundaryHand = hand().map((landmark) => ({
      ...landmark,
      x: Math.max(0, landmark.x - 0.44),
      y: Math.max(0, landmark.y - 0.57),
    }));
    const evidence = buildMovementDeepCaptureHandEvidence({
      assignment: "detector",
      camera,
      capturedAt: 2_000,
      detector: { label: "Left", score: 0.94 },
      landmarks: boundaryHand,
      side: "left",
      sourceTimestampMs: 1_995,
    });

    expect(evidence?.crop.x).toBe(0);
    expect(evidence?.crop.y).toBe(0);
    expect((evidence?.crop.x ?? 0) + (evidence?.crop.width ?? 0)).toBeLessThanOrEqual(1920);
    expect((evidence?.crop.y ?? 0) + (evidence?.crop.height ?? 0)).toBeLessThanOrEqual(1080);
  });

  it("reports an edge-on palm without inventing camera-facing direction", () => {
    const edgeOnWorld = worldHand();
    edgeOnWorld[0] = { x: 0, y: 0, z: 0, visibility: 1 };
    edgeOnWorld[5] = { x: 0, y: 0.1, z: 0, visibility: 1 };
    edgeOnWorld[9] = { x: 0, y: 0.12, z: 0.02, visibility: 1 };
    edgeOnWorld[17] = { x: 0, y: 0, z: 0.1, visibility: 1 };
    const evidence = buildMovementDeepCaptureHandEvidence({
      assignment: "detector",
      camera,
      capturedAt: 2_000,
      detector: { label: "Right", score: 0.94 },
      landmarks: hand(),
      side: "right",
      sourceTimestampMs: 1_995,
      worldLandmarks: edgeOnWorld,
    });

    expect(evidence?.orientation).toMatchObject({
      facing: "edge-on",
      palmNormal: { x: 1, y: 0, z: 0 },
    });
  });

  it("distinguishes a palm facing away from the camera", () => {
    const palmAwayWorld = worldHand();
    palmAwayWorld[0] = { x: 0, y: 0, z: 0, visibility: 1 };
    palmAwayWorld[5] = { x: 0.1, y: 0.1, z: 0, visibility: 1 };
    palmAwayWorld[9] = { x: 0, y: 0.15, z: 0, visibility: 1 };
    palmAwayWorld[17] = { x: -0.1, y: 0.1, z: 0, visibility: 1 };
    const evidence = buildMovementDeepCaptureHandEvidence({
      assignment: "detector",
      camera,
      capturedAt: 2_000,
      detector: { label: "Right", score: 0.94 },
      landmarks: hand(),
      side: "right",
      sourceTimestampMs: 1_995,
      worldLandmarks: palmAwayWorld,
    });

    expect(evidence?.orientation).toMatchObject({
      facing: "palm-facing-away",
      palmNormal: { z: 1 },
    });
  });

  it("captures both iris-owned gaze vectors and the facial transform", () => {
    const evidence = buildMovementDeepCaptureFaceEvidence({
      camera,
      capturedAt: 3_000,
      faceResults: faceResult(),
      sourceTimestampMs: 2_995,
    });

    expect(evidence?.facialTransformationMatrix).toHaveLength(16);
    expect(evidence?.irisLandmarkCount).toBe(10);
    expect(evidence?.gaze.left).not.toBeNull();
    expect(evidence?.gaze.right).not.toBeNull();
    expect(evidence?.gaze.fused).not.toBeNull();
    expect(evidence?.eyeVisibility).toEqual({
      eyewear: "unknown",
      left: "visible",
      right: "visible",
    });
    expect(evidence?.tracking).toEqual({ occluded: false, state: "observed" });
    expect(evidence?.crop).toMatchObject({
      sourceFrameHeight: 1080,
      sourceFrameWidth: 1920,
    });
  });

  it("fails closed when palm geometry or iris landmarks are incomplete", () => {
    const evidence = buildMovementDeepCaptureHandEvidence({
      assignment: "ambiguous",
      camera,
      capturedAt: 4_000,
      detector: { label: "Unknown", score: 0 },
      landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 })),
      side: "right",
      sourceTimestampMs: 4_000,
    });
    const incompleteFace = faceResult();
    incompleteFace.faceLandmarks[0] = incompleteFace.faceLandmarks[0]?.slice(0, 468) ?? [];
    const faceEvidence = buildMovementDeepCaptureFaceEvidence({
      camera,
      capturedAt: 4_000,
      faceResults: incompleteFace,
      sourceTimestampMs: 4_000,
    });

    expect(evidence?.orientation).toEqual({
      facing: "unknown",
      palmNormal: null,
      provenance: expect.objectContaining({ origin: "derived" }),
      wristRotation: null,
    });
    expect(faceEvidence?.irisLandmarkCount).toBe(0);
    expect(faceEvidence?.eyeVisibility).toEqual({
      eyewear: "unknown",
      left: "occluded-or-unresolved",
      right: "occluded-or-unresolved",
    });
    expect(faceEvidence?.gaze).toEqual({
      fused: null,
      left: null,
      provenance: expect.objectContaining({ origin: "derived" }),
      right: null,
    });
  });

  it("stores a compact model segmentation mask without inventing dense anchors", () => {
    const poseResults = {
      landmarks: [],
      segmentationMasks: [{
        getAsFloat32Array: () => new Float32Array([0.1, 0.6, 0.7, 0.2]),
        height: 2,
        width: 2,
      }],
      worldLandmarks: [],
    } as unknown as PoseLandmarkerResult;

    const evidence = buildMovementDeepCaptureSegmentationEvidence({
      camera,
      capturedAt: 5_000,
      poseResults,
      sourceTimestampMs: 4_995,
    });

    expect(evidence?.anchors).toEqual([]);
    expect(evidence?.segmentation).toMatchObject({
      coverage: 0.5,
      encoding: "model-rle",
      frameHeight: 1080,
      frameWidth: 1920,
      maskHeight: 2,
      maskWidth: 2,
      payload: [[0, 1], [1, 2], [0, 1]],
      provenance: { origin: "model-estimated", sourceTimestampMs: 4_995 },
    });
    expect(evidence?.segmentation.confidence).toBeCloseTo(0.65);
  });
});
