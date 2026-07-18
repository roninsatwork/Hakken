import { describe, expect, it } from "vitest";
import { validateCompleteReplayGamePacket } from "./run-replay-mounted-game-packet-proof.mjs";
import {
  DEEP_CAPTURE_REQUIRED_BODY_REGIONS,
  validateDeepCaptureReplayPacket,
} from "./validate-deep-capture-replay-packet.mjs";

const landmark = { visibility: 0.96, x: 0.5, y: 0.5, z: 0 };

function provenance(origin = "model-estimated") {
  return {
    ageMs: 0,
    confidence: 0.95,
    inferenceTimestampMs: 1_000,
    origin,
    sourceTimestampMs: 1_000,
  };
}

function handEvidence(label) {
  return {
    assignment: "pose-wrist-reconciled",
    crop: {
      height: 256,
      sourceFrameHeight: 1080,
      sourceFrameWidth: 1920,
      width: 256,
      x: 320,
      y: 180,
    },
    detectorHandedness: { label, score: 0.98 },
    fingerJointAngles: Object.fromEntries(Array.from({ length: 15 }, (_, index) => [
      `joint-${index}`,
      { provenance: provenance("derived"), radians: 0.5 },
    ])),
    orientation: {
      facing: "palm-facing-camera",
      palmNormal: { x: 0, y: 0, z: -1 },
      provenance: provenance("derived"),
      wristRotation: { x: 0.1, y: 0.2, z: 0.3 },
    },
    provenance: provenance(),
    refinement: {
      inferenceDurationMs: 8,
      inputHeight: 192,
      inputWidth: 192,
      profileId: "movement-deep-capture-refinement-v1",
      source: "native-roi-second-pass",
    },
    tracking: { occluded: false, state: "observed" },
  };
}

export function completeDeepCaptureReplayPacket() {
  const anchors = Array.from({ length: 200 }, (_, index) => ({
    anatomicalSide: "midline",
    depth: 0.2,
    id: `surface-${index}`,
    image: { x: 0.5, y: 0.5 },
    normal: { x: 0, y: 0, z: 1 },
    occluded: false,
    provenance: provenance(),
    region: DEEP_CAPTURE_REQUIRED_BODY_REGIONS[index % DEEP_CAPTURE_REQUIRED_BODY_REGIONS.length],
    surface: "front",
  }));
  const regionCoverage = Object.fromEntries(DEEP_CAPTURE_REQUIRED_BODY_REGIONS.map((region) => [
    region,
    {
      anchorCount: anchors.filter((anchor) => anchor.region === region).length,
      state: "current",
    },
  ]));
  const sample = {
    acquisitionProfileId: "movement-deep-capture-v1",
    camera: { deviceFingerprint: "fnv1a32:1234abcd" },
    startReadiness: { status: "ready" },
    tracking: {
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
          anchors,
          fusion: {
            contactCandidates: {},
            profileId: "movement-dense-capture-fusion-v1",
            regionCoverage,
            skeleton: { poseLandmarkCount: 33, worldPoseLandmarkCount: 33 },
            torsoTwist: {
              confidence: 0.9,
              radians: 0,
              reason: "derived-from-current-surface-normals",
            },
          },
          modelHash: `sha256:${"b".repeat(64)}`,
          modelId: "dense-model@1",
          segmentation: {
            confidence: 0.95,
            coverage: 0.5,
            encoding: "model-rle",
            frameHeight: 1080,
            frameWidth: 1920,
            maskHeight: 256,
            maskWidth: 256,
            payload: "0:100,1:100",
            provenance: provenance(),
          },
        },
        face: {
          eyeVisibility: { eyewear: "unknown", left: "visible", right: "visible" },
          facialTransformationMatrix: Array.from({ length: 16 }, (_, index) => index),
          gaze: {
            fused: { x: 0, y: 0, z: -1 },
            left: { x: -0.01, y: 0, z: -1 },
            provenance: provenance("derived"),
            right: { x: 0.01, y: 0, z: -1 },
          },
          irisLandmarkCount: 10,
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
          left: handEvidence("Left"),
          right: handEvidence("Right"),
        },
        profileId: "movement-deep-capture-v1",
      },
      face: Array.from({ length: 478 }, () => landmark),
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
      pose: Array.from({ length: 33 }, () => landmark),
      worldPose: Array.from({ length: 33 }, () => landmark),
    },
  };
  const channelSummary = Object.fromEntries(
    ["blendshapes", "camera", "face", "hands", "pose", "worldPose"].map((channel) => [
      channel,
      { complete: true, presentFrames: 1, totalFrames: 1 },
    ]),
  );
  const deepCaptureChannelSummary = Object.fromEntries(
    ["leftHand", "rightHand", "palmWrist", "face", "eyesGaze", "segmentation", "denseBody"].map((channel) => [
      channel,
      { complete: true, presentFrames: 1, totalFrames: 1 },
    ]),
  );
  return {
    channelSummary,
    deepCaptureChannelSummary,
    deepCaptureProfile: {
      anchorTarget: { maximum: 500, minimum: 200 },
      channels: [],
      denseAdapter: {
        id: "movement-dense-capture-adapter-v1",
        maximumBackoffMs: 1000,
        qualityProfiles: {
          high: { inputHeight: 540, inputWidth: 960, internalResolution: "medium", targetIntervalMs: 100 },
          medium: { inputHeight: 360, inputWidth: 640, internalResolution: "medium", targetIntervalMs: 180 },
          low: { inputHeight: 216, inputWidth: 384, internalResolution: "low", targetIntervalMs: 300 },
        },
        staleAfterMs: 300,
        targetIntervalMs: 100,
      },
      id: "movement-deep-capture-v1",
      privacy: { persistRawRgbByDefault: false, persistRawVideoByDefault: false },
      refinement: {
        id: "movement-deep-capture-refinement-v1",
        maximumBackoffMs: 500,
        maximumInputEdgePixels: 512,
        minimumFaceInputPixels: 256,
        minimumHandInputPixels: 192,
        staleAfterMs: 150,
        targetIntervalMs: 66,
      },
      schemaVersion: 3,
    },
    id: "deep-packet-a",
    inputContract: {
      id: "movement-player-input-v1",
      setup: { id: "movement-player-setup-v1" },
    },
    sampleCount: 1,
    samples: [sample],
    schemaVersion: 3,
    setupPrefix: { complete: true },
    sourcePacketHash: `sha256:${"a".repeat(64)}`,
  };
}

