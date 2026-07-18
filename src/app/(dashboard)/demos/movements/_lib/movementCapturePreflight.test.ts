import { describe, expect, it } from "vitest";
import type { MovementAcquisitionFrame } from "./movementPlayerInputContract";
import type { MovementStartReadiness } from "./movementSourceFrame";
import { buildMovementCapturePreflight } from "./movementCapturePreflight";
import {
  MOVEMENT_DEEP_CAPTURE_PROFILE,
  MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS,
} from "./movementDeepCaptureContract";
import { buildMovementDenseCaptureFusion } from "./movementDenseCaptureFusion";

const landmark = { visibility: 0.95, x: 0.5, y: 0.5, z: 0 };
const ready: MovementStartReadiness = {
  blockedReasons: [],
  calibrationQuality: 0.9,
  canStartGame: true,
  canStartRecording: true,
  countdownMsRemaining: 0,
  promptEvents: [],
  requiredBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
  state: "ready",
  visibleBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
};

function completeCurrentFrame(): MovementAcquisitionFrame {
  return {
    acquisitionProfileId: "movement-player-input-v1",
    blendshapes: [{ categoryName: "eyeBlinkLeft", displayName: "", index: 0, score: 0.8 }],
    camera: { facingMode: "user", frameHeight: 1080, frameWidth: 1920 },
    capturedAt: 1,
    deepCapture: {
      face: {
        crop: { height: 300, sourceFrameHeight: 1080, sourceFrameWidth: 1920, width: 300, x: 800, y: 100 },
        facialTransformationMatrix: Array.from({ length: 16 }, (_, index) => index),
        gaze: {
          fused: { x: 0, y: 0, z: -1 },
          left: { x: 0, y: 0, z: -1 },
          provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "derived", sourceTimestampMs: 1 },
          right: { x: 0, y: 0, z: -1 },
        },
        eyeVisibility: { eyewear: "unknown", left: "visible", right: "visible" },
        irisLandmarkCount: 10,
        provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated", sourceTimestampMs: 1 },
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
        left: {
          assignment: "detector",
          crop: { height: 200, sourceFrameHeight: 1080, sourceFrameWidth: 1920, width: 200, x: 100, y: 100 },
          detectorHandedness: { label: "Left", score: 0.9 },
          orientation: {
            facing: "palm-facing-camera",
            palmNormal: { x: 0, y: 0, z: -1 },
            provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "derived", sourceTimestampMs: 1 },
            wristRotation: { x: 0, y: 0, z: 0 },
          },
          provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated", sourceTimestampMs: 1 },
          refinement: {
            inferenceDurationMs: 8,
            inputHeight: 192,
            inputWidth: 192,
            profileId: "movement-deep-capture-refinement-v1",
            source: "native-roi-second-pass",
          },
          tracking: { occluded: false, state: "observed" },
        },
        right: {
          assignment: "detector",
          crop: { height: 200, sourceFrameHeight: 1080, sourceFrameWidth: 1920, width: 200, x: 100, y: 100 },
          detectorHandedness: { label: "Right", score: 0.9 },
          orientation: {
            facing: "palm-facing-camera",
            palmNormal: { x: 0, y: 0, z: -1 },
            provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "derived", sourceTimestampMs: 1 },
            wristRotation: { x: 0, y: 0, z: 0 },
          },
          provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated", sourceTimestampMs: 1 },
          refinement: {
            inferenceDurationMs: 8,
            inputHeight: 192,
            inputWidth: 192,
            profileId: "movement-deep-capture-refinement-v1",
            source: "native-roi-second-pass",
          },
          tracking: { occluded: false, state: "observed" },
        },
      },
      profileId: MOVEMENT_DEEP_CAPTURE_PROFILE.id,
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
    sourceTimestampMs: 1,
    worldLandmarks: Array.from({ length: 33 }, () => landmark),
  };
}

