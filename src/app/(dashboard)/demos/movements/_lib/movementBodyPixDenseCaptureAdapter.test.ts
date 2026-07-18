import { describe, expect, it, vi } from "vitest";
import { validateMovementDenseCaptureAdapterMeasurement } from "./movementDenseCapture";
import {
  MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS,
} from "./movementDeepCaptureContract";
import {
  MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE,
  buildMovementBodyPixSurfaceAnchors,
  createMovementBodyPixDenseCaptureAdapterFromModel,
  type MovementBodyPixPartSegmentation,
} from "./movementBodyPixDenseCaptureAdapter";

function syntheticSegmentation({ shiftX = 0, withoutParts = [] }: {
  shiftX?: number;
  withoutParts?: number[];
} = {}): MovementBodyPixPartSegmentation {
  const width = 288;
  const height = 240;
  const data = new Int32Array(width * height).fill(-1);
  const includedParts = Array.from({ length: 24 }, (_, partId) => partId)
    .filter((partId) => !withoutParts.includes(partId));
  includedParts.forEach((partId, index) => {
    const column = index % 8;
    const row = Math.floor(index / 8);
    const startX = 12 + shiftX + column * 32;
    const startY = 12 + row * 72;
    for (let y = startY; y < startY + 60; y += 1) {
      for (let x = startX; x < startX + 24; x += 1) {
        data[y * width + x] = partId;
      }
    }
  });
  return { allPoses: [], data, height, width };
}

function anchors(segmentation = syntheticSegmentation()) {
  return buildMovementBodyPixSurfaceAnchors({
    inferenceTimestampMs: 2_000,
    segmentation,
    sourceTimestampMs: 1_990,
  });
}

describe("BodyPix dense capture adapter", () => {
  it("samples 200-500 stable semantic anchors with complete side and surface ownership", () => {
    const sampled = anchors();
    const translated = anchors(syntheticSegmentation({ shiftX: 5 }));

    expect(sampled.length).toBeGreaterThanOrEqual(200);
    expect(sampled.length).toBeLessThanOrEqual(500);
    expect(translated.map((anchor) => anchor.id)).toEqual(sampled.map((anchor) => anchor.id));
    expect(new Set(sampled.map((anchor) => anchor.region))).toEqual(
      new Set(MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS),
    );
    expect(sampled.find((anchor) => anchor.id.includes("p2-"))).toMatchObject({
      anatomicalSide: "left",
      surface: "front",
    });
    expect(sampled.find((anchor) => anchor.id.includes("p5-"))).toMatchObject({
      anatomicalSide: "right",
      surface: "back",
    });
  });

  it("keeps semantic estimates honest about unsupported depth, normals, and observation origin", () => {
    expect(anchors().every((anchor) => (
      anchor.depth === null &&
      anchor.normal === null &&
      anchor.provenance.origin === "model-estimated" &&
      anchor.occluded === false
    ))).toBe(true);
  });

  it("leaves an absent body surface missing instead of manufacturing it", () => {
    const sampled = anchors(syntheticSegmentation({ withoutParts: [13] }));
    expect(sampled.some((anchor) => anchor.region === "back")).toBe(false);
  });

  it("binds live inference to the measured model identity and adapter validator", async () => {
    const dispose = vi.fn();
    const model = {
      dispose,
      segmentPersonParts: vi.fn(async () => syntheticSegmentation()),
    };
    const adapter = createMovementBodyPixDenseCaptureAdapterFromModel(
      model as never,
      () => 2_000,
    );
    const measurement = await adapter.infer({ height: 360, width: 640 } as HTMLCanvasElement, {
      frameHeight: 1080,
      frameWidth: 1920,
      qualityTier: "medium",
      sourceTimestampMs: 1_990,
    });

    expect(adapter.descriptor).toMatchObject({
      id: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.id,
      modelHash: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.modelHash,
      runtime: "webgl",
      version: "2.2.1",
    });
    expect(measurement.modelId).toBe("bodypix-mobilenet-v1-075-q2@2.2.1");
    expect(measurement.adapter).toMatchObject({
      inputHeight: 360,
      inputWidth: 640,
      qualityTier: "medium",
      targetIntervalMs: 180,
    });
    expect(validateMovementDenseCaptureAdapterMeasurement(adapter, measurement)).toEqual({
      failures: [],
      passed: true,
    });
    expect(model.segmentPersonParts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      flipHorizontal: false,
      segmentationThreshold: 0.7,
    }));
    adapter.dispose?.();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("returns no anchors for malformed segmentation dimensions", () => {
    expect(anchors({ data: new Int32Array(2), height: 2, width: 2 })).toEqual([]);
  });
});