describe("Deep Capture Replay packet validation", () => {
  it("accepts one immutable schema-v3 packet across the shared packet proof boundary", () => {
    const packet = completeDeepCaptureReplayPacket();

    expect(validateDeepCaptureReplayPacket(packet)).toEqual([]);
    expect(validateCompleteReplayGamePacket(packet, { requireDeepCapture: true })).toEqual([]);
  });

  it("rejects missing refinements, dense identity, and persistent anchors before browser proof", () => {
    const packet = completeDeepCaptureReplayPacket();
    delete packet.samples[0].tracking.deepCapture.hands.right.refinement;
    packet.samples[0].tracking.deepCapture.face.eyeVisibility.right = "occluded-or-unresolved";
    packet.samples[0].tracking.deepCapture.denseBody.modelHash = "unversioned";
    packet.samples[0].tracking.deepCapture.denseBody.anchors = [];

    expect(validateDeepCaptureReplayPacket(packet)).toEqual(expect.arrayContaining([
      "Frame 0 right hand evidence is incomplete or ambiguous.",
      "Frame 0 face, iris, transform, or gaze evidence is incomplete.",
      "Frame 0 is missing an immutable dense-model SHA-256 identity.",
      "Frame 0 must contain 200-500 dense-body anchors.",
    ]));
  });

  it("accepts changing visible anchors when every configured region has an explicit state", () => {
    const packet = completeDeepCaptureReplayPacket();
    const denseBody = packet.samples[0].tracking.deepCapture.denseBody;
    denseBody.anchors = denseBody.anchors.map((anchor, index) => ({
      ...anchor,
      id: `visible-surface-${index}`,
      region: anchor.region === "back" ? "chest" : anchor.region,
    }));
    denseBody.fusion.regionCoverage.back = { anchorCount: 0, state: "missing" };
    denseBody.fusion.regionCoverage.chest.anchorCount = denseBody.anchors.filter(
      (anchor) => anchor.region === "chest",
    ).length;

    expect(validateDeepCaptureReplayPacket(packet)).toEqual([]);
  });

  it("rejects server processing and quality metadata that cannot be replayed honestly", () => {
    const packet = completeDeepCaptureReplayPacket();
    const adapter = packet.samples[0].tracking.deepCapture.denseBody.adapter;
    adapter.runtime = "server-gpu";
    adapter.qualityTier = "low";

    expect(validateDeepCaptureReplayPacket(packet)).toEqual(expect.arrayContaining([
      "Frame 0 has invalid browser runtime, quality tier, input, or timing evidence.",
    ]));
  });
});