describe("buildMovementCapturePreflight", () => {
  it("reports captured hand/eye evidence exactly and keeps dense body blocking", () => {
    const report = buildMovementCapturePreflight({
      frame: completeCurrentFrame(),
      readiness: ready,
      retainedFrameCount: 60,
    });

    expect(report.currentRecordingReady).toBe(true);
    expect(report.deepCaptureReady).toBe(false);
    expect(report.channels.find((channel) => channel.id === "pose")).toMatchObject({
      observedCount: 33,
      status: "ready",
      targetCount: 33,
    });
    expect(report.channels.find((channel) => channel.id === "leftHand")).toMatchObject({
      observedCount: 21,
      status: "ready",
      targetCount: 21,
    });
    expect(report.channels.find((channel) => channel.id === "face")).toMatchObject({
      observedCount: 478,
      status: "ready",
    });
    expect(report.channels.find((channel) => channel.id === "palmWrist")).toMatchObject({
      observedCount: 2,
      status: "ready",
      targetCount: 2,
    });
    expect(report.channels.find((channel) => channel.id === "eyesGaze")).toMatchObject({
      observedCount: 2,
      status: "ready",
      targetCount: 2,
    });
    expect(report.channels.find((channel) => channel.id === "denseBody")?.status).toBe("planned");
    expect(report.deepCaptureBlockers).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Dense body surface:/),
    ]));
  });

  it("names partial and missing evidence instead of returning a generic visibility failure", () => {
    const frame = completeCurrentFrame();
    frame.landmarks = frame.landmarks?.slice(0, 24);
    frame.hands = { left: frame.hands?.left };
    frame.faceLandmarks = null;

    const report = buildMovementCapturePreflight({
      frame,
      readiness: {
        ...ready,
        blockedReasons: ["leftFoot-missing", "rightFoot-missing"],
        canStartRecording: false,
        state: "blocked",
      },
      retainedFrameCount: 12,
    });

    expect(report.currentRecordingReady).toBe(false);
    expect(report.channels.find((channel) => channel.id === "pose")).toMatchObject({
      message: "24/33 coordinates captured · 24/33 visibility-qualified",
      status: "partial",
    });
    expect(report.channels.find((channel) => channel.id === "rightHand")).toMatchObject({
      message: "0/21 available",
      status: "missing",
    });
    expect(report.channels.find((channel) => channel.id === "face")).toMatchObject({
      message: "No face landmarks available",
      status: "missing",
    });
    expect(report.channels.find((channel) => channel.id === "setupPrefix")).toMatchObject({
      message: "12/60 retained; collection starts with recording",
      status: "partial",
    });
    expect(report.channels.find((channel) => channel.id === "readiness")?.message).toBe(
      "leftFoot-missing, rightFoot-missing",
    );
  });

  it("distinguishes captured pose coordinates from visibility-qualified points when recording can start", () => {
    const frame = completeCurrentFrame();
    frame.landmarks = frame.landmarks?.map((point, index) => ({
      ...point,
      visibility: [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 23, 24].includes(index)
        ? 0.9
        : 0.05,
    }));
    const acquisitionReady: MovementStartReadiness = {
      ...ready,
      blockedReasons: [
        "leftArm-missing",
        "rightArm-missing",
        "leftLeg-missing",
        "rightLeg-missing",
        "leftFoot-missing",
        "rightFoot-missing",
        "camera-uncertain",
      ],
      canStartGame: false,
      canStartRecording: true,
      state: "blocked",
      visibleBodyParts: ["head", "torso"],
    };

    const report = buildMovementCapturePreflight({
      frame,
      readiness: acquisitionReady,
      retainedFrameCount: 0,
    });

    expect(report.currentRecordingReady).toBe(true);
    expect(report.channels.find((channel) => channel.id === "pose")).toMatchObject({
      message: "33/33 coordinates captured · 13/33 visibility-qualified",
      observedCount: 13,
      status: "partial",
      targetCount: 33,
    });
    expect(report.channels.find((channel) => channel.id === "readiness")).toMatchObject({
      message: "Recording can start from complete image/world pose and trustworthy head/torso; peripheral confidence and final Deep Capture coverage remain separate",
      status: "ready",
    });
  });

  it("does not call coarse hand and face landmarks Deep Capture ready", () => {
    const frame = completeCurrentFrame();
    delete frame.deepCapture?.face?.refinement;
    delete frame.deepCapture?.hands?.left?.refinement;
    delete frame.deepCapture?.hands?.right?.refinement;

    const report = buildMovementCapturePreflight({
      frame,
      readiness: ready,
      retainedFrameCount: 60,
    });

    expect(report.channels.find((channel) => channel.id === "leftHand")).toMatchObject({
      message: "21/21 coarse landmarks; waiting for native-crop second pass",
      status: "partial",
    });
    expect(report.channels.find((channel) => channel.id === "face")).toMatchObject({
      message: "478 coarse landmarks; waiting for native-crop second pass",
      status: "partial",
    });
    expect(report.channels.find((channel) => channel.id === "eyesGaze")?.status).toBe("missing");
  });

  it("does not call a refined hand ready without all 21 world landmarks", () => {
    const frame = completeCurrentFrame();
    frame.hands!.left!.worldLandmarks = frame.hands!.left!.worldLandmarks!.slice(0, 20);

    const report = buildMovementCapturePreflight({
      frame,
      readiness: ready,
      retainedFrameCount: 60,
    });

    expect(report.channels.find((channel) => channel.id === "leftHand")).toMatchObject({
      message: "21/21 image landmarks · 20/21 world landmarks; incomplete refinement evidence",
      observedCount: 20,
      status: "partial",
      targetCount: 21,
    });
    expect(report.deepCaptureReady).toBe(false);
  });

  it("keeps a visible refined face ready when face visibility values are zero", () => {
    const frame = completeCurrentFrame();
    frame.faceLandmarks = Array.from({ length: 478 }, () => ({
      ...landmark,
      visibility: 0,
    }));

    const report = buildMovementCapturePreflight({
      frame,
      readiness: ready,
      retainedFrameCount: 60,
    });

    expect(report.channels.find((channel) => channel.id === "face")).toMatchObject({
      observedCount: 478,
      status: "ready",
    });
    expect(report.channels.find((channel) => channel.id === "eyesGaze")).toMatchObject({
      observedCount: 2,
      status: "ready",
    });
    expect(report.channels.find((channel) => channel.id === "blendshapes")?.status).toBe("ready");
  });

  it("makes short occlusion carry and reacquisition visible in preflight", () => {
    const frame = completeCurrentFrame();
    frame.deepCapture!.hands!.left!.tracking = {
      occluded: true,
      state: "temporally-carried",
    };
    frame.deepCapture!.hands!.right!.tracking = {
      occluded: false,
      state: "reacquired",
    };
    frame.deepCapture!.face!.tracking = {
      occluded: true,
      state: "temporally-carried",
    };

    const report = buildMovementCapturePreflight({
      frame,
      readiness: ready,
      retainedFrameCount: 60,
    });

    expect(report.channels.find((channel) => channel.id === "leftHand")?.message).toContain(
      "temporarily carried through occlusion",
    );
    expect(report.channels.find((channel) => channel.id === "rightHand")?.message).toContain(
      "reacquired after occlusion",
    );
    expect(report.channels.find((channel) => channel.id === "palmWrist")?.message).toContain(
      "hand orientation reacquired after occlusion",
    );
    expect(report.channels.find((channel) => channel.id === "eyesGaze")?.message).toContain(
      "temporarily carried through occlusion",
    );
  });

  it("reports segmentation as partial until persistent dense anchors exist", () => {
    const frame = completeCurrentFrame();
    frame.deepCapture!.denseBody = {
      anchors: [],
      modelHash: "unverified:test",
      modelId: "segmentation-test",
      segmentation: {
        confidence: 0.9,
        coverage: 0.42,
        encoding: "model-rle",
        frameHeight: 1080,
        frameWidth: 1920,
        maskHeight: 2,
        maskWidth: 2,
        payload: [[0, 1], [1, 2], [0, 1]],
        provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated", sourceTimestampMs: 1 },
      },
    };
    const report = buildMovementCapturePreflight({
      frame,
      readiness: ready,
      retainedFrameCount: 60,
    });

    expect(report.channels.find((channel) => channel.id === "denseBody")).toMatchObject({
      message: "Segmentation ready (42% mask coverage); 0/200 persistent anchors",
      observedCount: 0,
      status: "partial",
      targetCount: 200,
    });
  });

  it("reports dense anchors ready only with adapter and immutable model identity", () => {
    const frame = completeCurrentFrame();
    frame.deepCapture!.denseBody = {
      adapter: {
        inferenceDurationMs: 31.2,
        inputHeight: 360,
        inputWidth: 640,
        profileId: "movement-dense-capture-adapter-v1",
        qualityTier: "medium",
        runtime: "webgpu",
        targetIntervalMs: 180,
      },
      anchors: Array.from({ length: 200 }, (_, index) => ({
        anatomicalSide: "midline" as const,
        depth: 0.2,
        id: `anchor-${index}`,
        image: { x: 0.5, y: 0.5 },
        normal: { x: 0, y: 0, z: 1 },
        occluded: false,
        provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated" as const, sourceTimestampMs: 1 },
        region: MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS[
          index % MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.length
        ],
        surface: "front" as const,
      })),
      modelHash: `sha256:${"a".repeat(64)}`,
      modelId: "candidate@1",
      segmentation: {
        confidence: 0.9,
        coverage: 0.42,
        encoding: "model-rle",
        frameHeight: 1080,
        frameWidth: 1920,
        maskHeight: 2,
        maskWidth: 2,
        payload: [[0, 1], [1, 2]],
        provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated", sourceTimestampMs: 1 },
      },
    };
    frame.deepCapture!.denseBody.fusion = buildMovementDenseCaptureFusion({
      anchors: frame.deepCapture!.denseBody.anchors,
      poseLandmarks: frame.landmarks ?? [],
      worldPoseLandmarks: frame.worldLandmarks,
    });

    const readyReport = buildMovementCapturePreflight({
      frame,
      readiness: ready,
      retainedFrameCount: 60,
    });
    expect(readyReport.channels.find((channel) => channel.id === "denseBody")).toMatchObject({
      message: "200/200 persistent anchors · 21/21 regions current/tracked/occluded · candidate@1 · webgpu/medium · 31ms",
      status: "ready",
    });

    delete frame.deepCapture!.denseBody!.adapter;
    const invalidReport = buildMovementCapturePreflight({
      frame,
      readiness: ready,
      retainedFrameCount: 60,
    });
    expect(invalidReport.channels.find((channel) => channel.id === "denseBody")).toMatchObject({
      message: "200 anchors present, but adapter identity or model SHA-256 is invalid, or skeleton-fusion evidence is incomplete",
      status: "partial",
    });
  });

  it("does not call dense body ready while required regions are missing", () => {
    const frame = completeCurrentFrame();
    const anchors = Array.from({ length: 400 }, (_, index) => ({
      anatomicalSide: "midline" as const,
      depth: 0.2,
      id: `head-anchor-${index}`,
      image: { x: 0.5, y: 0.2 },
      normal: { x: 0, y: 0, z: 1 },
      occluded: false,
      provenance: {
        ageMs: 0,
        confidence: 0.9,
        inferenceTimestampMs: 1,
        origin: "model-estimated" as const,
        sourceTimestampMs: 1,
      },
      region: "head" as const,
      surface: "front" as const,
    }));
    frame.deepCapture!.denseBody = {
      adapter: {
        inferenceDurationMs: 31.2,
        inputHeight: 360,
        inputWidth: 640,
        profileId: "movement-dense-capture-adapter-v1",
        qualityTier: "medium",
        runtime: "webgpu",
        targetIntervalMs: 180,
      },
      anchors,
      fusion: buildMovementDenseCaptureFusion({
        anchors,
        poseLandmarks: frame.landmarks ?? [],
        worldPoseLandmarks: frame.worldLandmarks,
      }),
      modelHash: `sha256:${"a".repeat(64)}`,
      modelId: "candidate@1",
      segmentation: {
        confidence: 0.9,
        coverage: 0.42,
        encoding: "model-rle",
        frameHeight: 1080,
        frameWidth: 1920,
        maskHeight: 2,
        maskWidth: 2,
        payload: [[0, 1], [1, 2]],
        provenance: { ageMs: 0, confidence: 0.9, inferenceTimestampMs: 1, origin: "model-estimated", sourceTimestampMs: 1 },
      },
    };

    const report = buildMovementCapturePreflight({
      frame,
      readiness: ready,
      retainedFrameCount: 60,
    });
    const denseBody = report.channels.find((channel) => channel.id === "denseBody");

    expect(denseBody).toMatchObject({
      observedCount: 400,
      status: "partial",
    });
    expect(denseBody?.message).toContain("1/21 regions current/tracked/occluded");
    expect(denseBody?.message).toContain("missing now:");
  });
});
