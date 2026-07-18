import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it, vi } from "vitest";
import { buildMovementDeepCaptureHandEvidence } from "./movementDeepCaptureEvidence";
import {
  ageMovementDeepCaptureProvenance,
  carryMovementDeepCaptureFaceEvidence,
  carryMovementDeepCaptureHandEvidence,
  mapMovementDeepCaptureCropLandmarksToSourceFrame,
  resolveMovementDeepCaptureHandRefinementRegion,
  resolveMovementDeepCaptureRefinementInputSize,
  resolveMovementDeepCaptureObservationState,
  resolveMovementDeepCaptureRefinementSchedule,
  selectMovementDeepCaptureHandRefinementCandidate,
} from "./movementDeepCaptureRefinement";

const crop = {
  height: 200,
  sourceFrameHeight: 1080,
  sourceFrameWidth: 1920,
  width: 300,
  x: 600,
  y: 300,
};

function poseWithLeftHand({
  anchorVisibility = 0.95,
  scale = 1,
  x = 0.2,
  y = 0.72,
}: {
  anchorVisibility?: number;
  scale?: number;
  x?: number;
  y?: number;
} = {}) {
  const pose = Array.from({ length: 33 }, () => ({
    visibility: 0,
    x: 0.5,
    y: 0.5,
    z: 0,
  })) satisfies NormalizedLandmark[];
  pose[15] = { visibility: 0.98, x, y, z: 0 };
  pose[17] = { visibility: anchorVisibility, x: x - 0.035 * scale, y: y - 0.15 * scale, z: 0 };
  pose[19] = { visibility: anchorVisibility, x: x + 0.02 * scale, y: y - 0.2 * scale, z: 0 };
  pose[21] = { visibility: anchorVisibility, x: x + 0.075 * scale, y: y - 0.13 * scale, z: 0 };
  return pose;
}

function openPalmCropLandmarks() {
  return Array.from({ length: 21 }, (_, index) => ({
    visibility: 1,
    x: 0.25 + (index % 4) * 0.15,
    y: 0.9 - Math.floor(index / 4) * 0.15,
    z: -0.01 * (index % 3),
  })) satisfies NormalizedLandmark[];
}

function detectorResult(
  hands: Array<{ label: "Left" | "Right"; landmarks: NormalizedLandmark[] }>,
) {
  const handednesses = hands.map(({ label }) => [{
    categoryName: label,
    displayName: label,
    index: label === "Left" ? 0 : 1,
    score: 0.93,
  }]);
  return {
    handedness: handednesses,
    handednesses,
    landmarks: hands.map(({ landmarks }) => landmarks),
    worldLandmarks: hands.map(({ landmarks }) => landmarks),
  };
}

