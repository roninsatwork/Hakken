import { describe, expect, it } from "vitest";
import {
  MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS,
  type MovementDeepCaptureBodyEvidence,
  type MovementDeepCaptureSurfaceAnchor,
} from "./movementDeepCaptureContract";
import {
  carryMovementDenseCaptureEvidence,
  createMovementDenseCaptureRuntime,
  mergeMovementDenseCaptureMeasurement,
  resolveMovementDenseCaptureSchedule,
  validateMovementDenseCaptureMeasurement,
  type MovementDenseCaptureMeasurement,
  type MovementDenseCaptureAdapter,
} from "./movementDenseCapture";
import { MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES } from "./movementDenseCaptureQuality";

const provenance = {
  ageMs: 0,
  confidence: 0.9,
  inferenceTimestampMs: 1_000,
  origin: "model-estimated" as const,
  sourceTimestampMs: 990,
};

function anchors(): MovementDeepCaptureSurfaceAnchor[] {
  return Array.from({ length: 200 }, (_, index) => ({
    anatomicalSide: index % 3 === 0 ? "midline" as const : index % 2 === 0 ? "left" as const : "right" as const,
    depth: 0.2,
    id: `surface-${index}`,
    image: { x: (index % 20) / 20, y: Math.floor(index / 20) / 10 },
    normal: { x: 0, y: 0, z: 1 },
    occluded: false,
    provenance,
    region: MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS[
      index % MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.length
    ],
    surface: "front" as const,
  }));
}

const segmentation: MovementDeepCaptureBodyEvidence["segmentation"] = {
  confidence: 0.9,
  coverage: 0.5,
  encoding: "model-rle",
  frameHeight: 1080,
  frameWidth: 1920,
  maskHeight: 256,
  maskWidth: 256,
  payload: [[0, 1], [1, 2]],
  provenance,
};

function measurement(): MovementDenseCaptureMeasurement {
  return {
    adapter: {
      inferenceDurationMs: 30,
      inputHeight: 360,
      inputWidth: 640,
      profileId: "movement-dense-capture-adapter-v1",
      qualityTier: "medium",
      runtime: "webgpu",
      targetIntervalMs: 180,
    },
    anchors: anchors(),
    modelHash: `sha256:${"a".repeat(64)}`,
    modelId: "candidate-v1",
  };
}

