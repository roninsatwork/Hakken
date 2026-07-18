import { describe, expect, it } from "vitest";
import { MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS } from "./movementDeepCaptureContract";
import {
  buildMovementDenseCaptureFusion,
  validateMovementDenseCaptureFusion,
} from "./movementDenseCaptureFusion";

const pose = Array.from({ length: 33 }, (_, index) => ({
  visibility: 0.95,
  x: index / 32,
  y: 0.5,
  z: 0,
}));

function anchors() {
  return Array.from({ length: 210 }, (_, index) => {
    const region = MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS[
      index % MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.length
    ];
    const isShoulder = region === "leftShoulder" || region === "rightShoulder" || region === "chest";
    const isTracked = index % 11 === 0;
    return {
      anatomicalSide: region.startsWith("left")
        ? "left" as const
        : region.startsWith("right")
          ? "right" as const
          : "midline" as const,
      depth: 0.2,
      id: `surface-${index}`,
      image: { x: 0.5, y: region.endsWith("Foot") ? 0.92 : 0.5 },
      normal: isShoulder
        ? { x: 0.5, y: 0, z: 0.866 }
        : { x: 0, y: 0, z: 1 },
      occluded: isTracked,
      provenance: {
        ageMs: isTracked ? 80 : 0,
        confidence: 0.9,
        inferenceTimestampMs: 1_000,
        origin: isTracked ? "temporally-tracked" as const : "model-estimated" as const,
        sourceTimestampMs: 1_000,
      },
      region,
      surface: region === "back" ? "back" as const : "front" as const,
    };
  });
}

describe("movement dense capture fusion", () => {
  it("keeps every anatomical region and separates current, tracked, and occluded anchors", () => {
    const fusion = buildMovementDenseCaptureFusion({
      anchors: anchors(),
      poseLandmarks: pose,
      worldPoseLandmarks: pose,
    });

    expect(validateMovementDenseCaptureFusion(fusion)).toEqual({ failures: [], passed: true });
    expect(Object.keys(fusion.regionCoverage)).toEqual([
      ...MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS,
    ]);
    expect(fusion.regionCoverage.chest).toMatchObject({
      anchorCount: 10,
      modelEstimatedCount: expect.any(Number),
      state: "current",
    });
    expect(fusion.regionCoverage.chest.currentCount).toBeGreaterThan(0);
    expect(fusion.regionCoverage.chest.temporallyTrackedCount).toBeGreaterThanOrEqual(0);
    expect(fusion.torsoTwist).toMatchObject({
      confidence: expect.any(Number),
      reason: "derived-from-current-surface-normals",
    });
    expect(fusion.torsoTwist.radians).not.toBeNull();
    expect(fusion.contactCandidates.leftFoot).toMatchObject({
      imageBottom: 0.92,
      state: "eligible",
    });
    expect(fusion.contactCandidates.rightFoot).toMatchObject({
      imageBottom: 0.92,
      state: "eligible",
    });
  });

  it("does not convert temporally tracked anchors into current twist or contact proof", () => {
    const tracked = anchors().map((anchor) => ({
      ...anchor,
      occluded: true,
      provenance: {
        ...anchor.provenance,
        ageMs: 100,
        origin: "temporally-tracked" as const,
      },
    }));
    const fusion = buildMovementDenseCaptureFusion({
      anchors: tracked,
      poseLandmarks: pose,
      worldPoseLandmarks: pose,
    });

    expect(fusion.regionCoverage.chest).toMatchObject({
      currentCount: 0,
      state: "occluded",
      temporallyTrackedCount: 10,
    });
    expect(fusion.torsoTwist).toEqual({
      confidence: 0,
      radians: null,
      reason: "insufficient-current-surface-normals",
    });
    expect(fusion.contactCandidates.leftFoot.state).toBe("occluded");
    expect(fusion.contactCandidates.rightFoot.state).toBe("occluded");
  });

  it("preserves explicit missing-region state while still failing an incomplete skeleton", () => {
    const fusion = buildMovementDenseCaptureFusion({
      anchors: anchors().filter((anchor) => anchor.region !== "back"),
      poseLandmarks: pose.slice(0, 25),
      worldPoseLandmarks: null,
    });

    expect(validateMovementDenseCaptureFusion(fusion)).toMatchObject({
      failures: expect.arrayContaining([
        "Dense-body fusion must retain all 33 image and world pose landmarks.",
      ]),
      passed: false,
    });
    expect(fusion.regionCoverage.back).toMatchObject({ anchorCount: 0, state: "missing" });
  });

  it("fails closed when a configured region has no explicit coverage state", () => {
    const fusion = buildMovementDenseCaptureFusion({
      anchors: anchors(),
      poseLandmarks: pose,
      worldPoseLandmarks: pose,
    });
    delete (fusion.regionCoverage as Partial<typeof fusion.regionCoverage>).back;

    expect(validateMovementDenseCaptureFusion(fusion)).toEqual({
      failures: ["Dense-body fusion has invalid or absent region states: back."],
      passed: false,
    });
  });
});
