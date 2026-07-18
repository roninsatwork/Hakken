import { describe, expect, it } from "vitest";
import { buildMovementDenseCaptureProofSnapshot } from "./movementDenseCaptureProof";
import type {
  MovementDeepCaptureBodyRegion,
  MovementDeepCaptureFrameEvidence,
} from "./movementDeepCaptureContract";

const regions: MovementDeepCaptureBodyRegion[] = ["chest", "leftFoot", "rightFoot"];

function evidence(): MovementDeepCaptureFrameEvidence {
  const anchors = regions.map((region, index) => ({
    anatomicalSide: region.startsWith("left") ? "left" as const
      : region.startsWith("right") ? "right" as const
        : "midline" as const,
    depth: index,
    id: `anchor-${index}`,
    image: { x: index / 10, y: index / 10 },
    normal: { x: 0, y: 0, z: 1 },
    occluded: index === 2,
    provenance: {
      ageMs: 0,
      confidence: 0.9,
      inferenceTimestampMs: 100,
      origin: index === 1 ? "temporally-tracked" as const : "model-estimated" as const,
      sourceTimestampMs: 100,
    },
    region,
    surface: "front" as const,
  }));
  const regionCoverage = Object.fromEntries(regions.map((region) => [region, {
    anchorCount: 1,
    confidence: 0.9,
    currentCount: 1,
    derivedCount: 0,
    modelEstimatedCount: 1,
    observedCount: 0,
    occludedCount: 0,
    state: "current" as const,
    surfaceCounts: { back: 0, front: 1, side: 0, unknown: 0 },
    temporallyTrackedCount: 0,
  }])) as NonNullable<NonNullable<MovementDeepCaptureFrameEvidence["denseBody"]>["fusion"]>["regionCoverage"];
  return {
    denseBody: {
      adapter: {
        inferenceDurationMs: 12,
        inputHeight: 360,
        inputWidth: 640,
        profileId: "movement-dense-capture-adapter-v1",
        qualityTier: "medium",
        runtime: "webgpu",
        targetIntervalMs: 180,
      },
      anchors,
      fusion: {
        contactCandidates: {
          leftFoot: { anchorIds: ["anchor-1"], confidence: 0, imageBottom: 0.1, state: "occluded" },
          rightFoot: { anchorIds: ["anchor-2"], confidence: 0.9, imageBottom: 0.2, state: "eligible" },
        },
        profileId: "movement-dense-capture-fusion-v1",
        regionCoverage,
        skeleton: { poseLandmarkCount: 33, worldPoseLandmarkCount: 33 },
        torsoTwist: { confidence: 0.8, radians: 0.25, reason: "derived-from-current-surface-normals" },
      },
      modelHash: `sha256:${"a".repeat(64)}`,
      modelId: "dense-model-a",
      segmentation: {
        confidence: 0.9,
        coverage: 0.6,
        encoding: "model-rle",
        frameHeight: 720,
        frameWidth: 1280,
        maskHeight: 256,
        maskWidth: 256,
        payload: "1:2",
        provenance: {
          ageMs: 0,
          confidence: 0.9,
          inferenceTimestampMs: 100,
          origin: "model-estimated",
          sourceTimestampMs: 100,
        },
      },
    },
    profileId: "movement-deep-capture-v1",
  };
}

describe("movement dense-capture proof snapshot", () => {
  it("exports compact model, coverage, twist, contact, provenance, and identity evidence", () => {
    const snapshot = buildMovementDenseCaptureProofSnapshot(evidence());

    expect(snapshot).toMatchObject({
      anchorCount: 3,
      fusionProfileId: "movement-dense-capture-fusion-v1",
      model: { id: "dense-model-a", runtime: "webgpu" },
      observationCounts: {
        "model-estimated": 2,
        occluded: 1,
        "temporally-tracked": 1,
      },
      profileId: "movement-dense-capture-proof-v1",
      skeleton: { poseLandmarkCount: 33, worldPoseLandmarkCount: 33 },
      torsoTwist: { radians: 0.25 },
    });
    expect(snapshot?.anchorIdentityChecksum).toMatch(/^fnv1a32:/);
    expect(JSON.stringify(snapshot)).not.toContain("inferenceDurationMs");
  });

  it("fails closed when dense-body fusion is absent", () => {
    const input = evidence();
    delete input.denseBody?.fusion;
    expect(buildMovementDenseCaptureProofSnapshot(input)).toBeNull();
  });
});