describe("movement dense capture", () => {
  it("accepts a complete, immutable, region-covered model measurement", () => {
    expect(validateMovementDenseCaptureMeasurement(measurement())).toEqual({
      failures: [],
      passed: true,
    });
    expect(mergeMovementDenseCaptureMeasurement({ measurement: measurement(), segmentation }))
      .toMatchObject({ anchors: expect.any(Array), modelId: "candidate-v1", segmentation });
  });

  it("rejects duplicate ids, invalid coordinates, and unverified models", () => {
    const invalid = measurement();
    invalid.anchors = [
      { ...invalid.anchors[0]!, image: { x: 2, y: 0.5 } },
      invalid.anchors[0]!,
    ];
    invalid.modelHash = "unverified:model";
    const report = validateMovementDenseCaptureMeasurement(invalid);

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/requires 200-500 anchors/),
      expect.stringMatching(/duplicate persistent anchor ids/),
      expect.stringMatching(/no immutable model SHA-256/),
      expect.stringMatching(/out-of-frame image coordinates/),
    ]));
    expect(mergeMovementDenseCaptureMeasurement({ measurement: invalid, segmentation })).toBeNull();
  });

  it("accepts partial visible-region measurements for explicit fusion accounting", () => {
    const partial = measurement();
    partial.anchors = partial.anchors.map((anchor) => ({ ...anchor, region: "chest" }));

    expect(validateMovementDenseCaptureMeasurement(partial)).toEqual({
      failures: [],
      passed: true,
    });
  });

  it("rate-limits slow inference and never overlaps adapter work", () => {
    expect(resolveMovementDenseCaptureSchedule({
      inFlight: true,
      lastCompletedAtMs: 900,
      lastDurationMs: 20,
      nowMs: 1_100,
    })).toEqual({ reason: "in-flight", run: false });
    expect(resolveMovementDenseCaptureSchedule({
      inFlight: false,
      lastCompletedAtMs: 900,
      lastDurationMs: 100,
      nowMs: 1_100,
    })).toEqual({ reason: "rate-limited", run: false });
    expect(resolveMovementDenseCaptureSchedule({
      inFlight: false,
      lastCompletedAtMs: 900,
      lastDurationMs: 100,
      nowMs: 1_201,
    })).toEqual({ reason: "due", run: true });
    expect(resolveMovementDenseCaptureSchedule({
      inFlight: false,
      lastCompletedAtMs: 900,
      lastDurationMs: 20,
      nowMs: 1_150,
      qualityTier: "low",
    })).toEqual({ reason: "rate-limited", run: false });
  });

  it("carries persistent ids briefly without treating them as fresh observations", () => {
    const previous = mergeMovementDenseCaptureMeasurement({
      measurement: measurement(),
      segmentation,
    });
    const carried = carryMovementDenseCaptureEvidence({
      currentSegmentation: { ...segmentation, coverage: 0.4 },
      nowMs: 1_150,
      previous,
    });

    expect(carried?.anchors).toHaveLength(200);
    expect(carried?.anchors[0]).toMatchObject({
      id: "surface-0",
      occluded: true,
      provenance: {
        ageMs: 150,
        confidence: 0.45,
        origin: "temporally-tracked",
        sourceTimestampMs: 990,
      },
    });
    expect(carried?.segmentation.coverage).toBe(0.4);
    expect(carryMovementDenseCaptureEvidence({
      currentSegmentation: segmentation,
      nowMs: 1_301,
      previous,
    })).toBeNull();
  });

  it("does not invent anchors from segmentation when no model measurement exists", () => {
    expect(carryMovementDenseCaptureEvidence({
      currentSegmentation: segmentation,
      nowMs: 1_000,
      previous: null,
    })).toBeNull();
  });

  it("runs an asynchronous adapter once and exposes only validated carried evidence", async () => {
    let clockMs = 0;
    const adapter: MovementDenseCaptureAdapter<{ frame: string }> = {
      descriptor: {
        artifactBytes: 10_000,
        id: "candidate",
        inputHeight: 540,
        inputWidth: 960,
        license: "reviewed-test-licence",
        modelHash: `sha256:${"a".repeat(64)}`,
        runtime: "webgpu",
        version: "1",
      },
      infer: async () => ({
        ...measurement(),
        modelId: "candidate@1",
      }),
    };
    const runtime = createMovementDenseCaptureRuntime<{ frame: string }>({
      clock: () => clockMs,
    });

    expect(runtime.request({
      adapter,
      context: { frameHeight: 1080, frameWidth: 1920, sourceTimestampMs: 990 },
      input: { frame: "immutable-rgb-snapshot" },
      nowMs: 10,
      segmentation,
    })).toBe(true);
    expect(runtime.request({
      adapter,
      context: { frameHeight: 1080, frameWidth: 1920, sourceTimestampMs: 991 },
      input: { frame: "must-not-overlap" },
      nowMs: 11,
      segmentation,
    })).toBe(false);
    clockMs = 30;
    await runtime.waitForIdle();

    expect(runtime.getState()).toMatchObject({
      inFlight: false,
      lastCompletedAtMs: 10,
      lastDurationMs: 30,
      lastFailure: null,
    });
    expect(runtime.read({ currentSegmentation: segmentation, nowMs: 1_050 })?.anchors[0])
      .toMatchObject({ id: "surface-0", provenance: { origin: "temporally-tracked" } });
  });

  it("isolates adapter identity failures instead of publishing mismatched anchors", async () => {
    const adapter: MovementDenseCaptureAdapter<string> = {
      descriptor: {
        artifactBytes: 10_000,
        id: "expected",
        inputHeight: 540,
        inputWidth: 960,
        license: "reviewed-test-licence",
        modelHash: `sha256:${"b".repeat(64)}`,
        runtime: "webgpu",
        version: "1",
      },
      infer: async () => measurement(),
    };
    const runtime = createMovementDenseCaptureRuntime<string>();
    expect(runtime.request({
      adapter,
      context: { frameHeight: 1080, frameWidth: 1920, sourceTimestampMs: 990 },
      input: "frame",
      nowMs: 10,
      segmentation,
    })).toBe(true);
    await runtime.waitForIdle();

    expect(runtime.getState().lastFailure).toMatch(/model hash does not match/);
    expect(runtime.read({ currentSegmentation: segmentation, nowMs: 1_000 })).toBeNull();
  });

  it("promotes dense quality only after sustained fast browser inference", async () => {
    let clockMs = 0;
    const adapter: MovementDenseCaptureAdapter<string> = {
      descriptor: {
        artifactBytes: 10_000,
        id: "adaptive",
        inputHeight: 540,
        inputWidth: 960,
        license: "reviewed-test-licence",
        modelHash: `sha256:${"a".repeat(64)}`,
        runtime: "webgpu",
        version: "1",
      },
      infer: async (_input, context) => {
        const profile = MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[context.qualityTier];
        return {
          ...measurement(),
          adapter: {
            ...measurement().adapter,
            inputHeight: profile.inputHeight,
            inputWidth: profile.inputWidth,
            qualityTier: context.qualityTier,
            targetIntervalMs: profile.targetIntervalMs,
          },
          modelId: "adaptive@1",
        };
      },
    };
    const runtime = createMovementDenseCaptureRuntime<string>({
      clock: () => clockMs,
      initialQualityTier: "low",
    });

    for (let sample = 0; sample < 5; sample += 1) {
      const nowMs = sample * 400;
      expect(runtime.request({
        adapter,
        context: { frameHeight: 1080, frameWidth: 1920, sourceTimestampMs: nowMs },
        input: "frame",
        nowMs,
        segmentation,
      })).toBe(true);
      clockMs += 40;
      await runtime.waitForIdle();
    }

    expect(runtime.getState().qualityTier).toBe("medium");
  });
});