describe("movement Deep Capture refinement", () => {
  it("maps crop-relative landmarks into the native source frame", () => {
    const mapped = mapMovementDeepCaptureCropLandmarksToSourceFrame([
      { x: 0, y: 0, z: 0.2, visibility: 0.9 },
      { x: 1, y: 1, z: -0.1, visibility: 0.8 },
      { x: 0.5, y: 0.5, z: 0, visibility: 1 },
    ] satisfies NormalizedLandmark[], crop);

    expect(mapped[0]).toMatchObject({
      visibility: 0.9,
      x: 600 / 1920,
      y: 300 / 1080,
      z: 0.2 * (300 / 1920),
    });
    expect(mapped[1]).toMatchObject({
      x: 900 / 1920,
      y: 500 / 1080,
      z: -0.1 * (300 / 1920),
    });
    expect(mapped[2]).toMatchObject({ x: 750 / 1920, y: 400 / 1080 });
  });

  it("sets useful crop input dimensions while bounding oversized inputs", () => {
    expect(resolveMovementDeepCaptureRefinementInputSize({
      crop: { ...crop, height: 80, width: 120 },
      minimumShortEdgePixels: 192,
    })).toEqual({ height: 192, width: 288 });
    expect(resolveMovementDeepCaptureRefinementInputSize({
      crop: { ...crop, height: 800, width: 1_600 },
      minimumShortEdgePixels: 256,
    })).toEqual({ height: 256, width: 512 });
  });

  it("runs one refinement at a time and dynamically backs off slow inference", () => {
    expect(resolveMovementDeepCaptureRefinementSchedule({
      hasRegionOfInterest: true,
      inFlight: false,
      lastCompletedAtMs: null,
      lastDurationMs: null,
      nowMs: 1_000,
    })).toEqual({ reason: "due", run: true });
    expect(resolveMovementDeepCaptureRefinementSchedule({
      hasRegionOfInterest: true,
      inFlight: true,
      lastCompletedAtMs: 900,
      lastDurationMs: 20,
      nowMs: 1_000,
    })).toEqual({ reason: "in-flight", run: false });
    expect(resolveMovementDeepCaptureRefinementSchedule({
      hasRegionOfInterest: true,
      inFlight: false,
      lastCompletedAtMs: 900,
      lastDurationMs: 80,
      nowMs: 1_000,
    })).toEqual({ reason: "rate-limited", run: false });
    expect(resolveMovementDeepCaptureRefinementSchedule({
      hasRegionOfInterest: true,
      inFlight: false,
      lastCompletedAtMs: 900,
      lastDurationMs: 80,
      nowMs: 1_141,
    })).toEqual({ reason: "due", run: true });
  });

  it("labels carried evidence as tracked and drops it at the stale boundary", () => {
    const provenance = {
      ageMs: 0,
      confidence: 0.9,
      inferenceTimestampMs: 1_000,
      origin: "model-estimated" as const,
      sourceTimestampMs: 990,
    };

    expect(ageMovementDeepCaptureProvenance({ nowMs: 1_075, provenance })).toMatchObject({
      ageMs: 75,
      confidence: 0.45,
      origin: "temporally-tracked",
      sourceTimestampMs: 990,
    });
    expect(ageMovementDeepCaptureProvenance({ nowMs: 1_151, provenance })).toBeNull();
  });

  it("marks the first new refinement after an occlusion as reacquired", () => {
    expect(resolveMovementDeepCaptureObservationState(false)).toBe("observed");
    expect(resolveMovementDeepCaptureObservationState(true)).toBe("reacquired");
  });

  it("does not schedule inference without a visible crop", () => {
    expect(resolveMovementDeepCaptureRefinementSchedule({
      hasRegionOfInterest: false,
      inFlight: false,
      lastCompletedAtMs: null,
      lastDurationMs: null,
      nowMs: 1_000,
    })).toEqual({ reason: "no-roi", run: false });
  });

  it("recovers a real 21-point near-camera palm when the coarse hand detector has no ROI", () => {
    const camera = { frameHeight: 1080, frameWidth: 1920 };
    const region = resolveMovementDeepCaptureHandRefinementRegion({
      camera,
      poseLandmarks: poseWithLeftHand({ scale: 1.8, x: 0.08, y: 0.82 }),
      primaryCrop: null,
      side: "left",
    });

    expect(region?.source).toBe("pose-hand-fallback");
    expect(region?.crop.x).toBe(0);
    expect(region?.crop.width).toBe(region?.crop.height);
    expect(region?.crop.height).toBeGreaterThan(camera.frameHeight * 0.5);
    const nativeCropRefiner = vi.fn(() => detectorResult([{
      label: "Right",
      landmarks: openPalmCropLandmarks(),
    }]));
    const candidate = selectMovementDeepCaptureHandRefinementCandidate({
      poseLandmarks: poseWithLeftHand({ scale: 1.8, x: 0.08, y: 0.82 }),
      refinementRegion: region!,
      result: nativeCropRefiner(),
      side: "left",
    });

    expect(nativeCropRefiner).toHaveBeenCalledTimes(1);
    expect(candidate?.mappedLandmarks).toHaveLength(21);
    expect(candidate?.worldLandmarks).toHaveLength(21);
    const { assignment, mappedLandmarks, worldLandmarks } = candidate!;
    const evidence = buildMovementDeepCaptureHandEvidence({
      assignment: assignment.assignment,
      camera,
      capturedAt: 2_000,
      detector: assignment.detector,
      landmarks: mappedLandmarks,
      side: "left",
      sourceTimestampMs: 1_995,
      worldLandmarks,
    });

    expect(evidence?.detectorHandedness).toEqual({ label: "Right", score: 0.93 });
    expect(evidence?.assignment).toBe("pose-wrist-reconciled");
    expect(Object.keys(evidence?.fingerJointAngles ?? {})).toHaveLength(15);
    expect(evidence?.orientation?.palmNormal).not.toBeNull();
  });

  it("selects both anatomical hands from an overlapping crossed-hands fallback crop", () => {
    const camera = { frameHeight: 720, frameWidth: 1280 };
    const pose = poseWithLeftHand({ x: 0.44, y: 0.7 });
    pose[16] = { visibility: 0.98, x: 0.56, y: 0.7, z: 0 };
    pose[18] = { visibility: 0.95, x: 0.52, y: 0.55, z: 0 };
    pose[20] = { visibility: 0.95, x: 0.56, y: 0.5, z: 0 };
    pose[22] = { visibility: 0.95, x: 0.6, y: 0.57, z: 0 };
    const region = resolveMovementDeepCaptureHandRefinementRegion({
      camera,
      poseLandmarks: pose,
      side: "left",
    })!;
    const sourceXToCropX = (sourceX: number) => (
      (sourceX * camera.frameWidth - region.crop.x) / region.crop.width
    );
    const leftCropWristX = sourceXToCropX(pose[15]!.x);
    const rightCropWristX = sourceXToCropX(pose[16]!.x);
    const leftCrop = openPalmCropLandmarks().map((landmark) => ({
      ...landmark,
      x: leftCropWristX + (landmark.x - 0.25) * 0.2,
    }));
    const rightCrop = openPalmCropLandmarks().map((landmark) => ({
      ...landmark,
      x: rightCropWristX + (landmark.x - 0.25) * 0.2,
    }));
    const result = detectorResult([
      { label: "Right", landmarks: leftCrop },
      { label: "Left", landmarks: rightCrop },
    ]);

    const left = selectMovementDeepCaptureHandRefinementCandidate({
      poseLandmarks: pose,
      refinementRegion: region,
      result,
      side: "left",
    });
    const right = selectMovementDeepCaptureHandRefinementCandidate({
      poseLandmarks: pose,
      refinementRegion: region,
      result,
      side: "right",
    });

    expect(left?.assignment).toMatchObject({
      assignment: "pose-wrist-reconciled",
      detector: { label: "Right" },
      side: "left",
    });
    expect(right?.assignment).toMatchObject({
      assignment: "pose-wrist-reconciled",
      detector: { label: "Left" },
      side: "right",
    });
    expect(left?.mappedLandmarks[0]?.x).not.toBe(right?.mappedLandmarks[0]?.x);
  });

  it("rejects partial detector output instead of inventing missing image or world points", () => {
    const pose = poseWithLeftHand();
    const region = resolveMovementDeepCaptureHandRefinementRegion({
      camera: { frameHeight: 720, frameWidth: 1280 },
      poseLandmarks: pose,
      side: "left",
    })!;
    const partial = detectorResult([{ label: "Left", landmarks: openPalmCropLandmarks() }]);
    partial.worldLandmarks[0] = partial.worldLandmarks[0]!.slice(0, 20);

    expect(selectMovementDeepCaptureHandRefinementCandidate({
      poseLandmarks: pose,
      refinementRegion: region,
      result: partial,
      side: "left",
    })).toBeNull();
  });

  it.each([
    ["close", poseWithLeftHand({ scale: 1.6 })],
    ["far", poseWithLeftHand({ scale: 0.2, x: 0.65, y: 0.42 })],
    ["edge-of-frame", poseWithLeftHand({ scale: 1.2, x: 0.02, y: 0.76 })],
  ])("builds a bounded %s fallback ROI from trustworthy Pose evidence", (_name, pose) => {
    const camera = { frameHeight: 720, frameWidth: 1280 };
    const region = resolveMovementDeepCaptureHandRefinementRegion({
      camera,
      poseLandmarks: pose,
      side: "left",
    });

    expect(region?.source).toBe("pose-hand-fallback");
    expect(region?.crop.width).toBeGreaterThan(1);
    expect(region?.crop.height).toBeGreaterThan(1);
    expect((region?.crop.x ?? 0) + (region?.crop.width ?? 0)).toBeLessThanOrEqual(1280);
    expect((region?.crop.y ?? 0) + (region?.crop.height ?? 0)).toBeLessThanOrEqual(720);
  });

  it("does not create a fallback ROI from missing or weak Pose hand evidence", () => {
    expect(resolveMovementDeepCaptureHandRefinementRegion({
      camera: { frameHeight: 720, frameWidth: 1280 },
      poseLandmarks: poseWithLeftHand({ anchorVisibility: 0.1 }),
      side: "left",
    })).toBeNull();
  });

  it("carries refined hand and face evidence without relabelling derived signals", () => {
    const provenance = {
      ageMs: 0,
      confidence: 0.9,
      inferenceTimestampMs: 1_000,
      origin: "model-estimated" as const,
      sourceTimestampMs: 990,
    };
    const derived = { ...provenance, origin: "derived" as const };
    const hand = carryMovementDeepCaptureHandEvidence({
      evidence: {
        assignment: "detector",
        crop,
        detectorHandedness: { label: "Left", score: 0.9 },
        fingerJointAngles: {
          "index.1": { provenance: derived, radians: 0.4 },
        },
        orientation: {
          facing: "palm-facing-camera",
          palmNormal: { x: 0, y: 0, z: -1 },
          provenance: derived,
          wristRotation: { x: 0, y: 0, z: 0 },
        },
        provenance,
        tracking: { occluded: false, state: "observed" },
      },
      nowMs: 1_050,
    });
    const face = carryMovementDeepCaptureFaceEvidence({
      evidence: {
        crop,
        facialTransformationMatrix: Array.from({ length: 16 }, () => 0),
        gaze: {
          fused: { x: 0, y: 0, z: -1 },
          left: { x: 0, y: 0, z: -1 },
          provenance: derived,
          right: { x: 0, y: 0, z: -1 },
        },
        eyeVisibility: { eyewear: "unknown", left: "visible", right: "visible" },
        irisLandmarkCount: 10,
        provenance,
        tracking: { occluded: false, state: "observed" },
      },
      nowMs: 1_050,
    });

    expect(hand?.provenance).toMatchObject({ ageMs: 50, origin: "temporally-tracked" });
    expect(hand?.tracking).toEqual({ occluded: true, state: "temporally-carried" });
    expect(hand?.orientation?.provenance).toMatchObject({ ageMs: 50, origin: "derived" });
    expect(hand?.fingerJointAngles?.["index.1"]?.provenance.origin).toBe("derived");
    expect(face?.provenance.origin).toBe("temporally-tracked");
    expect(face?.tracking).toEqual({ occluded: true, state: "temporally-carried" });
    expect(face?.gaze.provenance.origin).toBe("derived");

    expect(carryMovementDeepCaptureFaceEvidence({
      evidence: {
        ...face!,
        provenance,
        tracking: { occluded: false, state: "observed" },
      },
      nowMs: 1_050,
      occluded: false,
    })?.tracking).toEqual({ occluded: false, state: "temporally-carried" });
  });
});
